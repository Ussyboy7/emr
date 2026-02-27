"""
Django management command to seed the database with core lab test templates.
Run with: python manage.py seed_lab_templates
"""
from django.core.management.base import BaseCommand
from laboratory.models import LabTemplate


class Command(BaseCommand):
    help = 'Seed the database with core lab test templates'

    def handle(self, *args, **options):
        from laboratory.models import LabTest, LabOrder
        
        # Clear all existing data first
        self.stdout.write('Clearing all existing lab data...')
        LabTest.objects.all().delete()
        LabOrder.objects.all().delete()
        deleted_count, _ = LabTemplate.objects.all().delete()
        self.stdout.write(f'Deleted {deleted_count} existing templates')
        
        self.stdout.write('Creating lab templates...')

        templates_data = [
            # HEMATOLOGY
            {
                'name': 'Full Blood Count (FBC)',
                'code': 'FBC',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Full blood count - comprehensive blood analysis',
                'turnaround_time': '1 hour',
                'normal_range': {
                    '_order': ['RBC', 'Hb (Male)', 'Hb (Female)', 'PCV (Male)', 'PCV (Female)', 'MCV', 'MCH', 'MCHC', 'RDW-CV', 'Platelets', 'WBC', 'Neutrophils', 'Neutrophils (Absolute)', 'Lymphocytes', 'Lymphocytes (Absolute)', 'Monocytes', 'Monocytes (Absolute)', 'Eosinophils', 'Eosinophils (Absolute)', 'Basophils', 'Basophils (Absolute)'],
                    'RBC': {'unit': '10^6/µL', 'min': '3.50', 'max': '5.50', 'dataType': 'numeric', 'required': True},
                    'Hb (Male)': {'unit': 'g/dL', 'min': '11.0', 'max': '18.0', 'dataType': 'numeric', 'required': True},
                    'Hb (Female)': {'unit': 'g/dL', 'min': '11.0', 'max': '16.0', 'dataType': 'numeric', 'required': True},
                    'PCV (Male)': {'unit': '%', 'min': '40.0', 'max': '54.0', 'dataType': 'numeric', 'required': True},
                    'PCV (Female)': {'unit': '%', 'min': '35.0', 'max': '47.0', 'dataType': 'numeric', 'required': True},
                    'MCV': {'unit': 'fL', 'min': '76.0', 'max': '100.0', 'dataType': 'numeric', 'required': True},
                    'MCH': {'unit': 'pg', 'min': '26.0', 'max': '34.0', 'dataType': 'numeric', 'required': True},
                    'MCHC': {'unit': 'g/dL', 'min': '30.0', 'max': '37.0', 'dataType': 'numeric', 'required': True},
                    'RDW-CV': {'unit': '%', 'min': '11.0', 'max': '16.0', 'dataType': 'numeric', 'required': True},
                    'Platelets': {'unit': '10^3/µL', 'min': '150', 'max': '400', 'dataType': 'numeric', 'required': True},
                    'WBC': {'unit': '10^3/µL', 'min': '4.00', 'max': '11.00', 'dataType': 'numeric', 'required': True},
                    'Neutrophils': {'unit': '%', 'min': '40', 'max': '75', 'dataType': 'numeric', 'required': True},
                    'Neutrophils (Absolute)': {'unit': '10^3/µL', 'min': '2.00', 'max': '7.00', 'dataType': 'numeric', 'required': True},
                    'Lymphocytes': {'unit': '%', 'min': '20', 'max': '45', 'dataType': 'numeric', 'required': True},
                    'Lymphocytes (Absolute)': {'unit': '10^3/µL', 'min': '0.80', 'max': '4.00', 'dataType': 'numeric', 'required': True},
                    'Monocytes': {'unit': '%', 'min': '2', 'max': '10', 'dataType': 'numeric', 'required': True},
                    'Monocytes (Absolute)': {'unit': '10^3/µL', 'min': '0.12', 'max': '1.20', 'dataType': 'numeric', 'required': True},
                    'Eosinophils': {'unit': '%', 'min': '1', 'max': '6', 'dataType': 'numeric', 'required': True},
                    'Eosinophils (Absolute)': {'unit': '10^3/µL', 'min': '0.02', 'max': '0.50', 'dataType': 'numeric', 'required': True},
                    'Basophils': {'unit': '%', 'min': '0', 'max': '1', 'dataType': 'numeric', 'required': True},
                    'Basophils (Absolute)': {'unit': '10^3/µL', 'min': '0.00', 'max': '0.10', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Malaria Parasite (MP)',
                'code': 'MP',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Malaria parasite detection by microscopy',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Result': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Erythrocyte Sedimentation Rate (ESR)',
                'code': 'ESR',
                'category': 'hematology',
                'sample_type': 'Whole Blood',
                'description': 'Non-specific inflammation marker',
                'turnaround_time': '1 hour',
                'normal_range': {
                    '_order': ['ESR (Adult)', 'ESR (Child)', 'ESR (Elderly)'],
                    'ESR (Adult)': {'unit': 'mm/hr', 'min': '0', 'max': '15', 'dataType': 'numeric', 'required': True},
                    'ESR (Child)': {'unit': 'mm/hr', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'ESR (Elderly)': {'unit': 'mm/hr', 'min': '0', 'max': '30', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Blood Group',
                'code': 'BG',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Determination of blood group',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Blood Group': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Haemoglobin Genotype (HB Genotype)',
                'code': 'HB-GT',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Haemoglobin electrophoresis for genotype determination',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'HB Genotype': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            # CHEMISTRY
            {
                'name': 'Glycosylated Hemoglobin (HbA1c)',
                'code': 'HBA1C',
                'category': 'chemistry',
                'sample_type': 'EDTA Blood',
                'description': 'Glycated haemoglobin for long-term diabetes monitoring',
                'turnaround_time': '24 hours',
                'normal_range': {
                    '_order': ['HbA1c (NGSP)', 'HbA1c (IFCC)', 'Estimated Average Glucose'],
                    'HbA1c (NGSP)': {'unit': '%', 'min': '4.0', 'max': '6.4', 'dataType': 'numeric', 'required': True},
                    'HbA1c (IFCC)': {'unit': 'mmol/mol', 'min': '20', 'max': '46', 'dataType': 'numeric', 'required': True},
                    'Estimated Average Glucose': {'unit': 'mmol/L', 'min': '', 'max': '', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Fasting Blood Sugar (FBS)',
                'code': 'FBS',
                'category': 'chemistry',
                'sample_type': 'Fluoride Oxalate Blood',
                'description': 'Blood glucose level after at least 8 hours of fasting',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Glucose (Fasting)': {'unit': 'mmol/L', 'min': '3.4', 'max': '5.8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': '2-Hour Postprandial Blood Sugar (2HPP)',
                'code': '2HPP',
                'category': 'chemistry',
                'sample_type': 'Fluoride Oxalate Blood',
                'description': 'Blood glucose level 2 hours after a meal',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Glucose (2-hour PP)': {'unit': 'mmol/L', 'min': '3.9', 'max': '7.8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Random Blood Sugar (RBS)',
                'code': 'RBS',
                'category': 'chemistry',
                'sample_type': 'Fluoride Oxalate Blood',
                'description': 'Blood glucose level at any random time',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Glucose (Random)': {'unit': 'mmol/L', 'min': '3.9', 'max': '7.8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Liver Function Test (LFT)',
                'code': 'LFT',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Comprehensive liver function panel',
                'turnaround_time': '2 hours',
                'normal_range': {
                    '_order': ['Bilirubin (Total)', 'Bilirubin (Direct)', 'Total Protein', 'Albumin', 'ALP', 'gGT', 'ALT (GPT)', 'AST (GOT)'],
                    'Bilirubin (Total)': {'unit': 'umol/L', 'min': '3', 'max': '26', 'dataType': 'numeric', 'required': True},
                    'Bilirubin (Direct)': {'unit': 'umol/L', 'min': '2', 'max': '7', 'dataType': 'numeric', 'required': True},
                    'Total Protein': {'unit': 'g/L', 'min': '60', 'max': '80', 'dataType': 'numeric', 'required': True},
                    'Albumin': {'unit': 'g/L', 'min': '35', 'max': '50', 'dataType': 'numeric', 'required': True},
                    'ALP': {'unit': 'U/L', 'min': '51', 'max': '128', 'dataType': 'numeric', 'required': True},
                    'gGT': {'unit': 'U/L', 'min': '0', 'max': '64', 'dataType': 'numeric', 'required': True},
                    'ALT (GPT)': {'unit': 'U/L', 'min': '0', 'max': '40', 'dataType': 'numeric', 'required': True},
                    'AST (GOT)': {'unit': 'U/L', 'min': '13', 'max': '40', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Renal Function Test (RFT)',
                'code': 'RFT',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Comprehensive kidney function assessment',
                'turnaround_time': '2 hours',
                'normal_range': {
                    '_order': ['Sodium', 'Potassium', 'Chloride', 'Bicarbonate', 'Urea', 'Creatinine (Male)', 'Creatinine (Female)', 'eGFR (CKD-EPI)'],
                    'Sodium': {'unit': 'mmol/L', 'min': '135', 'max': '150', 'dataType': 'numeric', 'required': True},
                    'Potassium': {'unit': 'mmol/L', 'min': '3.5', 'max': '5.1', 'dataType': 'numeric', 'required': True},
                    'Chloride': {'unit': 'mmol/L', 'min': '98', 'max': '107', 'dataType': 'numeric', 'required': True},
                    'Bicarbonate': {'unit': 'mmol/L', 'min': '21', 'max': '29', 'dataType': 'numeric', 'required': True},
                    'Urea': {'unit': 'mmol/L', 'min': '2.1', 'max': '7.1', 'dataType': 'numeric', 'required': True},
                    'Creatinine (Male)': {'unit': 'umol/L', 'min': '80', 'max': '115', 'dataType': 'numeric', 'required': True},
                    'Creatinine (Female)': {'unit': 'umol/L', 'min': '53', 'max': '97', 'dataType': 'numeric', 'required': True},
                    'eGFR (CKD-EPI)': {'unit': 'mL/min/1.73m2', 'min': '90', 'max': '', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Lipid Profile',
                'code': 'LIPID',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Fasting cholesterol and triglyceride levels',
                'turnaround_time': '2 hours',
                'normal_range': {
                    '_order': ['Total Cholesterol', 'Triglycerides', 'HDL Cholesterol', 'LDL Cholesterol', 'Non-HDL Cholesterol', 'Total Cholesterol / HDL'],
                    'Total Cholesterol': {'unit': 'mmol/L', 'min': '0', 'max': '5.2', 'dataType': 'numeric', 'required': True},
                    'Triglycerides': {'unit': 'mmol/L', 'min': '0', 'max': '1.9', 'dataType': 'numeric', 'required': True},
                    'HDL Cholesterol': {'unit': 'mmol/L', 'min': '0', 'max': '0.9', 'dataType': 'numeric', 'required': True},
                    'LDL Cholesterol': {'unit': 'mmol/L', 'min': '0.9', 'max': '', 'dataType': 'numeric', 'required': True},
                    'Non-HDL Cholesterol': {'unit': 'mmol/L', 'min': '0', 'max': '4.3', 'dataType': 'numeric', 'required': True},
                    'Total Cholesterol / HDL': {'unit': '', 'min': '0', 'max': '4.1', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Uric Acid',
                'code': 'UA',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Uric acid level assessment',
                'turnaround_time': '1 hour',
                'normal_range': {
                    '_order': ['Uric Acid (Male)', 'Uric Acid (Female)'],
                    'Uric Acid (Male)': {'unit': 'mmol/L', 'min': '0.21', 'max': '0.42', 'dataType': 'numeric', 'required': True},
                    'Uric Acid (Female)': {'unit': 'mmol/L', 'min': '0.15', 'max': '0.40', 'dataType': 'numeric', 'required': True},
                }
            },
            # SEROLOGY
            {
                'name': 'Widal Test',
                'code': 'WIDAL',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Serological test for typhoid diagnosis',
                'turnaround_time': '1 hour',
                'normal_range': {
                    '_order': ['S. Typhi O', 'S. Typhi H', 'S. Paratyphi A O', 'S. Paratyphi A H', 'S. Paratyphi B O', 'S. Paratyphi B H', 'S. Paratyphi C O', 'S. Paratyphi C H'],
                    'S. Typhi O': {'unit': '1:', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'S. Typhi H': {'unit': '1:', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'S. Paratyphi A O': {'unit': '1:', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'S. Paratyphi A H': {'unit': '1:', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'S. Paratyphi B O': {'unit': '1:', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'S. Paratyphi B H': {'unit': '1:', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'S. Paratyphi C O': {'unit': '1:', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'S. Paratyphi C H': {'unit': '1:', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Wound Swab',
                'code': 'WOUND-SW',
                'category': 'microbiology',
                'sample_type': 'Swab',
                'description': 'Microbiology culture and sensitivity for wound infection',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '_order': ['Pus Cells', 'RBCs', 'Bacteria', 'Fungal Elements', 'Gram Stain', 'Culture', 'Pefloxacin (PEF)', 'Azithromycin (AZ)', 'Gentamycin (CN)', 'Levofloxacin (LEV)', 'Ampiclox (APX)', 'Erythromycin (E)', 'Zinnacef (Z)', 'Cefotaxim (CF)', 'Amoxacilin (AM)', 'Sparfloxacin (SP)', 'Rosephine (R)', 'Tarivid (OFX)', 'Ciprofloxacin (CPX)', 'Augmentin (AU)'],
                    'Pus Cells': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'EAR Swab',
                'code': 'EAR-SW',
                'category': 'microbiology',
                'sample_type': 'Swab',
                'description': 'Microbiology culture and sensitivity for ear infection',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '_order': ['Pus Cells', 'RBCs', 'Bacteria', 'Fungal Elements', 'Gram Stain', 'Culture', 'Pefloxacin (PEF)', 'Azithromycin (AZ)', 'Gentamycin (CN)', 'Levofloxacin (LEV)', 'Ampiclox (APX)', 'Erythromycin (E)', 'Zinnacef (Z)', 'Cefotaxim (CF)', 'Amoxacilin (AM)', 'Sparfloxacin (SP)', 'Rosephine (R)', 'Tarivid (OFX)', 'Ciprofloxacin (CPX)', 'Augmentin (AU)'],
                    'Pus Cells': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'HIGH VAGINAL Swab',
                'code': 'HVS-SW',
                'category': 'microbiology',
                'sample_type': 'Swab',
                'description': 'Microbiology culture and sensitivity for vaginal infection',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '_order': ['Pus Cells', 'RBCs', 'Bacteria', 'Fungal Elements', 'Gram Stain', 'Culture', 'Pefloxacin (PEF)', 'Azithromycin (AZ)', 'Gentamycin (CN)', 'Levofloxacin (LEV)', 'Ampiclox (APX)', 'Erythromycin (E)', 'Zinnacef (Z)', 'Cefotaxim (CF)', 'Amoxacilin (AM)', 'Sparfloxacin (SP)', 'Rosephine (R)', 'Tarivid (OFX)', 'Ciprofloxacin (CPX)', 'Augmentin (AU)'],
                    'Pus Cells': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Endocervical Swab',
                'code': 'ENDO-SW',
                'category': 'microbiology',
                'sample_type': 'Swab',
                'description': 'Microbiology culture and sensitivity for cervical infection',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '_order': ['Pus Cells', 'RBCs', 'Bacteria', 'Fungal Elements', 'Gram Stain', 'Culture', 'Pefloxacin (PEF)', 'Azithromycin (AZ)', 'Gentamycin (CN)', 'Levofloxacin (LEV)', 'Ampiclox (APX)', 'Erythromycin (E)', 'Zinnacef (Z)', 'Cefotaxim (CF)', 'Amoxacilin (AM)', 'Sparfloxacin (SP)', 'Rosephine (R)', 'Tarivid (OFX)', 'Ciprofloxacin (CPX)', 'Augmentin (AU)'],
                    'Pus Cells': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Throat Swab',
                'code': 'THROAT-SW',
                'category': 'microbiology',
                'sample_type': 'Swab',
                'description': 'Microbiology culture and sensitivity for throat infection',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '_order': ['Pus Cells', 'RBCs', 'Bacteria', 'Fungal Elements', 'Gram Stain', 'Culture', 'Pefloxacin (PEF)', 'Azithromycin (AZ)', 'Gentamycin (CN)', 'Levofloxacin (LEV)', 'Ampiclox (APX)', 'Erythromycin (E)', 'Zinnacef (Z)', 'Cefotaxim (CF)', 'Amoxacilin (AM)', 'Sparfloxacin (SP)', 'Rosephine (R)', 'Tarivid (OFX)', 'Ciprofloxacin (CPX)', 'Augmentin (AU)'],
                    'Pus Cells': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Stool Analysis',
                'code': 'STOOL-AX',
                'category': 'parasitology',
                'sample_type': 'Stool',
                'description': 'Routine stool examination',
                'turnaround_time': '1 hour',
                'normal_range': {
                    '_order': ['Colour', 'Appearance', 'Mucus', 'Blood', 'Ova', 'Cyst', 'Yeast Cells', 'Other Parasites'],
                    'Colour': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Appearance': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Mucus': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Blood': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Ova': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Cyst': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Yeast Cells': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Other Parasites': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Stool MCS',
                'code': 'STOOL-MCS',
                'category': 'microbiology',
                'sample_type': 'Stool',
                'description': 'Stool microbiology culture and sensitivity',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '_order': ['Pus Cells', 'Parasites', 'Others', 'Culture', 'Anti-Microbial Sensitivity', 'Pefloxacin (PEF)', 'Gentamycin (CN)', 'Ampiclox (APX)', 'Zinnacef (Z)', 'Amoxacilin (AM)', 'Rosephine (R)', 'Ciprofloxacin (CPX)', 'Azithromycin (AZ)', 'Levofloxacin (LEV)', 'Erythromycin (E)', 'Cefotaxim (CF)', 'Tarivid (OFX)', 'Sparfloxacin (SP)', 'Augmentin (AU)'],
                    'Pus Cells': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Parasites': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Others': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Anti-Microbial Sensitivity': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Retroviral Screening (RVS)',
                'code': 'RVS',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'HIV-1/2 antibody screening test',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'HIV 1/2': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Hepatitis B Surface Antigen (HBsAg)',
                'code': 'HBSAG',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Hepatitis B virus surface antigen screening',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'HBsAg': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Hepatitis C Virus Antibody (HCV)',
                'code': 'HCV',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Hepatitis C virus antibody screening',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'HCV': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'VDRL',
                'code': 'VDRL',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Venereal Disease Research Laboratory test for syphilis',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'VDRL': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'H. Pylori Antigen',
                'code': 'HPYLORI-AG',
                'category': 'serology',
                'sample_type': 'Stool',
                'description': 'Helicobacter pylori antigen detection in stool',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'H. Pylori AG': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'H. Pylori Antibody',
                'code': 'HPYLORI-AB',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Helicobacter pylori antibody detection',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'H. Pylori AB': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Pregnancy Test',
                'code': 'PREGNANCY',
                'category': 'serology',
                'sample_type': 'Urine',
                'description': 'Human chorionic gonadotropin (hCG) pregnancy test',
                'turnaround_time': '15 minutes',
                'normal_range': {
                    'hCG': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Urinalysis',
                'code': 'URINE-AX',
                'category': 'urinalysis',
                'sample_type': 'Urine',
                'description': 'Complete urinalysis',
                'turnaround_time': '15 minutes',
                'normal_range': {
                    '_order': ['Colour', 'Appearance', 'pH', 'Specific Gravity', 'Glucose', 'Ketone', 'Nitrite', 'Proteins', 'Bilirubin', 'Urobilinogen', 'Blood', 'Leucocytes', 'Ascorbic Acid'],
                    'Colour': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Appearance': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'pH': {'unit': '', 'min': '5.0', 'max': '8.0', 'dataType': 'numeric', 'required': True},
                    'Specific Gravity': {'unit': '', 'min': '1.005', 'max': '1.030', 'dataType': 'numeric', 'required': True},
                    'Glucose': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Ketone': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Nitrite': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Proteins': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Bilirubin': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Urobilinogen': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Blood': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Leucocytes': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Ascorbic Acid': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Urine MCS',
                'code': 'URINE-MCS',
                'category': 'microbiology',
                'sample_type': 'Urine',
                'description': 'Urine microscopy, culture and sensitivity',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '_order': ['Pus Cells', 'Epithelial Cell', 'Yeast Cells', 'Cast/Crystals', 'Others', 'Culture', 'Anti-Microbial Sensitivity', 'Pefloxacin (PEF)', 'Gentamycin (CN)', 'Ampiclox (APX)', 'Ceftriaxone (CRO)', 'Amoxacilin (AM)', 'Rosephine (R)', 'Ciprofloxacin (CPX)', 'Nitrofurantoin (F)', 'Levofloxacin (LEV)', 'Imipenem (IMI)', 'Cefotaxim (CF)', 'Tarivid (OFX)', 'Caftazidime (CAZ)', 'Augmentin (AU)', 'Meropenem (MEM)'],
                    'Pus Cells': {'unit': '', 'range': 'N', 'dataType': 'text', 'required': True},
                    'Epithelial Cell': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Yeast Cells': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Cast/Crystals': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Others': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Anti-Microbial Sensitivity': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ceftriaxone (CRO)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Nitrofurantoin (F)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Imipenem (IMI)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Caftazidime (CAZ)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},
                    'Meropenem (MEM)': {'unit': '', 'range': '', 'dataType': 'text', 'required': False},

                }
            },
            {
                'name': 'Noble Cup',
                'code': 'NOBLE-CUP',
                'category': 'toxicology',
                'sample_type': 'Urine',
                'description': 'Drug screening test panel',
                'turnaround_time': '1 hour',
                'normal_range': {
                    '_order': ['AMPHETAMINE (AMP)', 'BARBITURATES (BAR)', 'TRICYCLIC ANTIDEPRESANTS (TCA)', 'COCAINE (COC)', 'BENZODIAZEPINE (BZO)', 'OPIATE (OPI)', 'METHAMPHETAMINE (MET)', 'MARIJUANA (THC)', 'ECSTASY (MDMA)', 'TRAMADOL (TML)'],
                    'AMPHETAMINE (AMP)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'BARBITURATES (BAR)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'TRICYCLIC ANTIDEPRESANTS (TCA)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'COCAINE (COC)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'BENZODIAZEPINE (BZO)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'OPIATE (OPI)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'METHAMPHETAMINE (MET)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'MARIJUANA (THC)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'ECSTASY (MDMA)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                    'TRAMADOL (TML)': {'unit': '', 'range': '', 'dataType': 'text', 'required': True},
                }
            },
        ]

        created_count = 0

        for template_data in templates_data:
            template = LabTemplate.objects.create(
                name=template_data['name'],
                code=template_data['code'],
                category=template_data.get('category', 'chemistry'),
                sample_type=template_data['sample_type'],
                description=template_data.get('description', ''),
                normal_range=template_data.get('normal_range', {}),
                turnaround_time=template_data.get('turnaround_time', ''),
                is_active=True,
            )
            created_count += 1
            self.stdout.write(self.style.SUCCESS(f'Created: {template.name} ({template.code})'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Seeding complete!\n'
            f'  Created: {created_count} templates\n'
            f'  Total: {len(templates_data)} templates in database'
        ))
