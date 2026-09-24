import pytest

from .test_api_flow import _create_session

pytestmark = pytest.mark.django_db


@pytest.fixture
def tight_ai_rate(monkeypatch):
    # DRF binds SimpleRateThrottle.THROTTLE_RATES to the settings dict at import
    # time, so override_settings(REST_FRAMEWORK=...) never reaches it. Patch the
    # class attribute instead.
    from rest_framework.throttling import SimpleRateThrottle

    rates = {**SimpleRateThrottle.THROTTLE_RATES, "user": "1000/minute", "ai": "2/minute"}
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", rates)


def test_chat_endpoint_throttles_ai_scope(api_client, tight_ai_rate):
    session_id = _create_session(api_client)
    payload = {"session_id": session_id, "content": "engine making a knocking noise"}
    for _ in range(2):
        assert api_client.post("/api/v1/chat/", payload, format="json").status_code == 200
    resp = api_client.post("/api/v1/chat/", payload, format="json")
    assert resp.status_code == 429
    assert "throttl" in resp.json()["detail"].lower()


def test_non_ai_endpoints_unaffected_by_ai_throttle(api_client, tight_ai_rate):
    session_id = _create_session(api_client)
    payload = {"session_id": session_id, "content": "engine making a knocking noise"}
    for _ in range(3):
        api_client.post("/api/v1/chat/", payload, format="json")
    assert api_client.get("/api/v1/sessions/").status_code == 200
    assert api_client.get(f"/api/v1/sessions/{session_id}/history/").status_code == 200


def test_diagnosis_endpoint_shares_ai_scope(api_client, tight_ai_rate):
    session_id = _create_session(api_client)
    payload = {"session_id": session_id}
    for _ in range(2):
        assert api_client.post("/api/v1/diagnosis/", payload, format="json").status_code == 400
    # The 400s above consumed the ai budget, so the third call is throttled
    # before validation.
    assert api_client.post("/api/v1/diagnosis/", payload, format="json").status_code == 429
