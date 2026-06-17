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
# From repo root (requires local Postgres — see database/README.md)
make test

# Or individually:
make test-backend
make test-frontend
make docs-check
```

Backend only (from `backend/`):

```bash
DB_HOST=localhost DB_PORT=5435 DB_NAME=emr_db_local DB_USER=emradmin DB_PASSWORD=emradmin \
  DJANGO_SETTINGS_MODULE=emr_backend.settings_test python manage.py test
```

Uses PostgreSQL — see [database/README.md](../database/README.md) for local docker postgres.

## Coverage highlights

| Area | Test module |
|------|-------------|
| RBAC | `permissions/tests/` |
| Auth (JWT) | `accounts/tests/test_auth_api.py` |
| Visit → nursing | `patients/tests/test_visit_nursing_notification.py` |
| Nursing pool stages | `patients/tests/test_nursing_status_filter.py` |
| Consultation sessions | `consultation/tests/test_session_lifecycle.py` |
| Notifications | `notifications/tests/` |
| Pharmacy dispense | `pharmacy/tests/test_dispense.py` |
| Radiology orders | `radiology/tests/test_order_api.py` |
| Physiotherapy orders | `physiotherapy/tests/test_order_api.py` |
| Eye care orders | `eyecare/tests/test_order_api.py` |
| Ward discharge/transfer | `wards/tests/test_discharge_transfer.py` |
| Auth me/blacklist/pwd | `accounts/tests/test_auth_extended.py` |
| Appointments CRUD | `appointments/tests/test_appointment_api.py` |
| Organization CRUD | `organization/tests/test_clinic_dept_api.py` |
| Frontend helpers | `frontend/lib/*.test.ts`, `frontend/middleware.test.ts`, `orders-utils.test.ts` |
| Frontend transformers | `frontend/lib/services/transformers.test.ts` |
| Frontend Rx refill | `frontend/lib/consultation/prescription-refill.test.ts` |
| Frontend home route | `frontend/lib/home-route.test.ts` |

CI runs on push/PR via `.github/workflows/tests.yml`.

## Sign-off

- **UAT:** Each role lead completes [UAT_SCENARIOS.md](UAT_SCENARIOS.md) and signs [UAT_SIGNOFF.md](UAT_SIGNOFF.md).
- **Go-live:** Complete [EMR_GO_LIVE_CHECKLIST.md](EMR_GO_LIVE_CHECKLIST.md) with operations and clinical governance.
