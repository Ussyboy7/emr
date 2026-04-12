# Generated manually for OutpatientClinicType + FacilityOutpatientClinic

from django.db import migrations, models
import django.db.models.deletion


def seed_outpatient_types_and_facility_links(apps, schema_editor):
    OutpatientClinicType = apps.get_model("organization", "OutpatientClinicType")
    FacilityOutpatientClinic = apps.get_model("organization", "FacilityOutpatientClinic")
    Clinic = apps.get_model("organization", "Clinic")

    rows = [
        ("GOPD", "gopd", 10),
        ("Physiotherapy", "physiotherapy", 20),
        ("Eye Clinic", "eye-clinic", 30),
        ("Sickle Cell", "sickle-cell", 40),
        ("Diamond", "diamond", 50),
        ("Healthron", "healthron", 60),
        ("Dental", "dental", 70),
    ]
    types = []
    for name, code, sort_order in rows:
        t, _ = OutpatientClinicType.objects.get_or_create(
            code=code,
            defaults={"name": name, "is_active": True, "sort_order": sort_order},
        )
        if t.name != name or t.sort_order != sort_order:
            t.name = name
            t.sort_order = sort_order
            t.save(update_fields=["name", "sort_order"])
        types.append(t)

    for facility in Clinic.objects.all():
        for order, t in enumerate(types):
            FacilityOutpatientClinic.objects.get_or_create(
                facility=facility,
                clinic_type=t,
                defaults={"is_active": True, "sort_order": order},
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("organization", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="OutpatientClinicType",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(db_index=True, max_length=200, unique=True)),
                ("code", models.SlugField(db_index=True, max_length=80, unique=True)),
                ("description", models.TextField(blank=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "outpatient_clinic_types",
                "ordering": ["sort_order", "name"],
                "verbose_name": "Visit clinic (OPD)",
                "verbose_name_plural": "Visit clinics (OPD)",
            },
        ),
        migrations.CreateModel(
            name="FacilityOutpatientClinic",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "clinic_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="facility_offerings",
                        to="organization.outpatientclinictype",
                    ),
                ),
                (
                    "facility",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="outpatient_offerings",
                        to="organization.clinic",
                    ),
                ),
            ],
            options={
                "db_table": "facility_outpatient_clinics",
                "ordering": ["sort_order", "clinic_type__name"],
            },
        ),
        migrations.AddIndex(
            model_name="facilityoutpatientclinic",
            index=models.Index(fields=["facility", "is_active"], name="facility_ou_facilit_idx"),
        ),
        migrations.AlterUniqueTogether(
            name="facilityoutpatientclinic",
            unique_together={("facility", "clinic_type")},
        ),
        migrations.RunPython(seed_outpatient_types_and_facility_links, noop_reverse),
    ]
