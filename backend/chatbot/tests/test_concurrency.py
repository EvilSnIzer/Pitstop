import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from django.db import close_old_connections, connection, connections
from rest_framework.test import APIClient

from chatbot.bot import gemini, usage
from chatbot.models import DailyAIUsage

from .factories import ChatSessionFactory, UserFactory

pytestmark = pytest.mark.django_db(transaction=True)


def test_concurrent_diagnosis_only_invokes_provider_once(monkeypatch):
    if connection.vendor != "postgresql":
        pytest.skip("Row-concurrency behavior is verified against PostgreSQL in CI")
    user = UserFactory()
    session = ChatSessionFactory(
        user=user, slots={"symptom": "oil leak", "vehicle": "BMW", "year": 1990, "onset": "sudden"}
    )
    entered, release = threading.Event(), threading.Event()
    calls = []

    def provider(context):
        calls.append(context)
        entered.set()
        assert release.wait(10)
        return {"summary": "inspect leak", "recommended_service": "inspection", "confidence": 0.7}

    monkeypatch.setattr(gemini, "generate_diagnosis", provider)

    def request():
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(user)
            return client.post(
                "/api/v1/diagnosis/", {"session_id": session.id}, format="json"
            ).status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(request)
        assert entered.wait(10)
        try:
            assert executor.submit(request).result(timeout=10) == 409
        finally:
            release.set()
        assert first.result(timeout=10) == 201
    assert len(calls) == 1
    assert session.diagnoses.count() == 1


def test_concurrent_budget_reservations_do_not_overspend(settings):
    if connection.vendor != "postgresql":
        pytest.skip("Quota contention is verified against PostgreSQL in CI")
    user = UserFactory()
    settings.AI_GLOBAL_DAILY_CALLS = 1
    barrier = threading.Barrier(2)

    def reserve():
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            with usage.ai_context(user.pk):
                try:
                    usage.reserve_call()
                    return True
                except usage.BudgetExceeded:
                    return False
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: reserve(), range(2)))
    assert sorted(results) == [False, True]
    assert DailyAIUsage.objects.get(scope="global").attempts == 1
