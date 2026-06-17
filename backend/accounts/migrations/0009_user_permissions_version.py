from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_user_active_clinic_user_clinics_alter_user_clinic"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="permissions_version",
            field=models.PositiveIntegerField(default=1),
        ),
    ]
