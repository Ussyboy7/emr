"""
Physiotherapy app configuration.
"""
from django.apps import AppConfig


class PhysiotherapyConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'physiotherapy'
    verbose_name = 'Physiotherapy'