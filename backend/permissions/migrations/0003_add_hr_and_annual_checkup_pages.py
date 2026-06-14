# Grant HR module and annual check-up programme admin pages to appropriate roles.

from django.db import migrations

from permissions.role_permissions import normalize_role_permissions_list

HR_PAGES = (
    "/hr",
    "/hr/annual-checkups",
    "/hr/exemptions",
)

ADMIN_ANNUAL_PROGRAMME_PAGE = "/admin/annual-checkup-programme"

ROLE_PAGE_ADDITIONS = {
    "System Administrator": [*HR_PAGES, ADMIN_ANNUAL_PROGRAMME_PAGE],
    "Human Resources Officer": list(HR_PAGES),
    "Human Resources": list(HR_PAGES),
}


def _merge_pages(existing: list, additions: list[str]) -> list:
    pages = normalize_role_permissions_list(existing)
    seen = set(pages)
    for path in additions:
        if path not in seen:
            pages.append(path)
            seen.add(path)
    return pages


def add_hr_and_annual_checkup_pages(apps, schema_editor):
    Role = apps.get_model("permissions", "Role")

    for role_name, additions in ROLE_PAGE_ADDITIONS.items():
        role = Role.objects.filter(name=role_name).first()
        if not role:
            if role_name == "Human Resources Officer":
                Role.objects.create(
                    name=role_name,
                    type="administrative",
                    description="HR annual check-up compliance and exemptions",
                    permissions=list(HR_PAGES),
                    is_active=True,
                )
            continue

        merged = _merge_pages(role.permissions, additions)
        if merged != normalize_role_permissions_list(role.permissions):
            role.permissions = merged
            role.save(update_fields=["permissions"])


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0002_alter_role_permissions"),
    ]

    operations = [
        migrations.RunPython(add_hr_and_annual_checkup_pages, migrations.RunPython.noop),
    ]
