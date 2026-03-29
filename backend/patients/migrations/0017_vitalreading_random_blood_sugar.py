# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0016_medicalcertificate"),
    ]

    operations = [
        migrations.AddField(
            model_name="vitalreading",
            name="random_blood_sugar",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Random blood sugar (RBS) in mg/dL",
                max_digits=6,
                null=True,
            ),
        ),
    ]
