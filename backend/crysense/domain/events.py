"""Deterministic validation for baby events. Gemini may propose values;
this code decides what is allowed to be saved."""
from __future__ import annotations

from datetime import datetime, timedelta

from .timeutil import parse_iso

EVENT_TYPES = {"feeding", "sleep", "diaper"}
FEED_METHODS = {"breast", "bottle", "formula", "expressed"}
DIAPER_KINDS = {"wet", "dirty", "both", "dry"}
MAX_FEED_ML = 400
MAX_SLEEP_MIN = 16 * 60


def validate_event(event: dict, now: datetime) -> list[str]:
    errors: list[str] = []
    etype = event.get("type")
    if etype not in EVENT_TYPES:
        return ["Choose feeding, sleep or diaper."]
    try:
        started = parse_iso(event["startedAt"])
    except (KeyError, ValueError):
        return ["Add a valid start time, including timezone."]
    if started > now + timedelta(minutes=5):
        errors.append("The time is in the future. Check the time and try again.")

    details = event.get("details") or {}
    if etype == "feeding":
        method = details.get("method")
        if method is not None and method not in FEED_METHODS:
            errors.append("Feeding method must be breast, bottle, formula or expressed milk.")
        amount = details.get("amountMl")
        if amount is not None and not (0 < float(amount) <= MAX_FEED_ML):
            errors.append(f"Amount must be between 1 and {MAX_FEED_ML} ml.")
    elif etype == "sleep":
        ended = event.get("endedAt")
        if ended:
            try:
                end = parse_iso(ended)
            except ValueError:
                return errors + ["Add a valid end time."]
            minutes = (end - started).total_seconds() / 60
            if minutes <= 0:
                errors.append("Sleep must end after it starts.")
            elif minutes > MAX_SLEEP_MIN:
                errors.append("A single sleep longer than 16 hours looks like a typo. Check the times.")
            elif end > now + timedelta(minutes=5):
                errors.append("The end time is in the future.")
    elif etype == "diaper":
        if details.get("kind") not in DIAPER_KINDS:
            errors.append("Choose wet, dirty, both or dry.")
    return errors


def normalise_event(event: dict) -> dict:
    """Derive computed fields so stored documents are consistent."""
    out = dict(event)
    if out.get("type") == "sleep" and out.get("endedAt"):
        start, end = parse_iso(out["startedAt"]), parse_iso(out["endedAt"])
        out["details"] = {**(out.get("details") or {}), "durationMin": int((end - start).total_seconds() // 60)}
    return out
