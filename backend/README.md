# EMR Backend

Django REST Framework API for NPA EMR.

## Apps

| App | Domain |
|-----|--------|
| `accounts` | Users, JWT authentication |
| `organization` | Clinics, departments, config |
| `patients` | Patients, visits, vitals |
| `consultation` | Consultation sessions |
| `nursing` | Nursing workflows |
| `laboratory` | Lab orders and results |
| `pharmacy` | Prescriptions, inventory |
| `radiology` | Imaging orders |
| `physiotherapy`, `eyecare` | Specialty modules |
| `wards`, `appointments` | Inpatient and scheduling |
| `permissions` | Roles and page RBAC |
| `audit` | Audit trail |
| `notifications` | Notifications |
| `reports`, `analytics`, `dashboard` | Reporting |
| `common` | Uploads, media, metrics, health |
| `hr` | HR check-up compliance |

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Environment files: `env/local.env`, `env/stag.env`, `env/prod.env` (not committed).

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8001
```

## Tests

Integration tests use **PostgreSQL** (production uses Postgres; some migrations use PG-only SQL that SQLite cannot run).

```bash
# Start local Postgres (docker-compose.local.yml → localhost:5435)
docker compose -f ../docker-compose.local.yml up -d postgres

DB_HOST=localhost DB_PORT=5435 DB_NAME=emr_db_local DB_USER=emradmin DB_PASSWORD=emradmin \
  DJANGO_SETTINGS_MODULE=emr_backend.settings_test python manage.py test
```

`settings_test` inherits `DATABASES` from main settings and creates a separate `test_emr_db` database for the run.

## Seed data

```bash
python manage.py seed_demo_data
python manage.py seed_demo_data --reset
```

## API docs (local)

Set `ENABLE_API_DOCS=true`, then:

- Swagger: http://localhost:8001/api/docs/
- Schema: http://localhost:8001/api/schema/

See [../docs/api/README.md](../docs/api/README.md).

## RBAC & security

Default permission class: `ApiPageAccessPermission`. See [../docs/architecture/AUTH_AND_RBAC.md](../docs/architecture/AUTH_AND_RBAC.md).

## Documentation

Run after changing UI page permissions:

```bash
make docs-check    # frontend page-permissions.ts vs backend page_catalog.py
make docs-schema   # optional ERD (venv + requirements-dev.txt + graphviz)
```

See [../docs/README.md](../docs/README.md).
