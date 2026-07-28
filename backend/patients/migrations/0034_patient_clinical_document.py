# Generated manually for PatientClinicalDocument

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("consultation", "0030_shared_room_multi_doctor_capacity"),
        ("patients", "0033_patient_records_note"),
    ]

    operations = [
        migrations.CreateModel(
            name="PatientClinicalDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "doc_type",
                    models.CharField(
                        choices=[
                            ("consultation_report", "Consultation report"),
                            ("lab", "Lab result"),
                            ("radiology", "Radiology / imaging"),
                            ("other", "Other"),
                        ],
                        db_index=True,
                        max_length=32,
                    ),
                ),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("scanned_paper", "Scanned paper"),
                            ("external_facility", "External facility"),
                        ],
                        db_index=True,
                        default="scanned_paper",
                        max_length=32,
                    ),
                ),
                (
                    "document_date",
                    models.DateField(
                        db_index=True,
                        help_text="Encounter / result date (when the clinical event happened).",
                    ),
                ),
                ("title", models.CharField(blank=True, max_length=200)),
                ("facility", models.CharField(blank=True, max_length=200)),
                ("clinician_name", models.CharField(blank=True, max_length=200)),
                ("notes", models.CharField(blank=True, max_length=500)),
                ("file", models.FileField(upload_to="patients/clinical_documents/%Y/%m/")),
                ("original_filename", models.CharField(blank=True, max_length=255)),
                ("uploaded_by_name_snapshot", models.CharField(blank=True, max_length=200)),
                ("uploaded_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="clinical_documents",
                        to="patients.patient",
                    ),
                ),
                (
                    "referral",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="clinical_documents",
                        to="consultation.referral",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="uploaded_clinical_documents",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "patient_clinical_documents",
                "ordering": ["-document_date", "-uploaded_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="patientclinicaldocument",
            index=models.Index(fields=["patient", "-document_date"], name="patient_cli_patient_docdate_idx"),
        ),
        migrations.AddIndex(
            model_name="patientclinicaldocument",
            index=models.Index(fields=["patient", "doc_type"], name="patient_cli_patient_doctype_idx"),
        ),
    ]
