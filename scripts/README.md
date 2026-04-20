# `scripts/` — EMR Operations Toolkit

This directory contains every shell entry-point for running, deploying,
monitoring, backing up and troubleshooting the EMR stack across **local**,
**staging**, and **production**.

## Design

We use a three-layer model so env-specific commands stay tiny and the logic
lives in one place.

```
scripts/
├── lib/            Shared helpers, sourced by everything
│   ├── stack-utils.sh   Resolves compose file / env file / service names / URLs
│   └── ui.sh            Colour + logging helpers
│
├── stack/          Env-parameterised stack lifecycle (generic)
│   ├── start.sh           <env>  docker compose up -d [--migrate]
│   ├── stop.sh            <env>  docker compose down [--prune]
│   ├── restart.sh         <env>
│   ├── health.sh          <env>  Backend + frontend HTTP probes
│   ├── backend-status.sh  <env>  Container / logs / DB smoke check
│   ├── seed.sh            <env>  python manage.py seed_demo_data
│   └── seed-radiology.sh  <env>  python manage.py populate_radiology_templates
│
├── ops/            Env-parameterised operational commands (generic)
│   ├── manager.sh      <env> <cmd>   Unified ops CLI (start/stop/backup/seed/…)
│   ├── status.sh       <env>         Quick status snapshot
│   ├── dashboard.sh    <env>         Refreshing health dashboard
│   ├── emergency.sh    <env> <cmd>   Stop / restart / recovery / reset
│   ├── logs.sh         <env> [svc]   Tail logs
│   └── deploy.sh       <env>         Pull + rebuild + health-check + rollback (stag/prod)
│
├── local/          Thin wrappers that call stack/ + ops/ with env=local
├── staging/        Thin wrappers for env=stag (adds deploy.sh)
├── production/     Thin wrappers for env=prod (adds deploy.sh)
│
├── backup/         Backup / restore helpers (used by ops/*)
├── monitoring/     Long-running monitor scripts (used by manager monitor/performance)
├── security/       Cron setup, permission hardening
└── testing/        Security & go-live validation suites
```

### Why three layers?

- `lib/` — one source of truth for env resolution and UI helpers. Changing a
  compose filename or container name touches a single file.
- `stack/` + `ops/` — the actual logic, written once, env-aware via the first
  argument.
- `local/`, `staging/`, `production/` — near-zero-logic wrappers. They make
  day-to-day commands short (`scripts/production/start.sh`) and guard against
  "oops, I meant stag" mistakes since the env is pre-bound.

## Day-to-day cheat sheet

```bash
# Local dev
scripts/local/start.sh
scripts/local/stop.sh
scripts/local/seed.sh
scripts/local/manager.sh status

# Staging
scripts/staging/start.sh
scripts/staging/deploy.sh          # pull + rebuild on the staging box
scripts/staging/manager.sh health
scripts/staging/logs.sh backend_stag --follow

# Production
scripts/production/start.sh
scripts/production/deploy.sh
scripts/production/manager.sh status
scripts/production/dashboard.sh
scripts/production/emergency.sh diagnostics
```

### Production vs staging (canonical — do not mix)

| | **Production** | **Staging** |
|---|-----------------|---------------|
| **Host IP** (default sanity check) | `172.16.0.32` | `172.16.0.46` |
| **Default checkout (`DEPLOY_PATH`)** | `/home/emrprod/emr` | `/srv/emr` |
| **Default pre-deploy SQL backups** | `$HOME/emr-predeploy-backups` | `/srv/emr/backups` |
| **Default health probe** | `http://172.16.0.32/api/health/live/` (nginx :80) | `http://172.16.0.46:8047/api/health/live/` (backend published port) |

Unset-only defaults live in `ops/deploy.sh` and `lib/stack-utils.sh`. Override with `DEPLOY_PATH`, `BACKUP_DIR`, `SERVER_IP`, or `STACK_HEALTH_URL_OVERRIDE` when your layout differs.

All of the above are equivalent to calling the generic script with the env as
the first argument, e.g.:

