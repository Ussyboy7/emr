#!/usr/bin/env bash
# Unified env-aware operations CLI — works for local, staging, and production.
# Usage: scripts/ops/manager.sh <env> <command>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/stack-utils.sh
source "${SCRIPT_DIR}/../lib/stack-utils.sh"
# shellcheck source=../lib/ui.sh
source "${SCRIPT_DIR}/../lib/ui.sh"

usage() {
    cat <<'USAGE'
EMR Environment Manager

Usage: scripts/ops/manager.sh <env> <command>

Environments:
  local | stag | prod

Service commands:
  start           Start all services
  stop            Stop all services
  restart         Restart all services
  status          Show service + health status
  health          Run health-check suite (scripts/stack/health.sh)
  logs            Tail application logs (last 50 lines per service)

Data / backup commands (mostly prod/stag):
  backup          Run one-off DB backup (scripts/backup/backup_database.sh)
  backup-status   List latest snapshots and cron status
  verify-backup   Verify latest backup integrity
  seed            Run seed_demo_data management command
  seed-reset      Wipe + reseed (CONFIRMATION REQUIRED)

Monitoring & diagnostics:
  monitor         Run scripts/monitoring/monitor_system.sh
  performance     Run scripts/monitoring/monitor_performance.sh
  alerts          Summarise active alerts (services, backups, resources)
  diagnostics     Full system diagnostics dump

Maintenance:
  update          Pull latest code, rebuild, migrate (DOWNTIME)
  cleanup         Remove dangling images + old logs
  shell           Open a shell inside the backend container

Emergency:
  emergency-stop  Force stop all services
  panic           Wipe volumes + rebuild from scratch (DATA LOSS)

Examples:
  scripts/ops/manager.sh local start
  scripts/ops/manager.sh prod status
  scripts/ops/manager.sh stag backup
USAGE
}

if [[ $# -lt 2 ]]; then
    usage
    exit 1
fi

stack_init_env "$1"
shift
CMD="$1"
shift || true

LOG_DIR="${PROJECT_ROOT}/logs/${STACK_ENVIRONMENT}"
MONITOR_LOG="${LOG_DIR}/manager.log"
BACKUP_DIR="${BACKUP_DIR:-$HOME/emr_backups}"
mkdir -p "$LOG_DIR" 2>/dev/null || true

log()    { ui_log "$MONITOR_LOG" "$@"; }
header() { ui_header "$1"; }

cmd_start() {
    header "Starting EMR ${STACK_ENVIRONMENT_TITLE} Services"
    log "Starting ${STACK_ENVIRONMENT} services"
    stack_compose up -d
    ui_info "Waiting 20s for services to settle…"
    sleep 20
    cmd_status
    ui_success "EMR ${STACK_ENVIRONMENT} services started"
    ui_info "Frontend: ${STACK_FRONTEND_URL}"
}

cmd_stop() {
    header "Stopping EMR ${STACK_ENVIRONMENT_TITLE} Services"
    log "Stopping ${STACK_ENVIRONMENT} services"
    stack_compose down
    ui_success "EMR ${STACK_ENVIRONMENT} services stopped"
}

cmd_restart() {
    header "Restarting EMR ${STACK_ENVIRONMENT_TITLE} Services"
    log "Restarting ${STACK_ENVIRONMENT} services"
    stack_compose restart
    sleep 10
    cmd_status
    ui_success "EMR ${STACK_ENVIRONMENT} services restarted"
}

cmd_status() {
    exec "${SCRIPT_DIR}/status.sh" "$STACK_ENVIRONMENT"
}

cmd_health() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Health Check"
    "${SCRIPT_DIR}/../stack/health.sh" "$STACK_ENVIRONMENT" "$@"
}

cmd_logs() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Logs"
    "${SCRIPT_DIR}/logs.sh" "$STACK_ENVIRONMENT" --tail 50
}

cmd_backup() {
    header "Manual EMR ${STACK_ENVIRONMENT_TITLE} Backup"
    log "Running manual backup"
    local script="${PROJECT_ROOT}/scripts/backup/backup_database.sh"
    if [[ -x "$script" ]]; then
        "$script"
    else
        ui_error "Backup script not found: $script"
        exit 1
    fi
}

cmd_backup_status() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Backup Status"
    echo "Backup directory: $BACKUP_DIR"
    if [[ -d "$BACKUP_DIR" ]]; then
        ls -la "$BACKUP_DIR" | head -20
    else
        ui_warning "Backup directory does not exist yet"
    fi
    echo
    echo "Cron jobs:"
    crontab -l 2>/dev/null | grep -i backup || echo "  (none)"
}

cmd_verify_backup() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Backup Verification"
    local script="${PROJECT_ROOT}/scripts/backup/verify_backup.sh"
    if [[ -x "$script" ]]; then
        "$script"
    else
        ui_error "Verification script not found: $script"
        exit 1
    fi
}

cmd_seed() {
    header "Seeding EMR ${STACK_ENVIRONMENT_TITLE} Data"
    "${SCRIPT_DIR}/../stack/seed.sh" "$STACK_ENVIRONMENT" "$@"
}

