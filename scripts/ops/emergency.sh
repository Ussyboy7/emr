#!/usr/bin/env bash
# Emergency operations for a given environment.
# Usage: scripts/ops/emergency.sh <env> <command>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/stack-utils.sh
source "${SCRIPT_DIR}/../lib/stack-utils.sh"
# shellcheck source=../lib/ui.sh
source "${SCRIPT_DIR}/../lib/ui.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/ops/emergency.sh <env> <command>

Environments: local | stag | prod

Commands:
  stop         Immediately stop all services (10s timeout)
  restart      Restart all services
  recovery     Start disaster recovery (invokes scripts/backup/restore_backup.sh)
  diagnostics  Dump service + resource status
  reset        Remove containers, volumes, images and rebuild from scratch (DANGEROUS)

Examples:
  scripts/ops/emergency.sh prod diagnostics
  scripts/ops/emergency.sh stag restart
USAGE
}

if [[ $# -lt 2 ]]; then
    usage
    exit 1
fi

stack_init_env "$1"
shift

LOG_FILE="${PROJECT_ROOT}/logs/${STACK_ENVIRONMENT}/emergency.log"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

emergency_header() {
    printf '%b🚨 EMERGENCY MODE — EMR %s 🚨%b\n' "$UI_RED" "${STACK_ENVIRONMENT_TITLE}" "$UI_NC"
    printf '%b========================================%b\n' "$UI_RED" "$UI_NC"
}

emergency_stop() {
    emergency_header
    ui_warning "Stopping all ${STACK_ENVIRONMENT} services immediately"
    ui_log "$LOG_FILE" "Emergency stop initiated by $(whoami)"
    stack_compose down --timeout 10
    ui_success "All services stopped"
}

emergency_restart() {
    emergency_header
    ui_warning "Restarting all ${STACK_ENVIRONMENT} services"
    ui_log "$LOG_FILE" "Emergency restart initiated by $(whoami)"
    stack_compose restart
    sleep 15
    if stack_compose ps | grep -qi "up"; then
        ui_success "Services restarted"
    else
        ui_error "Services failed to restart — run: scripts/ops/emergency.sh ${STACK_ENVIRONMENT} diagnostics"
        exit 1
    fi
}

emergency_recovery() {
    emergency_header
    if [[ "$STACK_ENVIRONMENT" != "production" ]]; then
        ui_warning "Disaster recovery is only wired up for production. Aborting."
        exit 1
    fi
    ui_log "$LOG_FILE" "Emergency recovery initiated by $(whoami)"
    local restore_script="${PROJECT_ROOT}/scripts/backup/restore_backup.sh"
    if [[ -x "$restore_script" ]]; then
        "$restore_script"
    else
        ui_error "Restore script not found or not executable: $restore_script"
        exit 1
    fi
}

emergency_diagnostics() {
    emergency_header
    ui_info "Running emergency diagnostics"
    ui_log "$LOG_FILE" "Emergency diagnostics run by $(whoami)"

    echo; echo "=== System Status ==="
    uptime || true

    echo; echo "=== Service Status ==="
    stack_compose ps || true

    echo; echo "=== Resource Usage ==="
    case "$(uname -s)" in
        Linux)
            echo "CPU:    $(top -bn1 2>/dev/null | grep -i "cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')%"
            echo "Memory: $(free 2>/dev/null | awk '/Mem:/ {printf "%.1f", $3/$2 * 100.0}')%"
            echo "Disk /: $(df / | tail -1 | awk '{print $5}')"
            ;;
        Darwin)
            echo "(macOS — use Activity Monitor)"
            ;;
    esac

    echo; echo "=== Recent Logs (last 20 per service) ==="
    stack_compose logs --tail=20 || true
}

emergency_reset() {
    emergency_header
    ui_error "SYSTEM RESET — this will rebuild the ${STACK_ENVIRONMENT} stack FROM SCRATCH"
    echo
    echo "This will:"
    echo "  1. Stop all services"
    echo "  2. Remove containers AND VOLUMES (data loss)"
    echo "  3. Rebuild and restart"
    echo
    read -r -p "Type 'CONFIRM RESET' to proceed: " confirm
    if [[ "$confirm" != "CONFIRM RESET" ]]; then
        ui_info "Reset cancelled"
        return 0
    fi
    ui_log "$LOG_FILE" "System reset initiated by $(whoami)"
    stack_compose down -v --remove-orphans
    docker system prune -f
    stack_compose build
    stack_compose up -d
    ui_success "Reset completed"
}

case "${1:-}" in
    stop)        emergency_stop ;;
    restart)     emergency_restart ;;
    recovery)    emergency_recovery ;;
    diagnostics) emergency_diagnostics ;;
    reset)       emergency_reset ;;
    -h|--help|"") usage ;;
    *)
        ui_error "Unknown emergency command: $1"
        echo
        usage
        exit 1
        ;;
esac
