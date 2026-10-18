"""Google Cloud Speech-to-Text V2 (SPEECH_PROVIDER=google_stt).
Uses the default "_" recognizer with auto-detected decoding."""
from __future__ import annotations

from ..config import Settings


def transcribe_google(audio: bytes, settings: Settings, language: str | None = None) -> str:
    from google.cloud.speech_v2 import SpeechClient
    from google.cloud.speech_v2.types import cloud_speech

    client = SpeechClient()
    config = cloud_speech.RecognitionConfig(
        auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
        language_codes=[language or settings.stt_language],
        model="long",
    )
    request = cloud_speech.RecognizeRequest(
        recognizer=f"projects/{settings.gcp_project}/locations/global/recognizers/_",
        config=config,
        content=audio,
    )
    response = client.recognize(request=request)
    return " ".join(r.alternatives[0].transcript for r in response.results if r.alternatives).strip()
