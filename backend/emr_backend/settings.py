"""Django settings for the EMR backend project."""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path
import os
from urllib.parse import quote

from dotenv import load_dotenv


# ---------------------------------------------------------------------------
# Paths & Environment Loading
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

DJANGO_ENV = os.environ.get("DJANGO_ENV", "local")
IS_LOCAL_ENV = DJANGO_ENV == "local"
IS_STRICT_ENV = not IS_LOCAL_ENV
# Try env/ directory first (for docker-compose setups)
env_file = BASE_DIR / "env" / f"{DJANGO_ENV}.env"

if env_file.exists():
    load_dotenv(env_file)
else:
    # Keep local dev ergonomic, but fail fast in non-local environments.
    if IS_LOCAL_ENV:
        fallback_env = BASE_DIR / f".env.{DJANGO_ENV}"
        if fallback_env.exists():
            load_dotenv(fallback_env)
        else:
            final_fallback = BASE_DIR / ".env"
            if final_fallback.exists():
                load_dotenv(final_fallback)
    else:
        raise RuntimeError(
            f"Expected environment file not found: {env_file}. "
            "Refusing to use implicit .env fallbacks outside local."
        )


def getenv_strict(name: str, default: str | None = None) -> str:
    value = os.getenv(name)
    if value is not None and value != "":
        return value
    if default is not None and not IS_STRICT_ENV:
        return default
    raise RuntimeError(
        f"Missing required environment variable: {name} "
        f"(DJANGO_ENV={DJANGO_ENV!r})."
    )


# ---------------------------------------------------------------------------
# Core Settings
# ---------------------------------------------------------------------------

SECRET_KEY = getenv_strict("DJANGO_SECRET_KEY", "changeme-in-production")
DEBUG = os.getenv("DJANGO_DEBUG", "True").lower() == "true"

ALLOWED_HOSTS = [
    host.strip()
    for host in getenv_strict(
        "ALLOWED_HOSTS", "localhost,127.0.0.1,emr.npa.local,172.16.0.32"
    ).split(
        ","
    )
    if host.strip()
]

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in getenv_strict(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:8001,http://127.0.0.1:8001,http://localhost:3001,http://127.0.0.1:3001,http://emr.npa.local,https://emr.npa.local,http://172.16.0.32",
    ).split(",")
    if origin.strip()
]


# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "corsheaders",
    "channels",
    "drf_spectacular",
]

LOCAL_APPS = [
    "common",
    "accounts",
    "organization",
    "support",
    "patients",
    "laboratory",
    "pharmacy",
    "radiology",
    "physiotherapy",
    "eyecare",
    "consultation",
    "nursing",
    "wards",
    "audit",
    "notifications.apps.NotificationsConfig",
    "permissions",
    "dashboard",
    "reports",
    "appointments",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS


# ---------------------------------------------------------------------------
# Middleware & URL Configuration
# ---------------------------------------------------------------------------

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Annotates responses served under the legacy /api/ alias with
    # RFC 8594 deprecation headers. See common/middleware.py.
    "common.middleware.LegacyApiDeprecationMiddleware",
]

# Target removal date for the un-versioned /api/ URL alias. Emitted on every
# legacy response via the `Sunset` header so clients can programmatically
# detect the deadline. Override in env to shift the date without a code change.
LEGACY_API_SUNSET_DATE = os.getenv(
    "LEGACY_API_SUNSET_DATE",
    "Wed, 31 Dec 2025 23:59:59 GMT",
)

ROOT_URLCONF = "emr_backend.urls"

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

WSGI_APPLICATION = "emr_backend.wsgi.application"
ASGI_APPLICATION = "emr_backend.asgi.application"


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": getenv_strict("DB_NAME", "emr_db"),
        "USER": getenv_strict("DB_USER", "emr_user"),
        "PASSWORD": getenv_strict("DB_PASSWORD", "emr_password"),
        "HOST": getenv_strict("DB_HOST", "localhost"),
        "PORT": getenv_strict("DB_PORT", "5432"),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
        "OPTIONS": {
            "connect_timeout": int(os.getenv("DB_CONNECT_TIMEOUT", "5")),
        },
    }
}


# ---------------------------------------------------------------------------
# Authentication & Authorization
# ---------------------------------------------------------------------------

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("TIME_ZONE", "Africa/Lagos")
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------------------
# Static & Media Files
# ---------------------------------------------------------------------------

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

SERVE_MEDIA = os.getenv("SERVE_MEDIA", "").lower() == "true"


