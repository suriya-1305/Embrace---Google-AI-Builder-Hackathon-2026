"""CrySense Baby API (Cloud Run service "crysense-baby-api").

Event logging, timeline, seven-day baseline, voice-to-event drafts, deterministic
warning-sign checks and cry-presence analysis. Never infers why a baby cries."""
from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta

from fastapi import Depends, File, Form, HTTPException, Response, UploadFile

from crysense.ai import get_ai
from crysense.ai.care_documents import review_care_document
from starlette.concurrency import run_in_threadpool
from crysense.api_common import audit, consent_state, create_app, new_id, require_consent, set_consent
from crysense.audio.context_review import analyse_sound
from crysense.auth import Principal, get_principal, require_infant_access
from crysense.config import get_settings
from crysense.domain.baseline import compute_baseline
from crysense.domain.events import normalise_event, validate_event
from crysense.domain.next_steps import suggest_checks
from crysense.domain.timeutil import now_in, parse_iso, sort_key
from crysense.models import BabySetupIn, BabySetupItem, BabyWarningAnswers, ConsentIn, EventIn, EventPatch, FamilyBabySetupIn
from crysense.safety.engine import evaluate, support_content
from crysense.speech import transcribe
from crysense.store import get_store
from baby_api.demo_ai import router as demo_ai_router
from baby_api.community import router as community_router

app = create_app("CrySense Baby API", "baby-api")
app.include_router(demo_ai_router)
app.include_router(community_router)
MAX_AUDIO_BYTES = 2_000_000


def _tz(infant: dict) -> str:
    return infant.get("timezone") or get_settings().default_timezone


def _events(infant_id: str) -> list[dict]:
    return sorted(get_store().list(f"infantRecords/{infant_id}/events"), key=sort_key)


def _age_days(infant: dict, now: datetime) -> int:
    return (now.date() - date.fromisoformat(infant["birthDate"])).days


@app.get("/v1/me", tags=["identity"])
def me(principal: Principal = Depends(get_principal)) -> dict:
    """Who is signed in, and which records they may open. The client never guesses ids."""
    store = get_store()
    user = store.get(f"users/{principal.uid}") or {"displayName": "Caregiver", "role": "caregiver", "region": "IN"}
    infants = [i["id"] for i in store.list("infantRecords") if principal.uid in i.get("caregiverUids", [])]
    mothers = [m["id"] for m in store.list("maternalRecords") if m.get("ownerUid") == principal.uid]
    return {"uid": principal.uid, "displayName": user.get("displayName"), "role": user.get("role"), "region": user.get("region", "IN"),
            "expertVerified": user.get("expertVerified") is True,
            "infantId": infants[0] if infants else None, "infantIds": infants,
            "motherId": mothers[0] if mothers else None}


def _create_family_profile(babies: list[BabySetupItem], caregiver_name: str, caregiver_role: str, principal: Principal) -> dict:
    store = get_store()
    existing = [i["id"] for i in store.list("infantRecords") if principal.uid in i.get("caregiverUids", [])]
    if existing:
        return me(principal)
    if any(baby.birthDate > date.today() for baby in babies):
        raise HTTPException(status_code=422, detail="Birth date cannot be in the future.")

    now = now_in(get_settings().default_timezone).isoformat()
    household_id = new_id("hh")
    user_path = f"users/{principal.uid}"
    user = store.get(user_path) or {}
    display_name = caregiver_name.strip()
    if not display_name:
        raise HTTPException(status_code=422, detail="Add your name to continue.")
    user.update(displayName=display_name, role=caregiver_role, region="IN", householdId=household_id)
    store.set(user_path, user)
    store.set(f"households/{household_id}", {
        "name": f"{display_name}'s family", "memberUids": [principal.uid], "sharingPermissions": {}, "createdAt": now,
    })
    for baby in babies:
        infant_id = new_id("inf")
        store.set(f"infantRecords/{infant_id}", {
            "name": baby.name.strip(), "birthDate": baby.birthDate.isoformat(), "householdId": household_id,
            "caregiverUids": [principal.uid], "timezone": get_settings().default_timezone, "createdAt": now,
        })
        for purpose in ("audio_capture", "transcription", "ai_processing", "storage", "sharing", "research"):
            store.set(f"consentRecords/{infant_id}_{purpose}", {
                "subjectType": "infant", "subjectId": infant_id, "purpose": purpose, "granted": False,
                "grantedAt": None, "revokedAt": None,
                "retentionPreference": "ephemeral" if purpose == "audio_capture" else "until_deleted",
                "updatedBy": principal.uid,
            })
    return me(principal)


