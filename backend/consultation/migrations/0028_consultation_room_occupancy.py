from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('consultation', '0027_diagnosis_correction_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ConsultationRoomOccupancy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('on_seat', 'On Seat'), ('not_accepting', 'Not Accepting'), ('away', 'Away')], db_index=True, default='on_seat', max_length=20)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('checked_in_at', models.DateTimeField(auto_now_add=True)),
                ('checked_out_at', models.DateTimeField(blank=True, null=True)),
                ('last_seen_at', models.DateTimeField(auto_now=True)),
                ('doctor', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='room_occupancies', to=settings.AUTH_USER_MODEL)),
                ('room', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='occupancies', to='consultation.consultationroom')),
            ],
            options={
                'db_table': 'consultation_room_occupancies',
                'ordering': ['-checked_in_at'],
                'indexes': [models.Index(fields=['doctor', 'is_active'], name='consultatio_doctor__8f0a2d_idx')],
            },
        ),
        migrations.AddConstraint(
            model_name='consultationroomoccupancy',
            constraint=models.UniqueConstraint(condition=models.Q(('is_active', True)), fields=('room',), name='uniq_active_room_occupancy'),
        ),
    ]
