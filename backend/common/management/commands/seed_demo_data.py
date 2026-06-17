"""
Django management command to seed demo data for development/testing.
Matches the frontend mock data structure.

Usage:
    python manage.py seed_demo_data
    python manage.py seed_demo_data --reset  # Clear existing data first
"""
import csv
from decimal import Decimal
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction
from django.utils import timezone
from datetime import datetime, timedelta
from django.contrib.auth import get_user_model

from accounts.models import User
from laboratory.models import LabTemplate, LabOrder, LabTest
from pharmacy.models import (
    GenericMedication, Medication, MedicationInventory, Prescription, PrescriptionItem,
    StockRequest, StockRequestItem, StockIssue, StockIssueLine, DispensaryReceiptLine,
)
from radiology.models import RadiologyOrder, RadiologyStudy
from consultation.models import ConsultationRoom, ConsultationSession, ConsultationQueue, ICD10Code, Diagnosis
from nursing.models import NursingOrder
from organization.models import Clinic, Department, Room
from wards.models import Ward, Bed
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
        parser.add_argument(
            "--preserve-users",
            action="store_true",
            help="Preserve existing users when resetting (don't delete them)",
        )
        parser.add_argument(
            "--force-pharmacy-inventory",
            action="store_true",
            help="Overwrite pharmacy Store/Dispensary inventory quantities (use with care)",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("Starting demo data seeding..."))

        self._force_pharmacy_inventory = bool(options.get("force_pharmacy_inventory"))

        with transaction.atomic():
            if options.get("reset"):
                self._reset_data(preserve_users=bool(options.get("preserve_users")))

            clinic, departments = self._create_organization()
            roles = self._create_roles()
            users = self._create_users(clinic, departments, roles)
            self._create_employee_patients()
            # Create wards and beds after users (for head nurse assignment)
            wards_created, beds_created = self._create_wards_and_beds(clinic, users.get('admin'))
            lab_templates = self._create_lab_templates()
            self._create_radiology_templates()
            medications = self._create_medications()
            self._create_icd10_codes()
            # self._create_diagnoses(users, icd10_codes)  # Disabled - no demo diagnosis data
            # self._create_prescriptions(users, medications)  # Disabled - no demo prescription data
            # self._create_radiology_orders(users)  # Disabled - no demo radiology data
            # self._create_consultation_data(users, clinic)  # Disabled - no demo consultation data
            # self._create_nursing_orders(users)  # Disabled - no demo nursing data
            # self._create_notifications(users)  # Disabled - no demo notification data

        self.stdout.write(self.style.SUCCESS("\n✅ Demo data seeding complete!"))
        self.stdout.write(self.style.SUCCESS("\nLogin credentials:"))
        self.stdout.write("  Admin: admin / Changeme")
        self.stdout.write("  Doctor: doctor / Changeme")
        self.stdout.write("  Nurse: nurse / Changeme")
        self.stdout.write("  Lab Tech: labtech / Changeme")
        self.stdout.write("  Pharmacist: pharmacist / Changeme")
        self.stdout.write("  Radiologist: radiologist / Changeme")
        self.stdout.write("  Records: records / Changeme")
        self.stdout.write("  Physiotherapist: physio / Changeme")

    def _reset_data(self, preserve_users: bool = False):
        """Delete existing demo data."""
        if preserve_users:
            self.stdout.write("Deleting existing demo data (preserving users)...")
        else:
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
        # Delete stock-related records first (they have protected FKs to MedicationInventory)
        StockIssueLine.objects.all().delete()
        StockIssue.objects.all().delete()
        StockRequestItem.objects.all().delete()
        StockRequest.objects.all().delete()
        DispensaryReceiptLine.objects.all().delete()
        MedicationInventory.objects.all().delete()
        Medication.objects.all().delete()
        GenericMedication.objects.all().delete()
        LabTest.objects.all().delete()
        LabOrder.objects.all().delete()
        LabTemplate.objects.all().delete()
        Room.objects.all().delete()  # Delete organization rooms
        Department.objects.all().delete()  # Delete departments

        # Only delete clinics if not preserving users (clinics cascade to users)
        if not preserve_users:
            Clinic.objects.all().delete()  # Delete clinics (will cascade delete departments and rooms)
        else:
            self.stdout.write("Preserving existing clinics and users...")
        UserRole.objects.all().delete()  # Delete user-role relationships
        Role.objects.all().delete()  # Delete roles
        self.stdout.write(self.style.WARNING("Existing demo data removed."))

    def _create_employee_patients(self):
        self.stdout.write("Creating employee patients...")
        try:
            call_command("seed_employee_patients")
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"  ! Employee patient seeding skipped: {e}"))

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

            # Physiotherapy
            'physio_view': ('Physiotherapy', 'view'),

            # Analytics
            'analytics_view': ('Analytics', 'view'),
            'analytics_executive': ('Analytics', 'executive'),

            # Human Resources
            'hr_view': ('Human Resources', 'view'),

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
        
        # System Administrator - Full access to ALL pages
        admin_role, _ = Role.objects.get_or_create(
            name='System Administrator',
            defaults={
                'type': 'admin',
                'description': 'Full system access with all permissions',
                'permissions': [
                    "/admin", "/admin/annual-checkup-programme", "/admin/audit", "/admin/clinics", "/admin/roles", "/admin/rooms", "/admin/settings", "/admin/users",
                    "/analytics", "/analytics/executive",
                    "/hr", "/hr/annual-checkups", "/hr/exemptions",
                    "/consultation", "/consultation/history", "/consultation/referrals", "/consultation/start", "/consultation/wards",
                    "/laboratory", "/laboratory/completed", "/laboratory/orders", "/laboratory/templates", "/laboratory/verification",
                    "/medical-records", "/medical-records/appointments", "/medical-records/coding", "/medical-records/dependents", "/medical-records/patients", "/medical-records/patients/new", "/medical-records/referrals", "/medical-records/reports", "/medical-records/visits", "/medical-records/visits/new",
                    "/nursing", "/nursing/analytics", "/nursing/vitals-history", "/nursing/pool-queue", "/nursing/procedures", "/nursing/procedures/history", "/nursing/room-queue", "/nursing/wards",
                    "/pharmacy", "/pharmacy/history", "/pharmacy/inventory", "/pharmacy/prescriptions",
                    "/physiotherapy", "/physiotherapy/completed", "/physiotherapy/pool-queue",
                    "/radiology", "/radiology/completed", "/radiology/orders", "/radiology/templates", "/radiology/verification",
                ],
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
                'permissions': [
                    # Medical Records - All pages
                    '/medical-records', '/medical-records/patients/new', '/medical-records/patients',
                    '/medical-records/visits/new', '/medical-records/visits', '/medical-records/appointments',
                    '/medical-records/dependents', '/medical-records/reports',
                    # Consultation - All pages (referrals & forms live under /consultation/referrals)
                    '/consultation', '/consultation/start', '/consultation/history',
                    '/consultation/wards', '/consultation/referrals',
                    # Nursing - Limited access
                    '/nursing', '/nursing/analytics', '/nursing/vitals-history', '/nursing/pool-queue', '/nursing/room-queue',
                    # Laboratory - View access
                    '/laboratory', '/laboratory/orders', '/laboratory/verification', '/laboratory/completed',
                    # Pharmacy - View access
                    '/pharmacy', '/pharmacy/prescriptions', '/pharmacy/history',
                    # Radiology - View access
                    '/radiology', '/radiology/orders', '/radiology/verification', '/radiology/completed',
                    # Physiotherapy - View access
                    '/physiotherapy', '/physiotherapy/pool-queue', '/physiotherapy/completed',
                    # Analytics - View access
                    '/analytics',
                ],
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
                'permissions': [
                    # Medical Records - Selected pages only
                    '/medical-records',  # Dashboard - patient_view
                    '/medical-records/patients/new',  # Register Patient - patient_create
                    '/medical-records/patients',  # Manage Patients - patient_view
                    '/medical-records/visits',  # NEW: Manage Visits - visit_view

                    # Consultation - Selected pages only
                    '/consultation',  # My Dashboard - consultation_view

                    # Nursing - All permissions (add explicit permissions for UI display)
                    '/nursing/vitals-history',  # nursing_vitals
                    '/nursing/pool-queue',  # nursing_queue
                    '/nursing/analytics',  # nursing_queue — pool metrics
                    '/nursing/room-queue',  # nursing_queue
                    '/nursing/procedures',  # nursing_procedures
                    '/nursing/procedures/history',  # nursing_notes (map to notes)
                    '/nursing/wards',  # nursing_triage (map to triage)

                    # Laboratory - Selected pages only
                    '/laboratory/orders',  # Lab Orders - lab_orders_view

                    # Pharmacy - Selected pages only
                    '/pharmacy/prescriptions',  # Prescriptions - pharmacy_view

                    # Physiotherapy - Selected pages only
                    '/physiotherapy/pool-queue',  # Pool Queue - physio_view

                    # Radiology: None
                    # Analytics: None
                    # Administration: None
                ],
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
                'permissions': [
                    # Basic patient access for lab work
                    '/medical-records/patients',  # View patients for lab orders

                    # Laboratory - All pages
                    '/laboratory', '/laboratory/orders', '/laboratory/verification',
                    '/laboratory/completed', '/laboratory/templates',

                    # No other modules
                ],
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
                'permissions': [
                    # Basic patient access for prescriptions
                    '/medical-records/patients',  # View patients for prescriptions

                    # Pharmacy - All pages
                    '/pharmacy', '/pharmacy/prescriptions', '/pharmacy/history', '/pharmacy/inventory',

                    # No other modules
                ],
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
                'permissions': [
                    # Basic patient access for radiology work
                    '/medical-records/patients',  # View patients for radiology orders

                    # Radiology - All pages
                    '/radiology', '/radiology/orders', '/radiology/verification', '/radiology/completed', '/radiology/templates',

                    # No other modules
                ],
                'is_active': True,
            }
        )
        roles['Radiologist'] = radiologist_role

        # Physiotherapist - Rehabilitation and physiotherapy services
        physio_role, _ = Role.objects.get_or_create(
            name='Physiotherapist',
            defaults={
                'type': 'physiotherapist',
                'description': 'Rehabilitation and physiotherapy treatment services',
                'permissions': [
                    # Basic patient access for physiotherapy work
                    '/medical-records/patients',  # View patients for physiotherapy sessions

                    # Physiotherapy - All pages
                    '/physiotherapy', '/physiotherapy/pool-queue', '/physiotherapy/completed',

                    # Nursing coordination for patient management
                    '/nursing/pool-queue',  # Access to pool queue for patient coordination
                    '/nursing/analytics',  # Pool workload metrics

                    # Limited consultation access for referrals
                    '/consultation/referrals',  # View physiotherapy referrals
                ],
                'is_active': True,
            }
        )
        roles['Physiotherapist'] = physio_role

        # Medical Records Officer - Records management
        records_role, _ = Role.objects.get_or_create(
            name='Medical Records Officer',
            defaults={
                'type': 'records',
                'description': 'Patient and visit record management',
                'permissions': [
                    # Medical Records - All pages
                    '/medical-records', '/medical-records/patients/new', '/medical-records/patients',
                    '/medical-records/visits/new', '/medical-records/visits', '/medical-records/appointments',
                    '/medical-records/coding', '/medical-records/dependents', '/medical-records/referrals', '/medical-records/reports',
                    # No other modules
                ],
                'is_active': True,
            }
        )
        roles['Medical Records Officer'] = records_role

        hr_role, _ = Role.objects.get_or_create(
            name='Human Resources Officer',
            defaults={
                'type': 'administrative',
                'description': 'HR annual check-up compliance and exemptions',
                'permissions': [
                    '/hr', '/hr/annual-checkups', '/hr/exemptions',
                ],
                'is_active': True,
            }
        )
        roles['Human Resources Officer'] = hr_role
        
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
            'Physiotherapist': 'Physiotherapy',
            'Medical Records Officer': 'Medical Records',
        }

        user_data = [
            {
                'username': 'admin',
                'email': 'admin@nigerianports.gov.ng',
                'first_name': '',
                'last_name': '',
                'system_role': 'System Administrator',
                'employee_id': 'NPA-ADMIN-001',
                'is_staff': True,
                'is_superuser': True,
            },
            {
                'username': 'doctor',
                'email': 'doctor@nigerianports.gov.ng',
                'first_name': 'John',
                'last_name': 'Okafor',
                'system_role': 'Medical Doctor',
                'employee_id': 'NPA-MED-001',
            },
            {
                'username': 'nurse',
                'email': 'nurse@nigerianports.gov.ng',
                'first_name': 'Mary',
                'last_name': 'Adebayo',
                'system_role': 'Nursing Officer',
                'employee_id': 'NPA-NUR-001',
            },
            {
                'username': 'labtech',
                'email': 'labtech@nigerianports.gov.ng',
                'first_name': 'Ibrahim',
                'last_name': 'Musa',
                'system_role': 'Laboratory Scientist',
                'employee_id': 'NPA-LAB-001',
            },
            {
                'username': 'pharmacist',
                'email': 'pharmacist@nigerianports.gov.ng',
                'first_name': 'Chika',
                'last_name': 'Nwosu',
                'system_role': 'Pharmacist',
                'employee_id': 'NPA-PHR-001',
            },
            {
                'username': 'radiologist',
                'email': 'radiologist@nigerianports.gov.ng',
                'first_name': 'Fatima',
                'last_name': 'Bello',
                'system_role': 'Radiologist',
                'employee_id': 'NPA-RAD-001',
            },
            {
                'username': 'physio',
                'email': 'physio@nigerianports.gov.ng',
                'first_name': 'Ahmed',
                'last_name': 'Yusuf',
                'system_role': 'Physiotherapist',
                'employee_id': 'NPA-PHY-001',
            },
            {
                'username': 'records',
                'email': 'records@nigerianports.gov.ng',
                'first_name': 'Tunde',
                'last_name': 'Lawal',
                'system_role': 'Medical Records Officer',
                'employee_id': 'NPA-REC-001',
            },
            # New Lab Users
            {
                'username': 'b.muhamma',
                'email': 'b.muhamma@nigerianports.gov.ng',
                'first_name': 'Bashir',
                'last_name': 'Usman Muhamma',
                'system_role': 'Laboratory Scientist',
            },
            {
                'username': 'a.jamtari',
                'email': 'a.jamtari@nigerianports.gov.ng',
                'first_name': 'Abubakar',
                'last_name': 'Adam Jamtari',
                'system_role': 'Laboratory Scientist',
            },
            {
                'username': 'deborah',
                'email': 'deborah@nigerianports.gov.ng',
                'first_name': 'Deborah',
                'last_name': '',
                'system_role': 'Laboratory Scientist',
            },
            {
                'username': 'eme',
                'email': 'eme@nigerianports.gov.ng',
                'first_name': 'Eme',
                'last_name': '',
                'system_role': 'Laboratory Scientist',
            },
            {
                'username': 'simi',
                'email': 'simi@nigerianports.gov.ng',
                'first_name': 'Simi',
                'last_name': '',
                'system_role': 'Laboratory Scientist',
            },
            {
                'username': 'daniel',
                'email': 'daniel@nigerianports.gov.ng',
                'first_name': 'Daniel',
                'last_name': '',
                'system_role': 'Laboratory Scientist',
            },
            {
                'username': 'gemma',
                'email': 'gemma@nigerianports.gov.ng',
                'first_name': 'Gemma',
                'last_name': '',
                'system_role': 'Laboratory Scientist',
            },
            {
                'username': 'ifunaya',
                'email': 'ifunaya@nigerianports.gov.ng',
                'first_name': 'Ifunaya',
                'last_name': '',
                'system_role': 'Laboratory Scientist',
            },
            # New Medical Records Users
            {
                'username': 'n.chiedo',
                'email': 'n.chiedo@nigerianports.gov.ng',
                'first_name': 'Nonyerem',
                'last_name': 'Chiedo',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'o.janet',
                'email': 'o.janet@nigerianports.gov.ng',
                'first_name': 'Adaramola',
                'last_name': 'Janet Oluwaseun',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'zaynaboyegunle',
                'email': 'zaynaboyegunle@nigerianports.gov.ng',
                'first_name': 'Oyegunle',
                'last_name': 'Zaynab',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'shoyemimary3',
                'email': 'shoyemimary3@nigerianports.gov.ng',
                'first_name': 'Shoyemi',
                'last_name': 'Mary',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'ifeoluwaonab19',
                'email': 'ifeoluwaonab19@nigerianports.gov.ng',
                'first_name': 'Onabanjo',
                'last_name': 'Ifeoluwa Hannah',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'ibukuntoyin262',
                'email': 'ibukuntoyin262@nigerianports.gov.ng',
                'first_name': 'Omowunmi',
                'last_name': 'Ibukunoluwa Oluwatoyin',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'samuelhelen0329',
                'email': 'samuelhelen0329@nigerianports.gov.ng',
                'first_name': 'Samuel',
                'last_name': 'Helen',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'b.lois',
                'email': 'b.lois@nigerianports.gov.ng',
                'first_name': 'Ogunleye',
                'last_name': 'Lois',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'm.maigana',
                'email': 'm.maigana@nigerianports.gov.ng',
                'first_name': 'Musa',
                'last_name': 'Maigana',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'b.bashir',
                'email': 'b.bashir@nigerianports.gov.ng',
                'first_name': 'Bala',
                'last_name': 'Bashir Muri',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'm.oyekanmi',
                'email': 'm.oyekanmi@nigerianports.gov.ng',
                'first_name': 'Oyekanmi',
                'last_name': 'Motunrayo Aminat',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'd.adesanya',
                'email': 'd.adesanya@nigerianports.gov.ng',
                'first_name': 'Adesanya',
                'last_name': 'Deborah Adepeju',
                'system_role': 'Medical Records Officer',
            },
            {
                'username': 'o.kolawole',
                'email': 'o.kolawole@nigerianports.gov.ng',
                'first_name': 'Kolawole',
                'last_name': 'Oluwanifesimi Esther',
                'system_role': 'Medical Records Officer',
            },
            # New Pharmacy Users
            {
                'username': 'a.bashir',
                'email': 'a.bashir@nigerianports.gov.ng',
                'first_name': 'Abbas',
                'last_name': 'Bashir',
                'system_role': 'Pharmacist',
            },
            {
                'username': 'f.usman',
                'email': 'f.usman@nigerianports.gov.ng',
                'first_name': 'Fadila',
                'last_name': 'Usman',
                'system_role': 'Pharmacist',
            },
            {
                'username': 'saadatu',
                'email': 'saadatu@nigerianports.gov.ng',
                'first_name': 'Saadatu',
                'last_name': '',
                'system_role': 'Pharmacist',
            },
            {
                'username': 'a.aliyu',
                'email': 'a.aliyu@nigerianports.gov.ng',
                'first_name': 'Aliyu',
                'last_name': 'Alfa',
                'system_role': 'Pharmacist',
            },
            {
                'username': 'a.lawal',
                'email': 'a.lawal@nigerianports.gov.ng',
                'first_name': 'Abdulrasheed',
                'last_name': 'Lawal',
                'system_role': 'Pharmacist',
            },
            {
                'username': 'nwoyi',
                'email': 'nwoyi@nigerianports.gov.ng',
                'first_name': 'Nwoyi',
                'last_name': '',
                'system_role': 'Pharmacist',
            },
            # New Radiology Users
            {
                'username': 'd.kotti-lawal',
                'email': 'd.kotti-lawal@nigerianports.gov.ng',
                'first_name': 'Dr. Kotti-Lawal',
                'last_name': '',
                'system_role': 'Radiologist',
            },
            {
                'username': 'g.ademuyiwa',
                'email': 'g.ademuyiwa@nigerianports.gov.ng',
                'first_name': 'Mrs',
                'last_name': 'Ademuyiwa Gertrude',
                'system_role': 'Radiologist',
            },
            {
                'username': 'j.chima',
                'email': 'j.chima@nigerianports.gov.ng',
                'first_name': 'Mrs',
                'last_name': 'Chima Joy',
                'system_role': 'Radiologist',
            },
            {
                'username': 'n.dashe',
                'email': 'n.dashe@nigerianports.gov.ng',
                'first_name': 'Dashe',
                'last_name': 'Nansik',
                'system_role': 'Radiologist',
            },
            # New Doctors
            {
                'username': 'u.dabo',
                'email': 'u.dabo@nigerianports.gov.ng',
                'first_name': 'Dabo',
                'last_name': 'Usman',
                'system_role': 'Medical Doctor',
            },
            {
                'username': 'i.abubakar',
                'email': 'i.abubakar@nigerianports.gov.ng',
                'first_name': 'Abubakar',
                'last_name': 'Isa',
                'system_role': 'Medical Doctor',
            },
            {
                'username': 'n.ali',
                'email': 'n.ali@nigerianports.gov.ng',
                'first_name': 'Ali',
                'last_name': 'Ngozi',
                'system_role': 'Medical Doctor',
            },
            {
                'username': 'h.muhammad',
                'email': 'h.muhammad@nigerianports.gov.ng',
                'first_name': 'Muhammad',
                'last_name': 'Hauwau',
                'system_role': 'Medical Doctor',
            },
            {
                'username': 's.abubakar',
                'email': 's.abubakar@nigerianports.gov.ng',
                'first_name': 'Abubakar',
                'last_name': 'Sadeeq',
                'system_role': 'Medical Doctor',
            },
            # New Nursing Users
            {
                'username': 'd.akhabue',
                'email': 'd.akhabue@nigerianports.gov.ng',
                'first_name': 'Mrs',
                'last_name': 'Deborah Akhabue',
                'system_role': 'Nursing Officer',
            },
            {
                'username': 'a.abubakar',
                'email': 'a.abubakar@nigerianports.gov.ng',
                'first_name': 'Mr',
                'last_name': 'Aminu Halliru Abubakar',
                'system_role': 'Nursing Officer',
            },
            {
                'username': 's.suleiman',
                'email': 's.suleiman@nigerianports.gov.ng',
                'first_name': 'Safinah',
                'last_name': 'Suleiman',
                'system_role': 'Nursing Officer',
            },
            # New Physio Users
            {
                'username': 'e.freeman',
                'email': 'e.freeman@nigerianports.gov.ng',
                'first_name': 'Mrs',
                'last_name': 'Freeman Elsie',
                'system_role': 'Physiotherapist',
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
            if created or not user.check_password('Changeme'):
                user.set_password('Changeme')
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
            {'name': 'Physiotherapy', 'code': 'PHYSIO'},
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

    def _create_wards_and_beds(self, clinic, admin_user):
        """Create hospital wards and beds."""
        self.stdout.write("Creating hospital wards and beds...")

        wards_created = 0
        beds_created = 0

        # Create wards
        ward_data = [
            {
                'ward_code': 'FEMALE-MED',
                'name': 'Female Medical Ward',
                'ward_type': 'medical',
                'floor': '1st Floor',
                'building': 'Main Building',
                'total_beds': 5,
                'description': 'Used for patient observation and monitoring (5 beds)',
            },
            {
                'ward_code': 'MALE-MED',
                'name': 'Male Medical Ward',
                'ward_type': 'medical',
                'floor': '1st Floor',
                'building': 'Main Building',
                'total_beds': 5,
                'description': 'Used for patient observation and monitoring (5 beds)',
            },
        ]

        for ward_info in ward_data:
            ward, created = Ward.objects.get_or_create(
                ward_code=ward_info['ward_code'],
                defaults={
                    'name': ward_info['name'],
                    'ward_type': ward_info['ward_type'],
                    'floor': ward_info['floor'],
                    'building': ward_info['building'],
                    'total_beds': ward_info['total_beds'],
                    'description': ward_info['description'],
                    'status': 'active',
                    'created_by': admin_user,
                }
            )

            if created:
                wards_created += 1

                # Create beds for this ward
                for bed_num in range(1, ward_info['total_beds'] + 1):
                    bed, bed_created = Bed.objects.get_or_create(
                        ward=ward,
                        bed_number=str(bed_num),
                        defaults={
                            'status': 'available',
                        }
                    )
                    if bed_created:
                        beds_created += 1

        self.stdout.write(f"  ✓ Created {wards_created} wards")
        self.stdout.write(f"  ✓ Created {beds_created} beds")
        return wards_created, beds_created

    def _create_lab_templates(self):
        """
        Seed lab templates using the canonical laboratory command dataset.
        Existing in-file lab template dataset has been removed to avoid drift.
        """
        self.stdout.write("Seeding lab templates from seed_lab_templates source...")
        call_command("seed_lab_templates")
        templates = list(LabTemplate.objects.all())
        self.stdout.write(f"  ✓ Loaded {len(templates)} lab templates")
        return templates

    def _create_radiology_templates(self):
        """Seed radiology imaging templates (X-Ray, Ultrasound, MRI, CT, etc.) so Order Imaging Study has options."""
        self.stdout.write("Seeding radiology templates...")
        call_command("populate_radiology_templates")
        from radiology.models import RadiologyTemplate
        count = RadiologyTemplate.objects.count()
        self.stdout.write(f"  ✓ Loaded {count} radiology templates")
        return count

    def _create_medications(self):
        self.stdout.write("Creating medications...")
        data_dir = Path(__file__).resolve().parents[3] / "data"
        canonical_generics_csv = data_dir / "GENERIC_MEDICATIONS_SEED.csv"
        canonical_brands_csv = data_dir / "BRAND_MEDICATIONS_SEED.csv"

        if not canonical_generics_csv.exists() or not canonical_brands_csv.exists():
            missing = []
            if not canonical_generics_csv.exists():
                missing.append(str(canonical_generics_csv))
            if not canonical_brands_csv.exists():
                missing.append(str(canonical_brands_csv))
            raise CommandError(
                "Canonical pharmacy seed files are required but missing: "
                + ", ".join(missing)
            )

        # Maps CSV/display category to Medication.CATEGORY_CHOICES so DB only stores valid choices.
        category_map = {
            "Antibiotic": "Antibiotics",
            "Antimalarial": "Antimalarials",
            "NSAID": "NSAIDs",
            "Analgesic": "Analgesics",
            "Antiplatelet": "Antiplatelet",
            "Antigout": "Antigout",
            "Antidepressant": "Antidepressants",
            "Diuretic": "Diuretics",
            "Antihypertensive": "Antihypertensives",
            "Antihypertensive (CCB)": "Antihypertensives",
            "Antihypertensive (Beta Blocker)": "Antihypertensives",
            "Ophthalmic": "Ophthalmic",
            "Cough": "Antitussives",
            "Haematinics": "Haematinics",
            "Neuropathic": "Analgesics",
            "Device": "",
            "Supplements": "Vitamins",
            "PPI": "AntiUlcer",
            "Respiratory": "AntiAsthmatics",
            "Urology": "Urological",
            "Antidiabetic": "Antidiabetics",
            "DMARD": "Other",
            "Antihistamine": "Antihistamines",
            "Antifungal": "Antifungals",
            "Decongestant": "NasalDecongestants",
            "Topical Analgesic": "Analgesics",
            "Renal": "Other",
            "Combination": "Other",
            "Hypnotic": "Sedatives",
            "Antimigraine": "AntiMigraine",
            "Lipid": "LipidLowering",
            "Lipid Lowering (Statin)": "LipidLowering",
            "Otic": "Otic",
            "Hepatoprotective": "Hepatoprotective",
            "GI (Antacid)": "Antacids",
            "Antibiotic (Macrolide)": "Antibiotics",
            "Diuretic (Thiazide)": "Diuretics",
            "Topical Combination": "Dermatological",
            "Corticosteroid/Antibiotic": "Corticosteroids",
            "Antiglaucoma": "AntiGlaucoma",
            "Anticancer (Antiandrogen)": "Cytotoxic",
        }

        def first_option(value: str) -> str:
            raw = (value or "").strip()
            if not raw or raw in {"-", "N/A", "n/a"}:
                return ""
            normalized = raw.replace(";", ",")
            return normalized.split(",")[0].strip()

        def infer_route(dosage_form: str) -> str:
            f = (dosage_form or "").strip().lower()
            if not f:
                return "Oral"
            if any(k in f for k in ["tablet", "capsule", "syrup", "suspension", "powder", "sachet", "solution"]):
                return "Oral"
            if any(k in f for k in ["injection", "vial", "ampoule", "infusion"]):
                return "IV"
            if any(k in f for k in ["inhaler", "nebul"]):
                return "Inhalation"
            if any(k in f for k in ["cream", "ointment", "gel", "lotion"]):
                return "Topical"
            if "eye" in f or "ophthalmic" in f:
                return "Ophthalmic"
            if "ear" in f or "otic" in f:
                return "Otic"
            if "nasal" in f:
                return "Nasal"
            if "suppository" in f:
                return "Rectal"
            return "Oral"

        def normalize_unit(unit: str, form: str) -> str:
            unit = first_option(unit)
            form = first_option(form)
            return unit or form or "unit"

        def infer_generic_unit(dosage_form: str) -> str:
            """Infer default unit from dosage form for GenericMedication."""
            f = (dosage_form or "").strip().lower()
            if not f:
                return ""
            if any(k in f for k in ["tablet", "caplet", "chewable"]):
                return "tablet"
            if any(k in f for k in ["capsule", "softgel"]):
                return "capsule"
            if any(k in f for k in ["syrup", "suspension", "solution", "oral liquid"]):
                return "bottle"
            if any(k in f for k in ["injection", "vial", "ampoule"]):
                return "vial"
            if any(k in f for k in ["inhaler", "puff"]):
                return "puff"
            if any(k in f for k in ["cream", "ointment", "gel", "lotion"]):
                return "tube"
            if any(k in f for k in ["drop", "eye", "ear", "otic"]):
                return "drop"
            if "sachet" in f:
                return "sachet"
            if "suppository" in f:
                return "suppository"
            if "patch" in f:
                return "patch"
            return f or "tablet"

        def resolve_generic_variant(generic_id: str, generic_name: str, strength: str, form: str, category: str):
            base_generic = None
            if generic_id:
                base_generic = GenericMedication.objects.filter(atc_code=generic_id).first()
            if not base_generic and generic_name:
                base_generic = GenericMedication.objects.filter(name__iexact=generic_name).order_by("id").first()

            name_final = (generic_name or (base_generic.name if base_generic else "")).strip()
            if not name_final:
                return None

            strength_final = first_option(strength) or first_option(base_generic.strength if base_generic else "") or "N/A"
            form_final = first_option(form) or first_option(base_generic.dosage_form if base_generic else "")
            if not form_final:
                return None
            route_final = first_option(base_generic.route if base_generic else "") or infer_route(form_final)

            exact = GenericMedication.objects.filter(
                name__iexact=name_final,
                strength=strength_final,
                dosage_form__iexact=form_final,
            ).order_by("id").first()
            if exact:
                return exact

            atc_for_create = None
            if generic_id and not GenericMedication.objects.filter(atc_code=generic_id).exists():
                atc_for_create = generic_id

            return GenericMedication.objects.create(
                name=name_final,
                active_ingredient=(base_generic.active_ingredient if base_generic else name_final),
                category=(base_generic.category if base_generic and base_generic.category else (category or "Other")),
                strength=strength_final,
                dosage_form=form_final,
                route=route_final,
                atc_code=atc_for_create,
                is_active=True,
            )

        def import_generics(csv_path: Path):
            created = 0
            updated = 0
            skipped = 0
            with open(csv_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    generic_id = (row.get("Generic_ID") or "").strip()
                    name = (row.get("Generic_Name") or "").strip()
                    active_ingredient = (row.get("Active_Ingredient") or "").strip()
                    category_raw = (row.get("Category") or "").strip()
                    category = category_map.get(category_raw, category_raw) or category_raw or "Other"
                    strength = first_option(row.get("Strengths_Available") or "")
                    dosage_form = first_option(row.get("Dosage_Forms") or "")
                    route = first_option(row.get("Route") or "") or infer_route(dosage_form) or "Oral"

                    if not name or not dosage_form:
                        skipped += 1
                        continue

                    generic_unit = infer_generic_unit(dosage_form)
                    defaults = {
                        "name": name,
                        "active_ingredient": active_ingredient,
                        "category": category,
                        "strength": strength,
                        "dosage_form": dosage_form,
                        "unit": generic_unit,
                        "route": route,
                        "is_active": True,
                    }

                    if generic_id:
                        obj, obj_created = GenericMedication.objects.update_or_create(
                            atc_code=generic_id,
                            defaults=defaults,
                        )
                        if obj_created:
                            created += 1
                        else:
                            updated += 1
                        continue

                    obj, obj_created = GenericMedication.objects.update_or_create(
                        name=name,
                        strength=strength,
                        dosage_form=dosage_form,
                        route=route,
                        defaults={
                            "active_ingredient": active_ingredient,
                            "category": category,
                            "unit": infer_generic_unit(dosage_form),
                            "is_active": True,
                        },
                    )
                    if obj_created:
                        created += 1
                    else:
                        updated += 1
            return (created, skipped, updated)

        def import_brands(csv_path: Path):
            created = 0
            updated = 0
            skipped = 0
            with open(csv_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    brand_name = (row.get("Brand_Name") or "").strip()
                    generic_id = (row.get("Generic_ID") or "").strip()
                    generic_name = (row.get("Generic_Name") or "").strip()
                    code = (row.get("Product_Code") or "").strip()
                    strength = first_option(row.get("Strength") or "")
                    form = first_option(row.get("Form") or "")
                    unit = normalize_unit(row.get("Unit") or "", form)
                    # Canonical unit: one of the values the drug-master frontend expects (lowercase)
                    _allowed_units = ("tablet", "capsule", "ml", "vial", "box", "pack")
                    _ul = (unit or "tablet").strip().lower()
                    if _ul in _allowed_units:
                        unit = _ul
                    elif _ul in ("bottle", "bottles", "suspension", "syrup"):
                        unit = "pack"
                    elif _ul in ("tube", "tubes"):
                        unit = "box"
                    else:
                        unit = "tablet"
                    category_raw = (row.get("Category") or "").strip()
                    manufacturer = (row.get("Manufacturer") or "").strip()
                    pack_size_raw = (row.get("Pack_Size") or "").strip()

                    if not brand_name or not code:
                        skipped += 1
                        continue

                    try:
                        pack_size = int(pack_size_raw) if pack_size_raw else None
                    except ValueError:
                        pack_size = None

                    category = category_map.get(category_raw, category_raw) or category_raw

                    generic = resolve_generic_variant(
                        generic_id=generic_id,
                        generic_name=generic_name,
                        strength=strength,
                        form=form,
                        category=category or "Other",
                    )
                    if not generic:
                        skipped += 1
                        continue

                    # If CSV had no category, use generic's category so brand shows a category (e.g. Antacid)
                    if not category and getattr(generic, "category", None):
                        category = generic.category
                    # Normalize to Medication.CATEGORY_CHOICES so DB never stores invalid values (e.g. GI (Antacid) -> Antacids)
                    category = category_map.get(category, category) or category

                    if not strength:
                        strength = first_option(generic.strength or "") or "N/A"
                    if not form:
                        form = first_option(generic.dosage_form or "")
                    if not form:
                        skipped += 1
                        continue

                    by_code = Medication.objects.filter(code=code).first()
                    by_brand = Medication.objects.filter(name=brand_name, generic=generic).first()

                    target = by_code or by_brand
                    if not target:
                        try:
                            brand_category = category or getattr(generic, "category", "") or ""
                            brand_category = category_map.get(brand_category, brand_category) or brand_category
                            Medication.objects.create(
                                name=brand_name,
                                generic=generic,
                                generic_name=generic.name,
                                code=code,
                                unit=unit,
                                strength=strength,
                                form=form,
                                category=brand_category,
                                manufacturer=manufacturer,
                                pack_size=pack_size,
                                prescription_required=False,
                                min_stock_level=0,
                                is_active=True,
                            )
                            created += 1
                        except IntegrityError:
                            skipped += 1
                        continue

                    target.name = brand_name
                    target.generic = generic
                    target.generic_name = generic.name
                    target.code = code
                    target.unit = unit
                    target.strength = strength
                    target.form = form
                    target.category = category or getattr(generic, "category", "") or target.category
                    target.category = category_map.get(target.category, target.category) or target.category
                    target.manufacturer = manufacturer
                    target.pack_size = pack_size
                    target.prescription_required = False
                    target.min_stock_level = 0
                    target.is_active = True
                    try:
                        target.save()
                        updated += 1
                    except IntegrityError:
                        skipped += 1
            return (created, updated, skipped)

        gen_created, gen_skipped, gen_updated = import_generics(canonical_generics_csv)
        self.stdout.write(f"  ✓ Generics imported: {gen_created} (updated {gen_updated}, skipped {gen_skipped})")

        b1_created, b1_updated, b1_skipped = import_brands(canonical_brands_csv)
        self.stdout.write(
            f"  ✓ Brands imported: {b1_created} (updated {b1_updated}, skipped {b1_skipped})"
        )

        normalized_generics = 0
        for generic in GenericMedication.objects.all():
            old_strength = generic.strength or ""
            old_form = generic.dosage_form or ""
            old_route = generic.route or ""
            new_strength = first_option(old_strength)
            new_form = first_option(old_form)
            if not new_form:
                fallback_form = (
                    Medication.objects.filter(generic=generic)
                    .exclude(form__isnull=True)
                    .exclude(form="")
                    .values_list("form", flat=True)
                    .first()
                )
                new_form = first_option(fallback_form or "")
            new_route = first_option(old_route) or infer_route(new_form) or "Oral"
            if (
                new_strength != old_strength
                or new_form != old_form
                or new_route != old_route
            ):
                generic.strength = new_strength
                generic.dosage_form = new_form
                generic.route = new_route
                generic.save(update_fields=["strength", "dosage_form", "route", "updated_at"])
                normalized_generics += 1
        if normalized_generics:
            self.stdout.write(f"  ✓ Normalized {normalized_generics} generic records to single strength/form/route values")

        meds = Medication.objects.filter(is_active=True)
        default_quantity = Decimal("1000")
        default_min_stock = Decimal("100")
        expiry_date = (timezone.now() + timedelta(days=730)).date()

        created_store = 0
        updated_store = 0
        for med in meds:
            batch_number = f"BATCH-{med.code}-001"
            if self._force_pharmacy_inventory:
                _, created = MedicationInventory.objects.update_or_create(
                    medication=med,
                    batch_number=batch_number,
                    location="Store",
                    defaults={
                        "expiry_date": expiry_date,
                        "quantity": default_quantity,
                        "unit": med.unit or "unit",
                        "min_stock_level": default_min_stock,
                        "supplier": (med.manufacturer or "").strip(),
                    },
                )
                if created:
                    created_store += 1
                else:
                    updated_store += 1
            else:
                _, created = MedicationInventory.objects.get_or_create(
                    medication=med,
                    batch_number=batch_number,
                    location="Store",
                    defaults={
                        "expiry_date": expiry_date,
                        "quantity": default_quantity,
                        "unit": med.unit or "unit",
                        "min_stock_level": default_min_stock,
                        "supplier": (med.manufacturer or "").strip(),
                    },
                )
                if created:
                    created_store += 1

        today = timezone.now().date()
        dispensary_quantity = Decimal("1000")
        dispensary_has_any = DispensaryReceiptLine.objects.filter(quantity_remaining__gt=0).exists()
        should_seed_dispensary = self._force_pharmacy_inventory or not dispensary_has_any
        created_disp = 0
        if should_seed_dispensary:
            # Seed Dispensary via Central Store flow: StockRequest -> StockIssue -> DispensaryReceiptLine
            seed_user = User.objects.filter(is_active=True).first()
            with transaction.atomic():
                req = StockRequest.objects.create(
                    status="fulfilled",
                    from_location="Store",
                    to_location="Dispensary",
                    requested_by=seed_user,
                    notes="Seeded from Central Store",
                )
                issue = StockIssue.objects.create(
                    request=req,
                    issued_by=seed_user,
                    notes=f"Seeded request {req.request_id}",
                )
                for med in meds.order_by("name"):
                    source = (
                        MedicationInventory.objects.filter(
                            medication=med,
                            location="Store",
                            quantity__gt=0,
                            expiry_date__gt=today,
                        )
                        .order_by("expiry_date")
                        .first()
                    )
                    if not source:
                        continue
                    transfer_qty = min(source.quantity, dispensary_quantity)
                    if transfer_qty <= 0:
                        continue
                    item = StockRequestItem.objects.create(
                        request=req,
                        medication=med,
                        quantity=transfer_qty,
                        fulfilled_quantity=transfer_qty,
                    )
                    source.quantity -= transfer_qty
                    source.save(update_fields=["quantity"])
                    issue_line = StockIssueLine.objects.create(
                        issue=issue,
                        medication=med,
                        source_inventory_item=source,
                        destination_inventory_item=None,
                        quantity=transfer_qty,
                    )
                    DispensaryReceiptLine.objects.create(
                        medication=med,
                        quantity=transfer_qty,
                        quantity_remaining=transfer_qty,
                        received_at=issue.issued_at,
                        request=req,
                        issue=issue,
                        stock_issue_line=issue_line,
                        batch_number=source.batch_number or "",
                        expiry_date=source.expiry_date,
                    )
                    created_disp += 1

        if self._force_pharmacy_inventory:
            self.stdout.write(f"  ✓ Seeded Store inventory for {meds.count()} medications (created {created_store}, updated {updated_store})")
        else:
            self.stdout.write(f"  ✓ Seeded Store inventory for {meds.count()} medications (created {created_store}, unchanged {meds.count() - created_store})")
        if should_seed_dispensary:
            self.stdout.write(f"  ✓ Seeded Dispensary from Central Store: {created_disp} receipt lines (request {req.request_id})")
        else:
            self.stdout.write("  ✓ Skipped Dispensary seeding (already has receipt stock)")
        self.stdout.write(f"  ✓ Total medications: {Medication.objects.count()}")
        return list(meds)

    def _create_icd10_codes(self):
        """Delegate to the dedicated seed_icd_codes management command (full WHO import)."""
        from django.core.management import call_command
        self.stdout.write("Seeding ICD-10 codes (delegating to seed_icd_codes --full) ...")
        try:
            call_command("seed_icd_codes", full=True, verbosity=1)
        except FileNotFoundError:
            self.stdout.write(self.style.WARNING(
                "  ⚠ WHO data files not found — falling back to starter set"
            ))
            call_command("seed_icd_codes", verbosity=1)
        self.stdout.write(f"  ✓ ICD-10 codes in DB: {ICD10Code.objects.count()}")

    # ---------- dead legacy code removed (was ~7,200 lines of hardcoded ICD-10 dicts) ----------

    def _create_lab_orders_DISABLED(self):
        """Create lab orders with tests. (DISABLED — kept for reference only)"""
        _DISABLED = True  # noqa: F841

#     def _create_prescriptions(self, patients, users, medications):
#         """Create prescriptions."""
#         self.stdout.write("Creating prescriptions...")
#         
#         if not patients or not medications:
#             return
# 
#         doctor = users.get('doctor')
# 
#         prescription, _ = Prescription.objects.get_or_create(
#             prescription_id='RX-2024-001',
#             defaults={
#                 'patient': patients[0],
#                 'doctor': doctor,
#                 'status': 'pending',
#                 'diagnosis': 'Upper respiratory tract infection',
#             }
#         )
# 
#         # Add medication items
#         PrescriptionItem.objects.get_or_create(
#             prescription=prescription,
#             medication=medications[0],
#             defaults={
#                 'quantity': 21,
#                 'unit': 'tablet',
#                 'dosage': '1 tablet three times daily',
#                 'frequency': 'TDS',
#                 'duration': '7 days',
#                 'instructions': 'Take with food',
#             }
#         )
# 
#         self.stdout.write("  ✓ Created prescriptions")
# 
#     def _create_radiology_orders(self, patients, users):
#         """Create radiology orders."""
#         self.stdout.write("Creating radiology orders...")
#         
#         if not patients:
#             return
# 
#         doctor = users.get('doctor')
# 
#         order, _ = RadiologyOrder.objects.get_or_create(
#             order_id='RAD-2024-001',
#             defaults={
#                 'patient': patients[0],
#                 'doctor': doctor,
#                 'priority': 'routine',
#                 'clinic': 'GOPD',
#             }
#         )
# 
#         RadiologyStudy.objects.get_or_create(
#             order=order,
#             procedure='Chest X-Ray',
#             defaults={
#                 'body_part': 'Chest',
#                 'modality': 'X-Ray',
#                 'status': 'pending',
#             }
#         )
# 
#         self.stdout.write("  ✓ Created radiology orders")
# 
#     def _create_consultation_data(self, patients, users, clinic):
#         """Create consultation sessions and queue items."""
#         self.stdout.write("Creating consultation data...")
#         
#         if not patients:
#             return
# 
#         # Get a doctor user
#         doctor = users.get('doctor')
#         if not doctor:
#             doctor = users.get('admin')  # Fallback to admin if no doctor
#         
#         # Get consultation rooms
#         rooms = ConsultationRoom.objects.filter(is_active=True).order_by('room_number')[:4]  # Get first 4 rooms
#         
#         if not rooms.exists():
#             self.stdout.write("  ⚠ No consultation rooms found, skipping consultation data")
#             return
#         
#         # Create some visits for patients
#         from patients.models import Visit
#         visits_created = 0
#         for i, patient in enumerate(patients[:3]):  # Create visits for first 3 patients
#             visit, created = Visit.objects.get_or_create(
#                 patient=patient,
#                 visit_id=f'VIS-2024-{1000 + i}',
#                 defaults={
#                     'visit_type': ['emergency', 'consultation', 'follow_up'][i % 3],
#                     'status': 'in_progress',
#                     'date': timezone.now().date(),
#                     'time': timezone.now().time(),
#                     'doctor': doctor,
#                     'created_by': doctor,
#                 }
#             )
#             if created:
#                 visits_created += 1
#         
#         # Create queue items for patients with visits
#         queue_items_created = 0
#         
#         def get_priority_from_visit_type(visit_type):
#             """Map visit type to priority number (backend logic)."""
#             visit_type_map = {
#                 'emergency': 0,
#                 'follow_up': 1,
#                 'follow-up': 1,
#                 'consultation': 2,
#                 'routine': 3,
#             }
#             return visit_type_map.get(visit_type.lower() if visit_type else '', 2)
#         
#         for i, patient in enumerate(patients[:3]):
#             visit = Visit.objects.filter(patient=patient).first()
#             if visit:
#                 # Assign to different rooms
#                 room = rooms[i % len(rooms)]
#                 priority = get_priority_from_visit_type(visit.visit_type)
#                 
#                 queue_item, created = ConsultationQueue.objects.get_or_create(
#                     room=room,
#                     patient=patient,
#                     visit=visit,
#                     is_active=True,
#                     defaults={
#                         'priority': priority,
#                         'notes': f'Queued for {room.name}',
#                     }
#                 )
#                 if created:
#                     queue_items_created += 1
# 
#         # Create vitals for patients with visits
#         vitals_created = 0
#         for visit in Visit.objects.filter(status='in_progress')[:5]:  # Create vitals for first 5 active visits
#             # Create multiple vitals readings for each patient
#             for i in range(2):  # 2 readings per patient
#                 recorded_at = timezone.now() - timezone.timedelta(days=i, hours=i*2)
# 
#                 VitalReading.objects.get_or_create(
#                     patient=visit.patient,
#                     visit=visit,
#                     recorded_at=recorded_at,
#                     defaults={
#                         'temperature': round(36.5 + (i * 0.5), 1),  # 36.5°C to 37.0°C
#                         'blood_pressure_systolic': 120 + (i * 5),  # 120 to 125
#                         'blood_pressure_diastolic': 80 + (i * 2),   # 80 to 82
#                         'heart_rate': 75 + (i * 5),  # 75 to 80 bpm
#                         'respiratory_rate': 16 + i,  # 16 to 17 breaths/min
#                         'oxygen_saturation': 98.0 - (i * 0.5),  # 98.0% to 97.5%
#                         'weight': 70.0 + (i * 2),  # 70kg to 72kg
#                         'height': 170.0,  # 170cm
#                         'bmi': round((72.0 + (i * 2)) / ((1.70) ** 2), 1),
#                         'notes': f'Routine vital signs check #{i+1}',
#                         'recorded_by': visit.doctor or users[0],
#                     }
#                 )
#                 vitals_created += 1
# 
#         self.stdout.write(f"  ✓ Created {visits_created} visits")
#         self.stdout.write(f"  ✓ Created {queue_items_created} queue items")
#         self.stdout.write(f"  ✓ Created {vitals_created} vital readings")
#         self.stdout.write("  ✓ Created consultation data")
# 
#     def _create_nursing_orders(self, patients, users):
#         """Create nursing orders."""
#         self.stdout.write("Creating nursing orders...")
#         self.stdout.write("  ✓ Created nursing orders")

#     def _create_notifications(self, users):
#         """Create sample notifications."""
#         self.stdout.write("Creating notifications...")
#         
#         doctor = users.get('doctor')
#         if doctor:
#             Notification.objects.get_or_create(
#                 user=doctor,
#                 title='New Lab Order',
#                 defaults={
#                     'type': 'workflow',
#                     'priority': 'normal',
#                     'message': 'A new lab order requires your attention',
#                     'status': 'unread',
#                 }
#             )
# 
#         self.stdout.write("  ✓ Created notifications")

#     def _create_diagnoses(self, patients, users, icd10_codes):
#         """Create sample diagnoses using ICD-10 codes."""
#         self.stdout.write("Creating sample diagnoses...")
# 
#         doctor = users.get('doctor')
#         if not doctor:
#             doctor = users.get('admin')
# 
#         if not doctor or not patients or not icd10_codes:
#             self.stdout.write("  ⚠ Skipping diagnoses creation - missing required data")
#             return
# 
#         # Create some sample diagnoses for patients
#         diagnoses_data = [
#             {
#                 'patient': patients[0],
#                 'icd10_code': icd10_codes.filter(code='J00').first(),
#                 'diagnosis_text': 'Acute upper respiratory infection',
#                 'status': 'confirmed',
#                 'certainty': 'confirmed',
#                 'diagnosed_by': doctor,
#             },
#             {
#                 'patient': patients[0],
#                 'icd10_code': icd10_codes.filter(code='I10').first(),
#                 'diagnosis_text': 'Essential hypertension',
#                 'status': 'confirmed',
#                 'certainty': 'confirmed',
#                 'diagnosed_by': doctor,
#             },
#             {
#                 'patient': patients[1],
#                 'icd10_code': icd10_codes.filter(code='E11.9').first() if icd10_codes.filter(code='E11.9').exists() else icd10_codes.filter(code__startswith='E11').first(),
#                 'diagnosis_text': 'Type 2 diabetes mellitus without complications',
#                 'status': 'confirmed',
#                 'certainty': 'confirmed',
#                 'diagnosed_by': doctor,
#             },
#             {
#                 'patient': patients[2],
#                 'icd10_code': icd10_codes.filter(code='J45.9').first(),
#                 'diagnosis_text': 'Asthma, unspecified',
#                 'status': 'confirmed',
#                 'certainty': 'probable',
#                 'diagnosed_by': doctor,
#             },
#         ]
# 
#         created_count = 0
#         for diagnosis_data in diagnoses_data:
#             if diagnosis_data['icd10_code']:  # Only create if ICD-10 code exists
#                 Diagnosis.objects.get_or_create(
#                     patient=diagnosis_data['patient'],
#                     icd10_code=diagnosis_data['icd10_code'],
#                     defaults=diagnosis_data
#                 )
#                 created_count += 1
# 
#         self.stdout.write(f"  ✓ Created {created_count} sample diagnoses")
# 
