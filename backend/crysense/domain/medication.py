"""Medication schedule logic. Schedules come only from the mother's entry of
clinician-provided instructions. Nothing here (or in the AI layer) can change
a dose or a time."""
from __future__ import annotations

from datetime import date

STATUSES = {"taken", "skipped", "rescheduled"}


def is_active(schedule: dict, day: date) -> bool:
    start = date.fromisoformat(schedule["startDate"])
    end = date.fromisoformat(schedule["endDate"]) if schedule.get("endDate") else None
    return start <= day and (end is None or day <= end)


def doses_for_day(schedules: list[dict], events: list[dict], day: date) -> list[dict]:
    by_slot = {(e["scheduleId"], e["scheduledFor"]): e for e in sorted(events, key=lambda e: (e.get("at") or "", e["id"]))}
    doses = []
    for sch in sorted(schedules, key=lambda s: (s["name"], s["id"])):
        if not is_active(sch, day):
            continue
        for t in sorted(sch["times"]):
            slot = f"{day.isoformat()}T{t}"
            ev = by_slot.get((sch["id"], slot))
            doses.append({
                "scheduleId": sch["id"], "name": sch["name"], "dose": sch["dose"], "scheduledFor": slot,
                "status": ev["status"] if ev else "due", "rescheduledTo": ev.get("rescheduledTo") if ev else None,
            })
    doses.sort(key=lambda d: (d["scheduledFor"], d["name"]))
    return doses
