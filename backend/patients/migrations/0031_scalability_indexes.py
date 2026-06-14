from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0030_nursing_procedure_visit_type"),
    ]

    operations = [
        TrigramExtension(),
        migrations.AddIndex(
            model_name="visit",
            index=models.Index(
                fields=["date", "status"],
                name="visits_date_status_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="patient",
            index=GinIndex(
                fields=["surname"],
                name="patients_surname_trgm_idx",
                opclasses=["gin_trgm_ops"],
            ),
        ),
        migrations.AddIndex(
            model_name="patient",
            index=GinIndex(
                fields=["first_name"],
                name="patients_first_name_trgm_idx",
                opclasses=["gin_trgm_ops"],
            ),
        ),
    ]
