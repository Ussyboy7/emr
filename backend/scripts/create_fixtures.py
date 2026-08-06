"""
Management command to create fixture data for development/testing.
Run with: python manage.py shell < fixtures/create_fixtures.py
"""
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import datetime, timedelta
import random

from accounts.models import User
from laboratory.models import LabTemplate, LabOrder, LabTest
from pharmacy.models import Medication, MedicationInventory, Prescription, PrescriptionItem
from radiology.models import RadiologyTemplate, RadiologyOrder, RadiologyStudy
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
            'first_name': '',
            'last_name': '',
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
        location_clinic=clinic,
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
            'location_clinic': clinic,
            'department': dept,
            'room_type': 'consultation',
            'status': 'active',
        }
    )
    
    print("Organization structure created")

    # 3. Create Lab Templates
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

    # 4.5. Create Radiology Templates
    print("Creating radiology templates...")
    from radiology.management.commands.populate_radiology_templates import Command as RadiologyCommand
    radiology_cmd = RadiologyCommand()
    radiology_cmd.handle()
    print("Creating radiology templates...")
    radiology_templates = []

    # X-RAY INVESTIGATIONS
    xray_data = [
        {'code': 'XR-ABD', 'name': 'ABDOMEN ERECT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Abdomen'},
        {'code': 'XR-ABD-ERECT-SUP', 'name': 'ABDOMEN ERECT/SUPINE', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Abdomen'},
        {'code': 'XR-ANKLE-APLAT', 'name': 'ANKLE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Ankle'},
        {'code': 'XR-ARM-HUM-APLAT', 'name': 'ARM/HUMERUS AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Arm/Humerus'},
        {'code': 'XR-CERV-SPINE-APLAT', 'name': 'CERVICAL SPINE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Cervical Spine'},
        {'code': 'XR-CHEST-APPA', 'name': 'CHEST AP/PA', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Chest'},
        {'code': 'XR-CHEST-PA-LAT', 'name': 'CHEST PA/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Chest'},
        {'code': 'XR-DORS-SPINE-APLAT', 'name': 'DORSAL SPINE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Dorsal Spine'},
        {'code': 'XR-DORSO-LUMB-SPINE-APLAT', 'name': 'DORSO-LUMBAR SPINE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Dorso-Lumbar Spine'},
        {'code': 'XR-ELBOW-APLAT', 'name': 'ELBOW AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Elbow'},
        {'code': 'XR-FEMUR-THIGH-APLAT', 'name': 'FEMUR/THIGH AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Femur/Thigh'},
        {'code': 'XR-FOOT-APLAT', 'name': 'FOOT AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Foot'},
        {'code': 'XR-FOREARM-APLAT', 'name': 'FOREARM AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Forearm'},
        {'code': 'XR-HAND-APLAT', 'name': 'HAND AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Hand'},
        {'code': 'XR-HIP-APLAT', 'name': 'HIP AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Hip'},
        {'code': 'XR-KNEE-APLAT', 'name': 'KNEE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Knee'},
        {'code': 'XR-LEG-TIBIOFIB', 'name': 'LEG (TIBIOFIBULAR)', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Leg'},
        {'code': 'XR-LUMBOSACR-SPINE-APLAT', 'name': 'LUMBOSACRAL SPINE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Lumbosacral Spine'},
        {'code': 'XR-MANDIBLE', 'name': 'MANDIBLE', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Mandible'},
        {'code': 'XR-MASTOID', 'name': 'MASTOID', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Mastoid'},
        {'code': 'XR-NECK-APLAT', 'name': 'NECK AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Neck'},
        {'code': 'XR-PARANASAL-SINUSES', 'name': 'PARANASAL SINUSES', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Paranasal Sinuses'},
        {'code': 'XR-PATELLA-SKYLINE', 'name': 'PATELLA (SKYLINE)', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Patella'},
        {'code': 'XR-PELVIMETRY', 'name': 'PELVIMETRY', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Pelvis'},
        {'code': 'XR-PELVIS', 'name': 'PELVIS', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Pelvis'},
        {'code': 'XR-SACRO-COCCYGEAL', 'name': 'SACRO-COCCYGEAL', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Sacro-Coccygeal'},
        {'code': 'XR-SCOLIOTIC-SERIES', 'name': 'SCOLIOTIC SERIES', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Spine'},
        {'code': 'XR-SHOULDER', 'name': 'SHOULDER', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Shoulder'},
        {'code': 'XR-SKULL-APLAT', 'name': 'SKULL AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Skull'},
        {'code': 'XR-THORACIC-INLET-APLAT', 'name': 'THORACIC INLET (AP/LAT)', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Thoracic Inlet'},
        {'code': 'XR-TMJ', 'name': 'TMJ', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'TMJ'},
        {'code': 'XR-WRIST', 'name': 'WRIST', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Wrist'},
    ]

    # SPECIAL INVESTIGATIONS
    special_investigations_data = [
        {'code': 'SI-HYSTEROSALPINGOGRAM', 'name': 'Hysterosalpingogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Pelvis'},
        {'code': 'SI-BARIUM-ENEMA', 'name': 'Barium enema', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Colon'},
        {'code': 'SI-BARIUM-MEAL-FOLLOW-THROUGH', 'name': 'Barium meal and follow through', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'GI Tract'},
        {'code': 'SI-BARIUM-MEAL', 'name': 'Barium Meal', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Stomach'},
        {'code': 'SI-BARIUM-SWALLOW', 'name': 'Barium Swallow', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Esophagus'},
        {'code': 'SI-DISTAL-LOOPOGRAM', 'name': 'Distal loopogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Small Intestine'},
        {'code': 'SI-FISTULOGRAM', 'name': 'Fistulogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Fistula'},
        {'code': 'SI-INVERTOGRAM', 'name': 'Invertogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Spine'},
        {'code': 'SI-IVU', 'name': 'Intravenous Urogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Urinary Tract'},
        {'code': 'SI-MICTURATING-CYSTOURETHROGRAM', 'name': 'Micturating cystourethrogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Bladder/Urethra'},
        {'code': 'SI-RETROGRADE-URETHROGRAM', 'name': 'Retrograde urethrogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Urethra'},
        {'code': 'SI-RCUG-MCUG', 'name': 'RCUG + MCUG', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Urinary Tract'},
    ]

    # ULTRASOUND SCAN
    ultrasound_data = [
        {'code': 'US-OCULAR', 'name': 'Ocular Ultrasound Scan', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Eye'},
        {'code': 'US-SONO-ABDOMEN', 'name': 'Sono Abdomen', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Abdomen'},
        {'code': 'US-SONO-ABD-PEL', 'name': 'Sono Abdomen and Pelvis', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Abdomen/Pelvis'},
        {'code': 'US-SONO-ANOMALY-SCAN', 'name': 'Sono Anomaly Scan', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Fetus'},
        {'code': 'US-SONO-ACHILLES-TENDON', 'name': 'Sono Achilles Tendon', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Achilles Tendon'},
        {'code': 'US-SONO-BREAST', 'name': 'Sono Breast', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Breast'},
        {'code': 'US-SONO-FOLLICULAR-STUDY-DAY', 'name': 'Sono Follicular Study Per Day', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis'},
        {'code': 'US-SONO-FOLLICULAR-STUDY', 'name': 'Sono Follicular Study', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis'},
        {'code': 'US-SONO-HSG', 'name': 'SONO HSG', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis'},
        {'code': 'US-SONO-KUB', 'name': 'Sono KUB', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Kidney/Ureter/Bladder'},
        {'code': 'US-SONO-KUB-PROSTATE', 'name': 'Sono KUB & Prostate', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Kidney/Ureter/Bladder/Prostate'},
        {'code': 'US-SONO-MUSCULOSKELETAL', 'name': 'Sono Musculoskeletal', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Musculoskeletal'},
        {'code': 'US-SONO-NECK', 'name': 'Sono Neck', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Neck'},
        {'code': 'US-SONO-NUCHAL-TRANSLUCENCY', 'name': 'Sono Nuchal Translucency', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Fetus'},
        {'code': 'US-SONO-OBSTETRICS-BIOPHYSICAL', 'name': 'Sono Obstetrics with Biophysical Profile', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Fetus'},
        {'code': 'US-SONO-OBSTETRICS-PREG', 'name': 'Sono Obstetrics/Preg', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Fetus'},
        {'code': 'US-SONO-PELVIS-FEMALE', 'name': 'Sono Pelvis (Female/Male)', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis'},
        {'code': 'US-SONO-PROSTATE-TRUS', 'name': 'Sono Prostate / TRUS', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Prostate'},
        {'code': 'US-SONO-THYROID', 'name': 'Sono Thyroid', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Thyroid'},
        {'code': 'US-SONO-TRANSFONTANELLE', 'name': 'Sono Transfontanelle', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Brain'},
        {'code': 'US-SONO-TRANSVAGINAL', 'name': 'Sono Transvaginal', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis'},
        {'code': 'US-SONO-SALIVARY-GLAND', 'name': 'Sonography Salivary Gland', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Salivary Gland'},
        {'code': 'US-SONO-SMALL-PARTS', 'name': 'Sonography Small parts', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Small Parts'},
        {'code': 'US-SONO-PENIS', 'name': 'Ultrasound Penis', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Penis'},
    ]

    # DOPPLER ULTRASOUND SCAN
    doppler_data = [
        {'code': 'DOP-PCD-CAROTIDS', 'name': 'PCD Carotids', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Carotid Arteries'},
        {'code': 'DOP-PCD-LOWER-EXT-ART-BOTH', 'name': 'PCD Lower Extremity Arterial Study (Both Limbs)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Lower Extremities'},
        {'code': 'DOP-PCD-LOWER-EXT-ART-ONE', 'name': 'PCD Lower Extremity Arterial Study (one Limb)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Lower Extremity'},
        {'code': 'DOP-PCD-LOWER-EXT-VEN-BOTH', 'name': 'PCD Lower Extremity Venous Study (Both Limbs)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Lower Extremities'},
        {'code': 'DOP-PCD-LOWER-EXT-VEN-ONE', 'name': 'PCD Lower Extremity Venous Study (One Limb)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Lower Extremity'},
        {'code': 'DOP-PCD-RENAL', 'name': 'PCD Renal', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Kidneys'},
        {'code': 'DOP-PCD-UPPER-EXT-ART-BOTH', 'name': 'PCD Upper Extremity Arterial Study (Both Limbs)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Upper Extremities'},
        {'code': 'DOP-PCD-UPPER-EXT-ART-ONE', 'name': 'PCD Upper Extremity Arterial Study (One Limb)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Upper Extremity'},
        {'code': 'DOP-PCD-UPPER-EXT-VEN-BOTH', 'name': 'PCD Upper Extremity Venous Study (Both Limbs)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Upper Extremities'},
        {'code': 'DOP-PCD-UPPER-EXT-VEN-ONE', 'name': 'PCD Upper Extremity Venous Study (One Limb)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Upper Extremity'},
        {'code': 'DOP-SCORAL-DOPPLER', 'name': 'Scrotal Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Scrotum'},
        {'code': 'DOP-PENILE-DOPPLER', 'name': 'Penile Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Penis'},
        {'code': 'DOP-OBSTETRICS-DOPPLER-UA-MCA', 'name': 'Obstetrics Doppler (UA, umbilical artery, MCA)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Fetus'},
        {'code': 'DOP-UMBILICAL-ARTERY-DOPPLER', 'name': 'Umbilical artery Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Fetus'},
        {'code': 'DOP-OVARIAN-DOPPLER', 'name': 'Ovarian Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Ovaries'},
        {'code': 'DOP-HEPATIC-VEIN-DOPPLER', 'name': 'Hepatic vein Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Liver'},
    ]

    # MAGNETIC RESONANCE IMAGING (MRI)
    mri_data = [
        {'code': 'MRI-BRAIN', 'name': 'BRAIN MRI', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Brain'},
        {'code': 'MRI-BRAIN-MRA', 'name': 'BRAIN MRA', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Brain'},
        {'code': 'MRI-ABDOMEN', 'name': 'MRI ABDOMEN', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Abdomen'},
        {'code': 'MRI-ABDOMEN-PELVIS', 'name': 'MRI ABDOMEN AND PELVIS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Abdomen/Pelvis'},
        {'code': 'MRI-ANGIOGRAM', 'name': 'MR ANGIOGRAM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Vascular'},
        {'code': 'MRI-ANKLE', 'name': 'MRI ANKLE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Ankle'},
        {'code': 'MRI-ARM', 'name': 'MRI ARM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Arm'},
        {'code': 'MRI-HIPS', 'name': 'MRI HIPS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Hips'},
        {'code': 'MRI-BRACHIAL-PLEXUS', 'name': 'MRI BRACHIAL PLEXUS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Brachial Plexus'},
        {'code': 'MRI-BRAIN-VENOGRAM', 'name': 'MRI BRAIN VENOGRAM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Brain'},
        {'code': 'MRI-BREAST', 'name': 'MRI BREAST', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Breast'},
        {'code': 'MRI-CAROTID-ANGIOGRAM', 'name': 'MRI CAROTID ANGIOGRAM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Carotid Arteries'},
        {'code': 'MRI-CERVICAL-SPINE', 'name': 'MRI CERVICAL SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Cervical Spine'},
        {'code': 'MRI-CHEST', 'name': 'MRI CHEST', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Chest'},
        {'code': 'MRI-DORSAL-SPINE', 'name': 'MRI DORSAL SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Dorsal Spine'},
        {'code': 'MRI-ELBOW', 'name': 'MRI ELBOW', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Elbow'},
        {'code': 'MRI-FACE', 'name': 'MRI FACE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Face'},
        {'code': 'MRI-FEMUR', 'name': 'MRI FEMUR', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Femur'},
        {'code': 'MRI-FISTULOGRAM', 'name': 'MRI FISTULOGRAM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Fistula'},
        {'code': 'MRI-FOREARM', 'name': 'MRI FOREARM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Forearm'},
        {'code': 'MRI-INNER-EAR', 'name': 'MRI INNER EAR', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Inner Ear'},
        {'code': 'MRI-KNEE', 'name': 'MRI KNEE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Knee'},
        {'code': 'MRI-FOOT', 'name': 'MRI FOOT', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Foot'},
        {'code': 'MRI-HAND', 'name': 'MRI HAND', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Hand'},
        {'code': 'MRI-THIGH', 'name': 'MRI THIGH', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Thigh'},
        {'code': 'MRI-LEG', 'name': 'MRI LEG', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Leg'},
        {'code': 'MRI-LUMBAR-SPINE', 'name': 'MRI LUMBAR SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Lumbar Spine'},
        {'code': 'MRCP', 'name': 'MRCP', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Pancreatic/Biliary Ducts'},
        {'code': 'MRI-NECK', 'name': 'MRI NECK', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Neck'},
        {'code': 'MRI-ORBITS', 'name': 'MRI ORBITS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Eyes'},
        {'code': 'MRI-PARANASAL-SINUSES', 'name': 'MRI PARANASAL SINUSES', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Paranasal Sinuses'},
        {'code': 'MRI-PELVIS', 'name': 'MRI PELVIS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Pelvis'},
        {'code': 'MRI-PERINEUM', 'name': 'MRI PERINEUM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Perineum'},
        {'code': 'MRI-PROSTATE', 'name': 'MRI PROSTATE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Prostate'},
        {'code': 'MRI-SACROILIAC-JOINTS', 'name': 'MRI SACROILIAC JOINTS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Sacroiliac Joints'},
        {'code': 'MRI-SCRROTUM', 'name': 'MRI SCROTUM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Scrotum'},
        {'code': 'MRI-SHOULDER', 'name': 'MRI SHOULDER', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Shoulder'},
        {'code': 'MRI-TEMPORAL-BONE', 'name': 'MRI TEMPORAL BONE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Temporal Bone'},
        {'code': 'MRI-THORACIC-SPINE', 'name': 'MRI THORACIC SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Thoracic Spine'},
        {'code': 'MRI-THORACOLUMBAR', 'name': 'MRI THORACOLUMBAR', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Thoracolumbar Spine'},
        {'code': 'MRI-TMJ', 'name': 'MRI TMJ', 'category': 'mri', 'modality': 'MRI', 'body_part': 'TMJ'},
        {'code': 'MRI-WHOLE-BODY-SCAN', 'name': 'MRI WHOLE BODY SCAN', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Whole Body'},
        {'code': 'MRI-WHOLE-SPINE', 'name': 'MRI WHOLE SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Whole Spine'},
        {'code': 'MRI-WRIST', 'name': 'MRI WRIST', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Wrist'},
        {'code': 'MRI-AXILLA', 'name': 'MRI AXILLA', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Axilla'},
    ]

    # COMPUTED TOMOGRAPHY SCAN (CT SCAN)
    ct_scan_data = [
        {'code': 'CT-ABDOMEN-PELVIS', 'name': 'CT ABDOMEN AND PELVIS', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Abdomen/Pelvis'},
        {'code': 'CT-ANGIOGRAM-ABDOMINAL-AORTA', 'name': 'CT ANGIOGRAM (ABDOMINAL AORTA)', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Abdominal Aorta'},
        {'code': 'CT-ANKLE', 'name': 'CT ANKLE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Ankle'},
        {'code': 'CT-BRAIN', 'name': 'CT BRAIN', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Brain'},
        {'code': 'CT-BRAIN-ANGIOGRAM-VENOGRAM', 'name': 'CT BRAIN ANGIOGRAM + VENOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Brain'},
        {'code': 'CT-CAROTID-ANGIOGRAM', 'name': 'CT CAROTID ANGIOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Carotid Arteries'},
        {'code': 'CT-CERVICAL-SPINE', 'name': 'CT CERVICAL SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Cervical Spine'},
        {'code': 'CT-CERVICODORSAL-SPINE', 'name': 'CT CERVICODORSAL SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Cervicodorsal Spine'},
        {'code': 'CT-CHEST', 'name': 'CT CHEST', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Chest'},
        {'code': 'CT-COLONOGRAPHY-VIRTUAL', 'name': 'CT COLONOGRAPHY (VIRTUAL)', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Colon'},
        {'code': 'CT-CRANIOFACIAL', 'name': 'CT CRANIOFACIAL', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Craniofacial'},
        {'code': 'CT-DORSOLUMBAR-SPINE', 'name': 'CT DORSOLUMBAR SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Dorsolumbar Spine'},
        {'code': 'CT-ELBOW', 'name': 'CT ELBOW', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Elbow'},
        {'code': 'CT-ENTEROGRAPHY', 'name': 'CT ENTEROGRAPHY', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Small Intestine'},
        {'code': 'CT-EXTREMITIES', 'name': 'CT EXTREMITIES', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Extremities'},
        {'code': 'CT-FACIAL-BONES', 'name': 'CT FACIAL BONES', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Facial Bones'},
        {'code': 'CT-FEMUR', 'name': 'CT FEMUR', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Femur'},
        {'code': 'CT-HAND', 'name': 'CT HAND', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Hand'},
        {'code': 'CT-HIP', 'name': 'CT HIP', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Hip'},
        {'code': 'CT-HUMERUS', 'name': 'CT HUMERUS', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Humerus'},
        {'code': 'CT-IVU', 'name': 'CT IVU', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Urinary Tract'},
        {'code': 'CT-KNEE', 'name': 'CT KNEE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Knee'},
        {'code': 'CT-FOOT', 'name': 'CT FOOT', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Foot'},
        {'code': 'CT-LEG', 'name': 'CT LEG', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Leg'},
        {'code': 'CT-LUMBAR-SPINE', 'name': 'CT LUMBAR SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Lumbar Spine'},
        {'code': 'CT-MANDIBLE', 'name': 'CT MANDIBLE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Mandible'},
        {'code': 'CT-MASTOID', 'name': 'CT MASTOID', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Mastoid'},
        {'code': 'CT-MAXILLOFACIAL', 'name': 'CT MAXILLOFACIAL', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Maxillofacial'},
        {'code': 'CT-MYELOGRAM', 'name': 'CT MYELOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Spine'},
        {'code': 'CT-NASOPHARYNX', 'name': 'CT NASOPHARYNX', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Nasopharynx'},
        {'code': 'CT-ORBIT', 'name': 'CT ORBIT', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Orbit'},
        {'code': 'CT-NECK', 'name': 'CT NECK', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Neck'},
        {'code': 'CT-PARANASAL-SINUS', 'name': 'CT PARANASAL SINUS', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Paranasal Sinus'},
        {'code': 'CT-PELVIS', 'name': 'CT PELVIS', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Pelvis'},
        {'code': 'CT-PERIPHERAL-ANGIOGRAM-UPPER', 'name': 'CT PERIPHERAL ANGIOGRAM-UPPER', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Upper Extremities'},
        {'code': 'CT-PERIPHERAL-ANGIOGRAM-LOWER', 'name': 'CT PERIPHERAL ANGIOGRAM-LOWER', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Lower Extremities'},
        {'code': 'CT-PULMONARY-ANGIOGRAM', 'name': 'CT PULMONARY ANGIOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Lungs'},
        {'code': 'CT-RENAL-ANGIOGRAM', 'name': 'CT RENAL ANGIOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Kidneys'},
        {'code': 'CT-LARYNX', 'name': 'CT LARYNX', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Larynx'},
        {'code': 'CT-UROGRAPHY', 'name': 'CT UROGRAPHY', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Urinary Tract'},
        {'code': 'CT-SCANOGRAM-SCOLIOSIS', 'name': 'CT SCANOGRAM (SCOLIOSIS)', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Spine'},
        {'code': 'CT-SCANOGRAM-LOWER-LIMBS', 'name': 'CT SCANOGRAM (LOWER LIMBS)', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Lower Limbs'},
        {'code': 'CT-SHOULDER', 'name': 'CT SHOULDER', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Shoulder'},
        {'code': 'CT-TEMPORAL-BONE', 'name': 'CT TEMPORAL BONE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Temporal Bone'},
        {'code': 'CT-TMJ', 'name': 'CT TMJ', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'TMJ'},
        {'code': 'CT-DORSAL-SPINE', 'name': 'CT DORSAL SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Dorsal Spine'},
        {'code': 'CT-VENOGRAM', 'name': 'CT VENOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Veins'},
        {'code': 'CT-WRIST', 'name': 'CT WRIST', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Wrist'},
        {'code': 'CT-PELVIMETRY', 'name': 'CT PELVIMETRY', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Pelvis'},
    ]

    # OTHERS
    others_data = [
        {'code': 'OTHER-ECG-RESTING', 'name': 'ECG (RESTING)', 'category': 'others', 'modality': 'ECG', 'body_part': 'Heart'},
        {'code': 'OTHER-ECHOCARDIOGRAPHY', 'name': 'ECHOCARDIOGRAPHY', 'category': 'others', 'modality': 'Echocardiography', 'body_part': 'Heart'},
        {'code': 'OTHER-COLONOSCOPY', 'name': 'COLONOSCOPY', 'category': 'others', 'modality': 'Endoscopy', 'body_part': 'Colon'},
        {'code': 'OTHER-UPPER-GI-ENDOSCOPY', 'name': 'UPPER GI ENDOSCOPY', 'category': 'others', 'modality': 'Endoscopy', 'body_part': 'Upper GI Tract'},
        {'code': 'OTHER-PROC TOSIGMOIDOSCOPY', 'name': 'PROCTOSIGMOIDOSCOPY', 'category': 'others', 'modality': 'Endoscopy', 'body_part': 'Rectum/Sigmoid'},
        {'code': 'OTHER-AUDIOMETRY', 'name': 'AUDIOMETRY', 'category': 'others', 'modality': 'Audiometry', 'body_part': 'Ears'},
        {'code': 'OTHER-ECG-STRESS-TEST', 'name': 'ECG (STRESS TEST)', 'category': 'others', 'modality': 'ECG', 'body_part': 'Heart'},
    ]

    # Combine all radiology template data
    all_radiology_templates = xray_data + special_investigations_data + ultrasound_data + doppler_data + mri_data + ct_scan_data + others_data

    for template_data in all_radiology_templates:
        template, created = RadiologyTemplate.objects.get_or_create(
            code=template_data['code'],
            defaults={
                'name': template_data['name'],
                'category': template_data['category'],
                'modality': template_data['modality'],
                'body_part': template_data['body_part'],
                'turnaround_time': '24 hours',  # Default turnaround time
                'radiation_exposure': 'low' if template_data['modality'] in ['Ultrasound', 'MRI'] else 'moderate',
            }
        )
        if created:
            radiology_templates.append(template)

    print(f"Created {len(radiology_templates)} radiology templates")

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

