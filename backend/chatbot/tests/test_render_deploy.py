"""Checks for the all-Render free-plan deployment path.

Two platform constraints are covered:

- Free Render instances have an ephemeral filesystem and cannot attach
  persistent disks, so ``MEDIA_STORAGE=database`` keeps private uploads in
  Postgres rows (chatbot.storage.DatabaseStorage).
- The Next.js BFF reaches the API over Render's private network, where the
  Host header is the API's dynamic single-label internal hostname
  (<service>-<hash>) that cannot be listed in ALLOWED_HOSTS up front.
"""

import io

import pytest
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, override_settings
from PIL import Image

from chatbot import models
from chatbot.storage import DatabaseStorage

pytestmark = pytest.mark.django_db


def png_bytes():
    data = io.BytesIO()
    Image.new("RGB", (8, 8), "blue").save(data, format="PNG")
    return data.getvalue()


PNG = png_bytes()


@pytest.fixture
def database_media_storage(monkeypatch):
    """Point MediaFile's FileField at DatabaseStorage, exactly as the
    MEDIA_STORAGE=database setting would at process startup."""
    storage = DatabaseStorage()
    field = models.MediaFile._meta.get_field("file")
    monkeypatch.setattr(field, "storage", storage)
    return storage


class TestDatabaseStorage:
    def test_save_open_size_delete_roundtrip(self):
        storage = DatabaseStorage()
        name = storage.save("uploads/render-test.png", ContentFile(PNG))
        assert storage.exists(name)
        assert storage.size(name) == len(PNG)
        with storage.open(name, "rb") as handle:
            assert handle.read() == PNG
        storage.delete(name)
        assert not storage.exists(name)

    def test_open_missing_file_raises_filenotfound(self):
        with pytest.raises(FileNotFoundError):
            DatabaseStorage().open("uploads/absent.png")

    def test_url_is_never_exposed(self):
        with pytest.raises(NotImplementedError):
            DatabaseStorage().url("uploads/render-test.png")

    def test_upload_api_persists_bytes_in_database(self, api_client, database_media_storage):
        uploaded = SimpleUploadedFile("photo.png", PNG, content_type="image/png")
        resp = api_client.post("/api/v1/upload/", {"file": uploaded}, format="multipart")
        assert resp.status_code == 201, resp.content
        body = resp.json()

        assert models.StoredObject.objects.count() == 1
        stored = models.StoredObject.objects.get()
        assert stored.name.endswith(".png")
        assert bytes(stored.content) == PNG
        assert stored.size == len(PNG)

        # The owner-checked media endpoint streams the same bytes back.
        fetched = api_client.get(body["url"])
        assert fetched.status_code == 200
        assert fetched["Content-Type"] == "image/png"
        assert b"".join(fetched.streaming_content) == PNG
        fetched.close()

    def test_duplicate_upload_dedupes_to_one_blob(self, api_client, database_media_storage):
        for _ in range(2):
            uploaded = SimpleUploadedFile("photo.png", PNG, content_type="image/png")
            resp = api_client.post("/api/v1/upload/", {"file": uploaded}, format="multipart")
            assert resp.status_code == 201, resp.content
        assert models.MediaFile.objects.count() == 1
        assert models.StoredObject.objects.count() == 1


CANONICAL = "pitstop-api-ab12.onrender.com"
INTERNAL = "pitstop-api-cd34:10000"


class TestPrivateNetworkHost:
    def _get_health(self, host):
        return Client().get("/health/live/", headers={"host": host})

    @override_settings(
        ALLOWED_HOSTS=[CANONICAL], TRUST_PRIVATE_NETWORK_HOST=True, CANONICAL_HOST=CANONICAL
    )
    def test_single_label_internal_host_is_accepted(self):
        assert self._get_health(INTERNAL).status_code == 200

    @override_settings(
        ALLOWED_HOSTS=[CANONICAL], TRUST_PRIVATE_NETWORK_HOST=True, CANONICAL_HOST=CANONICAL
    )
    def test_public_hostname_still_accepted(self):
        assert self._get_health(CANONICAL).status_code == 200

    @override_settings(
        ALLOWED_HOSTS=[CANONICAL], TRUST_PRIVATE_NETWORK_HOST=True, CANONICAL_HOST=CANONICAL
    )
    def test_unknown_dotted_host_is_rejected(self):
        assert self._get_health("evil.example.com").status_code == 400

    @override_settings(
        ALLOWED_HOSTS=[CANONICAL], TRUST_PRIVATE_NETWORK_HOST=False, CANONICAL_HOST=CANONICAL
    )
    def test_single_label_host_rejected_when_disabled(self):
        assert self._get_health(INTERNAL).status_code == 400
