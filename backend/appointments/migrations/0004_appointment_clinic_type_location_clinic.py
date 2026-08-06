# Generated manually: canonical clinic-type vs facility split for appointments.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("organization", "0002_outpatient_clinic_types"),
        ("appointments", "0003_alter_appointment_clinics"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="appointment",
            name="clinics",
        ),
        migrations.AlterField(
            model_name="appointment",
            name="clinic",
            field=models.ForeignKey(
                help_text="Clinic type this appointment is for (GOPD, Eye Clinic, Physiotherapy, \u2026)",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="appointments",
                to="organization.outpatientclinictype",
            ),
        ),
        migrations.AddField(
            model_name="appointment",
            name="location_clinic",
            field=models.ForeignKey(
                blank=True,
                help_text="Facility/site where the appointment happens (set by reception; may be null until assigned)",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="appointments",
                to="organization.clinic",
            ),
        ),
    ]
