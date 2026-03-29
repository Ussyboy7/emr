# LabPartner model + seed default outsourced labs (from previous frontend list).

from django.db import migrations, models


def seed_lab_partners(apps, schema_editor):
    LabPartner = apps.get_model("laboratory", "LabPartner")
    defaults = [
        "PathCare Labs",
        "MedLab Nigeria",
        "Synlab Nigeria",
        "Lancet Labs",
        "Alpha Medical Labs",
    ]
    for i, name in enumerate(defaults):
        LabPartner.objects.get_or_create(
            name=name,
            defaults={"sort_order": i, "is_active": True},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0010_other_template_match_others_search"),
    ]

    operations = [
        migrations.CreateModel(
            name="LabPartner",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200, unique=True)),
                ("code", models.CharField(blank=True, help_text="Optional short code (e.g. for reports)", max_length=50)),
                ("phone", models.CharField(blank=True, max_length=50)),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("notes", models.TextField(blank=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Lab partner (outsourced)",
                "verbose_name_plural": "Lab partners (outsourced)",
                "db_table": "lab_outsourced_partners",
                "ordering": ["sort_order", "name"],
            },
        ),
        migrations.RunPython(seed_lab_partners, noop_reverse),
    ]
