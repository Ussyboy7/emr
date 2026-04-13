from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_merge_0002_user_clinic_0002_user_middle_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="custom_pages_mode",
            field=models.CharField(
                blank=True,
                choices=[
                    ("", "Role-based only"),
                    ("replace", "Replace role pages"),
                    ("add", "Add to role pages"),
                    ("restrict", "Restrict role pages"),
                ],
                default="",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="custom_pages",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Page paths used by custom_pages_mode",
            ),
        ),
    ]

