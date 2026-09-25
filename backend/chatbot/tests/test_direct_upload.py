import time
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from chatbot.models import MediaFile
from chatbot.upload_auth import TTL

from .factories import UserFactory
from .test_upload import JPEG

pytestmark = pytest.mark.django_db


def ticket(client, **overrides):
    response = client.post(
        "/api/v1/upload/authorize/",
        {"mime_type": "image/jpeg", "size": len(JPEG), **overrides},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response["Cache-Control"] == "private, no-store"
    return response.json()["token"]


def upload(token, content=JPEG):
    return APIClient().post(
        "/api/v1/upload/",
        {"file": SimpleUploadedFile("car.jpg", content, content_type="image/jpeg")},
        format="multipart",
        HTTP_X_UPLOAD_TOKEN=token,
    )


def test_ticket_authorizes_one_upload_for_its_owner(api_client, user):
    token = ticket(api_client)
    result = upload(token)
    assert result.status_code == 201
    assert MediaFile.objects.get(pk=result.json()["id"]).user == user
    assert upload(token).status_code == 401


def test_ticket_cannot_authenticate_other_endpoints(api_client):
    token = ticket(api_client)
    client = APIClient()
    assert client.get("/api/v1/sessions/", HTTP_X_UPLOAD_TOKEN=token).status_code == 401
    assert client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Bearer {token}").status_code == 401
    assert client.post("/api/v1/upload/authorize/", {}, format="json").status_code == 401


def test_expired_or_tampered_tickets_rejected(api_client):
    with patch("django.core.signing.time.time", return_value=time.time() - TTL - 2):
        expired = ticket(api_client)
    assert upload(expired).status_code == 401
    assert upload(ticket(api_client) + "forged").status_code == 401
    assert not MediaFile.objects.exists()


@pytest.mark.parametrize("change", [{"size": len(JPEG) + 1}, {"mime_type": "image/png"}])
def test_ticket_cannot_change_its_file_size_or_type(api_client, change):
    response = upload(ticket(api_client, **change))
    assert response.status_code == 400
    assert response.json()["code"] == "upload_mismatch"


def test_ticket_upload_still_validates_actual_file_contents(api_client):
    response = upload(ticket(api_client, size=6), b"notjpg")
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_media"


def test_inactive_account_cannot_use_previously_issued_ticket(api_client, user):
    token = ticket(api_client)
    user.is_active = False
    user.save(update_fields=["is_active"])
    assert upload(token).status_code == 401


def test_ticket_rejects_unsupported_or_oversized_uploads(api_client):
    for body in [
        {"mime_type": "text/html", "size": 5},
        {"mime_type": "image/jpeg", "size": 8 * 1024 * 1024},
    ]:
        assert api_client.post("/api/v1/upload/authorize/", body, format="json").status_code == 400


def test_private_storage_redirect_is_owner_checked(api_client, settings):
    uploaded = upload(ticket(api_client)).json()
    media = MediaFile.objects.get(pk=uploaded["id"])
    settings.AWS_STORAGE_BUCKET_NAME = "private-test-bucket"
    settings.MEDIA_STORAGE = "s3"
    with patch.object(
        media.file.storage, "url", return_value="https://storage.example/signed"
    ) as sign:
        response = api_client.get(uploaded["url"])
        assert response.status_code == 302
        assert response["Location"] == "https://storage.example/signed"
        assert response["Cache-Control"] == "private, no-store"
        sign.assert_called_once_with(media.file.name, expire=60)
        other = APIClient()
        other.force_authenticate(UserFactory())
        assert other.get(uploaded["url"]).status_code == 404
        assert APIClient().get(uploaded["url"]).status_code == 401
        assert sign.call_count == 1


def test_upload_cors_allows_only_configured_frontend(settings):
    settings.CORS_ALLOWED_ORIGINS = ["https://pitstop.vercel.app"]
    client = APIClient()
    response = client.options(
        "/api/v1/upload/",
        HTTP_ORIGIN="https://pitstop.vercel.app",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-upload-token",
    )
    assert response["Access-Control-Allow-Origin"] == "https://pitstop.vercel.app"
    assert "x-upload-token" in response["Access-Control-Allow-Headers"]
    denied = client.options(
        "/api/v1/upload/",
        HTTP_ORIGIN="https://attacker.example",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
    )
    assert "Access-Control-Allow-Origin" not in denied


def test_direct_upload_request_body_is_bounded(api_client):
    response = api_client.post(
        "/api/v1/upload/",
        {
            "file": SimpleUploadedFile(
                "large.wav", b"x" * (16 * 1024 * 1024), content_type="audio/wav"
            )
        },
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_media"
    assert not MediaFile.objects.exists()
