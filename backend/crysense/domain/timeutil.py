from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo


def now_in(tz: str) -> datetime:
    return datetime.now(ZoneInfo(tz)).replace(second=0, microsecond=0)


def parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        raise ValueError("Timestamps must include a timezone offset.")
    return dt


def sort_key(doc: dict, field: str = "startedAt") -> tuple[str, str]:
    """Deterministic ordering: time first, id as tiebreaker."""
    return (doc.get(field) or doc.get("createdAt") or "", doc.get("id", ""))
