"""Seven-day observed baseline. Describes what was logged; it is not a medical
norm. Days with no logs are reported as missing and excluded from averages."""
from __future__ import annotations

from datetime import datetime, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from .timeutil import parse_iso, sort_key


def compute_baseline(events: list[dict], now: datetime, tz: str, days: int = 7) -> dict:
    zone = ZoneInfo(tz)
    now = now.astimezone(zone)
    end_date = now.date()
    start_date = end_date - timedelta(days=days - 1)
    per_day: dict = {
        start_date + timedelta(days=i): {"date": (start_date + timedelta(days=i)).isoformat(), "feeds": 0, "sleepMin": 0, "wet": 0, "dirty": 0, "events": 0}
        for i in range(days)
    }
    feed_times: list[datetime] = []
    for ev in sorted(events, key=sort_key):
        start = parse_iso(ev["startedAt"]).astimezone(zone)
        bucket = per_day.get(start.date())
        if bucket is None:
            continue
        bucket["events"] += 1
        if ev["type"] == "feeding":
            bucket["feeds"] += 1
            feed_times.append(start)
        elif ev["type"] == "sleep":
            bucket["sleepMin"] += int((ev.get("details") or {}).get("durationMin") or 0)
        elif ev["type"] == "diaper":
            kind = (ev.get("details") or {}).get("kind")
            bucket["wet"] += kind in ("wet", "both")
            bucket["dirty"] += kind in ("dirty", "both")

    day_rows = []
    for row in per_day.values():
        row = dict(row)
        row["hasData"] = row["events"] > 0
        day_rows.append(row)
    logged = [r for r in day_rows if r["hasData"]]
    # Today is partial, so averages use complete logged days when available.
    complete = [r for r in logged if r["date"] != end_date.isoformat()] or logged

    def avg(key: str) -> float | None:
        return round(sum(r[key] for r in complete) / len(complete), 1) if complete else None

    gaps = [(b - a).total_seconds() / 60 for a, b in zip(feed_times, feed_times[1:]) if 0 < (b - a).total_seconds() < 8 * 3600]
    return {
        "windowStart": start_date.isoformat(),
        "windowEnd": end_date.isoformat(),
        "days": day_rows,
        "coverage": {"daysWithData": len(logged), "totalDays": days, "percent": round(100 * len(logged) / days)},
        "metrics": {
            "feedsPerDay": avg("feeds"),
            "sleepHoursPerDay": round(avg("sleepMin") / 60, 1) if avg("sleepMin") is not None else None,
            "wetDiapersPerDay": avg("wet"),
            "dirtyDiapersPerDay": avg("dirty"),
            "typicalFeedGapMin": int(median(gaps)) if gaps else None,
            "averagedOverDays": len(complete),
        },
        "note": "This describes what was logged. It is not a medical norm, and missing days are not counted as zero.",
    }