cmd_seed_reset() {
    header "RESET + Seed EMR ${STACK_ENVIRONMENT_TITLE} Data"
    ui_warning "This will DELETE all existing domain data."
    read -r -p "Type 'YES' to continue: " confirm
    if [[ "$confirm" != "YES" ]]; then
        ui_info "Seed-reset cancelled"
        return 0
    fi
    "${SCRIPT_DIR}/../stack/seed.sh" "$STACK_ENVIRONMENT" -- --reset
}

cmd_monitor() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} System Monitor"
    local script="${PROJECT_ROOT}/scripts/monitoring/monitor_system.sh"
    if [[ -x "$script" ]]; then
        "$script"
    else
        ui_error "Monitoring script not found: $script"
        exit 1
    fi
}

cmd_performance() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Performance Test"
    local script="${PROJECT_ROOT}/scripts/monitoring/monitor_performance.sh"
    if [[ -x "$script" ]]; then
        "$script" 30
    else
        ui_error "Performance script not found: $script"
        exit 1
    fi
}

cmd_alerts() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Alerts"
    local ok=true

    if ! stack_compose ps | grep -qi "up"; then
        ui_error "Services do not appear to be running"
        ok=false
    fi

    if [[ -f "$MONITOR_LOG" ]]; then
        local errs
        errs=$(grep -cE "ERROR|FAILED|ALERT" "$MONITOR_LOG" 2>/dev/null || echo 0)
        if [[ "$errs" -gt 0 ]]; then
            ui_warning "Found ${errs} error-ish entries in ${MONITOR_LOG}"
            tail -5 "$MONITOR_LOG"
            ok=false
        fi
    fi

    if [[ "$STACK_ENVIRONMENT" == "production" ]]; then
        local latest_ts
        latest_ts=$(find "$BACKUP_DIR" -maxdepth 1 -name "20*" -type d 2>/dev/null \
            | xargs -I{} sh -c 'stat -c "%Y" "{}" 2>/dev/null || stat -f "%m" "{}" 2>/dev/null' \
            | sort -n | tail -1)
        if [[ -n "$latest_ts" ]]; then
            local age_h=$(( ( $(date +%s) - latest_ts ) / 3600 ))
            if (( age_h > 25 )); then
                ui_warning "Latest backup is ${age_h}h old"
                ok=false
            fi
        else
            ui_warning "No backups found under ${BACKUP_DIR}"
            ok=false
        fi
    fi

    $ok && ui_success "No active alerts"
}

cmd_diagnostics() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Diagnostics"
    log "Running diagnostics"

    echo "=== System ==="
    uname -a || true
    echo "User: $(whoami)"
    echo "Uptime: $(uptime)"

    echo; echo "=== Docker ==="
    docker --version || true
    docker compose version 2>/dev/null || docker-compose --version || true

    echo; echo "=== Disk ==="
    df -h | head -10

    echo; echo "=== Services ==="
    stack_compose ps || true

    echo; echo "=== Logs (last 20 per service) ==="
    stack_compose logs --tail=20 || true
}

cmd_update() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Update"
    if [[ "$STACK_ENVIRONMENT" != "local" ]]; then
        ui_warning "This will take the ${STACK_ENVIRONMENT} stack offline briefly."
        read -r -p "Proceed? (y/N): " reply
        [[ "$reply" =~ ^[Yy]$ ]] || { ui_info "Update cancelled"; return 0; }
    fi
    log "Update initiated"
    cmd_backup || ui_warning "Pre-update backup skipped/failed"
    ui_step "git pull"
    git pull --ff-only
    ui_step "Rebuilding images"
    stack_compose build
    stack_compose up -d
    ui_step "Running migrations"
    stack_backend_manage migrate --noinput
    sleep 15
    cmd_health
    ui_success "Update complete"
}

cmd_cleanup() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Cleanup"
    log "Running cleanup"
    docker image prune -f
    find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.tmp" -delete 2>/dev/null || true
    ui_success "Cleanup complete"
}

cmd_shell() {
    header "Shell into EMR ${STACK_ENVIRONMENT_TITLE} Backend"
    stack_compose exec "$STACK_BACKEND_SERVICE" /bin/bash || \
        stack_compose exec "$STACK_BACKEND_SERVICE" /bin/sh
}

cmd_emergency_stop() {
    exec "${SCRIPT_DIR}/emergency.sh" "$STACK_ENVIRONMENT" stop
}

cmd_panic() {
    exec "${SCRIPT_DIR}/emergency.sh" "$STACK_ENVIRONMENT" reset
}

case "$CMD" in
    start)          cmd_start ;;
    stop)           cmd_stop ;;
    restart)        cmd_restart ;;
    status)         cmd_status ;;
    health)         cmd_health "$@" ;;
    logs)           cmd_logs ;;

    backup)         cmd_backup ;;
    backup-status)  cmd_backup_status ;;
    verify-backup)  cmd_verify_backup ;;
    seed)           cmd_seed "$@" ;;
    seed-reset)     cmd_seed_reset ;;

    monitor)        cmd_monitor ;;
    performance)    cmd_performance ;;
    alerts)         cmd_alerts ;;
    diagnostics)    cmd_diagnostics ;;

    update)         cmd_update ;;
    cleanup)        cmd_cleanup ;;
    shell)          cmd_shell ;;

    emergency-stop) cmd_emergency_stop ;;
    panic)          cmd_panic ;;

    help|-h|--help|"") usage ;;
    *)
        ui_error "Unknown command: $CMD"
        echo
        usage
        exit 1
        ;;
esac
