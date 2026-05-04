#!/usr/bin/env bash
# Unified env-aware operations CLI — works for local, staging, and production.
# Every subcommand that makes sense for an environment is routed through here;
# the per-env thin wrappers (scripts/<env>/env-manager.sh) just pin the first
# argument.
#
# Usage: scripts/ops/env-manager.sh <env> <command> [args]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/stack-utils.sh
source "${SCRIPT_DIR}/../lib/stack-utils.sh"
# shellcheck source=../lib/ui.sh
source "${SCRIPT_DIR}/../lib/ui.sh"

usage() {
    cat <<'USAGE'
EMR Environment Manager

Usage: scripts/ops/env-manager.sh <env> <command> [args]

Environments:
  local | stag | prod

Service:
  start            Bring the stack up
  stop             Bring the stack down
  restart          Rolling restart
  status           Services, health, resources snapshot
  health           HTTP health probes (backend + frontend)
  logs [svc]       Tail logs (default: last 100 lines, all services)
  backend-status   Detailed backend container / DB smoke check
  dashboard        Refreshing real-time dashboard
  shell            Open a shell inside the backend container

Data:
  seed             Run seed_demo_data management command
  seed-reset       Wipe + reseed (prompts)
  backup           One-off DB snapshot
  backup-status    List snapshots and cron status
  verify-backup    Verify latest backup integrity

Monitoring:
  monitor          System monitor (scripts/monitoring/monitor_system.sh)
  performance      Short performance probe
  alerts           Summarise active alerts
  diagnostics      Full diagnostics dump

Deployment (stag/prod only):
  deploy [flags]   Pull + rebuild + health check, with pre-deploy DB snapshot
                   and automatic rollback on failure.
                   Flags: --no-backup --no-pull --no-rollback --skip-health
  update           Alias for `deploy`.

Maintenance:
  cleanup          Prune dangling images + old logs

Emergency:
  emergency <cmd>  stop | restart | recovery | diagnostics | reset
  emergency-stop   Shortcut for `emergency stop`
  panic            Shortcut for `emergency reset` (DATA LOSS, prompts)

Examples:
  scripts/ops/env-manager.sh local start
  scripts/ops/env-manager.sh prod status
  scripts/ops/env-manager.sh stag deploy
  scripts/ops/env-manager.sh prod logs backend --follow
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

case "$1" in
    -h|--help|help)
        usage
        exit 0
        ;;
esac

if [[ $# -lt 2 ]]; then
    usage
    exit 1
fi

stack_init_env "$1"
# Ensure docker-compose interpolation gets canonical env values from STACK_ENV_FILE.
# Compose variable expansion happens before service-level `env_file:` is applied.
stack_load_env_vars
shift
CMD="$1"
shift || true

LOG_DIR="${PROJECT_ROOT}/logs/${STACK_ENVIRONMENT}"
MONITOR_LOG="${LOG_DIR}/env-manager.log"
# Was BACKUP_DIR set by the caller? cmd_deploy needs this to know whether to
# apply its per-env default (which differs from the generic one below).
_BACKUP_DIR_EXPLICIT=false
[[ -n "${BACKUP_DIR+x}" ]] && _BACKUP_DIR_EXPLICIT=true
BACKUP_DIR="${BACKUP_DIR:-$HOME/emr_backups}"
mkdir -p "$LOG_DIR" 2>/dev/null || true

log()    { ui_log "$MONITOR_LOG" "$@"; }
header() { ui_header "$1"; }

# ---------------------------------------------------------------------------
# Service lifecycle
# ---------------------------------------------------------------------------

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
    "${SCRIPT_DIR}/status.sh" "$STACK_ENVIRONMENT" "$@"
}

cmd_health() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Health Check"
    "${SCRIPT_DIR}/../stack/health.sh" "$STACK_ENVIRONMENT" "$@"
}

cmd_logs() {
    "${SCRIPT_DIR}/logs.sh" "$STACK_ENVIRONMENT" "$@"
}

cmd_backend_status() {
    "${SCRIPT_DIR}/../stack/backend-status.sh" "$STACK_ENVIRONMENT" "$@"
}

cmd_dashboard() {
    "${SCRIPT_DIR}/dashboard.sh" "$STACK_ENVIRONMENT" "$@"
}

