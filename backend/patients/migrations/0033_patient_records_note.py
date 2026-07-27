# Generated manually for PatientRecordsNote

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("patients", "0032_remove_patient_patients_surname_trgm_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="PatientRecordsNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("note", models.CharField(max_length=800)),
                (
                    "source",
                    models.CharField(
                        choices=[("registration", "Registration"), ("manual", "Manual")],
                        db_index=True,
                        default="manual",
                        max_length=20,
                    ),
                ),
                ("recorded_by_name_snapshot", models.CharField(blank=True, max_length=200)),
                ("recorded_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="records_notes",
                        to="patients.patient",
                    ),
                ),
                (
                    "recorded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="patient_records_notes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "patient_records_notes",
                "ordering": ["-recorded_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="patientrecordsnote",
            index=models.Index(fields=["patient", "-recorded_at"], name="patient_rec_patient_7c1a2b_idx"),
        ),
    ]
