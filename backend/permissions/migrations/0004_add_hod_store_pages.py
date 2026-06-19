# Grant HOD store pages to System Administrator and Pharmacy Head role.

from django.db import migrations

from permissions.role_permissions import normalize_role_permissions_list

HOD_STORE_PAGES = (
    "/pharmacy/hod-store",
    "/pharmacy/hod-store/requests",
    "/pharmacy/hod-store/history",
)

PHARMACY_HEAD_PAGES = (
    "/pharmacy",
    *HOD_STORE_PAGES,
)


def _merge_pages(existing: list, additions: list[str]) -> list:
    pages = normalize_role_permissions_list(existing)
    seen = set(pages)
    for path in additions:
        if path not in seen:
            pages.append(path)
            seen.add(path)
    return pages


def add_hod_store_pages(apps, schema_editor):
    Role = apps.get_model("permissions", "Role")

    for role_name in ("System Administrator", "Administrator"):
        role = Role.objects.filter(name=role_name).first()
        if role:
            merged = _merge_pages(role.permissions, list(HOD_STORE_PAGES))
            if merged != normalize_role_permissions_list(role.permissions):
                role.permissions = merged
                role.save(update_fields=["permissions"])

    head_role, created = Role.objects.get_or_create(
        name="Pharmacy Head",
        defaults={
            "type": "pharmacist",
            "description": "Head of Pharmacy — HOD store inventory and discretionary issuing",
            "permissions": list(PHARMACY_HEAD_PAGES),
            "is_active": True,
        },
    )
    if not created:
        merged = _merge_pages(head_role.permissions, list(PHARMACY_HEAD_PAGES))
        if merged != normalize_role_permissions_list(head_role.permissions):
            head_role.permissions = merged
            head_role.save(update_fields=["permissions"])


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0003_add_hr_and_annual_checkup_pages"),
    ]

    operations = [
        migrations.RunPython(add_hod_store_pages, migrations.RunPython.noop),
    ]
