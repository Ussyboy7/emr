# Database schema

PostgreSQL backs all clinical and admin data. Django migrations are the **source of truth** for schema changes.

## Core entities (conceptual)

```
Organization (Clinic, Department)
       │
       ▼
    User ───────────── Role / page permissions
       │
       ▼
   Patient ────── Visit ────── Vitals
       │              │
       │              ├── ConsultationSession → diagnoses, orders
       │              ├── LabOrder → LabResult
       │              ├── Prescription → dispensing
       │              ├── RadiologyOrder → studies
       │              └── PhysioOrder / EyeOrder …
       │
       └── Appointments, certificates, annual check-ups
```

| Model area | App | Key models |
|------------|-----|------------|
| Identity | `accounts` | `User`, `SystemRole` |
| Org | `organization` | `Clinic`, `Department`, `SystemConfig` |
| Clinical core | `patients` | `Patient`, `Visit`, `VitalSign`, `MedicalCertificate` |
| Consultation | `consultation` | `ConsultationSession`, diagnoses, complaints |
| Lab | `laboratory` | `LabOrder`, `LabTest`, `LabResult`, templates |
| Pharmacy | `pharmacy` | `Prescription`, inventory, dispensing |
| Radiology | `radiology` | orders, studies, templates |
| Nursing | `nursing` | procedures, queues |
| Wards | `wards` | admissions, beds |
| Security | `permissions` | `Role`, `UserRole` |
| Audit | `audit` | `AuditLog` |

Inspect models: `backend/<app>/models.py`.

## Migrations

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
```

Test settings:

```bash
cd backend
DB_HOST=localhost DB_PORT=5435 DB_NAME=emr_db_local DB_USER=emradmin DB_PASSWORD=emradmin \
  DJANGO_SETTINGS_MODULE=emr_backend.settings_test python manage.py test permissions.tests
```

Uses PostgreSQL (`settings_test` inherits `DATABASES` from main settings). Start local DB: `docker compose -f docker-compose.local.yml up -d postgres`.

## Seed data (local/dev)

```bash
python manage.py seed_demo_data
python manage.py seed_demo_data --reset
```

See `backend/common/management/commands/seed_demo_data.py`.

## Generate an ERD (optional)

```bash
pip install -r backend/requirements-dev.txt   # once
brew install graphviz                          # macOS; apt install graphviz on Linux
make docs-schema
```

Uses `emr_backend.settings_erd` (adds `django_extensions` only for this command).

Output: `docs/database/schema.dot` and `schema.png`.

## Multi-clinic

Users may belong to multiple clinics (`User.clinics`, `active_clinic`). Many order/visit models include `location_clinic` for scoping.

## Related

- [architecture/OVERVIEW.md](../architecture/OVERVIEW.md)
- [workflows/VISIT_LIFECYCLE.md](../workflows/VISIT_LIFECYCLE.md)
