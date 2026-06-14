# Generated manually for annual check-up P1

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0024_patientmerge_repointed_rows"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="visit",
            name="visit_type",
            field=models.CharField(
                choices=[
                    ("consultation", "Consultation"),
                    ("follow_up", "Follow-up"),
                    ("emergency", "Emergency"),
                    ("routine", "Routine Checkup"),
                    ("responsibility_form", "Responsibility Form"),
                    ("annual_checkup", "Annual Check-up"),
                ],
                default="consultation",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="AnnualCheckup",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("programme_year", models.PositiveSmallIntegerField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("in_progress", "In Progress"),
                            ("completed", "Completed"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="in_progress",
                        max_length=20,
                    ),
                ),
                (
                    "fitness_outcome",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("fit", "Fit for duty"),
                            ("fit_with_conditions", "Fit with conditions"),
                            ("temporarily_unfit", "Temporarily unfit"),
                            ("unfit", "Unfit for duty"),
                        ],
                        max_length=30,
                    ),
                ),
                (
                    "outcome_notes",
                    models.TextField(
                        blank=True,
                        help_text="HR-safe fitness guidance (non-clinical wording).",
                    ),
                ),
                ("signed_off_at", models.DateTimeField(blank=True, null=True)),
                (
                    "sign_off_override_reason",
                    models.TextField(
                        blank=True,
                        help_text="Reason incomplete components were overridden at sign-off.",
                    ),
                ),
                ("components_required", models.JSONField(blank=True, default=list)),
                ("components_completed", models.JSONField(blank=True, default=list)),
                (
                    "component_overrides",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="Manually marked complete: {component_code: reason}.",
                    ),
                ),
                (
                    "report_pdf",
                    models.FileField(
                        blank=True,
                        null=True,
                        upload_to="annual_checkups/reports/",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="annual_checkups",
                        to="patients.patient",
                    ),
                ),
                (
                    "signed_off_by",
                    models.ForeignKey(
                        blank=True,
                        limit_choices_to={"system_role": "Medical Doctor"},
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="signed_annual_checkups",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "visit",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="annual_checkup",
                        to="patients.visit",
                    ),
                ),
            ],
            options={
                "db_table": "annual_checkups",
                "ordering": ["-programme_year", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="annualcheckup",
            index=models.Index(
                fields=["patient", "programme_year"],
                name="annual_chec_patient_0f0f0f_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="annualcheckup",
            index=models.Index(
                fields=["status", "programme_year"],
                name="annual_chec_status_1a1a1a_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="annualcheckup",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status__in", ["in_progress", "completed"])),
                fields=("patient", "programme_year"),
                name="uniq_active_annual_checkup_per_patient_year",
            ),
        ),
    ]
