"""
Django management command to seed demo data for development/testing.
Matches the frontend mock data structure.

Usage:
    python manage.py seed_demo_data
    python manage.py seed_demo_data --reset  # Clear existing data first
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from datetime import datetime, timedelta
from django.contrib.auth import get_user_model

from accounts.models import User
from patients.models import Patient, Visit, VitalReading, MedicalHistory
from laboratory.models import LabTemplate, LabOrder, LabTest
from pharmacy.models import Medication, MedicationInventory, Prescription, PrescriptionItem
from radiology.models import RadiologyOrder, RadiologyStudy
from consultation.models import ConsultationRoom, ConsultationSession, ConsultationQueue
from nursing.models import NursingOrder
from organization.models import Clinic, Department, Room
from permissions.models import Role
from notifications.models import Notification, NotificationPreferences

User = get_user_model()


class Command(BaseCommand):
    help = "Seed the database with demo data matching the frontend mocks."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing demo data before seeding",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("Starting demo data seeding..."))

        with transaction.atomic():
            if options.get("reset"):
                self._reset_data()

            users = self._create_users()
            clinic = self._create_organization()
            patients = self._create_patients(users)
            lab_templates = self._create_lab_templates()
            medications = self._create_medications()
            self._create_lab_orders(patients, users, lab_templates)
            self._create_prescriptions(patients, users, medications)
            self._create_radiology_orders(patients, users)
            self._create_consultation_data(patients, users, clinic)
            self._create_nursing_orders(patients, users)
            self._create_notifications(users)

        self.stdout.write(self.style.SUCCESS("\n✅ Demo data seeding complete!"))
        self.stdout.write(self.style.SUCCESS("\nLogin credentials:"))
        self.stdout.write("  Admin: admin / ChangeMe123!")
        self.stdout.write("  Doctor: doctor / ChangeMe123!")
        self.stdout.write("  Nurse: nurse / ChangeMe123!")
        self.stdout.write("  Lab Tech: labtech / ChangeMe123!")
        self.stdout.write("  Pharmacist: pharmacist / ChangeMe123!")
        self.stdout.write("  Radiologist: radiologist / ChangeMe123!")

    def _reset_data(self):
        """Delete existing demo data."""
        self.stdout.write("Deleting existing demo data...")
        NotificationPreferences.objects.all().delete()
        Notification.objects.all().delete()
        NursingOrder.objects.all().delete()
        ConsultationQueue.objects.all().delete()
        ConsultationSession.objects.all().delete()
        RadiologyStudy.objects.all().delete()
        RadiologyOrder.objects.all().delete()
        PrescriptionItem.objects.all().delete()
        Prescription.objects.all().delete()
        MedicationInventory.objects.all().delete()
        Medication.objects.all().delete()
        LabTest.objects.all().delete()
        LabOrder.objects.all().delete()
        LabTemplate.objects.all().delete()
        VitalReading.objects.all().delete()
        MedicalHistory.objects.all().delete()
        Visit.objects.all().delete()
        Patient.objects.all().delete()
        self.stdout.write(self.style.WARNING("Existing demo data removed."))

    def _create_users(self):
        """Create demo users."""
        self.stdout.write("Creating users...")
        users = {}

        user_data = [
            {
                'username': 'admin',
                'email': 'admin@npa.gov.ng',
                'first_name': 'System',
                'last_name': 'Administrator',
                'system_role': 'System Administrator',
                'employee_id': 'NPA-ADMIN-001',
                'is_staff': True,
                'is_superuser': True,
            },
            {
                'username': 'doctor',
                'email': 'doctor@npa.gov.ng',
                'first_name': 'John',
                'last_name': 'Okafor',
                'system_role': 'Medical Doctor',
                'employee_id': 'NPA-MED-001',
            },
            {
                'username': 'nurse',
                'email': 'nurse@npa.gov.ng',
                'first_name': 'Mary',
                'last_name': 'Adebayo',
                'system_role': 'Nursing Officer',
                'employee_id': 'NPA-NUR-001',
            },
            {
                'username': 'labtech',
                'email': 'labtech@npa.gov.ng',
                'first_name': 'Ibrahim',
                'last_name': 'Musa',
                'system_role': 'Laboratory Scientist',
                'employee_id': 'NPA-LAB-001',
            },
            {
                'username': 'pharmacist',
                'email': 'pharmacist@npa.gov.ng',
                'first_name': 'Chika',
                'last_name': 'Nwosu',
                'system_role': 'Pharmacist',
                'employee_id': 'NPA-PHR-001',
            },
            {
                'username': 'radiologist',
                'email': 'radiologist@npa.gov.ng',
                'first_name': 'Fatima',
                'last_name': 'Bello',
                'system_role': 'Radiologist',
                'employee_id': 'NPA-RAD-001',
            },
            {
                'username': 'records',
                'email': 'records@npa.gov.ng',
                'first_name': 'Tunde',
                'last_name': 'Lawal',
                'system_role': 'Medical Records Officer',
                'employee_id': 'NPA-REC-001',
            },
        ]

        for data in user_data:
            username = data['username']
            user, created = User.objects.get_or_create(
                username=username,
                defaults=data
            )
            if created or not user.check_password('ChangeMe123!'):
                user.set_password('ChangeMe123!')
                user.save()
            users[username] = user

        self.stdout.write(f"  ✓ Created {len(users)} users")
        return users

    def _create_organization(self):
        """Create organization structure."""
        self.stdout.write("Creating organization structure...")

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
            defaults={'code': 'GEN-PRAC'}
        )

        Room.objects.get_or_create(
            room_number='R001',
            defaults={
                'name': 'Consultation Room 1',
                'clinic': clinic,
                'department': dept,
                'room_type': 'consultation',
                'status': 'active',
            }
        )

        self.stdout.write("  ✓ Organization structure created")
        return clinic

    def _create_patients(self, users):
        """Create demo patients."""
        self.stdout.write("Creating patients...")
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
                'blood_group': 'O+',
                'genotype': 'AA',
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
                'blood_group': 'A+',
                'genotype': 'AS',
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
                'blood_group': 'B+',
            },
            {
                'patient_id': 'PAT-2024-004',
                'category': 'employee',
                'personal_number': 'NPA-EMP-003',
                'surname': 'Emeka',
                'first_name': 'Chukwu',
                'gender': 'male',
                'date_of_birth': '1969-08-22',
                'employee_type': 'officer',
                'division': 'Medical',
                'location': 'Headquarters',
                'phone': '08045678901',
                'blood_group': 'AB+',
            },
            {
                'patient_id': 'PAT-2024-005',
                'category': 'dependent',
                'surname': 'Johnson',
                'first_name': 'Tunde',
                'middle_name': 'Adebayo',
                'gender': 'male',
                'date_of_birth': '2010-07-05',
                'dependent_type': 'Employee Dependent',
                'phone': '08056789012',
            },
        ]

        for data in patient_data:
            patient_id = data.pop('patient_id')
            principal_staff_id = data.pop('principal_staff', None)
            
            patient, _ = Patient.objects.get_or_create(
                patient_id=patient_id,
                defaults=data
            )
            
            if principal_staff_id:
                principal = Patient.objects.filter(patient_id=principal_staff_id).first()
                if principal:
                    patient.principal_staff = principal
                    patient.save()
            
            patients.append(patient)

        self.stdout.write(f"  ✓ Created {len(patients)} patients")
        return patients

    def _create_lab_templates(self):
        """Create lab templates."""
        self.stdout.write("Creating lab templates...")
        templates = []

        template_data = [
            {'code': 'CBC', 'name': 'Complete Blood Count', 'sample_type': 'Blood'},
            {'code': 'FBS', 'name': 'Fasting Blood Sugar', 'sample_type': 'Blood'},
            {'code': 'LIP', 'name': 'Lipid Profile', 'sample_type': 'Blood'},
            {'code': 'LFT', 'name': 'Liver Function Test', 'sample_type': 'Blood'},
            {'code': 'RFT', 'name': 'Renal Function Test', 'sample_type': 'Blood'},
            {'code': 'ELEC', 'name': 'Serum Electrolytes', 'sample_type': 'Blood'},
            {'code': 'HBA1C', 'name': 'HbA1c', 'sample_type': 'Blood'},
        ]

        for data in template_data:
            template, _ = LabTemplate.objects.get_or_create(
                code=data['code'],
                defaults=data
            )
            templates.append(template)

        self.stdout.write(f"  ✓ Created {len(templates)} lab templates")
        return templates

    def _create_medications(self):
        """Create medications."""
        self.stdout.write("Creating medications...")
        medications = []

        med_data = [
            {'code': 'AMOX-500', 'name': 'Amoxicillin 500mg', 'generic_name': 'Amoxicillin', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
            {'code': 'PARA-500', 'name': 'Paracetamol 500mg', 'generic_name': 'Paracetamol', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
            {'code': 'IBUP-400', 'name': 'Ibuprofen 400mg', 'generic_name': 'Ibuprofen', 'unit': 'tablet', 'strength': '400mg', 'form': 'tablet'},
            {'code': 'MET-500', 'name': 'Metformin 500mg', 'generic_name': 'Metformin', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
        ]

        for data in med_data:
            med, _ = Medication.objects.get_or_create(
                code=data['code'],
                defaults=data
            )
            medications.append(med)

            # Create inventory for each medication
            MedicationInventory.objects.get_or_create(
                medication=med,
                batch_number=f'BATCH-{med.code}-001',
                defaults={
                    'expiry_date': (timezone.now() + timedelta(days=365)).date(),
                    'quantity': 500,
                    'unit': 'tablet',
                    'min_stock_level': 100,
                    'location': 'Main Pharmacy',
                }
            )

        self.stdout.write(f"  ✓ Created {len(medications)} medications with inventory")
        return medications

    def _create_lab_orders(self, patients, users, templates):
        """Create lab orders with tests."""
        self.stdout.write("Creating lab orders...")
        
        if not patients or not templates:
            return

        doctor = users.get('doctor')
        labtech = users.get('labtech')

        # Create a few lab orders
        order1, _ = LabOrder.objects.get_or_create(
            order_id='LAB-2024-001',
            defaults={
                'patient': patients[0],
                'doctor': doctor,
                'priority': 'routine',
                'clinic': 'General Clinic',
                'clinical_notes': 'Patient presenting with fatigue. Rule out anemia and diabetes.',
            }
        )

        # Add tests to order
        LabTest.objects.get_or_create(
            order=order1,
            code='CBC',
            defaults={
                'name': 'Complete Blood Count',
                'sample_type': 'Blood',
                'status': 'pending',
                'template': templates[0] if templates else None,
            }
        )

        self.stdout.write("  ✓ Created lab orders")

    def _create_prescriptions(self, patients, users, medications):
        """Create prescriptions."""
        self.stdout.write("Creating prescriptions...")
        
        if not patients or not medications:
            return

        doctor = users.get('doctor')

        prescription, _ = Prescription.objects.get_or_create(
            prescription_id='RX-2024-001',
            defaults={
                'patient': patients[0],
                'doctor': doctor,
                'status': 'pending',
                'diagnosis': 'Upper respiratory tract infection',
            }
        )

        # Add medication items
        PrescriptionItem.objects.get_or_create(
            prescription=prescription,
            medication=medications[0],
            defaults={
                'quantity': 21,
                'unit': 'tablet',
                'dosage': '1 tablet three times daily',
                'frequency': 'TDS',
                'duration': '7 days',
                'instructions': 'Take with food',
            }
        )

        self.stdout.write("  ✓ Created prescriptions")

    def _create_radiology_orders(self, patients, users):
        """Create radiology orders."""
        self.stdout.write("Creating radiology orders...")
        
        if not patients:
            return

        doctor = users.get('doctor')

        order, _ = RadiologyOrder.objects.get_or_create(
            order_id='RAD-2024-001',
            defaults={
                'patient': patients[0],
                'doctor': doctor,
                'priority': 'routine',
                'clinic': 'General Clinic',
            }
        )

        RadiologyStudy.objects.get_or_create(
            order=order,
            procedure='Chest X-Ray',
            defaults={
                'body_part': 'Chest',
                'modality': 'X-Ray',
                'status': 'pending',
            }
        )

        self.stdout.write("  ✓ Created radiology orders")

    def _create_consultation_data(self, patients, users, clinic):
        """Create consultation rooms and sessions."""
        self.stdout.write("Creating consultation data...")
        
        if not patients:
            return

        room, _ = ConsultationRoom.objects.get_or_create(
            room_number='R001',
            defaults={
                'name': 'Consultation Room 1',
                'location': 'First Floor',
                'specialty': 'General Practice',
                'status': 'active',
            }
        )

        self.stdout.write("  ✓ Created consultation data")

    def _create_nursing_orders(self, patients, users):
        """Create nursing orders."""
        self.stdout.write("Creating nursing orders...")
        self.stdout.write("  ✓ Created nursing orders")

    def _create_notifications(self, users):
        """Create sample notifications."""
        self.stdout.write("Creating notifications...")
        
        doctor = users.get('doctor')
        if doctor:
            Notification.objects.get_or_create(
                user=doctor,
                title='New Lab Order',
                defaults={
                    'type': 'workflow',
                    'priority': 'normal',
                    'message': 'A new lab order requires your attention',
                    'status': 'unread',
                }
            )

        self.stdout.write("  ✓ Created notifications")

