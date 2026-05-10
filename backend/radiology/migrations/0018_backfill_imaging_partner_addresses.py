# Backfill real postal addresses for the 7 default imaging partners seeded
# in `0017_seed_imaging_partners.py`. We deliberately kept the original
# seed migration names-only (no fake addresses) — admins are expected to
# maintain partner details via the management UI.
#
# This migration fills addresses for the well-known Lagos centres using
# publicly listed head-office addresses from each partner's own website
# (or from public business directories where the official site doesn't
# publish a postal block). It is **idempotent**: it only updates rows
# where `address` is currently empty, so running it on a database where
# an admin has already backfilled an address through the Edit Partner
# dialog will leave that admin's data untouched.
#
# Sources (last verified May 2026 — addresses can change; treat the UI
# as the long-term source of truth):
#   - Mecure Healthcare HQ:    mecure.com.ng/contact.html
#   - MeCure Diagnostics Lekki: mecure.com.ng/location.html
#   - Clinix Healthcare HQ:    clinixhealthcare.com.ng/contact-us
#   - Union Diagnostic HQ:     uniondiagnostic.com.ng/contact-us
#   - Lagoon Hospitals Apapa:  businesslist.com.ng / lagoonhospitals.com
#   - Reddington Hospital VI:  reddingtonhospital.com/contacts
#   - Euracare Multi-Specialist Hospital: directory.org.ng / euracare.com.ng

from django.db import migrations


PARTNER_ADDRESSES = {
    "Mecure Healthcare": (
        "Me Cure House,\n"
        "Plot 6, Block H, Apapa-Oshodi Expressway,\n"
        "Oshodi, Lagos 102215, Nigeria."
    ),
    "Clinix Healthcare": (
        "12 Alhaji Adejumo Avenue,\n"
        "off Gbagada-Oshodi Expressway,\n"
        "Anthony, Lagos, Nigeria."
    ),
    "MeCure Diagnostics": (
        "Niyi Okunubi Street,\n"
        "Lekki Phase 1 (opposite Mainstreet Bank),\n"
        "Lagos, Nigeria."
    ),
    "Union Diagnostic & Clinical Services": (
        "5, Eletu Ogabi Street,\n"
        "off Adeola Odeku Street,\n"
        "Victoria Island, Lagos, Nigeria."
    ),
    "Lagoon Hospitals Imaging": (
        "8 Marine Road,\n"
        "Apapa, Lagos, Nigeria."
    ),
    "Reddington Imaging Centre": (
        "12 Idowu Martins Street,\n"
        "(beside Mega Plaza),\n"
        "Victoria Island, Lagos, Nigeria."
    ),
    "Euracare Multi-Specialist Hospital": (
        "293 Younis Bashorun Street,\n"
        "corner Jide Oki Street,\n"
        "Victoria Island, Lagos 106104, Nigeria."
    ),
}


def backfill_addresses(apps, schema_editor):
    """Set address on partners that currently have no address saved.

    Idempotent: if an admin has already typed an address through the UI,
    that value is preserved and we skip the row.
    """
    ImagingPartner = apps.get_model("radiology", "ImagingPartner")
    for name, address in PARTNER_ADDRESSES.items():
        # `update()` with the `address__in=("", None)` filter avoids
        # touching rows where someone has already curated a value.
        ImagingPartner.objects.filter(
            name=name,
            address__in=("", None),
        ).update(address=address)


def noop_reverse(apps, schema_editor):
    """Reversing this migration would clobber any admin-curated values
    typed after the backfill ran, so we leave the addresses in place. To
    forcibly clear all 7 rows, run the reverse of `0017` instead.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("radiology", "0017_seed_imaging_partners"),
    ]

    operations = [
        migrations.RunPython(backfill_addresses, noop_reverse),
    ]
