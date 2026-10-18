from __future__ import annotations

from datetime import datetime, timedelta
from math import isfinite

from ..domain.timeutil import parse_iso
from ..domain.next_steps import suggest_checks
from ..ai.schemas import BabySoundObservation
from .cry_presence import LIMITATIONS, get_cry_model
from .validate import validate_wav
from starlette.concurrency import run_in_threadpool

DISCLAIMER = "Sound alone cannot identify hunger, gas, pain or illness. These are care checks, not a diagnosis."
DETAILS = {"feeding": ("method", "amountMl", "side"), "sleep": ("durationMin",), "diaper": ("kind",)}


def recent_audio_context(events: list[dict], now: datetime, age_days: int) -> dict:
    cutoff = now - timedelta(hours=24)
    recent = sorted((event for event in events if cutoff <= parse_iso(event["startedAt"]) <= now),
                    key=lambda event: parse_iso(event["startedAt"]), reverse=True)[:8]
    rows = [{"type": event["type"], "startedAt": event["startedAt"], "endedAt": event.get("endedAt"),
             "minutesAgo": max(0, round((now - parse_iso(event["startedAt"])).total_seconds() / 60)),
             "details": {key: event.get("details", {})[key] for key in DETAILS.get(event["type"], ())
                         if key in event.get("details", {})}} for event in recent]
    return {"ageDays": age_days, "contextWindowHours": 24, "recentEvents": rows}


def care_check_reason(category: str, context: dict) -> str:
    types = {"feeding": "feeding", "diaper": "diaper", "rest": "sleep"}
    labels = {"feeding": "feed", "diaper": "diaper change", "rest": "sleep"}
    if category in types:
        latest = next((event for event in context["recentEvents"] if event["type"] == types[category]), None)
        timing = (f"The most recent {labels[category]} in the shared logs was {latest['minutesAgo']} minutes ago."
                  if latest else f"No {labels[category]} appears in the shared recent logs; care may not have been logged.")
        checks = {"feeding": "Look for feeding cues; timing alone does not show hunger.",
                  "diaper": "Check whether a change is needed.",
                  "rest": "Look for sleepy cues and follow your usual safe-sleep routine."}
        return f"{timing} {checks[category]}"
    if category == "burping":
        return "If baby recently fed, consider your usual gentle burping routine. The recording does not confirm gas."
    return "Try your familiar, gentle soothing routine while watching how your baby responds."


async def analyse_sound(data: bytes, events: list[dict], now: datetime, age_days: int, settings, ai_factory, before_review=None) -> dict:
    quality, samples, rate = validate_wav(data)
    audio_ready = quality["ok"] and not any(issue["code"] == "background_noise" for issue in quality["issues"])
    model = get_cry_model(settings.cry_model)
    presence = model.detect(samples, rate, quality) if samples is not None else {"presence": "uncertain", "confidence": None}
    context = recent_audio_context(events, now, age_days)
    review = {"status": "not_run", "provider": "none", "contextLogCount": 0, "contextWindowHours": 24,
              "sound": "uncertain", "pitch": "uncertain", "pattern": "uncertain", "suggestions": [], "disclaimer": DISCLAIMER}
    review.update(audibleFeatures=[], listeningSegments=[], explanation="", cannotRuleOut="Pain or illness cannot be confirmed or excluded by this recording.")
    model_version = model.version
    if settings.ai_provider == "gemini":
        if settings.cry_model == "mock":
            presence = {"presence": "uncertain", "confidence": None}
            model_version = "audio-quality-only"
        if audio_ready:
            if before_review:
                await run_in_threadpool(before_review)
            try:
                provider = ai_factory()
                observed = BabySoundObservation.model_validate(await run_in_threadpool(provider.review_baby_sound, data, context))
                segments = []
                for segment in sorted(observed.segments, key=lambda item: item.startSec):
                    if isfinite(segment.startSec) and isfinite(segment.endSec) and 0 <= segment.startSec < segment.endSec <= quality["durationSec"] and (not segments or segment.startSec >= segments[-1]["endSec"]):
                        segments.append({**segment.model_dump(), "startSec": round(segment.startSec, 1), "endSec": round(segment.endSec, 1)})
                sound_labels = {"crying": "crying-like sounds", "babbling": "babbling-like sounds", "other_sound": "other sounds", "uncertain": "an unclear sound"}
                pattern_labels = {"intermittent": "an intermittent pattern", "continuous": "a continuous pattern", "none": "no sustained pattern", "uncertain": "an unclear pattern"}
                review.update(status="ready", provider="gemini", contextLogCount=len(context["recentEvents"]),
                              sound=observed.sound, pitch=observed.pitch, pattern=observed.pattern,
                              audibleFeatures=list(dict.fromkeys(observed.audibleFeatures)), listeningSegments=segments,
                              explanation=f"Emi heard {sound_labels[observed.sound]} with {observed.pitch} relative pitch and {pattern_labels[observed.pattern]}. This describes the recording, not why your baby is vocalizing.",
                              suggestions=[{"category": category, "reason": care_check_reason(category, context)}
                                           for category in dict.fromkeys(observed.careChecks)])
                presence = {"presence": "detected" if observed.sound == "crying" else "uncertain" if observed.sound == "uncertain" else "not_detected", "confidence": None}
                model_version = getattr(provider, "name", "gemini")
            except Exception:
                review.update(status="unavailable", provider="gemini")
    elif audio_ready:
        review.update(status="simulated", provider="mock", contextLogCount=len(context["recentEvents"]),
                      sound="crying" if presence["presence"] == "detected" else "uncertain",
                      suggestions=[{"category": category, "reason": care_check_reason(category, context)} for category in ("feeding", "diaper", "comfort")])
    return {"createdAt": now.isoformat(), "quality": quality, **presence, "modelVersion": model_version,
            "limitations": LIMITATIONS, "rawAudioRetained": False, "nextSteps": suggest_checks(events, now),
            "retry": not audio_ready, "contextReview": review}