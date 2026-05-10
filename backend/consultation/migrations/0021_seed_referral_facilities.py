"""
Seed the ``ReferralFacility`` catalog with a starter list of common Lagos
referral destinations for NPA Medical Department.

Addresses are deliberately left blank — they need to be confirmed by the
clinic before being printed on official letterhead. Admins should populate
them via Django admin or ``manage.py add_referral_facility`` before issuing
their first responsibility form to a given facility.

Idempotent (uses ``get_or_create``), reversible (deletes only the rows it
created on the way down, and only when the row has not been touched since).
"""
from django.db import migrations


SEED_FACILITIES = [
    # name, facility_type, contact_person_title (None = use model default)
    ("Federal Medical Centre, Ebute Meta", "external", None),
    ("Lagos University Teaching Hospital (LUTH)", "external", None),
    ("Lagos State University Teaching Hospital (LASUTH)", "external", None),
    ("National Orthopaedic Hospital, Igbobi", "specialist", None),
    ("Federal Neuro-Psychiatric Hospital, Yaba", "specialist", None),
    ("Lagos State General Hospital, Lagos Island", "external", None),
    ("Lagos State General Hospital, Ikeja", "external", None),
    ("Reddington Hospital", "specialist", None),
    ("Eko Hospital", "specialist", None),
    ("St. Nicholas Hospital", "specialist", None),
]

PLACEHOLDER_NOTE = (
    "Seed entry — please confirm and fill in the postal address before "
    "printing the responsibility form for this facility."
)


def seed(apps, schema_editor):
    ReferralFacility = apps.get_model("consultation", "ReferralFacility")
    for sort_idx, (name, facility_type, role) in enumerate(SEED_FACILITIES, start=10):
        defaults = {
            "facility_type": facility_type,
            "is_active": True,
            "sort_order": sort_idx,
            "notes": PLACEHOLDER_NOTE,
        }
        if role:
            defaults["contact_person_title"] = role
        ReferralFacility.objects.get_or_create(name=name, defaults=defaults)


def unseed(apps, schema_editor):
    ReferralFacility = apps.get_model("consultation", "ReferralFacility")
    for name, _ftype, _role in SEED_FACILITIES:
        # Only remove untouched seed rows: no address filled in yet, still
        # carrying our placeholder note. Anything edited in production stays.
        ReferralFacility.objects.filter(
            name=name,
            address="",
            notes=PLACEHOLDER_NOTE,
        ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("consultation", "0020_referral_facility"),
    ]

    operations = [
        migrations.RunPython(seed, reverse_code=unseed),
    ]
