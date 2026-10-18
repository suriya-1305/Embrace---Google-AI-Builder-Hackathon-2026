"""Speech-to-text. SPEECH_PROVIDER=mock | google_stt | gemini."""
from __future__ import annotations

from ..config import get_settings

MOCK_TRANSCRIPTS = {
    "voice_log": "Fed 90 ml formula at 8 pm",
    "journal": "Today felt long. I slept maybe three hours and my stitches ache when I stand up. My mother came over and held Anya so I could shower, which helped a lot.",
}


LANGUAGES = {"en-IN", "hi-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN", "bn-IN", "mr-IN", "en-US"}


def transcribe(audio: bytes | None, purpose: str, transcript_hint: str | None = None, mime_type: str = "audio/wav", language: str | None = None) -> dict:
    """Returns {"transcript", "provider"}. A typed hint always wins (accessibility + demo).
    language: BCP-47 code; mixed speech such as Tamil-English is common, so the
    Gemini path is told the hint rather than forced to one language."""
    if transcript_hint and transcript_hint.strip():
        return {"transcript": transcript_hint.strip(), "provider": "typed"}
    settings = get_settings()
    lang = language if language in LANGUAGES else settings.stt_language
    if not audio:
        raise ValueError("Add a recording or type your note.")
    if settings.speech_provider == "google_stt":
        from .google_stt import transcribe_google

        return {"transcript": transcribe_google(audio, settings, lang), "provider": "google-stt-v2", "language": lang}
    if settings.speech_provider == "gemini":
        from ..ai import get_ai

        return {"transcript": get_ai().transcribe(audio, mime_type, lang), "provider": "gemini", "language": lang}
    return {"transcript": MOCK_TRANSCRIPTS.get(purpose, ""), "provider": "mock"}
