# `scripts/` — EMR Operations Toolkit

This directory contains every shell entry-point for running, deploying,
monitoring, backing up and troubleshooting the EMR stack across **local**,
**staging**, and **production**.

## Design

One entry-point per environment, one source of truth for the logic.

**CI/CD:** GitHub Actions runs tests on every PR; staging deploys automatically on `main` via self-hosted runners. See [docs/operations/CI_CD.md](../docs/operations/CI_CD.md).

```
scripts/
├── lib/                Shared helpers, sourced by everything
│   ├── stack-utils.sh       Resolves compose file / env file / service names / URLs
│   └── ui.sh                Colour + logging helpers
│
├── stack/              Env-parameterised stack lifecycle primitives (generic)
│   ├── start.sh             <env>  docker compose up -d [--migrate]
│   ├── stop.sh              <env>  docker compose down [--prune]
│   ├── restart.sh           <env>
│   ├── health.sh            <env>  Backend + frontend HTTP probes
│   ├── backend-status.sh    <env>  Container / logs / DB smoke check
│   ├── seed.sh              <env>  python manage.py seed_demo_data
│   └── seed-radiology.sh    <env>  python manage.py populate_radiology_templates
│
├── ops/                Env-parameterised operational primitives (generic)
│   ├── env-manager.sh       <env> <cmd>   Unified ops CLI (THE entry-point)
│   ├── status.sh            <env>         Quick status snapshot
│   ├── dashboard.sh         <env>         Refreshing health dashboard
│   ├── emergency.sh         <env> <cmd>   Stop / restart / recovery / reset
│   └── logs.sh              <env> [svc]   Tail logs
│
├── local/              One file: env-manager.sh (pins env=local)
├── staging/            One file: env-manager.sh (pins env=stag)
├── production/         One file: env-manager.sh (pins env=prod)
│
├── backup/             Backup / restore helpers (see backup/README.md runbook)
├── monitoring/         Long-running monitor scripts (invoked by env-manager monitor/performance)
├── security/           Cron setup, permission hardening
├── testing/            Security & go-live validation suites
└── docs/               Documentation checks (page catalog sync)
```

### Why this shape

- `lib/` — one place to change a compose filename or container name.
- `stack/` + `ops/` — the actual logic, written once, env-aware via the first argument.
- `local/`, `staging/`, `production/` — a single `env-manager.sh` per env is the
  day-to-day entry point. Commands are subcommands rather than separate files,
  so you only have to remember the env folder you're in.

## Day-to-day cheat sheet

```bash
# Local dev
scripts/local/env-manager.sh start
scripts/local/env-manager.sh deploy              # fast rebuild (keeps DB volumes)
scripts/local/env-manager.sh deploy --full       # full stack down + rebuild
scripts/local/env-manager.sh stop
scripts/local/env-manager.sh seed
scripts/local/env-manager.sh status
scripts/local/env-manager.sh logs backend --follow

# Staging
scripts/staging/env-manager.sh start
scripts/staging/env-manager.sh deploy              # fast (default): app services only
scripts/staging/env-manager.sh deploy --full       # full stack reset
scripts/staging/env-manager.sh health
scripts/staging/env-manager.sh logs backend_stag --follow

# Production
scripts/production/env-manager.sh start
scripts/production/env-manager.sh deploy           # fast (default)
scripts/production/env-manager.sh deploy --full    # compose down + rebuild all
scripts/production/env-manager.sh status
scripts/production/env-manager.sh dashboard
scripts/production/env-manager.sh emergency diagnostics
```

All the above are equivalent to calling the generic form with the env as the
first argument:

```bash
scripts/ops/env-manager.sh prod status
```

### Production vs staging (canonical — do not mix)

