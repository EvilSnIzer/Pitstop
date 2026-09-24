import json
import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from chatbot import models
from chatbot.bot import classifier, extraction, gemini, usage

from .factories import ChatSessionFactory, UserFactory
from .test_upload import JPEG

pytestmark = pytest.mark.django_db


def ready(user):
    return ChatSessionFactory(
        user=user, slots={"symptom": "oil leak", "vehicle": "BMW", "year": 1990, "onset": "sudden"}
    )


@pytest.mark.parametrize("password", ["12345678", "password"])
def test_registration_enforces_password_policy(client, password):
    response = client.post(
        "/api/v1/auth/register/", {"email": "secure@example.com", "password": password}
    )
    assert response.status_code == 400
    assert "password" in response.json()["errors"]


def test_email_identity_is_case_insensitive(client):
    data = {"email": "Driver@Example.com", "password": "strong-review-867!"}
    assert client.post("/api/v1/auth/register/", data).status_code == 201
    data["email"] = "driver@example.com"
    assert client.post("/api/v1/auth/register/", data).status_code == 400
    response = client.post(
        "/api/v1/auth/token/", {"username": "DRIVER@EXAMPLE.COM", "password": data["password"]}
    )
    assert response.status_code == 200


def test_logout_revokes_refresh(client):
    pair = client.post(
        "/api/v1/auth/register/", {"email": "logout@example.com", "password": "strong-review-867!"}
    ).json()
    assert client.post("/api/v1/auth/logout/", {"refresh": pair["refresh"]}).status_code == 204
    assert (
        client.post("/api/v1/auth/token/refresh/", {"refresh": pair["refresh"]}).status_code == 401
    )


def test_html_disguised_as_audio_rejected(api_client):
    file = SimpleUploadedFile(
        "attack.html", b"<html>not an audio file</html>", content_type="audio/mpeg"
    )
    response = api_client.post("/api/v1/upload/", {"file": file}, format="multipart")
    assert response.status_code == 400
    assert not models.MediaFile.objects.exists()


def test_media_is_private_and_has_safe_headers(api_client):
    response = api_client.post(
        "/api/v1/upload/",
        {"file": SimpleUploadedFile("attack.html", JPEG, content_type="image/jpeg")},
        format="multipart",
    )
    assert response.status_code == 201
    media = models.MediaFile.objects.get(pk=response.json()["id"])
    assert media.file.name.endswith(".jpg")
    assert "attack" not in media.file.name
    url = response.json()["url"]
    assert APIClient().get(url).status_code == 401
    other = APIClient()
    other.force_authenticate(UserFactory())
    assert other.get(url).status_code == 404
    assert APIClient().get(media.file.url).status_code == 404
    response = api_client.get(url)
    assert response.status_code == 200
    assert response["X-Content-Type-Options"] == "nosniff"
    assert "sandbox" in response["Content-Security-Policy"]
    assert response["Cache-Control"] == "private, no-store"
    response.close()


