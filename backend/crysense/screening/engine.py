"""Questionnaire workflow with deterministic scoring. Ships with a non-clinical
placeholder; an approved, validated instrument can be dropped in as JSON after
version, translation and usage rights are reviewed."""
from __future__ import annotations

from ..safety.engine import load_json

INSTRUMENTS = {"demo_wellbeing": "instruments/demo_wellbeing_v0.json"}


def get_instrument(instrument_id: str) -> dict:
    if instrument_id not in INSTRUMENTS:
        raise KeyError(instrument_id)
    return load_json(INSTRUMENTS[instrument_id])


def score(instrument_id: str, answers: dict[str, int | None]) -> dict:
    inst = get_instrument(instrument_id)
    items = {i["id"]: i for i in inst["items"]}
    unknown = [k for k in answers if k not in items]
    if unknown:
        raise ValueError(f"Unknown items: {', '.join(sorted(unknown))}")

    safety = inst.get("safety")
    safety_triggered = False
    if safety:
        val = answers.get(safety["itemId"])
        safety_triggered = val is not None and val >= safety["triggerAtOrAbove"]

    skipped = [i for i in items if answers.get(i) is None]
    for item_id, val in answers.items():
        if val is not None and val not in {o["score"] for o in items[item_id]["options"]}:
            raise ValueError(f"Invalid answer for {item_id}.")

    result = {
        "instrumentId": inst["instrumentId"], "instrumentVersion": inst["version"], "instrumentStatus": inst["status"],
        "safetyTriggered": safety_triggered, "skippedItems": skipped,
        "total": None, "band": None, "followUp": None, "bandNote": inst.get("bandNote"),
    }
    if skipped:
        result["followUp"] = "Some questions were skipped, so no total is shown. That's okay. You can come back any time."
    else:
        total = sum(answers[i] for i in items)
        band = next(b for b in inst["bands"] if b["min"] <= total <= b["max"])
        result.update(total=total, band={"id": band["id"], "label": band["label"]}, followUp=band["followUp"])
    if safety_triggered:
        result["supportNow"] = True
        result["followUp"] = "Thank you for answering honestly. Please reach out for support today. You can see support options now."
    return result
