# EMR Testing Documentation

Index for validation, UAT, and go-live. Use your **staging or UAT URL** and **test accounts** from IT — never production credentials in shared docs.

## Documents

| Document | Use when |
|----------|----------|
| [UAT_SCENARIOS.md](UAT_SCENARIOS.md) | **Primary UAT** — role-based scenarios |
| [UAT_SIGNOFF.md](UAT_SIGNOFF.md) | **Sign-off form** — environment, defects, go/no-go |
| [EMR_GO_LIVE_CHECKLIST.md](EMR_GO_LIVE_CHECKLIST.md) | Production launch day and pre-go-live sign-off |

## Test categories (validation plan summary)

| Category | Owner | Tools / notes |
|----------|--------|----------------|
| **Functional** | Clinical leads + IT | UAT_SCENARIOS per role |
| **Security** | ICT / admin | RBAC, auth lockout, HTTPS, audit log review |
| **Performance** | Ops | Response time on UAT under expected load |
| **Integration** | Lab/pharmacy/radiology | Device middleware, HL7 where applicable |
| **UAT** | End users | UAT_SCENARIOS sign-off |

## Automated tests (developers)

```bash
cd backend
DB_HOST=localhost DB_PORT=5435 DB_NAME=emr_db_local DB_USER=emradmin DB_PASSWORD=emradmin \
  DJANGO_SETTINGS_MODULE=emr_backend.settings_test python manage.py test permissions.tests
```

Uses PostgreSQL — see [database/README.md](../database/README.md) for local docker postgres.

RBAC unit tests: `permissions/tests/test_api_access.py`. HTTP integration: `permissions/tests/test_rbac_http.py`.

## Sign-off

- **UAT:** Each role lead completes [UAT_SCENARIOS.md](UAT_SCENARIOS.md) and signs [UAT_SIGNOFF.md](UAT_SIGNOFF.md).
- **Go-live:** Complete [EMR_GO_LIVE_CHECKLIST.md](EMR_GO_LIVE_CHECKLIST.md) with operations and clinical governance.
