from .conftest import ARJUN, MEERA, STRANGER


def test_partner_can_read_baby_but_not_mother(baby, mother):
    assert baby.get("/v1/infants/inf_anya", headers=ARJUN).status_code == 200
    assert mother.get("/v1/mothers/mom_meera", headers=ARJUN).status_code == 403
    assert mother.get("/v1/mothers/mom_meera/journal", headers=ARJUN).status_code == 403


def test_mother_can_read_both(baby, mother):
    assert baby.get("/v1/infants/inf_anya", headers=MEERA).status_code == 200
    assert mother.get("/v1/mothers/mom_meera/journal", headers=MEERA).status_code == 200


def test_stranger_gets_nothing(baby, mother):
    assert baby.get("/v1/infants/inf_anya", headers=STRANGER).status_code == 404
    assert mother.get("/v1/mothers/mom_meera", headers=STRANGER).status_code == 403


def test_no_token_is_rejected(baby):
    assert baby.get("/v1/infants/inf_anya").status_code == 401


def test_help_is_public(baby, mother):
    assert baby.get("/v1/support").json()["region"] == "IN"
    assert baby.get("/v1/support").json()["name"] == "India"
    assert mother.get("/v1/support").status_code == 200


def test_me_lists_only_permitted_records(baby):
    meera = baby.get("/v1/me", headers=MEERA).json()
    arjun = baby.get("/v1/me", headers=ARJUN).json()
    assert meera["infantId"] == "inf_anya" and meera["motherId"] == "mom_meera"
    assert arjun["infantId"] == "inf_anya" and arjun["motherId"] is None
