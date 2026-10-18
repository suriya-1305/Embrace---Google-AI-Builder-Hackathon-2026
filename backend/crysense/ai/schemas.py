"""Strict structured-output schemas. Gemini fills these; application code then
validates values. Schema validity is not truth."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ExtractedEvent(BaseModel):
    eventType: Literal["feeding", "sleep", "diaper", "unknown"]
    feedMethod: Literal["breast", "bottle", "formula", "expressed"] | None = None
    amountMl: float | None = None
    side: Literal["left", "right", "both"] | None = None
    diaperKind: Literal["wet", "dirty", "both", "dry"] | None = None
    startTimeLocal: str | None = Field(None, description="HH:MM 24-hour local time if the user stated one")
    durationMin: int | None = None
    userStatedFields: list[str] = Field(default_factory=list)
    missingFields: list[str] = Field(default_factory=list)


class JournalReflectionContent(BaseModel):
    summary: str = Field(description="1-2 sentences restating only what the mother said, in second person")
    selfReportedTopics: list[Literal["sleep", "physical_recovery", "feeding", "mood", "support", "baby_care", "other"]]
    followUpQuestion: str | None = None


class JournalReflection(JournalReflectionContent):
    medicalAssessment: Literal[False] = False
    requiresUserReview: Literal[True] = True


class SoundListeningSegment(BaseModel):
    startSec: float
    endSec: float
    sound: Literal["crying", "babbling", "other_sound", "uncertain"]
    pitch: Literal["high", "mid", "low", "varied", "uncertain"]
    pattern: Literal["intermittent", "continuous", "none", "uncertain"]
    tone: Literal["nasal", "breathy", "strained", "clear", "mixed", "uncertain"] = "uncertain"


class BabySoundObservation(BaseModel):
    sound: Literal["crying", "babbling", "other_sound", "uncertain"]
    pitch: Literal["high", "mid", "low", "varied", "uncertain"]
    pattern: Literal["intermittent", "continuous", "none", "uncertain"]
    careChecks: list[Literal["feeding", "diaper", "burping", "rest", "comfort"]] = Field(default_factory=list, max_length=3)
    audibleFeatures: list[Literal["repeated_bursts", "rising_loudness", "falling_loudness", "variable_pitch", "nasal_tone", "breathy_tone", "pauses", "background_voice", "uncertain"]] = Field(default_factory=list, max_length=4)
    segments: list[SoundListeningSegment] = Field(default_factory=list, max_length=3)


class SupportChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=1000)


class SupportChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[SupportChatMessage] = Field(default_factory=list, max_length=6)
    journalContext: str = Field(default="", max_length=3000)


class SupportChatContent(BaseModel):
    reply: str = Field(min_length=1, max_length=1000)
    safetyConcern: Literal["none", "human_support_now"] = "none"


class ExtractedVaccination(BaseModel):
    vaccineId: str = Field(min_length=1, max_length=40)
    givenOn: str | None = None


class CareDocumentContent(BaseModel):
    measurementDate: str | None = None
    weightKg: float | None = None
    lengthCm: float | None = None
    headCm: float | None = None
    vaccinations: list[ExtractedVaccination] = Field(default_factory=list, max_length=30)
