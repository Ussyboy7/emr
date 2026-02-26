import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()
from patients.models import Patient

p = Patient.objects.get(patient_id='R-5801')
print(f'Title: "{p.title}"')
print(f'First: "{p.first_name}"')
print(f'Surname: "{p.surname}"')

# Test the logic
parts = []
if p.title:
    parts.append(f"TITLE[{p.title}]")
if p.first_name:
    parts.append(f"FIRST[{p.first_name}]")
if p.surname:
    parts.append(f"SURNAME[{p.surname}]")

print(f'Parts: {parts}')
print(f'Final result: {" ".join(parts)}')

# Now call the actual method
print(f'get_full_name() result: "{p.get_full_name()}"')
