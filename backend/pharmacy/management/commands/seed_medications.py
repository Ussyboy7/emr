"""
Django management command to seed the database with 107 common medications.
Run with: python manage.py seed_medications
"""
from django.core.management.base import BaseCommand
from pharmacy.models import Medication


class Command(BaseCommand):
    help = 'Seed the database with 107 common medications'

    def handle(self, *args, **options):
        medications_data = [
            # Diabetes Medications
            {'name': 'Metformin 500mg', 'generic_name': 'Metformin', 'code': 'MET-500', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
            {'name': 'Metformin 850mg', 'generic_name': 'Metformin', 'code': 'MET-850', 'unit': 'tablet', 'strength': '850mg', 'form': 'tablet'},
            {'name': 'Glibenclamide 5mg', 'generic_name': 'Glibenclamide', 'code': 'GLB-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            {'name': 'Gliclazide 80mg', 'generic_name': 'Gliclazide', 'code': 'GLC-80', 'unit': 'tablet', 'strength': '80mg', 'form': 'tablet'},
            {'name': 'Insulin Glargine 100IU/ml', 'generic_name': 'Insulin Glargine', 'code': 'INS-GLAR', 'unit': 'ml', 'strength': '100IU/ml', 'form': 'injection'},
            {'name': 'Insulin Regular 100IU/ml', 'generic_name': 'Insulin Regular', 'code': 'INS-REG', 'unit': 'ml', 'strength': '100IU/ml', 'form': 'injection'},
            
            # Cardiovascular Medications
            {'name': 'Amlodipine 5mg', 'generic_name': 'Amlodipine', 'code': 'AML-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            {'name': 'Amlodipine 10mg', 'generic_name': 'Amlodipine', 'code': 'AML-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Lisinopril 5mg', 'generic_name': 'Lisinopril', 'code': 'LIS-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            {'name': 'Lisinopril 10mg', 'generic_name': 'Lisinopril', 'code': 'LIS-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Enalapril 5mg', 'generic_name': 'Enalapril', 'code': 'ENA-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            {'name': 'Enalapril 10mg', 'generic_name': 'Enalapril', 'code': 'ENA-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Atenolol 50mg', 'generic_name': 'Atenolol', 'code': 'ATE-50', 'unit': 'tablet', 'strength': '50mg', 'form': 'tablet'},
            {'name': 'Atenolol 100mg', 'generic_name': 'Atenolol', 'code': 'ATE-100', 'unit': 'tablet', 'strength': '100mg', 'form': 'tablet'},
            {'name': 'Propranolol 40mg', 'generic_name': 'Propranolol', 'code': 'PRO-40', 'unit': 'tablet', 'strength': '40mg', 'form': 'tablet'},
            {'name': 'Furosemide 40mg', 'generic_name': 'Furosemide', 'code': 'FUR-40', 'unit': 'tablet', 'strength': '40mg', 'form': 'tablet'},
            {'name': 'Hydrochlorothiazide 25mg', 'generic_name': 'Hydrochlorothiazide', 'code': 'HCT-25', 'unit': 'tablet', 'strength': '25mg', 'form': 'tablet'},
            {'name': 'Methyldopa 250mg', 'generic_name': 'Methyldopa', 'code': 'METD-250', 'unit': 'tablet', 'strength': '250mg', 'form': 'tablet'},
            {'name': 'Nifedipine 10mg', 'generic_name': 'Nifedipine', 'code': 'NIF-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Atorvastatin 10mg', 'generic_name': 'Atorvastatin', 'code': 'ATO-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Atorvastatin 20mg', 'generic_name': 'Atorvastatin', 'code': 'ATO-20', 'unit': 'tablet', 'strength': '20mg', 'form': 'tablet'},
            {'name': 'Simvastatin 20mg', 'generic_name': 'Simvastatin', 'code': 'SIM-20', 'unit': 'tablet', 'strength': '20mg', 'form': 'tablet'},
            {'name': 'Clopidogrel 75mg', 'generic_name': 'Clopidogrel', 'code': 'CLO-75', 'unit': 'tablet', 'strength': '75mg', 'form': 'tablet'},
            {'name': 'Aspirin 75mg', 'generic_name': 'Aspirin', 'code': 'ASP-75', 'unit': 'tablet', 'strength': '75mg', 'form': 'tablet'},
            {'name': 'Aspirin 100mg', 'generic_name': 'Aspirin', 'code': 'ASP-100', 'unit': 'tablet', 'strength': '100mg', 'form': 'tablet'},
            {'name': 'Warfarin 5mg', 'generic_name': 'Warfarin', 'code': 'WAR-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            
            # Analgesics
            {'name': 'Paracetamol 500mg', 'generic_name': 'Paracetamol', 'code': 'PAR-500', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
            {'name': 'Paracetamol 1000mg', 'generic_name': 'Paracetamol', 'code': 'PAR-1000', 'unit': 'tablet', 'strength': '1000mg', 'form': 'tablet'},
            {'name': 'Ibuprofen 200mg', 'generic_name': 'Ibuprofen', 'code': 'IBU-200', 'unit': 'tablet', 'strength': '200mg', 'form': 'tablet'},
            {'name': 'Ibuprofen 400mg', 'generic_name': 'Ibuprofen', 'code': 'IBU-400', 'unit': 'tablet', 'strength': '400mg', 'form': 'tablet'},
            {'name': 'Diclofenac 50mg', 'generic_name': 'Diclofenac', 'code': 'DIC-50', 'unit': 'tablet', 'strength': '50mg', 'form': 'tablet'},
            {'name': 'Diclofenac 100mg', 'generic_name': 'Diclofenac', 'code': 'DIC-100', 'unit': 'tablet', 'strength': '100mg', 'form': 'tablet'},
            {'name': 'Naproxen 250mg', 'generic_name': 'Naproxen', 'code': 'NAP-250', 'unit': 'tablet', 'strength': '250mg', 'form': 'tablet'},
            {'name': 'Tramadol 50mg', 'generic_name': 'Tramadol', 'code': 'TRA-50', 'unit': 'tablet', 'strength': '50mg', 'form': 'tablet'},
            {'name': 'Morphine 10mg', 'generic_name': 'Morphine', 'code': 'MOR-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Codeine 30mg', 'generic_name': 'Codeine', 'code': 'COD-30', 'unit': 'tablet', 'strength': '30mg', 'form': 'tablet'},
            
            # Antibiotics
            {'name': 'Amoxicillin 250mg', 'generic_name': 'Amoxicillin', 'code': 'AMX-250', 'unit': 'capsule', 'strength': '250mg', 'form': 'capsule'},
            {'name': 'Amoxicillin 500mg', 'generic_name': 'Amoxicillin', 'code': 'AMX-500', 'unit': 'capsule', 'strength': '500mg', 'form': 'capsule'},
            {'name': 'Amoxicillin Clavulanate 625mg', 'generic_name': 'Amoxicillin Clavulanate', 'code': 'AMX-CLV-625', 'unit': 'tablet', 'strength': '625mg', 'form': 'tablet'},
            {'name': 'Azithromycin 250mg', 'generic_name': 'Azithromycin', 'code': 'AZI-250', 'unit': 'tablet', 'strength': '250mg', 'form': 'tablet'},
            {'name': 'Azithromycin 500mg', 'generic_name': 'Azithromycin', 'code': 'AZI-500', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
            {'name': 'Ciprofloxacin 250mg', 'generic_name': 'Ciprofloxacin', 'code': 'CIP-250', 'unit': 'tablet', 'strength': '250mg', 'form': 'tablet'},
            {'name': 'Ciprofloxacin 500mg', 'generic_name': 'Ciprofloxacin', 'code': 'CIP-500', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
            {'name': 'Metronidazole 200mg', 'generic_name': 'Metronidazole', 'code': 'METR-200', 'unit': 'tablet', 'strength': '200mg', 'form': 'tablet'},
            {'name': 'Metronidazole 400mg', 'generic_name': 'Metronidazole', 'code': 'METR-400', 'unit': 'tablet', 'strength': '400mg', 'form': 'tablet'},
            {'name': 'Cefuroxime 250mg', 'generic_name': 'Cefuroxime', 'code': 'CEF-250', 'unit': 'tablet', 'strength': '250mg', 'form': 'tablet'},
            {'name': 'Cefuroxime 500mg', 'generic_name': 'Cefuroxime', 'code': 'CEF-500', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
            {'name': 'Ceftriaxone 1g', 'generic_name': 'Ceftriaxone', 'code': 'CEF-TRI-1G', 'unit': 'vial', 'strength': '1g', 'form': 'injection'},
            {'name': 'Ceftriaxone 250mg', 'generic_name': 'Ceftriaxone', 'code': 'CEF-TRI-250', 'unit': 'vial', 'strength': '250mg', 'form': 'injection'},
            {'name': 'Erythromycin 250mg', 'generic_name': 'Erythromycin', 'code': 'ERY-250', 'unit': 'tablet', 'strength': '250mg', 'form': 'tablet'},
            {'name': 'Doxycycline 100mg', 'generic_name': 'Doxycycline', 'code': 'DOX-100', 'unit': 'capsule', 'strength': '100mg', 'form': 'capsule'},
            {'name': 'Tetracycline 250mg', 'generic_name': 'Tetracycline', 'code': 'TET-250', 'unit': 'capsule', 'strength': '250mg', 'form': 'capsule'},
            {'name': 'Chloramphenicol 250mg', 'generic_name': 'Chloramphenicol', 'code': 'CHL-250', 'unit': 'capsule', 'strength': '250mg', 'form': 'capsule'},
            
            # Gastrointestinal
            {'name': 'Omeprazole 20mg', 'generic_name': 'Omeprazole', 'code': 'OME-20', 'unit': 'capsule', 'strength': '20mg', 'form': 'capsule'},
            {'name': 'Pantoprazole 40mg', 'generic_name': 'Pantoprazole', 'code': 'PAN-40', 'unit': 'tablet', 'strength': '40mg', 'form': 'tablet'},
            {'name': 'Ranitidine 150mg', 'generic_name': 'Ranitidine', 'code': 'RAN-150', 'unit': 'tablet', 'strength': '150mg', 'form': 'tablet'},
            {'name': 'Famotidine 20mg', 'generic_name': 'Famotidine', 'code': 'FAM-20', 'unit': 'tablet', 'strength': '20mg', 'form': 'tablet'},
            {'name': 'Metoclopramide 10mg', 'generic_name': 'Metoclopramide', 'code': 'METO-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Domperidone 10mg', 'generic_name': 'Domperidone', 'code': 'DOM-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Loperamide 2mg', 'generic_name': 'Loperamide', 'code': 'LOP-2', 'unit': 'capsule', 'strength': '2mg', 'form': 'capsule'},
            {'name': 'Bisacodyl 5mg', 'generic_name': 'Bisacodyl', 'code': 'BIS-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            
            # Respiratory
            {'name': 'Salbutamol Inhaler 100mcg', 'generic_name': 'Salbutamol', 'code': 'SAL-INH', 'unit': 'puff', 'strength': '100mcg', 'form': 'inhaler'},
            {'name': 'Salbutamol 2mg/5ml Syrup', 'generic_name': 'Salbutamol', 'code': 'SAL-SYR', 'unit': 'ml', 'strength': '2mg/5ml', 'form': 'syrup'},
            {'name': 'Salbutamol 4mg Tablet', 'generic_name': 'Salbutamol', 'code': 'SAL-4', 'unit': 'tablet', 'strength': '4mg', 'form': 'tablet'},
            {'name': 'Beclomethasone Inhaler 50mcg', 'generic_name': 'Beclomethasone', 'code': 'BEC-INH', 'unit': 'puff', 'strength': '50mcg', 'form': 'inhaler'},
            {'name': 'Budesonide Inhaler 200mcg', 'generic_name': 'Budesonide', 'code': 'BUD-INH', 'unit': 'puff', 'strength': '200mcg', 'form': 'inhaler'},
            {'name': 'Aminophylline 100mg', 'generic_name': 'Aminophylline', 'code': 'AMI-100', 'unit': 'tablet', 'strength': '100mg', 'form': 'tablet'},
            {'name': 'Theophylline 200mg', 'generic_name': 'Theophylline', 'code': 'THE-200', 'unit': 'tablet', 'strength': '200mg', 'form': 'tablet'},
            
            # Antihistamines
            {'name': 'Cetirizine 10mg', 'generic_name': 'Cetirizine', 'code': 'CET-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Loratadine 10mg', 'generic_name': 'Loratadine', 'code': 'LOR-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Chlorpheniramine 4mg', 'generic_name': 'Chlorpheniramine', 'code': 'CHLP-4', 'unit': 'tablet', 'strength': '4mg', 'form': 'tablet'},
            {'name': 'Promethazine 25mg', 'generic_name': 'Promethazine', 'code': 'PRO-25', 'unit': 'tablet', 'strength': '25mg', 'form': 'tablet'},
            
            # Corticosteroids
            {'name': 'Prednisolone 5mg', 'generic_name': 'Prednisolone', 'code': 'PRE-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            {'name': 'Prednisolone 10mg', 'generic_name': 'Prednisolone', 'code': 'PRE-10', 'unit': 'tablet', 'strength': '10mg', 'form': 'tablet'},
            {'name': 'Dexamethasone 0.5mg', 'generic_name': 'Dexamethasone', 'code': 'DEX-0.5', 'unit': 'tablet', 'strength': '0.5mg', 'form': 'tablet'},
            {'name': 'Hydrocortisone 100mg', 'generic_name': 'Hydrocortisone', 'code': 'HYD-100', 'unit': 'vial', 'strength': '100mg', 'form': 'injection'},
            
            # Vitamins and Supplements
            {'name': 'Folic Acid 5mg', 'generic_name': 'Folic Acid', 'code': 'FOL-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            {'name': 'Ferrous Sulfate 200mg', 'generic_name': 'Ferrous Sulfate', 'code': 'FER-200', 'unit': 'tablet', 'strength': '200mg', 'form': 'tablet'},
            {'name': 'Ferrous Fumarate 300mg', 'generic_name': 'Ferrous Fumarate', 'code': 'FER-FUM-300', 'unit': 'tablet', 'strength': '300mg', 'form': 'tablet'},
            {'name': 'Vitamin B Complex', 'generic_name': 'B Vitamins', 'code': 'VIT-B', 'unit': 'tablet', 'strength': 'Standard', 'form': 'tablet'},
            {'name': 'Vitamin C 1000mg', 'generic_name': 'Ascorbic Acid', 'code': 'VIT-C-1000', 'unit': 'tablet', 'strength': '1000mg', 'form': 'tablet'},
            {'name': 'Vitamin D3 1000IU', 'generic_name': 'Cholecalciferol', 'code': 'VIT-D3', 'unit': 'tablet', 'strength': '1000IU', 'form': 'tablet'},
            {'name': 'Calcium Carbonate 500mg', 'generic_name': 'Calcium Carbonate', 'code': 'CAL-500', 'unit': 'tablet', 'strength': '500mg', 'form': 'tablet'},
            {'name': 'Zinc Sulfate 20mg', 'generic_name': 'Zinc Sulfate', 'code': 'ZIN-20', 'unit': 'tablet', 'strength': '20mg', 'form': 'tablet'},
            
            # Antimalarials
            {'name': 'Artemether Lumefantrine 20/120mg', 'generic_name': 'Artemether Lumefantrine', 'code': 'ART-LUM', 'unit': 'tablet', 'strength': '20/120mg', 'form': 'tablet'},
            {'name': 'Chloroquine 250mg', 'generic_name': 'Chloroquine', 'code': 'CHLQ-250', 'unit': 'tablet', 'strength': '250mg', 'form': 'tablet'},
            {'name': 'Quinine 300mg', 'generic_name': 'Quinine', 'code': 'QUI-300', 'unit': 'tablet', 'strength': '300mg', 'form': 'tablet'},
            {'name': 'Sulfadoxine Pyrimethamine 500/25mg', 'generic_name': 'Sulfadoxine Pyrimethamine', 'code': 'SUL-PYR', 'unit': 'tablet', 'strength': '500/25mg', 'form': 'tablet'},
            
            # Antifungals
            {'name': 'Fluconazole 150mg', 'generic_name': 'Fluconazole', 'code': 'FLU-150', 'unit': 'capsule', 'strength': '150mg', 'form': 'capsule'},
            {'name': 'Fluconazole 200mg', 'generic_name': 'Fluconazole', 'code': 'FLU-200', 'unit': 'capsule', 'strength': '200mg', 'form': 'capsule'},
            {'name': 'Ketoconazole 200mg', 'generic_name': 'Ketoconazole', 'code': 'KET-200', 'unit': 'tablet', 'strength': '200mg', 'form': 'tablet'},
            {'name': 'Nystatin 500,000IU', 'generic_name': 'Nystatin', 'code': 'NYS-500K', 'unit': 'tablet', 'strength': '500,000IU', 'form': 'tablet'},
            
            # Antivirals
            {'name': 'Acyclovir 200mg', 'generic_name': 'Acyclovir', 'code': 'ACY-200', 'unit': 'tablet', 'strength': '200mg', 'form': 'tablet'},
            {'name': 'Acyclovir 400mg', 'generic_name': 'Acyclovir', 'code': 'ACY-400', 'unit': 'tablet', 'strength': '400mg', 'form': 'tablet'},
            
            # Oncology
            {'name': 'Hydroxyurea 500mg', 'generic_name': 'Hydroxyurea', 'code': 'HYD-500', 'unit': 'capsule', 'strength': '500mg', 'form': 'capsule'},
            
            # Anticonvulsants
            {'name': 'Phenytoin 100mg', 'generic_name': 'Phenytoin', 'code': 'PHE-100', 'unit': 'capsule', 'strength': '100mg', 'form': 'capsule'},
            {'name': 'Carbamazepine 200mg', 'generic_name': 'Carbamazepine', 'code': 'CAR-200', 'unit': 'tablet', 'strength': '200mg', 'form': 'tablet'},
            {'name': 'Sodium Valproate 200mg', 'generic_name': 'Sodium Valproate', 'code': 'VAL-200', 'unit': 'tablet', 'strength': '200mg', 'form': 'tablet'},
            
            # Antipsychotics
            {'name': 'Chlorpromazine 25mg', 'generic_name': 'Chlorpromazine', 'code': 'CHLPZ-25', 'unit': 'tablet', 'strength': '25mg', 'form': 'tablet'},
            {'name': 'Haloperidol 5mg', 'generic_name': 'Haloperidol', 'code': 'HAL-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            
            # Antidepressants
            {'name': 'Amitriptyline 25mg', 'generic_name': 'Amitriptyline', 'code': 'AMI-25', 'unit': 'tablet', 'strength': '25mg', 'form': 'tablet'},
            {'name': 'Fluoxetine 20mg', 'generic_name': 'Fluoxetine', 'code': 'FLUOX-20', 'unit': 'capsule', 'strength': '20mg', 'form': 'capsule'},
            
            # Others
            {'name': 'Diazepam 5mg', 'generic_name': 'Diazepam', 'code': 'DIA-5', 'unit': 'tablet', 'strength': '5mg', 'form': 'tablet'},
            {'name': 'Lorazepam 1mg', 'generic_name': 'Lorazepam', 'code': 'LORZ-1', 'unit': 'tablet', 'strength': '1mg', 'form': 'tablet'},
            {'name': 'Digoxin 0.25mg', 'generic_name': 'Digoxin', 'code': 'DIG-0.25', 'unit': 'tablet', 'strength': '0.25mg', 'form': 'tablet'},
            {'name': 'Furosemide Injection 20mg/2ml', 'generic_name': 'Furosemide', 'code': 'FUR-INJ', 'unit': 'ml', 'strength': '20mg/2ml', 'form': 'injection'},
            {'name': 'Dexamethasone Injection 4mg/ml', 'generic_name': 'Dexamethasone', 'code': 'DEX-INJ', 'unit': 'ml', 'strength': '4mg/ml', 'form': 'injection'},
        ]

        created_count = 0
        updated_count = 0
        skipped_count = 0

        for med_data in medications_data:
            medication, created = Medication.objects.update_or_create(
                code=med_data['code'],
                defaults={
                    'name': med_data['name'],
                    'generic_name': med_data['generic_name'],
                    'unit': med_data['unit'],
                    'strength': med_data['strength'],
                    'form': med_data['form'],
                    'is_active': True,
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Created: {medication.name}'))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(f'Updated: {medication.name}'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Seeding complete!\n'
            f'  Created: {created_count} medications\n'
            f'  Updated: {updated_count} medications\n'
            f'  Total: {len(medications_data)} medications in database'
        ))

