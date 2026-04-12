from django.apps import AppConfig


class OrganizationConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'organization'

    def ready(self) -> None:
        # Local import: avoid pulling models before Django is ready
        from django.db.models.signals import post_delete, post_save

        from organization.models import OutpatientClinicType

        def _clear_clinic_name_cache(**kwargs):
            from common.clinic_utils import invalidate_outpatient_clinic_name_cache

            invalidate_outpatient_clinic_name_cache()

        post_save.connect(
            _clear_clinic_name_cache,
            sender=OutpatientClinicType,
            dispatch_uid="invalidate_opd_clinic_name_cache_save",
        )
        post_delete.connect(
            _clear_clinic_name_cache,
            sender=OutpatientClinicType,
            dispatch_uid="invalidate_opd_clinic_name_cache_delete",
        )
