"""Synthetic demo data. Every record is fictional and generated relative to "now",
so the seven-day view always looks current. Day 3 is deliberately left empty to
show that missing data is reported as missing, never as zero."""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .base import DocumentStore

TZ = ZoneInfo("Asia/Kolkata")

USERS = {
    "u_meera": {"displayName": "Meera", "role": "mother", "region": "IN"},
    "u_arjun": {"displayName": "Arjun", "role": "partner", "region": "IN"},
}
INFANT_ID = "inf_anya"
MOTHER_ID = "mom_meera"
HOUSEHOLD_ID = "hh_rao"


def _iso(dt: datetime) -> str:
    return dt.astimezone(TZ).isoformat(timespec="minutes")


def build_seed(now: datetime | None = None) -> dict[str, dict]:
    now = (now or datetime.now(TZ)).astimezone(TZ).replace(second=0, microsecond=0)
    birth = (now - timedelta(days=42)).date()
    docs: dict[str, dict] = {}

    for uid, profile in USERS.items():
        docs[f"users/{uid}"] = {**profile, "householdId": HOUSEHOLD_ID, "createdAt": _iso(now - timedelta(days=40))}

    docs[f"households/{HOUSEHOLD_ID}"] = {
        "name": "Rao household",
        "memberUids": ["u_meera", "u_arjun"],
        # Sharing is explicit and narrow: the partner sees baby records only.
        "sharingPermissions": {"u_arjun": {"infant": True, "mother": False}},
    }
    docs[f"infantRecords/{INFANT_ID}"] = {
        "name": "Anya", "birthDate": birth.isoformat(), "householdId": HOUSEHOLD_ID,
        "caregiverUids": ["u_meera", "u_arjun"], "timezone": "Asia/Kolkata",
    }
    docs[f"maternalRecords/{MOTHER_ID}"] = {
        "name": "Meera", "ownerUid": "u_meera", "deliveryDate": birth.isoformat(),
        "deliveryType": "caesarean", "region": "IN", "timezone": "Asia/Kolkata",
    }

    # Baby events for the last 7 days (day offset 3 intentionally empty).
    n = 0
    feed_hours = [1, 4, 7, 10, 13, 16, 19, 22]
    amounts = [80, 90, 70, 100, 90, 85, 95, 90]
    for offset in range(6, -1, -1):
        if offset == 3:
            continue
        day = (now - timedelta(days=offset)).replace(hour=0, minute=0)
        for i, (h, ml) in enumerate(zip(feed_hours, amounts)):
            t = day + timedelta(hours=h, minutes=(offset * 7 + i * 3) % 25)
            if t > now:
                continue
            n += 1
            docs[f"infantRecords/{INFANT_ID}/events/evt_{n:04d}"] = {
                "infantId": INFANT_ID, "type": "feeding", "startedAt": _iso(t), "endedAt": None,
                "details": {"method": "bottle" if i % 3 else "breast", "amountMl": ml if i % 3 else None, "side": None if i % 3 else ("left" if i % 2 else "right")},
                "source": "manual", "createdBy": "u_meera" if i % 2 else "u_arjun",
                "provenance": {"userStated": ["type", "time"], "modelInferred": []},
                "createdAt": _iso(t), "updatedAt": _iso(t),
            }
            if i % 2 == 0:
                n += 1
                start = t + timedelta(minutes=35)
                end = start + timedelta(minutes=90 + (i * 11) % 60)
                if end <= now:
                    docs[f"infantRecords/{INFANT_ID}/events/evt_{n:04d}"] = {
                        "infantId": INFANT_ID, "type": "sleep", "startedAt": _iso(start), "endedAt": _iso(end),
                        "details": {"durationMin": int((end - start).total_seconds() // 60)},
                        "source": "manual", "createdBy": "u_meera",
                        "provenance": {"userStated": ["type", "time"], "modelInferred": []},
                        "createdAt": _iso(end), "updatedAt": _iso(end),
                    }
            n += 1
            dt = t + timedelta(minutes=20)
            if dt <= now:
                kind = "both" if i == 2 else ("dirty" if i == 5 else "wet")
                docs[f"infantRecords/{INFANT_ID}/events/evt_{n:04d}"] = {
                    "infantId": INFANT_ID, "type": "diaper", "startedAt": _iso(dt), "endedAt": None,
                    "details": {"kind": kind}, "source": "manual", "createdBy": "u_arjun",
                    "provenance": {"userStated": ["type", "time"], "modelInferred": []},
                    "createdAt": _iso(dt), "updatedAt": _iso(dt),
                }

    # Mother: check-ins, journal, recovery, medication, consents.
    for k, offset in enumerate([5, 3, 1]):
        d = (now - timedelta(days=offset)).date().isoformat()
        docs[f"maternalRecords/{MOTHER_ID}/checkins/chk_{k + 1:03d}"] = {
            "date": d, "mood": [3, 2, 3][k], "energy": [2, 2, 3][k], "rest": [2, 1, 3][k],
            "pain": [5, 4, 3][k], "support": [3, 4, 4][k], "skipped": [], "note": None,
            "createdAt": _iso(now - timedelta(days=offset)),
        }
    docs[f"maternalRecords/{MOTHER_ID}/journalEntries/jrn_001"] = {
        "createdAt": _iso(now - timedelta(days=2, hours=3)),
        "transcript": "Long night again. Anya fed twice after midnight and I barely slept. The stitches feel a bit better than last week. Arjun took the morning feed so I could rest a little.",
        "reflection": {
            "summary": "You mentioned a long night with little sleep, that your stitches feel a bit better, and that Arjun took the morning feed so you could rest.",
            "selfReportedTopics": ["sleep", "physical_recovery", "support"],
            "followUpQuestion": "Would you like to log how your stitches feel today?",
            "medicalAssessment": False, "requiresUserReview": True,
        },
        "reviewedByUser": True, "audioRetained": False,
    }
    for k, (symptom, sev, trend, offset) in enumerate([("incision_pain", 5, "better", 6), ("incision_pain", 3, "better", 2), ("breast_pain", 2, "same", 1)]):
        docs[f"maternalRecords/{MOTHER_ID}/recoveryLogs/rec_{k + 1:03d}"] = {
            "symptom": symptom, "severity": sev, "trend": trend, "note": None,
            "onset": (now - timedelta(days=offset + 1)).date().isoformat(),
            "createdAt": _iso(now - timedelta(days=offset)),
        }
    docs[f"maternalRecords/{MOTHER_ID}/medicationSchedules/med_iron"] = {
        "name": "Iron and folic acid tablet", "dose": "1 tablet (as prescribed)", "times": ["09:00"],
        "startDate": (now - timedelta(days=40)).date().isoformat(), "endDate": None,
        "instructionsSource": "clinician", "note": "Take after breakfast", "createdAt": _iso(now - timedelta(days=40)),
    }
    docs[f"maternalRecords/{MOTHER_ID}/medicationSchedules/med_pain"] = {
        "name": "Pain relief", "dose": "As prescribed by your doctor", "times": ["08:00", "20:00"],
        "startDate": (now - timedelta(days=10)).date().isoformat(), "endDate": (now + timedelta(days=4)).date().isoformat(),
        "instructionsSource": "clinician", "note": None, "createdAt": _iso(now - timedelta(days=10)),
    }
    today = now.date().isoformat()
    if now.hour >= 9:
        docs[f"maternalRecords/{MOTHER_ID}/medicationEvents/mev_001"] = {
            "scheduleId": "med_iron", "scheduledFor": f"{today}T09:00", "status": "taken", "at": _iso(now.replace(hour=9, minute=20)),
        }
    for subject, sid in (("infant", INFANT_ID), ("mother", MOTHER_ID)):
        for purpose, granted in (("audio_capture", True), ("transcription", True), ("ai_processing", True), ("storage", True), ("sharing", False), ("research", False)):
            docs[f"consentRecords/{sid}_{purpose}"] = {
                "subjectType": subject, "subjectId": sid, "purpose": purpose, "granted": granted,
                "grantedAt": _iso(now - timedelta(days=40)) if granted else None, "revokedAt": None,
                "retentionPreference": "ephemeral" if purpose == "audio_capture" else "until_deleted",
                "updatedBy": "u_meera",
            }
    # ---- Module records -------------------------------------------------
    inf = f"infantRecords/{INFANT_ID}"
    for k, (days, w, l, h) in enumerate([(0, 3.1, 49.0, 34.0), (14, 3.6, 51.5, 35.5), (35, 4.4, 54.5, 37.2)]):
        docs[f"{inf}/growth/gro_{k + 1:03d}"] = {"date": (birth + timedelta(days=days)).isoformat(), "weightKg": w, "lengthCm": l, "headCm": h,
                                                 "note": None, "createdBy": "u_meera", "createdAt": _iso(now)}
    for vid in ("bcg", "opv0", "hepb0"):
        docs[f"{inf}/vaccinations/{vid}"] = {"vaccineId": vid, "givenOn": birth.isoformat(), "note": "Given at the hospital", "createdBy": "u_meera", "createdAt": _iso(now)}
    docs[f"{inf}/milestones/mil_001"] = {"milestone": "first_smile", "date": (now - timedelta(days=4)).date().isoformat(),
                                         "note": "Smiled at Arjun's voice during the morning feed.", "photo": None, "createdBy": "u_meera", "createdAt": _iso(now)}
    docs[f"{inf}/visit_questions/vq_001"] = {"text": "Is she feeding often enough in the evenings?", "createdBy": "u_meera", "createdAt": _iso(now)}
    mom = f"maternalRecords/{MOTHER_ID}"
    docs[f"{mom}/appointments/apt_001"] = {"title": "Stitch review", "date": (birth + timedelta(days=10)).isoformat(), "note": None, "done": True, "createdAt": _iso(now)}
    docs[f"{mom}/appointments/apt_002"] = {"title": "6-week postnatal check", "date": (birth + timedelta(days=45)).isoformat(), "note": "Bring the medicine list", "done": False, "createdAt": _iso(now)}
    docs[f"{mom}/appointments/apt_003"] = {"title": "Blood pressure follow-up", "date": (birth + timedelta(days=56)).isoformat(), "note": None, "done": False, "createdAt": _iso(now)}
    docs[f"{mom}/wins/win_001"] = {"text": "Anya latched well at the 6 am feed.", "date": (now - timedelta(days=1)).date().isoformat(), "createdAt": _iso(now)}
    docs[f"{mom}/hydration/{now.date().isoformat()}"] = {"date": now.date().isoformat(), "glasses": 3, "createdAt": _iso(now)}
    docs[f"{mom}/settings/partner_prompts"] = {"enabled": False}
    return docs


def seed_store(store: DocumentStore, now: datetime | None = None) -> None:
    for path, doc in build_seed(now).items():
        store.set(path, doc)
