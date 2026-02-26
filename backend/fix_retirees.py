import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()

from patients.models import Patient

# Find and list retirees with empty first_name
retirees = Patient.objects.filter(patient_type='Retiree', first_name='')
count = retirees.count()
print(f"Found {count} retirees with empty first_name")

if count > 0:
    print("\nFixing...")
    for retiree in retirees:
        old_name = retiree.get_full_name()
        if retiree.surname:
            retiree.first_name = retiree.surname
            retiree.save()
            new_name = retiree.get_full_name()
            print(f"  {retiree.patient_id}: '{old_name}' → '{new_name}'")
    print(f"\n✓ Fixed {count} retiree records")
else:
    print("No retirees with empty first_name found!")