def test_chat_replay_does_not_duplicate_or_pay_again(api_client, user):
    session = ChatSessionFactory(user=user)
    before = session.updated_at
    payload = {"session_id": session.id, "content": "my 1990 BMW has an oil leak suddenly"}
    key = str(uuid.uuid4())
    with patch.object(gemini, "classify_car_related", side_effect=AssertionError("unnecessary AI")):
        first = api_client.post("/api/v1/chat/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
        replay = api_client.post("/api/v1/chat/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert first.status_code == replay.status_code == 200
    assert first.json() == replay.json()
    assert session.messages.count() == 2
    session.refresh_from_db()
    assert session.updated_at > before
    payload["content"] = "different content"
    assert (
        api_client.post(
            "/api/v1/chat/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key
        ).status_code
        == 409
    )


def test_chat_partial_writes_rollback(api_client, user):
    session = ChatSessionFactory(user=user)
    original = models.Message.objects.create

    def fail_assistant(**kwargs):
        if kwargs["role"] == "assistant":
            raise RuntimeError("simulated write failure")
        return original(**kwargs)

    with (
        patch.object(models.Message.objects, "create", side_effect=fail_assistant),
        pytest.raises(RuntimeError),
    ):
        api_client.post(
            "/api/v1/chat/",
            {"session_id": session.id, "content": "my car engine knocks"},
            format="json",
        )
    session.refresh_from_db()
    assert session.messages.count() == 0
    assert session.slots == {}
    assert session.busy_token is None


def test_booking_replay_survives_time_validation(api_client, user):
    session = ready(user)
    session.status = "diagnosed"
    session.save()
    key = str(uuid.uuid4())
    payload = {
        "session_id": session.id,
        "scheduled_at": (timezone.now() + timedelta(hours=1)).isoformat(),
    }
    first = api_client.post("/api/v1/booking/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
    with patch("chatbot.views.timezone.now", return_value=timezone.now() + timedelta(days=1)):
        replay = api_client.post(
            "/api/v1/booking/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key
        )
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()
    assert session.bookings.count() == 1


def test_database_enforces_single_booking_and_confidence(user):
    session = ready(user)
    models.Booking.objects.create(session=session, scheduled_at=timezone.now())
    with pytest.raises(IntegrityError), transaction.atomic():
        models.Booking.objects.create(session=session, scheduled_at=timezone.now())
    with pytest.raises(IntegrityError), transaction.atomic():
        models.Diagnosis.objects.create(
            session=session, summary="x", recommended_service="x", confidence=2
        )


@pytest.mark.parametrize(
    "output",
    [
        [],
        None,
        {"summary": None, "recommended_service": None},
        {"summary": "ok", "recommended_service": "x", "confidence": -1},
    ],
)
def test_invalid_ai_shapes_fail_cleanly(monkeypatch, output):
    monkeypatch.setattr(gemini, "_generate", lambda *args, **kwargs: json.dumps(output))
    with pytest.raises(gemini.GeminiError):
        gemini.generate_diagnosis("context")


def test_expected_intake_answers_never_call_classifier(monkeypatch):
    monkeypatch.setattr(gemini, "classify_car_related", lambda text: pytest.fail("unnecessary AI"))
    assert classifier.is_car_related("1990", {"symptom": "noise", "vehicle": "BMW"})
    assert classifier.is_car_related("suddenly", {"symptom": "noise", "year": 1990})
    assert not classifier.is_car_related("write a poem about a carpet")
    assert extraction.extract_year("2019, sorry 2018") == 2018


def test_after_diagnosis_no_classifier_or_media_ai(api_client, user, monkeypatch):
    session = ready(user)
    session.status = "diagnosed"
    session.save()
    monkeypatch.setattr(gemini, "classify_car_related", lambda text: pytest.fail("unnecessary AI"))
    response = api_client.post(
        "/api/v1/chat/", {"session_id": session.id, "content": "thank you"}, format="json"
    )
    assert response.status_code == 200


def test_media_analysis_reused(api_client, user, monkeypatch):
    calls = []
    monkeypatch.setattr(gemini, "analyze_media", lambda *args: calls.append(args) or "oil leak")
    uploaded = api_client.post(
        "/api/v1/upload/",
        {"file": SimpleUploadedFile("car.jpg", JPEG, content_type="image/jpeg")},
        format="multipart",
    ).json()
    session = ready(user)
    for _ in range(2):
        assert (
            api_client.post(
                "/api/v1/chat/",
                {"session_id": session.id, "content": "my car", "media_id": uploaded["id"]},
                format="json",
            ).status_code
            == 200
        )
    assert len(calls) == 1
    session.refresh_from_db()
    assert session.slots["media"] == ["oil leak"]


def test_daily_budgets_are_reserved_before_provider_calls(settings, user):
    settings.AI_USER_DAILY_CALLS = 1
    with usage.ai_context(user.pk):
        usage.reserve_call()
        with pytest.raises(usage.BudgetExceeded):
            usage.reserve_call()
    assert models.DailyAIUsage.objects.get(scope="global").attempts == 1


def test_history_pagination_and_server_side_filters(api_client, user):
    session = ready(user)
    models.Message.objects.bulk_create(
        [models.Message(session=session, role="user", content=f"m{i}") for i in range(55)]
    )
    latest = api_client.get(f"/api/v1/sessions/{session.id}/history/").json()
    assert len(latest["messages"]) == 50
    older = api_client.get(
        f"/api/v1/sessions/{session.id}/history/?before={latest['older_cursor']}"
    ).json()
    assert len(older["messages"]) == 5
    assert not set(m["id"] for m in older["messages"]) & set(m["id"] for m in latest["messages"])
    assert api_client.get("/api/v1/sessions/?status=booked").json()["count"] == 0
    assert api_client.get(f"/api/v1/sessions/?search={session.id}").json()["count"] == 1


@pytest.mark.parametrize("seconds,expected", [(1, 201), (61, 400)])
def test_real_wav_duration_validation(api_client, seconds, expected):
    import io
    import wave

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\x00\x00" * 8000 * seconds)
    response = api_client.post(
        "/api/v1/upload/",
        {"file": SimpleUploadedFile("sound.wav", buffer.getvalue(), content_type="audio/wav")},
        format="multipart",
    )
    assert response.status_code == expected


def test_stale_provider_worker_cannot_commit(api_client, user, monkeypatch):
    session = ready(user)
    replacement = uuid.uuid4()

    def superseded(context):
        models.ChatSession.objects.filter(pk=session.pk).update(
            busy_token=replacement, busy_until=timezone.now() + timedelta(seconds=120)
        )
        return {"summary": "oil leak", "recommended_service": "inspection", "confidence": 0.8}

    monkeypatch.setattr(gemini, "generate_diagnosis", superseded)
    response = api_client.post("/api/v1/diagnosis/", {"session_id": session.pk}, format="json")
    assert response.status_code == 409
    assert response.json()["code"] == "operation_expired"
    session.refresh_from_db()
    assert session.busy_token == replacement
    assert session.status == "in_progress"
    assert not session.diagnoses.exists()


def test_cleanup_preserves_attached_and_in_flight_media(user, django_capture_on_commit_callbacks):
    from io import StringIO

    from django.core.management import call_command

    files = [
        models.MediaFile.objects.create(
            user=user,
            file=SimpleUploadedFile(f"{index}.jpg", JPEG, content_type="image/jpeg"),
            mime_type="image/jpeg",
            size=len(JPEG),
        )
        for index in range(3)
    ]
    models.MediaFile.objects.update(created_at=timezone.now() - timedelta(days=2))
    models.Message.objects.create(session=ready(user), role="user", media_file=files[0])
    models.MediaFile.objects.filter(pk=files[1].pk).update(
        analysis_until=timezone.now() + timedelta(seconds=120)
    )
    call_command("cleanup", stdout=StringIO())
    assert models.MediaFile.objects.count() == 3
    with django_capture_on_commit_callbacks(execute=True):
        call_command("cleanup", apply=True, stdout=StringIO())
    assert set(models.MediaFile.objects.values_list("pk", flat=True)) == {files[0].pk, files[1].pk}
    assert files[0].file.storage.exists(files[0].file.name)
    assert not files[2].file.storage.exists(files[2].file.name)


def test_corrupt_png_checksum_returns_validation_error(api_client):
    import base64

    content = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII="
    )
    response = api_client.post(
        "/api/v1/upload/",
        {"file": SimpleUploadedFile("bad.png", content, content_type="image/png")},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_media"
