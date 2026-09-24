import uuid

from django.contrib.auth import get_user_model
from django.core import signing
from django.core.cache import cache
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

SALT = "pitstop-upload-v1"
TTL = 120


def issue_upload_ticket(user, data):
    return signing.dumps({"user": user.pk, "nonce": uuid.uuid4().hex, **data}, salt=SALT)


class UploadTicketAuthentication(BaseAuthentication):
    def authenticate(self, request):
        token = request.headers.get("X-Upload-Token")
        if not token:
            return None
        try:
            payload = signing.loads(token, salt=SALT, max_age=TTL)
        except signing.BadSignature as exc:
            raise AuthenticationFailed(
                "Upload permission expired or invalid. Retry the upload."
            ) from exc
        user = get_user_model().objects.filter(pk=payload["user"], is_active=True).first()
        if user is None:
            raise AuthenticationFailed("This account is unavailable.")
        if not cache.add(f"upload-ticket:{payload['nonce']}", True, timeout=TTL + 1):
            raise AuthenticationFailed(
                "Upload permission was already used. Retry with a new ticket."
            )
        return user, payload

    def authenticate_header(self, request):
        return "UploadTicket"


class UploadTicketScheme(OpenApiAuthenticationExtension):
    target_class = UploadTicketAuthentication
    name = "uploadTicket"

    def get_security_definition(self, auto_schema):
        return {"type": "apiKey", "in": "header", "name": "X-Upload-Token"}
