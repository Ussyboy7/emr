from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'
    
    def ready(self):
        """Import signals when app is ready."""
        import accounts.signals  # noqa
        import accounts.spectacular  # noqa: F401 — register OpenAPI auth extensions

