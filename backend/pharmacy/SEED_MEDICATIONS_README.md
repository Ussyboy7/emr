# Medication Seed Data

This directory contains seed data commands for populating the database with common medications and their inventory.

## Running the Seed Commands

### 1. Seed Medications

To seed the database with 107 common medications, run:

```bash
cd emr/backend
python manage.py seed_medications
```

### 2. Seed Inventory

To create inventory items (stock/batches) for all medications, run:

```bash
cd emr/backend
python manage.py seed_inventory
```

**Options:**
- `--quantity`: Default quantity for each inventory item (default: 1000)
- `--min-stock`: Default minimum stock level (default: 100)

Example with custom values:
```bash
python manage.py seed_inventory --quantity 500 --min-stock 50
```

## What It Does

### seed_medications

- Creates or updates 107 common medications in the database
- Uses `update_or_create` to avoid duplicates (based on medication `code`)
- Sets all medications as `is_active=True`
- Covers major medication categories:
  - Diabetes medications
  - Cardiovascular medications
  - Analgesics
  - Antibiotics
  - Gastrointestinal medications
  - Respiratory medications
  - Antihistamines
  - Corticosteroids
  - Vitamins and supplements
  - Antimalarials
  - Antifungals
  - Antivirals
  - And more...

## Medication Fields

Each medication includes:
- `name`: Full medication name (e.g., "Metformin 500mg")
- `generic_name`: Generic name (e.g., "Metformin")
- `code`: Unique code (e.g., "MET-500")
- `unit`: Unit of measurement (e.g., "tablet", "ml", "capsule")
- `strength`: Medication strength (e.g., "500mg", "100IU/ml")
- `form`: Dosage form (e.g., "tablet", "injection", "syrup")

### seed_inventory

- Creates inventory items (stock/batches) for all active medications
- Each medication gets a default batch with:
  - Quantity: 1000 units (configurable)
  - Minimum stock level: 100 units (configurable)
  - Expiry date: 2 years from now
  - Location: "Main Pharmacy"
  - Supplier: "Default Supplier"

## Notes

- Both commands are idempotent - you can run them multiple times safely
- Existing medications with the same `code` will be updated
- New medications will be created
- All medications are set to `is_active=True`
- Inventory items are created with batch numbers based on medication codes

