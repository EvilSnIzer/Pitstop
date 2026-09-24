import hashlib
import json
import uuid
from contextlib import contextmanager
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response

from .errors import Problem
from .models import ChatSession, Operation


class SessionOperation:
    def __init__(self, session, record, token):
        self.session = session
        self.record = record
        self.token = token

    def complete(self, write):
        with transaction.atomic():
            # Fencing stops a timed-out worker from committing after its lease was reclaimed.
            session = ChatSession.objects.select_for_update().get(pk=self.session.pk)
            if session.busy_token != self.token:
                raise Problem("Another request superseded this operation.", "operation_expired")
            body, status = write(session)
            session.busy_token = None
            session.busy_until = None
            session.save()
            self.record.response = body
            self.record.status_code = status
            self.record.save(update_fields=["response", "status_code"])
            return Response(body, status=status, headers={"Idempotency-Key": str(self.record.key)})


@contextmanager
def session_operation(request, kind):
    try:
        key = uuid.UUID(request.headers.get("Idempotency-Key", str(uuid.uuid4())))
    except ValueError as exc:
        raise Problem("Idempotency-Key must be a UUID.", "invalid_idempotency_key", 400) from exc
    fingerprint = hashlib.sha256(
        json.dumps(request.data, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    token = uuid.uuid4()
    with transaction.atomic():
        session = get_object_or_404(ChatSession, pk=request.data["session_id"], user=request.user)
        record, _ = Operation.objects.get_or_create(
            user=request.user, key=key, kind=kind, defaults={"fingerprint": fingerprint}
        )
        if record.fingerprint != fingerprint:
            raise Problem("This key was used with a different request.", "idempotency_conflict")
        if record.response is not None:
            replay = Response(
                record.response, status=record.status_code, headers={"Idempotency-Replayed": "true"}
            )
        else:
            replay = None
            acquired = (
                ChatSession.objects.filter(pk=session.pk)
                .filter(Q(busy_until__isnull=True) | Q(busy_until__lt=timezone.now()))
                .update(busy_token=token, busy_until=timezone.now() + timedelta(seconds=120))
            )
            if not acquired:
                raise Problem("Another request is processing. Retry shortly.", "session_busy")
            session.refresh_from_db()
    if replay is not None:
        yield replay
        return
    try:
        yield SessionOperation(session, record, token)
    finally:
        # Provider/network work occurs outside transactions. Only final writes hold a lock.
        ChatSession.objects.filter(pk=session.pk, busy_token=token).update(
            busy_token=None, busy_until=None
        )
