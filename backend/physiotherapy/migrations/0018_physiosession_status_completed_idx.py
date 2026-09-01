from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("physiotherapy", "0017_backfill_physio_order_location_clinic"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="physiosession",
            index=models.Index(
                fields=["status", "completed_at"],
                name="physio_sess_status_completed_idx",
            ),
        ),
    ]
