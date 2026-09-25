from django.conf import settings
from django.core.cache import cache
from django.db import connection, transaction
from django.http import FileResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import models, serializers
from .bot import classifier, gemini
from .bot import state_machine as sm
from .bot.usage import ai_context
from .errors import Problem
from .media import UploadError, UploadSizeLimit, analyze_once, store_upload, validate_upload
from .operations import session_operation
from .throttles import AIScopeThrottle, AuthThrottle, UploadThrottle
from .upload_auth import TTL, UploadTicketAuthentication, issue_upload_ticket

IDEMPOTENCY = OpenApiParameter(
    "Idempotency-Key",
    str,
    OpenApiParameter.HEADER,
    description="UUID: reuse for retries of the same body; changed body returns 409.",
)


def _owned_session(request, session_id):
    return get_object_or_404(models.ChatSession, id=session_id, user=request.user)


@extend_schema(
    request=serializers.RegisterSerializer, responses={201: serializers.TokenPairSerializer}
)
class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthThrottle]

    def post(self, request):
        serializer = serializers.RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.save(), status=201)


class LoginView(TokenObtainPairView):
    serializer_class = serializers.LoginSerializer
    throttle_classes = [AuthThrottle]


class RefreshView(TokenRefreshView):
    throttle_classes = [AuthThrottle]


class MeView(APIView):
    @extend_schema(responses=serializers.UserSerializer)
    def get(self, request):
        return Response({"email": request.user.email})


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthThrottle]

    @extend_schema(request=serializers.LogoutSerializer, responses={204: None})
    def post(self, request):
        serializer = serializers.LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            # Already expired/revoked tokens are also successfully logged out.
            return Response(status=204)
        return Response(status=204)


class SessionView(APIView):
    @extend_schema(request=None, responses={201: serializers.ChatSessionSerializer})
    def post(self, request):
        with transaction.atomic():
            session = models.ChatSession.objects.create(user=request.user)
            models.Message.objects.create(session=session, role="assistant", content=sm.GREETING)
        return Response(serializers.ChatSessionSerializer(session).data, status=201)

    @extend_schema(
        parameters=[serializers.SessionListQuerySerializer],
        responses=serializers.SessionListSerializer,
    )
    def get(self, request):
        query = serializers.SessionListQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        qs = request.user.sessions.order_by("-updated_at", "-id")
        if data.get("status"):
            qs = qs.filter(status=data["status"])
        if data.get("search"):
            search = data["search"].replace("Conversation", "").strip().lstrip("#")
            qs = qs.filter(pk=int(search)) if search.isdigit() else qs.none()
        page = data["page"]
        offset = (page - 1) * 20
        count = qs.count()

        def link(number):
            params = request.query_params.copy()
            params["page"] = number
            return f"/api/v1/sessions/?{params.urlencode()}"

        return Response(
            {
                "count": count,
                "next": link(page + 1) if offset + 20 < count else None,
                "previous": link(page - 1) if page > 1 else None,
                "results": serializers.ChatSessionSerializer(
                    qs[offset : offset + 20], many=True
                ).data,
            }
        )


class HistoryView(APIView):
    @extend_schema(
        parameters=[serializers.HistoryQuerySerializer], responses=serializers.HistorySerializer
    )
    def get(self, request, session_id):
        session = _owned_session(request, session_id)
        query = serializers.HistoryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        messages = session.messages.select_related("media_file")
        if query.validated_data.get("before"):
            messages = messages.filter(id__lt=query.validated_data["before"])
        rows = list(messages.order_by("-id")[:51])
        older = len(rows) > 50
        rows = list(reversed(rows[:50]))
        diagnosis = session.diagnoses.first()
        booking = session.bookings.first()
        return Response(
            {
                "session": serializers.ChatSessionSerializer(session).data,
                "messages": serializers.MessageSerializer(rows, many=True).data,
                "older_cursor": rows[0].id if older else None,
                "diagnosis": serializers.DiagnosisSerializer(diagnosis).data if diagnosis else None,
                "booking": serializers.BookingSerializer(booking).data if booking else None,
            }
        )


