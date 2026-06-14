# HR extensions: outcome letter, next due date, exemptions

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0025_annual_checkup"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="annualcheckup",
            name="next_due_date",
            field=models.DateField(
                blank=True,
                help_text="Suggested date for next programme-year check-up.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="annualcheckup",
            name="outcome_letter_pdf",
            field=models.FileField(
                blank=True,
                help_text="HR-safe fit-for-duty letter (no clinical detail).",
                null=True,
                upload_to="annual_checkups/outcome_letters/",
            ),
        ),
        migrations.CreateModel(
            name="AnnualCheckupExemption",
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
                    "reason",
                    models.CharField(
                        choices=[
                            ("maternity", "Maternity"),
                            ("on_leave", "On leave"),
                            ("secondment", "Secondment"),
                            ("medical", "Medical deferral"),
                            ("other", "Other"),
                        ],
                        max_length=30,
                    ),
                ),
                ("notes", models.TextField(blank=True)),
                ("granted_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateField(blank=True, null=True)),
                (
                    "granted_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="granted_annual_checkup_exemptions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="annual_checkup_exemptions",
                        to="patients.patient",
                    ),
                ),
            ],
            options={
                "db_table": "annual_checkup_exemptions",
                "ordering": ["-programme_year", "-granted_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="annualcheckupexemption",
            constraint=models.UniqueConstraint(
                fields=("patient", "programme_year"),
                name="uniq_annual_checkup_exemption_per_patient_year",
            ),
        ),
    ]
