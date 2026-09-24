import logging
import uuid

from django.db import OperationalError
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class Problem(APIException):
    def __init__(self, detail, code, status=409):
        self.status_code = status
        super().__init__({"detail": detail, "code": code})


def api_exception_handler(exc, context):
    if isinstance(exc, OperationalError):
        logger.exception("Database temporarily unavailable")
        exc = Problem("The service is busy. Please retry your saved request.", "database_busy", 503)
    response = exception_handler(exc, context)
    if response is not None:
        if "detail" not in response.data:
            response.data = {
                "detail": "Please check the highlighted fields.",
                "code": "validation_error",
                "errors": response.data,
            }
        response.data.setdefault("code", getattr(exc, "default_code", "request_failed"))
        request = context.get("request")
        response.data["request_id"] = getattr(request, "request_id", "")
    return response


class RequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid.uuid4())
        response = self.get_response(request)
        response["X-Request-ID"] = request.request_id
        # Never log bodies, media, cookies, credentials, or URL query strings.
        logger.info(
            "request id=%s method=%s path=%s status=%s",
            request.request_id,
            request.method,
            request.path,
            response.status_code,
        )
        return response