class ChatView(APIView):
    throttle_classes = [AIScopeThrottle]

    @extend_schema(
        parameters=[IDEMPOTENCY],
        request=serializers.ChatRequestSerializer,
        responses={200: serializers.ChatResponseSerializer, 409: serializers.ErrorDetailSerializer},
    )
    def post(self, request):
        serializer = serializers.ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with session_operation(request, "chat") as operation:
            if isinstance(operation, Response):
                return operation
            session = operation.session
            content = data.get("content", "").strip()
            media = (
                get_object_or_404(models.MediaFile, pk=data["media_id"], user=request.user)
                if "media_id" in data
                else None
            )
            phase = (
                session.status
                if session.status != "in_progress"
                else (sm.PHASE_IN_PROGRESS if session.slots else sm.PHASE_NEW)
            )
            analyses, note = [], ""
            with ai_context(request.user.pk):
                related = (
                    classifier.is_car_related(content, session.slots)
                    if content and session.status == "in_progress"
                    else True
                )
                if media and related and session.status == "in_progress":
                    try:
                        analysis = analyze_once(media)
                        if analysis and analysis not in session.slots.get("media", []):
                            analyses.append(analysis)
                    except (gemini.GeminiError, OSError):
                        note = (
                            " I couldn't process that media. Your file is saved; "
                            "please describe the issue in words."
                        )
            step = sm.advance(phase, session.slots, content, related, analyses)

            def write(locked):
                if media:
                    # Coordinate attachment commits with orphan cleanup, not provider latency.
                    get_object_or_404(models.MediaFile.objects.select_for_update(), pk=media.pk)
                models.Message.objects.create(
                    session=locked,
                    role="user",
                    content=content,
                    media_file=media,
                    media_type=media.mime_type if media else None,
                )
                reply = models.Message.objects.create(
                    session=locked, role="assistant", content=step.reply + note
                )
                locked.slots = step.slots
                locked.updated_at = timezone.now()
                return {
                    "message": serializers.MessageSerializer(reply).data,
                    "session": serializers.ChatSessionSerializer(locked).data,
                }, 200

            return operation.complete(write)


class UploadTicketView(APIView):
    @extend_schema(
        request=serializers.UploadTicketRequestSerializer,
        responses={200: serializers.UploadTicketSerializer},
    )
    def post(self, request):
        serializer = serializers.UploadTicketRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            {
                "token": issue_upload_ticket(request.user, serializer.validated_data),
                "expires_in": TTL,
            },
            headers={"Cache-Control": "private, no-store"},
        )


class UploadView(APIView):
    throttle_classes = [UploadThrottle]
    authentication_classes = [UploadTicketAuthentication, JWTAuthentication]
    parser_classes = [MultiPartParser]

    def initialize_request(self, request, *args, **kwargs):
        request.upload_handlers.insert(0, UploadSizeLimit(request))
        return super().initialize_request(request, *args, **kwargs)

    @extend_schema(
        request=serializers.FileUploadSerializer, responses={201: serializers.MediaFileSerializer}
    )
    def post(self, request):
        serializer = serializers.FileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file = serializer.validated_data["file"]
        if isinstance(request.auth, dict) and (
            file.size != request.auth["size"] or file.content_type != request.auth["mime_type"]
        ):
            raise Problem("The file does not match its upload permission.", "upload_mismatch", 400)
        try:
            mime = validate_upload(file, file.content_type or "")
        except UploadError as exc:
            raise Problem(str(exc), "invalid_media", 400) from exc
        media = store_upload(request.user, file, mime)
        return Response(serializers.MediaFileSerializer(media).data, status=201)


class MediaView(APIView):
    @extend_schema(responses={(200, "application/octet-stream"): bytes, 302: None})
    def get(self, request, media_id):
        media = get_object_or_404(models.MediaFile, pk=media_id, user=request.user)
        if settings.MEDIA_STORAGE == "s3":
            # Only the owner can mint a short-lived read URL; file bytes bypass serverless limits.
            response = HttpResponseRedirect(media.file.storage.url(media.file.name, expire=60))
            response["Cache-Control"] = "private, no-store"
            response["Referrer-Policy"] = "no-referrer"
            return response
        try:
            file = media.file.open("rb")
        except OSError as exc:
            raise Problem("This attachment is unavailable.", "media_unavailable", 503) from exc
        response = FileResponse(file, content_type=media.mime_type)
        response["Cache-Control"] = "private, no-store"
        response["Content-Security-Policy"] = "sandbox; default-src 'none'"
        response["X-Content-Type-Options"] = "nosniff"
        return response


