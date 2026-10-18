from datetime import datetime, timezone

from .conftest import MEERA


def test_voice_log_extracts_and_requires_review(baby):
    r = baby.post("/v1/infants/inf_anya/voice-log", headers=MEERA, data={"transcript": "Fed 90 ml formula at 8 pm"}).json()
    d = r["draft"]
    assert d["type"] == "feeding" and d["details"]["amountMl"] == 90 and d["details"]["method"] == "formula"
    assert "amountMl" in d["provenance"]["userStated"]


def test_voice_log_without_time_is_flagged_as_assumed(baby):
    r = baby.post("/v1/infants/inf_anya/voice-log", headers=MEERA, data={"transcript": "changed a wet diaper"}).json()
    assert r["status"] == "needs_confirmation" and "startedAt" in r["draft"]["provenance"]["modelInferred"]


def test_not_understood_returns_no_draft(baby):
    r = baby.post("/v1/infants/inf_anya/voice-log", headers=MEERA, data={"transcript": "what a lovely morning"}).json()
    assert r["status"] == "not_understood" and r["draft"] is None


def test_invalid_event_is_rejected(baby):
    r = baby.post("/v1/infants/inf_anya/events", headers=MEERA,
                  json={"type": "feeding", "startedAt": "2026-10-10T10:00+05:30", "details": {"amountMl": 900}})
    assert r.status_code == 422


def test_event_retry_with_same_client_request_id_is_idempotent(baby):
    body = {
        "type": "feeding",
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "details": {"method": "bottle", "amountMl": 90},
        "clientRequestId": "12345678-1234-4234-8234-123456789abc",
    }

    first = baby.post("/v1/infants/inf_anya/events", headers=MEERA, json=body)
    retry = baby.post("/v1/infants/inf_anya/events", headers=MEERA, json=body)

    assert first.status_code == retry.status_code == 201
    assert first.json()["id"] == retry.json()["id"]


def test_revoked_consent_blocks_ai(baby):
    baby.put("/v1/infants/inf_anya/consents/ai_processing", headers=MEERA, json={"granted": False})
    r = baby.post("/v1/infants/inf_anya/voice-log", headers=MEERA, data={"transcript": "Fed 90 ml at 8 pm"})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "consent_required"
