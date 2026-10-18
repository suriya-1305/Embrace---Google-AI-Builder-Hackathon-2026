"""Pattern question cards: plain observations from the logs, phrased as
questions. Never predictions, never health judgements."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from .timeutil import parse_iso, sort_key


def observations(events: list[dict], now: datetime) -> list[dict]:
    week = [e for e in sorted(events, key=sort_key) if parse_iso(e["startedAt"]) >= now - timedelta(days=7)]
    cards: list[dict] = []
    sleeps = [e for e in week if e["type"] == "sleep" and (e.get("details") or {}).get("durationMin")]
    if sleeps:
        best = max(sleeps, key=lambda e: (e["details"]["durationMin"], e["id"]))
        m = best["details"]["durationMin"]
        day = parse_iso(best["startedAt"]).astimezone(now.tzinfo).strftime("%A")
        cards.append({"id": "longest_sleep", "text": f"Longest sleep logged this week: {m // 60} h {m % 60} min, on {day}.",
                      "question": "Was anything different that day?"})
    evening: dict = defaultdict(int)
    days_with_logs = set()
    for e in week:
        local = parse_iso(e["startedAt"]).astimezone(now.tzinfo)
        days_with_logs.add(local.date())
        if e["type"] == "feeding" and 18 <= local.hour < 22:
            evening[local.date()] += 1
    busy = sum(1 for v in evening.values() if v >= 2)
    if busy >= 3:
        cards.append({"id": "busy_evenings", "text": f"On {busy} of the last {len(days_with_logs)} logged days there were 2 or more feeds between 6 and 10 pm.",
                      "question": "Do evenings feel busier to you too?"})
    missing = [(now - timedelta(days=i)).date() for i in range(1, 7) if (now - timedelta(days=i)).date() not in days_with_logs]
    if missing:
        cards.append({"id": "gaps", "text": f"No logs on {missing[0].strftime('%A')}. Gaps are shown as gaps, never as zero.",
                      "question": "Want to add anything you remember from that day?"})
    return cards
