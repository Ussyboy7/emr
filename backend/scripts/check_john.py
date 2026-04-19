import os; import django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings'); django.setup(); from patients.models import Patient; r = Patient.objects.filter(category='retiree').first(); print(f'ID: {r.patient_id}, Title: {r.titlerm -rf .next
}, First: {r.first_namerm -rf .next
}, Middle: {r.middle_namerm -rf .next
}, Surname: {r.surnamerm -rf .next
}'); print(f'Full name: {r.get_full_name()}')
