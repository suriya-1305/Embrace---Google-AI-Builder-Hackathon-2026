from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.concurrency import run_in_threadpool

from crysense.ai import get_ai
from crysense.ai.care_documents import review_care_document
from crysense.ai.guards import guard_reflection
from crysense.ai.schemas import SupportChatIn
from crysense.ai.support_chat import needs_human_support, support_reply
from crysense.audio.context_review import analyse_sound
from crysense.audio.validate import validate_wav
from crysense.config import get_settings
from crysense.store import get_store

router = APIRouter(prefix="/v1/demo/ai", tags=["demo-ai"])
SAMPLE_AGES = {"inf_demo30": 30, "inf_demo4m": 130, "inf_twin_a": 130, "inf_twin_b": 130, "inf_anya": 42}


class DemoEvent(BaseModel):
    type: Literal["feeding", "sleep", "diaper"]
    startedAt: datetime
    endedAt: datetime | None = None
    details: dict = Field(default_factory=dict)


class DemoContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sampleInfantId: Literal["inf_demo30", "inf_demo4m", "inf_twin_a", "inf_twin_b", "inf_anya"]
    recentEvents: list[DemoEvent] = Field(default_factory=list, max_length=8)


def consume_demo_budget() -> None:
    now = datetime.now(timezone.utc)
    limits = {f"demoAiUsage/day_{now:%Y%m%d}": 60, f"demoAiUsage/minute_{now:%Y%m%d%H%M}": 6}
    if not get_store().consume_limits(limits):
        raise HTTPException(status_code=429, detail="The shared demo AI budget is reached. Please try later. No simulated result was substituted.",
                            headers={"Retry-After": "60"})


def sanitized_events(context: DemoContext) -> list[dict]:
    events = []
    choices = {"method": {"breast", "bottle", "formula", "expressed"}, "side": {"left", "right", "both"},
               "kind": {"wet", "dirty", "both", "dry"}}
    for event in context.recentEvents:
        if event.startedAt.tzinfo is None or (event.endedAt and event.endedAt.tzinfo is None):
            raise HTTPException(status_code=422, detail="Care-log timestamps must include a timezone.")
        details = {}
        allowed = {"feeding": ("method", "side", "amountMl"), "sleep": ("durationMin",), "diaper": ("kind",)}[event.type]
        for key in allowed:
            value = event.details.get(key)
            if key in choices and isinstance(value, str) and value in choices[key]:
                details[key] = value
            elif key in {"amountMl", "durationMin"} and isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value) and 0 <= value <= 2000:
                details[key] = value
        events.append({"type": event.type, "startedAt": event.startedAt.isoformat(),
                       "endedAt": event.endedAt.isoformat() if event.endedAt else None, "details": details})
    return events


@router.post("/{operation}")
async def demo_ai(operation: Literal["sound", "voice_log", "journal_transcribe", "journal_reflect", "support_chat", "care_document"],
                  context: str = Form(...), aiConsent: bool = Form(False), audioConsent: bool = Form(False),
                  text: str = Form(""), language: str = Form("en-IN"), audio: UploadFile | None = File(None), image: UploadFile | None = File(None), purpose: str = Form("vaccination")) -> dict:
    if not aiConsent or (audio is not None and not audioConsent):
        raise HTTPException(status_code=403, detail="Allow AI processing and, for recordings, audio capture before continuing.")
    if len(context) > 16000 or len(text) > (12000 if operation == "support_chat" else 6000) or len(language) > 24:
        raise HTTPException(status_code=413, detail="Keep sample context and text short.")
    try:
        payload = DemoContext.model_validate_json(context)
    except ValidationError as failure:
        raise HTTPException(status_code=422, detail="Choose a supported sample family and at most eight recent logs.") from failure
    events = sanitized_events(payload)
    chat = None
    if operation == "support_chat":
        try:
            chat = SupportChatIn.model_validate_json(text)
        except ValidationError as failure:
            raise HTTPException(status_code=422, detail="Keep this conversation short and try again.") from failure
        if audio is not None:
            raise HTTPException(status_code=422, detail="Review the transcript before sending your message.")
        if needs_human_support(chat):
            return support_reply(chat, lambda: None)
    settings = get_settings()
    if settings.ai_provider != "gemini":
        raise HTTPException(status_code=503, detail="Gemini is not configured for this demo service. No simulated result was substituted.")
    if operation == "care_document":
        if image is None or audio is not None:
            raise HTTPException(status_code=422, detail="Choose a care-document photo.")
        data = await image.read(4_000_001)
        if len(data) > 4_000_000 or image.content_type not in {"image/jpeg", "image/png", "image/webp"} or purpose not in {"vaccination", "visit"}:
            raise HTTPException(status_code=422, detail="Use a JPEG, PNG or WebP photo smaller than 4 MB.")
        await run_in_threadpool(consume_demo_budget)
        try:
            return await run_in_threadpool(review_care_document, data, image.content_type, purpose, get_ai)
        except HTTPException:
            raise
        except Exception as failure:
            raise HTTPException(status_code=502, detail="The photo could not be read. Try again or enter details manually.") from failure
    max_bytes = 4_000_000 if operation == "journal_transcribe" else 2_000_000
    data = await audio.read(max_bytes + 1) if audio else None
    if data is not None and len(data) > max_bytes:
        raise HTTPException(status_code=413, detail="Keep journal recordings under 90 seconds and other recordings under 30 seconds.")
    if operation == "sound":
        if not data:
            raise HTTPException(status_code=422, detail="Add a short WAV recording.")
        result = await analyse_sound(data, events, datetime.now(timezone.utc), SAMPLE_AGES[payload.sampleInfantId],
                                     settings, get_ai, consume_demo_budget)
        return {**result, "id": "demo-sound", "demo": True}
    if operation == "journal_reflect" and (audio is not None or not text.strip()):
        raise HTTPException(status_code=422, detail="Review the journal text before requesting a reflection.")
    if not data and not text.strip():
        raise HTTPException(status_code=422, detail="Add a recording or type a note.")
    if data:
        quality, _, _ = validate_wav(data, max_sec=90 if operation == "journal_transcribe" else 30)
        if not quality["ok"]:
            raise HTTPException(status_code=422, detail="This recording is unclear. Please record again.")
    await run_in_threadpool(consume_demo_budget)
    try:
        provider = get_ai()
        if chat is not None:
            return await run_in_threadpool(support_reply, chat, lambda: provider)
        if operation == "journal_reflect":
            reflection = await run_in_threadpool(provider.reflect, text.strip())
            safe, changed = guard_reflection(reflection.model_dump())
            return {"reflection": safe, "guardApplied": changed, "model": provider.name}
        heard = text.strip() or await run_in_threadpool(provider.transcribe, data, "audio/wav", language)
        if not heard or len(heard) > 6000:
            raise ValueError("No usable transcription.")
        if operation == "journal_transcribe":
            return {"transcript": heard, "provider": provider.name, "audioRetained": False, "requiresUserReview": True}
        extracted = await run_in_threadpool(provider.extract_event, heard)
        return {"transcript": heard, "provider": provider.name, "extracted": extracted.model_dump()}
    except HTTPException:
        raise
    except Exception as failure:
        raise HTTPException(status_code=502, detail="Gemini could not complete this request. Your input has not been saved to the server; please retry.") from failure