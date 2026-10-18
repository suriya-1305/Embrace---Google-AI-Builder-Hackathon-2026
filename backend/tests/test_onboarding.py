from datetime import date, datetime, timedelta, timezone

from .conftest import STRANGER
from crysense.store import get_store


def test_baby_onboarding_creates_private_profile_and_defaults_consents_off(baby):
    body = {
        "name": "Nila",
        "birthDate": date.today().isoformat(),
        "caregiverName": "Asha",
        "caregiverRole": "mother",
    }

    response = baby.post("/v1/onboarding/baby", headers=STRANGER, json=body)

    assert response.status_code == 201
    profile = response.json()
    assert profile["displayName"] == "Asha"
    assert profile["role"] == "mother"
    assert profile["infantId"]
    assert profile["motherId"] is None
    consents = baby.get(f"/v1/infants/{profile['infantId']}/consents", headers=STRANGER).json()
    assert all(not consent["granted"] for consent in consents.values())


def test_baby_onboarding_is_idempotent_for_the_signed_in_user(baby):
    first = baby.post("/v1/onboarding/baby", headers=STRANGER, json={
        "name": "Nila",
        "birthDate": date.today().isoformat(),
        "caregiverName": "Asha",
        "caregiverRole": "mother",
    }).json()

    repeated = baby.post("/v1/onboarding/baby", headers=STRANGER, json={
        "name": "A different name",
        "birthDate": date.today().isoformat(),
        "caregiverName": "Asha",
        "caregiverRole": "mother",
    })

    assert repeated.status_code == 201
    assert repeated.json()["infantId"] == first["infantId"]


def test_family_onboarding_creates_twins_in_one_household(baby):
    response = baby.post("/v1/onboarding/babies", headers=STRANGER, json={
        "caregiverName": "Asha",
        "caregiverRole": "mother",
        "babies": [
            {"name": "Nila", "birthDate": date.today().isoformat()},
            {"name": "Mira", "birthDate": date.today().isoformat()},
        ],
    })

    assert response.status_code == 201
    profile = response.json()
    assert len(profile["infantIds"]) == 2
    infants = [baby.get(f"/v1/infants/{infant_id}", headers=STRANGER).json() for infant_id in profile["infantIds"]]
    assert {infant["name"] for infant in infants} == {"Nila", "Mira"}
    assert len({infant["householdId"] for infant in infants}) == 1
    listed = baby.get("/v1/infants", headers=STRANGER)
    assert {infant["name"] for infant in listed.json()} == {"Nila", "Mira"}


def test_family_timeline_combines_only_the_signed_in_caregivers_babies(baby):
    profiles = baby.post("/v1/onboarding/babies", headers=STRANGER, json={
        "caregiverName": "Asha",
        "caregiverRole": "caregiver",
        "babies": [
            {"name": "Nila", "birthDate": date.today().isoformat()},
            {"name": "Mira", "birthDate": date.today().isoformat()},
        ],
    }).json()
    for infant_id in profiles["infantIds"]:
        baby.post(f"/v1/infants/{infant_id}/events", headers=STRANGER, json={
            "type": "feeding", "startedAt": "2026-10-17T12:00:00+05:30", "details": {"method": "breast"},
        })

    events = baby.get("/v1/family/events?days=7", headers=STRANGER).json()

    assert {event["infantName"] for event in events} == {"Nila", "Mira"}


def test_caregiver_view_link_exposes_recent_read_only_logs_without_private_notes(baby):
    profile = baby.post("/v1/onboarding/baby", headers=STRANGER, json={
        "name": "Nila", "birthDate": date.today().isoformat(), "caregiverName": "Asha", "caregiverRole": "mother",
    }).json()
    infant_id = profile["infantId"]
    baby.post(f"/v1/infants/{infant_id}/events", headers=STRANGER, json={
        "type": "feeding", "startedAt": datetime.now(timezone.utc).isoformat(),
        "details": {"method": "breast", "side": "left"}, "note": "Private note",
    })

    assert baby.post(f"/v1/infants/{infant_id}/view-links?ttlMinutes=60", headers=STRANGER, json={}).status_code == 403
    baby.put(f"/v1/infants/{infant_id}/consents/sharing", headers=STRANGER, json={"granted": True})
    created = baby.post(f"/v1/infants/{infant_id}/view-links?ttlMinutes=60", headers=STRANGER, json={})
    assert created.status_code == 201
    token = created.json()["token"]
    shared = baby.get(f"/v1/shared-infants/{token}")

    assert shared.status_code == 200
    assert shared.json()["readOnly"] is True
    assert shared.json()["infantName"] == "Nila"
    assert shared.json()["events"][0]["details"] == {"method": "breast", "side": "left"}
    assert "note" not in shared.text
    assert baby.post(f"/v1/shared-infants/{token}", json={}).status_code == 405
    baby.put(f"/v1/infants/{infant_id}/consents/sharing", headers=STRANGER, json={"granted": False})
    assert baby.get(f"/v1/shared-infants/{token}").status_code == 410


def test_expired_caregiver_view_link_is_rejected(baby):
    profile = baby.post("/v1/onboarding/baby", headers=STRANGER, json={
        "name": "Nila", "birthDate": date.today().isoformat(), "caregiverName": "Asha", "caregiverRole": "mother",
    }).json()
    infant_id = profile["infantId"]
    baby.put(f"/v1/infants/{infant_id}/consents/sharing", headers=STRANGER, json={"granted": True})
    created = baby.post(f"/v1/infants/{infant_id}/view-links", headers=STRANGER, json={}).json()
    path = f"infantViewLinks/{created['token']}"
    link = get_store().get(path)
    link["expiresAt"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    get_store().set(path, link)

    assert baby.get(f"/v1/shared-infants/{created['token']}").status_code == 410