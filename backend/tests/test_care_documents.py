import json
from datetime import date

from crysense.ai.care_documents import review_care_document
from crysense.ai.schemas import CareDocumentContent
from .conftest import ARJUN, MEERA, STRANGER

PNG = b"\x89PNG\r\n\x1a\nfictional-image-fixture"


class DocumentProvider:
    name = "gemini:test"

    def review_care_document(self, image, mime_type, purpose, vaccines):
        assert purpose in {"vaccination", "visit"}
        assert any(vaccine["id"] == "bcg" for vaccine in vaccines)
        return CareDocumentContent(measurementDate=date.today().isoformat(), weightKg=5.2, lengthCm=57,
                                   vaccinations=[{"vaccineId": "bcg", "givenOn": date.today().isoformat()},
                                                 {"vaccineId": "unknown-dose", "givenOn": "2999-01-01"}])


def test_document_extract_is_review_only_and_omits_unknown_doses(baby, monkeypatch):
    import baby_api.main as baby_module

    monkeypatch.setattr(baby_module, "get_ai", DocumentProvider)
    before = baby.get("/v1/infants/inf_anya/records/growth", headers=MEERA).json()
    response = baby.post("/v1/infants/inf_anya/documents/review", headers=MEERA,
                         data={"purpose": "visit"}, files={"image": ("card.png", PNG, "image/png")})
    assert response.status_code == 200
    assert response.json()["requiresReview"] is True and response.json()["imageRetained"] is False
    assert response.json()["vaccinations"] == [{"vaccineId": "bcg", "givenOn": date.today().isoformat()}]
    assert response.json()["warnings"]
    assert baby.get("/v1/infants/inf_anya/records/growth", headers=MEERA).json() == before


def test_document_access_and_consent_are_required(baby):
    assert baby.post("/v1/infants/inf_anya/documents/review", headers=STRANGER, files={"image": ("card.png", PNG, "image/png")}).status_code == 404
    baby.put("/v1/infants/inf_anya/consents/ai_processing", headers=MEERA, json={"granted": False})
    assert baby.post("/v1/infants/inf_anya/documents/review", headers=MEERA, files={"image": ("card.png", PNG, "image/png")}).status_code == 403


def test_invalid_photo_is_rejected_before_provider():
    from fastapi import HTTPException
    import pytest

    with pytest.raises(HTTPException) as raised:
        review_care_document(b"not an image", "image/jpeg", "visit", lambda: (_ for _ in ()).throw(AssertionError()))
    assert raised.value.status_code == 422


def test_document_schema_is_sdk_compatible_and_measurements_are_checked_in_code():
    assert "exclusiveMinimum" not in json.dumps(CareDocumentContent.model_json_schema())

    class OutOfRangeProvider(DocumentProvider):
        def review_care_document(self, image, mime_type, purpose, vaccines):
            return CareDocumentContent(weightKg=300, lengthCm=2, headCm=41)

    result = review_care_document(PNG, "image/png", "visit", OutOfRangeProvider)
    assert result["weightKg"] is None and result["lengthCm"] is None and result["headCm"] == 41
    assert result["warnings"]


def test_demo_document_review_and_report_idempotency(baby, monkeypatch):
    import baby_api.demo_ai as demo_module

    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setattr(demo_module, "get_ai", DocumentProvider)
    response = baby.post("/v1/demo/ai/care_document", data={"aiConsent": "true", "purpose": "vaccination", "context": json.dumps({"sampleInfantId": "inf_demo4m", "recentEvents": []})}, files={"image": ("card.png", PNG, "image/png")})
    assert response.status_code == 200 and response.json()["provider"] == "gemini:test"
    body = {"clientRequestId": "2ae78eb6-f792-47a9-96cd-dbf91cd60689", "date": date.today().isoformat(), "note": "Follow-up reviewed", "clinician": "", "nextVisitOn": None}
    first = baby.post("/v1/infants/inf_anya/records/visit_reports", headers=ARJUN, json=body)
    second = baby.post("/v1/infants/inf_anya/records/visit_reports", headers=ARJUN, json=body)
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]


def test_care_record_edits_reject_invalid_or_future_dates(baby):
    assert baby.post("/v1/infants/inf_anya/records/vaccinations", headers=MEERA,
                     json={"vaccineId": "bcg", "givenOn": "2026-99-99"}).status_code == 422
    assert baby.post("/v1/infants/inf_anya/records/vaccinations", headers=MEERA,
                     json={"vaccineId": "bcg", "givenOn": "2999-01-01"}).status_code == 422
    assert baby.post("/v1/infants/inf_anya/records/growth", headers=MEERA,
                     json={"date": "2999-01-01", "weightKg": 6.4}).status_code == 422