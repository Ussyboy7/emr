from django.db import migrations, models
import django.utils.timezone
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("patients", "0015_vitalreading_pain_scale_blood_sugar"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="MedicalCertificate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("purpose", models.CharField(choices=[("fitness", "Fitness Certificate"), ("illness", "Illness / Sick Leave"), ("travel", "Travel Medical"), ("employment", "Employment Medical")], max_length=20)),
                ("valid_from", models.DateField()),
                ("valid_to", models.DateField()),
                ("findings", models.TextField(blank=True)),
                ("recommendations", models.TextField(blank=True)),
                ("certificate_number", models.CharField(db_index=True, max_length=50, unique=True)),
                ("issued_at", models.DateTimeField(auto_now_add=True)),
                ("patient_name_snapshot", models.CharField(blank=True, max_length=200)),
                ("patient_id_snapshot", models.CharField(blank=True, max_length=50)),
                ("patient_category_snapshot", models.CharField(blank=True, max_length=20)),
                ("doctor_name_snapshot", models.CharField(blank=True, max_length=200)),
                (
                    "issued_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="issued_medical_certificates",
                        to="accounts.user",
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="medical_certificates", to="patients.patient"),
                ),
            ],
            options={"db_table": "medical_certificates", "ordering": ["-issued_at"]},
        ),
    ]

