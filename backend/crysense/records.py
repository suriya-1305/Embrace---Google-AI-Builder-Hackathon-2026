"""Module records: one generic, validated store for the small feature modules
(growth, vaccines, milestones, soothing, visit questions, appointments, wins,
hydration). Each kind has a strict schema; unknown kinds are 404."""
from __future__ import annotations

from typing import Literal
from datetime import date as calendar_date
from uuid import UUID

from fastapi import HTTPException
from pydantic import Field, ValidationError, field_validator, model_validator

from .models import Strict

DATE = r"^\d{4}-\d{2}-\d{2}$"
MILESTONES = Literal["first_smile", "laughs", "holds_head", "rolls_over", "sits", "first_tooth", "crawls", "first_word", "stands", "first_steps", "other"]


class GrowthIn(Strict):
    date: str = Field(pattern=DATE)
    weightKg: float | None = Field(None, gt=0.5, lt=30)
    lengthCm: float | None = Field(None, gt=30, lt=120)
    headCm: float | None = Field(None, gt=20, lt=60)
    note: str | None = Field(None, max_length=200)

    @field_validator("date")
    @classmethod
    def valid_date(cls, value):
        if calendar_date.fromisoformat(value) > calendar_date.today():
            raise ValueError("Use the date the measurement was actually taken.")
        return value


class VaccinationIn(Strict):
    vaccineId: str = Field(min_length=1, max_length=40)
    givenOn: str = Field(pattern=DATE)
    note: str | None = Field(None, max_length=200)

    @field_validator("givenOn")
    @classmethod
    def valid_date(cls, value):
        if calendar_date.fromisoformat(value) > calendar_date.today():
            raise ValueError("An administered vaccine date cannot be in the future.")
        return value


class MilestoneIn(Strict):
    milestone: MILESTONES
    date: str = Field(pattern=DATE)
    note: str | None = Field(None, max_length=500)
    photo: str | None = Field(None, max_length=200_000, description="Small JPEG data URL, resized on the device")


class SootheIn(Strict):
    technique: str = Field(min_length=1, max_length=60)
    helped: bool
    at: str


class VisitQuestionIn(Strict):
    text: str = Field(min_length=1, max_length=300)


class VisitReportIn(Strict):
    clientRequestId: str = Field(min_length=36, max_length=36)
    date: str = Field(pattern=DATE)
    note: str = Field(default="", max_length=1500)
    clinician: str = Field(default="", max_length=100)
    nextVisitOn: str | None = Field(default=None, pattern=DATE)

    @field_validator("clientRequestId")
    @classmethod
    def valid_request_id(cls, value):
        return str(UUID(value))

    @model_validator(mode="after")
    def valid_dates(self):
        visit = calendar_date.fromisoformat(self.date)
        if visit > calendar_date.today():
            raise ValueError("Use the date the visit took place.")
        if self.nextVisitOn and calendar_date.fromisoformat(self.nextVisitOn) < visit:
            raise ValueError("The next appointment must not be before this visit.")
        return self


class AppointmentIn(Strict):
    title: str = Field(min_length=1, max_length=100)
    date: str = Field(pattern=DATE)
    note: str | None = Field(None, max_length=300)
    done: bool = False


class WinIn(Strict):
    text: str = Field(min_length=1, max_length=200)
    date: str = Field(pattern=DATE)


class HydrationIn(Strict):
    date: str = Field(pattern=DATE)
    glasses: int = Field(ge=0, le=20)


INFANT_KINDS = {"growth": GrowthIn, "vaccinations": VaccinationIn, "milestones": MilestoneIn,
                "soothe": SootheIn, "visit_questions": VisitQuestionIn, "visit_reports": VisitReportIn}
MOTHER_KINDS = {"appointments": AppointmentIn, "wins": WinIn, "hydration": HydrationIn}
# Kinds with a natural key are upserted (one doc per key) instead of appended.
UPSERT_KEY = {"hydration": lambda d: d["date"], "vaccinations": lambda d: d["vaccineId"], "visit_reports": lambda d: d["clientRequestId"]}


def parse(kinds: dict, kind: str, body: dict) -> dict:
    if kind not in kinds:
        raise HTTPException(status_code=404, detail="Unknown module.")
    try:
        return kinds[kind].model_validate(body).model_dump()
    except ValidationError as exc:
        errors = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
        raise HTTPException(status_code=422, detail={"code": "invalid_record", "errors": errors, "message": "Check the highlighted values."}) from exc


def sort_records(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda r: (r.get("date") or r.get("at") or r.get("since") or r.get("createdAt") or "", r["id"]))
