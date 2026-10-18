from crysense.store import get_store

from .conftest import ARJUN, MEERA, STRANGER


def test_records_validate_and_upsert(baby):
    bad = baby.post("/v1/infants/inf_anya/records/growth", headers=MEERA, json={"date": "2026-10-10", "weightKg": 90})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "invalid_record"
    assert baby.post("/v1/infants/inf_anya/records/unknown", headers=MEERA, json={}).status_code == 404
    assert baby.post("/v1/infants/inf_anya/records/duty", headers=ARJUN, json={}).status_code == 404


def test_partner_cannot_read_mother_modules(mother):
    assert mother.get("/v1/mothers/mom_meera/records/wins", headers=ARJUN).status_code == 403
    assert mother.get("/v1/mothers/mom_meera/records/wins", headers=MEERA).status_code == 200


def test_vaccine_status_is_date_arithmetic(baby):
    doses = baby.get("/v1/infants/inf_anya/vaccines", headers=MEERA).json()["doses"]
    status = {d["id"]: d["status"] for d in doses}
    assert status["bcg"] == "given" and status["opv1"] == "due_now" and status["mr1"] == "upcoming"


def test_partner_prompt_only_when_enabled_and_only_text(baby, mother):
    low = {"mood": 3, "energy": 2, "rest": 1, "pain": 3, "support": 3, "skipped": [], "note": "private words"}
    mother.post("/v1/mothers/mom_meera/checkins", headers=MEERA, json=low)
    assert baby.get("/v1/infants/inf_anya/nudges", headers=ARJUN).json() == []
    mother.put("/v1/mothers/mom_meera/partner-prompts", headers=MEERA, json={"enabled": True})
    mother.post("/v1/mothers/mom_meera/checkins", headers=MEERA, json=low)
    nudges = baby.get("/v1/infants/inf_anya/nudges", headers=ARJUN).json()
    assert len(nudges) == 1 and "private words" not in nudges[0]["text"] and "rest" in nudges[0]["text"]
    assert baby.get("/v1/infants/inf_anya/nudges", headers=MEERA).json() == []


def test_share_link_expires(mother):
    body = {"recipientName": "Dr. Rao", "recipientRole": "doctor", "fields": ["checkins"], "periodDays": 7}
    assert mother.post("/v1/mothers/mom_meera/care-summaries/share-link", headers=MEERA, json=body).status_code == 403
    mother.put("/v1/mothers/mom_meera/consents/sharing", headers=MEERA, json={"granted": True})
    token = mother.post("/v1/mothers/mom_meera/care-summaries/share-link?ttlMinutes=15", headers=MEERA, json=body).json()["token"]
    seen = mother.get(f"/v1/shared/{token}")
    assert seen.status_code == 200 and seen.json()["summary"]["sections"][0]["field"] == "checkins"
    link = get_store().get(f"shareLinks/{token}")
    get_store().set(f"shareLinks/{token}", {**link, "expiresAt": "2020-01-01T00:00:00+05:30"})
    assert mother.get(f"/v1/shared/{token}").status_code == 410
    assert mother.get("/v1/shared/nope").status_code == 404


def test_observations_are_questions_not_predictions(baby):
    cards = baby.get("/v1/infants/inf_anya/observations", headers=MEERA).json()
    assert cards and all(c["question"].endswith("?") for c in cards)
    assert any(c["id"] == "gaps" for c in cards)


def test_community_questions_stay_hidden_until_moderator_answers_and_approves(baby):
    moderator = {"Authorization": "Bearer mock-u_moderator"}
    get_store().set("users/u_moderator", {"role": "moderator"})
    submitted = baby.post("/v1/community/questions", headers=STRANGER, json={"title": "Feeding question", "text": "Where can I find support?"})
    assert submitted.status_code == 201
    question_id = submitted.json()["id"]
    assert submitted.json()["status"] == "pending"
    assert baby.get("/v1/community/questions", headers=STRANGER).json() == []
    assert baby.get("/v1/community/questions?moderation=true", headers=STRANGER).status_code == 403

    assert baby.put(f"/v1/community/questions/{question_id}/moderation", headers=moderator,
                    json={"status": "approved", "answer": "A qualified lactation professional can help."}).status_code == 403
    get_store().set("users/u_moderator", {"role": "moderator", "expertVerified": True})
    assert baby.put(f"/v1/community/questions/{question_id}/moderation", headers=moderator,
                    json={"status": "approved", "answer": "A qualified lactation professional can help."}).status_code == 200
    public = baby.get("/v1/community/questions", headers=STRANGER).json()
    assert len(public) == 1 and public[0]["answer"].startswith("A qualified")
    assert "createdBy" not in public[0] and "answerer" not in public[0]

    for headers in (STRANGER, ARJUN, MEERA):
        assert baby.post(f"/v1/community/questions/{question_id}/reports", headers=headers).status_code == 201
    assert baby.get("/v1/community/questions", headers=STRANGER).json() == []
    assert baby.get("/v1/community/questions?moderation=true", headers=moderator).json()[0]["status"] == "flagged"
