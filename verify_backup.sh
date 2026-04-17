#!/bin/bash

# EMR Backup Verification and Restore Test Script
# This script tests backup integrity and restore procedures

set -e

# Configuration
BACKUP_ROOT="/home/emrprod/emr/backups"
TEST_DB="emrprod_test_restore"
LOG_FILE="${BACKUP_ROOT}/restore_test.log"

# Database connection details
DB_HOST="postgres"
DB_PORT="5432"
DB_USER="emradmin"
DB_PASSWORD="${POSTGRES_PASSWORD}"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Find latest backup
find_latest_backup() {
    local latest_backup=$(find "$BACKUP_ROOT" -name "20*" -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    if [ -z "$latest_backup" ]; then
        error_exit "No backup directories found in $BACKUP_ROOT"
    fi
    echo "$latest_backup"
}

# Test database backup restore
test_db_restore() {
    local backup_dir="$1"
    local db_backup=$(find "$backup_dir" -name "emrprod_db_*.sql" | head -1)

    if [ ! -f "$db_backup" ]; then
        error_exit "Database backup file not found in $backup_dir"
    fi

    log "Testing database backup restore..."
    log "Backup file: $db_backup"

    # Create test database
    log "Creating test database: $TEST_DB"
    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS $TEST_DB;" \
        2>>"$LOG_FILE"

    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d postgres \
        -c "CREATE DATABASE $TEST_DB;" \
        2>>"$LOG_FILE"

    # Restore database
    log "Restoring database from backup..."
    PGPASSWORD="$DB_PASSWORD" pg_restore \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$TEST_DB" \
        --no-password \
        --verbose \
        "$db_backup" \
        2>>"$LOG_FILE"

    if [ $? -eq 0 ]; then
        log "Database restore test: PASSED"

        # Verify some basic tables exist
        local table_count=$(PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$TEST_DB" \
            -t \
            -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" \
            2>/dev/null)

        log "Tables found in restored database: $table_count"

        # Clean up test database
        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d postgres \
            -c "DROP DATABASE $TEST_DB;" \
            2>>"$LOG_FILE"

        log "Test database cleaned up"
    else
        error_exit "Database restore test: FAILED"
    fi
}

# Test media backup
test_media_backup() {
    local backup_dir="$1"
    local media_backup=$(find "$backup_dir" -name "media_*.tar.gz" | head -1)

    if [ -f "$media_backup" ]; then
        log "Testing media backup integrity..."
        if tar -tzf "$media_backup" > /dev/null 2>&1; then
            log "Media backup verification: PASSED"
            local file_count=$(tar -tzf "$media_backup" | wc -l)
            log "Files in media backup: $file_count"
        else
            log "WARNING: Media backup verification: FAILED"
        fi
    else
        log "No media backup found, skipping media verification"
    fi
}

# Generate backup report
generate_report() {
    local backup_dir="$1"
    local report_file="${backup_dir}/VERIFICATION_REPORT.txt"

    cat > "$report_file" << EOF
EMR Backup Verification Report
===============================
Verification Date: $(date)
Backup Directory: $backup_dir
Server: $(hostname)

BACKUP STATUS:
$(ls -la "$backup_dir")

STORAGE USAGE:
$(df -h "$BACKUP_ROOT")

VERIFICATION RESULTS:
- Database Restore Test: See log above
- Media Backup Integrity: See log above

RECOMMENDATIONS:
- Ensure backups are running regularly (cron job)
- Monitor backup sizes and growth trends
- Test full restore procedures quarterly
- Store backups in multiple locations for redundancy

EOF

    log "Verification report generated: $report_file"
}

# Main verification process
main() {
    log "=== EMR Backup Verification Started ==="

    local latest_backup=$(find_latest_backup)
    log "Using latest backup: $latest_backup"

    test_db_restore "$latest_backup"
    test_media_backup "$latest_backup"
    generate_report "$latest_backup"

    log "=== EMR Backup Verification Completed ==="
}

# Run main function
main "$@"