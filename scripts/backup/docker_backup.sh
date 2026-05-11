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
DB_HOST="${DB_HOST:-}"
DB_PORT="${DB_PORT:-}"
DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
REDIS_HOST="${REDIS_HOST:-}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

require_var() {
    name="$1"
    value="$2"
    if [ -z "$value" ]; then
        echo "ERROR: required env var '$name' is not set" >&2
        exit 1
    fi
}

require_var "DB_HOST" "$DB_HOST"
require_var "DB_PORT" "$DB_PORT"
require_var "DB_NAME" "$DB_NAME"
require_var "DB_USER" "$DB_USER"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
LOG_FILE="${BACKUP_ROOT}/backup.log"

log() {
    printf '%s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"
}

publish_backup_status() {
    status="$1"
    message="$2"
    if [ -z "$REDIS_HOST" ]; then
        log "WARNING: REDIS_HOST not set; skipping backup status publish"
        return 0
    fi

    if ! command -v redis-cli >/dev/null 2>&1; then
        log "WARNING: redis-cli not available; skipping backup status publish"
        return 0
    fi

    now_iso="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    payload="$(printf '{"status":"%s","message":"%s","lastBackup":"%s","hoursAgo":0,"filename":"%s","directory":"%s","source":"backup-sidecar"}' \
        "$status" "$message" "$now_iso" "${DB_BACKUP_FILE##*/}" "$BACKUP_DIR")"

    # 72 hours TTL covers brief backup service outages while keeping stale data bounded.
    if [ -n "$REDIS_PASSWORD" ]; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" \
            SETEX last_backup_status 259200 "$payload" >/dev/null 2>&1
        publish_exit=$?
    else
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            SETEX last_backup_status 259200 "$payload" >/dev/null 2>&1
        publish_exit=$?
    fi

    if [ "$publish_exit" -eq 0 ]; then
        log "Published backup status to Redis cache"
    else
        log "WARNING: failed to publish backup status to Redis cache"
    fi
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
    DB_BACKUP_FILE=""
    log "ERROR: pg_dump failed"
    publish_backup_status "error" "pg_dump failed"
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

publish_backup_status "healthy" "Backup file detected"

log "=== EMR backup finished successfully ==="
