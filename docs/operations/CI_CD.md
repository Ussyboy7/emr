# EMR CI/CD

GitHub Actions workflow: [`.github/workflows/ci-cd.yml`](../../.github/workflows/ci-cd.yml)

## Overview

| Phase | Where it runs | When |
|-------|---------------|------|
| **CI** (tests, lint, build, security, Docker) | GitHub `ubuntu-latest` | Every PR and push to `main` |
| **Deploy staging** | Self-hosted runner on `172.16.0.46` | Push to `main` after CI passes |
| **Deploy production** | Self-hosted runner on `172.16.0.32` | Manual **workflow_dispatch** only |

Staging deploy uses [`scripts/staging/env-manager.sh deploy`](../../scripts/staging/env-manager.sh) (pre-deploy DB snapshot, rebuild, health wait, rollback on failure).

Production deploy uses [`scripts/production/env-manager.sh deploy`](../../scripts/production/env-manager.sh).

Unlike NPA ECM’s pipeline, **tests and lint fail the workflow** — they do not continue on error.

---

## CI jobs

| Job | What it does |
|-----|----------------|
| `backend` | Postgres service, `makemigrations --check`, full Django suite via `scripts/ci/run-backend-tests.sh` |
| `frontend` | Vitest, `type-check`, ESLint, `next build` |
| `docs-check` | `make docs-check` (page + capability catalog sync) |
| `security-scan` | Bandit (high), `pip-audit`, `npm audit` (critical) |
| `docker-validate` | `docker compose config` + build backend + staging frontend images |

Backend test app list: [`scripts/ci/backend-test-apps.sh`](../../scripts/ci/backend-test-apps.sh) (keep in sync with `Makefile` `test-backend`).

---

## Self-hosted runners (one-time setup)

### Staging (`172.16.0.46`)

1. On the staging server, install [GitHub Actions runner](https://github.com/actions/runner/releases).
2. Register with labels: `self-hosted`, `emr-staging`.
3. Ensure repo checkout exists at **`/srv/emr`** with `origin` pointing at GitHub.
4. Ensure `backend/env/stag.env` exists on the server (not in git).
5. Runner user must run Docker and access `/srv/emr`.

### Production (`172.16.0.32`)

1. Register a runner with labels: `self-hosted`, `emr-prod`.
2. Repo checkout at **`/home/emrprod/emr`**.
3. Ensure `backend/env/prod.env` exists on the server.
4. Configure GitHub **Environment** `production` with required reviewers.

### GitHub Environments

In the repo → **Settings → Environments**:

| Environment | Purpose |
|-------------|---------|
| `staging` | Optional protection rules for staging deploy |
| `production` | **Required reviewers** before prod deploy job runs |

---

## Deploy triggers

### Staging (automatic)

Merge or push to `main` → CI runs → on success, `deploy-staging` runs on `emr-staging` runner.

Smoke checks:

- `http://172.16.0.46:4647/` (frontend)
- `http://172.16.0.46:8047/api/health/live/` (backend)

### Production (manual)

1. GitHub → **Actions** → **CI/CD** → **Run workflow**.
2. Check **Deploy to production**.
3. Approve in the `production` environment if reviewers are configured.
4. Job runs on `emr-prod` runner.

Smoke checks:

- `http://172.16.0.32/api/health/live/`
- `http://172.16.0.32/`

---

## Local parity

**Before you push**, run the same checks GitHub CI runs.

### Docker-only (recommended if you run the app in Docker)

No Python venv on the host — backend tests run **inside** the `backend` container.

```bash
# Start the local stack (if not already up)
scripts/local/env-manager.sh start

# Full pre-push CI
make ci-docker

# Faster: skip prod/stag image builds
make ci-docker-quick
```

| Command | What it runs |
|---------|----------------|
| `make ci-docker` | Full CI via Docker backend + host npm for frontend |
| `make ci-docker-quick` | Same, but skips compose validate + image builds |

Frontend checks use **host `npm`** (the container keeps `node_modules` in a volume). You need Node 20+ installed locally for those steps.

### Host venv (optional, faster backend-only iteration)

```bash
make backend-install          # venv + runtime + dev tools (bandit, pip-audit, coverage)
scripts/local/env-manager.sh start   # Postgres on localhost:5435
make ci                       # or make ci-quick
```

| Command | What it runs |
|---------|----------------|
| `make ci` | Everything in the CI workflow except deploy (host Python venv) |
| `make ci-quick` | Same, but skips Docker compose validate + image builds |
| `make security-check` | Bandit + pip-audit + npm audit only |
| `make test` | Backend + frontend tests + docs (subset of `make ci`) |

Backend tests via venv need Postgres at **`localhost:5435`** (`emr_db_local`).

### Individual steps (if you only changed one area)

```bash
# Backend (needs local Postgres — see Makefile TEST_DB_ENV)
make test-backend

# Or directly:
DB_HOST=localhost DB_PORT=5435 DB_NAME=emr_db_local DB_USER=emradmin DB_PASSWORD=emradmin \
  DJANGO_SETTINGS_MODULE=emr_backend.settings_test \
  bash scripts/ci/run-backend-tests.sh

# Frontend
cd frontend && npm test && npm run type-check && npm run lint && npm run build

# Docs
make docs-check

# Compose
bash scripts/ci/validate-compose.sh
```

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `deploy-staging` queued forever | No runner with label `emr-staging` |
| Deploy prompts for IP / hangs | Runner not on expected host; workflow sets `SERVER_IP=""` to skip check |
| `DEPLOY_PATH does not exist` | Clone repo to `/srv/emr` or `/home/emrprod/emr` |
| Security scan fails | Fix Bandit/pip-audit/npm critical findings or update dependencies |
| Frontend build fails in CI | Run `npm run build` locally; set `NEXT_PUBLIC_*` if needed |

---

## Related

- [RUNBOOK.md](RUNBOOK.md) — manual deploy and operations
- [../scripts/README.md](../../scripts/README.md) — `env-manager` commands and host paths
