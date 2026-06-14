# Annual check-up master catalog + programme default pre-ticks

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

from patients.annual_checkup_catalog import seed_catalog_and_programme


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0026_annual_checkup_hr_extensions"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AnnualCheckupComponentDefinition",
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
                ("code", models.CharField(max_length=50, unique=True)),
                ("label", models.CharField(max_length=200)),
                (
                    "captured_via",
                    models.CharField(
                        choices=[
                            ("vitals", "Vitals"),
                            ("laboratory", "Laboratory"),
                            ("radiology", "Radiology"),
                            ("eyecare", "Eye care"),
                            ("consultation", "Consultation"),
                            ("medical_history", "Medical history"),
                            ("patient_record", "Patient record"),
                            ("annual_checkup", "Annual check-up"),
                        ],
                        max_length=30,
                    ),
                ),
                (
                    "tier",
                    models.CharField(
                        choices=[("A", "Tier A"), ("B", "Tier B"), ("C", "Tier C")],
                        default="A",
                        max_length=1,
                    ),
                ),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("skippable", models.BooleanField(default=True)),
                (
                    "lab_template_codes",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="LabTemplate.code values used for ordering and auto-completion.",
                    ),
                ),
                (
                    "radiology_template_codes",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="RadiologyTemplate.code values for ordering and auto-completion.",
                    ),
                ),
                (
                    "name_aliases",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="Lowercase aliases for matching existing orders/results.",
                    ),
                ),
            ],
            options={
                "db_table": "annual_checkup_component_definitions",
                "ordering": ["sort_order", "label"],
            },
        ),
        migrations.CreateModel(
            name="AnnualCheckupProgrammeSettings",
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
                ("programme_year", models.PositiveSmallIntegerField(unique=True)),
                (
                    "default_selected_codes",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="Component codes pre-selected when a new annual check-up visit starts.",
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="annual_checkup_programme_updates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "annual_checkup_programme_settings",
                "ordering": ["-programme_year"],
            },
        ),
        migrations.RunPython(seed_catalog_and_programme, migrations.RunPython.noop),
    ]
