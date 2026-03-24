from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("wards", "0002_add_ward_assignment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="patientadmission",
            name="admission_type",
            field=models.CharField(
                choices=[
                    ("observation", "Observation (Day Care)"),
                    ("daycare_observation", "Day Care Observation"),
                    ("emergency", "Emergency"),
                    ("elective", "Elective"),
                    ("transfer", "Transfer from Another Ward"),
                    ("readmission", "Readmission"),
                ],
                default="elective",
                max_length=20,
            ),
        ),
    ]