@app.post("/v1/onboarding/babies", status_code=201, tags=["onboarding"])
def create_family_babies(body: FamilyBabySetupIn, principal: Principal = Depends(get_principal)) -> dict:
    """Create one or more baby profiles in the signed-in caregiver's new household."""
    return _create_family_profile(body.babies, body.caregiverName, body.caregiverRole, principal)


@app.post("/v1/onboarding/baby", status_code=201, tags=["onboarding"])
def create_baby_profile(body: BabySetupIn, principal: Principal = Depends(get_principal)) -> dict:
    """Create the signed-in caregiver's first baby profile; never joins an existing household."""
    return _create_family_profile([BabySetupItem(name=body.name, birthDate=body.birthDate)], body.caregiverName, body.caregiverRole, principal)


@app.get("/v1/infants", tags=["family"])
def list_infants(principal: Principal = Depends(get_principal)) -> list[dict]:
    now = now_in(get_settings().default_timezone)
    return [
        {**infant, "ageDays": _age_days(infant, now)}
        for infant in get_store().list("infantRecords")
        if principal.uid in infant.get("caregiverUids", [])
    ]


@app.get("/v1/family/events", tags=["family"])
def family_events(days: int = 7, principal: Principal = Depends(get_principal)) -> list[dict]:
    window = max(1, min(days, 120))
    rows = []
    for infant in get_store().list("infantRecords"):
        if principal.uid not in infant.get("caregiverUids", []):
            continue
        cutoff = now_in(_tz(infant)) - timedelta(days=window)
        for event in _events(infant["id"]):
            if parse_iso(event["startedAt"]) >= cutoff:
                rows.append({**event, "infantName": infant["name"]})
    return sorted(rows, key=lambda event: parse_iso(event["startedAt"]))


@app.post("/v1/infants/{infant_id}/view-links", status_code=201, tags=["family"])
def create_infant_view_link(infant_id: str, ttlMinutes: int = 60, infant: dict = Depends(require_infant_access),
                            principal: Principal = Depends(get_principal)) -> dict:
    require_consent(infant_id, "sharing")
    ttl = max(1, min(ttlMinutes, 1440))
    expires = now_in(_tz(infant)) + timedelta(minutes=ttl)
    token = secrets.token_urlsafe(24)
    get_store().set(f"infantViewLinks/{token}", {"infantId": infant_id, "createdBy": principal.uid,
                                                   "expiresAt": expires.isoformat()})
    audit(principal.uid, "infant.view_link_created", infant_id, {"ttlMinutes": ttl}, now_in(_tz(infant)))
    return {"token": token, "expiresAt": expires.isoformat(), "ttlMinutes": ttl}


@app.get("/v1/shared-infants/{token}", tags=["family"])
def view_shared_infant(token: str) -> dict:
    link = get_store().get(f"infantViewLinks/{token}")
    if link is None:
        raise HTTPException(status_code=404, detail="This viewing link is not valid.")
    expires = datetime.fromisoformat(link["expiresAt"])
    if expires <= datetime.now(expires.tzinfo):
        raise HTTPException(status_code=410, detail="This viewing link has expired.")
    if not consent_state(link["infantId"])["sharing"].get("granted"):
        raise HTTPException(status_code=410, detail="Sharing has been turned off for this baby.")
    infant = get_store().get(f"infantRecords/{link['infantId']}")
    if infant is None:
        raise HTTPException(status_code=410, detail="This baby profile is no longer available.")
    cutoff = now_in(_tz(infant)) - timedelta(days=7)
    events = []
    for event in _events(infant["id"]):
        if parse_iso(event["startedAt"]) < cutoff:
            continue
        allowed_details = {
            "feeding": ("method", "side", "amountMl"),
            "sleep": ("durationMin",),
            "diaper": ("kind",),
        }.get(event["type"], ())
        events.append({"type": event["type"], "startedAt": event["startedAt"],
                       "endedAt": event.get("endedAt"),
                       "details": {key: event.get("details", {})[key] for key in allowed_details
                                   if key in event.get("details", {})}})
    return {"infantName": infant["name"], "events": events, "expiresAt": link["expiresAt"], "readOnly": True}


@app.get("/v1/infants/{infant_id}", tags=["infant"])
def get_infant(infant: dict = Depends(require_infant_access)) -> dict:
    now = now_in(_tz(infant))
    return {**infant, "ageDays": _age_days(infant, now)}


