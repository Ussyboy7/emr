from .settings import *
import os

DATABASES["default"]["TEST"] = {
    "NAME": os.getenv("TEST_DB_NAME", "test_emr_db"),
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "cache+memory://"
