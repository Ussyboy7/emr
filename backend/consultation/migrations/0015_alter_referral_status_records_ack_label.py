# Generated manually for display label change (DB value unchanged).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("consultation", "0014_backfill_referral_submitted_at"),
    ]

    operations = [
        migrations.AlterField(
            model_name="referral",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("submitted_to_records", "Submitted to Records"),
                    ("records_review", "Records Review"),
                    ("returned_for_correction", "Returned for Correction"),
                    ("approved_for_forms", "Records acknowledged"),
                    ("closed", "Closed"),
                    ("cancelled", "Cancelled"),
                ],
                default="draft",
                max_length=40,
            ),
        ),
    ]
