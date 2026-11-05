import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "local-development-only-insecure-key"
    else:
        raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false")

ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()]
if not DEBUG and "*" in ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must not contain '*' in production")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "corsheaders",
    "rest_framework",
    "channels",
    "core",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = []
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    import urllib.parse

    parsed = urllib.parse.urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed.path.lstrip("/"),
            "USER": parsed.username,
            "PASSWORD": parsed.password,
            "HOST": parsed.hostname,
            "PORT": parsed.port or 5432,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if origin.strip()
]
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("API_ANON_RATE", "120/min"),
    },
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
}

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("DATA_UPLOAD_MAX_MEMORY_SIZE", str(8 * 1024 * 1024)))
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("FILE_UPLOAD_MAX_MEMORY_SIZE", str(6 * 1024 * 1024)))
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "0" if DEBUG else "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
