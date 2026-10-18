"""Runtime configuration. Every Google integration is behind a toggle so the
whole stack runs locally with mocks and switches to Google services by env var.

# ---- TOGGLES (set in .env or Cloud Run) ----------------------------------
# DATA_STORE      memory | firestore
# AI_PROVIDER     mock   | gemini
# SPEECH_PROVIDER mock   | google_stt | gemini
# CRY_MODEL       mock   | yamnet
# AUTH_MODE       mock   | firebase
# --------------------------------------------------------------------------
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _flag(name: str, default: str) -> str:
    return os.getenv(name, default).strip().lower()


@dataclass(frozen=True)
class Settings:
    data_store: str
    ai_provider: str
    speech_provider: str
    cry_model: str
    auth_mode: str
    gemini_model: str
    gemini_use_vertex: bool
    gcp_project: str | None
    gcp_location: str
    stt_language: str
    cors_origins: tuple[str, ...]
    shared_dir: Path
    default_timezone: str


def get_settings() -> Settings:
    """Read settings fresh from the environment (cheap; keeps tests simple)."""
    default_shared = Path(__file__).resolve().parents[2] / "shared"
    return Settings(
        data_store=_flag("DATA_STORE", "memory"),
        ai_provider=_flag("AI_PROVIDER", "mock"),
        speech_provider=_flag("SPEECH_PROVIDER", "mock"),
        cry_model=_flag("CRY_MODEL", "mock"),
        auth_mode=_flag("AUTH_MODE", "mock"),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash"),
        gemini_use_vertex=_flag("GEMINI_USE_VERTEX", "false") == "true",
        gcp_project=os.getenv("GOOGLE_CLOUD_PROJECT"),
        gcp_location=os.getenv("GOOGLE_CLOUD_LOCATION", "asia-south1"),
        stt_language=os.getenv("STT_LANGUAGE", "en-IN"),
        cors_origins=tuple(
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").replace(";", ",").split(",")
            if origin.strip()
        ),
        shared_dir=Path(os.getenv("SHARED_DIR", str(default_shared))),
        default_timezone=os.getenv("DEFAULT_TIMEZONE", "Asia/Kolkata"),
    )
