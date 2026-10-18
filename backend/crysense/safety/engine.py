"""Deterministic, versioned safety rules. These run before (and override) any
model output. Rules live in /shared/rules and are reviewed as content."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ..config import get_settings

OPS = {
    "eq": lambda a, b: a == b,
    "gte": lambda a, b: a is not None and a >= b,
    "lt": lambda a, b: a is not None and a < b,
    "in": lambda a, b: a in b,
}


@lru_cache(maxsize=8)
def load_json(relative: str) -> dict:
    path: Path = get_settings().shared_dir / relative
    return json.loads(path.read_text(encoding="utf-8"))


def _matches(cond: dict, facts: dict) -> bool:
    if "all" in cond:
        return all(_matches(c, facts) for c in cond["all"])
    if "any" in cond:
        return any(_matches(c, facts) for c in cond["any"])
    return OPS[cond["op"]](facts.get(cond["field"]), cond["value"])


def evaluate(ruleset_file: str, facts: dict) -> dict:
    ruleset = load_json(ruleset_file)
    order = ruleset["levels"]
    matched = [r for r in ruleset["rules"] if _matches(r["when"], facts)]
    matched.sort(key=lambda r: (order.index(r["level"]), r["id"]))
    level = matched[0]["level"] if matched else "none"
    return {
        "level": level,
        "messages": [{"ruleId": r["id"], "level": r["level"], "text": r["message"]} for r in matched],
        "stopRoutineAnalysis": level in ("emergency", "urgent", "support_now"),
        "rulesetId": ruleset["rulesetId"],
        "rulesetVersion": ruleset["version"],
        "clinicalReview": ruleset["clinicalReview"],
    }


def support_content(region: str) -> dict:
    content = load_json("content/support_v1.json")
    reg = content["regions"].get(region) or content["regions"]["IN"]
    return {"region": region if region in content["regions"] else "IN", **reg,
            "overwhelmedGuidance": content["overwhelmedGuidance"],
            "version": content["version"], "verification": content["verification"]}