cmd_shell() {
    header "Shell into EMR ${STACK_ENVIRONMENT_TITLE} Backend"
    stack_compose exec "$STACK_BACKEND_SERVICE" /bin/bash || \
        stack_compose exec "$STACK_BACKEND_SERVICE" /bin/sh
}

# ---------------------------------------------------------------------------
# Data / backup / seed
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Monitoring
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Deployment (stag/prod) — pull + rebuild + health check + rollback
# ---------------------------------------------------------------------------

cmd_deploy() {
    if [[ "$STACK_ENVIRONMENT" == "local" ]]; then
        ui_error "Local env is not deployed via this script. Use: scripts/local/env-manager.sh start"
        return 1
    fi

    local DO_BACKUP=true DO_PULL=true DO_ROLLBACK=true DO_HEALTH=true
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-backup)   DO_BACKUP=false ;;
            --no-pull)     DO_PULL=false ;;
            --no-rollback) DO_ROLLBACK=false ;;
            --skip-health) DO_HEALTH=false ;;
            -h|--help)
                cat <<'DEPLOY_USAGE'
Usage: env-manager.sh <env> deploy [options]

Environments: stag | prod

Options:
  --no-backup       Skip pre-deploy DB snapshot (NOT recommended)
  --no-pull         Skip `git pull`
  --no-rollback     Don't attempt rollback on failure
  --skip-health     Don't wait for backend health after deploy

Relevant env vars (override by exporting before running):
  DEPLOY_PATH       prod default: /home/emrprod/emr, stag default: /srv/emr
  SERVER_IP         prod default: 172.16.0.32, stag default: 172.16.0.46
                    Export SERVER_IP= (empty) to skip the host IP sanity check.
  BACKUP_DIR        prod default: $HOME/emr-predeploy-backups
                    stag default: $DEPLOY_PATH/backups
DEPLOY_USAGE
                return 0
                ;;
            *) ui_error "Unknown deploy option: $1"; return 1 ;;
        esac
        shift
    done

    # Canonical per-env deploy defaults (unset-only; do not cross prod vs stag).
    local PG_CONTAINER DB_USER DB_NAME
    case "$STACK_ENVIRONMENT" in
        production)
            if [[ -z "${DEPLOY_PATH+x}" ]]; then DEPLOY_PATH="/home/emrprod/emr"; fi
            if [[ -z "${SERVER_IP+x}" ]];  then SERVER_IP="172.16.0.32"; fi
            $_BACKUP_DIR_EXPLICIT || BACKUP_DIR="${HOME}/emr-predeploy-backups"
            PG_CONTAINER="emr-postgres-prod"
            DB_USER="emradmin"
            DB_NAME="emrprod"
            ;;
        staging)
            if [[ -z "${DEPLOY_PATH+x}" ]]; then DEPLOY_PATH="/srv/emr"; fi
            if [[ -z "${SERVER_IP+x}" ]];  then SERVER_IP="172.16.0.46"; fi
            $_BACKUP_DIR_EXPLICIT || BACKUP_DIR="${DEPLOY_PATH}/backups"
            PG_CONTAINER="emr-postgres-stag"
            DB_USER="emradmin"
            DB_NAME="emr_db_stag"
            ;;
    esac

    ui_header "EMR ${STACK_ENVIRONMENT_TITLE} Deployment"

    _deploy_check_server
    _deploy_ensure_repo
    _deploy_backup_database || true
    _deploy_pull_latest || { _deploy_rollback; return 1; }
    _deploy_stop_stack
    _deploy_build_up      || { _deploy_rollback; return 1; }
    _deploy_wait_healthy  || { _deploy_rollback; return 1; }
    _deploy_show_summary
    ui_success "EMR ${STACK_ENVIRONMENT} deployment complete"
}

cmd_update() { cmd_deploy "$@"; }

_deploy_check_server() {
    # Skip IP check when SERVER_IP is empty (e.g. export SERVER_IP= before running).
    if [[ -z "${SERVER_IP:-}" ]]; then
        return 0
    fi
    local ips
    ips=$(hostname -I 2>/dev/null || true)
    if echo " $ips " | grep -q " ${SERVER_IP} "; then
        return 0
    fi
    ui_warning "This script expects a host with IP ${SERVER_IP} (from hostname -I). Current host: $(hostname); addresses: ${ips:-none}"
    read -r -p "Continue anyway? (y/N): " reply
    [[ "$reply" =~ ^[Yy]$ ]] || exit 1
}