@app.get("/v1/infants/{infant_id}/events", tags=["events"])
def list_events(infant_id: str, days: int = 7, infant: dict = Depends(require_infant_access)) -> list[dict]:
    cutoff = now_in(_tz(infant)) - timedelta(days=max(1, min(days, 31)))
    return [e for e in _events(infant_id) if parse_iso(e["startedAt"]) >= cutoff]


@app.post("/v1/infants/{infant_id}/events", status_code=201, tags=["events"])
def create_event(infant_id: str, body: EventIn, infant: dict = Depends(require_infant_access), principal: Principal = Depends(get_principal)) -> dict:
    now = now_in(_tz(infant))
    event = normalise_event(body.model_dump(exclude={"clientRequestId"}))
    if errors := validate_event(event, now):
        raise HTTPException(status_code=422, detail={"code": "invalid_event", "errors": errors})
    event_id = f"evt_{body.clientRequestId}" if body.clientRequestId else new_id("evt")
    path = f"infantRecords/{infant_id}/events/{event_id}"
    if body.clientRequestId:
        existing = get_store().get(path)
        if existing:
            return existing
    doc = {**event, "infantId": infant_id, "createdBy": principal.uid, "createdAt": now.isoformat(), "updatedAt": now.isoformat(),
           "provenance": event.get("provenance") or {"userStated": ["type", "startedAt"], "modelInferred": []}}
    get_store().set(path, doc)
    return get_store().get(path)


@app.patch("/v1/infants/{infant_id}/events/{event_id}", tags=["events"])
def update_event(infant_id: str, event_id: str, body: EventPatch, infant: dict = Depends(require_infant_access), principal: Principal = Depends(get_principal)) -> dict:
    store, path = get_store(), f"infantRecords/{infant_id}/events/{event_id}"
    current = store.get(path)
    if current is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    now = now_in(_tz(infant))
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    merged = normalise_event({**current, **patch, "details": {**current.get("details", {}), **(patch.get("details") or {})}})
    if errors := validate_event(merged, now):
        raise HTTPException(status_code=422, detail={"code": "invalid_event", "errors": errors})
    prov = merged.get("provenance") or {"userStated": [], "modelInferred": []}
    corrected = sorted(set(prov.get("userStated", [])) | set(patch.keys()))
    merged["provenance"] = {"userStated": corrected, "modelInferred": [f for f in prov.get("modelInferred", []) if f not in patch]}
    merged.update(updatedAt=now.isoformat(), updatedBy=principal.uid)
    store.set(path, merged)
    return store.get(path)


@app.delete("/v1/infants/{infant_id}/events/{event_id}", status_code=204, response_class=Response, response_model=None, tags=["events"])
def delete_event(infant_id: str, event_id: str, infant: dict = Depends(require_infant_access)) -> None:
    get_store().delete(f"infantRecords/{infant_id}/events/{event_id}")


@app.get("/v1/infants/{infant_id}/baseline", tags=["patterns"])
def baseline(infant_id: str, days: int = 7, infant: dict = Depends(require_infant_access)) -> dict:
    return compute_baseline(_events(infant_id), now_in(_tz(infant)), _tz(infant), days=max(3, min(days, 14)))


