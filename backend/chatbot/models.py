from django.conf import settings
from django.db import models
from django.db.models import Q


class ChatSession(models.Model):
    in_progress = "in_progress"
    diagnosed = "diagnosed"
    booked = "booked"
    STATUS_CHOICES = (
        (in_progress, "in_progress"),
        (diagnosed, "diagnosed"),
        (booked, "booked"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions"
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=in_progress)
    # Deterministic intake slots maintained by chatbot.bot.state_machine.
    slots = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    busy_token = models.UUIDField(null=True, editable=False)
    busy_until = models.DateTimeField(null=True, editable=False)

    class Meta:
        indexes = [models.Index(fields=["user", "-updated_at", "-id"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=["in_progress", "diagnosed", "booked"]),
                name="session_valid_status",
            )
        ]

    def __str__(self):
        return f"Session {self.pk} ({self.status})"


class StoredObject(models.Model):
    """Blob row behind chatbot.storage.DatabaseStorage (MEDIA_STORAGE=database).

    Free Render instances lose their filesystem on every restart and cannot
    attach persistent disks, so the database is the only durable private
    storage available. Upload validation caps files at 15 MiB; the free
    Render Postgres plan holds 1 GB.
    """

    name = models.CharField(max_length=255, primary_key=True)
    content = models.BinaryField()
    size = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class MediaFile(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="media_files"
    )
    file = models.FileField(upload_to="uploads/%Y/%m/%d/")
    mime_type = models.CharField(max_length=64)
    size = models.PositiveIntegerField()
    sha256 = models.CharField(max_length=64, blank=True)
    analysis = models.TextField(null=True, blank=True)
    analysis_version = models.CharField(max_length=40, blank=True)
    analysis_token = models.UUIDField(null=True, editable=False)
    analysis_until = models.DateTimeField(null=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)


class Message(models.Model):
    user = "user"
    assistant = "assistant"
    ROLE_CHOICES = (
        (user, "user"),
        (assistant, "assistant"),
    )

    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    content = models.TextField(blank=True)
    # FK (not a FileField) so the upload row stays the single owner of the file.
    media_file = models.ForeignKey(
        MediaFile, null=True, blank=True, on_delete=models.SET_NULL, related_name="messages"
    )
    media_type = models.CharField(max_length=64, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # auto_now_add timestamps carry microseconds, but the id tiebreaker keeps
        # ordering deterministic if two messages ever share a timestamp.
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["session", "id"])]

    def __str__(self):
        return f"{self.role}: {self.content[:40]}"


class Diagnosis(models.Model):
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="diagnoses")
    summary = models.TextField()
    recommended_service = models.CharField(max_length=255)
    confidence = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session"], name="one_diagnosis_per_session"),
            models.CheckConstraint(
                condition=Q(confidence__gte=0, confidence__lte=1), name="diagnosis_confidence_range"
            ),
        ]


class Booking(models.Model):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    STATUS_CHOICES = (
        (pending, "pending"),
        (confirmed, "confirmed"),
        (cancelled, "cancelled"),
    )

    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="bookings")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=pending)
    scheduled_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session"], name="one_booking_per_session"),
            models.CheckConstraint(
                condition=Q(status__in=["pending", "confirmed", "cancelled"]),
                name="booking_valid_status",
            ),
        ]


class AccountEmail(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    canonical = models.EmailField(unique=True)


class Operation(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.UUIDField()
    kind = models.CharField(max_length=16)
    fingerprint = models.CharField(max_length=64)
    response = models.JSONField(null=True)
    status_code = models.PositiveSmallIntegerField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "kind", "key"], name="operation_idempotency")
        ]


class DailyAIUsage(models.Model):
    scope = models.CharField(max_length=48)
    day = models.DateField()
    attempts = models.PositiveIntegerField(default=0)
    input_tokens = models.PositiveBigIntegerField(default=0)
    output_tokens = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["scope", "day"], name="daily_ai_scope")]
