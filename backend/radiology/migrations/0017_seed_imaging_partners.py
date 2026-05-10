# Seed default outsourced imaging center partners.
#
# Mirrors `laboratory.0011_labpartner` so a fresh checkout has at least a
# handful of well-known Lagos imaging centers in the dropdown without manual
# admin work. Names only — admins are expected to fill in address / phone /
# email via the management UI.

from django.db import migrations


def seed_imaging_partners(apps, schema_editor):
    ImagingPartner = apps.get_model("radiology", "ImagingPartner")
    defaults = [
        "Mecure Healthcare",
        "Clinix Healthcare",
        "MeCure Diagnostics",
        "Union Diagnostic & Clinical Services",
        "Lagoon Hospitals Imaging",
        "Reddington Imaging Centre",
        "Euracare Multi-Specialist Hospital",
    ]
    for i, name in enumerate(defaults):
        ImagingPartner.objects.get_or_create(
            name=name,
            defaults={"sort_order": i, "is_active": True},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("radiology", "0016_radiology_referral_dispatch"),
    ]

    operations = [
        migrations.RunPython(seed_imaging_partners, noop_reverse),
    ]
