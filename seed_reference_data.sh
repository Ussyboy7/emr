#!/bin/bash

# EMR Data Seeding Script
# Seeds reference/master data for laboratory, pharmacy, and radiology
# NO patient or user data is created

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${HOME}/emr_backups"
LOG_FILE="${SCRIPT_DIR}/data_seeding.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Success message
success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

# Warning message
warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

# Error message
error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE"
}

# Info message
info() {
    echo -e "${BLUE}ℹ️  $1${NC}" | tee -a "$LOG_FILE"
}

# Check if Django is available
check_django() {
    log "Checking Django availability..."
    if docker compose -f docker-compose.prod.yml exec -T backend python manage.py check > /dev/null 2>&1; then
        success "Django backend is accessible"
        return 0
    else
        error "Django backend is not accessible"
        return 1
    fi
}

# Seed laboratory data
seed_laboratory_data() {
    log "=== Seeding Laboratory Data ==="

    # Create lab test categories
    info "Creating laboratory test categories..."
    docker compose -f docker-compose.prod.yml exec -T backend python manage.py shell -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()

from laboratory.models import LabCategory

categories = [
    {'name': 'Hematology', 'description': 'Blood cell analysis and related tests'},
    {'name': 'Clinical Chemistry', 'description': 'Biochemical analysis of blood and body fluids'},
    {'name': 'Microbiology', 'description': 'Bacterial, viral, and fungal testing'},
    {'name': 'Immunology', 'description': 'Immune system and antibody testing'},
    {'name': 'Endocrinology', 'description': 'Hormone and endocrine function testing'},
    {'name': 'Toxicology', 'description': 'Drug screening and toxicology analysis'},
    {'name': 'Molecular Diagnostics', 'description': 'Genetic and molecular testing'},
    {'name': 'Histopathology', 'description': 'Tissue analysis and pathology'},
]

for cat_data in categories:
    category, created = LabCategory.objects.get_or_create(
        name=cat_data['name'],
        defaults={'description': cat_data['description']}
    )
    if created:
        print(f'Created lab category: {category.name}')
    else:
        print(f'Lab category already exists: {category.name}')
"

    # Create common lab tests
    info "Creating common laboratory tests..."
    docker compose -f docker-compose.prod.yml exec -T backend python manage.py shell -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()

from laboratory.models import LabCategory, LabTemplate

# Get categories
hematology = LabCategory.objects.get(name='Hematology')
chemistry = LabCategory.objects.get(name='Clinical Chemistry')
microbiology = LabCategory.objects.get(name='Microbiology')
immunology = LabCategory.objects.get(name='Immunology')

lab_tests = [
    # Hematology
    {'name': 'Complete Blood Count (CBC)', 'category': hematology, 'description': 'Comprehensive blood cell analysis', 'price': 2500.00, 'turnaround_days': 1},
    {'name': 'Hemoglobin', 'category': hematology, 'description': 'Blood hemoglobin concentration', 'price': 800.00, 'turnaround_days': 1},
    {'name': 'Hematocrit', 'category': hematology, 'description': 'Blood hematocrit percentage', 'price': 700.00, 'turnaround_days': 1},
    {'name': 'White Blood Cell Count', 'category': hematology, 'description': 'Total WBC count', 'price': 900.00, 'turnaround_days': 1},
    {'name': 'Platelet Count', 'category': hematology, 'description': 'Blood platelet count', 'price': 850.00, 'turnaround_days': 1},

    # Clinical Chemistry
    {'name': 'Blood Glucose (Fasting)', 'category': chemistry, 'description': 'Fasting blood glucose level', 'price': 600.00, 'turnaround_days': 1},
    {'name': 'Blood Glucose (Random)', 'category': chemistry, 'description': 'Random blood glucose level', 'price': 600.00, 'turnaround_days': 1},
    {'name': 'HbA1c', 'category': chemistry, 'description': 'Glycated hemoglobin test', 'price': 2800.00, 'turnaround_days': 2},
    {'name': 'Total Cholesterol', 'category': chemistry, 'description': 'Total blood cholesterol', 'price': 1200.00, 'turnaround_days': 1},
    {'name': 'HDL Cholesterol', 'category': chemistry, 'description': 'High-density lipoprotein cholesterol', 'price': 1000.00, 'turnaround_days': 1},
    {'name': 'LDL Cholesterol', 'category': chemistry, 'description': 'Low-density lipoprotein cholesterol', 'price': 1100.00, 'turnaround_days': 1},
    {'name': 'Triglycerides', 'category': chemistry, 'description': 'Blood triglyceride levels', 'price': 1000.00, 'turnaround_days': 1},
    {'name': 'Liver Function Test', 'category': chemistry, 'description': 'Comprehensive liver enzyme analysis', 'price': 3500.00, 'turnaround_days': 1},
    {'name': 'Kidney Function Test', 'category': chemistry, 'description': 'Renal function markers', 'price': 3000.00, 'turnaround_days': 1},
    {'name': 'Electrolyte Panel', 'category': chemistry, 'description': 'Sodium, Potassium, Chloride, Bicarbonate', 'price': 2500.00, 'turnaround_days': 1},

    # Microbiology
    {'name': 'Urine Culture', 'category': microbiology, 'description': 'Urine bacterial culture and sensitivity', 'price': 4500.00, 'turnaround_days': 3},
    {'name': 'Blood Culture', 'category': microbiology, 'description': 'Blood bacterial culture', 'price': 6000.00, 'turnaround_days': 5},
    {'name': 'Stool Culture', 'category': microbiology, 'description': 'Stool bacterial culture', 'price': 3500.00, 'turnaround_days': 3},
    {'name': 'Throat Swab Culture', 'category': microbiology, 'description': 'Throat bacterial culture', 'price': 3000.00, 'turnaround_days': 3},

    # Immunology
    {'name': 'HIV Antibody Test', 'category': immunology, 'description': 'HIV antibody screening', 'price': 2500.00, 'turnaround_days': 1},
    {'name': 'Hepatitis B Surface Antigen', 'category': immunology, 'description': 'HBsAg screening test', 'price': 2000.00, 'turnaround_days': 1},
    {'name': 'Hepatitis C Antibody', 'category': immunology, 'description': 'HCV antibody test', 'price': 2200.00, 'turnaround_days': 1},
    {'name': 'VDRL/TPHA', 'category': immunology, 'description': 'Syphilis screening test', 'price': 1800.00, 'turnaround_days': 1},
]

for test_data in lab_tests:
    test, created = LabTemplate.objects.get_or_create(
        name=test_data['name'],
        defaults={
            'category': test_data['category'],
            'description': test_data['description'],
            'price': test_data['price'],
            'turnaround_days': test_data['turnaround_days']
        }
    )
    if created:
        print(f'Created lab test: {test.name}')
    else:
        print(f'Lab test already exists: {test.name}')
"

    success "Laboratory data seeded successfully"
}

