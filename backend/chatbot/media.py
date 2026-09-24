import hashlib
import json
import math
import subprocess
import tempfile
import uuid
from datetime import timedelta

from django.core.files.uploadhandler import FileUploadHandler
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from PIL import Image, UnidentifiedImageError

from .bot import gemini, prompts
from .errors import Problem
from .models import MediaFile

IMAGE_MAX = 7 * 1024 * 1024
AUDIO_MAX = VIDEO_MAX = 15 * 1024 * 1024
ALLOWED = {
    "image/jpeg": (IMAGE_MAX, ".jpg"),
    "image/png": (IMAGE_MAX, ".png"),
    "image/webp": (IMAGE_MAX, ".webp"),
    "audio/mpeg": (AUDIO_MAX, ".mp3"),
    "audio/wav": (AUDIO_MAX, ".wav"),
    "audio/webm": (AUDIO_MAX, ".webm"),
    "audio/ogg": (AUDIO_MAX, ".ogg"),
    "video/mp4": (VIDEO_MAX, ".mp4"),
    "video/webm": (VIDEO_MAX, ".webm"),
}
Image.MAX_IMAGE_PIXELS = 16_000_000


class UploadError(Exception):
    pass


def validate_upload(file, claimed_mime):
    if claimed_mime not in ALLOWED:
        raise UploadError(
            "File type not supported. Use JPEG, PNG, WebP, MP3, WAV, OGG, WebM or MP4."
        )
    if not file.size or file.size > ALLOWED[claimed_mime][0]:
        raise UploadError("File is empty or too large. Images: 7 MB; audio/video: 15 MB.")
    if claimed_mime.startswith("image/"):
        try:
            with Image.open(file) as image:
                actual = Image.MIME.get(image.format)
                if actual != claimed_mime:
                    raise UploadError("File contents don't match the declared type.")
                if image.width * image.height > 16_000_000 or getattr(image, "is_animated", False):
                    raise UploadError("Use a still image no larger than 16 megapixels.")
                image.verify()
        except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as exc:
            raise UploadError("This is not a valid supported image.") from exc
        finally:
            file.seek(0)
    else:
        with tempfile.NamedTemporaryFile(suffix=ALLOWED[claimed_mime][1]) as temp:
            for chunk in file.chunks():
                temp.write(chunk)
            temp.flush()
            try:
                result = subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-protocol_whitelist",
                        "file,pipe",
                        "-show_format",
                        "-show_streams",
                        "-of",
                        "json",
                        temp.name,
                    ],
                    capture_output=True,
                    timeout=5,
                    check=True,
                )
                info = json.loads(result.stdout)
                duration = float(info.get("format", {}).get("duration", 0))
                streams = info.get("streams", [])
                video = any(s.get("codec_type") == "video" for s in streams)
                audio = any(s.get("codec_type") == "audio" for s in streams)
                formats = info.get("format", {}).get("format_name", "").split(",")
                container = {
                    "audio/mpeg": "mp3",
                    "audio/wav": "wav",
                    "audio/ogg": "ogg",
                    "audio/webm": "webm",
                    "video/webm": "webm",
                    "video/mp4": "mp4",
                }
                if (
                    container[claimed_mime] not in formats
                    or not math.isfinite(duration)
                    or not 0 < duration <= 60
                    or not (audio or video)
                    or (claimed_mime.startswith("audio/") and video)
                    or (claimed_mime.startswith("video/") and not video)
                ):
                    raise UploadError("Media must match its type and be no longer than 60 seconds.")
            except FileNotFoundError as exc:
                raise Problem(
                    "Media validation is unavailable.", "media_validator_unavailable", 503
                ) from exc
            except (subprocess.SubprocessError, ValueError) as exc:
                raise UploadError(
                    "This media could not be validated. Please use a different file."
                ) from exc
            finally:
                file.seek(0)
    return claimed_mime


def store_upload(user, file, mime):
    digest = hashlib.sha256()
    for chunk in file.chunks():
        digest.update(chunk)
    file.seek(0)
    existing = MediaFile.objects.filter(
        user=user, sha256=digest.hexdigest(), mime_type=mime
    ).first()
    if existing:
        return existing
    # Never retain an attacker-controlled filename/extension or expose a storage URL.
    file.name = f"{uuid.uuid4().hex}{ALLOWED[mime][1]}"
    return MediaFile.objects.create(
        user=user, file=file, mime_type=mime, size=file.size, sha256=digest.hexdigest()
    )


def analyze_once(media):
    version = f"{prompts.PROMPT_VERSION}:{gemini.MODEL}"
    token = uuid.uuid4()
    with transaction.atomic():
        media = get_object_or_404(MediaFile.objects.select_for_update(), pk=media.pk)
        if media.analysis is not None and media.analysis_version == version:
            return media.analysis
        if media.analysis_until and media.analysis_until > timezone.now():
            raise Problem("This media is already being analyzed. Retry shortly.", "media_busy")
        media.analysis_token = token
        media.analysis_until = timezone.now() + timedelta(seconds=120)
        media.save(update_fields=["analysis_token", "analysis_until"])
    try:
        with media.file.open("rb") as file:
            analysis = gemini.analyze_media(file.read(), media.mime_type)
        stored = MediaFile.objects.filter(pk=media.pk, analysis_token=token).update(
            analysis=analysis, analysis_version=version
        )
        if not stored:
            raise Problem("Media analysis was superseded. Retry shortly.", "media_busy")
        return analysis
    finally:
        MediaFile.objects.filter(pk=media.pk, analysis_token=token).update(
            analysis_token=None, analysis_until=None
        )


class UploadSizeLimit(FileUploadHandler):
    def __init__(self, request):
        super().__init__(request)
        self.received = 0

    def receive_data_chunk(self, raw_data, start):
        self.received += len(raw_data)
        if self.received > VIDEO_MAX:
            raise Problem("File is too large. Maximum upload: 15 MiB.", "invalid_media", 400)
        return raw_data

    def file_complete(self, file_size):
        return None
