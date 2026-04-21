#!/bin/bash

# EMR System Monitoring and Health Check Script
# Monitors services, logs, and system health

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/monitoring.log"
BACKUP_LOG="${HOME}/emr_backups/cron.log"
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DATA_LOG="${HOME}/emr_backups/backup.log"
ALERT_EMAIL="admin@emr.npa.local"  # Update with actual email

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Alert function
alert() {
    local message="$1"
    log "ALERT: $message"
    # Send email alert (uncomment when email is configured)
    # echo "$message" | mail -s "EMR System Alert" "$ALERT_EMAIL"
}

# Check Docker services status
check_services() {
    log "Checking Docker services..."

    local services=("emr-nginx-prod" "emr-backend-prod" "emr-frontend-prod" "emr-postgres-prod" "emr-redis-prod")
    local failed_services=()

    for service in "${services[@]}"; do
        if docker ps --filter "name=$service" --filter "status=running" | grep -q "$service"; then
            log "✅ $service: RUNNING"
        else
            log "❌ $service: NOT RUNNING"
            failed_services+=("$service")
        fi
    done

    if [ ${#failed_services[@]} -ne 0 ]; then
        alert "Services not running: ${failed_services[*]}"
        return 1
    fi

    return 0
}

# Check application health endpoints
check_health() {
    log "Checking application health..."

    # Check Nginx health endpoint
    if curl -f -s http://localhost/health > /dev/null 2>&1; then
        log "✅ Nginx health check: PASSED"
    else
        log "❌ Nginx health check: FAILED"
        alert "Nginx health check failed"
        return 1
    fi

    # Check backend health (if available)
    if curl -f -s http://localhost/api/health/live/ > /dev/null 2>&1; then
        log "✅ Backend health check: PASSED"
    else
        log "⚠️  Backend health check: FAILED (may not be implemented)"
    fi

    return 0
}

# Check system resources
check_resources() {
    log "Checking system resources..."

    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    log "CPU Usage: ${cpu_usage}%"

    if (( $(echo "$cpu_usage > 90" | bc -l) )); then
        alert "High CPU usage: ${cpu_usage}%"
    fi

    # Memory usage
    local mem_usage=$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')
    log "Memory Usage: ${mem_usage}%"

    if (( $(echo "$mem_usage > 90" | bc -l) )); then
        alert "High memory usage: ${mem_usage}%"
    fi

    # Disk usage
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    log "Disk Usage (/): ${disk_usage}%"

    if [ "$disk_usage" -gt 90 ]; then
        alert "High disk usage: ${disk_usage}%"
    fi
}

# Check backup status
check_backups() {
    log "Checking backup status..."

    if [ -f "$BACKUP_LOG" ]; then
        # Check if last backup was successful
        local last_backup=$(grep -E "(Backup Started|Backup Completed)" "$BACKUP_LOG" | tail -2)
        if [ -n "$last_backup" ]; then
            log "Last backup status: $last_backup"
        fi

        # Check if backup ran today
        local today=$(date +%Y-%m-%d)
        if grep -q "$today" "$BACKUP_LOG" && grep -q "Backup Completed" "$BACKUP_LOG"; then
            log "✅ Backup ran today: SUCCESS"
        else
            log "⚠️  No backup completed today"
            # Check if cron job ran at all
            if grep -q "$today" "$BACKUP_LOG"; then
                log "ℹ️  Backup cron job executed today but may have failed"
            else
                log "⚠️  Backup cron job did not run today"
                alert "Daily backup cron job failed to execute"
            fi
        fi
    else
        log "❌ Backup cron log not found at $BACKUP_LOG"
        alert "Backup system not logging properly"
    fi

    # Check for actual backup files
    local backup_count=$(find "${HOME}/emr_backups" -name "20*" -type d 2>/dev/null | wc -l)
    if [ "$backup_count" -gt 0 ]; then
        log "✅ Found $backup_count backup(s) in ${HOME}/emr_backups"
        local latest_backup=$(find "${HOME}/emr_backups" -name "20*" -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
        if [ -n "$latest_backup" ]; then
            log "📅 Latest backup: $(basename "$latest_backup")"
        fi
    else
        log "⚠️  No backup directories found"
    fi
}

# Check log files for errors
check_logs() {
    log "Checking log files for errors..."

    local error_patterns=("ERROR" "CRITICAL" "FAILED" "Exception" "Traceback")

    # Check backup logs
    if [ -f "$BACKUP_DATA_LOG" ]; then
        local recent_errors=$(grep -i -E "($(IFS='|'; echo "${error_patterns[*]}"))" "$BACKUP_DATA_LOG" | wc -l)
        if [ "$recent_errors" -gt 0 ]; then
            log "⚠️  Found $recent_errors error(s) in backup log"
            grep -i -E "($(IFS='|'; echo "${error_patterns[*]}"))" "$BACKUP_DATA_LOG" | tail -1 | log
        else
            log "✅ Backup log: No recent errors"
        fi
    else
        log "⚠️  Backup data log not found (backups may not have run yet)"
    fi

    # Check nginx logs inside container
    if docker ps | grep -q emr-nginx-prod; then
        local nginx_errors=$(docker logs emr-nginx-prod 2>&1 | grep -i -E "($(IFS='|'; echo "${error_patterns[*]}"))" | wc -l)
        if [ "$nginx_errors" -gt 0 ]; then
            log "⚠️  Found $nginx_errors error(s) in nginx logs"
            docker logs emr-nginx-prod 2>&1 | grep -i -E "($(IFS='|'; echo "${error_patterns[*]}"))" | tail -1 | log
        else
            log "✅ Nginx logs: No recent errors"
        fi
    else
        log "⚠️  Nginx container not running"
    fi
}

# Generate monitoring report
generate_report() {
    local report_file="/home/emrprod/emr/monitoring_report_$(date +%Y%m%d).txt"

    cat > "$report_file" << EOF
EMR System Monitoring Report
===========================
Report Date: $(date)
Server: $(hostname)

SYSTEM RESOURCES:
$(top -bn1 | head -5)
$(free -h)
$(df -h)

DOCKER SERVICES:
$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}")

BACKUP STATUS:
$(tail -10 "$BACKUP_LOG" 2>/dev/null || echo "Backup log not available")

RECENT LOGS:
$(tail -20 "$LOG_FILE" 2>/dev/null || echo "Monitoring log not available")

EOF

    log "Monitoring report generated: $report_file"
}

# Main monitoring function
main() {
    log "=== EMR System Monitoring Started ==="

    local exit_code=0

    check_services || exit_code=1
    check_health || exit_code=1
    check_resources || exit_code=1
    check_backups || exit_code=1
    check_logs || exit_code=1
    generate_report

    if [ $exit_code -eq 0 ]; then
        log "=== EMR System Monitoring: ALL CHECKS PASSED ==="
    else
        log "=== EMR System Monitoring: ISSUES DETECTED ==="
        alert "System monitoring detected issues - check $LOG_FILE"
    fi

    exit $exit_code
}

# Run main function
main "$@"