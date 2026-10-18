"""CrySense Mother API (Cloud Run service "crysense-mother-api").

A private space owned by the mother: check-ins, voice journal, recovery log,
medication schedule, questionnaire workflow and consent-based care summaries.
No diagnosis, no proxy screening score from voice, no automatic alerts."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import Depends, File, Form, HTTPException, Response, UploadFile

from crysense.ai import get_ai
from crysense.ai.guards import guard_reflection
from crysense.ai.schemas import SupportChatIn
from crysense.ai.support_chat import support_reply
from crysense.api_common import audit, consent_state, create_app, new_id, require_consent, set_consent
from crysense.auth import Principal, get_principal, require_mother_owner
from crysense.config import get_settings
from crysense.domain.medication import doses_for_day, is_active
from crysense.domain.timeutil import now_in, sort_key
from crysense.models import (CareSummaryIn, CheckInIn, ConsentIn, JournalIn, MedicationEventIn, MedicationIn, MotherSetupIn,
                             MotherWarningAnswers, RecoveryIn, ScreeningIn, TextIn)
from crysense.safety.engine import evaluate, support_content
from crysense.screening.engine import INSTRUMENTS, get_instrument, score
from crysense.speech import transcribe
from crysense.store import get_store

app = create_app("CrySense Mother API", "mother-api")
MAX_AUDIO_BYTES = 6_000_000


def _tz(mother: dict) -> str:
    return mother.get("timezone") or get_settings().default_timezone


def _col(mother_id: str, name: str) -> str:
    return f"maternalRecords/{mother_id}/{name}"


def _list(mother_id: str, name: str, field: str = "createdAt") -> list[dict]:
    return sorted(get_store().list(_col(mother_id, name)), key=lambda d: sort_key(d, field))


@app.post("/v1/onboarding/mother", status_code=201, tags=["onboarding"])
def create_mother_profile(body: MotherSetupIn, principal: Principal = Depends(get_principal)) -> dict:
    """Create a private profile for the signed-in caregiver, linked to their baby household."""
    store = get_store()
    existing = next((m for m in store.list("maternalRecords") if m.get("ownerUid") == principal.uid), None)
    if existing:
        now = now_in(existing.get("timezone") or get_settings().default_timezone)
        return {**existing, "daysSinceBirth": (now.date() - date.fromisoformat(existing["deliveryDate"])).days}
    user = store.get(f"users/{principal.uid}") or {}
    if user.get("role") != "mother":
        raise HTTPException(status_code=403, detail="Only the baby’s mother can create this private space.")
    infant = next((i for i in store.list("infantRecords") if principal.uid in i.get("caregiverUids", [])), None)
    if infant is None:
        raise HTTPException(status_code=409, detail="Set up baby care before creating your private space.")
    display_name = body.name.strip()
    if not display_name:
        raise HTTPException(status_code=422, detail="Add your name to continue.")
    delivery_date = body.deliveryDate.isoformat() if body.deliveryDate else infant["birthDate"]
    if body.deliveryDate and body.deliveryDate > date.today():
        raise HTTPException(status_code=422, detail="Delivery date cannot be in the future.")
    now = now_in(infant.get("timezone") or get_settings().default_timezone).isoformat()
    mother_id = new_id("mom")
    mother = {
        "name": display_name, "ownerUid": principal.uid, "deliveryDate": delivery_date,
        "deliveryType": body.deliveryType, "region": "IN",
        "timezone": infant.get("timezone") or get_settings().default_timezone, "createdAt": now,
    }
    store.set(f"maternalRecords/{mother_id}", mother)
    user_path = f"users/{principal.uid}"
    user = store.get(user_path) or {"region": "IN"}
    user.update(displayName=display_name, role="mother", householdId=infant["householdId"])
    store.set(user_path, user)
    for purpose in ("audio_capture", "transcription", "ai_processing", "storage", "sharing", "research"):
        store.set(f"consentRecords/{mother_id}_{purpose}", {
            "subjectType": "mother", "subjectId": mother_id, "purpose": purpose, "granted": False,
            "grantedAt": None, "revokedAt": None,
            "retentionPreference": "ephemeral" if purpose == "audio_capture" else "until_deleted",
            "updatedBy": principal.uid,
        })
    return get_mother(mother_id, mother)


@app.get("/v1/mothers/{mother_id}", tags=["mother"])
def get_mother(mother: dict = Depends(require_mother_owner)) -> dict:
    now = now_in(_tz(mother))
    return {**mother, "daysSinceBirth": (now.date() - date.fromisoformat(mother["deliveryDate"])).days}


@app.get("/v1/mothers/{mother_id}/home", tags=["mother"])
def home(mother_id: str, mother: dict = Depends(require_mother_owner)) -> dict:
    now = now_in(_tz(mother))
    today = now.date().isoformat()
    checkins = _list(mother_id, "checkins")
    doses = doses_for_day(_list(mother_id, "medicationSchedules"), get_store().list(_col(mother_id, "medicationEvents")), now.date())
    upcoming = [d for d in doses if d["status"] == "due"]
    return {
        "checkedInToday": any(c["date"] == today for c in checkins),
        "lastCheckIn": checkins[-1] if checkins else None,
        "nextDose": upcoming[0] if upcoming else None,
        "dosesToday": len(doses),
        "journalCount": len(get_store().list(_col(mother_id, "journalEntries"))),
        "lastRecovery": (_list(mother_id, "recoveryLogs") or [None])[-1],
    }


# ---- Check-ins ---------------------------------------------------------------
@app.get("/v1/mothers/{mother_id}/checkins", tags=["checkins"])
def list_checkins(mother_id: str, mother: dict = Depends(require_mother_owner)) -> list[dict]:
    return _list(mother_id, "checkins")


@app.post("/v1/mothers/{mother_id}/checkins", status_code=201, tags=["checkins"])
def create_checkin(mother_id: str, body: CheckInIn, mother: dict = Depends(require_mother_owner)) -> dict:
    now = now_in(_tz(mother))
    cid = new_id("chk")
    doc = {**body.model_dump(), "date": now.date().isoformat(), "createdAt": now.isoformat()}
    get_store().set(f"{_col(mother_id, 'checkins')}/{cid}", doc)
    saved = get_store().get(f"{_col(mother_id, 'checkins')}/{cid}")
    _maybe_nudge_partner(mother_id, mother, body, now)
    prompt = None
    if body.pain is not None and body.pain >= 7:
        prompt = "Your pain sounds high today. Would you like to log it in Recovery and check the warning signs?"
    return {"checkin": saved, "prompt": prompt}


# ---- Voice journal -----------------------------------------------------------
@app.post("/v1/mothers/{mother_id}/journal/transcribe", tags=["journal"])
async def journal_transcribe(mother_id: str, audio: UploadFile | None = File(None), transcript: str | None = Form(None), language: str | None = Form(None),
                             mother: dict = Depends(require_mother_owner)) -> dict:
    """Returns a transcript for her review. Nothing is saved, and audio is discarded."""
    require_consent(mother_id, "transcription", *(("audio_capture",) if audio else ()))
    data = await audio.read() if audio else None
    if data and len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Keep journal recordings under 90 seconds.")
    try:
        heard = transcribe(data, "journal", transcript, audio.content_type if audio else "audio/wav", language)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {**heard, "audioRetained": False, "requiresUserReview": True}


@app.post("/v1/mothers/{mother_id}/journal/reflect", tags=["journal"])
def journal_reflect(mother_id: str, body: TextIn, mother: dict = Depends(require_mother_owner)) -> dict:
    """Grounded only in the transcript she reviewed. Guarded against clinical labels."""
    require_consent(mother_id, "ai_processing")
    ai = get_ai()
    reflection, modified = guard_reflection(ai.reflect(body.transcript).model_dump())
    return {"reflection": reflection, "model": getattr(ai, "name", "ai"), "guardApplied": modified}


@app.get("/v1/mothers/{mother_id}/journal", tags=["journal"])
def list_journal(mother_id: str, mother: dict = Depends(require_mother_owner)) -> list[dict]:
    return list(reversed(_list(mother_id, "journalEntries")))


@app.post("/v1/mothers/{mother_id}/support/chat", tags=["support-chat"])
def mother_support_chat(mother_id: str, body: SupportChatIn, mother: dict = Depends(require_mother_owner)) -> dict:
    require_consent(mother_id, "ai_processing")
    try:
        return support_reply(body, get_ai)
    except Exception as failure:
        raise HTTPException(status_code=502, detail="Gemini could not reply. Your message is still on this screen; please retry.") from failure


@app.post("/v1/mothers/{mother_id}/journal", status_code=201, tags=["journal"])
def save_journal(mother_id: str, body: JournalIn, mother: dict = Depends(require_mother_owner)) -> dict:
    require_consent(mother_id, "storage")
    now = now_in(_tz(mother))
    jid = new_id("jrn")
    reflection = guard_reflection(body.reflection.model_dump())[0] if body.reflection else None
    get_store().set(f"{_col(mother_id, 'journalEntries')}/{jid}", {"createdAt": now.isoformat(), "transcript": body.transcript,
                                                                   "reflection": reflection, "reviewedByUser": True, "audioRetained": False})
    return get_store().get(f"{_col(mother_id, 'journalEntries')}/{jid}")


@app.delete("/v1/mothers/{mother_id}/journal/{entry_id}", status_code=204, response_class=Response, response_model=None, tags=["journal"])
def delete_journal(mother_id: str, entry_id: str, mother: dict = Depends(require_mother_owner), principal: Principal = Depends(get_principal)) -> None:
    path = f"{_col(mother_id, 'journalEntries')}/{entry_id}"
    if get_store().get(path) is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    get_store().delete(path)
    audit(principal.uid, "journal.deleted", mother_id, {"entryId": entry_id}, now_in(_tz(mother)))


# ---- Recovery ----------------------------------------------------------------
@app.get("/v1/mothers/{mother_id}/recovery", tags=["recovery"])
def list_recovery(mother_id: str, mother: dict = Depends(require_mother_owner)) -> list[dict]:
    return list(reversed(_list(mother_id, "recoveryLogs")))


@app.post("/v1/mothers/{mother_id}/recovery", status_code=201, tags=["recovery"])
def create_recovery(mother_id: str, body: RecoveryIn, mother: dict = Depends(require_mother_owner)) -> dict:
    now = now_in(_tz(mother))
    rid = new_id("rec")
    get_store().set(f"{_col(mother_id, 'recoveryLogs')}/{rid}", {**body.model_dump(), "createdAt": now.isoformat()})
    return get_store().get(f"{_col(mother_id, 'recoveryLogs')}/{rid}")


@app.post("/v1/mothers/{mother_id}/recovery/check", tags=["recovery"])
def recovery_check(mother_id: str, body: MotherWarningAnswers, mother: dict = Depends(require_mother_owner)) -> dict:
    """Deterministic red-flag check. Shows support options; never contacts anyone automatically."""
    result = evaluate("rules/mother_recovery_flags_v1.json", body.model_dump())
    if result["level"] != "none":
        result["support"] = support_content(mother.get("region", "IN"))
    return result


# ---- Medication --------------------------------------------------------------
@app.get("/v1/mothers/{mother_id}/medications", tags=["medication"])
def list_medications(mother_id: str, mother: dict = Depends(require_mother_owner)) -> list[dict]:
    today = now_in(_tz(mother)).date()
    return [{**s, "active": is_active(s, today)} for s in _list(mother_id, "medicationSchedules")]


@app.post("/v1/mothers/{mother_id}/medications", status_code=201, tags=["medication"])
def create_medication(mother_id: str, body: MedicationIn, mother: dict = Depends(require_mother_owner)) -> dict:
    now = now_in(_tz(mother))
    try:
        start = date.fromisoformat(body.startDate)
        end = date.fromisoformat(body.endDate) if body.endDate else None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD.") from exc
    if end and end < start:
        raise HTTPException(status_code=422, detail="The end date must be after the start date.")
    mid = new_id("med")
    get_store().set(f"{_col(mother_id, 'medicationSchedules')}/{mid}", {**body.model_dump(), "createdAt": now.isoformat()})
    return get_store().get(f"{_col(mother_id, 'medicationSchedules')}/{mid}")


@app.delete("/v1/mothers/{mother_id}/medications/{schedule_id}", status_code=204, response_class=Response, response_model=None, tags=["medication"])
def delete_medication(mother_id: str, schedule_id: str, mother: dict = Depends(require_mother_owner)) -> None:
    get_store().delete(f"{_col(mother_id, 'medicationSchedules')}/{schedule_id}")


@app.get("/v1/mothers/{mother_id}/medications/today", tags=["medication"])
def medications_today(mother_id: str, mother: dict = Depends(require_mother_owner)) -> dict:
    now = now_in(_tz(mother))
    doses = doses_for_day(_list(mother_id, "medicationSchedules"), get_store().list(_col(mother_id, "medicationEvents")), now.date())
    return {"date": now.date().isoformat(), "doses": doses,
            "note": "Reminders follow the instructions you entered. CrySense never changes a dose or a time."}


@app.post("/v1/mothers/{mother_id}/medications/{schedule_id}/events", status_code=201, tags=["medication"])
def medication_event(mother_id: str, schedule_id: str, body: MedicationEventIn, mother: dict = Depends(require_mother_owner)) -> dict:
    store = get_store()
    schedule = store.get(f"{_col(mother_id, 'medicationSchedules')}/{schedule_id}")
    if schedule is None:
        raise HTTPException(status_code=404, detail="Medicine not found.")
    slot_time = body.scheduledFor.split("T")[-1]
    if slot_time not in schedule["times"]:
        raise HTTPException(status_code=422, detail="That time is not in this medicine's schedule.")
    if body.status == "rescheduled" and not body.rescheduledTo:
        raise HTTPException(status_code=422, detail="Choose a new time for this dose.")
    now = now_in(_tz(mother))
    existing = [e for e in store.list(_col(mother_id, "medicationEvents")) if e["scheduleId"] == schedule_id and e["scheduledFor"] == body.scheduledFor]
    eid = existing[0]["id"] if existing else new_id("mev")
    store.set(f"{_col(mother_id, 'medicationEvents')}/{eid}", {**body.model_dump(), "scheduleId": schedule_id, "at": now.isoformat()})
    return store.get(f"{_col(mother_id, 'medicationEvents')}/{eid}")


# ---- Questionnaire -----------------------------------------------------------
@app.get("/v1/screening/instruments", tags=["screening"])
def instruments(principal: Principal = Depends(get_principal)) -> list[dict]:
    return [get_instrument(i) for i in INSTRUMENTS]


@app.post("/v1/mothers/{mother_id}/screenings", status_code=201, tags=["screening"])
def submit_screening(mother_id: str, body: ScreeningIn, mother: dict = Depends(require_mother_owner)) -> dict:
    try:
        result = score(body.instrumentId, body.answers)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Questionnaire not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    now = now_in(_tz(mother))
    sid = new_id("scr")
    get_store().set(f"{_col(mother_id, 'screenings')}/{sid}", {**result, "answers": body.answers, "createdAt": now.isoformat()})
    if result["safetyTriggered"]:
        result["support"] = support_content(mother.get("region", "IN"))
    return {**result, "id": sid}


@app.get("/v1/mothers/{mother_id}/screenings", tags=["screening"])
def list_screenings(mother_id: str, mother: dict = Depends(require_mother_owner)) -> list[dict]:
    return [{k: v for k, v in s.items() if k != "answers"} for s in reversed(_list(mother_id, "screenings"))]


# ---- Care summary ------------------------------------------------------------
def _summary_text(mother_id: str, mother: dict, body: CareSummaryIn, now: datetime) -> list[dict]:
    since = (now - timedelta(days=body.periodDays)).isoformat()
    sections: list[dict] = []
    if "checkins" in body.fields:
        rows = [c for c in _list(mother_id, "checkins") if c["createdAt"] >= since]
        lines = [f"{c['date']}: mood {c.get('mood') or '-'}/5, energy {c.get('energy') or '-'}/5, rest {c.get('rest') or '-'}/5, pain {c.get('pain') if c.get('pain') is not None else '-'}/10" for c in rows]
        sections.append({"field": "checkins", "title": "Daily check-ins", "lines": lines or ["No check-ins in this period."]})
    if "recovery" in body.fields:
        rows = [r for r in _list(mother_id, "recoveryLogs") if r["createdAt"] >= since]
        lines = [f"{r['createdAt'][:10]}: {r['symptom'].replace('_', ' ')}, severity {r['severity']}/10, {r['trend']}" for r in rows]
        sections.append({"field": "recovery", "title": "Recovery notes", "lines": lines or ["No recovery notes in this period."]})
    if "medications" in body.fields:
        meds = [s for s in _list(mother_id, "medicationSchedules") if is_active(s, now.date())]
        sections.append({"field": "medications", "title": "Medicines (as entered)", "lines": [f"{m['name']}: {m['dose']} at {', '.join(m['times'])}" for m in meds] or ["None entered."]})
    if "journal_reflections" in body.fields:
        rows = [j for j in _list(mother_id, "journalEntries") if j["createdAt"] >= since and j.get("reflection")]
        sections.append({"field": "journal_reflections", "title": "Journal reflections (her summaries, not full entries)",
                         "lines": [f"{j['createdAt'][:10]}: {j['reflection']['summary']}" for j in rows] or ["No reflections in this period."]})
    if "screening" in body.fields:
        rows = [s for s in _list(mother_id, "screenings") if s["createdAt"] >= since]
        sections.append({"field": "screening", "title": "Questionnaire results",
                         "lines": [f"{s['createdAt'][:10]}: {s['instrumentId']} v{s['instrumentVersion']}, total {s['total'] if s['total'] is not None else 'not scored'}" for s in rows] or ["No questionnaires in this period."]})
    return sections


@app.post("/v1/mothers/{mother_id}/care-summaries/preview", tags=["care-summary"])
def preview_summary(mother_id: str, body: CareSummaryIn, mother: dict = Depends(require_mother_owner)) -> dict:
    """Deterministic text. She sees exactly what would be shared before anything leaves her space."""
    now = now_in(_tz(mother))
    return {"recipientName": body.recipientName, "recipientRole": body.recipientRole, "periodDays": body.periodDays,
            "sections": _summary_text(mother_id, mother, body, now), "generatedAt": now.isoformat(),
            "disclaimer": "Self-reported information shared by the mother. Not a clinical assessment."}


@app.post("/v1/mothers/{mother_id}/care-summaries", status_code=201, tags=["care-summary"])
def share_summary(mother_id: str, body: CareSummaryIn, mother: dict = Depends(require_mother_owner), principal: Principal = Depends(get_principal)) -> dict:
    require_consent(mother_id, "sharing")
    now = now_in(_tz(mother))
    preview = preview_summary(mother_id, body, mother)
    sid = new_id("sum")
    get_store().set(f"{_col(mother_id, 'careSummaries')}/{sid}", {**preview, "status": "shared_demo", "sharedAt": now.isoformat(),
                                                                  "delivery": "Demo only. Connect an approved channel before release."})
    audit(principal.uid, "care_summary.shared", mother_id, {"recipientRole": body.recipientRole, "fields": body.fields}, now)
    return get_store().get(f"{_col(mother_id, 'careSummaries')}/{sid}")


@app.get("/v1/mothers/{mother_id}/care-summaries", tags=["care-summary"])
def list_summaries(mother_id: str, mother: dict = Depends(require_mother_owner)) -> list[dict]:
    return list(reversed(_list(mother_id, "careSummaries", "sharedAt")))


# ---- Consent and data rights ------------------------------------------------
@app.get("/v1/mothers/{mother_id}/consents", tags=["consent"])
def list_consents(mother_id: str, mother: dict = Depends(require_mother_owner)) -> dict:
    return consent_state(mother_id)


@app.put("/v1/mothers/{mother_id}/consents/{purpose}", tags=["consent"])
def update_consent(mother_id: str, purpose: str, body: ConsentIn, mother: dict = Depends(require_mother_owner),
                   principal: Principal = Depends(get_principal)) -> dict:
    return set_consent("mother", mother_id, purpose, body.granted, body.retentionPreference, principal.uid, now_in(_tz(mother)))


@app.get("/v1/mothers/{mother_id}/export", tags=["data"])
def export_mother(mother_id: str, mother: dict = Depends(require_mother_owner), principal: Principal = Depends(get_principal)) -> dict:
    audit(principal.uid, "mother.exported", mother_id, {}, now_in(_tz(mother)))
    names = ("checkins", "journalEntries", "screenings", "recoveryLogs", "medicationSchedules", "medicationEvents", "careSummaries")
    return {"profile": mother, **{n: _list(mother_id, n) for n in names}, "consents": consent_state(mother_id)}


@app.delete("/v1/mothers/{mother_id}/data", tags=["data"])
def delete_mother_data(mother_id: str, mother: dict = Depends(require_mother_owner), principal: Principal = Depends(get_principal)) -> dict:
    store = get_store()
    names = ("checkins", "journalEntries", "screenings", "recoveryLogs", "medicationSchedules", "medicationEvents", "careSummaries")
    removed = {n: store.delete_collection(_col(mother_id, n)) for n in names}
    audit(principal.uid, "mother.data_deleted", mother_id, removed, now_in(_tz(mother)))
    return {"deleted": removed, "message": "Your private records were deleted. Your profile was kept."}


# ---- Modules: records, partner prompts, expiring share links ----------------
import secrets  # noqa: E402

from fastapi import Body  # noqa: E402

from crysense.records import MOTHER_KINDS, UPSERT_KEY, parse, sort_records  # noqa: E402


def _partner_setting(mother_id: str) -> dict:
    return get_store().get(f"{_col(mother_id, 'settings')}/partner_prompts") or {"enabled": False}


def _maybe_nudge_partner(mother_id: str, mother: dict, body: CheckInIn, now: datetime) -> None:
    """Only if she turned this on, and only a fixed, kind sentence. Never her scores or words."""
    if not _partner_setting(mother_id).get("enabled"):
        return
    low_rest = (body.rest is not None and body.rest <= 2) or (body.energy is not None and body.energy <= 2)
    if not low_rest:
        return
    infants = [i for i in get_store().list("infantRecords") if mother["ownerUid"] in i.get("caregiverUids", [])]
    if not infants:
        return
    household = infants[0]["householdId"]
    others = [u for u in infants[0]["caregiverUids"] if u != mother["ownerUid"]]
    get_store().set(f"households/{household}/nudges/{new_id('ndg')}", {
        "text": f"{mother['name']} could use some rest today. Maybe take the next night feed so she can sleep.",
        "forUids": others, "createdAt": now.isoformat(), "expiresAt": (now + timedelta(hours=24)).isoformat(), "source": "checkin"})
    audit(mother["ownerUid"], "partner_prompt.sent", mother_id, {"recipients": len(others)}, now)


@app.get("/v1/mothers/{mother_id}/partner-prompts", tags=["modules"])
def get_partner_prompts(mother_id: str, mother: dict = Depends(require_mother_owner)) -> dict:
    return _partner_setting(mother_id)


@app.put("/v1/mothers/{mother_id}/partner-prompts", tags=["modules"])
def set_partner_prompts(mother_id: str, body: dict = Body(...), mother: dict = Depends(require_mother_owner),
                        principal: Principal = Depends(get_principal)) -> dict:
    enabled = bool(body.get("enabled"))
    now = now_in(_tz(mother))
    get_store().set(f"{_col(mother_id, 'settings')}/partner_prompts", {"enabled": enabled, "updatedAt": now.isoformat()})
    audit(principal.uid, "partner_prompt.setting", mother_id, {"enabled": enabled}, now)
    return _partner_setting(mother_id)


@app.get("/v1/mothers/{mother_id}/records/{kind}", tags=["modules"])
def list_mother_records(mother_id: str, kind: str, mother: dict = Depends(require_mother_owner)) -> list[dict]:
    if kind not in MOTHER_KINDS:
        raise HTTPException(status_code=404, detail="Unknown module.")
    return sort_records(get_store().list(_col(mother_id, kind)))


@app.post("/v1/mothers/{mother_id}/records/{kind}", status_code=201, tags=["modules"])
def add_mother_record(mother_id: str, kind: str, body: dict = Body(...), mother: dict = Depends(require_mother_owner)) -> dict:
    data = parse(MOTHER_KINDS, kind, body)
    rid = UPSERT_KEY[kind](data) if kind in UPSERT_KEY else new_id(kind[:3])
    path = f"{_col(mother_id, kind)}/{rid}"
    get_store().set(path, {**data, "createdAt": now_in(_tz(mother)).isoformat()})
    return get_store().get(path)


@app.put("/v1/mothers/{mother_id}/records/{kind}/{record_id}", tags=["modules"])
def update_mother_record(mother_id: str, kind: str, record_id: str, body: dict = Body(...), mother: dict = Depends(require_mother_owner)) -> dict:
    data = parse(MOTHER_KINDS, kind, body)
    path = f"{_col(mother_id, kind)}/{record_id}"
    if get_store().get(path) is None:
        raise HTTPException(status_code=404, detail="Not found.")
    get_store().set(path, {**data, "createdAt": now_in(_tz(mother)).isoformat()})
    return get_store().get(path)


@app.delete("/v1/mothers/{mother_id}/records/{kind}/{record_id}", status_code=204, response_class=Response, response_model=None, tags=["modules"])
def delete_mother_record(mother_id: str, kind: str, record_id: str, mother: dict = Depends(require_mother_owner)) -> None:
    if kind not in MOTHER_KINDS:
        raise HTTPException(status_code=404, detail="Unknown module.")
    get_store().delete(f"{_col(mother_id, kind)}/{record_id}")


@app.post("/v1/mothers/{mother_id}/care-summaries/share-link", status_code=201, tags=["care-summary"])
def create_share_link(mother_id: str, body: CareSummaryIn, ttlMinutes: int = 15, mother: dict = Depends(require_mother_owner),
                      principal: Principal = Depends(get_principal)) -> dict:
    """Expiring, read-only link for a doctor to scan. Only the fields she chose."""
    require_consent(mother_id, "sharing")
    ttl = max(1, min(ttlMinutes, 60))
    now = now_in(_tz(mother))
    token = secrets.token_urlsafe(16)
    preview = preview_summary(mother_id, body, mother)
    get_store().set(f"shareLinks/{token}", {"motherId": mother_id, "summary": preview, "createdAt": now.isoformat(),
                                            "expiresAt": (now + timedelta(minutes=ttl)).isoformat()})
    audit(principal.uid, "care_summary.link_created", mother_id, {"fields": body.fields, "ttlMinutes": ttl}, now)
    return {"token": token, "expiresAt": (now + timedelta(minutes=ttl)).isoformat(), "ttlMinutes": ttl}


@app.get("/v1/shared/{token}", tags=["care-summary"])
def view_shared(token: str) -> dict:
    """Public by design: whoever holds the link can read it until it expires."""
    link = get_store().get(f"shareLinks/{token}")
    if link is None:
        raise HTTPException(status_code=404, detail="This link is not valid.")
    if datetime.fromisoformat(link["expiresAt"]) <= datetime.now(datetime.fromisoformat(link["expiresAt"]).tzinfo):
        raise HTTPException(status_code=410, detail="This link has expired. Ask her to share a new one.")
    return {"summary": link["summary"], "expiresAt": link["expiresAt"]}
