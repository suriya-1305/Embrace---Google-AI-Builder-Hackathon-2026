"""Request models. extra="forbid" everywhere: unknown fields (for example an
attempt to change a medication dose) are rejected, not ignored."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BabySetupIn(Strict):
    name: str = Field(min_length=1, max_length=60)
    birthDate: date
    caregiverName: str = Field(min_length=1, max_length=80)
    caregiverRole: Literal["mother", "caregiver"] = "mother"


class BabySetupItem(Strict):
    name: str = Field(min_length=1, max_length=60)
    birthDate: date


class FamilyBabySetupIn(Strict):
    babies: list[BabySetupItem] = Field(min_length=1, max_length=6)
    caregiverName: str = Field(min_length=1, max_length=80)
    caregiverRole: Literal["mother", "caregiver"] = "mother"


class MotherSetupIn(Strict):
    name: str = Field(min_length=1, max_length=80)
    deliveryDate: date | None = None
    deliveryType: str | None = Field(None, max_length=40)


class Provenance(Strict):
    userStated: list[str] = Field(default_factory=list)
    modelInferred: list[str] = Field(default_factory=list)


class EventIn(Strict):
    type: Literal["feeding", "sleep", "diaper"]
    startedAt: str
    endedAt: str | None = None
    details: dict = Field(default_factory=dict)
    note: str | None = Field(None, max_length=500)
    source: Literal["manual", "voice"] = "manual"
    provenance: Provenance | None = None
    clientRequestId: str | None = Field(None, pattern=r"^[0-9a-f-]{36}$")


class EventPatch(Strict):
    startedAt: str | None = None
    endedAt: str | None = None
    details: dict | None = None
    note: str | None = Field(None, max_length=500)


class BabyWarningAnswers(Strict):
    breathingDifficulty: bool = False
    blueOrGreyColour: bool = False
    floppyOrHardToWake: bool = False
    seizure: bool = False
    weakOrHighPitchedCry: bool = False
    greenOrBloodyVomit: bool = False
    bloodInStool: bool = False
    swollenAbdomen: bool = False
    recentFallOrInjury: bool = False
    possibleIngestion: bool = False
    poorFeeding: bool = False
    fewerWetDiapers: bool = False
    parentThinksSeriouslyWrong: bool = False
    tempC: float | None = Field(None, ge=30, le=45)


class MotherWarningAnswers(Strict):
    heavyBleeding: bool = False
    chestPainOrBreathless: bool = False
    severeHeadacheOrVision: bool = False
    calfPainSwelling: bool = False
    woundRedOrDischarge: bool = False
    breastRedHotWithFever: bool = False
    thoughtsOfHarm: bool = False
    tempC: float | None = Field(None, ge=30, le=45)


class CheckInIn(Strict):
    mood: int | None = Field(None, ge=1, le=5)
    energy: int | None = Field(None, ge=1, le=5)
    rest: int | None = Field(None, ge=1, le=5)
    pain: int | None = Field(None, ge=0, le=10)
    support: int | None = Field(None, ge=1, le=5)
    skipped: list[Literal["mood", "energy", "rest", "pain", "support"]] = Field(default_factory=list)
    note: str | None = Field(None, max_length=1000)


class TextIn(Strict):
    transcript: str = Field(min_length=1, max_length=6000)


class ReflectionIn(Strict):
    summary: str
    selfReportedTopics: list[str]
    followUpQuestion: str | None = None
    medicalAssessment: Literal[False] = False
    requiresUserReview: Literal[True] = True


class JournalIn(Strict):
    transcript: str = Field(min_length=1, max_length=6000)
    reflection: ReflectionIn | None = None
    reviewedByUser: Literal[True]


class RecoveryIn(Strict):
    symptom: Literal["bleeding", "incision_pain", "perineal_pain", "breast_pain", "headache", "swelling", "fever", "tiredness", "other"]
    severity: int = Field(ge=0, le=10)
    trend: Literal["better", "same", "worse"]
    onset: str
    note: str | None = Field(None, max_length=500)


class MedicationIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    dose: str = Field(min_length=1, max_length=120, description="Exactly as written by the clinician")
    times: list[str] = Field(min_length=1, max_length=8)
    startDate: str
    endDate: str | None = None
    instructionsSource: Literal["clinician"]
    note: str | None = Field(None, max_length=300)

    @field_validator("times")
    @classmethod
    def _times(cls, v: list[str]) -> list[str]:
        import re

        bad = [t for t in v if not re.match(TIME_RE, t)]
        if bad:
            raise ValueError("Times must be HH:MM (24-hour).")
        return sorted(set(v))


class MedicationEventIn(Strict):
    scheduledFor: str
    status: Literal["taken", "skipped", "rescheduled"]
    rescheduledTo: str | None = None


class ScreeningIn(Strict):
    instrumentId: str
    answers: dict[str, int | None]


class CareSummaryIn(Strict):
    recipientName: str = Field(min_length=1, max_length=80)
    recipientRole: Literal["doctor", "midwife", "partner", "family", "other"]
    fields: list[Literal["checkins", "recovery", "medications", "journal_reflections", "screening"]] = Field(min_length=1)
    periodDays: int = Field(7, ge=1, le=30)


class ConsentIn(Strict):
    granted: bool
    retentionPreference: Literal["ephemeral", "30d", "until_deleted"] | None = None