_deploy_ensure_repo() {
    if [[ ! -d "$DEPLOY_PATH" ]]; then
        ui_error "Deployment directory $DEPLOY_PATH does not exist"
        exit 1
    fi
    cd "$DEPLOY_PATH"
    PROJECT_ROOT="$(pwd)"
    # Re-anchor STACK_* paths at the deploy checkout in case it differs from where
    # the caller launched the script.
    case "$STACK_ENVIRONMENT" in
        production)
            STACK_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"
            STACK_ENV_FILE="${PROJECT_ROOT}/backend/env/prod.env"
            ;;
        staging)
            STACK_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.stag.yml"
            STACK_ENV_FILE="${PROJECT_ROOT}/backend/env/stag.env"
            ;;
    esac
    # Reload after re-anchoring paths to the deploy checkout.
    stack_load_env_vars
    ui_info "Working directory: $(pwd)"
}

_deploy_backup_database() {
    $DO_BACKUP || { ui_warning "Skipping pre-deploy backup (--no-backup)"; return 0; }
    ui_step "Pre-deploy DB snapshot"
    if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
        ui_warning "Cannot create BACKUP_DIR=${BACKUP_DIR} — skipping snapshot (set BACKUP_DIR to a writable path)"
        return 0
    fi
    if ! touch "${BACKUP_DIR}/.emr_write_test" 2>/dev/null; then
        ui_warning "BACKUP_DIR is not writable: ${BACKUP_DIR} — skipping snapshot"
        return 0
    fi
    rm -f "${BACKUP_DIR}/.emr_write_test"
    local backup_file="${BACKUP_DIR}/predeploy_${STACK_ENVIRONMENT}_$(stack_timestamp).sql"
    if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
        if docker exec "$PG_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$backup_file" 2>/dev/null; then
            ui_success "Snapshot saved: ${backup_file}"
            echo "$backup_file" > "${BACKUP_DIR}/.latest_predeploy_${STACK_ENVIRONMENT}"
        else
            ui_warning "pg_dump failed; continuing without snapshot"
            rm -f "$backup_file"
        fi
    else
        ui_warning "${PG_CONTAINER} not running — first deploy? Skipping snapshot."
    fi
}

_deploy_pull_latest() {
    $DO_PULL || { ui_warning "Skipping git pull (--no-pull)"; return 0; }
    ui_step "git pull"
    if [[ -d ".git" ]]; then
        git fetch --all --prune
        git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"
        git clean -fd
        ui_success "Code updated to $(git rev-parse --short HEAD)"
    else
        ui_warning "$DEPLOY_PATH is not a git checkout; skipping pull"
    fi
}

_deploy_stop_stack() {
    ui_step "Stopping existing ${STACK_ENVIRONMENT} containers"
    stack_compose down --timeout 30 || true
}

_deploy_build_up() {
    ui_step "Rebuilding and starting ${STACK_ENVIRONMENT} stack"
    docker image prune -f >/dev/null 2>&1 || true
    stack_compose up -d --build
}

_deploy_wait_healthy() {
    $DO_HEALTH || { ui_warning "Skipping health probe (--skip-health)"; return 0; }
    # Single source of truth: Docker healthcheck on the backend container.
    # Both compose files define one, so we expect a health status. No fallbacks.
    ui_step "Waiting for backend health (${STACK_BACKEND_CONTAINER})"
    ui_info "External URL for manual checks: ${STACK_HEALTH_URL}"
    # Window must cover compose's start_period + retries*interval so we don't
    # give up while Docker is still legitimately in "starting". Current compose
    # values: start_period=120s, retries=3, interval=30s → up to 210s.
    local initial_sleep=8
    local attempts=45
    local interval=5
    sleep "$initial_sleep"
    local i
    for ((i = 1; i <= attempts; i++)); do
        if ! docker ps --format '{{.Names}}' | grep -q "^${STACK_BACKEND_CONTAINER}$"; then
            ui_warning "Container ${STACK_BACKEND_CONTAINER} is not running (attempt ${i}/${attempts})"
            echo "  attempt ${i}/${attempts}…"
            sleep "$interval"
            continue
        fi

        local health
        health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$STACK_BACKEND_CONTAINER" 2>/dev/null || echo "missing")
        case "$health" in
            healthy)
                ui_success "Backend health is healthy"
                return 0
                ;;
            unhealthy)
                ui_error "Backend container is unhealthy."
                docker inspect -f '{{range .State.Health.Log}}{{println .End .ExitCode .Output}}{{end}}' "$STACK_BACKEND_CONTAINER" 2>/dev/null | tail -5 || true
                docker logs --tail 60 "$STACK_BACKEND_CONTAINER" || true
                return 1
                ;;
            none|missing)
                ui_error "No Docker healthcheck on ${STACK_BACKEND_CONTAINER}. Define one in compose (backend.healthcheck) and redeploy — this script does not probe endpoints directly."
                return 1
                ;;
        esac
        echo "  attempt ${i}/${attempts}… (status: ${health})"
        sleep "$interval"
    done
    ui_error "Backend did not become healthy within ~$((initial_sleep + attempts * interval))s. Inspect with: docker inspect ${STACK_BACKEND_CONTAINER} --format '{{.State.Health.Status}}' and docker logs ${STACK_BACKEND_CONTAINER}."
    return 1
}

