"""Request authentication and record-level authorisation.

AUTH_MODE=mock     -> bearer token "mock-<uid>" (demo only, never in production)
AUTH_MODE=firebase -> Firebase ID token verified with the Admin SDK
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException

from .config import get_settings
from .store import get_store


@dataclass(frozen=True)
class Principal:
    uid: str


def get_principal(authorization: str | None = Header(default=None)) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    token = authorization.split(" ", 1)[1].strip()
    settings = get_settings()

    if settings.auth_mode == "mock":
        if not token.startswith("mock-") or len(token) <= 5:
            raise HTTPException(status_code=401, detail="This demo token is not valid.")
        return Principal(uid=token[5:])

    try:  # Firebase Authentication
        import firebase_admin
        from firebase_admin import auth as fb_auth

        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        decoded = fb_auth.verify_id_token(token, check_revoked=True)
        return Principal(uid=decoded["uid"])
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - never leak verification details
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.") from exc


def require_infant_access(infant_id: str, principal: Principal = Depends(get_principal)) -> dict:
    """Caregivers in the infant's household may read and write infant records."""
    infant = get_store().get(f"infantRecords/{infant_id}")
    if infant is None or principal.uid not in infant.get("caregiverUids", []):
        # Same response for "missing" and "not yours" so ids can't be probed.
        raise HTTPException(status_code=404, detail="Baby profile not found.")
    return infant


def require_mother_owner(mother_id: str, principal: Principal = Depends(get_principal)) -> dict:
    """Only the mother herself can open maternal records. Household membership is not enough."""
    mother = get_store().get(f"maternalRecords/{mother_id}")
    if mother is None or mother.get("ownerUid") != principal.uid:
        raise HTTPException(status_code=403, detail="This space is private to its owner.")
    return mother