@app.post("/v1/infants/{infant_id}/voice-log", tags=["voice"])
async def voice_log(infant_id: str, audio: UploadFile | None = File(None), transcript: str | None = Form(None), language: str | None = Form(None),
                    infant: dict = Depends(require_infant_access)) -> dict:
    """Voice -> transcript -> Gemini extraction -> deterministic validation -> draft for user confirmation.
    Nothing is saved here; the client saves the confirmed event via POST /events."""
    purposes = ("transcription", "ai_processing") + (("audio_capture",) if audio else ())
    require_consent(infant_id, *purposes)
    data = await audio.read() if audio else None
    if data and len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Keep voice notes under 30 seconds.")
    try:
        heard = transcribe(data, "voice_log", transcript, audio.content_type if audio else "audio/wav", language)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    ai = get_ai()
    extracted = ai.extract_event(heard["transcript"])
    tz, now = _tz(infant), now_in(_tz(infant))
    if extracted.eventType == "unknown":
        return {"transcript": heard["transcript"], "speechProvider": heard["provider"], "model": getattr(ai, "name", "ai"),
                "status": "not_understood", "draft": None, "missingFields": [], "validationErrors": [],
                "message": "That didn't sound like a feed, sleep or diaper change. Try again or log it by hand."}

    inferred: list[str] = []
    if extracted.startTimeLocal:
        hh, mm = map(int, extracted.startTimeLocal.split(":"))
        start = now.replace(hour=hh, minute=mm)
        if start > now + timedelta(minutes=5):
            start -= timedelta(days=1)
            inferred.append("date")
    else:
        start = now
        inferred.append("startedAt")

    details: dict = {}
    ended = None
    if extracted.eventType == "feeding":
        details = {"method": extracted.feedMethod, "amountMl": extracted.amountMl, "side": extracted.side}
    elif extracted.eventType == "sleep":
        if extracted.durationMin:
            ended = (start + timedelta(minutes=extracted.durationMin)).isoformat()
            if parse_iso(ended) > now:
                start, ended = now - timedelta(minutes=extracted.durationMin), now.isoformat()
                inferred.append("startedAt")
    elif extracted.eventType == "diaper":
        details = {"kind": extracted.diaperKind}

    draft = normalise_event({"type": extracted.eventType, "startedAt": start.isoformat(), "endedAt": ended,
                             "details": details, "source": "voice",
                             "provenance": {"userStated": extracted.userStatedFields, "modelInferred": sorted(set(inferred))}})
    errors = validate_event(draft, now)
    needs_confirmation = bool(extracted.missingFields or inferred or errors)
    return {"transcript": heard["transcript"], "speechProvider": heard["provider"], "model": getattr(ai, "name", "ai"),
            "status": "needs_confirmation" if needs_confirmation else "ready", "draft": draft,
            "missingFields": extracted.missingFields, "validationErrors": errors}


@app.post("/v1/infants/{infant_id}/warning-check", tags=["safety"])
def warning_check(infant_id: str, body: BabyWarningAnswers, region: str = "IN", infant: dict = Depends(require_infant_access)) -> dict:
    """Deterministic and versioned. Runs before any audio analysis and overrides it."""
    facts = {**body.model_dump(), "ageDays": _age_days(infant, now_in(_tz(infant)))}
    result = evaluate("rules/baby_warning_signs_v1.json", facts)
    if result["level"] != "none":
        result["support"] = support_content(region.upper())
    return result


@app.post("/v1/infants/{infant_id}/cry-analysis", tags=["audio"])
async def cry_analysis(infant_id: str, audio: UploadFile = File(...), infant: dict = Depends(require_infant_access),
                       principal: Principal = Depends(get_principal)) -> dict:
    """Quality checks -> cry presence (detected / not_detected / uncertain). Raw audio is not stored."""
    require_consent(infant_id, "audio_capture", "ai_processing")
    data = await audio.read()
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Keep recordings under 30 seconds.")
    now = now_in(_tz(infant))
    response = await analyse_sound(data, _events(infant_id), now, _age_days(infant, now), get_settings(), get_ai)
    analysis_id = new_id("cry")
    doc = {key: value for key, value in response.items() if key not in {"nextSteps", "retry", "contextReview"}}
    doc["createdBy"] = principal.uid
    get_store().set(f"infantRecords/{infant_id}/audioAnalyses/{analysis_id}", doc)
    return {**response, **get_store().get(f"infantRecords/{infant_id}/audioAnalyses/{analysis_id}")}


@app.get("/v1/infants/{infant_id}/next-steps", tags=["safety"])
def next_steps(infant_id: str, infant: dict = Depends(require_infant_access)) -> dict:
    return suggest_checks(_events(infant_id), now_in(_tz(infant)))


@app.post("/v1/infants/{infant_id}/documents/review", tags=["documents"])
async def review_document(infant_id: str, image: UploadFile = File(...), purpose: str = Form("vaccination"), infant: dict = Depends(require_infant_access)) -> dict:
    require_consent(infant_id, "ai_processing")
    data = await image.read(4_000_001)
    try:
        return await run_in_threadpool(review_care_document, data, image.content_type, purpose, get_ai)
    except HTTPException:
        raise
    except Exception as failure:
        raise HTTPException(status_code=502, detail="The photo could not be read. Try a clearer image or enter the details manually.") from failure


@app.get("/v1/infants/{infant_id}/consents", tags=["consent"])
def list_consents(infant_id: str, infant: dict = Depends(require_infant_access)) -> dict:
    return consent_state(infant_id)


