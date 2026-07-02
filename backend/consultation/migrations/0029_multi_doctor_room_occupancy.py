# Allow multiple active doctors per consultation room (up to capacity).

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('consultation', '0028_consultation_room_occupancy'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='consultationroomoccupancy',
            name='uniq_active_room_occupancy',
        ),
    ]
