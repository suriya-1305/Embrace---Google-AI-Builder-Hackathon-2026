from datetime import datetime
from zoneinfo import ZoneInfo

from crysense.domain.baseline import compute_baseline

from .conftest import MEERA

TZ = "Asia/Kolkata"


def ev(day: str, hour: int, etype: str = "feeding", eid: str = "e"):
    return {"id": f"{eid}{day}{hour}", "type": etype, "startedAt": f"{day}T{hour:02d}:00+05:30", "details": {"kind": "wet"} if etype == "diaper" else {}}


def test_missing_days_are_not_zero():
    now = datetime(2026, 10, 16, 23, 0, tzinfo=ZoneInfo(TZ))
    events = [ev("2026-10-14", h) for h in (1, 4, 7, 10)] + [ev("2026-10-15", h) for h in (2, 5)]
    b = compute_baseline(events, now, TZ)
    assert b["coverage"] == {"daysWithData": 2, "totalDays": 7, "percent": 29}
    assert b["metrics"]["feedsPerDay"] == 3.0  # (4 + 2) / 2 logged days, not / 7
    assert b["metrics"]["typicalFeedGapMin"] == 180


def test_baseline_endpoint_shape(baby):
    b = baby.get("/v1/infants/inf_anya/baseline", headers=MEERA).json()
    assert len(b["days"]) == 7 and b["coverage"]["daysWithData"] <= 6
    assert any(not d["hasData"] for d in b["days"])
