# Remove retired radiology UI routes from stored role permissions.

from django.db import migrations

from permissions.role_permissions import normalize_role_permissions_list

RETIRED_RADILOGY_PAGES = frozenset(
    {
        "/radiology/viewer",
        "/radiology/studies",
    }
)


def remove_retired_radiology_pages(apps, schema_editor):
    Role = apps.get_model("permissions", "Role")

    for role in Role.objects.all().iterator():
        pages = normalize_role_permissions_list(role.permissions)
        filtered = [p for p in pages if p not in RETIRED_RADILOGY_PAGES]
        if filtered != pages:
            role.permissions = filtered
            role.save(update_fields=["permissions"])


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0004_add_hod_store_pages"),
    ]

    operations = [
        migrations.RunPython(remove_retired_radiology_pages, migrations.RunPython.noop),
    ]
