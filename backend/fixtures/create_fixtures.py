"""
Management command to create fixture data for development/testing.
Run with: python manage.py shell < fixtures/create_fixtures.py
"""
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import datetime, timedelta
import random

from accounts.models import User
from patients.models import Patient, Visit, VitalReading, MedicalHistory
from laboratory.models import LabTemplate, LabOrder, LabTest
from pharmacy.models import Medication, MedicationInventory, Prescription, PrescriptionItem
from radiology.models import RadiologyOrder, RadiologyStudy
from consultation.models import ConsultationRoom, ConsultationSession
from nursing.models import NursingOrder
from organization.models import Clinic, Department, Room
from permissions.models import Role
from notifications.models import Notification

User = get_user_model()

def create_fixtures():
    """Create comprehensive fixture data."""
    
    print("Creating fixture data...")
    
    # 1. Create Users
    print("Creating users...")
    users = {}
    
    # Admin user
    admin, _ = User.objects.get_or_create(
        username='admin',
        defaults={
            'email': 'admin@npa.gov.ng',
            'first_name': 'System',
            'last_name': 'Administrator',
            'system_role': 'System Administrator',
            'employee_id': 'NPA-ADMIN-001',
            'is_staff': True,
            'is_superuser': True,
        }
    )
    admin.set_password('ChangeMe123!')
    admin.save()
    users['admin'] = admin
    
    # Doctor
    doctor, _ = User.objects.get_or_create(
        username='doctor',
        defaults={
            'email': 'doctor@npa.gov.ng',
            'first_name': 'John',
            'last_name': 'Okafor',
            'system_role': 'Medical Doctor',
            'employee_id': 'NPA-MED-001',
        }
    )
    doctor.set_password('ChangeMe123!')
    doctor.save()
    users['doctor'] = doctor
    
    # Nurse
    nurse, _ = User.objects.get_or_create(
        username='nurse',
        defaults={
            'email': 'nurse@npa.gov.ng',
            'first_name': 'Mary',
            'last_name': 'Adebayo',
            'system_role': 'Nursing Officer',
            'employee_id': 'NPA-NUR-001',
        }
    )
    nurse.set_password('ChangeMe123!')
    nurse.save()
    users['nurse'] = nurse
    
    # Lab Tech
    labtech, _ = User.objects.get_or_create(
        username='labtech',
        defaults={
            'email': 'labtech@npa.gov.ng',
            'first_name': 'Ibrahim',
            'last_name': 'Musa',
            'system_role': 'Laboratory Scientist',
            'employee_id': 'NPA-LAB-001',
        }
    )
    labtech.set_password('ChangeMe123!')
    labtech.save()
    users['labtech'] = labtech
    
    # Pharmacist
    pharmacist, _ = User.objects.get_or_create(
        username='pharmacist',
        defaults={
            'email': 'pharmacist@npa.gov.ng',
            'first_name': 'Chika',
            'last_name': 'Nwosu',
            'system_role': 'Pharmacist',
            'employee_id': 'NPA-PHR-001',
        }
    )
    pharmacist.set_password('ChangeMe123!')
    pharmacist.save()
    users['pharmacist'] = pharmacist
    
    # Radiologist
    radiologist, _ = User.objects.get_or_create(
        username='radiologist',
        defaults={
            'email': 'radiologist@npa.gov.ng',
            'first_name': 'Fatima',
            'last_name': 'Bello',
            'system_role': 'Radiologist',
            'employee_id': 'NPA-RAD-001',
        }
    )
    radiologist.set_password('ChangeMe123!')
    radiologist.save()
    users['radiologist'] = radiologist
    
    print(f"Created {len(users)} users")
    
    # 2. Create Organization Structure
    print("Creating organization structure...")
    
    clinic, _ = Clinic.objects.get_or_create(
        code='HQ-CLINIC',
        defaults={
            'name': 'Headquarters Clinic',
            'location': 'Headquarters',
            'phone': '+234-1-1234567',
            'email': 'clinic@npa.gov.ng',
        }
    )
    
    dept, _ = Department.objects.get_or_create(
        clinic=clinic,
        name='General Practice',
        defaults={
            'code': 'GEN-PRAC',
            'head': users['doctor'],
        }
    )
    
    room, _ = Room.objects.get_or_create(
        room_number='R001',
        defaults={
            'name': 'Consultation Room 1',
            'clinic': clinic,
            'department': dept,
            'room_type': 'consultation',
            'status': 'active',
        }
    )
    
    print("Organization structure created")
    
    # 3. Create Patients
    print("Creating patients...")
    patients = []
    
    patient_data = [
        {
            'patient_id': 'PAT-2024-001',
            'category': 'employee',
            'personal_number': 'NPA-EMP-001',
            'surname': 'Johnson',
            'first_name': 'Adebayo',
            'gender': 'male',
            'date_of_birth': '1979-05-15',
            'employee_type': 'officer',
            'division': 'Engineering',
            'location': 'Headquarters',
            'phone': '08012345678',
            'email': 'a.johnson@npa.gov.ng',
        },
        {
            'patient_id': 'PAT-2024-002',
            'category': 'employee',
            'personal_number': 'NPA-EMP-002',
            'surname': 'Mohammed',
            'first_name': 'Fatima',
            'gender': 'female',
            'date_of_birth': '1992-03-20',
            'employee_type': 'staff',
            'division': 'HR',
            'location': 'Headquarters',
            'phone': '08023456789',
            'email': 'f.mohammed@npa.gov.ng',
        },
        {
            'patient_id': 'PAT-2024-003',
            'category': 'retiree',
            'personal_number': 'NPA-RET-001',
            'surname': 'Okonkwo',
            'first_name': 'Grace',
            'gender': 'female',
            'date_of_birth': '1958-11-10',
            'phone': '08034567890',
        },
    ]
    
    for data in patient_data:
        patient, _ = Patient.objects.get_or_create(
            patient_id=data['patient_id'],
            defaults=data
        )
        patients.append(patient)
    
    print(f"Created {len(patients)} patients")
    
    # 4. Create Lab Templates
    print("Creating lab templates...")
    templates = []
    
    template_data = [
        {'code': 'CBC', 'name': 'Complete Blood Count', 'sample_type': 'Blood'},
        {'code': 'FBS', 'name': 'Fasting Blood Sugar', 'sample_type': 'Blood'},
        {'code': 'LIP', 'name': 'Lipid Profile', 'sample_type': 'Blood'},
        {'code': 'LFT', 'name': 'Liver Function Test', 'sample_type': 'Blood'},
        {'code': 'RFT', 'name': 'Renal Function Test', 'sample_type': 'Blood'},
        {'code': 'ELEC', 'name': 'Serum Electrolytes', 'sample_type': 'Blood'},
    ]
    
    for data in template_data:
        template, _ = LabTemplate.objects.get_or_create(
            code=data['code'],
            defaults=data
        )
        templates.append(template)
    
    print(f"Created {len(templates)} lab templates")
    
    # 5. Create Medications
    print("Creating medications...")
    medications = []
    
    med_data = [
        {'code': 'AMOX-500', 'name': 'Amoxicillin 500mg', 'generic_name': 'Amoxicillin', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
        {'code': 'PARA-500', 'name': 'Paracetamol 500mg', 'generic_name': 'Paracetamol', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
        {'code': 'IBUP-400', 'name': 'Ibuprofen 400mg', 'generic_name': 'Ibuprofen', 'unit': 'tablet', 'strength': '400mg', 'form': 'tablet'},
    ]
    
    for data in med_data:
        med, _ = Medication.objects.get_or_create(
            code=data['code'],
            defaults=data
        )
        medications.append(med)
    
    print(f"Created {len(medications)} medications")
    
    print("\n✅ Fixture data creation complete!")
    print("\nLogin credentials:")
    print("  Admin: admin / ChangeMe123!")
    print("  Doctor: doctor / ChangeMe123!")
    print("  Nurse: nurse / ChangeMe123!")
    print("  Lab Tech: labtech / ChangeMe123!")
    print("  Pharmacist: pharmacist / ChangeMe123!")
    print("  Radiologist: radiologist / ChangeMe123!")

if __name__ == '__main__':
    create_fixtures()

