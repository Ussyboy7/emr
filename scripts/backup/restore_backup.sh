#!/bin/bash

# EMR Disaster Recovery Script
# Restores production from backup directories under ./backups by default.

set -euo pipefail

# Configuration (override via env vars if needed)
BACKUP_ROOT="${BACKUP_ROOT:-$(pwd)/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-./backend/env/prod.env}"
DB_NAME="${DB_NAME:-emrprod}"
DB_USER="${DB_USER:-emradmin}"
RECOVERY_LOG="${RECOVERY_LOG:-${BACKUP_ROOT}/recovery.log}"

BACKUP_DIR=""
DB_BACKUP_FILE=""
BACKUP_FORMAT=""
BACKUP_CHOICE="${BACKUP_CHOICE:-}"
ASSUME_YES=0

compose_cmd() {
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

log() {
    mkdir -p "$(dirname "$RECOVERY_LOG")"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$RECOVERY_LOG"
}

error_exit() {
    log "ERROR: $1"
    log "Recovery failed. Check logs at $RECOVERY_LOG"
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || error_exit "Required command not found: $1"
}

validate_environment() {
    log "Validating recovery environment..."
    require_command docker
    require_command curl

    [ -f "$COMPOSE_FILE" ] || error_exit "Docker Compose file not found: $COMPOSE_FILE"
    [ -f "$ENV_FILE" ] || error_exit "Env file not found: $ENV_FILE"
    [ -d "$BACKUP_ROOT" ] || error_exit "Backup directory not found: $BACKUP_ROOT"

    log "Environment validation: PASSED"
}

list_backups() {
    ls -1d "$BACKUP_ROOT"/20* 2>/dev/null || true
}

select_backup() {
    if [ -n "$BACKUP_CHOICE" ]; then
        if [ "$BACKUP_CHOICE" = "latest" ]; then
            BACKUP_DIR="$(list_backups | sort | tail -1)"
        else
            BACKUP_DIR="${BACKUP_ROOT%/}/${BACKUP_CHOICE}"
        fi
        [ -d "$BACKUP_DIR" ] || error_exit "Backup directory not found: $BACKUP_DIR"
        log "Selected backup (from flag): $BACKUP_DIR"
        return 0
    fi

    log "Available backup directories:"
    list_backups | tail -10

    echo "Enter backup directory name (e.g. 20260510_224941) or 'latest':"
    read -r backup_choice

    if [ "$backup_choice" = "latest" ]; then
        BACKUP_DIR="$(list_backups | sort | tail -1)"
    else
        BACKUP_DIR="${BACKUP_ROOT%/}/${backup_choice}"
    fi

    [ -d "$BACKUP_DIR" ] || error_exit "Backup directory not found: $BACKUP_DIR"
    log "Selected backup: $BACKUP_DIR"
}

detect_db_backup_file() {
    # Current production format (backup sidecar): *.dump
    DB_BACKUP_FILE="$(ls -1 "$BACKUP_DIR"/emrprod_*.dump 2>/dev/null | head -1 || true)"
    if [ -n "$DB_BACKUP_FILE" ] && [ -f "$DB_BACKUP_FILE" ]; then
        BACKUP_FORMAT="dump"
        return 0
    fi

    # Legacy host script format: emrprod_db_*.sql (actually pg_dump custom format despite extension)
    DB_BACKUP_FILE="$(ls -1 "$BACKUP_DIR"/emrprod_db_*.sql 2>/dev/null | head -1 || true)"
    if [ -n "$DB_BACKUP_FILE" ] && [ -f "$DB_BACKUP_FILE" ]; then
        BACKUP_FORMAT="custom-sql-ext"
        return 0
    fi

    error_exit "No supported database backup found in $BACKUP_DIR"
}

stop_services_for_restore() {
    log "Stopping app services for restore window..."
    compose_cmd stop frontend backend celery-worker celery-beat nginx || true
    log "Ensuring postgres is running..."
    compose_cmd up -d postgres
}

wait_for_postgres() {
    log "Waiting for postgres readiness..."
    for _ in $(seq 1 30); do
        if compose_cmd exec -T postgres pg_isready -U "$DB_USER" >/dev/null 2>&1; then
            log "Postgres is ready"
            return 0
        fi
        sleep 2
    done
    error_exit "Postgres did not become ready in time"
}

recreate_database() {
    log "Dropping and recreating database '$DB_NAME'..."
    compose_cmd exec -T postgres psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
    compose_cmd exec -T postgres psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
}

restore_database() {
    detect_db_backup_file
    log "Restoring database from: $DB_BACKUP_FILE (format: $BACKUP_FORMAT)"

    recreate_database

    if [ "$BACKUP_FORMAT" = "dump" ] || [ "$BACKUP_FORMAT" = "custom-sql-ext" ]; then
        # Stream file into postgres container so we don't depend on host pg_restore.
        cat "$DB_BACKUP_FILE" | compose_cmd exec -T postgres \
            pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges --verbose
    else
        error_exit "Unsupported backup format: $BACKUP_FORMAT"
    fi

    log "Database restore completed successfully"
}

restore_media() {
    local media_backup
    media_backup="$(ls -1 "$BACKUP_DIR"/media_*.tar.gz 2>/dev/null | head -1 || true)"

    if [ -z "$media_backup" ]; then
        log "No media backup found in $BACKUP_DIR, skipping media restore"
        return 0
    fi

    log "Restoring media from: $media_backup"
    mkdir -p ./media
    tar -xzf "$media_backup" -C . 2>>"$RECOVERY_LOG" || log "WARNING: media extraction reported issues"
    log "Media restore step completed"
}

start_services() {
    log "Starting all services..."
    compose_cmd up -d
    sleep 20
    compose_cmd ps
}

run_post_restore_tasks() {
    log "Running post-restore tasks..."
    compose_cmd exec -T backend python manage.py migrate
    compose_cmd exec -T backend python manage.py collectstatic --noinput
    log "Post-restore tasks completed"
}

verify_recovery() {
    log "Verifying recovery..."
    compose_cmd exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null

    if curl -fsS http://localhost/api/health/live/ >/dev/null 2>&1; then
        log "Application health check: PASSED"
    else
        log "WARNING: Application health check failed - services may still be warming up"
    fi
}

usage() {
    cat <<EOF
EMR Disaster Recovery Script

Usage:
  $0
  $0 --backup-dir 20260510_224941 --yes
  $0 --backup-dir latest --yes

Optional environment overrides:
  BACKUP_ROOT   (default: ./backups)
  COMPOSE_FILE  (default: docker-compose.prod.yml)
  ENV_FILE      (default: ./backend/env/prod.env)
  DB_NAME       (default: emrprod)
  DB_USER       (default: emradmin)

Options:
  --backup-dir <name|latest>  Select backup directory without prompt.
  --yes                       Skip confirmation prompt.
  -h, --help                  Show this help message.

This script will:
  1) Ask you to choose a backup directory
  2) Stop app services (keeps postgres up)
  3) Drop/recreate DB and restore from backup
  4) Optionally restore media archive if present
  5) Start services and run migrate/collectstatic
  6) Run basic verification checks
EOF
}

main() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --backup-dir)
                [ "$#" -ge 2 ] || error_exit "--backup-dir requires a value"
                BACKUP_CHOICE="$2"
                shift 2
                ;;
            --yes)
                ASSUME_YES=1
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                error_exit "Unknown argument: $1"
                ;;
        esac
    done

    log "=== EMR Disaster Recovery Started ==="
    log "Recovery initiated by: $(whoami) on $(hostname)"

    validate_environment
    select_backup

    if [ "$ASSUME_YES" -eq 1 ]; then
        log "Confirmation prompt skipped (--yes supplied)"
    else
        echo "WARNING: This will overwrite database '$DB_NAME'."
        echo "Type 'yes' to continue:"
        read -r confirm
        [ "$confirm" = "yes" ] || { log "Recovery cancelled by user"; exit 0; }
    fi

    stop_services_for_restore
    wait_for_postgres
    restore_database
    restore_media
    start_services
    run_post_restore_tasks
    verify_recovery

    log "=== EMR Disaster Recovery Completed Successfully ==="
}

main "$@"