| | **Production** | **Staging** |
|---|-----------------|---------------|
| **Host IP** (default sanity check) | `172.16.0.32` | `172.16.0.46` |
| **Default checkout (`DEPLOY_PATH`)** | `/home/emrprod/emr` | `/srv/emr` |
| **Default pre-deploy SQL backups** | `$HOME/emr-predeploy-backups` | `/srv/emr/backups` |
| **Default health URL** (status / dashboard / docs) | `http://172.16.0.32/…` (via nginx) | `http://172.16.0.46:8047/…` (direct backend port) |

The `deploy` command does **not** rely on those URLs for its wait loop. It
reads the Docker healthcheck status on the backend container (no fallback
probes), so the script's window must cover compose's `start_period` + retries.
Only path/IP convenience defaults remain in deploy scripts. Database identity
is canonical per environment (`emradmin` + env-specific DB name), and
production compose no longer provides secret fallbacks.

## `env-manager.sh` commands

Every environment exposes the same list (via
`scripts/<env>/env-manager.sh <cmd>` or `scripts/ops/env-manager.sh <env> <cmd>`):

| Command           | Description                                                    |
|-------------------|----------------------------------------------------------------|
| `start`           | `docker compose up -d` + status                                |
| `stop`            | `docker compose down`                                          |
| `restart`         | Rolling restart                                                |
| `status`          | Snapshot of services, URLs, backups, host resources            |
| `health`          | HTTP probes for backend + frontend                             |
| `logs [svc]`      | Tail logs (default 100 lines, all services)                    |
| `backend-status`  | Detailed backend container / DB smoke check                    |
| `dashboard`       | Refreshing real-time dashboard                                 |
| `shell`           | Drop into the backend container                                |
| `seed`            | Run `seed_demo_data`                                           |
| `seed-reset`      | Reset + reseed (prompts)                                       |
| `backup`          | One-off DB snapshot                                            |
| `backup-status`   | Snapshot listing + cron status                                 |
| `verify-backup`   | Verify latest snapshot integrity                               |
| `monitor`         | System monitor                                                 |
| `performance`     | Short performance probe                                        |
| `alerts`          | Summarise active alerts                                        |
| `diagnostics`     | Full diagnostics dump                                          |
| `deploy`          | Fast rebuild app tier (default); `--full` for entire stack. local \| stag \| prod |
| `update`          | Alias for `deploy`                                             |
| `cleanup`         | Prune dangling images + old logs                               |
| `emergency <cmd>` | `stop` / `restart` / `recovery` / `diagnostics` / `reset`      |
| `emergency-stop`  | Shortcut for `emergency stop`                                  |
| `panic`           | Shortcut for `emergency reset` (DATA LOSS, prompts)            |

Run any env-manager without arguments to see the current full list.

## Backup restore docs

For the backup/restore runbook (including non-interactive restore flags
`--backup-dir` and `--yes`), see:

- `scripts/backup/README.md`

## Deploying local / staging / production

### Fast deploy (default)

Rebuilds **app services only** (`backend`, `frontend`, `celery-worker`, `celery-beat`, and `nginx` on prod). **Postgres and Redis stay running** — less downtime, better Docker layer cache.

```bash
scripts/local/env-manager.sh deploy
/home/emrprod/emr/scripts/production/env-manager.sh deploy
/srv/emr/scripts/staging/env-manager.sh deploy
```

### Full deploy (`--full`)

Use after **compose file**, volume, port, nginx, or postgres image changes — or when containers are in a bad state:

```bash
scripts/local/env-manager.sh deploy --full
/home/emrprod/emr/scripts/production/env-manager.sh deploy --full
```

### Options

| Flag | Effect |
|------|--------|
| `--build` | Force local `docker compose build` (ignore `registry.env`) |
| `--full` | `compose down` → `up --build` or pull entire stack |
| `--services=a,b` | Rebuild/restart only listed services |
| `--pull` | `git pull` (local: off by default) |
| `--no-pull` | Skip git pull (stag/prod) |
| `--no-backup` | Skip pre-deploy DB snapshot |
| `--no-rollback` | No automatic rollback on failure |
| `--skip-health` | Don't wait for backend health |

