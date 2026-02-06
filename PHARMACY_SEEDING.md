# Pharmacy Seeding (Local → Staging/Prod)

This repo supports exporting the current Pharmacy master data from a source environment (typically local) into seed CSVs, then importing them into another environment (staging/prod) deterministically.

## Export seed CSVs (Source)

Run inside the backend container that already has the correct Pharmacy data:

```bash
docker exec -it emr-backend-local python manage.py export_pharmacy_seed_csv --out-dir /app/data
```

This creates:
- `/app/data/GENERIC_MEDICATIONS_SEED.csv`
- `/app/data/BRAND_MEDICATIONS_SEED.csv`

On local dev docker, `/app/data` maps to `backend/data/` in the repo.

## Import seed CSVs (Target)

Copy the seed CSVs into the target backend container:

```bash
docker exec -it emr-backend-stag mkdir -p /app/data
docker cp backend/data/GENERIC_MEDICATIONS_SEED.csv emr-backend-stag:/app/data/GENERIC_MEDICATIONS_SEED.csv
docker cp backend/data/BRAND_MEDICATIONS_SEED.csv emr-backend-stag:/app/data/BRAND_MEDICATIONS_SEED.csv
```

Reset + import (destructive):

```bash
docker exec -it emr-backend-stag python manage.py reset_pharmacy_for_csv --purge-all --csv /app/data/GENERIC_MEDICATIONS_SEED.csv
docker exec -it emr-backend-stag python manage.py import_brands_from_csv --csv /app/data/BRAND_MEDICATIONS_SEED.csv
```

Verify:

```bash
docker exec -it emr-backend-stag python manage.py audit_pharmacy_fields
```

## Seed stock (optional)

Store stock for all active brands:

```bash
docker exec -it emr-backend-stag python manage.py seed_inventory --quantity 1000 --min-stock 100
```

Dispensary stock seeded by transferring from Store:

```bash
docker exec -it emr-backend-stag python manage.py seed_dispensary_from_store --per-med-qty 50 --limit 0
```

