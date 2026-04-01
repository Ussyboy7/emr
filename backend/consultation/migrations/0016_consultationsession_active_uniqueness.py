from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("consultation", "0015_alter_referral_status_records_ack_label"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="consultationsession",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status", "active"), ("visit__isnull", False)),
                fields=("visit",),
                name="uniq_active_consult_session_per_visit",
            ),
        ),
        migrations.AddConstraint(
            model_name="consultationsession",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status", "active")),
                fields=("patient", "room"),
                name="uniq_active_consult_session_per_patient_room",
            ),
        ),
    ]
