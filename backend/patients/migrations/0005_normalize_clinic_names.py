# Generated migration for normalizing clinic names in Visit and LabOrder models

from django.db import migrations


def normalize_clinic_names_forward(apps, schema_editor):
    """
    Normalize existing clinic names in Visit and LabOrder models.
    This ensures all clinic names follow the standardized format.
    """
    Visit = apps.get_model('patients', 'Visit')
    LabOrder = apps.get_model('laboratory', 'LabOrder')
    
    # Import normalization function
    from common.clinic_utils import normalize_clinic_name
    
    # Normalize Visit clinic names
    visits = Visit.objects.exclude(clinic__isnull=True).exclude(clinic='')
    visit_count = 0
    for visit in visits:
        original_clinic = visit.clinic
        normalized_clinic = normalize_clinic_name(original_clinic)
        
        if original_clinic != normalized_clinic:
            visit.clinic = normalized_clinic
            visit.save(update_fields=['clinic'])
            visit_count += 1
    
    # Normalize LabOrder clinic names
    lab_orders = LabOrder.objects.exclude(clinic__isnull=True).exclude(clinic='')
    lab_order_count = 0
    for order in lab_orders:
        original_clinic = order.clinic
        normalized_clinic = normalize_clinic_name(original_clinic)
        
        if original_clinic != normalized_clinic:
            order.clinic = normalized_clinic
            order.save(update_fields=['clinic'])
            lab_order_count += 1
    
    # Normalize RadiologyOrder clinic names
    radiology_orders = apps.get_model('radiology', 'RadiologyOrder')
    rad_orders = radiology_orders.objects.exclude(clinic__isnull=True).exclude(clinic='')
    rad_order_count = 0
    for order in rad_orders:
        original_clinic = order.clinic
        normalized_clinic = normalize_clinic_name(original_clinic)
        
        if original_clinic != normalized_clinic:
            order.clinic = normalized_clinic
            order.save(update_fields=['clinic'])
            rad_order_count += 1
    
    print(f"Normalized {visit_count} visit clinic names, {lab_order_count} lab order clinic names, and {rad_order_count} radiology order clinic names")


def normalize_clinic_names_reverse(apps, schema_editor):
    """
    Reverse migration - we cannot restore original values,
    so this is a no-op. Clinic names will remain normalized.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0004_add_religion_tribe_occupation'),
    ]

    operations = [
        migrations.RunPython(
            normalize_clinic_names_forward,
            normalize_clinic_names_reverse,
        ),
    ]

