# EMR Production Operations Guide

## Overview
This guide provides essential commands and procedures for operating the EMR production system.

All production operations go through **`scripts/production/*.sh`** — thin wrappers around the env-aware scripts in `scripts/stack/` and `scripts/ops/`. See `scripts/README.md` for the full architecture.

## Directory Structure

### Root Level
- `backend/` - Backend application code (Django)
- `frontend/` - Frontend application code (Next.js)
- `scripts/` - Operational scripts (see `scripts/README.md`)
  - `scripts/lib/` — shared helpers (env resolution, colours/logging)
  - `scripts/stack/` — generic stack lifecycle scripts (take env as arg)
  - `scripts/ops/` — generic operational scripts (take env as arg)
  - `scripts/production/` — thin wrappers pre-bound to `prod`
  - `scripts/staging/`, `scripts/local/` — same for their envs
  - `scripts/backup/`, `scripts/monitoring/`, `scripts/security/`, `scripts/testing/`
- `nginx/` - Nginx configuration for all environments (`nginx.conf` is prod; `local.conf`, `stag.conf` for other envs; `prod.conf.reference` is the extended prod config with HSTS + auth rate-limiting, kept for reference)
- `docker-compose.local.yml` / `docker-compose.stag.yml` / `docker-compose.prod.yml` - Docker Compose per environment, at the repo root
- `logs/` - Runtime logs (bind-mounted into containers; git-ignored)
- `backups/` - Backup output (bind-mounted into the backup container; git-ignored)
- `ssl/` - SSL certificates (git-ignored)
- `docs/` - Documentation and guides
- `Makefile` - Build and development tasks
- `README.md` - Project overview and setup instructions

## Quick Start Commands

### System Management
```bash
# Start EMR production system
./scripts/production/start.sh

# Stop EMR production system
./scripts/production/stop.sh

# Check system status (services + health + URLs)
./scripts/production/status.sh

# Unified ops CLI
./scripts/production/manager.sh status
```

### Monitoring & Health
```bash
# Real-time health dashboard (continuous)
./scripts/production/dashboard.sh

# One-shot health probes (backend + frontend)
./scripts/production/health.sh

# Performance monitoring
./scripts/production/manager.sh performance
```

### Backup Operations
```bash
# Manual backup
./scripts/production/manager.sh backup

# Check backup status
./scripts/production/manager.sh backup-status

# Verify backup integrity
./scripts/production/manager.sh verify-backup
```

## Production Manager Commands

The unified manager — `./scripts/production/manager.sh` — provides comprehensive production operations. It's a thin wrapper that invokes `scripts/ops/manager.sh prod <command>`.

### Service Management
```bash
./scripts/production/manager.sh start      # Start all services
./scripts/production/manager.sh stop       # Stop all services
./scripts/production/manager.sh restart    # Restart all services
./scripts/production/manager.sh status     # Show service status
```

### Monitoring & Diagnostics
```bash
./scripts/production/manager.sh health        # Run health checks
./scripts/production/manager.sh monitor       # System monitoring
./scripts/production/manager.sh alerts        # Check for alerts
./scripts/production/manager.sh logs          # View recent logs
./scripts/production/manager.sh diagnostics   # Full system diagnostics
```

### Backup Management
```bash
./scripts/production/manager.sh backup          # Manual backup
./scripts/production/manager.sh backup-status   # Backup status
./scripts/production/manager.sh verify-backup   # Verify backups
```

### Maintenance
```bash
./scripts/production/manager.sh update     # Pull, rebuild, migrate (DOWNTIME)
./scripts/production/manager.sh cleanup    # Prune dangling images + old logs
./scripts/production/manager.sh shell      # Shell into backend container
```

### Emergency Operations
```bash
./scripts/production/emergency.sh stop          # Emergency stop
./scripts/production/emergency.sh restart       # Emergency restart
./scripts/production/emergency.sh recovery      # Disaster recovery (restore last snapshot)
./scripts/production/emergency.sh diagnostics   # Emergency diagnostics
./scripts/production/emergency.sh reset         # System reset (DANGEROUS — wipes volumes)
```

### Deployment
```bash
# Run on the production server, inside the repo checkout
./scripts/production/deploy.sh
# Does: pre-deploy DB snapshot → git pull → rebuild → health check → rollback on failure
```

## Daily Operations Checklist

### Morning Startup
```bash
# 1. Check system status
./scripts/production/status.sh

# 2. Start services if needed
./scripts/production/start.sh

# 3. Verify health
./scripts/production/manager.sh health
```

### Daily Monitoring
```bash
# Check alerts
./scripts/production/manager.sh alerts

# Review logs (last 50 lines per service)
./scripts/production/manager.sh logs

# Continuous dashboard
./scripts/production/dashboard.sh
```

### Evening Maintenance
```bash
# Verify backup completed (automatic at 10 PM)
./scripts/production/manager.sh backup-status

# Clean up old logs & dangling images
./scripts/production/manager.sh cleanup
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
1. Check status: `./scripts/production/status.sh`
2. Emergency restart: `./scripts/production/emergency.sh restart`
3. If no response, emergency recovery: `./scripts/production/emergency.sh recovery`

### Data Issues
1. Stop services: `./scripts/production/stop.sh`
2. Restore from backup: `./scripts/production/emergency.sh recovery`
3. Verify data integrity
4. Restart services

### Complete Failure
1. Emergency stop: `./scripts/production/emergency.sh stop`
2. System reset: `./scripts/production/emergency.sh reset`
3. Full recovery: `./scripts/production/emergency.sh recovery`

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

**System ready for production healthcare operations!** 🏥✨
