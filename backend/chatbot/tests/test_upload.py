import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from chatbot import models
from chatbot.bot import gemini

from .factories import UserFactory
from .test_api_flow import _create_session

pytestmark = pytest.mark.django_db


def image_bytes(format):
    data = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(data, format=format)
    return data.getvalue()


JPEG = image_bytes("JPEG")
PNG = image_bytes("PNG")


def test_upload_accepted_and_returns_reference(api_client):
    uploaded = SimpleUploadedFile("photo.jpg", JPEG, content_type="image/jpeg")
    resp = api_client.post("/api/v1/upload/", {"file": uploaded}, format="multipart")
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["mime_type"] == "image/jpeg"
    assert body["url"] == f"/api/v1/media/{body['id']}/"
    fetched = api_client.get(body["url"])
    assert fetched.status_code == 200
    assert fetched["Content-Type"] == "image/jpeg"
    fetched.close()


def test_upload_rejects_unknown_mime(api_client):
    uploaded = SimpleUploadedFile(
        "payload.exe", b"MZ\x90\x00", content_type="application/x-msdownload"
    )
    resp = api_client.post("/api/v1/upload/", {"file": uploaded}, format="multipart")
    assert resp.status_code == 400
    assert "not supported" in resp.json()["detail"]


def test_upload_rejects_bytes_that_dont_match_declared_image_type(api_client):
    # PNG magic bytes claimed as JPEG: the sniff must catch the mismatch.
    uploaded = SimpleUploadedFile("fake.jpg", PNG, content_type="image/jpeg")
    resp = api_client.post("/api/v1/upload/", {"file": uploaded}, format="multipart")
    assert resp.status_code == 400
    assert "don't match" in resp.json()["detail"]


def test_upload_rejects_oversized_image(api_client):
    too_big = JPEG[:4] + b"x" * (7 * 1024 * 1024)
    uploaded = SimpleUploadedFile("big.jpg", too_big, content_type="image/jpeg")
    resp = api_client.post("/api/v1/upload/", {"file": uploaded}, format="multipart")
    assert resp.status_code == 400
    assert "too large" in resp.json()["detail"]


def test_upload_requires_file(api_client):
    resp = api_client.post("/api/v1/upload/", {}, format="multipart")
    assert resp.status_code == 400


def test_chat_with_media_sends_bytes_to_analyzer(api_client, monkeypatch):
    captured = {}

    def fake_analyze(data, mime_type):
        captured["size"] = len(data)
        captured["mime"] = mime_type
        return "dark fluid pooling under the front left wheel"

    monkeypatch.setattr(gemini, "analyze_media", fake_analyze)

    uploaded = SimpleUploadedFile("leak.jpg", JPEG, content_type="image/jpeg")
    media_id = api_client.post("/api/v1/upload/", {"file": uploaded}, format="multipart").json()[
        "id"
    ]

    session_id = _create_session(api_client)
    resp = api_client.post(
        "/api/v1/chat/",
        {"session_id": session_id, "content": "see the car oil leak", "media_id": media_id},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert captured["mime"] == "image/jpeg"
    assert captured["size"] == len(JPEG)

    history = api_client.get(f"/api/v1/sessions/{session_id}/history/").json()
    user_message = [m for m in history["messages"] if m["role"] == "user"][0]
    assert user_message["media_url"] == f"/api/v1/media/{media_id}/"
    assert user_message["media_type"] == "image/jpeg"


def test_media_analysis_failure_degrades_gracefully(api_client, monkeypatch):
    def broken(data, mime_type):
        raise gemini.GeminiUnavailableError("api down")

    monkeypatch.setattr(gemini, "analyze_media", broken)

    uploaded = SimpleUploadedFile("leak.jpg", JPEG, content_type="image/jpeg")
    media_id = api_client.post("/api/v1/upload/", {"file": uploaded}, format="multipart").json()[
        "id"
    ]

    session_id = _create_session(api_client)
    resp = api_client.post(
        "/api/v1/chat/",
        {"session_id": session_id, "content": "see the car photo", "media_id": media_id},
        format="json",
    )
    assert resp.status_code == 200
    assert "couldn't process that media" in resp.json()["message"]["content"]


def test_cannot_use_another_users_media(api_client, db):
    other = UserFactory()
    uploaded = SimpleUploadedFile("theirs.jpg", JPEG, content_type="image/jpeg")
    models.MediaFile.objects.create(
        user=other, mime_type="image/jpeg", size=len(JPEG), file=uploaded
    )

    session_id = _create_session(api_client)
    resp = api_client.post(
        "/api/v1/chat/",
        {"session_id": session_id, "content": "look", "media_id": other.media_files.first().id},
        format="json",
    )
    assert resp.status_code == 404