def _diagnosis_context(session):
    lines = [
        f"Vehicle: {session.slots.get('vehicle')} ({session.slots.get('year')})",
        f"Original symptom: {session.slots.get('symptom')}",
        f"Onset: {session.slots.get('onset')}",
    ]
    lines.extend(f"Media observation: {item}" for item in session.slots.get("media", [])[-3:])
    recent = list(session.messages.filter(role="user").order_by("-id")[:20])
    lines.extend(f"User observation: {message.content}" for message in reversed(recent))
    return "\n".join(lines)[:20000]


class DiagnosisView(APIView):
    throttle_classes = [AIScopeThrottle]

    @extend_schema(
        parameters=[IDEMPOTENCY],
        request=serializers.SessionReferenceSerializer,
        responses={
            200: serializers.DiagnosisSerializer,
            201: serializers.DiagnosisSerializer,
            503: serializers.ErrorDetailSerializer,
        },
    )
    def post(self, request):
        serializer = serializers.SessionReferenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with session_operation(request, "diagnosis") as operation:
            if isinstance(operation, Response):
                return operation
            session = operation.session
            existing = session.diagnoses.first()
            if existing:
                return operation.complete(
                    lambda locked: (serializers.DiagnosisSerializer(existing).data, 200)
                )
            if session.status != "in_progress" or not sm.is_ready(session.slots):
                raise Problem(
                    "Answer the outstanding intake questions first.", "intake_incomplete", 400
                )
            try:
                with ai_context(request.user.pk):
                    result = gemini.generate_diagnosis(_diagnosis_context(session))
            except gemini.GeminiNotConfiguredError as exc:
                raise Problem(
                    "AI diagnosis is not connected yet. The app owner must configure the provider. "
                    "Your conversation is saved.",
                    "ai_not_configured",
                    503,
                ) from exc
            except gemini.GeminiBudgetError as exc:
                raise Problem(
                    "The daily AI allowance has been reached. Your conversation is saved.",
                    "ai_budget_exceeded",
                    429,
                ) from exc
            except gemini.GeminiConfigurationError as exc:
                raise Problem(
                    "The AI provider rejected the configuration. Contact the app owner.",
                    "ai_configuration_error",
                    503,
                ) from exc
            except gemini.GeminiUnavailableError as exc:
                raise Problem(
                    "AI is temporarily unavailable. Your conversation is saved; retry shortly.",
                    "ai_unavailable",
                    503,
                ) from exc
            except gemini.GeminiError as exc:
                raise Problem(
                    "AI returned an invalid assessment. No diagnosis was saved.",
                    "ai_invalid_response",
                    502,
                ) from exc

            def write(locked):
                diagnosis = models.Diagnosis.objects.create(session=locked, **result)
                locked.status = "diagnosed"
                return serializers.DiagnosisSerializer(diagnosis).data, 201

            return operation.complete(write)


class BookingCreateView(APIView):
    @extend_schema(
        parameters=[IDEMPOTENCY],
        request=serializers.BookingCreateSerializer,
        responses={201: serializers.BookingSerializer, 409: serializers.ErrorDetailSerializer},
    )
    def post(self, request):
        serializer = serializers.BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with session_operation(request, "booking") as operation:
            if isinstance(operation, Response):
                return operation
            when = serializer.validated_data["scheduled_at"]
            if when <= timezone.now():
                raise Problem("Choose a future booking time.", "invalid_booking_time", 400)

            def write(locked):
                if locked.status != "diagnosed" or locked.bookings.exists():
                    raise Problem(
                        "A booking requires a diagnosed, unbooked session.", "booking_conflict"
                    )
                booking = models.Booking.objects.create(session=locked, scheduled_at=when)
                locked.status = "booked"
                return serializers.BookingSerializer(booking).data, 201

            return operation.complete(write)


class BookingDetailView(APIView):
    @extend_schema(responses=serializers.BookingSerializer)
    def get(self, request, booking_id):
        booking = get_object_or_404(models.Booking, pk=booking_id, session__user=request.user)
        return Response(serializers.BookingSerializer(booking).data)


def health(request):
    # Deliberately unauthenticated for the load balancer; no credentials or dependency details.
    return JsonResponse({"status": "ok"})


def readiness(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        cache.set("readiness", True, timeout=10)
        if not cache.get("readiness"):
            return JsonResponse({"status": "unavailable"}, status=503)
    except Exception:
        return JsonResponse({"status": "unavailable"}, status=503)
    return JsonResponse({"status": "ready"})