# Seed pharmacy data
seed_pharmacy_data() {
    log "=== Seeding Pharmacy Data ==="

    # Create medication categories
    info "Creating medication categories..."
    docker compose -f docker-compose.prod.yml exec -T backend python manage.py shell -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()

from pharmacy.models import MedicationCategory

categories = [
    {'name': 'Analgesics', 'description': 'Pain relief medications'},
    {'name': 'Antibiotics', 'description': 'Antimicrobial medications'},
    {'name': 'Antihypertensives', 'description': 'Blood pressure medications'},
    {'name': 'Antidiabetics', 'description': 'Diabetes medications'},
    {'name': 'Anticoagulants', 'description': 'Blood thinning medications'},
    {'name': 'Antihistamines', 'description': 'Allergy medications'},
    {'name': 'Antiemetics', 'description': 'Anti-nausea medications'},
    {'name': 'Vitamins & Supplements', 'description': 'Vitamin and nutritional supplements'},
    {'name': 'Gastrointestinal', 'description': 'Digestive system medications'},
    {'name': 'Respiratory', 'description': 'Respiratory system medications'},
]

for cat_data in categories:
    category, created = MedicationCategory.objects.get_or_create(
        name=cat_data['name'],
        defaults={'description': cat_data['description']}
    )
    if created:
        print(f'Created medication category: {category.name}')
    else:
        print(f'Medication category already exists: {category.name}')
"

    # Create common medications
    info "Creating common medications and inventory..."
    docker compose -f docker-compose.prod.yml exec -T backend python manage.py shell -c "
import os
import django
from decimal import Decimal
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()

from pharmacy.models import MedicationCategory, GenericMedication

# Get categories
analgesics = MedicationCategory.objects.get(name='Analgesics')
antibiotics = MedicationCategory.objects.get(name='Antibiotics')
antihypertensives = MedicationCategory.objects.get(name='Antihypertensives')
antidiabetics = MedicationCategory.objects.get(name='Antidiabetics')

medications = [
    # Analgesics
    {'name': 'Paracetamol', 'category': analgesics, 'strength': '500mg', 'unit': 'Tablet', 'description': 'Acetaminophen for pain and fever relief'},
    {'name': 'Ibuprofen', 'category': analgesics, 'strength': '400mg', 'unit': 'Tablet', 'description': 'NSAID for pain and inflammation'},
    {'name': 'Diclofenac', 'category': analgesics, 'strength': '50mg', 'unit': 'Tablet', 'description': 'NSAID for pain and inflammation'},
    {'name': 'Tramadol', 'category': analgesics, 'strength': '50mg', 'unit': 'Tablet', 'description': 'Opioid analgesic for moderate pain'},

    # Antibiotics
    {'name': 'Amoxicillin', 'category': antibiotics, 'strength': '500mg', 'unit': 'Capsule', 'description': 'Broad-spectrum penicillin antibiotic'},
    {'name': 'Ciprofloxacin', 'category': antibiotics, 'strength': '500mg', 'unit': 'Tablet', 'description': 'Fluoroquinolone antibiotic'},
    {'name': 'Metronidazole', 'category': antibiotics, 'strength': '400mg', 'unit': 'Tablet', 'description': 'Antiprotozoal and antibacterial'},
    {'name': 'Azithromycin', 'category': antibiotics, 'strength': '250mg', 'unit': 'Tablet', 'description': 'Macrolide antibiotic'},
    {'name': 'Cefixime', 'category': antibiotics, 'strength': '200mg', 'unit': 'Tablet', 'description': 'Third-generation cephalosporin'},

    # Antihypertensives
    {'name': 'Amlodipine', 'category': antihypertensives, 'strength': '5mg', 'unit': 'Tablet', 'description': 'Calcium channel blocker'},
    {'name': 'Lisinopril', 'category': antihypertensives, 'strength': '10mg', 'unit': 'Tablet', 'description': 'ACE inhibitor'},
    {'name': 'Losartan', 'category': antihypertensives, 'strength': '50mg', 'unit': 'Tablet', 'description': 'Angiotensin II receptor blocker'},

    # Antidiabetics
    {'name': 'Metformin', 'category': antidiabetics, 'strength': '500mg', 'unit': 'Tablet', 'description': 'Biguanide for type 2 diabetes'},
    {'name': 'Glimepiride', 'category': antidiabetics, 'strength': '2mg', 'unit': 'Tablet', 'description': 'Sulfonylurea for type 2 diabetes'},
    {'name': 'Sitagliptin', 'category': antidiabetics, 'strength': '100mg', 'unit': 'Tablet', 'description': 'DPP-4 inhibitor for type 2 diabetes'},
]

for med_data in medications:
    medication, created = GenericMedication.objects.get_or_create(
        name=med_data['name'],
        defaults={
            'category': med_data['category'],
            'strength': med_data['strength'],
            'unit': med_data['unit'],
            'description': med_data['description'],
            'min_stock_level': 50,
            'max_stock_level': 500
        }
    )
    if created:
        print(f'Created medication: {medication.name} {medication.strength}')
    else:
        print(f'Medication already exists: {medication.name}')
"

    success "Pharmacy data seeded successfully"
}

