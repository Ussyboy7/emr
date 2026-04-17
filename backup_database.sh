#!/bin/bash

# EMR Production Backup Script
# This script creates automated backups of PostgreSQL database and media files

set -e  # Exit on any error

# Configuration
# Use home directory for backups to ensure write permissions
BACKUP_ROOT="${HOME}/emr_backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_ROOT}/${DATE}"
LOG_FILE="${BACKUP_ROOT}/backup.log"
RETENTION_DAYS=7

# Database connection details
DB_HOST="localhost"
DB_PORT="5434"  # External port mapping
DB_NAME="emrprod"
DB_USER="emradmin"
DB_PASSWORD="emradmin"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up backups older than ${RETENTION_DAYS} days..."
    find "$BACKUP_ROOT" -name "20*" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null || true
    log "Cleanup completed"
}

# Test database connectivity
test_db_connection() {
    log "Testing database connectivity..."
    if docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
        log "Database connectivity: PASSED"
        return 0
    else
        error_exit "Database connectivity: FAILED"
    fi
}

# Backup PostgreSQL database
backup_database() {
    log "Starting PostgreSQL database backup..."

    local db_backup="${BACKUP_DIR}/emrprod_db_${DATE}.sql"

    # Use pg_dump inside the postgres container
    docker compose -f docker-compose.prod.yml exec -T postgres pg_dump \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=custom \
        --compress=9 \
        --verbose \
        > "$db_backup" \
        2>>"$LOG_FILE"

    if [ $? -eq 0 ]; then
        log "Database backup completed: $db_backup"
        log "Backup size: $(du -h "$db_backup" | cut -f1)"
    else
        error_exit "Database backup failed"
    fi
}

# Backup media files
backup_media() {
    log "Starting media files backup..."

    local media_backup="${BACKUP_DIR}/media_${DATE}.tar.gz"
    local media_source="/app/media"

    if [ -d "$media_source" ]; then
        tar -czf "$media_backup" -C /app media/ 2>>"$LOG_FILE"

        if [ $? -eq 0 ]; then
            log "Media files backup completed: $media_backup"
            log "Media backup size: $(du -h "$media_backup" | cut -f1)"
        else
            log "WARNING: Media files backup failed or no media files found"
        fi
    else
        log "No media directory found, skipping media backup"
    fi
}

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..."

    local db_backup="${BACKUP_DIR}/emrprod_db_${DATE}.sql"

    # Test database backup
    if [ -f "$db_backup" ]; then
        # Check file size is reasonable (> 100KB for a basic EMR database)
        local file_size=$(stat -f%z "$db_backup" 2>/dev/null || stat -c%s "$db_backup" 2>/dev/null)
        if [ "$file_size" -gt 100000 ]; then  # 100KB minimum
            log "Database backup verification: PASSED (Size: $file_size bytes)"
        else
            log "WARNING: Database backup seems too small: $file_size bytes"
        fi
    else
        error_exit "Database backup file not found"
    fi

    # Check backup directory size
    local total_size=$(du -sh "$BACKUP_DIR" | cut -f1)
    log "Total backup size: $total_size"
}

# Create backup manifest
create_manifest() {
    log "Creating backup manifest..."

    local manifest="${BACKUP_DIR}/BACKUP_MANIFEST.txt"

    cat > "$manifest" << EOF
EMR Production Backup Manifest
==============================
Backup Date: $(date)
Backup Directory: $BACKUP_DIR
Server: $(hostname)
Database: $DB_NAME

CONTENTS:
$(ls -la "$BACKUP_DIR")

SYSTEM INFO:
$(uname -a)

BACKUP CONFIGURATION:
- Retention: ${RETENTION_DAYS} days
- Compression: Enabled
- Verification: Enabled

RECOVERY INSTRUCTIONS:
1. Ensure PostgreSQL is running
2. Create target database if needed
3. Run: pg_restore -h localhost -U emradmin -d emrprod /path/to/backup.sql
4. Restore media files: tar -xzf media_backup.tar.gz -C /app/
5. Run migrations: python manage.py migrate
6. Collect static files: python manage.py collectstatic --noinput
EOF

    log "Backup manifest created: $manifest"
}

# Main backup process
main() {
    log "=== EMR Production Backup Started ==="

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    # Test database connectivity first
    test_db_connection

    # Run backup steps
    cleanup_old_backups
    backup_database
    backup_media
    verify_backup
    create_manifest

    log "=== EMR Production Backup Completed Successfully ==="
    log "Backup location: $BACKUP_DIR"

    # List backup contents
    log "Backup contents:"
    ls -la "$BACKUP_DIR" | while read line; do log "$line"; done
}

# Run main function
main "$@"