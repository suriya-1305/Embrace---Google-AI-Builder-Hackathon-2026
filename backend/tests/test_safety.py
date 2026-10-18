from crysense.safety.engine import evaluate

from .conftest import MEERA

BABY = "rules/baby_warning_signs_v1.json"
MOM = "rules/mother_recovery_flags_v1.json"


def test_emergency_outranks_everything():
    r = evaluate(BABY, {"breathingDifficulty": True, "poorFeeding": True, "ageDays": 40})
    assert r["level"] == "emergency" and r["stopRoutineAnalysis"] and r["clinicalReview"] == "pending"


def test_fever_depends_on_age():
    assert evaluate(BABY, {"tempC": 38.2, "ageDays": 40})["level"] == "urgent"
    assert evaluate(BABY, {"tempC": 38.2, "ageDays": 120})["level"] == "seek_advice"
    assert evaluate(BABY, {"ageDays": 40})["level"] == "none"


def test_parent_concern_is_never_overridden(baby):
    r = baby.post("/v1/infants/inf_anya/warning-check", headers=MEERA, json={"parentThinksSeriouslyWrong": True}).json()
    assert r["level"] == "urgent" and "support" in r


def test_mother_support_now_shows_help_without_contacting_anyone(mother):
    r = mother.post("/v1/mothers/mom_meera/recovery/check", headers=MEERA, json={"thoughtsOfHarm": True}).json()
    assert r["level"] == "support_now" and r["support"]["support"]
    assert "contacted" not in r and "alertSent" not in r


def test_mother_emergency_wins():
    assert evaluate(MOM, {"heavyBleeding": True, "thoughtsOfHarm": True})["level"] == "emergency"