# ---------------------------------------------------------------------------
# Django REST Framework & OpenAPI
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication"
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    # Enable `page_size` query param consistently across endpoints.
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPageNumberPagination",
    "PAGE_SIZE": int(os.getenv("PAGINATION_PAGE_SIZE", "100")),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # --- Throttling ---------------------------------------------------------
    # Baseline protection against brute-force and scraping. Views that need a
    # dedicated bucket (login, token refresh, file upload, etc.) should set
    # ``throttle_classes = [ScopedRateThrottle]`` and declare a
    # ``throttle_scope`` matching one of the keys in DEFAULT_THROTTLE_RATES.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Global baselines.
        "anon": os.getenv("THROTTLE_ANON", "30/min"),
        "user": os.getenv("THROTTLE_USER", "240/min"),
        # Scoped buckets — attach via ``throttle_scope`` on the view.
        "auth_login": os.getenv("THROTTLE_AUTH_LOGIN", "10/min"),
        "auth_refresh": os.getenv("THROTTLE_AUTH_REFRESH", "30/min"),
        "auth_password_reset": os.getenv("THROTTLE_AUTH_PW_RESET", "5/hour"),
        "file_upload": os.getenv("THROTTLE_FILE_UPLOAD", "60/hour"),
        "reports_export": os.getenv("THROTTLE_REPORTS_EXPORT", "30/hour"),
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "NPA EMR API",
    "DESCRIPTION": "API documentation for the NPA EMR platform",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}


# ---------------------------------------------------------------------------
# CORS & Security
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in getenv_strict(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3001,http://127.0.0.1:3001,http://emr.npa.local,https://emr.npa.local,http://172.16.0.32",
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.getenv("JWT_ACCESS_MINUTES", "60"))
    ),
    "REFRESH_TOKEN_LIFETIME": (
        timedelta(minutes=int(os.getenv("JWT_REFRESH_MINUTES")))
        if os.getenv("JWT_REFRESH_MINUTES")
        else timedelta(hours=int(os.getenv("JWT_REFRESH_HOURS", "8")))
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": os.getenv("JWT_ALGORITHM", "HS256"),
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
}


# ---------------------------------------------------------------------------
# Redis resolution
# ---------------------------------------------------------------------------
# Redis is shared by Channels and Celery. In ``local`` we default to
# ``localhost`` so bare-metal dev works without containers. In every other
# environment ``REDIS_HOST`` MUST be set explicitly — there is no useful
# default in staging/prod and falling back to ``localhost`` historically
# masked misconfigurations (the app appeared healthy but WebSockets and
# Celery talked to a non-existent broker).

REDIS_HOST = getenv_strict("REDIS_HOST", "localhost")
REDIS_PORT = getenv_strict("REDIS_PORT", "6379")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None


# ---------------------------------------------------------------------------
# Channels
# ---------------------------------------------------------------------------

USE_REDIS_CHANNEL_LAYER = os.getenv("USE_REDIS_CHANNEL_LAYER", "").lower() == "true"

# In local dev, default to in-memory channel layer so WebSockets work without Redis.
# In staging/production, Redis should be enabled via USE_REDIS_CHANNEL_LAYER=true.
if DJANGO_ENV == "local" and not USE_REDIS_CHANNEL_LAYER:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [
                    {
                        "address": f"redis://{REDIS_HOST}:{REDIS_PORT}/0",
                        "password": REDIS_PASSWORD,
                    }
                ]
            },
        }
    }


# ---------------------------------------------------------------------------
# Celery Configuration
# ---------------------------------------------------------------------------


def _default_celery_redis_url(db_index: str = "0") -> str:
    """Build a Redis URL for Celery; include password when REDIS_PASSWORD is set (staging/prod)."""
    password = (REDIS_PASSWORD or "").strip()
    if password:
        safe_pw = quote(password, safe="")
        return f"redis://:{safe_pw}@{REDIS_HOST}:{REDIS_PORT}/{db_index}"
    return f"redis://{REDIS_HOST}:{REDIS_PORT}/{db_index}"


CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", _default_celery_redis_url("0"))
CELERY_RESULT_BACKEND = os.getenv(
    "CELERY_RESULT_BACKEND", _default_celery_redis_url("0")
)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = os.getenv("TIME_ZONE", "UTC")
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes
CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60  # 25 minutes


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {name} {message}",
            "style": "{",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
}


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Application URLs
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3001")