# Seed radiology data
seed_radiology_data() {
    log "=== Seeding Radiology Data ==="

    # Create radiology templates
    info "Creating radiology procedures..."
    docker compose -f docker-compose.prod.yml exec -T backend python manage.py shell -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')
django.setup()

from radiology.models import RadiologyTemplate

radiology_procedures = [
    {'name': 'Chest X-Ray PA and Lateral', 'description': 'Standard chest X-ray examination', 'price': 8500.00, 'estimated_duration': 15},
    {'name': 'Abdominal Ultrasound', 'description': 'Abdominal ultrasound scan', 'price': 12000.00, 'estimated_duration': 30},
    {'name': 'Pelvic Ultrasound', 'description': 'Pelvic ultrasound examination', 'price': 10000.00, 'estimated_duration': 25},
    {'name': 'Obstetric Ultrasound', 'description': 'Pregnancy ultrasound scan', 'price': 15000.00, 'estimated_duration': 45},
    {'name': 'Echocardiogram', 'description': 'Heart ultrasound examination', 'price': 25000.00, 'estimated_duration': 60},
    {'name': 'Carotid Doppler', 'description': 'Carotid artery Doppler ultrasound', 'price': 18000.00, 'estimated_duration': 40},
    {'name': 'Thyroid Ultrasound', 'description': 'Thyroid gland ultrasound', 'price': 9500.00, 'estimated_duration': 20},
    {'name': 'Knee X-Ray', 'description': 'Knee joint X-ray examination', 'price': 6500.00, 'estimated_duration': 10},
    {'name': 'Spine X-Ray', 'description': 'Spinal X-ray examination', 'price': 9500.00, 'estimated_duration': 15},
    {'name': 'CT Brain Plain', 'description': 'Brain CT scan without contrast', 'price': 35000.00, 'estimated_duration': 30},
    {'name': 'CT Chest', 'description': 'Chest CT scan', 'price': 45000.00, 'estimated_duration': 45},
    {'name': 'MRI Brain', 'description': 'Brain magnetic resonance imaging', 'price': 75000.00, 'estimated_duration': 90},
    {'name': 'Mammography', 'description': 'Breast mammography screening', 'price': 25000.00, 'estimated_duration': 45},
]

for proc_data in radiology_procedures:
    procedure, created = RadiologyTemplate.objects.get_or_create(
        name=proc_data['name'],
        defaults={
            'description': proc_data['description'],
            'price': proc_data['price'],
            'estimated_duration': proc_data['estimated_duration']
        }
    )
    if created:
        print(f'Created radiology procedure: {procedure.name}')
    else:
        print(f'Radiology procedure already exists: {procedure.name}')
"

    success "Radiology data seeded successfully"
}