@app.put("/v1/infants/{infant_id}/consents/{purpose}", tags=["consent"])
def update_consent(infant_id: str, purpose: str, body: ConsentIn, infant: dict = Depends(require_infant_access),
                   principal: Principal = Depends(get_principal)) -> dict:
    return set_consent("infant", infant_id, purpose, body.granted, body.retentionPreference, principal.uid, now_in(_tz(infant)))


@app.get("/v1/infants/{infant_id}/export", tags=["data"])
def export_infant(infant_id: str, infant: dict = Depends(require_infant_access), principal: Principal = Depends(get_principal)) -> dict:
    store = get_store()
    audit(principal.uid, "infant.exported", infant_id, {}, now_in(_tz(infant)))
    return {"profile": infant, "events": _events(infant_id), "audioAnalyses": store.list(f"infantRecords/{infant_id}/audioAnalyses"),
            "consents": consent_state(infant_id)}


@app.delete("/v1/infants/{infant_id}/data", tags=["data"])
def delete_infant_data(infant_id: str, infant: dict = Depends(require_infant_access), principal: Principal = Depends(get_principal)) -> dict:
    store = get_store()
    removed = {c: store.delete_collection(f"infantRecords/{infant_id}/{c}") for c in ("events", "audioAnalyses", "baselines")}
    audit(principal.uid, "infant.data_deleted", infant_id, removed, now_in(_tz(infant)))
    return {"deleted": removed, "message": "Baby logs and audio analyses were deleted. The profile was kept."}


# ---- Modules: generic records, vaccines, observations, partner nudges --------
from fastapi import Body  # noqa: E402

from crysense.domain.observations import observations as build_observations  # noqa: E402
from crysense.domain.vaccines import schedule_status  # noqa: E402
from crysense.records import INFANT_KINDS, UPSERT_KEY, parse, sort_records  # noqa: E402
from crysense.safety.engine import load_json  # noqa: E402


@app.get("/v1/infants/{infant_id}/records/{kind}", tags=["modules"])
def list_records(infant_id: str, kind: str, infant: dict = Depends(require_infant_access)) -> list[dict]:
    if kind not in INFANT_KINDS:
        raise HTTPException(status_code=404, detail="Unknown module.")
    return sort_records(get_store().list(f"infantRecords/{infant_id}/{kind}"))


@app.post("/v1/infants/{infant_id}/records/{kind}", status_code=201, tags=["modules"])
def add_record(infant_id: str, kind: str, body: dict = Body(...), infant: dict = Depends(require_infant_access),
               principal: Principal = Depends(get_principal)) -> dict:
    data = parse(INFANT_KINDS, kind, body)
    rid = UPSERT_KEY[kind](data) if kind in UPSERT_KEY else new_id(kind[:3])
    path = f"infantRecords/{infant_id}/{kind}/{rid}"
    get_store().set(path, {**data, "createdBy": principal.uid, "createdAt": now_in(_tz(infant)).isoformat()})
    return get_store().get(path)


@app.delete("/v1/infants/{infant_id}/records/{kind}/{record_id}", status_code=204, response_class=Response, response_model=None, tags=["modules"])
def delete_record(infant_id: str, kind: str, record_id: str, infant: dict = Depends(require_infant_access)) -> None:
    if kind not in INFANT_KINDS:
        raise HTTPException(status_code=404, detail="Unknown module.")
    get_store().delete(f"infantRecords/{infant_id}/{kind}/{record_id}")


@app.get("/v1/infants/{infant_id}/vaccines", tags=["modules"])
def vaccines(infant_id: str, region: str = "IN", infant: dict = Depends(require_infant_access)) -> dict:
    if region.upper() != "IN":
        return {"region": region.upper(), "doses": [], "message": "A schedule for this region has not been added yet."}
    schedule = load_json("content/vaccines_IN_v1.json")
    given = {r["vaccineId"]: r for r in get_store().list(f"infantRecords/{infant_id}/vaccinations")}
    today = now_in(_tz(infant)).date()
    return {"region": "IN", "version": schedule["version"], "verification": schedule["verification"], "note": schedule["verificationNote"],
            "doses": schedule_status(schedule, date.fromisoformat(infant["birthDate"]), given, today)}


@app.get("/v1/infants/{infant_id}/observations", tags=["modules"])
def observations(infant_id: str, infant: dict = Depends(require_infant_access)) -> list[dict]:
    return build_observations(_events(infant_id), now_in(_tz(infant)))


