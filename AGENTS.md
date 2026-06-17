# AGENTS.md — NPA EMR

Guidance for AI coding agents working in this repository.

## Repository Layout (canonical)

- `backend/` — Django 4.2 + DRF. Entry point: `backend/manage.py`; settings: `backend/emr_backend/settings.py`.
- `frontend/` — Next.js 16 (App Router) + React 18 + TypeScript + Tailwind + shadcn/ui. Entry: `frontend/app/`.
- `nginx/` — Nginx configs. Prod uses `nginx/nginx.conf`; `local.conf` and `stag.conf` are per-env; `prod.conf.reference` is the richer prod config kept for reference.
- `scripts/` — **single** consolidated tree for operational scripts (see `scripts/README.md`):
  - `scripts/lib/` — shared helpers (`stack-utils.sh` resolves env → compose file/service names/URLs; `ui.sh` gives colour + logging helpers). Source these, don't duplicate.
  - `scripts/stack/` + `scripts/ops/` — **generic** env-aware primitives. First arg is always `local|stag|prod`. `stack/` covers lifecycle (start/stop/restart/health/seed/backend-status); `ops/` covers operations (env-manager/dashboard/emergency/status/logs).
  - `scripts/ops/env-manager.sh <env> <cmd>` is the canonical entry-point for every runnable operation (start/stop/status/health/logs/seed/backup/deploy/emergency…). New ops become subcommands here, not new files.
  - `scripts/local/env-manager.sh`, `scripts/staging/env-manager.sh`, `scripts/production/env-manager.sh` — **one file per env**, each just `exec`s into the generic form with the env pre-bound.
  - `scripts/{backup,monitoring,security,testing}/` — scoped subsystems invoked by `ops/env-manager.sh`.
  - There is **no** `infra/scripts/` and **no** root-level env-specific scripts (`start-prod.sh`, `deploy-stag.sh`, etc.). Don't recreate them.
- `backend/scripts/` — backend-only dev/DB utilities (SQL bootstrap, one-off debug scripts). Keep these scoped to backend tasks.
- `frontend/scripts/` — frontend-only build utilities (favicon generation, org-data exports). Keep these scoped to frontend tasks.
- Docker Compose files live at the **repo root** (`docker-compose.{local,stag,prod}.yml`) — not under `deployment/`.
- **Documentation index**: `docs/README.md` — architecture, API, RBAC, runbook, workflows.
- After changing UI page permissions: `make docs-check`.

## Backend Commands

Run from `backend/` with the venv active.

- **Install**: `pip install -r requirements.txt`
- **Migrate**: `python manage.py migrate`
- **Dev server**: `python manage.py runserver 8001`
- **Tests**: `make test` (backend + frontend + docs-check), or `make test-backend` / `make test-frontend`
- **Deploy checks**: `python manage.py check --deploy` (must pass with `DJANGO_ENV=prod`)

## Frontend Commands

Run from `frontend/`.

- **Dev server**: `npm run dev` (port 3001)
- **Lint**: `npm run lint`
- **Type-check**: `npm run type-check`
- **Unit tests**: `npm run test` (Vitest)
- **Build**: `npm run build`
- **Bundle analysis**: `npm run build:analyze`

## Conventions

- **Python**: ruff is configured (`.ruff_cache/` exists). Prefer type annotations; models/serializers/views split per Django app.
- **TypeScript**: strict mode. Use the existing `lib/api-client.ts` + React Query pattern; do not introduce another HTTP client.
- **UI**: shadcn/ui + Radix primitives. Do not add another component library.
- **Environment**: runtime secrets live in `backend/env/{local,stag,prod}.env` and `frontend/.env.{local,stag,prod}` — these are **not** safe to commit. Public vars (`NEXT_PUBLIC_*`) are passed as Docker build args from `docker-compose.prod.yml`.
- **API versioning**: `/api/v1/` is canonical. `/api/` is a legacy alias emitting RFC 8594 `Deprecation` / `Sunset` headers; do not add new endpoints to the legacy alias.
- **Throttling**: DRF default throttles + named scopes (`auth_login`, `auth_refresh`, `file_upload`, …) are configured in `settings.py`. Attach sensitive endpoints with `throttle_classes = [ScopedRateThrottle]` and a matching `throttle_scope`.

## Safety

- This is a healthcare system. Never commit real secrets, PHI, or seed data containing PHI.
- Every new DRF view on authenticated data must declare explicit permission classes — do not rely solely on the frontend middleware for authorization.
