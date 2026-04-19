import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()
from patients.models import Patient

# Check what categories exist
categories = Patient.objects.values_list('category', flat=True).distinct()
print(f'Categories: {list(categories)}')

# Check for patients with empty first_name
empty_first = Patient.objects.filter(first_name='')
print(f'Patients with empty first_name: {empty_first.count()}')

# Show some patient details
for r in Patient.objects.all()[:5]:
    print(f'ID: {r.id}, Category: {r.category}, First: {r.first_name!r}, Surname: {r.surname}')
