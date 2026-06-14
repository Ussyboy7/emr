# Operations runbook

Single reference for running the EMR stack in **local**, **staging**, and **production**. Script details: [../../scripts/README.md](../../scripts/README.md).

## Entry point

```bash
./scripts/production/env-manager.sh <command>   # prod
./scripts/staging/env-manager.sh <command>    # staging
./scripts/local/env-manager.sh <command>      # local
```

Each wrapper pins the environment and delegates to `scripts/ops/env-manager.sh`.

## Daily commands

| Task | Command |
|------|---------|
| Status | `env-manager.sh status` |
| Start | `env-manager.sh start` |
| Stop | `env-manager.sh stop` |
| Restart | `env-manager.sh restart` |
| Health | `env-manager.sh health` |
| Logs | `env-manager.sh logs [service] [--follow]` |
| Dashboard | `env-manager.sh dashboard` |

## Deploy (production)

```bash
./scripts/production/env-manager.sh deploy
```

Flow: pre-deploy DB snapshot → `git pull` → rebuild containers → health check → automatic rollback on failure.

Flags: `--no-backup`, `--no-pull`, `--no-rollback`, `--skip-health`.

## Backups

| Task | Command |
|------|---------|
| Manual backup | `env-manager.sh backup` |
| Backup status | `env-manager.sh backup-status` |
| Verify | `env-manager.sh verify-backup` |

Automated: `emr-backup-prod` container runs `scripts/backup/docker_backup.sh` on a schedule. Files land in `./backups/<timestamp>/` with `MANIFEST.txt`.

**Admin UI:** `/admin/health#backup` shows whether the API can find backup files. Local dev often shows “Not configured” until a backup job runs or `BACKUP_DIR` is set.

Search paths (backend): `BACKUP_DIR`, `/backups`, `emr/backups/`, `~/emr_backups`, `~/emr-predeploy-backups`.

## System health (application)

| Check | Where |
|-------|--------|
| Admin dashboard | `/admin` → System Health card |
| Detail page | `/admin/health` |
| Liveness | `GET /health/live/` |
| Readiness | `GET /health/` (DB + Redis) |
| Metrics | `GET /api/v1/common/metrics/` |

## Emergency

```bash
./scripts/production/env-manager.sh emergency restart
./scripts/production/env-manager.sh emergency recovery   # restore last snapshot
./scripts/production/env-manager.sh emergency stop
# DANGEROUS — data loss:
./scripts/production/env-manager.sh emergency reset
```

## Directory layout (runtime)

| Path | Purpose |
|------|---------|
| `logs/` | Application logs (git-ignored) |
| `backups/` | Backup output (git-ignored) |
| `ssl/` | TLS certs (git-ignored) |
| `nginx/nginx.conf` | Production nginx |
| `docker-compose.prod.yml` | Production stack |

## Environments

Configure secrets in `backend/env/{local,stag,prod}.env` — never commit real credentials.

| Service | Typical internal ports |
|---------|------------------------|
| Nginx | 80, 443 |
| Frontend | 3000 |
| Backend | 8000 |
| PostgreSQL | 5432 |
| Redis | 6379 |

External port mapping may differ per server; see your compose file and admin guide.

## Related docs

- [../admin/EMR_ADMINISTRATION_GUIDE.md](../admin/EMR_ADMINISTRATION_GUIDE.md) — user/clinic admin
- [../admin/EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md) — support procedures
- [../testing/EMR_GO_LIVE_CHECKLIST.md](../testing/EMR_GO_LIVE_CHECKLIST.md) — go-live
- [../architecture/OVERVIEW.md](../architecture/OVERVIEW.md) — architecture

## Historical deployment log

The original step-by-step production deployment narrative is archived at [../archive/EMR_DEPLOYMENT_HISTORY.md](../archive/EMR_DEPLOYMENT_HISTORY.md) for reference only.