```bash
scripts/ops/manager.sh prod status
```

## `manager.sh` commands

Supported by every environment (via `scripts/<env>/manager.sh <cmd>` or
`scripts/ops/manager.sh <env> <cmd>`):

| Command         | Description                                         |
|-----------------|-----------------------------------------------------|
| `start`         | `docker compose up -d` + health check               |
| `stop`          | `docker compose down`                               |
| `restart`       | Rolling restart                                     |
| `status`        | Snapshot of services, URLs, backups                 |
| `health`        | HTTP probes for backend + frontend                  |
| `logs`          | Last 50 lines per service                           |
| `backup`        | One-off DB snapshot (uses `scripts/backup/…`)       |
| `backup-status` | Snapshot listing + cron status                      |
| `verify-backup` | Integrity check for the latest snapshot             |
| `seed`          | Run `seed_demo_data`                                |
| `seed-reset`    | Reset + reseed (prompts for confirmation)           |
| `monitor`       | System monitor (`scripts/monitoring/…`)             |
| `performance`   | Quick performance run                               |
| `alerts`        | Summarise active alerts                             |
| `diagnostics`   | Full diagnostics dump                               |
| `update`        | Pull, rebuild, migrate (downtime)                   |
| `cleanup`       | Prune dangling images + old logs                    |
| `shell`         | Drop into the backend container                     |
| `emergency-stop`| Force stop all services                             |
| `panic`         | Wipe volumes + rebuild (prompts twice; data loss)   |

## Emergency ops

```bash
scripts/production/emergency.sh stop
scripts/production/emergency.sh restart
scripts/production/emergency.sh diagnostics
scripts/production/emergency.sh recovery   # prod only
scripts/production/emergency.sh reset      # prompts, destructive
```

## Deploying staging / production

Run **on the target server** from the correct checkout (see table above). You do
not have to `cd` into the repo first if defaults match your server:

```bash
/home/emrprod/emr/scripts/production/deploy.sh    # production
/srv/emr/scripts/staging/deploy.sh                # staging
```

`deploy.sh` does:

1. Verify the host has the expected LAN IP (warns if not). Set `SERVER_IP=` to skip the check.
2. Pre-deploy DB snapshot (unless `--no-backup`)
3. `git pull` (hard reset to `origin/<current-branch>`)
4. `docker compose down` → `docker compose up -d --build`
5. Wait for `/api/health/live/` to be healthy
6. On failure: automatic rollback to the pre-deploy snapshot (unless
   `--no-rollback`)

Environment-relevant overrides (examples):

```bash
# Production with a non-standard checkout path
DEPLOY_PATH=/opt/emr /home/emrprod/emr/scripts/production/deploy.sh

# Skip host IP check entirely
SERVER_IP= /home/emrprod/emr/scripts/production/deploy.sh

# Custom backup directory (must be writable by the SSH user)
BACKUP_DIR=/var/backups/emr /home/emrprod/emr/scripts/production/deploy.sh
```

## Adding a new operation

1. Put the actual logic in `stack/` (if it's part of service lifecycle) or
   `ops/` (if it's operational). Accept `<env>` as the first argument and
   call `stack_init_env "$1"` right after sourcing `lib/stack-utils.sh`.
2. Add a matching thin wrapper under each of `local/`, `staging/`,
   `production/` (unless the command truly only makes sense for some).
3. If it belongs in the manager CLI, add a `cmd_<name>` to
   `ops/manager.sh` and register it in the dispatcher.
4. Document it in this README.

## Conventions

- Every script starts with `set -euo pipefail`.
- Every script sources `lib/stack-utils.sh` and (where useful) `lib/ui.sh`.
- No hard-coded compose filenames, container names, or URLs — always go
  through the `STACK_*` variables populated by `stack_init_env`.
- No colour code duplication — always use `ui_success/ui_error/ui_info/…`.
- The env-specific directories contain *only* thin wrappers. If you feel the
  need to put logic there, push it down into `stack/` or `ops/` instead.
