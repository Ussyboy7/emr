#!/bin/bash

# EMR Phase 5: Healthcare Catalog Seeding
# Loads lab tests, medications, radiology procedures, and sets up inventory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== EMR Phase 5: Healthcare Catalog Seeding ==="
echo "Setting up lab tests, medications, radiology procedures, and inventory"
echo ""

# Function to run Django management commands
run_django_command() {
    echo "Running: python manage.py $@"
    docker compose -f docker-compose.prod.yml exec -T backend python manage.py "$@"
}

# Load healthcare catalogs
echo "📦 Loading healthcare catalogs..."

echo "  🧪 Loading lab test templates..."
run_django_command loaddata laboratory/fixtures/lab_templates.json

echo "  💊 Loading generic medications..."
run_django_command loaddata pharmacy/fixtures/generic_medications.json

echo "  💰 Loading branded medications..."
run_django_command loaddata pharmacy/fixtures/medications.json

echo "  📹 Loading radiology procedures..."
run_django_command loaddata radiology/fixtures/radiology_templates.json

echo ""
echo "✅ Healthcare catalogs loaded successfully!"
echo ""

# Seed pharmacy inventory
echo "🏥 Setting up pharmacy inventory..."

echo "  📦 Creating store inventory..."
run_django_command seed_full_inventory --locations Store --quantity 500 --min-stock 50

echo "  🏪 Setting up dispensary from store..."
run_django_command seed_dispensary_from_store --quantity 200 --min-stock 20

echo ""
echo "✅ Pharmacy inventory setup complete!"
echo ""

# Verify data loading
echo "🔍 Verifying seeded data..."

echo "  🧪 Lab tests: $(run_django_command shell -c "from laboratory.models import LabTemplate; print(LabTemplate.objects.count())" | tail -1)"
echo "  💊 Generic medications: $(run_django_command shell -c "from pharmacy.models import GenericMedication; print(GenericMedication.objects.count())" | tail -1)"
echo "  💰 Branded medications: $(run_django_command shell -c "from pharmacy.models import Medication; print(Medication.objects.count())" | tail -1)"
echo "  📹 Radiology procedures: $(run_django_command shell -c "from radiology.models import RadiologyTemplate; print(RadiologyTemplate.objects.count())" | tail -1)"
echo "  📦 Store inventory items: $(run_django_command shell -c "from pharmacy.models import MedicationInventory; print(MedicationInventory.objects.filter(location='Store').count())" | tail -1)"
echo "  🏪 Dispensary inventory items: $(run_django_command shell -c "from pharmacy.models import MedicationInventory; print(MedicationInventory.objects.filter(location='Dispensary').count())" | tail -1)"

echo ""
echo "=== Phase 5 Complete: Healthcare Catalogs Seeded ==="
echo ""
echo "🎉 EMR System Now Includes:"
echo ""
echo "📋 LABORATORY:"
echo "  • 10 essential lab test templates"
echo "  • Normal ranges and reference values"
echo "  • Sample types and turnaround times"
echo "  • Hematology, Chemistry, Immunology tests"
echo ""
echo "💊 PHARMACY:"
echo "  • 10 generic medications (active ingredients)"
echo "  • 10 branded medications with pricing"
echo "  • Store inventory (500 units each, reorder at 50)"
echo "  • Dispensary inventory (200 units each, reorder at 20)"
echo "  • Complete medication catalog ready for dispensing"
echo ""
echo "📹 RADIOLOGY:"
echo "  • 10 radiology procedure templates"
echo "  • X-Ray, CT, MRI, Ultrasound procedures"
echo "  • Radiation doses and contrast requirements"
echo "  • Body part classifications and indications"
echo ""
echo "🏥 HEALTHCARE OPERATIONS READY:"
echo "  • Lab orders can reference test templates"
echo "  • Pharmacy can dispense from inventory"
echo "  • Radiology orders can use procedure templates"
echo "  • Complete clinical workflow support"
echo ""
echo "🚀 EMR System is now fully equipped for healthcare delivery!"
echo ""
echo "Next: Phase 6 (Testing & Validation) or start using the system! 🎯"