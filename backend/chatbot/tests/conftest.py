import pytest
from rest_framework.test import APIClient

from .factories import UserFactory


@pytest.fixture(autouse=True)
def clear_cache():
    # DRF's throttles keep their counters in Django's cache. Test transactions
    # roll back, so user pks repeat across tests and would otherwise consume a
    # later test's throttle budget. (Also why prod needs a real cache backend
    # behind the throttle counters.)
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user(db):
    return UserFactory()


@pytest.fixture
def api_client(user, db):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def mock_diagnosis(monkeypatch):
    """Patches the one LLM call that produces a Diagnosis; everything else in
    the API flow is deterministic and runs for real."""
    calls = []

    def fake(context):
        calls.append(context)
        return {
            "summary": (
                "Soft, spongy pedal with gradual worsening points to worn brake pads and a low "
                "master-cylinder level."
            ),
            "recommended_service": "Brake pad replacement and brake fluid flush",
            "confidence": 0.82,
        }

    from chatbot.bot import gemini

    monkeypatch.setattr(gemini, "generate_diagnosis", fake)
    return calls


@pytest.fixture(autouse=True)
def forbid_provider_network(monkeypatch, settings, tmp_path):
    import httpx

    from chatbot.bot import gemini

    def forbidden(*args, **kwargs):
        pytest.fail("A test attempted a real provider request")

    monkeypatch.setenv("GEMINI_API_KEY", "")
    gemini._client.cache_clear()
    monkeypatch.setattr(httpx.Client, "send", forbidden)
    monkeypatch.setattr(httpx.AsyncClient, "send", forbidden)
    settings.MEDIA_ROOT = tmp_path / "media"
