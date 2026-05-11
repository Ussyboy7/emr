# Backup & Restore Runbook

This folder contains operational backup/restore scripts for production.

## Scripts

- `docker_backup.sh`  
  Runs inside the `backup` sidecar container and creates daily PostgreSQL dumps
  under `/backups/<timestamp>/`.
- `backup_database.sh`  
  Host-side backup helper (legacy/ops usage).
- `verify_backup.sh`  
  Verifies backup integrity.
- `restore_backup.sh`  
  Disaster recovery restore flow for current production backup format.

## Backup layout

Current production backups are stored as:

```text
backups/
  20260510_224941/
    emrprod_20260510_224941.dump
    MANIFEST.txt
```

`restore_backup.sh` supports:

- `emrprod_*.dump` (current sidecar format)
- `emrprod_db_*.sql` (legacy custom dump naming)

## Restore usage

Run from the repository root (`~/emr` on production):

```bash
chmod +x scripts/backup/restore_backup.sh
./scripts/backup/restore_backup.sh
```

### Non-interactive restore

```bash
./scripts/backup/restore_backup.sh --backup-dir latest --yes
./scripts/backup/restore_backup.sh --backup-dir 20260510_224941 --yes
```

### Options

- `--backup-dir <name|latest>`: Select backup directory without prompt
- `--yes`: Skip confirmation prompt
- `-h`, `--help`: Show help

### Environment overrides

- `BACKUP_ROOT` (default: `./backups`)
- `COMPOSE_FILE` (default: `docker-compose.prod.yml`)
- `ENV_FILE` (default: `./backend/env/prod.env`)
- `DB_NAME` (default: `emrprod`)
- `DB_USER` (default: `emradmin`)

Example:

```bash
ENV_FILE=./backend/env/prod.env BACKUP_ROOT=./backups \
  ./scripts/backup/restore_backup.sh --backup-dir latest --yes
```

## Operational notes

- Restore is destructive for the target DB.
- The script stops app services, restores DB, starts services, then runs
  `migrate` and `collectstatic`.
- If you need an extra safety checkpoint, take an immediate pre-restore
  backup before running restore.
