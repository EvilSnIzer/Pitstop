from datetime import UTC, datetime, timedelta

import pytest

from .factories import ChatSessionFactory, UserFactory

pytestmark = pytest.mark.django_db


def _future_iso(hours=2):
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


def _create_session(api_client):
    resp = api_client.post("/api/v1/sessions/", {}, format="json")
    assert resp.status_code == 201, resp.content
    return resp.json()["id"]


def test_register_returns_token_pair(client):
    resp = client.post(
        "/api/v1/auth/register/",
        {"email": "new-driver@example.com", "password": "sufficiently-long"},
        format="json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["user"]["email"] == "new-driver@example.com"
    assert "access" in body and "refresh" in body


def test_register_rejects_duplicate_email(client):
    payload = {"email": "dup@example.com", "password": "sufficiently-long"}
    assert client.post("/api/v1/auth/register/", payload, format="json").status_code == 201
    resp = client.post("/api/v1/auth/register/", payload, format="json")
    assert resp.status_code == 400


def test_endpoints_require_auth(client):
    assert client.post("/api/v1/sessions/", {}, format="json").status_code == 401
    assert client.post("/api/v1/chat/", {"session_id": 1}, format="json").status_code == 401
    assert client.get("/api/v1/sessions/").status_code == 401


def test_session_create_seeds_greeting(api_client):
    session_id = _create_session(api_client)
    resp = api_client.get(f"/api/v1/sessions/{session_id}/history/")
    assert resp.status_code == 200
    history = resp.json()
    assert len(history["messages"]) == 1
    assert history["messages"][0]["role"] == "assistant"
    assert history["session"]["diagnosis_ready"] is False


def test_session_history_scoped_to_owner(api_client, db):
    session = ChatSessionFactory(user=UserFactory())
    resp = api_client.get(f"/api/v1/sessions/{session.id}/history/")
    assert resp.status_code == 404


def test_diagnosis_before_ready_is_rejected(api_client, mock_diagnosis):
    session_id = _create_session(api_client)
    resp = api_client.post(
        "/api/v1/chat/",
        {"session_id": session_id, "content": "my car has a problem"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["session"]["diagnosis_ready"] is False

    resp = api_client.post("/api/v1/diagnosis/", {"session_id": session_id}, format="json")
    assert resp.status_code == 400
    assert mock_diagnosis == []  # no LLM call before ready


def test_full_flow_to_booking(api_client, mock_diagnosis):
    session_id = _create_session(api_client)

    # Drive the deterministic intake: symptom (+brand+year) in one message, onset in the next.
    resp = api_client.post(
        "/api/v1/chat/",
        {"session_id": session_id, "content": "my 2019 Hyundai i20 brakes feel soft and spongy"},
        format="json",
    )
    assert resp.status_code == 200
    resp = api_client.post(
        "/api/v1/chat/",
        {"session_id": session_id, "content": "it is getting worse over the past two weeks"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["session"]["diagnosis_ready"] is True

    resp = api_client.post("/api/v1/diagnosis/", {"session_id": session_id}, format="json")
    assert resp.status_code == 201, resp.content
    diagnosis = resp.json()
    assert diagnosis["recommended_service"]
    assert 0 <= diagnosis["confidence"] <= 1
    assert len(mock_diagnosis) == 1  # exactly one paid LLM call for the diagnosis
    assert "Hyundai" in mock_diagnosis[0] and "brakes feel soft" in mock_diagnosis[0]

    # A second trigger returns the existing diagnosis without another LLM call.
    resp = api_client.post("/api/v1/diagnosis/", {"session_id": session_id}, format="json")
    assert resp.status_code == 200
    assert resp.json()["id"] == diagnosis["id"]
    assert len(mock_diagnosis) == 1

    resp = api_client.get(f"/api/v1/sessions/{session_id}/history/")
    history = resp.json()
    assert history["session"]["status"] == "diagnosed"
    assert history["diagnosis"]["summary"]
    assert history["booking"] is None

    when = _future_iso()
    resp = api_client.post(
        "/api/v1/booking/",
        {"session_id": session_id, "scheduled_at": when},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    booking = resp.json()
    assert booking["status"] == "pending"

    resp = api_client.get(f"/api/v1/booking/{booking['id']}/")
    assert resp.status_code == 200
    assert resp.json()["scheduled_at"].startswith(when[:10])

    # Session is booked now; a second booking is rejected.
    resp = api_client.post(
        "/api/v1/booking/",
        {"session_id": session_id, "scheduled_at": _future_iso()},
        format="json",
    )
    assert resp.status_code == 409

    resp = api_client.get(f"/api/v1/sessions/{session_id}/history/")
    assert resp.json()["session"]["status"] == "booked"
    assert resp.json()["booking"]["id"] == booking["id"]


def test_booking_requires_diagnosed_session(api_client):
    session_id = _create_session(api_client)
    resp = api_client.post(
        "/api/v1/booking/",
        {"session_id": session_id, "scheduled_at": _future_iso()},
        format="json",
    )
    assert resp.status_code == 409


def test_booking_in_past_rejected(api_client):
    session_id = _create_session(api_client)
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    resp = api_client.post(
        "/api/v1/booking/",
        {"session_id": session_id, "scheduled_at": past},
        format="json",
    )
    assert resp.status_code == 400


def test_chat_requires_text_or_media(api_client):
    session_id = _create_session(api_client)
    resp = api_client.post(
        "/api/v1/chat/", {"session_id": session_id, "content": "   "}, format="json"
    )
    assert resp.status_code == 400


def test_missing_provider_key_is_not_reported_as_temporary(api_client, monkeypatch):

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    session_id = _create_session(api_client)
    response = api_client.post(
        "/api/v1/chat/",
        {
            "session_id": session_id,
            "content": "my 1990 BMW has an oil leak that started suddenly yesterday",
        },
        format="json",
    )
    assert response.json()["session"]["diagnosis_ready"] is True
    response = api_client.post("/api/v1/diagnosis/", {"session_id": session_id}, format="json")
    assert response.status_code == 503
    assert response.json()["code"] == "ai_not_configured"
    assert "try again in a minute" not in response.json()["detail"]
    history = api_client.get(f"/api/v1/sessions/{session_id}/history/").json()
    assert history["session"]["status"] == "in_progress"
    assert history["diagnosis"] is None
    assert len(history["messages"]) == 3
