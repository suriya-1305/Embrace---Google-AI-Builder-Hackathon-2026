import numpy as np
from datetime import datetime, timedelta, timezone

from crysense.audio.validate import validate_wav
from crysense.store import get_store

from .conftest import MEERA, synthetic_cry, wav_bytes


def codes(q):
    return {i["code"] for i in q["issues"]}


def test_clear_cry_passes_quality():
    q, _, _ = validate_wav(wav_bytes(synthetic_cry()))
    assert q["ok"] and "background_noise" not in codes(q)


def test_silence_short_clipping_and_noise():
    assert "silent" in codes(validate_wav(wav_bytes(np.zeros(16000 * 5)))[0])
    assert "too_short" in codes(validate_wav(wav_bytes(synthetic_cry(1.0)))[0])
    assert "clipping" in codes(validate_wav(wav_bytes(np.clip(synthetic_cry(amp=2.0), -1, 1)))[0])
    noisy = validate_wav(wav_bytes(synthetic_cry(amp=0.2, noise=0.08)))[0]
    assert "background_noise" in codes(noisy)


def test_invalid_file_is_reported_not_crashed():
    q, samples, _ = validate_wav(b"not a wav")
    assert not q["ok"] and samples is None and "unsupported_format" in codes(q)


def test_cry_endpoint_never_returns_a_cause(baby):
    r = baby.post("/v1/infants/inf_anya/cry-analysis", headers=MEERA, files={"audio": ("c.wav", wav_bytes(synthetic_cry()), "audio/wav")})
    body = r.json()
    assert r.status_code == 200 and body["presence"] == "detected" and body["rawAudioRetained"] is False
    assert not ({"hunger", "gas", "pain", "cause"} & set(body))
    bad = baby.post("/v1/infants/inf_anya/cry-analysis", headers=MEERA, files={"audio": ("s.wav", wav_bytes(np.zeros(8000)), "audio/wav")}).json()
    assert bad["presence"] == "uncertain" and bad["retry"] is True


def test_gemini_receives_audio_and_only_eight_minimized_recent_logs(baby, monkeypatch):
    import baby_api.main as baby_module

    received = {}
    audio = wav_bytes(synthetic_cry())

    class FakeGemini:
        name = "gemini:test"

        def review_baby_sound(self, data, context):
            received.update(audio=data, context=context)
            return {"sound": "crying", "pitch": "varied", "pattern": "intermittent", "careChecks": ["feeding", "burping"]}

    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setattr(baby_module, "get_ai", lambda: FakeGemini())
    now = datetime.now(timezone.utc)
    for offset in range(1, 13):
        get_store().set(f"infantRecords/inf_anya/events/context_{offset}", {
            "type": "feeding", "startedAt": (now - timedelta(minutes=offset)).isoformat(),
            "details": {"method": "breast", "privateExtra": "never send"}, "note": "private note", "createdBy": "private user",
        })
    get_store().set("infantRecords/other/events/private", {"type": "diaper", "startedAt": now.isoformat(), "note": "other baby"})

    response = baby.post("/v1/infants/inf_anya/cry-analysis", headers=MEERA, files={"audio": ("sound.wav", audio, "audio/wav")})

    assert response.status_code == 200
    review = response.json()["contextReview"]
    assert review["status"] == "ready" and review["provider"] == "gemini"
    assert response.json()["modelVersion"] == "gemini:test"
    assert review["contextLogCount"] == 8
    assert received["audio"] == audio
    assert len(received["context"]["recentEvents"]) == 8
    assert "private" not in str(received["context"])
    assert "other baby" not in str(received["context"])
    assert "cause" not in review and "diagnosis" not in review
    assert review["suggestions"][0]["category"] == "feeding"
    assert response.json()["rawAudioRetained"] is False


def test_poor_audio_is_not_sent_to_gemini(baby, monkeypatch):
    import baby_api.main as baby_module

    calls = []
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setattr(baby_module, "get_ai", lambda: calls.append("called"))
    for audio in (wav_bytes(np.zeros(16000 * 5)), wav_bytes(synthetic_cry(amp=0.2, noise=0.08))):
        response = baby.post("/v1/infants/inf_anya/cry-analysis", headers=MEERA,
                             files={"audio": ("unclear.wav", audio, "audio/wav")})
        assert response.status_code == 200
        assert response.json()["contextReview"]["status"] == "not_run"
        assert response.json()["retry"] is True
    assert calls == []


def test_audio_context_requires_ai_consent(baby):
    baby.put("/v1/infants/inf_anya/consents/ai_processing", headers=MEERA, json={"granted": False})
    response = baby.post("/v1/infants/inf_anya/cry-analysis", headers=MEERA,
                         files={"audio": ("sound.wav", wav_bytes(synthetic_cry()), "audio/wav")})

    assert response.status_code == 403
    assert "ai_processing" in response.json()["detail"]["purposes"]


def test_gemini_failure_does_not_return_fake_sound_results(baby, monkeypatch):
    import baby_api.main as baby_module

    class UnavailableGemini:
        def review_baby_sound(self, data, context):
            raise RuntimeError("unavailable")

    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setattr(baby_module, "get_ai", lambda: UnavailableGemini())
    response = baby.post("/v1/infants/inf_anya/cry-analysis", headers=MEERA,
                         files={"audio": ("sound.wav", wav_bytes(synthetic_cry()), "audio/wav")})

    assert response.status_code == 200
    assert response.json()["presence"] == "uncertain"
    assert response.json()["contextReview"]["status"] == "unavailable"
    assert response.json()["contextReview"]["suggestions"] == []


def test_listening_segments_are_bounded_and_not_cause_classifications(baby, monkeypatch):
    import baby_api.main as baby_module

    class ListeningModel:
        name = "gemini:test"

        def review_baby_sound(self, data, context):
            segment = {"sound": "crying", "pitch": "varied", "pattern": "intermittent", "tone": "nasal"}
            return {"sound": "crying", "pitch": "varied", "pattern": "intermittent", "careChecks": ["feeding"],
                    "audibleFeatures": ["repeated_bursts", "nasal_tone"],
                    "segments": [{**segment, "startSec": 0, "endSec": 2}, {**segment, "startSec": 1, "endSec": 3}, {**segment, "startSec": 8, "endSec": 15}]}

    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setattr(baby_module, "get_ai", ListeningModel)
    response = baby.post("/v1/infants/inf_anya/cry-analysis", headers=MEERA,
                         files={"audio": ("six-seconds.wav", wav_bytes(synthetic_cry()), "audio/wav")})
    review = response.json()["contextReview"]
    assert len(review["listeningSegments"]) == 1
    assert review["audibleFeatures"] == ["repeated_bursts", "nasal_tone"]
    assert "not why" in review["explanation"]
    assert "cannot be confirmed or excluded" in review["cannotRuleOut"]
