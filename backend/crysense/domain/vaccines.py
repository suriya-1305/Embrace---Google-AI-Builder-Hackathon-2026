"""Vaccine schedule merged with given doses. Status is arithmetic on dates only."""
from __future__ import annotations

from datetime import date, timedelta


def schedule_status(schedule: dict, birth: date, given: dict[str, dict], today: date) -> list[dict]:
    rows = []
    for dose in schedule["doses"]:
        due = birth + timedelta(weeks=dose["atWeeks"])
        record = given.get(dose["id"])
        if record:
            status = "given"
        elif due <= today:
            status = "due_now"
        else:
            status = "upcoming"
        rows.append({**dose, "dueDate": due.isoformat(), "status": status, "givenOn": record["givenOn"] if record else None})
    rows.sort(key=lambda r: (r["dueDate"], r["id"]))
    return rows
