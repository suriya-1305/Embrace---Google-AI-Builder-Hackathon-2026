"""Helpers shared by both services: app factory, ids, consent checks, audit trail."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .logging_utils import install_request_logging
from .safety.engine import support_content
from .store import get_store, reset_store

PURPOSES = ("audio_capture", "transcription", "ai_processing", "storage", "sharing", "research")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def create_app(title: str, service: str) -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=title, version="0.1.0", description="CrySense prototype API. Not a medical device.")
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])
    install_request_logging(app, service)

    @app.get("/health", tags=["system"])
    def healthz() -> dict:
        s = get_settings()
        return {"ok": True, "service": service, "dataStore": s.data_store, "aiProvider": s.ai_provider,
                "speechProvider": s.speech_provider, "cryModel": s.cry_model, "authMode": s.auth_mode}

    @app.get("/v1/support", tags=["support"])
    def support(region: str = "IN") -> dict:
        """Public on purpose: help must be reachable without signing in."""
        return support_content(region.upper())

    @app.post("/v1/dev/reset", tags=["system"])
    def dev_reset() -> dict:
        if get_settings().data_store != "memory":
            raise HTTPException(status_code=404, detail="Not available.")
        reset_store()
        get_store()
        return {"ok": True, "message": "Demo data restored."}

    return app


def consent_state(subject_id: str) -> dict[str, dict]:
    store = get_store()
    return {p: (store.get(f"consentRecords/{subject_id}_{p}") or {"purpose": p, "granted": False}) for p in PURPOSES}


def require_consent(subject_id: str, *purposes: str) -> None:
    state = consent_state(subject_id)
    missing = [p for p in purposes if not state[p].get("granted")]
    if missing:
        label = ", ".join(m.replace("_", " ") for m in missing)
        raise HTTPException(status_code=403, detail={"code": "consent_required", "purposes": missing,
                                                     "message": f"Turn on {label} in Settings to use this."})


def set_consent(subject_type: str, subject_id: str, purpose: str, granted: bool, retention: str | None, actor: str, now: datetime) -> dict:
    if purpose not in PURPOSES:
        raise HTTPException(status_code=404, detail="Unknown consent purpose.")
    store = get_store()
    path = f"consentRecords/{subject_id}_{purpose}"
    current = store.get(path) or {}
    doc = {
        "subjectType": subject_type, "subjectId": subject_id, "purpose": purpose, "granted": granted,
        "grantedAt": now.isoformat() if granted else current.get("grantedAt"),
        "revokedAt": None if granted else now.isoformat(),
        "retentionPreference": retention or current.get("retentionPreference", "until_deleted"),
        "updatedBy": actor,
    }
    store.set(path, doc)
    audit(actor, "consent.updated", subject_id, {"purpose": purpose, "granted": granted}, now)
    return store.get(path)


def audit(actor: str, action: str, subject_id: str, meta: dict, now: datetime) -> None:
    """Audit events record who did what, never sensitive content."""
    get_store().set(f"auditEvents/{new_id('aud')}", {"actor": actor, "action": action, "subjectId": subject_id, "meta": meta, "at": now.isoformat()})