# Validate seeded data
validate_data() {
    log "=== Validating Seeded Data ==="

    info "Checking laboratory data..."
    docker compose -f docker-compose.prod.yml exec -T backend python manage.py shell -c "
from laboratory.models import LabCategory, LabTemplate
print(f'Lab categories: {LabCategory.objects.count()}')
print(f'Lab templates: {LabTemplate.objects.count()}')
"

    info "Checking pharmacy data..."
    docker compose -f docker-compose.prod.yml exec -T backend python manage.py shell -c "
from pharmacy.models import MedicationCategory, GenericMedication
print(f'Medication categories: {MedicationCategory.objects.count()}')
print(f'Generic medications: {GenericMedication.objects.count()}')
"

    info "Checking radiology data..."
    docker compose -f docker-compose.prod.yml exec -T backend python manage.py shell -c "
from radiology.models import RadiologyTemplate
print(f'Radiology templates: {RadiologyTemplate.objects.count()}')
"

    success "Data validation completed"
}

# Main seeding process
main() {
    log "=== EMR Data Seeding Started ==="
    log "Seeding reference data for laboratory, pharmacy, and radiology"

    # Pre-seeding backup
    info "Creating pre-seeding backup..."
    ./backup_database.sh
    log "Pre-seeding backup completed"

    # Check Django availability
    if ! check_django; then
        error "Cannot proceed with data seeding - Django backend unavailable"
        exit 1
    fi

    # Seed data
    seed_laboratory_data
    seed_pharmacy_data
    seed_radiology_data

    # Validate
    validate_data

    # Post-seeding backup
    info "Creating post-seeding backup..."
    ./backup_database.sh
    log "Post-seeding backup completed"

    log "=== EMR Data Seeding Completed Successfully ==="
    success "All reference data seeded successfully!"
    info "Data seeded: laboratory tests, pharmacy medications, radiology procedures"
    warning "Note: No patient or user data was created - only reference/master data"
}

# Show usage
usage() {
    echo "EMR Data Seeding Script"
    echo "Usage: $0 [options]"
    echo ""
    echo "This script seeds reference data for:"
    echo "  - Laboratory tests and categories"
    echo "  - Pharmacy medications and categories"
    echo "  - Radiology procedures"
    echo ""
    echo "Options:"
    echo "  --lab-only     Seed only laboratory data"
    echo "  --pharm-only   Seed only pharmacy data"
    echo "  --radio-only   Seed only radiology data"
    echo "  --validate     Only validate existing data"
    echo "  --help         Show this help"
}

# Parse arguments
case "${1:-}" in
    --lab-only)
        check_django && seed_laboratory_data && validate_data
        ;;
    --pharm-only)
        check_django && seed_pharmacy_data && validate_data
        ;;
    --radio-only)
        check_django && seed_radiology_data && validate_data
        ;;
    --validate)
        check_django && validate_data
        ;;
    --help|-h)
        usage
        ;;
    *)
        main "$@"
        ;;
esac