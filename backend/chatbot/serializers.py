from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from . import models
from .bot import state_machine as sm
from .media import ALLOWED


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True, min_length=8, style={"input_type": "password"}
    )

    def validate_email(self, email):
        email = email.strip().lower()
        if models.AccountEmail.objects.filter(canonical=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        if len(email) > 150:
            raise serializers.ValidationError("Email must be at most 150 characters.")
        return email

    def validate(self, attrs):
        try:
            validate_password(
                attrs["password"], User(username=attrs["email"], email=attrs["email"])
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs

    def create(self, validated_data):
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    username=validated_data["email"],
                    email=validated_data["email"],
                    password=validated_data["password"],
                )
                models.AccountEmail.objects.create(user=user, canonical=validated_data["email"])
                refresh = RefreshToken.for_user(user)
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"email": "An account with this email already exists."}
            ) from exc
        return {
            "user": {"email": user.email},
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        email = attrs[self.username_field].strip().lower()
        account = models.AccountEmail.objects.select_related("user").filter(canonical=email).first()
        attrs[self.username_field] = account.user.username if account else email
        return super().validate(attrs)


class UserSerializer(serializers.Serializer):
    email = serializers.EmailField()


class TokenPairSerializer(serializers.Serializer):
    user = UserSerializer(required=False)
    access = serializers.CharField()
    refresh = serializers.CharField()


class ChatSessionSerializer(serializers.ModelSerializer):
    diagnosis_ready = serializers.SerializerMethodField()

    class Meta:
        model = models.ChatSession
        fields = ("id", "status", "diagnosis_ready", "created_at", "updated_at")

    def get_diagnosis_ready(self, obj) -> bool:
        return obj.status == models.ChatSession.in_progress and sm.is_ready(obj.slots)


class MessageSerializer(serializers.ModelSerializer):
    media_url = serializers.SerializerMethodField()

    class Meta:
        model = models.Message
        fields = ("id", "role", "content", "media_url", "media_type", "created_at")
        read_only_fields = fields

    def get_media_url(self, obj) -> str | None:
        if obj.media_file_id is None:
            return None
        return f"/api/v1/media/{obj.media_file_id}/"


class DiagnosisSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Diagnosis
        fields = ("id", "summary", "recommended_service", "confidence", "created_at")


class BookingSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Booking
        fields = ("id", "status", "scheduled_at", "created_at")
        read_only_fields = ("status",)


class MediaFileSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = models.MediaFile
        fields = ("id", "url", "mime_type", "size", "created_at")

    def get_url(self, obj) -> str:
        return f"/api/v1/media/{obj.pk}/"


class ChatRequestSerializer(serializers.Serializer):
    session_id = serializers.IntegerField()
    content = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    media_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        if not (attrs.get("content") or "").strip() and attrs.get("media_id") is None:
            raise serializers.ValidationError("Provide message text or a media_id.")
        return attrs


class ChatResponseSerializer(serializers.Serializer):
    message = MessageSerializer()
    session = ChatSessionSerializer()


class HistorySerializer(serializers.Serializer):
    session = ChatSessionSerializer()
    messages = MessageSerializer(many=True)
    diagnosis = DiagnosisSerializer(allow_null=True)
    booking = BookingSerializer(allow_null=True)
    older_cursor = serializers.IntegerField(allow_null=True)


class FileUploadSerializer(serializers.Serializer):
    file = serializers.FileField()


class ErrorDetailSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField(required=False)
    request_id = serializers.UUIDField(required=False)
    errors = serializers.JSONField(required=False)


class SessionReferenceSerializer(serializers.Serializer):
    session_id = serializers.IntegerField()


class BookingCreateSerializer(serializers.Serializer):
    session_id = serializers.IntegerField()
    scheduled_at = serializers.DateTimeField()


class SessionListSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.CharField(allow_null=True)
    previous = serializers.CharField(allow_null=True)
    results = ChatSessionSerializer(many=True)


class SessionListQuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    status = serializers.ChoiceField(choices=models.ChatSession.STATUS_CHOICES, required=False)
    search = serializers.CharField(max_length=100, required=False, allow_blank=True)


class HistoryQuerySerializer(serializers.Serializer):
    before = serializers.IntegerField(min_value=1, required=False)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class UploadTicketRequestSerializer(serializers.Serializer):
    mime_type = serializers.ChoiceField(choices=list(ALLOWED))
    size = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        if attrs["size"] > ALLOWED[attrs["mime_type"]][0]:
            raise serializers.ValidationError("File too large. Images: 7 MiB; audio/video: 15 MiB.")
        return attrs


class UploadTicketSerializer(serializers.Serializer):
    token = serializers.CharField()
    expires_in = serializers.IntegerField()
