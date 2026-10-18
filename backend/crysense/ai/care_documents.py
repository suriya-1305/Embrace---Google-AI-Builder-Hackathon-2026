from __future__ import annotations

from datetime import date
from math import isfinite

from fastapi import HTTPException

from .schemas import CareDocumentContent
from ..safety.engine import load_json


def review_care_document(image: bytes, mime_type: str, purpose: str, provider_factory) -> dict:
    valid = (mime_type == "image/jpeg" and image.startswith(b"\xff\xd8\xff")
             or mime_type == "image/png" and image.startswith(b"\x89PNG\r\n\x1a\n")
             or mime_type == "image/webp" and image.startswith(b"RIFF") and image[8:12] == b"WEBP")
    if not valid or not image or len(image) > 4_000_000 or purpose not in {"vaccination", "visit"}:
        raise HTTPException(status_code=422, detail="Use a clear JPEG, PNG or WebP photo smaller than 4 MB.")
    schedule = load_json("content/vaccines_IN_v1.json")["doses"]
    allowed = {dose["id"] for dose in schedule}
    provider = provider_factory()
    extracted = CareDocumentContent.model_validate(provider.review_care_document(image, mime_type, purpose, [{"id": dose["id"], "name": dose["name"]} for dose in schedule]))
    warnings = []

    def checked_date(value):
        if not value:
            return None
        try:
            parsed = date.fromisoformat(value)
            return parsed.isoformat() if parsed <= date.today() else None
        except ValueError:
            return None

    vaccinations = []
    seen = set()
    for item in extracted.vaccinations:
        given_on = checked_date(item.givenOn)
        if item.vaccineId in allowed and given_on and item.vaccineId not in seen:
            vaccinations.append({"vaccineId": item.vaccineId, "givenOn": given_on})
            seen.add(item.vaccineId)
        else:
            warnings.append("An uncertain vaccine entry or date was left out. Check it against the original card.")
    measurements = {}
    for field, lower, upper in (("weightKg", 0.5, 30), ("lengthCm", 30, 120), ("headCm", 20, 60)):
        value = getattr(extracted, field)
        measurements[field] = value if value is not None and isfinite(value) and lower < value < upper else None
        if value is not None and measurements[field] is None:
            warnings.append("An out-of-range measurement was omitted. Check the value and unit manually.")
    return {"measurementDate": checked_date(extracted.measurementDate), **measurements, "vaccinations": vaccinations,
            "warnings": list(dict.fromkeys(warnings)), "provider": getattr(provider, "name", "ai"), "requiresReview": True, "imageRetained": False}