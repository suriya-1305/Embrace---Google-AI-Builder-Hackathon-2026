import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import pytest

from crysense.ai.mock_provider import MockProvider
from crysense.ai.schemas import BabySoundObservation, JournalReflection, SupportChatContent
from crysense.store import get_store
from crysense.store.memory_store import MemoryStore
from .conftest import synthetic_cry, wav_bytes


@pytest.fixture
def demo_model(monkeypatch):
    import baby_api.demo_ai as demo_module

    class DemoModel:
        name = "gemini:test"
        received = None

        def review_baby_sound(self, audio, context):
            self.received = context
            return BabySoundObservation(sound="crying", pitch="mid", pattern="intermittent", careChecks=["feeding"])

        def transcribe(self, audio, mime_type, language):
            return "Fed 90 ml formula at 8 pm"

        def extract_event(self, text):
            return MockProvider().extract_event(text)

        def reflect(self, text):
            return JournalReflection(summary="You described a long day and some welcome support.",
                                     selfReportedTopics=["support"], followUpQuestion=None)

        def support_chat(self, conversation):
            self.received = conversation
            return SupportChatContent(reply="That sounds like a full day. What might make this moment a little easier?")

    model = DemoModel()
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setattr(demo_module, "get_ai", lambda: model)
    return model


def payload(**changes):
    return {"context": json.dumps({"sampleInfantId": "inf_demo4m", "recentEvents": []}),
            "aiConsent": "true", "audioConsent": "true", **changes}


def test_demo_sound_uses_real_provider_contract_and_sanitizes_context(baby, demo_model):
    context = {"sampleInfantId": "inf_demo4m", "recentEvents": [{"type": "feeding", "startedAt": datetime.now(timezone.utc).isoformat(),
               "details": {"method": "breast", "privateExtra": "never send"}, "note": "private words", "createdBy": "private-user"}]}
    response = baby.post("/v1/demo/ai/sound", data=payload(context=json.dumps(context)),
                         files={"audio": ("test.wav", wav_bytes(synthetic_cry()), "audio/wav")})
    assert response.status_code == 200
    assert response.json()["contextReview"]["provider"] == "gemini"
    assert response.json()["contextReview"]["status"] == "ready"
    assert response.json()["contextReview"]["contextLogCount"] == 1
    assert "private" not in str(demo_model.received)
    assert get_store().list("demoAiUsage")
    assert not any(row.get("demo") for row in get_store().list("infantRecords"))


def test_demo_rejects_no_consent_and_real_profile_ids(baby, demo_model):
    assert baby.post("/v1/demo/ai/journal_reflect", data=payload(aiConsent="false", text="A long day")).status_code == 403
    invalid = json.dumps({"sampleInfantId": "real-profile-id", "recentEvents": []})
    assert baby.post("/v1/demo/ai/journal_reflect", data=payload(context=invalid, text="A long day")).status_code == 422
    assert get_store().list("demoAiUsage") == []


def test_demo_rejects_excess_context_before_model_calls(baby, demo_model):
    events = [{"type": "feeding", "startedAt": datetime.now(timezone.utc).isoformat()}] * 9
    context = json.dumps({"sampleInfantId": "inf_demo4m", "recentEvents": events})
    assert baby.post("/v1/demo/ai/journal_reflect", data=payload(context=context, text="A long day")).status_code == 422
    assert demo_model.received is None


def test_demo_budget_is_shared_across_operations(baby, demo_model):
    for _ in range(6):
        assert baby.post("/v1/demo/ai/journal_reflect", data=payload(text="A long day")).status_code == 200
    limited = baby.post("/v1/demo/ai/voice_log", data=payload(text="Fed 90 ml"))
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "60"


def test_demo_voice_and_journal_operations_are_gemini_backed(baby, demo_model):
    voice = baby.post("/v1/demo/ai/voice_log", data=payload(text="Fed 90 ml formula at 8 pm"))
    assert voice.status_code == 200
    assert voice.json()["provider"] == "gemini:test"
    assert voice.json()["extracted"]["eventType"] == "feeding"
    transcript = baby.post("/v1/demo/ai/journal_transcribe", data=payload(),
                           files={"audio": ("test.wav", wav_bytes(synthetic_cry()), "audio/wav")})
    assert transcript.status_code == 200 and transcript.json()["provider"] == "gemini:test"
    reflection = baby.post("/v1/demo/ai/journal_reflect", data=payload(text="A long day"))
    assert reflection.status_code == 200 and reflection.json()["model"] == "gemini:test"
    assert reflection.json()["reflection"]["medicalAssessment"] is False


def test_demo_fails_explicitly_when_gemini_is_disabled(baby, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "mock")
    response = baby.post("/v1/demo/ai/journal_reflect", data=payload(text="A long day"))
    assert response.status_code == 503
    assert "No simulated result" in response.json()["detail"]


def test_demo_journal_accepts_the_recorders_ninety_second_limit(baby, demo_model):
    audio = wav_bytes(synthetic_cry(seconds=70))
    assert len(audio) > 2_000_000
    transcript = baby.post("/v1/demo/ai/journal_transcribe", data=payload(),
                           files={"audio": ("journal.wav", audio, "audio/wav")})
    assert transcript.status_code == 200
    assert transcript.json()["provider"] == "gemini:test"


def test_demo_support_chat_uses_gemini_and_explicit_context(baby, demo_model):
    body = {"message": "Can we talk for a moment?", "history": [], "journalContext": "A journal I chose to share."}
    response = baby.post("/v1/demo/ai/support_chat", data=payload(text=json.dumps(body)))
    assert response.status_code == 200 and response.json()["provider"] == "gemini:test"
    assert demo_model.received["journalContext"] == body["journalContext"]


def test_demo_urgent_support_remains_available_after_ai_quota(baby, demo_model):
    for _ in range(6):
        baby.post("/v1/demo/ai/journal_reflect", data=payload(text="A long day"))
    response = baby.post("/v1/demo/ai/support_chat", data=payload(text=json.dumps({"message": "I want to hurt myself"})))
    assert response.status_code == 200
    assert response.json()["supportNow"] is True
    assert response.json()["provider"] == "safety-guidance"


def test_quota_consumption_is_atomic_and_does_not_partially_increment():
    store = MemoryStore()
    limits = {"demoAiUsage/minute": 6, "demoAiUsage/day": 60}
    with ThreadPoolExecutor(max_workers=20) as pool:
        accepted = list(pool.map(lambda _: store.consume_limits(limits), range(30)))
    assert sum(accepted) == 6
    assert store.get("demoAiUsage/day")["count"] == 6


def test_reflection_schema_keeps_boolean_safety_flags_server_owned(monkeypatch):
    from crysense.ai.gemini_provider import GeminiProvider

    provider = object.__new__(GeminiProvider)

    def structured(system, prompt, schema):
        assert "medicalAssessment" not in schema.model_fields
        assert "requiresUserReview" not in schema.model_fields
        return schema(summary="You described support from your family.", selfReportedTopics=["support"], followUpQuestion=None)

    monkeypatch.setattr(provider, "_structured", structured)
    result = provider.reflect("My family helped today.")
    assert result.medicalAssessment is False and result.requiresUserReview is True