from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0022_labtemplate_sort_order"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="labtest",
            index=models.Index(
                fields=["status", "verified_at"],
                name="lab_tests_status_verified_idx",
            ),
        ),
    ]
