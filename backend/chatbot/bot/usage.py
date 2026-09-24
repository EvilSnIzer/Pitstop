import time
from contextlib import contextmanager
from contextvars import ContextVar

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from chatbot.models import DailyAIUsage

_actor = ContextVar("ai_actor", default=None)
_deadline = ContextVar("ai_deadline", default=None)


class BudgetExceeded(Exception):
    pass


@contextmanager
def ai_context(user_id):
    actor = _actor.set(user_id)
    deadline = _deadline.set(time.monotonic() + 60)
    try:
        yield
    finally:
        _actor.reset(actor)
        _deadline.reset(deadline)


def remaining_seconds():
    deadline = _deadline.get()
    return max(0, deadline - time.monotonic()) if deadline else 40


def reserve_call():
    user_id = _actor.get()
    if user_id is None:
        raise RuntimeError("AI calls require an authenticated usage context")
    limits = [
        ("global", settings.AI_GLOBAL_DAILY_CALLS),
        (f"user:{user_id}", settings.AI_USER_DAILY_CALLS),
    ]
    with transaction.atomic():
        rows = []
        for scope, limit in limits:
            row, _ = DailyAIUsage.objects.get_or_create(scope=scope, day=timezone.now().date())
            row = DailyAIUsage.objects.select_for_update().get(pk=row.pk)
            if row.attempts >= limit:
                raise BudgetExceeded("Daily AI request budget reached")
            rows.append(row)
        for row in rows:
            row.attempts += 1
            row.save(update_fields=["attempts"])
    return [row.pk for row in rows]


def record_tokens(ids, metadata):
    from django.db.models import F

    if metadata is not None:
        DailyAIUsage.objects.filter(pk__in=ids).update(
            input_tokens=F("input_tokens") + (metadata.prompt_token_count or 0),
            output_tokens=F("output_tokens") + (metadata.candidates_token_count or 0),
        )
