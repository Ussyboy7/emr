from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eyecare", "0008_backfill_eyeorder_location_clinic"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="eyesession",
            index=models.Index(
                fields=["status", "completed_at"],
                name="eye_sess_status_completed_idx",
            ),
        ),
    ]