@app.get("/v1/infants/{infant_id}/nudges", tags=["modules"])
def nudges(infant_id: str, infant: dict = Depends(require_infant_access), principal: Principal = Depends(get_principal)) -> list[dict]:
    """Gentle prompts a mother chose to send her household. Only text, never her records."""
    now = now_in(_tz(infant)).isoformat()
    rows = get_store().list(f"households/{infant['householdId']}/nudges")
    return [n for n in sort_records(rows) if principal.uid in n.get("forUids", []) and n.get("expiresAt", "") > now]


# ---- Moderated community Q&A -----------------------------------------------
def _require_moderator(principal: Principal) -> None:
    user = get_store().get(f"users/{principal.uid}") or {}
    if user.get("role") != "moderator":
        raise HTTPException(status_code=403, detail="A community moderator must review this action.")


@app.get("/v1/community/questions", tags=["community"])
def community_questions(moderation: bool = False, principal: Principal = Depends(get_principal)) -> list[dict]:
    if moderation:
        _require_moderator(principal)
        statuses = {"pending", "flagged"}
    else:
        statuses = {"approved"}
    questions = sorted((question for question in get_store().list("communityQuestions") if question.get("status") in statuses),
                       key=lambda question: question.get("createdAt", ""), reverse=True)
    if moderation:
        return questions
    public_fields = {"id", "title", "text", "status", "answer", "reportCount", "createdAt"}
    return [{key: value for key, value in question.items() if key in public_fields} for question in questions]


@app.post("/v1/community/questions", status_code=201, tags=["community"])
def submit_community_question(body: dict = Body(...), principal: Principal = Depends(get_principal)) -> dict:
    title, text = str(body.get("title", "")).strip(), str(body.get("text", "")).strip()
    if not title or len(title) > 120 or not text or len(text) > 2000:
        raise HTTPException(status_code=422, detail="Add a title (up to 120 characters) and question (up to 2,000 characters).")
    created = now_in(get_settings().default_timezone).isoformat()
    question_id = new_id("cq")
    question = {"id": question_id, "title": title, "text": text, "status": "pending", "answer": None,
                "answerer": None, "reportCount": 0, "createdBy": principal.uid, "createdAt": created}
    get_store().set(f"communityQuestions/{question_id}", question)
    audit(principal.uid, "community.question_submitted", question_id, {}, now_in(get_settings().default_timezone))
    return question


@app.put("/v1/community/questions/{question_id}/moderation", tags=["community"])
def review_community_question(question_id: str, body: dict = Body(...), principal: Principal = Depends(get_principal)) -> dict:
    _require_moderator(principal)
    path = f"communityQuestions/{question_id}"
    question = get_store().get(path)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")
    status = body.get("status")
    answer = str(body.get("answer", "")).strip()
    reviewer = get_store().get(f"users/{principal.uid}") or {}
    if status == "approved" and reviewer.get("expertVerified") is not True:
        raise HTTPException(status_code=403, detail="Publishing an expert answer requires verified credentials.")
    if status not in {"approved", "rejected"} or (status == "approved" and (not answer or len(answer) > 2000)):
        raise HTTPException(status_code=422, detail="Approval requires an expert answer of up to 2,000 characters.")
    question.update(status=status, answer=answer if status == "approved" else None,
                    answerer=principal.uid if status == "approved" else None,
                    reviewedAt=now_in(get_settings().default_timezone).isoformat())
    get_store().set(path, question)
    audit(principal.uid, "community.question_reviewed", question_id, {"status": status}, now_in(get_settings().default_timezone))
    return question


@app.post("/v1/community/questions/{question_id}/reports", status_code=201, tags=["community"])
def report_community_question(question_id: str, principal: Principal = Depends(get_principal)) -> dict:
    path = f"communityQuestions/{question_id}"
    question = get_store().get(path)
    if question is None or question.get("status") != "approved":
        raise HTTPException(status_code=404, detail="Question not found.")
    report_path = f"communityReports/{question_id}_{principal.uid}"
    if get_store().get(report_path):
        raise HTTPException(status_code=409, detail="You have already reported this post.")
    get_store().set(report_path, {"questionId": question_id, "reportedBy": principal.uid,
                                  "createdAt": now_in(get_settings().default_timezone).isoformat()})
    question["reportCount"] = int(question.get("reportCount", 0)) + 1
    if question["reportCount"] >= 3:
        question["status"] = "flagged"
    get_store().set(path, question)
    audit(principal.uid, "community.question_reported", question_id, {}, now_in(get_settings().default_timezone))
    return {"reported": True}
