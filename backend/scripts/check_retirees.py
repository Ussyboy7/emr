import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()
from patients.models import Patient

# Check retirees
retirees = Patient.objects.filter(category='retiree')
print(f'Total retirees: {retirees.count()}')
for r in retirees[:3]:
    print(f'ID: {r.patient_id}, Title: {r.title!r}, First: {r.first_name!r}, Surname: {r.surname!r}, Full Name: {r.get_full_name()!r}')
