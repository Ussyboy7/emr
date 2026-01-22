"""
Django management command to seed ICD-10 codes without affecting existing data.
"""
import os
import json
from django.core.management.base import BaseCommand
from consultation.models import ICD10Code


class Command(BaseCommand):
    help = "Seed ICD-10 codes without affecting existing data"

    def handle(self, *args, **options):
        self.stdout.write("Seeding ICD-10 codes...")

        # Common ICD-10 codes for healthcare
        icd_codes = [
            # Infectious diseases
            {"code": "A00", "description": "Cholera", "category": "Infectious Diseases"},
            {"code": "A01", "description": "Typhoid and paratyphoid fevers", "category": "Infectious Diseases"},
            {"code": "A02", "description": "Other salmonella infections", "category": "Infectious Diseases"},
            {"code": "A03", "description": "Shigellosis", "category": "Infectious Diseases"},
            {"code": "A04", "description": "Other bacterial intestinal infections", "category": "Infectious Diseases"},
            {"code": "A05", "description": "Other bacterial foodborne intoxications", "category": "Infectious Diseases"},
            {"code": "A06", "description": "Amebiasis", "category": "Infectious Diseases"},
            {"code": "A07", "description": "Other protozoal intestinal diseases", "category": "Infectious Diseases"},
            {"code": "A08", "description": "Viral and other specified intestinal infections", "category": "Infectious Diseases"},
            {"code": "A09", "description": "Infectious gastroenteritis and colitis, unspecified", "category": "Infectious Diseases"},

            # Respiratory infections
            {"code": "J00", "description": "Acute nasopharyngitis (common cold)", "category": "Respiratory"},
            {"code": "J01", "description": "Acute sinusitis", "category": "Respiratory"},
            {"code": "J02", "description": "Acute pharyngitis", "category": "Respiratory"},
            {"code": "J03", "description": "Acute tonsillitis", "category": "Respiratory"},
            {"code": "J04", "description": "Acute laryngitis and tracheitis", "category": "Respiratory"},
            {"code": "J05", "description": "Acute obstructive laryngitis and epiglottitis", "category": "Respiratory"},
            {"code": "J06", "description": "Acute upper respiratory infections of multiple and unspecified sites", "category": "Respiratory"},
            {"code": "J09", "description": "Influenza due to certain identified influenza viruses", "category": "Respiratory"},
            {"code": "J10", "description": "Influenza due to other identified influenza virus", "category": "Respiratory"},
            {"code": "J11", "description": "Influenza, virus not identified", "category": "Respiratory"},
            {"code": "J12", "description": "Viral pneumonia, not elsewhere classified", "category": "Respiratory"},
            {"code": "J13", "description": "Pneumonia due to Streptococcus pneumoniae", "category": "Respiratory"},
            {"code": "J14", "description": "Pneumonia due to Haemophilus influenzae", "category": "Respiratory"},
            {"code": "J15", "description": "Bacterial pneumonia, not elsewhere classified", "category": "Respiratory"},
            {"code": "J16", "description": "Pneumonia due to other infectious organisms", "category": "Respiratory"},
            {"code": "J17", "description": "Pneumonia in diseases classified elsewhere", "category": "Respiratory"},
            {"code": "J18", "description": "Pneumonia, unspecified organism", "category": "Respiratory"},

            # Cardiovascular diseases
            {"code": "I00", "description": "Rheumatic fever without mention of heart involvement", "category": "Cardiovascular"},
            {"code": "I01", "description": "Rheumatic fever with heart involvement", "category": "Cardiovascular"},
            {"code": "I02", "description": "Rheumatic chorea", "category": "Cardiovascular"},
            {"code": "I05", "description": "Rheumatic mitral valve diseases", "category": "Cardiovascular"},
            {"code": "I06", "description": "Rheumatic aortic valve diseases", "category": "Cardiovascular"},
            {"code": "I07", "description": "Rheumatic tricuspid valve diseases", "category": "Cardiovascular"},
            {"code": "I08", "description": "Multiple valve diseases", "category": "Cardiovascular"},
            {"code": "I09", "description": "Other rheumatic heart diseases", "category": "Cardiovascular"},
            {"code": "I10", "description": "Essential (primary) hypertension", "category": "Cardiovascular"},
            {"code": "I11", "description": "Hypertensive heart disease", "category": "Cardiovascular"},
            {"code": "I12", "description": "Hypertensive renal disease", "category": "Cardiovascular"},
            {"code": "I13", "description": "Hypertensive heart and renal disease", "category": "Cardiovascular"},
            {"code": "I15", "description": "Secondary hypertension", "category": "Cardiovascular"},
            {"code": "I20", "description": "Angina pectoris", "category": "Cardiovascular"},
            {"code": "I21", "description": "Acute myocardial infarction", "category": "Cardiovascular"},
            {"code": "I22", "description": "Subsequent myocardial infarction", "category": "Cardiovascular"},
            {"code": "I23", "description": "Certain current complications following acute myocardial infarction", "category": "Cardiovascular"},
            {"code": "I24", "description": "Other acute ischemic heart diseases", "category": "Cardiovascular"},
            {"code": "I25", "description": "Chronic ischemic heart disease", "category": "Cardiovascular"},

            # Endocrine diseases
            {"code": "E00", "description": "Congenital iodine-deficiency syndrome", "category": "Endocrine"},
            {"code": "E01", "description": "Iodine-deficiency related thyroid disorders and allied conditions", "category": "Endocrine"},
            {"code": "E02", "description": "Subclinical iodine-deficiency hypothyroidism", "category": "Endocrine"},
            {"code": "E03", "description": "Other hypothyroidism", "category": "Endocrine"},
            {"code": "E04", "description": "Other nontoxic goiter", "category": "Endocrine"},
            {"code": "E05", "description": "Thyrotoxicosis (hyperthyroidism)", "category": "Endocrine"},
            {"code": "E06", "description": "Thyroiditis", "category": "Endocrine"},
            {"code": "E07", "description": "Other disorders of thyroid", "category": "Endocrine"},
            {"code": "E08", "description": "Diabetes mellitus due to underlying condition", "category": "Endocrine"},
            {"code": "E09", "description": "Drug or chemical induced diabetes mellitus", "category": "Endocrine"},
            {"code": "E10", "description": "Type 1 diabetes mellitus", "category": "Endocrine"},
            {"code": "E11", "description": "Type 2 diabetes mellitus", "category": "Endocrine"},
            {"code": "E12", "description": "Malnutrition-related diabetes mellitus", "category": "Endocrine"},
            {"code": "E13", "description": "Other specified diabetes mellitus", "category": "Endocrine"},
            {"code": "E14", "description": "Unspecified diabetes mellitus", "category": "Endocrine"},

            # Mental health
            {"code": "F10", "description": "Mental and behavioural disorders due to alcohol", "category": "Mental Health"},
            {"code": "F11", "description": "Mental and behavioural disorders due to opioids", "category": "Mental Health"},
            {"code": "F12", "description": "Mental and behavioural disorders due to cannabinoids", "category": "Mental Health"},
            {"code": "F13", "description": "Mental and behavioural disorders due to sedatives or hypnotics", "category": "Mental Health"},
            {"code": "F14", "description": "Mental and behavioural disorders due to cocaine", "category": "Mental Health"},
            {"code": "F15", "description": "Mental and behavioural disorders due to other stimulants", "category": "Mental Health"},
            {"code": "F16", "description": "Mental and behavioural disorders due to hallucinogens", "category": "Mental Health"},
            {"code": "F17", "description": "Mental and behavioural disorders due to tobacco", "category": "Mental Health"},
            {"code": "F18", "description": "Mental and behavioural disorders due to volatile solvents", "category": "Mental Health"},
            {"code": "F19", "description": "Mental and behavioural disorders due to multiple drug use", "category": "Mental Health"},
            {"code": "F20", "description": "Schizophrenia", "category": "Mental Health"},
            {"code": "F21", "description": "Schizotypal disorder", "category": "Mental Health"},
            {"code": "F22", "description": "Persistent delusional disorders", "category": "Mental Health"},
            {"code": "F23", "description": "Acute and transient psychotic disorders", "category": "Mental Health"},
            {"code": "F24", "description": "Induced delusional disorder", "category": "Mental Health"},
            {"code": "F25", "description": "Schizoaffective disorders", "category": "Mental Health"},
            {"code": "F28", "description": "Other nonorganic psychotic disorders", "category": "Mental Health"},
            {"code": "F29", "description": "Unspecified nonorganic psychosis", "category": "Mental Health"},
            {"code": "F30", "description": "Manic episode", "category": "Mental Health"},
            {"code": "F31", "description": "Bipolar affective disorder", "category": "Mental Health"},
            {"code": "F32", "description": "Depressive episode", "category": "Mental Health"},
            {"code": "F33", "description": "Recurrent depressive disorder", "category": "Mental Health"},
            {"code": "F34", "description": "Persistent mood (affective) disorders", "category": "Mental Health"},
            {"code": "F38", "description": "Other mood (affective) disorders", "category": "Mental Health"},
            {"code": "F39", "description": "Unspecified mood (affective) disorder", "category": "Mental Health"},

            # Injuries and poisoning
            {"code": "S00", "description": "Superficial injury of head", "category": "Injury"},
            {"code": "S01", "description": "Open wound of head", "category": "Injury"},
            {"code": "S02", "description": "Fracture of skull and facial bones", "category": "Injury"},
            {"code": "S03", "description": "Dislocation, sprain and strain of joints and ligaments of head", "category": "Injury"},
            {"code": "S04", "description": "Injury of cranial nerves", "category": "Injury"},
            {"code": "S05", "description": "Injury of eye and orbit", "category": "Injury"},
            {"code": "S06", "description": "Intracranial injury", "category": "Injury"},
            {"code": "S07", "description": "Crushing injury of head", "category": "Injury"},
            {"code": "S08", "description": "Traumatic amputation of part of head", "category": "Injury"},
            {"code": "S09", "description": "Other and unspecified injuries of head", "category": "Injury"},
        ]

        created_count = 0
        skipped_count = 0

        for icd_data in icd_codes:
            icd_code, created = ICD10Code.objects.get_or_create(
                code=icd_data["code"],
                defaults={
                    "description": icd_data["description"],
                    "category": icd_data["category"]
                }
            )
            if created:
                created_count += 1
            else:
                skipped_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"ICD-10 codes seeding completed: {created_count} created, {skipped_count} already existed"
            )
        )