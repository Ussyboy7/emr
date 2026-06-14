"""
Django management command to seed the database with core lab test templates.
Run with: python manage.py seed_lab_templates
"""
import re

from django.core.management.base import BaseCommand
from laboratory.models import LabTemplate


class Command(BaseCommand):
    help = 'Seed the database with core lab test templates'

    @staticmethod
    def _normalize_token(value: str) -> str:
        return re.sub(r'[^a-z0-9]+', '', str(value or '').strip().lower())

    def _canonical_template_name(self, name: str, code: str) -> str:
        """
        Keep template `name` human-readable and avoid repeating code.
        Example: "Fasting Blood Sugar (FBS)" + code "FBS" -> "Fasting Blood Sugar".
        """
        raw = str(name or '').strip()
        match = re.search(r'^(.*)\(([^()]*)\)\s*$', raw)
        if not match:
            return raw
        base_name = match.group(1).strip()
        suffix = match.group(2).strip()
        if (
            base_name
            and self._normalize_token(suffix)
            and self._normalize_token(suffix) == self._normalize_token(code)
        ):
            return base_name
        return raw

    def handle(self, *args, **options):
        self.stdout.write('Seeding lab templates (non-destructive mode)...')
        self.stdout.write('Keeping existing LabOrder and LabTest records.')

        templates_data = [
            {
                'name': 'Others (Specify in clinical notes)',
                'code': 'OTHERS',
                'category': 'chemistry',
                'sample_type': 'See clinical notes',
                'description': (
                    'Use when the test is not in the catalog. Describe the exact test name, '
                    'specimen, and instructions in the order clinical notes for laboratory staff.'
                ),
                'turnaround_time': 'Per laboratory',
                'normal_range': {
                    'Result': {'unit': '', 'range': 'Document method and reference in clinical notes', 'dataType': 'text', 'required': False},
                },
            },
            # HEMATOLOGY
            {
                'name': 'Full Blood Count',
                'code': 'FBC',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Full blood count - comprehensive blood analysis',
                'turnaround_time': '1 hour',
                'normal_range': {
                    '_order': ['RBC', 'Hb (Male)', 'Hb (Female)', 'PCV (Male)', 'PCV (Female)', 'MCV', 'MCH', 'MCHC', 'RDW', 'Platelets', 'WBC', 'Neutrophils (Absolute)', 'Lymphocytes (Absolute)', 'Monocytes (Absolute)', 'Eosinophils (Absolute)', 'Basophils (Absolute)', 'Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils', 'Basophils'],
                    'RBC': {'unit': '10^6/µL', 'min': '3.50', 'max': '5.50', 'dataType': 'numeric', 'required': True},
                    'Hb (Male)': {'unit': 'g/dL', 'min': '11.0', 'max': '18.0', 'critical_min': '7.0', 'critical_max': '20.0', 'dataType': 'numeric', 'required': True},
                    'Hb (Female)': {'unit': 'g/dL', 'min': '11.0', 'max': '16.0', 'critical_min': '7.0', 'critical_max': '20.0', 'dataType': 'numeric', 'required': True},
                    'PCV (Male)': {'unit': '%', 'min': '40.0', 'max': '54.0', 'dataType': 'numeric', 'required': True},
                    'PCV (Female)': {'unit': '%', 'min': '35.0', 'max': '47.0', 'dataType': 'numeric', 'required': True},
                    'MCV': {'unit': 'fL', 'min': '76.0', 'max': '100.0', 'dataType': 'numeric', 'required': True},
                    'MCH': {'unit': 'pg', 'min': '26.0', 'max': '34.0', 'dataType': 'numeric', 'required': True},
                    'MCHC': {'unit': 'g/dL', 'min': '30.0', 'max': '37.0', 'dataType': 'numeric', 'required': True},
                    'RDW': {'unit': '%', 'min': '11.0', 'max': '16.0', 'dataType': 'numeric', 'required': True},
                    'Platelets': {'unit': '10^3/µL', 'min': '150', 'max': '400', 'critical_min': '50', 'critical_max': '1000', 'dataType': 'numeric', 'required': True},

                    'WBC': {'unit': '10^3/µL', 'min': '4.00', 'max': '11.00', 'critical_min': '2.00', 'critical_max': '30.00', 'dataType': 'numeric', 'required': True},

                    'Neutrophils (Absolute)': {'unit': '10^3/µL', 'min': '2.00', 'max': '7.00', 'dataType': 'numeric', 'required': True},
                    'Lymphocytes (Absolute)': {'unit': '10^3/µL', 'min': '0.80', 'max': '4.00', 'dataType': 'numeric', 'required': True},
                    'Monocytes (Absolute)': {'unit': '10^3/µL', 'min': '0.12', 'max': '1.20', 'dataType': 'numeric', 'required': True},
                    'Eosinophils (Absolute)': {'unit': '10^3/µL', 'min': '0.02', 'max': '0.50', 'dataType': 'numeric', 'required': True},
                    'Basophils (Absolute)': {'unit': '10^3/µL', 'min': '0.00', 'max': '0.10', 'dataType': 'numeric', 'required': True},

                    'Neutrophils': {'unit': '%', 'min': '40', 'max': '75', 'dataType': 'numeric', 'required': True},
                    'Lymphocytes': {'unit': '%', 'min': '20', 'max': '45', 'dataType': 'numeric', 'required': True},
                    'Monocytes': {'unit': '%', 'min': '2', 'max': '10', 'dataType': 'numeric', 'required': True},
                    'Eosinophils': {'unit': '%', 'min': '1', 'max': '6', 'dataType': 'numeric', 'required': True},
                    'Basophils': {'unit': '%', 'min': '0', 'max': '1', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Malaria Parasite',
                'code': 'MP',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Malaria parasite detection by microscopy',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Result': {'unit': '', 'range': 'No parasites seen / report findings', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Erythrocyte Sedimentation Rate',
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
                    'Blood Group': {'unit': '', 'range': 'ABO & Rh (report phenotype)', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Haemoglobin Genotype',
                'code': 'HB-GT',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Haemoglobin electrophoresis for genotype determination',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'HB Genotype': {'unit': '', 'range': 'AA (or report electrophoresis pattern)', 'dataType': 'text', 'required': True},
                }
            },
            # CHEMISTRY
            {
                'name': 'Glycosylated Hemoglobin',
                'code': 'HBA1C',
                'category': 'chemistry',
                'sample_type': 'EDTA Blood',
                'description': 'Glycated haemoglobin for long-term diabetes monitoring',
                'turnaround_time': '24 hours',
                'normal_range': {
                    '_order': ['HbA1c (NGSP)', 'HbA1c (IFCC)', 'Estimated Average Glucose'],
                    'HbA1c (NGSP)': {'unit': '%', 'min': '4.0', 'max': '6.4', 'dataType': 'numeric', 'required': True},
                    'HbA1c (IFCC)': {'unit': 'mmol/mol', 'min': '20', 'max': '46', 'dataType': 'numeric', 'required': True},
                    'Estimated Average Glucose': {'unit': 'mmol/L', 'min': '', 'max': '', 'range': 'Derived from HbA1c (eAG); interpret with HbA1c', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Fasting Blood Sugar',
                'code': 'FBS',
                'category': 'chemistry',
                'sample_type': 'Fluoride Oxalate Blood',
                'description': 'Blood glucose level after at least 8 hours of fasting',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Glucose (Fasting)': {'unit': 'mmol/L', 'min': '3.4', 'max': '5.8', 'critical_min': '2.2', 'critical_max': '22.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': '2-Hour Postprandial Blood Sugar',
                'code': '2HPP',
                'category': 'chemistry',
                'sample_type': 'Fluoride Oxalate Blood',
                'description': 'Blood glucose level 2 hours after a meal',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Glucose (2-hour PP)': {'unit': 'mmol/L', 'min': '3.9', 'max': '7.8', 'critical_min': '2.2', 'critical_max': '22.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Random Blood Sugar',
                'code': 'RBS',
                'category': 'chemistry',
                'sample_type': 'Fluoride Oxalate Blood',
                'description': 'Blood glucose level at any random time',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Glucose (Random)': {'unit': 'mmol/L', 'min': '3.9', 'max': '7.8', 'critical_min': '2.2', 'critical_max': '22.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Liver Function Test',
                'code': 'LFT',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Comprehensive liver function panel',
                'turnaround_time': '2 hours',
                'normal_range': {
                    '_order': ['Bilirubin (Total)', 'Bilirubin (Direct)', 'Total Protein', 'Albumin', 'ALP', 'gGT', 'ALT (GPT)', 'AST (GOT)'],
                    'Bilirubin (Total)': {'unit': 'umol/L', 'min': '3', 'max': '26', 'critical_max': '85', 'dataType': 'numeric', 'required': True},
                    'Bilirubin (Direct)': {'unit': 'umol/L', 'min': '2', 'max': '7', 'dataType': 'numeric', 'required': True},
                    'Total Protein': {'unit': 'g/L', 'min': '60', 'max': '80', 'dataType': 'numeric', 'required': True},
                    'Albumin': {'unit': 'g/L', 'min': '35', 'max': '50', 'critical_min': '20', 'dataType': 'numeric', 'required': True},
                    'ALP': {'unit': 'U/L', 'min': '51', 'max': '128', 'dataType': 'numeric', 'required': True},
                    'gGT': {'unit': 'U/L', 'min': '0', 'max': '64', 'dataType': 'numeric', 'required': True},
                    'ALT (GPT)': {'unit': 'U/L', 'min': '0', 'max': '40', 'critical_max': '1000', 'dataType': 'numeric', 'required': True},
                    'AST (GOT)': {'unit': 'U/L', 'min': '13', 'max': '40', 'critical_max': '1000', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Renal Function Test',
                'code': 'RFT',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Comprehensive kidney function assessment',
                'turnaround_time': '2 hours',
                'normal_range': {
                    '_order': ['Sodium', 'Potassium', 'Chloride', 'Bicarbonate', 'Urea', 'Creatinine (Male)', 'Creatinine (Female)', 'eGFR (CKD-EPI)'],
                    'Sodium': {'unit': 'mmol/L', 'min': '135', 'max': '150', 'critical_min': '120', 'critical_max': '160', 'dataType': 'numeric', 'required': True},
                    'Potassium': {'unit': 'mmol/L', 'min': '3.5', 'max': '5.1', 'critical_min': '2.8', 'critical_max': '6.2', 'dataType': 'numeric', 'required': True},
                    'Chloride': {'unit': 'mmol/L', 'min': '98', 'max': '107', 'dataType': 'numeric', 'required': True},
                    'Bicarbonate': {'unit': 'mmol/L', 'min': '21', 'max': '29', 'critical_min': '10', 'critical_max': '40', 'dataType': 'numeric', 'required': True},
                    'Urea': {'unit': 'mmol/L', 'min': '2.1', 'max': '7.1', 'critical_max': '35', 'dataType': 'numeric', 'required': True},
                    'Creatinine (Male)': {'unit': 'umol/L', 'min': '80', 'max': '115', 'critical_max': '530', 'dataType': 'numeric', 'required': True},
                    'Creatinine (Female)': {'unit': 'umol/L', 'min': '53', 'max': '97', 'critical_max': '530', 'dataType': 'numeric', 'required': True},
                    'eGFR (CKD-EPI)': {'unit': 'mL/min/1.73m2', 'min': '90', 'max': '', 'range': '≥90 typical; stage CKD per eGFR', 'dataType': 'numeric', 'required': True},
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
                    'LDL Cholesterol': {'unit': 'mmol/L', 'min': '0.9', 'max': '', 'range': '≥0.9; targets vary by CV risk', 'dataType': 'numeric', 'required': True},
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
                    'Pus Cells': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': 'None / morphology if present', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': 'Not seen / report if present', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': 'No organisms / report pattern', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': 'No growth / identify & quantify', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
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
                    'Pus Cells': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': 'None / morphology if present', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': 'Not seen / report if present', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': 'No organisms / report pattern', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': 'No growth / identify & quantify', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
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
                    'Pus Cells': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': 'None / morphology if present', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': 'Not seen / report if present', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': 'No organisms / report pattern', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': 'No growth / identify & quantify', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
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
                    'Pus Cells': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': 'None / morphology if present', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': 'Not seen / report if present', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': 'No organisms / report pattern', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': 'No growth / identify & quantify', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
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
                    'Pus Cells': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'RBCs': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'Bacteria': {'unit': '', 'range': 'None / morphology if present', 'dataType': 'text', 'required': True},
                    'Fungal Elements': {'unit': '', 'range': 'Not seen / report if present', 'dataType': 'text', 'required': True},
                    'Gram Stain': {'unit': '', 'range': 'No organisms / report pattern', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': 'No growth / identify & quantify', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
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
                    'Colour': {'unit': '', 'range': 'Brown to yellow-brown (typical); report if atypical', 'dataType': 'text', 'required': True},
                    'Appearance': {'unit': '', 'range': 'Formed to semi-formed; report consistency', 'dataType': 'text', 'required': True},
                    'Mucus': {'unit': '', 'range': 'None or trace / report amount', 'dataType': 'text', 'required': True},
                    'Blood': {'unit': '', 'range': 'Negative / not seen', 'dataType': 'text', 'required': True},
                    'Ova': {'unit': '', 'range': 'Not seen / identify if present', 'dataType': 'text', 'required': True},
                    'Cyst': {'unit': '', 'range': 'Not seen / identify if present', 'dataType': 'text', 'required': True},
                    'Yeast Cells': {'unit': '', 'range': 'Not seen / report if present', 'dataType': 'text', 'required': True},
                    'Other Parasites': {'unit': '', 'range': 'Not seen / identify if present', 'dataType': 'text', 'required': True},
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
                    'Pus Cells': {'unit': '', 'range': 'None or report / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'Parasites': {'unit': '', 'range': 'Not seen / identify if present', 'dataType': 'text', 'required': True},
                    'Others': {'unit': '', 'range': 'None / narrative', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': 'No growth / identify & quantify', 'dataType': 'text', 'required': True},
                    'Anti-Microbial Sensitivity': {'unit': '', 'range': 'Report S / I / R / NT per isolate', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Zinnacef (Z)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Azithromycin (AZ)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Erythromycin (E)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Sparfloxacin (SP)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Retroviral Screening',
                'code': 'RVS',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'HIV-1/2 antibody screening test',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'HIV 1/2': {'unit': '', 'range': 'Non-reactive (screening; confirm per policy)', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Hepatitis B Surface Antigen',
                'code': 'HBSAG',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Hepatitis B virus surface antigen screening',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'HBsAg': {'unit': '', 'range': 'Negative / non-reactive (screening)', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Hepatitis C Virus Antibody',
                'code': 'HCV',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Hepatitis C virus antibody screening',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'HCV': {'unit': '', 'range': 'Negative / non-reactive (screening)', 'dataType': 'text', 'required': True},
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
                    'VDRL': {'unit': '', 'range': 'Non-reactive (qualitative screening)', 'dataType': 'text', 'required': True},
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
                    'H. Pylori AG': {'unit': '', 'range': 'Negative (antigen screen)', 'dataType': 'text', 'required': True},
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
                    'H. Pylori AB': {'unit': '', 'range': 'Negative (antibody screen)', 'dataType': 'text', 'required': True},
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
                    'hCG': {'unit': '', 'range': 'Negative (non-pregnant; qualitative)', 'dataType': 'text', 'required': True},
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
                    # Visual / qualitative rows: `range` is free-text reference (not a numeric band).
                    'Colour': {'unit': '', 'range': 'Straw to yellow (visual)', 'dataType': 'text', 'required': True},
                    'Appearance': {'unit': '', 'range': 'Clear to slightly cloudy', 'dataType': 'text', 'required': True},
                    'pH': {'unit': '', 'min': '5.0', 'max': '8.0', 'dataType': 'numeric', 'required': True},
                    'Specific Gravity': {'unit': '', 'min': '1.005', 'max': '1.030', 'dataType': 'numeric', 'required': True},
                    'Glucose': {'unit': '', 'range': 'Negative (dipstick)', 'dataType': 'text', 'required': True},
                    'Ketone': {'unit': '', 'range': 'Negative (dipstick)', 'dataType': 'text', 'required': True},
                    'Nitrite': {'unit': '', 'range': 'Negative (dipstick)', 'dataType': 'text', 'required': True},
                    'Proteins': {'unit': '', 'range': 'Negative (dipstick)', 'dataType': 'text', 'required': True},
                    'Bilirubin': {'unit': '', 'range': 'Negative (dipstick)', 'dataType': 'text', 'required': True},
                    'Urobilinogen': {'unit': '', 'range': 'Normal trace (dipstick IFU)', 'dataType': 'text', 'required': True},
                    'Blood': {'unit': '', 'range': 'Negative (dipstick)', 'dataType': 'text', 'required': True},
                    'Leucocytes': {'unit': '', 'range': 'Negative (dipstick)', 'dataType': 'text', 'required': True},
                    'Ascorbic Acid': {'unit': '', 'range': 'Not interfering (dipstick IFU)', 'dataType': 'text', 'required': True},
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
                    'Epithelial Cell': {'unit': '', 'range': 'Few or none / HPF (qualitative)', 'dataType': 'text', 'required': True},
                    'Yeast Cells': {'unit': '', 'range': 'Not seen / report if present', 'dataType': 'text', 'required': True},
                    'Cast/Crystals': {'unit': '', 'range': 'None / report type if present', 'dataType': 'text', 'required': True},
                    'Others': {'unit': '', 'range': 'None / narrative', 'dataType': 'text', 'required': True},
                    'Culture': {'unit': '', 'range': 'No growth / identify & quantify', 'dataType': 'text', 'required': True},
                    'Anti-Microbial Sensitivity': {'unit': '', 'range': 'Report S / I / R / NT per isolate', 'dataType': 'text', 'required': True},
                    'Pefloxacin (PEF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Gentamycin (CN)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ampiclox (APX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ceftriaxone (CRO)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Amoxacilin (AM)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Rosephine (R)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Ciprofloxacin (CPX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Nitrofurantoin (F)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Levofloxacin (LEV)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Imipenem (IMI)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Cefotaxim (CF)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Tarivid (OFX)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Caftazidime (CAZ)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Augmentin (AU)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},
                    'Meropenem (MEM)': {'unit': '', 'range': 'S / I / R / NT', 'dataType': 'text', 'required': False},

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
                    # Screening panel: expected “negative” at kit cut-off unless confirmed by LCMS/GC-MS.
                    'AMPHETAMINE (AMP)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                    'BARBITURATES (BAR)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                    'TRICYCLIC ANTIDEPRESANTS (TCA)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                    'COCAINE (COC)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                    'BENZODIAZEPINE (BZO)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                    'OPIATE (OPI)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                    'METHAMPHETAMINE (MET)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                    'MARIJUANA (THC)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                    'ECSTASY (MDMA)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                    'TRAMADOL (TML)': {'unit': '', 'range': 'Negative (rapid screen cut-off)', 'dataType': 'text', 'required': True},
                }
            },
            # HEMATOLOGY (Additions)
            {
                'name': 'Prothrombin Time (PT)',
                'code': 'PT',
                'category': 'hematology',
                'sample_type': 'Citrate Plasma',
                'description': 'Measures the time it takes for plasma to clot; used to assess the extrinsic pathway.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'PT': {'unit': 'seconds', 'min': '11.0', 'max': '13.5', 'dataType': 'numeric', 'required': True},
                    'INR': {'unit': '', 'min': '0.9', 'max': '1.1', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Activated Partial Thromboplastin Time (aPTT)',
                'code': 'APTT',
                'category': 'hematology',
                'sample_type': 'Citrate Plasma',
                'description': 'Measures the time it takes for plasma to clot; used to assess the intrinsic pathway.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'aPTT': {'unit': 'seconds', 'min': '25.0', 'max': '35.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Thrombin Time (TT)',
                'code': 'TT',
                'category': 'hematology',
                'sample_type': 'Citrate Plasma',
                'description': 'Measures the time for fibrinogen to convert to fibrin.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'TT': {'unit': 'seconds', 'min': '14.0', 'max': '19.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'D-Dimer',
                'code': 'D-DIMER',
                'category': 'hematology',
                'sample_type': 'Citrate Plasma',
                'description': 'Fibrin degradation product; a marker for thrombosis.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'D-Dimer': {'unit': 'ng/mL FEU', 'min': '0.0', 'max': '0.50', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Bleeding Time',
                'code': 'BT',
                'category': 'hematology',
                'sample_type': 'Capillary Blood',
                'description': 'Time taken for bleeding to stop from a standard incision.',
                'turnaround_time': '15 minutes',
                'normal_range': {
                    'Bleeding Time': {'unit': 'minutes', 'min': '1.0', 'max': '9.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Hemoglobin (Standalone)',
                'code': 'HGB',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Measurement of hemoglobin concentration.',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    '_order': ['Hb (Male)', 'Hb (Female)'],
                    'Hb (Male)': {'unit': 'g/dL', 'min': '13.5', 'max': '17.5', 'dataType': 'numeric', 'required': True},
                    'Hb (Female)': {'unit': 'g/dL', 'min': '12.0', 'max': '15.5', 'dataType': 'numeric', 'required': True},
                }
            },

            # CLINICAL CHEMISTRY (Additions)
            {
                'name': 'Calcium (Total)',
                'code': 'CA',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Measurement of total calcium in blood.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Calcium (Total)': {'unit': 'mmol/L', 'min': '2.10', 'max': '2.60', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Ionized Calcium',
                'code': 'CA-ION',
                'category': 'chemistry',
                'sample_type': 'Whole Blood (Heparinized)',
                'description': 'Measurement of physiologically active free calcium.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Ionized Calcium': {'unit': 'mmol/L', 'min': '1.10', 'max': '1.30', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Magnesium',
                'code': 'MG',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Measurement of magnesium levels.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Magnesium': {'unit': 'mmol/L', 'min': '0.75', 'max': '1.25', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Phosphorus (Inorganic)',
                'code': 'PHOS',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Measurement of phosphate levels.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Phosphorus': {'unit': 'mmol/L', 'min': '0.80', 'max': '1.50', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Lactate Dehydrogenase (LDH)',
                'code': 'LDH',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Enzyme found in almost all body tissues; marker for cell damage.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'LDH': {'unit': 'U/L', 'min': '140', 'max': '280', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Creatine Kinase (CK)',
                'code': 'CK',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Enzyme found in muscles and brain.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'CK (Total)': {'unit': 'U/L', 'min': '10', 'max': '200', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Troponin I',
                'code': 'TROP-I',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Cardiac specific marker for myocardial infarction.',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Troponin I': {'unit': 'ng/mL', 'min': '0.00', 'max': '0.04', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Troponin T',
                'code': 'TROP-T',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Cardiac specific marker for myocardial infarction.',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Troponin T': {'unit': 'ng/mL', 'min': '0.00', 'max': '0.014', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CK-MB Isoenzyme',
                'code': 'CK-MB',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Cardiac specific isoenzyme of Creatine Kinase.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'CK-MB': {'unit': 'ng/mL', 'min': '0', 'max': '10.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'High-Sensitivity CRP (hs-CRP)',
                'code': 'HS-CRP',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'High sensitivity assay for Cardiovascular risk assessment.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'hs-CRP': {'unit': 'mg/L', 'min': '0.0', 'max': '3.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Iron Studies Panel',
                'code': 'IRON-STUDIES',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Iron, Ferritin, and Transferrin levels to assess iron status.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    '_order': ['Iron', 'Ferritin', 'Transferrin'],
                    'Iron': {'unit': 'umol/L', 'min': '9.0', 'max': '30.0', 'dataType': 'numeric', 'required': True},
                    'Ferritin': {'unit': 'ug/L', 'min': '15', 'max': '300', 'dataType': 'numeric', 'required': True},
                    'Transferrin': {'unit': 'g/L', 'min': '2.0', 'max': '3.6', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Amylase',
                'code': 'AMYLASE',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Digestive enzyme; marker for pancreatitis.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Amylase': {'unit': 'U/L', 'min': '28', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Lipase',
                'code': 'LIPASE',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Digestive enzyme; marker for pancreatitis.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Lipase': {'unit': 'U/L', 'min': '0', 'max': '160', 'dataType': 'numeric', 'required': True},
                }
            },

            # ENDOCRINE & THYROID
            {
                'name': 'Thyroid Function Test (TFT)',
                'code': 'TFT',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Basic thyroid panel (TSH and Free T4).',
                'turnaround_time': '4 hours',
                'normal_range': {
                    '_order': ['TSH', 'Free T4'],
                    'TSH': {'unit': 'mIU/L', 'min': '0.4', 'max': '4.5', 'dataType': 'numeric', 'required': True},
                    'Free T4': {'unit': 'pmol/L', 'min': '10.0', 'max': '23.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Free T3 (Triiodothyronine)',
                'code': 'T3-FREE',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Active form of thyroid hormone.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Free T3': {'unit': 'pmol/L', 'min': '3.5', 'max': '6.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Testosterone (Total)',
                'code': 'TESTO-T',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Measurement of total testosterone.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    '_order': ['Testosterone (Male)', 'Testosterone (Female)'],
                    'Testosterone (Male)': {'unit': 'nmol/L', 'min': '10.0', 'max': '30.0', 'dataType': 'numeric', 'required': True},
                    'Testosterone (Female)': {'unit': 'nmol/L', 'min': '0.5', 'max': '2.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'FSH & LH',
                'code': 'FSH-LH',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Follicle Stimulating Hormone and Luteinizing Hormone.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    '_order': ['FSH', 'LH'],
                    'FSH': {'unit': 'IU/L', 'min': '3.5', 'max': '12.5', 'dataType': 'numeric', 'required': True},
                    'LH': {'unit': 'IU/L', 'min': '2.4', 'max': '12.6', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Prolactin',
                'code': 'PRL',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Pituitary hormone responsible for milk production.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Prolactin': {'unit': 'mIU/L', 'min': '100', 'max': '500', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Estradiol (E2)',
                'code': 'E2',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Primary estrogen in women of reproductive age.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Estradiol': {'unit': 'pmol/L', 'min': '46', 'max': '607', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Progesterone',
                'code': 'PROG',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Hormone involved in menstrual cycle and pregnancy.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Progesterone': {'unit': 'nmol/L', 'min': '', 'max': '', 'range': 'Phase-dependent (follicular vs luteal / pregnancy)', 'dataType': 'numeric', 'required': True}, # Highly variable by phase
                }
            },
            {
                'name': 'Vitamin D (25-Hydroxy)',
                'code': 'VIT-D',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Measurement of Vitamin D status.',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Vitamin D (25-OH)': {'unit': 'nmol/L', 'min': '50', 'max': '125', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Cortisol (AM)',
                'code': 'CORT-AM',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Morning cortisol level.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Cortisol': {'unit': 'nmol/L', 'min': '170', 'max': '540', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Insulin (Fasting)',
                'code': 'INSULIN',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Fasting insulin level for diabetes resistance assessment.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Insulin': {'unit': 'mIU/L', 'min': '2.0', 'max': '20.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'C-Peptide',
                'code': 'C-PEP',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Marker of endogenous insulin production.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'C-Peptide': {'unit': 'ng/mL', 'min': '0.5', 'max': '2.0', 'dataType': 'numeric', 'required': True},
                }
            },

            # IMMUNOLOGY & AUTOIMMUNITY
            {
                'name': 'Rheumatoid Factor (RF)',
                'code': 'RF',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Autoantibody used in diagnosis of Rheumatoid Arthritis.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'RF': {'unit': 'IU/mL', 'min': '0', 'max': '14', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anti-CCP',
                'code': 'CCP',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Cyclic Citrullinated Peptide Antibody (specific for RA).',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Anti-CCP': {'unit': 'U/mL', 'min': '0', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'ANA Screen',
                'code': 'ANA',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Antinuclear Antibody screen for autoimmune diseases.',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'ANA': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'CRP (Quantitative)',
                'code': 'CRP',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'C-Reactive Protein - Inflammation marker.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'CRP': {'unit': 'mg/L', 'min': '0', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                }
            },

            # TUMOR MARKERS
            {
                'name': 'PSA (Total)',
                'code': 'PSA',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Prostate Specific Antigen.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'PSA': {'unit': 'ng/mL', 'min': '0', 'max': '4.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Pap Smear (Cervical Cytology)',
                'code': 'PAP-SMEAR',
                'category': 'cytology',
                'sample_type': 'Cervical smear',
                'description': 'Cervical cytology screening (Pap smear).',
                'turnaround_time': '3 days',
                'normal_range': {
                    'Result': {
                        'unit': '',
                        'range': 'Negative / report cytology findings',
                        'dataType': 'text',
                        'required': True,
                    }
                }
            },
            {
                'name': 'CEA',
                'code': 'CEA',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Carcinoembryonic Antigen.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'CEA': {'unit': 'ng/mL', 'min': '0', 'max': '3.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'AFP',
                'code': 'AFP',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Alpha-fetoprotein.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'AFP': {'unit': 'ng/mL', 'min': '0', 'max': '10.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CA 19-9',
                'code': 'CA19-9',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Carbohydrate Antigen 19-9.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'CA 19-9': {'unit': 'U/mL', 'min': '0', 'max': '37.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CA 125',
                'code': 'CA125',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Cancer Antigen 125.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'CA 125': {'unit': 'U/mL', 'min': '0', 'max': '35.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Beta-hCG (Quantitative)',
                'code': 'BHCG-Q',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Quantitative Beta-hCG for pregnancy monitoring or tumor marker.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Beta-hCG': {'unit': 'mIU/mL', 'min': '0', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                }
            },

            # INFECTIOUS DISEASE / MOLECULAR
            {
                'name': 'HIV Ag/Ab Combo (4th Gen)',
                'code': 'HIV-4TH',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'HIV Antigen and Antibody 4th Generation Combo.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'HIV 1/2 Ag/Ab': {'unit': '', 'range': 'Non-Reactive', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Hepatitis B Surface Antibody (Anti-HBs)',
                'code': 'ANTI-HBS',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Antibody indicating immunity to Hepatitis B.',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Anti-HBs': {'unit': 'mIU/mL', 'min': '10', 'max': '', 'range': '>10 Immune', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'SARS-CoV-2 (COVID-19) PCR',
                'code': 'COVID-PCR',
                'category': 'molecular',
                'sample_type': 'Nasopharyngeal Swab',
                'description': 'Real-time PCR detection of SARS-CoV-2 RNA.',
                'turnaround_time': '6 hours',
                'normal_range': {
                    'Result': {'unit': '', 'range': 'Not Detected', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'SARS-CoV-2 Antibody (Total)',
                'code': 'COVID-AB',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Detection of antibodies to SARS-CoV-2.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Result': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },

            # URINALYSIS (Additions)
            {
                'name': 'Urine Microalbumin',
                'code': 'U-MICRO',
                'category': 'urinalysis',
                'sample_type': 'Urine (Random)',
                'description': 'Detection of small amounts of albumin in urine.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Microalbumin': {'unit': 'mg/L', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': '24-Hour Urine Protein',
                'code': 'U-PROT-24',
                'category': 'urinalysis',
                'sample_type': 'Urine (24hr)',
                'description': 'Total protein in 24-hour urine collection.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Total Protein': {'unit': 'mg/24hr', 'min': '0', 'max': '150', 'dataType': 'numeric', 'required': True},
                }
            },

            # ENDOCRINE & THYROID (24 items)
            {
                'name': 'Total T4 (Thyroxine)',
                'code': 'T4-T',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Total Thyroxine measurement.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Total T4': {'unit': 'nmol/L', 'min': '64.0', 'max': '154.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Total T3 (Triiodothyronine)',
                'code': 'T3-T',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Total Triiodothyronine measurement.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Total T3': {'unit': 'nmol/L', 'min': '1.3', 'max': '2.6', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Reverse T3',
                'code': 'R-T3',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Inactive form of T3; marker for stress/conversion issues.',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Reverse T3': {'unit': 'nmol/L', 'min': '0.10', 'max': '0.40', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anti-Thyroglobulin Antibody (Anti-Tg)',
                'code': 'ANTI-TG',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Autoantibody associated with autoimmune thyroid disease.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Anti-Tg': {'unit': 'IU/mL', 'min': '0', 'max': '4.0', 'range': '< 4.0', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Anti-Thyroid Peroxidase (Anti-TPO)',
                'code': 'ANTI-TPO',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Autoantibody associated with Hashimoto\'s thyroiditis.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Anti-TPO': {'unit': 'IU/mL', 'min': '0', 'max': '5.0', 'range': '< 5.0', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'TSH Receptor Antibody (TRAb)',
                'code': 'TRAB',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Antibody associated with Graves\' disease.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'TRAb': {'unit': 'IU/L', 'min': '0', 'max': '1.75', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Calcitonin',
                'code': 'CALC',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Marker for medullary thyroid cancer.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Calcitonin': {'unit': 'pg/mL', 'min': '0', 'max': '8.8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'ACTH (Adrenocorticotropic Hormone)',
                'code': 'ACTH',
                'category': 'endocrinology',
                'sample_type': 'EDTA Plasma',
                'description': 'Pituitary hormone regulating cortisol.',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'ACTH': {'unit': 'pg/mL', 'min': '7.2', 'max': '63.3', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Aldosterone',
                'code': 'ALDO',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Hormone regulating blood pressure and sodium.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'Aldosterone': {'unit': 'ng/dL', 'min': '3.0', 'max': '16.0', 'dataType': 'numeric', 'required': True}, # Upright range
                }
            },
            {
                'name': 'Renin (Direct)',
                'code': 'RENIN',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Enzyme involved in blood pressure regulation.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'Renin': {'unit': 'ng/mL/hr', 'min': '0.5', 'max': '3.3', 'dataType': 'numeric', 'required': True}, # Upright
                }
            },
            {
                'name': 'DHEA-Sulfate (DHEA-S)',
                'code': 'DHEAS',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Adrenal androgen.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    '_order': ['DHEA-S (Male)', 'DHEA-S (Female)'],
                    'DHEA-S (Male)': {'unit': 'umol/L', 'min': '5.2', 'max': '8.7', 'dataType': 'numeric', 'required': True},
                    'DHEA-S (Female)': {'unit': 'umol/L', 'min': '2.1', 'max': '7.6', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Androstenedione',
                'code': 'ANDRO',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Precursor to sex hormones.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'Androstenedione': {'unit': 'nmol/L', 'min': '0.5', 'max': '3.1', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Proinsulin',
                'code': 'PROINS',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Precursor to insulin.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'Proinsulin': {'unit': 'pmol/L', 'min': '0', 'max': '18.8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Glucagon',
                'code': 'GLUCAG',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Hormone that raises blood sugar.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'Glucagon': {'unit': 'ng/L', 'min': '0', 'max': '80', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'PTH (Parathyroid Hormone)',
                'code': 'PTH',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Regulates calcium and phosphate.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'PTH': {'unit': 'pg/mL', 'min': '15.0', 'max': '65.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'PTH-Related Peptide (PTHrP)',
                'code': 'PTHrP',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Marker for humoral hypercalcemia of malignancy.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'PTHrP': {'unit': 'pmol/L', 'min': '0', 'max': '2.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': '1,25-Dihydroxy Vitamin D',
                'code': 'VIT-D-125',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Active form of Vitamin D.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'Vit D 1,25': {'unit': 'pg/mL', 'min': '19.0', 'max': '79.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Estrone (E1)',
                'code': 'E1',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Form of estrogen.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'Estrone': {'unit': 'pg/mL', 'min': '17.0', 'max': '200.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Estriol (E3 - Pregnancy)',
                'code': 'E3',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Form of estrogen prominent in pregnancy.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'Estriol': {'unit': 'ng/mL', 'min': '', 'max': '', 'range': 'Gestational age–dependent (use trimester chart)', 'dataType': 'numeric', 'required': True}, # Variable by gestation
                }
            },
            {
                'name': 'Bioavailable Testosterone',
                'code': 'TESTO-BIO',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Free and loosely albumin-bound testosterone.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Bioavailable T': {'unit': 'nmol/L', 'min': '3.0', 'max': '11.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'SHBG (Sex Hormone Binding Globulin)',
                'code': 'SHBG',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Carrier protein for sex hormones.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'SHBG': {'unit': 'nmol/L', 'min': '18.3', 'max': '54.1', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anti-Müllerian Hormone (AMH)',
                'code': 'AMH',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Marker of ovarian reserve.',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'AMH': {'unit': 'ng/mL', 'min': '0.9', 'max': '9.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Growth Hormone (GH)',
                'code': 'GH',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Pituitary hormone for growth.',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'GH': {'unit': 'ng/mL', 'min': '0', 'max': '1.0', 'dataType': 'numeric', 'required': True}, # Adult fasting
                }
            },
            {
                'name': 'IGF-1 (Insulin-like Growth Factor 1)',
                'code': 'IGF1',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Mediator of growth hormone.',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'IGF-1': {'unit': 'ng/mL', 'min': '115', 'max': '307', 'dataType': 'numeric', 'required': True}, # Adult range
                }
            },

            # IMMUNOLOGY (4 items)
            {
                'name': 'Immunoglobulin Profile (IgG, IgA, IgM)',
                'code': 'IG-PROFILE',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Levels of major immune antibodies.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    '_order': ['IgG', 'IgA', 'IgM'],
                    'IgG': {'unit': 'g/L', 'min': '6.0', 'max': '16.0', 'dataType': 'numeric', 'required': True},
                    'IgA': {'unit': 'g/L', 'min': '0.8', 'max': '3.5', 'dataType': 'numeric', 'required': True},
                    'IgM': {'unit': 'g/L', 'min': '0.4', 'max': '2.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Immunoglobulin E (Total IgE)',
                'code': 'IGE',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Allergy marker.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Total IgE': {'unit': 'IU/mL', 'min': '0', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'ANCA (C & P)',
                'code': 'ANCA',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Anti-Neutrophil Cytoplasmic Antibodies for vasculitis.',
                'turnaround_time': '24 hours',
                'normal_range': {
                    '_order': ['p-ANCA (MPO)', 'c-ANCA (PR3)'],
                    'p-ANCA (MPO)': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'c-ANCA (PR3)': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Complement C3 & C4',
                'code': 'C3C4',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Complement system proteins.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    '_order': ['C3', 'C4'],
                    'C3': {'unit': 'g/L', 'min': '0.90', 'max': '1.80', 'dataType': 'numeric', 'required': True},
                    'C4': {'unit': 'g/L', 'min': '0.10', 'max': '0.40', 'dataType': 'numeric', 'required': True},
                }
            },

            # INFECTIOUS DISEASE SEROLOGY (10 items)
            {
                'name': 'HIV Viral Load',
                'code': 'HIV-VL',
                'category': 'molecular',
                'sample_type': 'EDTA Plasma',
                'description': 'Quantitative HIV RNA monitoring.',
                'turnaround_time': '3 days',
                'normal_range': {
                    'HIV RNA': {'unit': 'cp/mL', 'min': '', 'max': '20', 'range': 'Not Detected', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Hepatitis B Core Antibody (Anti-HBc)',
                'code': 'ANTI-HBC',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Antibody to HBc antigen (indicates past or ongoing infection).',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Anti-HBc': {'unit': '', 'range': 'Non-Reactive', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Hepatitis C RNA (Quantitative)',
                'code': 'HCV-RNA',
                'category': 'molecular',
                'sample_type': 'EDTA Plasma',
                'description': 'HCV Viral load monitoring.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'HCV RNA': {'unit': 'IU/mL', 'min': '', 'max': '15', 'range': 'Not Detected', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'EBV Panel (VCA IgM/IgG, EBNA)',
                'code': 'EBV',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Epstein-Barr Virus antibody panel.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    '_order': ['EBV VCA IgM', 'EBV VCA IgG', 'EBV EBNA IgG'],
                    'EBV VCA IgM': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'EBV VCA IgG': {'unit': '', 'range': 'Negative/Positive', 'dataType': 'text', 'required': True},
                    'EBV EBNA IgG': {'unit': '', 'range': 'Negative/Positive', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'CMV PCR (Cytomegalovirus)',
                'code': 'CMV-PCR',
                'category': 'molecular',
                'sample_type': 'Whole Blood or Plasma',
                'description': 'CMV DNA quantification.',
                'turnaround_time': '3 days',
                'normal_range': {
                    'CMV DNA': {'unit': 'cp/mL', 'min': '', 'max': '200', 'range': 'Not Detected', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'HSV 1 & 2 IgG/IgM',
                'code': 'HSV',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Herpes Simplex Virus antibodies.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    '_order': ['HSV 1 IgG', 'HSV 1 IgM', 'HSV 2 IgG', 'HSV 2 IgM'],
                    'HSV 1 IgG': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'HSV 1 IgM': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'HSV 2 IgG': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'HSV 2 IgM': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Measles (Rubeola) IgG',
                'code': 'MEASLES',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Measles immunity status.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Measles IgG': {'unit': '', 'range': 'Immune / Positive', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Mumps IgG',
                'code': 'MUMPS',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Mumps immunity status.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Mumps IgG': {'unit': '', 'range': 'Immune / Positive', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Rubella IgG',
                'code': 'RUBELLA',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Rubella immunity status.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Rubella IgG': {'unit': '', 'range': 'Immune / Positive', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Toxoplasma gondii IgG/IgM',
                'code': 'TOXO',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Toxoplasmosis antibodies.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    '_order': ['Toxo IgG', 'Toxo IgM'],
                    'Toxo IgG': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Toxo IgM': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },

            # SPECIALIZED CHEMISTRY (6 items)
            {
                'name': 'Apolipoprotein B',
                'code': 'APO-B',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Cardiovascular risk marker.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Apo B': {'unit': 'g/L', 'min': '0.50', 'max': '1.20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Myoglobin',
                'code': 'MYO',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Early marker for muscle damage.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Myoglobin': {'unit': 'ng/mL', 'min': '0', 'max': '110', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Serum Protein Electrophoresis (SPEP)',
                'code': 'SPEP',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Separation of serum proteins (Albumin, Alpha, Beta, Gamma fractions).',
                'turnaround_time': '24 hours',
                'normal_range': {
                    '_order': ['Albumin %', 'Alpha-1 %', 'Alpha-2 %', 'Beta %', 'Gamma %'],
                    'Albumin %': {'unit': '%', 'min': '54', 'max': '66', 'dataType': 'numeric', 'required': True},
                    'Alpha-1 %': {'unit': '%', 'min': '2', 'max': '4', 'dataType': 'numeric', 'required': True},
                    'Alpha-2 %': {'unit': '%', 'min': '6', 'max': '12', 'dataType': 'numeric', 'required': True},
                    'Beta %': {'unit': '%', 'min': '8', 'max': '15', 'dataType': 'numeric', 'required': True},
                    'Gamma %': {'unit': '%', 'min': '12', 'max': '24', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Ammonia',
                'code': 'AMM',
                'category': 'chemistry',
                'sample_type': 'EDTA Plasma (on ice)',
                'description': 'Ammonia level; marker for hepatic encephalopathy.',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Ammonia': {'unit': 'umol/L', 'min': '10', 'max': '47', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Ceruloplasmin',
                'code': 'CERU',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Copper carrier protein; used in Wilson\'s disease evaluation.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'Ceruloplasmin': {'unit': 'mg/dL', 'min': '20.0', 'max': '60.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Alpha-1 Antitrypsin',
                'code': 'A1AT',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Protease inhibitor; deficiency causes lung/liver disease.',
                'turnaround_time': '7 days',
                'normal_range': {
                    'A1AT': {'unit': 'mg/dL', 'min': '90', 'max': '200', 'dataType': 'numeric', 'required': True},
                }
            },

            # TUMOR MARKERS (3 items)
            {
                'name': 'CA 15-3',
                'code': 'CA15-3',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Marker for breast cancer monitoring.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'CA 15-3': {'unit': 'U/mL', 'min': '0', 'max': '30.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CA 27-29',
                'code': 'CA27-29',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Marker for breast cancer monitoring.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'CA 27-29': {'unit': 'U/mL', 'min': '0', 'max': '38.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Thyroglobulin (Tg)',
                'code': 'TG',
                'category': 'tumor_markers',
                'sample_type': 'Serum',
                'description': 'Marker for thyroid cancer recurrence.',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Thyroglobulin': {'unit': 'ng/mL', 'min': '0', 'max': '33.0', 'dataType': 'numeric', 'required': True},
                }
            },

            # URINALYSIS (4 items)
            {
                'name': 'Urine Albumin-to-Creatinine Ratio (UACR)',
                'code': 'UACR',
                'category': 'urinalysis',
                'sample_type': 'Urine (Random)',
                'description': 'Ratio of albumin to creatinine in urine for early kidney damage.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'UACR': {'unit': 'mg/g', 'min': '0', 'max': '30', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Urine Protein-to-Creatinine Ratio (UPCR)',
                'code': 'UPCR',
                'category': 'urinalysis',
                'sample_type': 'Urine (Random)',
                'description': 'Ratio of protein to creatinine in urine.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'UPCR': {'unit': 'mg/g', 'min': '0', 'max': '150', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': '24-Hour Urine Creatinine & Clearance',
                'code': 'U-CLEAR',
                'category': 'urinalysis',
                'sample_type': 'Urine (24hr)',
                'description': 'Creatinine clearance test for glomerular filtration rate.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    '_order': ['24hr Creatinine', 'Creatinine Clearance'],
                    '24hr Creatinine': {'unit': 'mmol/day', 'min': '9', 'max': '18', 'dataType': 'numeric', 'required': True},
                    'Creatinine Clearance': {'unit': 'mL/min', 'min': '85', 'max': '', 'range': '≥85 typical (24h collection quality-dependent)', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Urine Electrolytes',
                'code': 'U-ELEC',
                'category': 'urinalysis',
                'sample_type': 'Urine (24hr)',
                'description': 'Sodium, Potassium, and Chloride in urine.',
                'turnaround_time': '2 hours',
                'normal_range': {
                    '_order': ['Urine Na', 'Urine K', 'Urine Cl'],
                    'Urine Na': {'unit': 'mmol/24hr', 'min': '40', 'max': '220', 'dataType': 'numeric', 'required': True},
                    'Urine K': {'unit': 'mmol/24hr', 'min': '25', 'max': '125', 'dataType': 'numeric', 'required': True},
                    'Urine Cl': {'unit': 'mmol/24hr', 'min': '110', 'max': '250', 'dataType': 'numeric', 'required': True},
                }
            },

            # ENDOCRINE - Missing IGFBP-3
            {
                'name': 'IGFBP-3',
                'code': 'IGFBP3',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Insulin-like Growth Factor Binding Protein 3; carrier protein for IGF-1.',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'IGFBP-3': {'unit': 'mg/L', 'min': '2.0', 'max': '4.0', 'dataType': 'numeric', 'required': True}, # Adult range
                }
            },
            # HEMATOLOGY - Standalone Hematocrit (List Item #5)
            {
                'name': 'Hematocrit (Hct)',
                'code': 'HCT',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Standalone Hematocrit measurement.',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    '_order': ['Hct (Male)', 'Hct (Female)'],
                    'Hct (Male)': {'unit': '%', 'min': '40.0', 'max': '54.0', 'dataType': 'numeric', 'required': True},
                    'Hct (Female)': {'unit': '%', 'min': '35.0', 'max': '47.0', 'dataType': 'numeric', 'required': True},
                }
            },
            # HEMATOLOGY - Standalone Platelet Count (List Item #6)
            {
                'name': 'Platelet Count',
                'code': 'PLT',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Standalone Platelet count measurement.',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Platelets': {'unit': '10^3/µL', 'min': '150', 'max': '400', 'critical_min': '50', 'critical_max': '1000', 'dataType': 'numeric', 'required': True},
                }
            },
        ]

        created_count = 0
        updated_count = 0

        for template_data in templates_data:
            canonical_name = self._canonical_template_name(
                template_data['name'],
                template_data['code'],
            )
            template, created = LabTemplate.objects.update_or_create(
                code=template_data['code'],
                defaults={
                    'name': canonical_name,
                    'category': template_data.get('category', 'chemistry'),
                    'sample_type': template_data['sample_type'],
                    'description': template_data.get('description', ''),
                    'normal_range': template_data.get('normal_range', {}),
                    'turnaround_time': template_data.get('turnaround_time', ''),
                    'is_active': True,
                },
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Created: {template.name} ({template.code})'))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(f'Updated: {template.name} ({template.code})'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Seeding complete!\n'
            f'  Created: {created_count} templates\n'
            f'  Updated: {updated_count} templates\n'
            f'  Seeded: {len(templates_data)} template definitions'
        ))
