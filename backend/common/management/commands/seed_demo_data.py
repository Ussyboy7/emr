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
from permissions.models import Role, UserRole
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

            clinic, departments = self._create_organization()
            roles = self._create_roles()
            users = self._create_users(clinic, departments, roles)
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
        ConsultationRoom.objects.all().delete()  # Delete consultation rooms
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
        Room.objects.all().delete()  # Delete organization rooms
        Department.objects.all().delete()  # Delete departments
        Clinic.objects.all().delete()  # Delete clinics (will cascade delete departments and rooms)
        UserRole.objects.all().delete()  # Delete user-role relationships
        Role.objects.all().delete()  # Delete roles
        self.stdout.write(self.style.WARNING("Existing demo data removed."))

    def _create_roles(self):
        """Create default roles with permissions."""
        self.stdout.write("Creating roles and permissions...")
        roles = {}
        
        # Define permissions mapping: frontend permission ID -> (module, action)
        # Backend stores as: {"module": ["action1", "action2"]}
        permission_map = {
            # Medical Records
            'patient_view': ('Medical Records', 'view'),
            'patient_create': ('Medical Records', 'create'),
            'patient_edit': ('Medical Records', 'edit'),
            'patient_delete': ('Medical Records', 'delete'),
            'visit_view': ('Medical Records', 'view'),
            'visit_create': ('Medical Records', 'create'),
            'visit_edit': ('Medical Records', 'edit'),
            'reports_view': ('Medical Records', 'view'),
            'reports_generate': ('Medical Records', 'generate'),
            
            # Consultation
            'consultation_view': ('Consultation', 'view'),
            'consultation_start': ('Consultation', 'start'),
            'consultation_prescribe': ('Consultation', 'prescribe'),
            'consultation_diagnosis': ('Consultation', 'diagnosis'),
            'consultation_lab_order': ('Consultation', 'lab_order'),
            'consultation_radiology_order': ('Consultation', 'radiology_order'),
            'consultation_referral': ('Consultation', 'referral'),
            'consultation_nursing_order': ('Consultation', 'nursing_order'),
            
            # Nursing
            'nursing_vitals': ('Nursing', 'vitals'),
            'nursing_triage': ('Nursing', 'triage'),
            'nursing_administer': ('Nursing', 'administer'),
            'nursing_procedures': ('Nursing', 'procedures'),
            'nursing_notes': ('Nursing', 'notes'),
            'nursing_queue': ('Nursing', 'queue'),
            
            # Laboratory
            'lab_orders_view': ('Laboratory', 'view'),
            'lab_collect': ('Laboratory', 'collect'),
            'lab_process': ('Laboratory', 'process'),
            'lab_results': ('Laboratory', 'results'),
            'lab_verify': ('Laboratory', 'verify'),
            'lab_templates': ('Laboratory', 'templates'),
            
            # Pharmacy
            'pharmacy_view': ('Pharmacy', 'view'),
            'pharmacy_dispense': ('Pharmacy', 'dispense'),
            'pharmacy_inventory': ('Pharmacy', 'inventory'),
            'pharmacy_substitute': ('Pharmacy', 'substitute'),
            
            # Radiology
            'radiology_view': ('Radiology', 'view'),
            'radiology_perform': ('Radiology', 'perform'),
            'radiology_report': ('Radiology', 'report'),
            'radiology_verify': ('Radiology', 'verify'),
            
            # Administration
            'admin_users': ('Administration', 'users'),
            'admin_roles': ('Administration', 'roles'),
            'admin_rooms': ('Administration', 'rooms'),
            'admin_clinics': ('Administration', 'clinics'),
            'admin_settings': ('Administration', 'settings'),
            'admin_audit': ('Administration', 'audit'),
        }
        
        # Helper function to build permissions JSON from permission IDs
        def build_permissions(perm_ids):
            perms = {}
            for perm_id in perm_ids:
                if perm_id in permission_map:
                    module, action = permission_map[perm_id]
                    if module not in perms:
                        perms[module] = []
                    if action not in perms[module]:
                        perms[module].append(action)
            return perms
        
        # System Administrator - Full access
        admin_role, _ = Role.objects.get_or_create(
            name='System Administrator',
            defaults={
                'type': 'admin',
                'description': 'Full system access with all permissions',
                'permissions': build_permissions([
                    'patient_view', 'patient_create', 'patient_edit', 'patient_delete',
                    'visit_view', 'visit_create', 'visit_edit', 'reports_view', 'reports_generate',
                    'consultation_view', 'consultation_start', 'consultation_prescribe', 'consultation_diagnosis',
                    'consultation_lab_order', 'consultation_radiology_order', 'consultation_referral', 'consultation_nursing_order',
                    'nursing_vitals', 'nursing_triage', 'nursing_administer', 'nursing_procedures', 'nursing_notes', 'nursing_queue',
                    'lab_orders_view', 'lab_collect', 'lab_process', 'lab_results', 'lab_verify', 'lab_templates',
                    'pharmacy_view', 'pharmacy_dispense', 'pharmacy_inventory', 'pharmacy_substitute',
                    'radiology_view', 'radiology_perform', 'radiology_report', 'radiology_verify',
                    'admin_users', 'admin_roles', 'admin_rooms', 'admin_clinics', 'admin_settings', 'admin_audit',
                ]),
                'is_active': True,
            }
        )
        roles['System Administrator'] = admin_role
        
        # Medical Doctor - Clinical access
        doctor_role, _ = Role.objects.get_or_create(
            name='Medical Doctor',
            defaults={
                'type': 'doctor',
                'description': 'Full clinical access for patient care and consultation',
                'permissions': build_permissions([
                    'patient_view', 'patient_create', 'patient_edit',
                    'visit_view', 'visit_create', 'visit_edit', 'reports_view', 'reports_generate',
                    'consultation_view', 'consultation_start', 'consultation_prescribe', 'consultation_diagnosis',
                    'consultation_lab_order', 'consultation_radiology_order', 'consultation_referral', 'consultation_nursing_order',
                    'nursing_vitals', 'nursing_queue',
                    'lab_orders_view', 'lab_results',
                    'pharmacy_view',
                    'radiology_view', 'radiology_report',
                ]),
                'is_active': True,
            }
        )
        roles['Medical Doctor'] = doctor_role
        
        # Nursing Officer - Nursing care
        nurse_role, _ = Role.objects.get_or_create(
            name='Nursing Officer',
            defaults={
                'type': 'nurse',
                'description': 'Nursing care, vitals, and patient triage',
                'permissions': build_permissions([
                    'patient_view', 'patient_edit',
                    'visit_view', 'visit_create', 'visit_edit',
                    'consultation_view',
                    'nursing_vitals', 'nursing_triage', 'nursing_administer', 'nursing_procedures', 'nursing_notes', 'nursing_queue',
                    'lab_orders_view',
                    'pharmacy_view',
                ]),
                'is_active': True,
            }
        )
        roles['Nursing Officer'] = nurse_role
        
        # Laboratory Scientist - Lab operations
        lab_role, _ = Role.objects.get_or_create(
            name='Laboratory Scientist',
            defaults={
                'type': 'lab_tech',
                'description': 'Laboratory testing and result management',
                'permissions': build_permissions([
                    'patient_view',
                    'visit_view',
                    'lab_orders_view', 'lab_collect', 'lab_process', 'lab_results', 'lab_verify', 'lab_templates',
                ]),
                'is_active': True,
            }
        )
        roles['Laboratory Scientist'] = lab_role
        
        # Pharmacist - Pharmacy operations
        pharmacist_role, _ = Role.objects.get_or_create(
            name='Pharmacist',
            defaults={
                'type': 'pharmacist',
                'description': 'Prescription dispensing and inventory management',
                'permissions': build_permissions([
                    'patient_view',
                    'visit_view',
                    'pharmacy_view', 'pharmacy_dispense', 'pharmacy_inventory', 'pharmacy_substitute',
                ]),
                'is_active': True,
            }
        )
        roles['Pharmacist'] = pharmacist_role
        
        # Radiologist - Radiology operations
        radiologist_role, _ = Role.objects.get_or_create(
            name='Radiologist',
            defaults={
                'type': 'radiologist',
                'description': 'Radiology studies and reporting',
                'permissions': build_permissions([
                    'patient_view',
                    'visit_view',
                    'radiology_view', 'radiology_perform', 'radiology_report', 'radiology_verify',
                ]),
                'is_active': True,
            }
        )
        roles['Radiologist'] = radiologist_role
        
        # Medical Records Officer - Records management
        records_role, _ = Role.objects.get_or_create(
            name='Medical Records Officer',
            defaults={
                'type': 'records',
                'description': 'Patient and visit record management',
                'permissions': build_permissions([
                    'patient_view', 'patient_create', 'patient_edit',
                    'visit_view', 'visit_create', 'visit_edit',
                    'reports_view', 'reports_generate',
                ]),
                'is_active': True,
            }
        )
        roles['Medical Records Officer'] = records_role
        
        self.stdout.write(f"  ✓ Created {len(roles)} roles")
        return roles

    def _create_users(self, clinic, departments, roles):
        """Create demo users and assign them to clinic, departments, and roles."""
        self.stdout.write("Creating users...")
        users = {}

        # Map system roles to departments
        role_to_department = {
            'System Administrator': None,  # Admin doesn't need a department
            'Medical Doctor': 'Consultation',
            'Nursing Officer': 'Nursing',
            'Laboratory Scientist': 'Laboratory',
            'Pharmacist': 'Pharmacy',
            'Radiologist': 'Radiology',
            'Medical Records Officer': 'Medical Records',
        }

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
            system_role = data['system_role']
            
            # Assign clinic and department based on role
            data['clinic'] = clinic
            dept_name = role_to_department.get(system_role)
            if dept_name and dept_name in departments:
                data['department'] = departments[dept_name]
            
            user, created = User.objects.get_or_create(
                username=username,
                defaults=data
            )
            if created or not user.check_password('ChangeMe123!'):
                user.set_password('ChangeMe123!')
                # Update clinic and department if they weren't set during creation
                if not user.clinic:
                    user.clinic = clinic
                if not user.department and dept_name and dept_name in departments:
                    user.department = departments[dept_name]
                user.save()
            
            users[username] = user

        # Assign roles to users after all users are created
        for username, user in users.items():
            system_role = None
            for data in user_data:
                if data['username'] == username:
                    system_role = data['system_role']
                    break
            
            if system_role and system_role in roles:
                role = roles[system_role]
                UserRole.objects.get_or_create(
                    user=user,
                    role=role,
                    defaults={'assigned_by': users.get('admin')}  # Admin assigns roles
                )

        self.stdout.write(f"  ✓ Created {len(users)} users with roles assigned")
        return users

    def _create_organization(self):
        """Create organization structure."""
        self.stdout.write("Creating organization structure...")

        # Create Bode Thomas Clinic
        clinic, _ = Clinic.objects.get_or_create(
            code='BODE-THOMAS',
            defaults={
                'name': 'Bode Thomas Clinic',
                'location': 'Bode Thomas, Lagos',
                'phone': '+234-1-1234567',
                'email': 'bode.thomas@npa.gov.ng',
            }
        )

        # Create all functional departments (modules)
        departments = {}
        department_data = [
            {'name': 'Medical Records', 'code': 'MED-REC'},
            {'name': 'Nursing', 'code': 'NURSING'},
            {'name': 'Consultation', 'code': 'CONSULT'},
            {'name': 'Laboratory', 'code': 'LAB'},
            {'name': 'Pharmacy', 'code': 'PHARM'},
            {'name': 'Radiology', 'code': 'RAD'},
        ]

        for dept_data in department_data:
            dept, _ = Department.objects.get_or_create(
                clinic=clinic,
                name=dept_data['name'],
                defaults={'code': dept_data['code']}
            )
            departments[dept_data['name']] = dept

        # Note: We don't create consultation rooms in organization.Room anymore
        # Consultation rooms are managed through consultation.ConsultationRoom model
        # organization.Room is reserved for other room types (procedure, emergency, etc.) if needed in the future
        org_rooms_created = 0

        # Create consultation rooms (for consultation system)
        consultation_rooms_created = 0
        consultation_rooms_data = [
            # Consulting rooms 1-4
            {'room_number': 'CONSULT-001', 'name': 'Consulting Room 1'},
            {'room_number': 'CONSULT-002', 'name': 'Consulting Room 2'},
            {'room_number': 'CONSULT-003', 'name': 'Consulting Room 3'},
            {'room_number': 'CONSULT-004', 'name': 'Consulting Room 4'},
            # Management rooms
            {'room_number': 'CMO', 'name': 'CMO', 'specialty': 'Chief Medical Officer'},
            {'room_number': 'AGM', 'name': 'AGM', 'specialty': 'Assistant General Manager'},
            {'room_number': 'GM', 'name': 'GM', 'specialty': 'General Manager'},
            # Specialty rooms
            {'room_number': 'EYE', 'name': 'Eye', 'specialty': 'Ophthalmology'},
            {'room_number': 'PHYSIO', 'name': 'Physio', 'specialty': 'Physiotherapy'},
            {'room_number': 'DIAMOND', 'name': 'Diamond', 'specialty': 'Diamond'},
            {'room_number': 'SS', 'name': 'SS', 'specialty': 'SS'},
        ]
        
        for room_data in consultation_rooms_data:
            room, created = ConsultationRoom.objects.get_or_create(
                room_number=room_data['room_number'],
                defaults={
                    'name': room_data['name'],
                    'clinic': clinic,  # Link to clinic
                    'specialty': room_data.get('specialty', ''),
                    'status': 'active',
                    'is_active': True,
                    'location': clinic.location if clinic else '',
                }
            )
            # Update existing rooms to link to clinic if they don't have one
            if not created and not room.clinic:
                room.clinic = clinic
                room.save()
            if created:
                consultation_rooms_created += 1

        self.stdout.write(f"  ✓ Created clinic: {clinic.name}")
        self.stdout.write(f"  ✓ Created {len(departments)} departments")
        self.stdout.write(f"  ✓ Created {consultation_rooms_created} consultation rooms (in ConsultationRoom model)")
        if org_rooms_created > 0:
            self.stdout.write(f"  ✓ Created {org_rooms_created} organization rooms (non-consultation)")
        self.stdout.write("  ✓ Organization structure created")
        return clinic, departments

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
        """Create consultation sessions and queue items."""
        self.stdout.write("Creating consultation data...")
        
        if not patients:
            return

        # Get a doctor user
        doctor = users.get('doctor')
        if not doctor:
            doctor = users.get('admin')  # Fallback to admin if no doctor
        
        # Get consultation rooms
        rooms = ConsultationRoom.objects.filter(is_active=True).order_by('room_number')[:4]  # Get first 4 rooms
        
        if not rooms.exists():
            self.stdout.write("  ⚠ No consultation rooms found, skipping consultation data")
            return
        
        # Create some visits for patients
        from patients.models import Visit
        visits_created = 0
        for i, patient in enumerate(patients[:3]):  # Create visits for first 3 patients
            visit, created = Visit.objects.get_or_create(
                patient=patient,
                visit_id=f'VIS-2024-{1000 + i}',
                defaults={
                    'visit_type': ['emergency', 'consultation', 'follow_up'][i % 3],
                    'status': 'in_progress',
                    'chief_complaint': [
                        'Severe chest pain',
                        'Routine check-up',
                        'Follow-up for hypertension',
                        'Headache and fever',
                        'Abdominal pain',
                        'Shortness of breath',
                    ][i % 6],
                    'date': timezone.now().date(),
                    'time': timezone.now().time(),
                    'doctor': doctor,
                    'created_by': doctor,
                }
            )
            if created:
                visits_created += 1
        
        # Create queue items for patients with visits
        queue_items_created = 0
        
        def get_priority_from_visit_type(visit_type):
            """Map visit type to priority number (backend logic)."""
            visit_type_map = {
                'emergency': 0,
                'follow_up': 1,
                'follow-up': 1,
                'consultation': 2,
                'routine': 3,
            }
            return visit_type_map.get(visit_type.lower() if visit_type else '', 2)
        
        for i, patient in enumerate(patients[:3]):
            visit = Visit.objects.filter(patient=patient).first()
            if visit:
                # Assign to different rooms
                room = rooms[i % len(rooms)]
                priority = get_priority_from_visit_type(visit.visit_type)
                
                queue_item, created = ConsultationQueue.objects.get_or_create(
                    room=room,
                    patient=patient,
                    visit=visit,
                    is_active=True,
                    defaults={
                        'priority': priority,
                        'notes': f'Queued for {room.name}',
                    }
                )
                if created:
                    queue_items_created += 1

        self.stdout.write(f"  ✓ Created {visits_created} visits")
        self.stdout.write(f"  ✓ Created {queue_items_created} queue items")
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

