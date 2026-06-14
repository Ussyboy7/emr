# NPA EMR (Electronic Medical Records)

Full-stack healthcare system: **Django REST Framework** backend + **Next.js** frontend.

## Quick start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

→ http://localhost:3001

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Configure backend/env/local.env (see backend/README.md)
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8001
```

→ http://localhost:8001

Or use Docker: `docker compose -f docker-compose.local.yml up`

### Seed demo data (optional)

```bash
cd backend && python manage.py seed_demo_data
```

## Documentation

**Start here:** [docs/README.md](docs/README.md)

| Audience | Doc |
|----------|-----|
| Developers | [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md), [AGENTS.md](AGENTS.md) |
| API | [docs/api/README.md](docs/api/README.md) (OpenAPI at `/api/docs/` when `ENABLE_API_DOCS=true`) |
| Operations | [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md) |
| Security | [SECURITY.md](SECURITY.md) |

## Project layout

```
emr/
├── backend/          Django apps (patients, lab, pharmacy, …)
├── frontend/         Next.js App Router
├── nginx/            Reverse proxy configs
├── scripts/          env-manager, backup, monitoring
├── docs/             Documentation index
├── integration/      External devices (URIT5160, …)
├── docker-compose.*.yml
└── Makefile          Local dev shortcuts
```

## Stack

- **Frontend:** Next.js 16, React 18, TypeScript, Tailwind, shadcn/ui
- **Backend:** Django 4.2, DRF, PostgreSQL, Redis, Celery (where enabled)
- **Auth:** JWT + HTTP-only cookies, page-based RBAC

## Production

```bash
./scripts/production/env-manager.sh deploy
```

See [PRODUCTION_OPERATIONS.md](PRODUCTION_OPERATIONS.md) and [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md).
