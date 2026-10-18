from .conftest import ARJUN, MEERA


def test_screening_is_deterministic_and_handles_skips(mother):
    full = {"q1": 1, "q2": 1, "q3": 2, "q4": 1, "q5": 0}
    r = mother.post("/v1/mothers/mom_meera/screenings", headers=MEERA, json={"instrumentId": "demo_wellbeing", "answers": full}).json()
    assert r["total"] == 5 and r["band"]["id"] == "middle" and not r["safetyTriggered"]
    skipped = mother.post("/v1/mothers/mom_meera/screenings", headers=MEERA, json={"instrumentId": "demo_wellbeing", "answers": {**full, "q2": None}}).json()
    assert skipped["total"] is None and skipped["skippedItems"] == ["q2"]


def test_screening_safety_item_routes_to_support(mother):
    r = mother.post("/v1/mothers/mom_meera/screenings", headers=MEERA,
                    json={"instrumentId": "demo_wellbeing", "answers": {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 1}}).json()
    assert r["safetyTriggered"] and r["supportNow"] and r["support"]["region"] == "IN"


def test_medication_dose_cannot_be_changed_via_events(mother):
    bad = mother.post("/v1/mothers/mom_meera/medications/med_iron/events", headers=MEERA,
                      json={"scheduledFor": "2026-10-16T09:00", "status": "taken", "dose": "2 tablets"})
    assert bad.status_code == 422
    wrong_time = mother.post("/v1/mothers/mom_meera/medications/med_iron/events", headers=MEERA,
                             json={"scheduledFor": "2026-10-16T11:00", "status": "taken"})
    assert wrong_time.status_code == 422


def test_medication_today_lists_doses_in_order(mother):
    doses = mother.get("/v1/mothers/mom_meera/medications/today", headers=MEERA).json()["doses"]
    times = [d["scheduledFor"] for d in doses]
    assert times == sorted(times) and len(doses) == 3


def test_journal_flow_review_reflect_save_delete(mother):
    t = mother.post("/v1/mothers/mom_meera/journal/transcribe", headers=MEERA, data={"transcript": "I slept badly and my stitches hurt."}).json()
    assert t["requiresUserReview"] and t["audioRetained"] is False
    ref = mother.post("/v1/mothers/mom_meera/journal/reflect", headers=MEERA, json={"transcript": t["transcript"]}).json()["reflection"]
    assert ref["medicalAssessment"] is False and "physical_recovery" in ref["selfReportedTopics"]
    saved = mother.post("/v1/mothers/mom_meera/journal", headers=MEERA, json={"transcript": t["transcript"], "reflection": ref, "reviewedByUser": True}).json()
    assert mother.delete(f"/v1/mothers/mom_meera/journal/{saved['id']}", headers=MEERA).status_code == 204


def test_reflection_guard_blocks_clinical_labels():
    from crysense.ai.guards import guard_reflection

    out, modified = guard_reflection({"summary": "You may have postpartum depression.", "selfReportedTopics": ["mood"], "followUpQuestion": None})
    assert modified and "depression" not in out["summary"].lower()


def test_sharing_requires_consent_then_audits(mother):
    body = {"recipientName": "Dr. Rao", "recipientRole": "doctor", "fields": ["checkins", "recovery"], "periodDays": 7}
    preview = mother.post("/v1/mothers/mom_meera/care-summaries/preview", headers=MEERA, json=body).json()
    assert [s["field"] for s in preview["sections"]] == ["checkins", "recovery"]
    assert mother.post("/v1/mothers/mom_meera/care-summaries", headers=MEERA, json=body).status_code == 403
    mother.put("/v1/mothers/mom_meera/consents/sharing", headers=MEERA, json={"granted": True})
    assert mother.post("/v1/mothers/mom_meera/care-summaries", headers=MEERA, json=body).status_code == 201


def test_support_chat_is_private_consented_and_not_persisted(mother):
    from crysense.store import get_store

    path = "/v1/mothers/mom_meera/support/chat"
    body = {"message": "Today felt tiring. Can we talk for a moment?"}
    assert mother.post(path, headers=ARJUN, json=body).status_code == 403
    before = mother.get("/v1/mothers/mom_meera/journal", headers=MEERA).json()
    response = mother.post(path, headers=MEERA, json=body)
    assert response.status_code == 200
    assert response.json()["reply"] and response.json()["supportNow"] is False
    assert mother.get("/v1/mothers/mom_meera/journal", headers=MEERA).json() == before
    assert get_store().list("supportChats") == []
    mother.put("/v1/mothers/mom_meera/consents/ai_processing", headers=MEERA, json={"granted": False})
    assert mother.post(path, headers=MEERA, json=body).status_code == 403


def test_support_chat_bounds_history(mother):
    response = mother.post("/v1/mothers/mom_meera/support/chat", headers=MEERA,
                           json={"message": "A short chat", "history": [{"role": "user", "text": "hello"}] * 7})
    assert response.status_code == 422


def test_support_chat_routes_explicit_danger_without_model():
    from crysense.ai.schemas import SupportChatIn
    from crysense.ai.support_chat import support_reply

    def no_model():
        raise AssertionError("Urgent guidance must not call the model")

    response = support_reply(SupportChatIn(message="I want to hurt myself"), no_model)
    assert response["supportNow"] is True
    assert response["provider"] == "safety-guidance"
    assert response["support"]["region"] == "IN"


def test_support_chat_filters_clinical_and_dependency_language():
    from crysense.ai.schemas import SupportChatContent, SupportChatIn
    from crysense.ai.support_chat import support_reply

    class UnsafeProvider:
        name = "test"

        def support_chat(self, body):
            return SupportChatContent(reply="You have postpartum depression. Only I understand you.")

    response = support_reply(SupportChatIn(message="I had a long day"), UnsafeProvider)
    assert "depression" not in response["reply"] and "Only I" not in response["reply"]
