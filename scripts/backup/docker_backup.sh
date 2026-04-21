#!/bin/sh
# EMR Production Backup — runs INSIDE the `backup` sidecar container.
#
# This script is intended to be mounted into the `emr-backup-prod` service
# defined in docker-compose.prod.yml. It connects to the `postgres` service
# directly over the compose network (no docker CLI required), unlike
# `backup_database.sh` which is meant for host-side execution via
# `docker compose exec`.

set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-emrprod}"
DB_USER="${DB_USER:-emradmin}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
LOG_FILE="${BACKUP_ROOT}/backup.log"

log() {
    printf '%s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"
}

mkdir -p "$BACKUP_DIR"

log "=== EMR backup started (target: ${DB_HOST}:${DB_PORT}/${DB_NAME}) ==="

# pg_dump reads PGPASSWORD from env. Accept DB_PASSWORD as well so the
# sidecar can reuse the backend's env file (which uses DB_PASSWORD) without
# duplicating secrets.
if [ -z "${PGPASSWORD:-}" ] && [ -n "${DB_PASSWORD:-}" ]; then
    PGPASSWORD="$DB_PASSWORD"
    export PGPASSWORD
fi

if [ -z "${PGPASSWORD:-}" ]; then
    log "ERROR: neither PGPASSWORD nor DB_PASSWORD is set; refusing to run pg_dump"
    exit 1
fi

DB_BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"

if pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --file="$DB_BACKUP_FILE"
then
    SIZE="$(du -h "$DB_BACKUP_FILE" | cut -f1)"
    log "Database dump OK: ${DB_BACKUP_FILE} (${SIZE})"
else
    log "ERROR: pg_dump failed"
    exit 1
fi

# Manifest
cat > "${BACKUP_DIR}/MANIFEST.txt" <<EOF
EMR Production Backup
Timestamp:  ${TIMESTAMP}
Database:   ${DB_NAME}@${DB_HOST}:${DB_PORT}
Format:     PostgreSQL custom (compressed)
Restore:    pg_restore -h <host> -U ${DB_USER} -d ${DB_NAME} ${DB_NAME}_${TIMESTAMP}.dump
EOF

# Prune backups older than RETENTION_DAYS.
log "Pruning backups older than ${RETENTION_DAYS} day(s)"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true

log "=== EMR backup finished successfully ==="
