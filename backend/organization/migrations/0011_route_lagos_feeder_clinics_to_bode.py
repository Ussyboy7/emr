from django.db import migrations


def route_lagos_feeders_to_bode(apps, schema_editor):
    Clinic = apps.get_model("organization", "Clinic")
    try:
        bode = Clinic.objects.get(code="BODE-THOMAS")
    except Clinic.DoesNotExist:
        return

    Clinic.objects.exclude(code__in=["APAPA", "TINCAN"]).update(default_processing_clinic=None)
    Clinic.objects.filter(code__in=["APAPA", "TINCAN"]).update(default_processing_clinic=bode)


class Migration(migrations.Migration):
    dependencies = [("organization", "0010_alter_department_options_and_more")]

    operations = [migrations.RunPython(route_lagos_feeders_to_bode, migrations.RunPython.noop)]
