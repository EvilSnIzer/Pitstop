from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AIScopeThrottle(UserRateThrottle):
    """Per-user cap on the endpoints that bill Gemini calls (chat, diagnosis)."""

    scope = "ai"


class UploadThrottle(UserRateThrottle):
    scope = "upload"


class AuthThrottle(AnonRateThrottle):
    scope = "auth"
