"""Non-diagnostic "what to check next" prompts, built from the timeline only.
Ordered deterministically. Never claims a cause."""
from __future__ import annotations

from datetime import datetime

from .timeutil import parse_iso, sort_key


def _last(events: list[dict], etype: str) -> dict | None:
    items = [e for e in events if e["type"] == etype]
    return sorted(items, key=sort_key)[-1] if items else None


def suggest_checks(events: list[dict], now: datetime) -> dict:
    checks: list[dict] = []
    feed = _last(events, "feeding")
    if feed:
        mins = int((now - parse_iso(feed["startedAt"])).total_seconds() // 60)
        checks.append({"id": "feeding_cues", "minutesSince": mins, "priority": 1 if mins >= 150 else 3,
                       "text": f"Last feed was {mins // 60} h {mins % 60} min ago. Look for feeding cues like rooting or hands to mouth."})
    diaper = _last(events, "diaper")
    if diaper:
        mins = int((now - parse_iso(diaper["startedAt"])).total_seconds() // 60)
        checks.append({"id": "diaper", "minutesSince": mins, "priority": 2 if mins >= 120 else 4,
                       "text": f"Last diaper change was {mins // 60} h {mins % 60} min ago. Check the diaper."})
    sleep = _last(events, "sleep")
    if sleep and sleep.get("endedAt"):
        awake = int((now - parse_iso(sleep["endedAt"])).total_seconds() // 60)
        checks.append({"id": "tiredness", "minutesSince": awake, "priority": 2 if awake >= 90 else 5,
                       "text": f"Awake for about {awake // 60} h {awake % 60} min. Try a calm, dim, quiet space."})
    checks.append({"id": "comfort", "minutesSince": None, "priority": 6,
                   "text": "Check clothing, temperature and anything that might be uncomfortable."})
    checks.sort(key=lambda c: (c["priority"], c["id"]))
    return {
        "checks": checks[:3],
        "guidance": "Try one thing at a time. If nothing helps and you are worried, get advice. Your judgement comes first.",
        "isDiagnosis": False,
    }
