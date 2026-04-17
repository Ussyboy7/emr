#!/bin/bash

# EMR Disaster Recovery Script
# This script restores the EMR system from backups

set -e

# Configuration
BACKUP_ROOT="/home/emrprod/emr/backups"
RECOVERY_LOG="${BACKUP_ROOT}/recovery.log"
COMPOSE_FILE="docker-compose.prod.yml"

# Database connection details
DB_HOST="postgres"
DB_PORT="5432"
DB_NAME="emrprod"
DB_USER="emradmin"
DB_PASSWORD="${POSTGRES_PASSWORD}"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$RECOVERY_LOG"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    log "Recovery failed. Check logs at $RECOVERY_LOG"
    exit 1
}

# Validate environment
validate_environment() {
    log "Validating recovery environment..."

    if [ ! -d "$BACKUP_ROOT" ]; then
        error_exit "Backup directory not found: $BACKUP_ROOT"
    fi

    if [ ! -f "$COMPOSE_FILE" ]; then
        error_exit "Docker Compose file not found: $COMPOSE_FILE"
    fi

    log "Environment validation: PASSED"
}

# Select backup to restore from
select_backup() {
    log "Available backups:"
    ls -la "$BACKUP_ROOT" | grep "^d" | grep "20" | tail -10

    echo "Enter backup directory name (or 'latest' for most recent):"
    read -r backup_choice

    if [ "$backup_choice" = "latest" ]; then
        BACKUP_DIR=$(find "$BACKUP_ROOT" -name "20*" -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    else
        BACKUP_DIR="${BACKUP_ROOT}/${backup_choice}"
    fi

    if [ ! -d "$BACKUP_DIR" ]; then
        error_exit "Backup directory not found: $BACKUP_DIR"
    fi

    log "Selected backup: $BACKUP_DIR"
}

# Stop services
stop_services() {
    log "Stopping EMR services..."
    docker compose -f "$COMPOSE_FILE" down
    log "Services stopped"
}

# Restore database
restore_database() {
    local db_backup=$(find "$BACKUP_DIR" -name "emrprod_db_*.sql" | head -1)

    if [ ! -f "$db_backup" ]; then
        error_exit "Database backup not found in $BACKUP_DIR"
    fi

    log "Restoring database from: $db_backup"

    # Start only database service
    log "Starting database service..."
    docker compose -f "$COMPOSE_FILE" up -d postgres

    # Wait for database to be ready
    log "Waiting for database to be ready..."
    sleep 30

    # Drop and recreate database
    log "Preparing database for restore..."
    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS $DB_NAME;" \
        2>>"$RECOVERY_LOG"

    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d postgres \
        -c "CREATE DATABASE $DB_NAME;" \
        2>>"$RECOVERY_LOG"

    # Restore from backup
    log "Restoring database..."
    PGPASSWORD="$DB_PASSWORD" pg_restore \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-password \
        --verbose \
        --clean \
        --if-exists \
        "$db_backup" \
        2>>"$RECOVERY_LOG"

    if [ $? -eq 0 ]; then
        log "Database restore completed successfully"
    else
        error_exit "Database restore failed"
    fi
}

# Restore media files
restore_media() {
    local media_backup=$(find "$BACKUP_DIR" -name "media_*.tar.gz" | head -1)

    if [ -f "$media_backup" ]; then
        log "Restoring media files from: $media_backup"

        # Create media directory if it doesn't exist
        mkdir -p /home/emrprod/emr/media

        # Extract media files
        tar -xzf "$media_backup" -C /home/emrprod/emr/ 2>>"$RECOVERY_LOG"

        if [ $? -eq 0 ]; then
            log "Media files restore completed"
        else
            log "WARNING: Media files restore had issues"
        fi
    else
        log "No media backup found, skipping media restore"
    fi
}

# Run migrations and collect static files
run_post_restore_tasks() {
    log "Running post-restore tasks..."

    # Run Django migrations
    docker compose -f "$COMPOSE_FILE" exec -T backend python manage.py migrate

    # Collect static files
    docker compose -f "$COMPOSE_FILE" exec -T backend python manage.py collectstatic --noinput

    log "Post-restore tasks completed"
}

# Start all services
start_services() {
    log "Starting all EMR services..."
    docker compose -f "$COMPOSE_FILE" up -d
    log "Services started. Waiting for health checks..."

    # Wait for services to be healthy
    sleep 60

    # Check service status
    docker compose -f "$COMPOSE_FILE" ps
}

# Verify recovery
verify_recovery() {
    log "Verifying recovery..."

    # Test database connection
    local db_test=$(PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -c "SELECT count(*) FROM users;" \
        -t 2>/dev/null)

    if [ $? -eq 0 ]; then
        log "Database connectivity: PASSED (Users found: $db_test)"
    else
        error_exit "Database connectivity: FAILED"
    fi

    # Test application health
    sleep 30
    if curl -f http://localhost/api/health/live/ > /dev/null 2>&1; then
        log "Application health check: PASSED"
    else
        log "WARNING: Application health check failed - services may still be starting"
    fi
}

# Main recovery process
main() {
    log "=== EMR Disaster Recovery Started ==="
    log "Recovery initiated by: $(whoami) at $(hostname)"

    validate_environment
    select_backup

    echo "WARNING: This will overwrite the current database and media files!"
    echo "Are you sure you want to proceed? (type 'yes' to continue)"
    read -r confirm
    if [ "$confirm" != "yes" ]; then
        log "Recovery cancelled by user"
        exit 0
    fi

    stop_services
    restore_database
    restore_media
    run_post_restore_tasks
    start_services
    verify_recovery

    log "=== EMR Disaster Recovery Completed Successfully ==="
    log "Recovery completed at: $(date)"
}

# Show usage
usage() {
    echo "EMR Disaster Recovery Script"
    echo "Usage: $0"
    echo ""
    echo "This script will:"
    echo "1. Stop all EMR services"
    echo "2. Restore database from backup"
    echo "3. Restore media files"
    echo "4. Run migrations and collect static files"
    echo "5. Restart all services"
    echo "6. Verify recovery"
}

# Run main function or show usage
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    usage
else
    main "$@"
fi