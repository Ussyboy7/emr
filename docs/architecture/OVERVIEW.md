# System architecture overview

## Components

```
┌─────────────┐     HTTPS      ┌──────────────┐     HTTP      ┌─────────────────┐
│   Browser   │ ─────────────► │    Nginx     │ ───────────► │  Next.js (FE)   │
│  (staff UI) │                │ reverse proxy│              │  port 3000/3001 │
└─────────────┘                └──────┬───────┘              └────────┬────────┘
                                      │                               │
                                      │ /api/*                        │ same-origin
                                      ▼                               ▼ proxy (dev)
                               ┌──────────────┐              ┌─────────────────┐
                               │ Django (BE)  │◄─────────────│  API client     │
                               │ DRF /api/v1/ │              │  lib/api-client │
                               └──────┬───────┘              └─────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
             ┌───────────┐    ┌───────────┐    ┌──────────────┐
             │ PostgreSQL│    │   Redis   │    │ MEDIA_ROOT   │
             │           │    │ cache/WS  │    │ uploads      │
             └───────────┘    └───────────┘    └──────────────┘
```

| Layer | Technology | Location |
|-------|------------|----------|
| Frontend | Next.js 16, React 18, TypeScript, Tailwind, shadcn/ui | `frontend/` |
| Backend | Django 4.2, DRF, drf-spectacular | `backend/` |
| Database | PostgreSQL | Docker / host |
| Cache / channels | Redis | Docker / host |
| Web server | Nginx | `nginx/` |
| Compose | Docker Compose | `docker-compose.{local,stag,prod}.yml` |

## Backend apps (domain modules)

| App | Purpose |
|-----|---------|
| `accounts` | Users, JWT auth, profiles |
| `organization` | Clinics, departments, system config |
| `patients` | Patients, visits, vitals, certificates |
| `consultation` | Consultation sessions, diagnoses, orders |
| `nursing` | Nursing queues, procedures, ward workflows |
| `laboratory` | Lab orders, results, templates |
| `pharmacy` | Prescriptions, inventory, dispensing |
| `radiology` | Imaging orders, reports, studies |
| `physiotherapy` / `eyecare` | Specialty order modules |
| `wards` | Ward admissions and bed management |
| `appointments` | Scheduling |
| `permissions` | Roles, page permissions |
| `audit` | Audit log |
| `notifications` | In-app notifications |
| `reports` / `analytics` / `dashboard` | Reporting and dashboards |
| `common` | Uploads, media, health metrics, shared utilities |
| `hr` | HR annual check-up compliance |

## Request flow (typical API call)

1. User opens a page in Next.js (`frontend/app/…`).
2. `middleware.ts` checks auth cookies and **page permissions** (see [AUTH_AND_RBAC.md](AUTH_AND_RBAC.md)).
3. Page components call services in `frontend/lib/services/*` via `apiFetch` (`lib/api-client.ts`).
4. Request hits Nginx → Django URL → DRF view.
5. `ApiPageAccessPermission` checks API path against the same page model as the frontend.
6. View reads/writes PostgreSQL; optional Redis cache; audit hooks may record the action.

## Environments

| Environment | Compose file | Env files |
|-------------|--------------|-----------|
| Local | `docker-compose.local.yml` | `backend/env/local.env`, `frontend/.env.local` |
| Staging | `docker-compose.stag.yml` | `backend/env/stag.env` |
| Production | `docker-compose.prod.yml` | `backend/env/prod.env` |

Operational entry point for all environments:

```bash
./scripts/{local,staging,production}/env-manager.sh <command>
```

See [operations/RUNBOOK.md](../operations/RUNBOOK.md).

## Health & monitoring

- **Liveness**: `GET /health/live/` (no DB)
- **Readiness**: `GET /health/` (DB + Redis)
- **Admin UI**: `/admin/health` — process uptime, disk, backups, API timing
- **Metrics API**: `GET /api/v1/common/metrics/` (staff/admin)

## Related docs

- [AUTH_AND_RBAC.md](AUTH_AND_RBAC.md)
- [api/README.md](../api/README.md)
- [database/README.md](../database/README.md)
- [workflows/VISIT_LIFECYCLE.md](../workflows/VISIT_LIFECYCLE.md)
