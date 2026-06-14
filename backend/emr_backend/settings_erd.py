"""Settings for ERD generation only (`make docs-schema`)."""
from .settings import *  # noqa: F403

INSTALLED_APPS = [*INSTALLED_APPS, "django_extensions"]  # noqa: F405
