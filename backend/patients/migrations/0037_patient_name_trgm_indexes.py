from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0036_patient_is_first_time_patient"),
    ]

    operations = [
        TrigramExtension(),
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
        migrations.AddIndex(
            model_name="patient",
            index=GinIndex(
                fields=["middle_name"],
                name="patients_middle_name_trgm_idx",
                opclasses=["gin_trgm_ops"],
            ),
        ),
        migrations.AddIndex(
            model_name="patient",
            index=GinIndex(
                fields=["patient_id"],
                name="patients_patient_id_trgm_idx",
                opclasses=["gin_trgm_ops"],
            ),
        ),
    ]
