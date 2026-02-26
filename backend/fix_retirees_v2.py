import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()
from patients.models import Patient

# Find retirees with empty first_name using correct field name 'category'
retirees = Patient.objects.filter(category='Retiree', first_name='')
count = retirees.count()
print(f'Found {count} retirees with empty first_name')

# Fix them by copying surname to first_name
for retiree in retirees:
    retiree.first_name = retiree.surname
    retiree.save()
    print(f'Fixed {retiree.id}: {retiree.surname}')

print(f'Fixed {count} retiree records')
