# Raise shared-room capacity and replace one-doctor occupancy uniqueness.

from django.db import migrations, models


DEFAULT_SHARED_CAPACITY = 8


def bump_single_doctor_room_capacity(apps, schema_editor):
    ConsultationRoom = apps.get_model("consultation", "ConsultationRoom")
    ConsultationRoom.objects.filter(capacity=1).update(capacity=DEFAULT_SHARED_CAPACITY)


def noop_reverse(apps, schema_editor):
    # Do not force rooms back to capacity=1 — that re-breaks multi-doctor check-in.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("consultation", "0029_multi_doctor_room_occupancy"),
    ]

    operations = [
        migrations.AlterField(
            model_name="consultationroom",
            name="capacity",
            field=models.IntegerField(default=DEFAULT_SHARED_CAPACITY),
        ),
        migrations.RunPython(bump_single_doctor_room_capacity, noop_reverse),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveConstraint(
                    model_name="consultationroomoccupancy",
                    name="uniq_active_room_occupancy",
                ),
            ],
            database_operations=[
                # Constraint may already be gone (0029). Ignore if missing.
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE consultation_room_occupancies "
                        "DROP CONSTRAINT IF EXISTS uniq_active_room_occupancy;"
                    ),
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="consultationroomoccupancy",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=("room", "doctor"),
                name="uniq_active_room_doctor_occupancy",
            ),
        ),
    ]
