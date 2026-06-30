from django.db import migrations


def backfill_admitting_doctor(apps, schema_editor):
    PatientAdmission = apps.get_model('wards', 'PatientAdmission')
    ConsultationSession = apps.get_model('consultation', 'ConsultationSession')

    for admission in PatientAdmission.objects.filter(admitting_doctor__isnull=True):
        doctor_id = None
        if admission.visit_id:
            session = (
                ConsultationSession.objects.filter(visit_id=admission.visit_id)
                .exclude(doctor_id__isnull=True)
                .order_by('-started_at')
                .first()
            )
            if session:
                doctor_id = session.doctor_id
        if not doctor_id and admission.created_by_id:
            doctor_id = admission.created_by_id
        if doctor_id:
            admission.admitting_doctor_id = doctor_id
            admission.save(update_fields=['admitting_doctor_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('consultation', '0001_initial'),
        ('wards', '0010_patientadmission_admission_instructions'),
    ]

    operations = [
        migrations.RunPython(backfill_admitting_doctor, migrations.RunPython.noop),
    ]