### Registry deploy (stag/prod — recommended)

CI publishes images to **GHCR** on every `main` push. Servers **pull** instead of building on deploy.

**One-time server setup:**

```bash
# Staging
cp backend/env/registry.env.example backend/env/registry.env

# Production
cp backend/env/registry.prod.env.example backend/env/registry.env

# Login (PAT with read:packages) — or rely on CI GITHUB_TOKEN on self-hosted runners
echo "$GITHUB_PAT" | docker login ghcr.io -u YOUR_USER --password-stdin
```

With `EMR_USE_REGISTRY=1`, deploy sets `EMR_IMAGE_TAG` from the current git SHA and runs `docker compose pull` + restart.

Force a local build (no registry): `deploy --build`

### What deploy does

**Fast (default) with registry:**

1. Steps 1–3 as below (backup, git pull).
2. Ensure postgres + redis are up.
3. `docker compose pull` backend + frontend.
4. `docker compose up -d --no-deps` on app services.

**Fast (default) without registry (`--build` or no `registry.env`):**

1. Verify host IP (stag/prod; set `SERVER_IP=` to skip).
2. Pre-deploy DB snapshot (stag/prod, unless `--no-backup`).
3. `git pull` (stag/prod unless `--no-pull`; local unless `--pull`).
4. Ensure postgres + redis are up.
5. `docker compose build` backend and/or frontend (BuildKit enabled).
6. `docker compose up -d --no-deps` on app services.
7. Wait for backend Docker healthcheck (HTTP probe fallback on local).

**Full (`--full`):**

1. Steps 1–3 as above.
2. `docker compose down` → pull or `up --build` (all services).
3. Health wait + rollback on failure (stag/prod).

Run on the target server from the correct checkout (see table above):

```bash
/home/emrprod/emr/scripts/production/env-manager.sh deploy    # production
/srv/emr/scripts/staging/env-manager.sh deploy                # staging
```

Image pruning is **not** run during deploy (use `cleanup` when you want to prune).

Production runs fail-fast for required variables:

- Compose: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `REDIS_PASSWORD`
- Django settings (non-local): `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS`,
  `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`, `DB_*`, `REDIS_HOST`,
  `REDIS_PORT`
- Backup sidecar: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, plus
  `PGPASSWORD` or `DB_PASSWORD`

Common overrides:

```bash
# Production with a non-standard checkout path
DEPLOY_PATH=/opt/emr /home/emrprod/emr/scripts/production/env-manager.sh deploy

# Skip the host IP sanity check
SERVER_IP= /home/emrprod/emr/scripts/production/env-manager.sh deploy

# Custom backup directory (must be writable by the running user)
BACKUP_DIR=/var/backups/emr /home/emrprod/emr/scripts/production/env-manager.sh deploy
```

## Adding a new operation

1. Put the actual logic in `stack/` (service lifecycle) or `ops/` (operational).
   Accept `<env>` as the first argument and call `stack_init_env "$1"` right
   after sourcing `lib/stack-utils.sh`.
2. Add a matching `cmd_<name>` in `ops/env-manager.sh` and register it in the
   dispatcher. (No new per-env files — the env wrapper picks it up automatically.)
3. Document it in this README.

## Conventions

- **Documentation:** After adding UI pages, run `make docs-check` from repo root (see `scripts/docs/check_page_catalog_sync.py`). Full doc index: `docs/README.md`.

- Every script starts with `set -euo pipefail`.
- Every script sources `lib/stack-utils.sh` and (where useful) `lib/ui.sh`.
- No hard-coded compose filenames, container names, or URLs — always go
  through the `STACK_*` variables populated by `stack_init_env`.
- No colour code duplication — always use `ui_success/ui_error/ui_info/…`.
- The per-env directories contain exactly one file (`env-manager.sh`). New
  operations become subcommands, not new files.
