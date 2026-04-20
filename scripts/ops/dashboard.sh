#!/usr/bin/env bash
# Real-time health dashboard for a given environment.
# Usage: scripts/ops/dashboard.sh <env> [--once] [--interval N]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/stack-utils.sh
source "${SCRIPT_DIR}/../lib/stack-utils.sh"
# shellcheck source=../lib/ui.sh
source "${SCRIPT_DIR}/../lib/ui.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/ops/dashboard.sh <env> [options]

Environments: local | stag | prod

Options:
  --once           Render once and exit (non-interactive)
  --interval <N>   Refresh interval in seconds (default: 30)

Examples:
  scripts/ops/dashboard.sh prod
  scripts/ops/dashboard.sh stag --once
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

stack_init_env "$1"
shift

ONCE=false
INTERVAL=30

while [[ $# -gt 0 ]]; do
    case "$1" in
        --once) ONCE=true; shift ;;
        --interval) INTERVAL="$2"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
    esac
done

render_header() {
    printf '%b%s%b\n' "$UI_BLUE" "================================================================================" "$UI_NC"
    printf '%b        EMR %-10s HEALTH DASHBOARD%b\n' "$UI_BLUE" "${STACK_ENVIRONMENT_TITLE}" "$UI_NC"
    printf '%b%s%b\n' "$UI_BLUE" "================================================================================" "$UI_NC"
    printf '%bHost: %s | Time: %s | User: %s%b\n' "$UI_WHITE" "$(hostname)" "$(date)" "$(whoami)" "$UI_NC"
    printf '%b%s%b\n' "$UI_BLUE" "--------------------------------------------------------------------------------" "$UI_NC"
}

render_system() {
    ui_subheader "HOST"
    echo "  Uptime: $(uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}' 2>/dev/null || echo 'n/a')"
    case "$(uname -s)" in
        Linux)
            local cpu mem disk
            cpu=$(top -bn1 2>/dev/null | grep -i "cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
            mem=$(free 2>/dev/null | awk '/Mem:/ {printf "%.1f", $3/$2 * 100.0}')
            disk=$(df / | tail -1 | awk '{print $5}' | tr -d %)
            echo "  CPU:    ${cpu:-n/a}%"
            echo "  Memory: ${mem:-n/a}%"
            echo "  Disk /: ${disk:-n/a}%"
            if [[ -n "${cpu:-}" ]] && awk -v v="$cpu" 'BEGIN{exit !(v+0 > 80)}'; then ui_warning "   HIGH CPU USAGE"; fi
            if [[ -n "${mem:-}" ]] && awk -v v="$mem" 'BEGIN{exit !(v+0 > 85)}'; then ui_warning "   HIGH MEMORY USAGE"; fi
            if [[ -n "${disk:-}" && "$disk" -gt 90 ]]; then ui_warning "   HIGH DISK USAGE"; fi
            ;;
        Darwin) echo "  (macOS — see Activity Monitor)" ;;
    esac
}

render_services() {
    ui_subheader "DOCKER SERVICES"
    stack_compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || ui_error "Unable to query compose services"
}

render_app() {
    ui_subheader "APPLICATION HEALTH"
    if curl -s -f --max-time 5 "$STACK_HEALTH_URL" >/dev/null 2>&1; then
        ui_success "Backend: $STACK_HEALTH_URL"
    else
        ui_error "Backend: $STACK_HEALTH_URL"
    fi
    if [[ -n "$STACK_FRONTEND_URL" ]]; then
        if curl -s -f --max-time 5 "$STACK_FRONTEND_URL" >/dev/null 2>&1; then
            ui_success "Frontend: $STACK_FRONTEND_URL"
        else
            ui_error "Frontend: $STACK_FRONTEND_URL"
        fi
    fi
}

render_backups() {
    [[ "$STACK_ENVIRONMENT" != "production" ]] && return 0
    ui_subheader "BACKUPS"
    local backup_dir="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
    if [[ -d "$backup_dir" ]]; then
        local count
        count=$(find "$backup_dir" -maxdepth 1 -name "20*" -type d 2>/dev/null | wc -l | tr -d ' ')
        echo "  Total backups: ${count}"
        local latest
        latest=$(find "$backup_dir" -maxdepth 1 -name "20*" -type d 2>/dev/null \
            | xargs -I{} sh -c 'stat -c "%Y {}" "{}" 2>/dev/null || stat -f "%m {}" "{}" 2>/dev/null' \
            | sort -n | tail -1 | awk '{print $2}')
        if [[ -n "${latest:-}" ]]; then
            echo "  Latest:        $(basename "$latest")"
            echo "  Size:          $(du -sh "$latest" 2>/dev/null | cut -f1)"
        else
            ui_warning "No backup snapshots found"
        fi
    else
        ui_error "Backup directory not found: ${backup_dir}"
    fi
}

render_footer() {
    printf '%b%s%b\n' "$UI_BLUE" "================================================================================" "$UI_NC"
    printf '%bCommands (same env):%b\n' "$UI_WHITE" "$UI_NC"
    printf '  %bscripts/%s/manager.sh status%b\n' "$UI_CYAN" "$STACK_ENVIRONMENT" "$UI_NC"
    printf '  %bscripts/%s/manager.sh health%b\n' "$UI_CYAN" "$STACK_ENVIRONMENT" "$UI_NC"
    printf '  %bscripts/%s/emergency.sh <cmd>%b\n' "$UI_CYAN" "$STACK_ENVIRONMENT" "$UI_NC"
    printf '%b%s%b\n' "$UI_BLUE" "================================================================================" "$UI_NC"
}

render_all() {
    clear
    render_header
    render_system
    echo
    render_services
    echo
    render_app
    echo
    render_backups
    echo
    render_footer
}

if $ONCE; then
    render_all
else
    trap 'echo; ui_info "dashboard exited"; exit 0' INT
    while true; do
        render_all
        printf '%bRefreshing in %ss… (Ctrl+C to exit)%b\n' "$UI_YELLOW" "$INTERVAL" "$UI_NC"
        sleep "$INTERVAL"
    done
fi
