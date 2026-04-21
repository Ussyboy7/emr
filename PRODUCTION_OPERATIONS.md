# EMR Production Operations Guide

## Overview
This guide provides essential commands and procedures for operating the EMR production system.

All production operations go through a single entry-point:
**`scripts/production/env-manager.sh <command>`**. It's a thin wrapper around
the generic `scripts/ops/env-manager.sh` with the environment pinned to `prod`.
See `scripts/README.md` for the full architecture.

## Directory Structure

### Root Level
- `backend/` - Backend application code (Django)
- `frontend/` - Frontend application code (Next.js)
- `scripts/` - Operational scripts (see `scripts/README.md`)
  - `scripts/lib/` — shared helpers (env resolution, colours/logging)
  - `scripts/stack/` — generic stack lifecycle primitives (take env as arg)
  - `scripts/ops/` — generic operational primitives (take env as arg; includes `env-manager.sh`)
  - `scripts/production/env-manager.sh` — the single prod entry-point
  - `scripts/staging/env-manager.sh`, `scripts/local/env-manager.sh` — same for other envs
  - `scripts/backup/`, `scripts/monitoring/`, `scripts/security/`, `scripts/testing/`
- `nginx/` - Nginx configuration for all environments (`nginx.conf` is prod; `local.conf`, `stag.conf` for other envs; `prod.conf.reference` is the extended prod config with HSTS + auth rate-limiting, kept for reference)
- `docker-compose.local.yml` / `docker-compose.stag.yml` / `docker-compose.prod.yml` - Docker Compose per environment, at the repo root
- `logs/` - Runtime logs (bind-mounted into containers; git-ignored)
- `backups/` - Backup output (bind-mounted into the backup container; git-ignored)
- `ssl/` - SSL certificates (git-ignored)
- `docs/` - Documentation and guides
- `Makefile` - Build and development tasks
- `README.md` - Project overview and setup instructions

## Quick Start

```bash
# Everything is a subcommand of env-manager.sh
./scripts/production/env-manager.sh start
./scripts/production/env-manager.sh stop
./scripts/production/env-manager.sh status
./scripts/production/env-manager.sh help     # full command list
```

## Command Reference

### Service Management
```bash
./scripts/production/env-manager.sh start      # Start all services
./scripts/production/env-manager.sh stop       # Stop all services
./scripts/production/env-manager.sh restart    # Restart all services
./scripts/production/env-manager.sh status     # Show service status
./scripts/production/env-manager.sh shell      # Shell into backend
```

### Monitoring & Diagnostics
```bash
./scripts/production/env-manager.sh health        # HTTP health probes
./scripts/production/env-manager.sh dashboard     # Refreshing dashboard
./scripts/production/env-manager.sh monitor       # System monitor
./scripts/production/env-manager.sh alerts        # Active alerts
./scripts/production/env-manager.sh logs          # Recent logs
./scripts/production/env-manager.sh logs backend --follow
./scripts/production/env-manager.sh diagnostics   # Full diagnostics dump
./scripts/production/env-manager.sh performance   # Short perf probe
```

### Backup Management
```bash
./scripts/production/env-manager.sh backup          # Manual backup
./scripts/production/env-manager.sh backup-status   # Latest snapshots + cron
./scripts/production/env-manager.sh verify-backup   # Verify integrity
```

### Deployment
```bash
# Run on the production server, inside the repo checkout.
# Does: pre-deploy DB snapshot → git pull → rebuild → health check → rollback on failure.
./scripts/production/env-manager.sh deploy

# Flags:
./scripts/production/env-manager.sh deploy --no-backup
./scripts/production/env-manager.sh deploy --no-pull
./scripts/production/env-manager.sh deploy --no-rollback
./scripts/production/env-manager.sh deploy --skip-health
```

### Maintenance
```bash
./scripts/production/env-manager.sh cleanup    # Prune dangling images + old logs
```

### Emergency Operations
```bash
./scripts/production/env-manager.sh emergency stop          # Emergency stop
./scripts/production/env-manager.sh emergency restart       # Emergency restart
./scripts/production/env-manager.sh emergency recovery      # Restore last snapshot
./scripts/production/env-manager.sh emergency diagnostics   # Emergency diagnostics
./scripts/production/env-manager.sh emergency reset         # DANGEROUS — wipes volumes
./scripts/production/env-manager.sh emergency-stop          # shortcut
./scripts/production/env-manager.sh panic                   # shortcut for emergency reset
```

## Daily Operations Checklist

### Morning Startup
```bash
./scripts/production/env-manager.sh status
./scripts/production/env-manager.sh start     # if not already running
./scripts/production/env-manager.sh health
```

### Daily Monitoring
```bash
./scripts/production/env-manager.sh alerts
./scripts/production/env-manager.sh logs
./scripts/production/env-manager.sh dashboard
```

### Evening Maintenance
```bash
./scripts/production/env-manager.sh backup-status
./scripts/production/env-manager.sh cleanup
```

## Automated Operations

The system runs automated operations:

- **Daily Backups**: `emr-backup-prod` container runs `scripts/backup/docker_backup.sh`
  every 24 hours. Backups land in `./backups/<YYYYMMDD_HHMMSS>/` with a
  `MANIFEST.txt`. Retention is controlled by `BACKUP_RETENTION_DAYS`
  (default 7 days).
- **Health Monitoring**: Every 5 minutes (uses `scripts/stack/health.sh prod`)
- **Security Checks**: Every 4 hours (see `scripts/security/`)
- **Log Rotation**: 30-day retention

## Emergency Procedures

### System Down
1. Check status: `./scripts/production/env-manager.sh status`
2. Emergency restart: `./scripts/production/env-manager.sh emergency restart`
3. If no response: `./scripts/production/env-manager.sh emergency recovery`

### Data Issues
1. Stop services: `./scripts/production/env-manager.sh stop`
2. Restore from backup: `./scripts/production/env-manager.sh emergency recovery`
3. Verify data integrity
4. Restart services

### Complete Failure
1. Emergency stop: `./scripts/production/env-manager.sh emergency stop`
2. System reset (DATA LOSS): `./scripts/production/env-manager.sh emergency reset`
3. Full recovery: `./scripts/production/env-manager.sh emergency recovery`

## Key Contacts

- **System Access**: `http://172.16.0.32`
- **Admin Login**: `emrprod` / `Changeme`
- **Emergency Contact**: IT Support
- **Documentation**: EMR_ADMINISTRATION_GUIDE.md

## Performance Benchmarks

- **Response Time**: < 2 seconds
- **Uptime**: > 99.5%
- **CPU Usage**: < 80%
- **Memory Usage**: < 85%
- **Backup Success**: 100%

## Security Requirements

- Change default passwords immediately
- Monitor security logs daily
- Apply updates promptly
- Report suspicious activity
- Maintain audit trails

---

**For detailed procedures, refer to:**
- `scripts/README.md` - Full scripts architecture + command reference
- `EMR_ADMINISTRATION_GUIDE.md` - Complete administration guide
- `EMR_SUPPORT_MAINTENANCE.md` - Support and maintenance procedures
- `EMR_GO_LIVE_CHECKLIST.md` - Go-live procedures

**System ready for production healthcare operations!**
