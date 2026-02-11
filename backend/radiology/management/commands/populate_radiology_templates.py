"""
Management command to populate radiology templates with comprehensive investigation data.
"""
from django.core.management.base import BaseCommand
from radiology.models import RadiologyTemplate


class Command(BaseCommand):
    help = 'Populate radiology templates with comprehensive investigation data'

    def handle(self, *args, **options):
        self.stdout.write('Populating radiology templates...')

        # X-RAY INVESTIGATIONS
        xray_data = [
            {'code': 'XR-ABD', 'name': 'ABDOMEN ERECT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Abdomen', 'radiation_exposure': 'moderate'},
            {'code': 'XR-ABD-ERECT-SUP', 'name': 'ABDOMEN ERECT/SUPINE', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Abdomen', 'radiation_exposure': 'moderate'},
            {'code': 'XR-ANKLE-APLAT', 'name': 'ANKLE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Ankle', 'radiation_exposure': 'low'},
            {'code': 'XR-ARM-HUM-APLAT', 'name': 'ARM/HUMERUS AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Arm/Humerus', 'radiation_exposure': 'low'},
            {'code': 'XR-CERV-SPINE-APLAT', 'name': 'CERVICAL SPINE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Cervical Spine', 'radiation_exposure': 'moderate'},
            {'code': 'XR-CHEST-APPA', 'name': 'CHEST AP/PA', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Chest', 'radiation_exposure': 'moderate'},
            {'code': 'XR-CHEST-PA-LAT', 'name': 'CHEST PA/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Chest', 'radiation_exposure': 'moderate'},
            {'code': 'XR-DORS-SPINE-APLAT', 'name': 'DORSAL SPINE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Dorsal Spine', 'radiation_exposure': 'moderate'},
            {'code': 'XR-DORSO-LUMB-SPINE-APLAT', 'name': 'DORSO-LUMBAR SPINE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Dorso-Lumbar Spine', 'radiation_exposure': 'moderate'},
            {'code': 'XR-ELBOW-APLAT', 'name': 'ELBOW AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Elbow', 'radiation_exposure': 'low'},
            {'code': 'XR-FEMUR-THIGH-APLAT', 'name': 'FEMUR/THIGH AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Femur/Thigh', 'radiation_exposure': 'moderate'},
            {'code': 'XR-FOOT-APLAT', 'name': 'FOOT AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Foot', 'radiation_exposure': 'low'},
            {'code': 'XR-FOREARM-APLAT', 'name': 'FOREARM AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Forearm', 'radiation_exposure': 'low'},
            {'code': 'XR-HAND-APLAT', 'name': 'HAND AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Hand', 'radiation_exposure': 'low'},
            {'code': 'XR-HIP-APLAT', 'name': 'HIP AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Hip', 'radiation_exposure': 'moderate'},
            {'code': 'XR-KNEE-APLAT', 'name': 'KNEE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Knee', 'radiation_exposure': 'low'},
            {'code': 'XR-LEG-TIBIOFIB', 'name': 'LEG (TIBIOFIBULAR)', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Leg', 'radiation_exposure': 'moderate'},
            {'code': 'XR-LUMBOSACR-SPINE-APLAT', 'name': 'LUMBOSACRAL SPINE AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Lumbosacral Spine', 'radiation_exposure': 'moderate'},
            {'code': 'XR-MANDIBLE', 'name': 'MANDIBLE', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Mandible', 'radiation_exposure': 'low'},
            {'code': 'XR-MASTOID', 'name': 'MASTOID', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Mastoid', 'radiation_exposure': 'moderate'},
            {'code': 'XR-NECK-APLAT', 'name': 'NECK AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Neck', 'radiation_exposure': 'moderate'},
            {'code': 'XR-PARANASAL-SINUSES', 'name': 'PARANASAL SINUSES', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Paranasal Sinuses', 'radiation_exposure': 'moderate'},
            {'code': 'XR-PATELLA-SKYLINE', 'name': 'PATELLA (SKYLINE)', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Patella', 'radiation_exposure': 'low'},
            {'code': 'XR-PELVIMETRY', 'name': 'PELVIMETRY', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Pelvis', 'radiation_exposure': 'high'},
            {'code': 'XR-PELVIS', 'name': 'PELVIS', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Pelvis', 'radiation_exposure': 'moderate'},
            {'code': 'XR-SACRO-COCCYGEAL', 'name': 'SACRO-COCCYGEAL', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Sacro-Coccygeal', 'radiation_exposure': 'moderate'},
            {'code': 'XR-SCOLIOTIC-SERIES', 'name': 'SCOLIOTIC SERIES', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Spine', 'radiation_exposure': 'high'},
            {'code': 'XR-SHOULDER', 'name': 'SHOULDER', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Shoulder', 'radiation_exposure': 'moderate'},
            {'code': 'XR-SKULL-APLAT', 'name': 'SKULL AP/LAT', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Skull', 'radiation_exposure': 'moderate'},
            {'code': 'XR-THORACIC-INLET-APLAT', 'name': 'THORACIC INLET (AP/LAT)', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Thoracic Inlet', 'radiation_exposure': 'moderate'},
            {'code': 'XR-TMJ', 'name': 'TMJ', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'TMJ', 'radiation_exposure': 'low'},
            {'code': 'XR-WRIST', 'name': 'WRIST', 'category': 'xray', 'modality': 'X-Ray', 'body_part': 'Wrist', 'radiation_exposure': 'low'},
        ]

        # SPECIAL INVESTIGATIONS
        special_investigations_data = [
            {'code': 'SI-HYSTEROSALPINGOGRAM', 'name': 'Hysterosalpingogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Pelvis', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'SI-BARIUM-ENEMA', 'name': 'Barium enema', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Colon', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'SI-BARIUM-MEAL-FOLLOW-THROUGH', 'name': 'Barium meal and follow through', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'GI Tract', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'SI-BARIUM-MEAL', 'name': 'Barium Meal', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Stomach', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'SI-BARIUM-SWALLOW', 'name': 'Barium Swallow', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Esophagus', 'radiation_exposure': 'moderate', 'contrast_required': True},
            {'code': 'SI-DISTAL-LOOPOGRAM', 'name': 'Distal loopogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Small Intestine', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'SI-FISTULOGRAM', 'name': 'Fistulogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Fistula', 'radiation_exposure': 'moderate', 'contrast_required': True},
            {'code': 'SI-INVERTOGRAM', 'name': 'Invertogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Spine', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'SI-IVU', 'name': 'Intravenous Urogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Urinary Tract', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'SI-MICTURATING-CYSTOURETHROGRAM', 'name': 'Micturating cystourethrogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Bladder/Urethra', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'SI-RETROGRADE-URETHROGRAM', 'name': 'Retrograde urethrogram', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Urethra', 'radiation_exposure': 'moderate', 'contrast_required': True},
            {'code': 'SI-RCUG-MCUG', 'name': 'RCUG + MCUG', 'category': 'special-investigations', 'modality': 'Fluoroscopy', 'body_part': 'Urinary Tract', 'radiation_exposure': 'high', 'contrast_required': True},
        ]

        # ULTRASOUND SCAN
        ultrasound_data = [
            {'code': 'US-OCULAR', 'name': 'Ocular Ultrasound Scan', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Eye', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-ABDOMEN', 'name': 'Sono Abdomen', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Abdomen', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-ABD-PEL', 'name': 'Sono Abdomen and Pelvis', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Abdomen/Pelvis', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-ANOMALY-SCAN', 'name': 'Sono Anomaly Scan', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Fetus', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-ACHILLES-TENDON', 'name': 'Sono Achilles Tendon', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Achilles Tendon', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-BREAST', 'name': 'Sono Breast', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Breast', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-FOLLICULAR-STUDY-DAY', 'name': 'Sono Follicular Study Per Day', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-FOLLICULAR-STUDY', 'name': 'Sono Follicular Study', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-HSG', 'name': 'SONO HSG', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-KUB', 'name': 'Sono KUB', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Kidney/Ureter/Bladder', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-KUB-PROSTATE', 'name': 'Sono KUB & Prostate', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Kidney/Ureter/Bladder/Prostate', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-MUSCULOSKELETAL', 'name': 'Sono Musculoskeletal', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Musculoskeletal', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-NECK', 'name': 'Sono Neck', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Neck', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-NUCHAL-TRANSLUCENCY', 'name': 'Sono Nuchal Translucency', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Fetus', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-OBSTETRICS-BIOPHYSICAL', 'name': 'Sono Obstetrics with Biophysical Profile', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Fetus', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-OBSTETRICS-PREG', 'name': 'Sono Obstetrics/Preg', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Fetus', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-PELVIS-FEMALE', 'name': 'Sono Pelvis (Female/Male)', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-PROSTATE-TRUS', 'name': 'Sono Prostate / TRUS', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Prostate', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-THYROID', 'name': 'Sono Thyroid', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Thyroid', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-TRANSFONTANELLE', 'name': 'Sono Transfontanelle', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Brain', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-TRANSVAGINAL', 'name': 'Sono Transvaginal', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Pelvis', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-SALIVARY-GLAND', 'name': 'Sonography Salivary Gland', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Salivary Gland', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-SMALL-PARTS', 'name': 'Sonography Small parts', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Small Parts', 'radiation_exposure': 'none'},
            {'code': 'US-SONO-PENIS', 'name': 'Ultrasound Penis', 'category': 'ultrasound', 'modality': 'Ultrasound', 'body_part': 'Penis', 'radiation_exposure': 'none'},
        ]

        # DOPPLER ULTRASOUND SCAN
        doppler_data = [
            {'code': 'DOP-PCD-CAROTIDS', 'name': 'PCD Carotids', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Carotid Arteries', 'radiation_exposure': 'none'},
            {'code': 'DOP-PCD-LOWER-EXT-ART-BOTH', 'name': 'PCD Lower Extremity Arterial Study (Both Limbs)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Lower Extremities', 'radiation_exposure': 'none'},
            {'code': 'DOP-PCD-LOWER-EXT-ART-ONE', 'name': 'PCD Lower Extremity Arterial Study (one Limb)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Lower Extremity', 'radiation_exposure': 'none'},
            {'code': 'DOP-PCD-LOWER-EXT-VEN-BOTH', 'name': 'PCD Lower Extremity Venous Study (Both Limbs)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Lower Extremities', 'radiation_exposure': 'none'},
            {'code': 'DOP-PCD-LOWER-EXT-VEN-ONE', 'name': 'PCD Lower Extremity Venous Study (One Limb)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Lower Extremity', 'radiation_exposure': 'none'},
            {'code': 'DOP-PCD-RENAL', 'name': 'PCD Renal', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Kidneys', 'radiation_exposure': 'none'},
            {'code': 'DOP-PCD-UPPER-EXT-ART-BOTH', 'name': 'PCD Upper Extremity Arterial Study (Both Limbs)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Upper Extremities', 'radiation_exposure': 'none'},
            {'code': 'DOP-PCD-UPPER-EXT-ART-ONE', 'name': 'PCD Upper Extremity Arterial Study (One Limb)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Upper Extremity', 'radiation_exposure': 'none'},
            {'code': 'DOP-PCD-UPPER-EXT-VEN-BOTH', 'name': 'PCD Upper Extremity Venous Study (Both Limbs)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Upper Extremities', 'radiation_exposure': 'none'},
            {'code': 'DOP-PCD-UPPER-EXT-VEN-ONE', 'name': 'PCD Upper Extremity Venous Study (One Limb)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Upper Extremity', 'radiation_exposure': 'none'},
            {'code': 'DOP-SCORAL-DOPPLER', 'name': 'Scrotal Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Scrotum', 'radiation_exposure': 'none'},
            {'code': 'DOP-PENILE-DOPPLER', 'name': 'Penile Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Penis', 'radiation_exposure': 'none'},
            {'code': 'DOP-OBSTETRICS-DOPPLER-UA-MCA', 'name': 'Obstetrics Doppler (UA, umbilical artery, MCA)', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Fetus', 'radiation_exposure': 'none'},
            {'code': 'DOP-UMBILICAL-ARTERY-DOPPLER', 'name': 'Umbilical artery Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Fetus', 'radiation_exposure': 'none'},
            {'code': 'DOP-OVARIAN-DOPPLER', 'name': 'Ovarian Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Ovaries', 'radiation_exposure': 'none'},
            {'code': 'DOP-HEPATIC-VEIN-DOPPLER', 'name': 'Hepatic vein Doppler', 'category': 'doppler', 'modality': 'Doppler Ultrasound', 'body_part': 'Liver', 'radiation_exposure': 'none'},
        ]

        # MAGNETIC RESONANCE IMAGING (MRI)
        mri_data = [
            {'code': 'MRI-BRAIN', 'name': 'BRAIN MRI', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Brain', 'radiation_exposure': 'none'},
            {'code': 'MRI-BRAIN-MRA', 'name': 'BRAIN MRA', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Brain', 'radiation_exposure': 'none'},
            {'code': 'MRI-ABDOMEN', 'name': 'MRI ABDOMEN', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Abdomen', 'radiation_exposure': 'none'},
            {'code': 'MRI-ABDOMEN-PELVIS', 'name': 'MRI ABDOMEN AND PELVIS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Abdomen/Pelvis', 'radiation_exposure': 'none'},
            {'code': 'MRI-ANGIOGRAM', 'name': 'MR ANGIOGRAM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Vascular', 'radiation_exposure': 'none'},
            {'code': 'MRI-ANKLE', 'name': 'MRI ANKLE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Ankle', 'radiation_exposure': 'none'},
            {'code': 'MRI-ARM', 'name': 'MRI ARM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Arm', 'radiation_exposure': 'none'},
            {'code': 'MRI-HIPS', 'name': 'MRI HIPS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Hips', 'radiation_exposure': 'none'},
            {'code': 'MRI-BRACHIAL-PLEXUS', 'name': 'MRI BRACHIAL PLEXUS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Brachial Plexus', 'radiation_exposure': 'none'},
            {'code': 'MRI-BRAIN-VENOGRAM', 'name': 'MRI BRAIN VENOGRAM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Brain', 'radiation_exposure': 'none'},
            {'code': 'MRI-BREAST', 'name': 'MRI BREAST', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Breast', 'radiation_exposure': 'none'},
            {'code': 'MRI-CAROTID-ANGIOGRAM', 'name': 'MRI CAROTID ANGIOGRAM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Carotid Arteries', 'radiation_exposure': 'none'},
            {'code': 'MRI-CERVICAL-SPINE', 'name': 'MRI CERVICAL SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Cervical Spine', 'radiation_exposure': 'none'},
            {'code': 'MRI-CHEST', 'name': 'MRI CHEST', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Chest', 'radiation_exposure': 'none'},
            {'code': 'MRI-DORSAL-SPINE', 'name': 'MRI DORSAL SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Dorsal Spine', 'radiation_exposure': 'none'},
            {'code': 'MRI-ELBOW', 'name': 'MRI ELBOW', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Elbow', 'radiation_exposure': 'none'},
            {'code': 'MRI-FACE', 'name': 'MRI FACE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Face', 'radiation_exposure': 'none'},
            {'code': 'MRI-FEMUR', 'name': 'MRI FEMUR', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Femur', 'radiation_exposure': 'none'},
            {'code': 'MRI-FISTULOGRAM', 'name': 'MRI FISTULOGRAM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Fistula', 'radiation_exposure': 'none'},
            {'code': 'MRI-FOREARM', 'name': 'MRI FOREARM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Forearm', 'radiation_exposure': 'none'},
            {'code': 'MRI-INNER-EAR', 'name': 'MRI INNER EAR', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Inner Ear', 'radiation_exposure': 'none'},
            {'code': 'MRI-KNEE', 'name': 'MRI KNEE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Knee', 'radiation_exposure': 'none'},
            {'code': 'MRI-FOOT', 'name': 'MRI FOOT', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Foot', 'radiation_exposure': 'none'},
            {'code': 'MRI-HAND', 'name': 'MRI HAND', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Hand', 'radiation_exposure': 'none'},
            {'code': 'MRI-THIGH', 'name': 'MRI THIGH', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Thigh', 'radiation_exposure': 'none'},
            {'code': 'MRI-LEG', 'name': 'MRI LEG', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Leg', 'radiation_exposure': 'none'},
            {'code': 'MRI-LUMBAR-SPINE', 'name': 'MRI LUMBAR SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Lumbar Spine', 'radiation_exposure': 'none'},
            {'code': 'MRCP', 'name': 'MRCP', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Pancreatic/Biliary Ducts', 'radiation_exposure': 'none'},
            {'code': 'MRI-NECK', 'name': 'MRI NECK', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Neck', 'radiation_exposure': 'none'},
            {'code': 'MRI-ORBITS', 'name': 'MRI ORBITS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Eyes', 'radiation_exposure': 'none'},
            {'code': 'MRI-PARANASAL-SINUSES', 'name': 'MRI PARANASAL SINUSES', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Paranasal Sinuses', 'radiation_exposure': 'none'},
            {'code': 'MRI-PELVIS', 'name': 'MRI PELVIS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Pelvis', 'radiation_exposure': 'none'},
            {'code': 'MRI-PERINEUM', 'name': 'MRI PERINEUM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Perineum', 'radiation_exposure': 'none'},
            {'code': 'MRI-PROSTATE', 'name': 'MRI PROSTATE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Prostate', 'radiation_exposure': 'none'},
            {'code': 'MRI-SACROILIAC-JOINTS', 'name': 'MRI SACROILIAC JOINTS', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Sacroiliac Joints', 'radiation_exposure': 'none'},
            {'code': 'MRI-SCRROTUM', 'name': 'MRI SCROTUM', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Scrotum', 'radiation_exposure': 'none'},
            {'code': 'MRI-SHOULDER', 'name': 'MRI SHOULDER', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Shoulder', 'radiation_exposure': 'none'},
            {'code': 'MRI-TEMPORAL-BONE', 'name': 'MRI TEMPORAL BONE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Temporal Bone', 'radiation_exposure': 'none'},
            {'code': 'MRI-THORACIC-SPINE', 'name': 'MRI THORACIC SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Thoracic Spine', 'radiation_exposure': 'none'},
            {'code': 'MRI-THORACOLUMBAR', 'name': 'MRI THORACOLUMBAR', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Thoracolumbar Spine', 'radiation_exposure': 'none'},
            {'code': 'MRI-TMJ', 'name': 'MRI TMJ', 'category': 'mri', 'modality': 'MRI', 'body_part': 'TMJ', 'radiation_exposure': 'none'},
            {'code': 'MRI-WHOLE-BODY-SCAN', 'name': 'MRI WHOLE BODY SCAN', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Whole Body', 'radiation_exposure': 'none'},
            {'code': 'MRI-WHOLE-SPINE', 'name': 'MRI WHOLE SPINE', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Whole Spine', 'radiation_exposure': 'none'},
            {'code': 'MRI-WRIST', 'name': 'MRI WRIST', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Wrist', 'radiation_exposure': 'none'},
            {'code': 'MRI-AXILLA', 'name': 'MRI AXILLA', 'category': 'mri', 'modality': 'MRI', 'body_part': 'Axilla', 'radiation_exposure': 'none'},
        ]

        # COMPUTED TOMOGRAPHY SCAN (CT SCAN)
        ct_scan_data = [
            {'code': 'CT-ABDOMEN-PELVIS', 'name': 'CT ABDOMEN AND PELVIS', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Abdomen/Pelvis', 'radiation_exposure': 'high'},
            {'code': 'CT-ANGIOGRAM-ABDOMINAL-AORTA', 'name': 'CT ANGIOGRAM (ABDOMINAL AORTA)', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Abdominal Aorta', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-ANKLE', 'name': 'CT ANKLE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Ankle', 'radiation_exposure': 'moderate'},
            {'code': 'CT-BRAIN', 'name': 'CT BRAIN', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Brain', 'radiation_exposure': 'moderate'},
            {'code': 'CT-BRAIN-ANGIOGRAM-VENOGRAM', 'name': 'CT BRAIN ANGIOGRAM + VENOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Brain', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-CAROTID-ANGIOGRAM', 'name': 'CT CAROTID ANGIOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Carotid Arteries', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-CERVICAL-SPINE', 'name': 'CT CERVICAL SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Cervical Spine', 'radiation_exposure': 'moderate'},
            {'code': 'CT-CERVICODORSAL-SPINE', 'name': 'CT CERVICODORSAL SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Cervicodorsal Spine', 'radiation_exposure': 'moderate'},
            {'code': 'CT-CHEST', 'name': 'CT CHEST', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Chest', 'radiation_exposure': 'moderate'},
            {'code': 'CT-COLONOGRAPHY-VIRTUAL', 'name': 'CT COLONOGRAPHY (VIRTUAL)', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Colon', 'radiation_exposure': 'moderate'},
            {'code': 'CT-CRANIOFACIAL', 'name': 'CT CRANIOFACIAL', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Craniofacial', 'radiation_exposure': 'moderate'},
            {'code': 'CT-DORSOLUMBAR-SPINE', 'name': 'CT DORSOLUMBAR SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Dorsolumbar Spine', 'radiation_exposure': 'moderate'},
            {'code': 'CT-ELBOW', 'name': 'CT ELBOW', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Elbow', 'radiation_exposure': 'moderate'},
            {'code': 'CT-ENTEROGRAPHY', 'name': 'CT ENTEROGRAPHY', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Small Intestine', 'radiation_exposure': 'high'},
            {'code': 'CT-EXTREMITIES', 'name': 'CT EXTREMITIES', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Extremities', 'radiation_exposure': 'moderate'},
            {'code': 'CT-FACIAL-BONES', 'name': 'CT FACIAL BONES', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Facial Bones', 'radiation_exposure': 'moderate'},
            {'code': 'CT-FEMUR', 'name': 'CT FEMUR', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Femur', 'radiation_exposure': 'moderate'},
            {'code': 'CT-HAND', 'name': 'CT HAND', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Hand', 'radiation_exposure': 'low'},
            {'code': 'CT-HIP', 'name': 'CT HIP', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Hip', 'radiation_exposure': 'moderate'},
            {'code': 'CT-HUMERUS', 'name': 'CT HUMERUS', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Humerus', 'radiation_exposure': 'moderate'},
            {'code': 'CT-IVU', 'name': 'CT IVU', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Urinary Tract', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-KNEE', 'name': 'CT KNEE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Knee', 'radiation_exposure': 'moderate'},
            {'code': 'CT-FOOT', 'name': 'CT FOOT', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Foot', 'radiation_exposure': 'low'},
            {'code': 'CT-LEG', 'name': 'CT LEG', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Leg', 'radiation_exposure': 'moderate'},
            {'code': 'CT-LUMBAR-SPINE', 'name': 'CT LUMBAR SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Lumbar Spine', 'radiation_exposure': 'moderate'},
            {'code': 'CT-MANDIBLE', 'name': 'CT MANDIBLE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Mandible', 'radiation_exposure': 'moderate'},
            {'code': 'CT-MASTOID', 'name': 'CT MASTOID', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Mastoid', 'radiation_exposure': 'moderate'},
            {'code': 'CT-MAXILLOFACIAL', 'name': 'CT MAXILLOFACIAL', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Maxillofacial', 'radiation_exposure': 'moderate'},
            {'code': 'CT-MYELOGRAM', 'name': 'CT MYELOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Spine', 'radiation_exposure': 'moderate', 'contrast_required': True},
            {'code': 'CT-NASOPHARYNX', 'name': 'CT NASOPHARYNX', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Nasopharynx', 'radiation_exposure': 'moderate'},
            {'code': 'CT-ORBIT', 'name': 'CT ORBIT', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Orbit', 'radiation_exposure': 'moderate'},
            {'code': 'CT-NECK', 'name': 'CT NECK', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Neck', 'radiation_exposure': 'moderate'},
            {'code': 'CT-PARANASAL-SINUS', 'name': 'CT PARANASAL SINUS', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Paranasal Sinus', 'radiation_exposure': 'moderate'},
            {'code': 'CT-PELVIS', 'name': 'CT PELVIS', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Pelvis', 'radiation_exposure': 'moderate'},
            {'code': 'CT-PERIPHERAL-ANGIOGRAM-UPPER', 'name': 'CT PERIPHERAL ANGIOGRAM-UPPER', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Upper Extremities', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-PERIPHERAL-ANGIOGRAM-LOWER', 'name': 'CT PERIPHERAL ANGIOGRAM-LOWER', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Lower Extremities', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-PULMONARY-ANGIOGRAM', 'name': 'CT PULMONARY ANGIOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Lungs', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-RENAL-ANGIOGRAM', 'name': 'CT RENAL ANGIOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Kidneys', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-LARYNX', 'name': 'CT LARYNX', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Larynx', 'radiation_exposure': 'moderate'},
            {'code': 'CT-UROGRAPHY', 'name': 'CT UROGRAPHY', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Urinary Tract', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-SCANOGRAM-SCOLIOSIS', 'name': 'CT SCANOGRAM (SCOLIOSIS)', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Spine', 'radiation_exposure': 'low'},
            {'code': 'CT-SCANOGRAM-LOWER-LIMBS', 'name': 'CT SCANOGRAM (LOWER LIMBS)', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Lower Limbs', 'radiation_exposure': 'low'},
            {'code': 'CT-SHOULDER', 'name': 'CT SHOULDER', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Shoulder', 'radiation_exposure': 'moderate'},
            {'code': 'CT-TEMPORAL-BONE', 'name': 'CT TEMPORAL BONE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Temporal Bone', 'radiation_exposure': 'moderate'},
            {'code': 'CT-TMJ', 'name': 'CT TMJ', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'TMJ', 'radiation_exposure': 'moderate'},
            {'code': 'CT-DORSAL-SPINE', 'name': 'CT DORSAL SPINE', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Dorsal Spine', 'radiation_exposure': 'moderate'},
            {'code': 'CT-VENOGRAM', 'name': 'CT VENOGRAM', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Veins', 'radiation_exposure': 'high', 'contrast_required': True},
            {'code': 'CT-WRIST', 'name': 'CT WRIST', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Wrist', 'radiation_exposure': 'low'},
            {'code': 'CT-PELVIMETRY', 'name': 'CT PELVIMETRY', 'category': 'ct-scan', 'modality': 'CT Scan', 'body_part': 'Pelvis', 'radiation_exposure': 'high'},
        ]

        # OTHERS
        others_data = [
            {'code': 'OTHER-ECG-RESTING', 'name': 'ECG (RESTING)', 'category': 'others', 'modality': 'ECG', 'body_part': 'Heart', 'radiation_exposure': 'none'},
            {'code': 'OTHER-ECHOCARDIOGRAPHY', 'name': 'ECHOCARDIOGRAPHY', 'category': 'others', 'modality': 'Echocardiography', 'body_part': 'Heart', 'radiation_exposure': 'none'},
            {'code': 'OTHER-COLONOSCOPY', 'name': 'COLONOSCOPY', 'category': 'others', 'modality': 'Endoscopy', 'body_part': 'Colon', 'radiation_exposure': 'none'},
            {'code': 'OTHER-UPPER-GI-ENDOSCOPY', 'name': 'UPPER GI ENDOSCOPY', 'category': 'others', 'modality': 'Endoscopy', 'body_part': 'Upper GI Tract', 'radiation_exposure': 'none'},
            {'code': 'OTHER-PROC TOSIGMOIDOSCOPY', 'name': 'PROCTOSIGMOIDOSCOPY', 'category': 'others', 'modality': 'Endoscopy', 'body_part': 'Rectum/Sigmoid', 'radiation_exposure': 'none'},
            {'code': 'OTHER-AUDIOMETRY', 'name': 'AUDIOMETRY', 'category': 'others', 'modality': 'Audiometry', 'body_part': 'Ears', 'radiation_exposure': 'none'},
            {'code': 'OTHER-ECG-STRESS-TEST', 'name': 'ECG (STRESS TEST)', 'category': 'others', 'modality': 'ECG', 'body_part': 'Heart', 'radiation_exposure': 'none'},
        ]

        # Combine all radiology template data
        all_templates = xray_data + special_investigations_data + ultrasound_data + doppler_data + mri_data + ct_scan_data + others_data

        created_count = 0
        for template_data in all_templates:
            template_defaults = {k: v for k, v in template_data.items() if k != 'contrast_required'}
            template, created = RadiologyTemplate.objects.get_or_create(
                code=template_defaults['code'],
                defaults=template_defaults
            )
            if created:
                created_count += 1
                self.stdout.write(f'Created: {template.name} ({template.code})')

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully created {created_count} radiology templates out of {len(all_templates)} total templates.'
            )
        )
