"""Deterministic guards applied to every generative output."""
from __future__ import annotations

import re

BLOCKED_TERMS = re.compile(
    r"\b(diagnos\w*|depress\w*|disorder|ppd|postpartum depression|psychosis|suicid\w*|risk score|epds|score of)\b",
    re.IGNORECASE,
)


def guard_reflection(reflection: dict) -> tuple[dict, bool]:
    """Returns (safe_reflection, was_modified). Never lets clinical labels through."""
    text = " ".join(filter(None, [reflection.get("summary"), reflection.get("followUpQuestion")]))
    out = dict(reflection, medicalAssessment=False, requiresUserReview=True)
    if BLOCKED_TERMS.search(text):
        out["summary"] = "Thank you for sharing this. Your words are saved exactly as you reviewed them."
        out["followUpQuestion"] = None
        return out, True
    return out, False
