import os
import re
from datetime import timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

PRODUCTION = os.environ.get("APP_ENV") == "production"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "development-only-" * 4)
DEBUG = os.environ.get("DJANGO_DEBUG", "0" if PRODUCTION else "1") == "1"
if PRODUCTION and (len(SECRET_KEY) < 50 or SECRET_KEY.startswith("development-only") or DEBUG):
    raise ImproperlyConfigured("Production requires DEBUG=0 and a random 50+ character secret")

ADMIN_ENABLED = os.environ.get("DJANGO_ADMIN_ENABLED", "0" if PRODUCTION else "1") == "1"

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]

if os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "corsheaders",
    "chatbot",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "chatbot.errors.RequestLogMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
        "OPTIONS": {"timeout": 10},
    }
}
if os.environ.get("DATABASE_URL"):
    db = urlparse(os.environ["DATABASE_URL"])
    if db.scheme not in ("postgres", "postgresql"):
        raise ImproperlyConfigured("DATABASE_URL must use PostgreSQL")
    DATABASES["default"] = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(db.path.lstrip("/")),
        "USER": unquote(db.username or ""),
        "PASSWORD": unquote(db.password or ""),
        "HOST": db.hostname,
        "PORT": db.port or 5432,
        "CONN_MAX_AGE": 60,
        "OPTIONS": {
            "sslmode": os.environ.get("DB_SSLMODE", "prefer"),
            "connect_timeout": 10,
        },
    }
    schema = os.environ.get("DATABASE_SCHEMA", "")
    if schema:
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", schema):
            raise ImproperlyConfigured("DATABASE_SCHEMA must be a lowercase PostgreSQL identifier")
        # Supabase's public Data API must not expose Django auth/application tables.
        DATABASES["default"]["OPTIONS"]["options"] = f"-c search_path={schema}"

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
if os.environ.get("REDIS_URL"):
    CACHES["default"] = {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.environ["REDIS_URL"],
    }
if PRODUCTION and (
    not os.environ.get("DATABASE_URL") or not os.environ.get("REDIS_URL") or "*" in ALLOWED_HOSTS
):
    raise ImproperlyConfigured("Production requires PostgreSQL, Redis and explicit allowed hosts")
AI_USER_DAILY_CALLS = int(os.environ.get("AI_USER_DAILY_CALLS", "100"))
AI_GLOBAL_DAILY_CALLS = int(os.environ.get("AI_GLOBAL_DAILY_CALLS", "2000"))

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media")))
DATA_UPLOAD_MAX_MEMORY_SIZE = 18 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024
if PRODUCTION and os.environ.get("RENDER") and not os.environ.get("AWS_STORAGE_BUCKET_NAME"):
    raise ImproperlyConfigured("Render requires persistent object storage for uploaded media")

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
AWS_STORAGE_BUCKET_NAME = os.environ.get("AWS_STORAGE_BUCKET_NAME", "")
if AWS_STORAGE_BUCKET_NAME:
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": AWS_STORAGE_BUCKET_NAME,
            "endpoint_url": os.environ.get("AWS_S3_ENDPOINT_URL"),
            "region_name": os.environ.get("AWS_S3_REGION_NAME"),
            "addressing_style": "path",
            "signature_version": "s3v4",
            "max_memory_size": 1024 * 1024,
            "default_acl": None,
            "querystring_auth": True,
            "file_overwrite": False,
        },
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "NUM_PROXIES": 1,
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "EXCEPTION_HANDLER": "chatbot.errors.api_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": ("rest_framework.throttling.UserRateThrottle",),
    "DEFAULT_THROTTLE_RATES": {
        # "ai" (chatbot.throttles.AIScopeThrottle) guards the two endpoints that
        # bill Gemini calls; everything else falls under the general buckets.
        "user": "120/minute",
        "ai": "20/minute",
        "upload": "30/hour",
        "anon": "10/minute",
        "auth": os.environ.get("AUTH_THROTTLE_RATE", "10/minute"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

SPECTACULAR_SETTINGS = {
    "TITLE": "AI Car Mechanic API",
    "DESCRIPTION": "Chat-based vehicle troubleshooting with LLM-assisted diagnosis and bookings.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "chatbot": {"handlers": ["console"], "level": "INFO"},
    },
}

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = PRODUCTION
CSRF_COOKIE_SECURE = PRODUCTION
SECURE_SSL_REDIRECT = PRODUCTION
SECURE_HSTS_SECONDS = 31536000 if PRODUCTION else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = PRODUCTION
SECURE_HSTS_PRELOAD = PRODUCTION
SECURE_CONTENT_TYPE_NOSNIFF = True

CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if o]

CORS_ALLOW_HEADERS = (*default_headers, "x-upload-token")
CORS_EXPOSE_HEADERS = ["X-Request-ID", "Retry-After"]
