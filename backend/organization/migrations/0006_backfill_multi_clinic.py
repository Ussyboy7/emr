"""
Data migration: backfill multi-clinic fields for existing records.

- Copy User.clinic → User.clinics M2M
- Backfill location_clinic on order models and ConsultationSession
- Seed multi_clinic_enabled = false in SystemConfig
"""
from django.db import migrations


def backfill_user_clinics(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    Clinic = apps.get_model('organization', 'Clinic')
    for user in User.objects.filter(clinic__isnull=False).iterator():
        user.clinics.add(user.clinic)


def resolve_clinic_from_session(session, apps):
    """Try to get a Clinic from a ConsultationSession."""
    if session is None:
        return None
    Clinic = apps.get_model('organization', 'Clinic')
    # Try visit → location_clinic
    visit = getattr(session, 'visit', None)
    if visit and getattr(visit, 'location_clinic_id', None):
        try:
            return Clinic.objects.get(id=visit.location_clinic_id)
        except Clinic.DoesNotExist:
            pass
    # Try room → clinic
    room = getattr(session, 'room', None)
    if room and getattr(room, 'clinic_id', None):
        try:
            return Clinic.objects.get(id=room.clinic_id)
        except Clinic.DoesNotExist:
            pass
    return None


def backfill_prescription_location(apps, schema_editor):
    Prescription = apps.get_model('pharmacy', 'Prescription')
    Clinic = apps.get_model('organization', 'Clinic')
    for rx in Prescription.objects.filter(location_clinic__isnull=True).select_related(
        'consultation_session', 'consultation_session__visit', 'consultation_session__room',
        'visit',
    ).iterator(chunk_size=200):
        clinic = None
        if rx.consultation_session_id:
            clinic = resolve_clinic_from_session(rx.consultation_session, apps)
        if clinic is None and rx.visit_id:
            if getattr(rx.visit, 'location_clinic_id', None):
                try:
                    clinic = Clinic.objects.get(id=rx.visit.location_clinic_id)
                except Clinic.DoesNotExist:
                    pass
        if clinic is not None:
            rx.location_clinic = clinic
            rx.save(update_fields=['location_clinic'])


def backfill_eye_order_location(apps, schema_editor):
    EyeOrder = apps.get_model('eyecare', 'EyeOrder')
    Clinic = apps.get_model('organization', 'Clinic')
    for order in EyeOrder.objects.filter(location_clinic__isnull=True).select_related(
        'consultation_session', 'consultation_session__visit', 'consultation_session__room',
        'visit',
    ).iterator(chunk_size=200):
        clinic = None
        if order.consultation_session_id:
            clinic = resolve_clinic_from_session(order.consultation_session, apps)
        if clinic is None and order.visit_id:
            if getattr(order.visit, 'location_clinic_id', None):
                try:
                    clinic = Clinic.objects.get(id=order.visit.location_clinic_id)
                except Clinic.DoesNotExist:
                    pass
        if clinic is not None:
            order.location_clinic = clinic
            order.save(update_fields=['location_clinic'])


def backfill_physio_order_location(apps, schema_editor):
    PhysioOrder = apps.get_model('physiotherapy', 'PhysioOrder')
    Clinic = apps.get_model('organization', 'Clinic')
    for order in PhysioOrder.objects.filter(location_clinic__isnull=True).select_related(
        'consultation_session', 'consultation_session__visit', 'consultation_session__room',
        'visit',
    ).iterator(chunk_size=200):
        clinic = None
        if order.consultation_session_id:
            clinic = resolve_clinic_from_session(order.consultation_session, apps)
        if clinic is None and order.visit_id:
            if getattr(order.visit, 'location_clinic_id', None):
                try:
                    clinic = Clinic.objects.get(id=order.visit.location_clinic_id)
                except Clinic.DoesNotExist:
                    pass
        if clinic is not None:
            order.location_clinic = clinic
            order.save(update_fields=['location_clinic'])


def backfill_nursing_order_location(apps, schema_editor):
    NursingOrder = apps.get_model('nursing', 'NursingOrder')
    Clinic = apps.get_model('organization', 'Clinic')
    for order in NursingOrder.objects.filter(location_clinic__isnull=True).select_related(
        'consultation_session', 'consultation_session__visit', 'consultation_session__room',
        'visit',
    ).iterator(chunk_size=200):
        clinic = None
        if order.consultation_session_id:
            clinic = resolve_clinic_from_session(order.consultation_session, apps)
        if clinic is None and order.visit_id:
            if getattr(order.visit, 'location_clinic_id', None):
                try:
                    clinic = Clinic.objects.get(id=order.visit.location_clinic_id)
                except Clinic.DoesNotExist:
                    pass
        if clinic is not None:
            order.location_clinic = clinic
            order.save(update_fields=['location_clinic'])


def backfill_lab_order_location(apps, schema_editor):
    LabOrder = apps.get_model('laboratory', 'LabOrder')
    Clinic = apps.get_model('organization', 'Clinic')
    for order in LabOrder.objects.filter(location_clinic__isnull=True).select_related(
        'external_clinic', 'consultation_session', 'consultation_session__visit',
        'consultation_session__room', 'visit',
    ).iterator(chunk_size=200):
        clinic = None
        # For external manual orders, use external_clinic
        if order.source_type == 'external_manual' and order.external_clinic_id:
            clinic = order.external_clinic
        # Try consultation session
        if clinic is None and order.consultation_session_id:
            clinic = resolve_clinic_from_session(order.consultation_session, apps)
        # Try visit
        if clinic is None and order.visit_id:
            if getattr(order.visit, 'location_clinic_id', None):
                try:
                    clinic = Clinic.objects.get(id=order.visit.location_clinic_id)
                except Clinic.DoesNotExist:
                    pass
        if clinic is not None:
            order.location_clinic = clinic
            order.processing_clinic = clinic
            order.save(update_fields=['location_clinic', 'processing_clinic'])


def backfill_radiology_order_location(apps, schema_editor):
    RadiologyOrder = apps.get_model('radiology', 'RadiologyOrder')
    Clinic = apps.get_model('organization', 'Clinic')
    for order in RadiologyOrder.objects.filter(location_clinic__isnull=True).select_related(
        'external_clinic', 'consultation_session', 'consultation_session__visit',
        'consultation_session__room', 'visit',
    ).iterator(chunk_size=200):
        clinic = None
        if order.source_type == 'external_manual' and order.external_clinic_id:
            clinic = order.external_clinic
        if clinic is None and order.consultation_session_id:
            clinic = resolve_clinic_from_session(order.consultation_session, apps)
        if clinic is None and order.visit_id:
            if getattr(order.visit, 'location_clinic_id', None):
                try:
                    clinic = Clinic.objects.get(id=order.visit.location_clinic_id)
                except Clinic.DoesNotExist:
                    pass
        if clinic is not None:
            order.location_clinic = clinic
            order.processing_clinic = clinic
            order.save(update_fields=['location_clinic', 'processing_clinic'])


def backfill_consultation_session_location(apps, schema_editor):
    ConsultationSession = apps.get_model('consultation', 'ConsultationSession')
    Clinic = apps.get_model('organization', 'Clinic')
    for session in ConsultationSession.objects.filter(location_clinic__isnull=True).select_related(
        'visit', 'room',
    ).iterator(chunk_size=200):
        clinic = None
        # Try visit → location_clinic
        if session.visit_id and getattr(session.visit, 'location_clinic_id', None):
            try:
                clinic = Clinic.objects.get(id=session.visit.location_clinic_id)
            except Clinic.DoesNotExist:
                pass
        # Try room → clinic
        if clinic is None and session.room_id and getattr(session.room, 'clinic_id', None):
            try:
                clinic = Clinic.objects.get(id=session.room.clinic_id)
            except Clinic.DoesNotExist:
                pass
        if clinic is not None:
            session.location_clinic = clinic
            session.save(update_fields=['location_clinic'])


def seed_system_config(apps, schema_editor):
    SystemConfig = apps.get_model('organization', 'SystemConfig')
    SystemConfig.objects.get_or_create(
        key='multi_clinic_enabled',
        defaults={
            'value': False,
            'description': 'Enable multi-clinic mode with per-clinic scoping and clinic switching.',
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_user_active_clinic_user_clinics_alter_user_clinic'),
        ('pharmacy', '0031_prescription_location_clinic'),
        ('eyecare', '0007_eyeorder_location_clinic'),
        ('physiotherapy', '0013_physioorder_location_clinic'),
        ('nursing', '0009_nursingorder_location_clinic'),
        ('laboratory', '0021_laborder_location_clinic_laborder_processing_clinic'),
        ('radiology', '0019_radiologyorder_location_clinic_and_more'),
        ('consultation', '0024_consultationsession_location_clinic'),
        ('organization', '0005_systemconfig_clinic_default_processing_clinic'),
    ]

    operations = [
        migrations.RunPython(seed_system_config, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(backfill_user_clinics, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(backfill_prescription_location, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(backfill_eye_order_location, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(backfill_physio_order_location, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(backfill_nursing_order_location, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(backfill_lab_order_location, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(backfill_radiology_order_location, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(backfill_consultation_session_location, reverse_code=migrations.RunPython.noop),
    ]
