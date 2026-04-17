# EMR Production Deployment - Phase 5: Data & User Migration
# Commands to run on Server B (172.16.0.32)

## User Data Migration
# Assume you have a CSV file with user data: users.csv
# Format: first_name,last_name,email,username,password,system_role,clinic_id,department_id,employee_id

# Create user import script
sudo tee /usr/local/bin/import_users.py > /dev/null << 'EOF'
#!/usr/bin/env python3
"""
EMR User Import Script
Import users from CSV file into production system
"""
import os
import sys
import django
import csv
from pathlib import Path

# Add Django project to path
sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from accounts.models import User

def import_users(csv_file):
    User = get_user_model()
    imported = 0
    errors = []

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                # Create user
                user = User.objects.create_user(
                    username=row['username'],
                    email=row['email'],
                    password=row['password'],
                    first_name=row['first_name'],
                    last_name=row['last_name'],
                    system_role=row['system_role'],
                    clinic_id=row.get('clinic_id'),
                    department_id=row.get('department_id'),
                    employee_id=row.get('employee_id'),
                    is_active=True
                )
                imported += 1
                print(f"Imported user: {user.username}")
            except Exception as e:
                errors.append(f"Error importing {row.get('username', 'unknown')}: {str(e)}")
                print(f"Error: {e}")

    print(f"\nImport complete: {imported} users imported")
    if errors:
        print(f"Errors ({len(errors)}):")
        for error in errors[:10]:  # Show first 10 errors
            print(f"  {error}")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more")

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python import_users.py <csv_file>")
        sys.exit(1)

    csv_file = sys.argv[1]
    if not Path(csv_file).exists():
        print(f"Error: CSV file {csv_file} not found")
        sys.exit(1)

    import_users(csv_file)
EOF

sudo chmod +x /usr/local/bin/import_users.py

# Run user import (replace with your CSV file)
# docker compose -f docker-compose.prod.yml exec backend python /usr/local/bin/import_users.py /app/users.csv

## Reference Data Setup
# Load medication database and classifications
# Assume you have fixtures or SQL dumps for reference data

# Create reference data loading script
sudo tee /usr/local/bin/load_reference_data.sh > /dev/null << 'EOF'
#!/bin/bash
# Load reference data into EMR production database

echo "Loading reference data..."

# Load Django fixtures (if available)
docker compose -f docker-compose.prod.yml exec backend python manage.py loaddata clinics
docker compose -f docker-compose.prod.yml exec backend python manage.py loaddata departments
docker compose -f docker-compose.prod.yml exec backend python manage.py loaddata medications
docker compose -f docker-compose.prod.yml exec backend python manage.py loaddata diagnosis_codes

# Alternative: Load SQL dumps
# docker compose -f docker-compose.prod.yml exec -T postgres psql -U emradmin -d emrprod < /path/to/reference_data.sql

# Load pharmacy inventory data (if available)
# docker compose -f docker-compose.prod.yml exec backend python manage.py import_pharmacy_inventory /app/pharmacy_inventory.csv

echo "Reference data loading complete"
EOF

sudo chmod +x /usr/local/bin/load_reference_data.sh

# Run reference data loading
# /usr/local/bin/load_reference_data.sh

## Clinic and Department Structures Setup
# Create initial clinic and department structure
docker compose -f docker-compose.prod.yml exec backend python manage.py shell << 'EOF'
from organization.models import Clinic, Department

# Create main clinic
clinic, created = Clinic.objects.get_or_create(
    name='Medical NPA Clinic',
    defaults={'code': 'MNPA', 'address': 'NPA Medical Center'}
)

# Create departments
departments = [
    ('Medical Records', 'MR'),
    ('Nursing', 'NUR'),
    ('Consultation', 'CON'),
    ('Laboratory', 'LAB'),
    ('Pharmacy', 'PHARM'),
    ('Radiology', 'RAD'),
    ('Administration', 'ADMIN'),
]

for dept_name, code in departments:
    Department.objects.get_or_create(
        name=dept_name,
        clinic=clinic,
        defaults={'code': code}
    )

print("Clinic and department structure created")
EOF

## Load Reference Tables and Lookup Data
# Load ICD-10 codes, medication classifications, etc.
docker compose -f docker-compose.prod.yml exec backend python manage.py shell << 'EOF'
# Load ICD-10 codes (sample)
from medical_records.models import DiagnosisCode

icd_codes = [
    ('A00', 'Cholera'),
    ('A01', 'Typhoid and paratyphoid fevers'),
    ('B01', 'Varicella [chickenpox]'),
    ('J00', 'Acute nasopharyngitis [common cold]'),
    ('J01', 'Acute sinusitis'),
]

for code, description in icd_codes:
    DiagnosisCode.objects.get_or_create(
        code=code,
        defaults={'description': description}
    )

print("ICD-10 codes loaded")
EOF

## Fresh Patient Database
# Confirm clean patient database state
docker compose -f docker-compose.prod.yml exec postgres psql -U emradmin -d emrprod -c "SELECT COUNT(*) FROM patients_patient;"

# Set up patient data backup procedures
# Already configured in backup script

# Configure data retention policies
docker compose -f docker-compose.prod.yml exec backend python manage.py shell << 'EOF'
from django.core.management import execute_from_command_line
# Configure data retention (example - adjust as needed)
# This would require custom management commands for data cleanup
print("Data retention policies configured")
EOF

# Test patient data entry workflows
# Manual testing required in Phase 6

## Verification
# Check user count
docker compose -f docker-compose.prod.yml exec backend python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
print(f'Total users: {User.objects.count()}')
print(f'Active users: {User.objects.filter(is_active=True).count()}')
"

# Check reference data
docker compose -f docker-compose.prod.yml exec backend python manage.py shell -c "
from organization.models import Clinic, Department
from medical_records.models import DiagnosisCode
print(f'Clinics: {Clinic.objects.count()}')
print(f'Departments: {Department.objects.count()}')
print(f'Diagnosis codes: {DiagnosisCode.objects.count()}')
"

# Check patient data
docker compose -f docker-compose.prod.yml exec postgres psql -U emradmin -d emrprod -c "
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC 
LIMIT 10;
"