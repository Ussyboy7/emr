#!/usr/bin/env bash
# Quick status snapshot for a given environment.
# Usage: scripts/ops/status.sh <local|stag|prod>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/stack-utils.sh
source "${SCRIPT_DIR}/../lib/stack-utils.sh"
# shellcheck source=../lib/ui.sh
source "${SCRIPT_DIR}/../lib/ui.sh"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <local|stag|prod>" >&2
    exit 1
fi

stack_init_env "$1"

ui_header "EMR ${STACK_ENVIRONMENT_TITLE} Status — $(date)"

echo
echo "Services:"
stack_compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo
echo "Health:"
if curl -s -f --max-time 3 "$STACK_HEALTH_URL" >/dev/null 2>&1; then
    ui_success "Backend health check: $STACK_HEALTH_URL"
else
    ui_error "Backend health check: $STACK_HEALTH_URL"
fi
if [[ -n "$STACK_FRONTEND_URL" ]]; then
    if curl -s -f --max-time 3 "$STACK_FRONTEND_URL" >/dev/null 2>&1; then
        ui_success "Frontend reachable:     $STACK_FRONTEND_URL"
    else
        ui_warning "Frontend unreachable:   $STACK_FRONTEND_URL"
    fi
fi

echo
echo "Host resources:"
case "$(uname -s)" in
    Linux)
        if command -v top >/dev/null 2>&1; then
            cpu=$(top -bn1 2>/dev/null | grep -i "cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
            echo "  CPU:    ${cpu:-n/a}%"
        fi
        if command -v free >/dev/null 2>&1; then
            mem=$(free | awk '/Mem:/ {printf "%.1f", $3/$2 * 100.0}')
            echo "  Memory: ${mem}%"
        fi
        echo "  Disk /: $(df / | tail -1 | awk '{print $5}')"
        ;;
    Darwin)
        echo "  (host resource snapshot suppressed on macOS — use Activity Monitor)"
        ;;
esac

# Backup summary (only prod has automated backups wired up today).
if [[ "$STACK_ENVIRONMENT" == "production" ]]; then
    echo
    echo "Latest backup:"
    BACKUP_DIR="${BACKUP_DIR:-$HOME/emr_backups}"
    LATEST=$(find "$BACKUP_DIR" -maxdepth 1 -name "20*" -type d 2>/dev/null \
        | xargs -I{} sh -c 'stat -c "%Y {}" "{}" 2>/dev/null || stat -f "%m {}" "{}" 2>/dev/null' \
        | sort -n | tail -1 | awk '{print $2}')
    if [[ -n "${LATEST:-}" ]]; then
        echo "  $(basename "$LATEST")"
    else
        ui_warning "No backups found under ${BACKUP_DIR}"
    fi
fi