_deploy_show_summary() {
    ui_subheader "Deployment summary"
    stack_compose ps
    echo
    echo "Service URLs:"
    echo "  Frontend:    ${STACK_FRONTEND_URL}"
    echo "  Backend API: ${STACK_HEALTH_URL%/api/health/live/}/api/"
    echo "  Health:      ${STACK_HEALTH_URL}"
}

_deploy_rollback() {
    $DO_ROLLBACK || { ui_error "Deployment failed and --no-rollback was set. Manual intervention required."; return 1; }
    ui_error "Deployment failed. Rolling back…"
    _deploy_stop_stack
    local latest
    latest=$(cat "${BACKUP_DIR}/.latest_predeploy_${STACK_ENVIRONMENT}" 2>/dev/null || true)
    if [[ -n "$latest" && -f "$latest" ]]; then
        ui_step "Restoring DB from ${latest}"
        stack_compose up -d "$STACK_POSTGRES_SERVICE"
        sleep 10
        if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
            docker exec -i "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$latest" >/dev/null \
                || ui_warning "psql restore reported errors (check logs)"
        fi
        stack_compose up -d
        ui_warning "Rolled back to snapshot — verify manually!"
    else
        ui_error "No pre-deploy snapshot found for ${STACK_ENVIRONMENT}"
    fi
}

# ---------------------------------------------------------------------------
# Maintenance / emergency
# ---------------------------------------------------------------------------

cmd_cleanup() {
    header "EMR ${STACK_ENVIRONMENT_TITLE} Cleanup"
    log "Running cleanup"
    docker image prune -f
    find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.tmp" -delete 2>/dev/null || true
    ui_success "Cleanup complete"
}

cmd_emergency() {
    if [[ $# -lt 1 ]]; then
        ui_error "Usage: env-manager.sh <env> emergency <stop|restart|recovery|diagnostics|reset>"
        return 1
    fi
    "${SCRIPT_DIR}/emergency.sh" "$STACK_ENVIRONMENT" "$@"
}

cmd_emergency_stop() { cmd_emergency stop; }
cmd_panic()          { cmd_emergency reset; }

# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

case "$CMD" in
    start)            cmd_start ;;
    stop)             cmd_stop ;;
    restart)          cmd_restart ;;
    status)           cmd_status "$@" ;;
    health)           cmd_health "$@" ;;
    logs)             cmd_logs "$@" ;;
    backend-status)   cmd_backend_status "$@" ;;
    dashboard)        cmd_dashboard "$@" ;;
    shell)            cmd_shell ;;

    seed)             cmd_seed "$@" ;;
    seed-reset)       cmd_seed_reset ;;
    backup)           cmd_backup ;;
    backup-status)    cmd_backup_status ;;
    verify-backup)    cmd_verify_backup ;;

    monitor)          cmd_monitor ;;
    performance)      cmd_performance ;;
    alerts)           cmd_alerts ;;
    diagnostics)      cmd_diagnostics ;;

    deploy|update)    cmd_deploy "$@" ;;
    cleanup)          cmd_cleanup ;;

    emergency)        cmd_emergency "$@" ;;
    emergency-stop)   cmd_emergency_stop ;;
    panic)            cmd_panic ;;

    help|-h|--help|"") usage ;;
    *)
        ui_error "Unknown command: $CMD"
        echo
        usage
        exit 1
        ;;
esac
