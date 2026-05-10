"""Step 2 of 2-step discharge: nurse exit summary + companion fields, plus
the new ``AdmissionEscort`` row that captures who escorts a transferred
patient and when the receiving facility acknowledged handover."""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('wards', '0005_observation_procedures_referral'),
        # AdmissionEscort.facility / referral point at consultation rows.
        ('consultation', '0021_seed_referral_facilities'),
    ]

    operations = [
        # ---- Nurse exit / sign-out fields on PatientAdmission ------------
        migrations.AddField(
            model_name='patientadmission',
            name='nurse_exit_summary',
            field=models.TextField(
                blank=True,
                help_text=(
                    "Nurse's exit observation summary recorded at sign-out: "
                    "condition at handoff, lines/drains removed, valuables "
                    "returned, education given, etc."
                ),
            ),
        ),
        migrations.AddField(
            model_name='patientadmission',
            name='discharged_with',
            field=models.CharField(
                blank=True,
                max_length=30,
                choices=[
                    ('self', 'Self / unaccompanied'),
                    ('family', 'Family / next of kin'),
                    ('escort_to_external', 'Escorted to external facility'),
                    ('transferred', 'Transferred internally'),
                    ('mortuary', 'Mortuary'),
                ],
                help_text='Whom the patient leaves with at sign-out.',
            ),
        ),
        migrations.AddField(
            model_name='patientadmission',
            name='companion_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='patientadmission',
            name='companion_relationship',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='patientadmission',
            name='companion_phone',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='patientadmission',
            name='physically_left_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='Timestamp set when the nurse confirmed the patient left.',
            ),
        ),
        migrations.AddField(
            model_name='patientadmission',
            name='confirmed_by_nurse',
            field=models.ForeignKey(
                blank=True,
                null=True,
                limit_choices_to={'system_role__in': ['Nurse', 'Nursing Officer', 'Midwife']},
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='confirmed_discharges',
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # ---- AdmissionEscort -------------------------------------------
        migrations.CreateModel(
            name='AdmissionEscort',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('facility_name_snapshot', models.CharField(blank=True, max_length=200, help_text='Receiving facility name as it was when the escort was created.')),
                ('transport_mode', models.CharField(
                    blank=True,
                    max_length=40,
                    choices=[
                        ('hospital_ambulance', 'Hospital ambulance'),
                        ('private_vehicle', 'Private vehicle'),
                        ('family_vehicle', 'Family vehicle'),
                        ('partner_facility_transport', 'Receiving facility transport'),
                        ('other', 'Other'),
                    ],
                )),
                ('departure_at', models.DateTimeField(blank=True, null=True)),
                ('handover_summary', models.TextField(blank=True, help_text='What was communicated to the receiving nurse at handover.')),
                ('arrival_confirmed_at', models.DateTimeField(blank=True, null=True)),
                ('arrival_notes', models.TextField(blank=True, help_text='Phone-call back details: time, name of receiving nurse, etc.')),
                ('arrival_call_outcome', models.CharField(
                    blank=True,
                    max_length=20,
                    choices=[
                        ('answered', 'Answered'),
                        ('voicemail', 'Voicemail / no answer'),
                        ('handover_in_person', 'Handover in person'),
                    ],
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('admission', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='escort',
                    to='wards.patientadmission',
                )),
                ('referral', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='admission_escorts',
                    to='consultation.referral',
                    help_text='Referral this escort fulfils (when destination is external).',
                )),
                ('facility', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='admission_escorts',
                    to='consultation.referralfacility',
                )),
                ('primary_nurse', models.ForeignKey(
                    blank=True,
                    null=True,
                    limit_choices_to={'system_role__in': ['Nurse', 'Nursing Officer', 'Midwife']},
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='escorts_led',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('additional_nurses', models.ManyToManyField(
                    blank=True,
                    limit_choices_to={'system_role__in': ['Nurse', 'Nursing Officer', 'Midwife']},
                    related_name='escorts_assisted',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('arrival_confirmed_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='escorts_arrival_confirmed',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='created_admission_escorts',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'admission_escorts',
                'ordering': ['-created_at'],
                'verbose_name': 'Admission escort',
                'verbose_name_plural': 'Admission escorts',
            },
        ),
    ]
