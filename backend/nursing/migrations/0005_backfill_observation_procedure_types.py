from django.db import migrations


def backfill_observation_procedure_types(apps, schema_editor):
    Procedure = apps.get_model('nursing', 'Procedure')

    # Correct legacy records where observation/ward admissions were stored as "other".
    Procedure.objects.filter(
        nursing_order__order_type__iexact='observation admission',
    ).exclude(
        procedure_type='ward_admission',
    ).update(procedure_type='ward_admission')

    Procedure.objects.filter(
        nursing_order__order_type__iexact='ward admission',
    ).exclude(
        procedure_type='ward_admission',
    ).update(procedure_type='ward_admission')


class Migration(migrations.Migration):

    dependencies = [
        ('nursing', '0004_alter_procedure_procedure_type'),
    ]

    operations = [
        migrations.RunPython(
            backfill_observation_procedure_types,
            migrations.RunPython.noop,
        ),
    ]

