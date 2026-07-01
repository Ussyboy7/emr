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
# shellcheck source=../lib/registry-images.sh
source "${SCRIPT_DIR}/../lib/registry-images.sh"

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

Deployment (local | stag | prod):
  deploy [flags]   Rebuild app services (fast by default) + health check.
                   stag/prod: pre-deploy DB snapshot + rollback on failure.
                   Flags: --full --services=a,b --no-backup --no-pull
                   --no-rollback --skip-health
  update           Alias for `deploy`.

Maintenance:
  cleanup          Prune dangling images + old logs

Emergency:
  emergency <cmd>  stop | restart | recovery | diagnostics | reset
  emergency-stop   Shortcut for `emergency stop`
  panic            Shortcut for `emergency reset` (DATA LOSS, prompts)

Examples:
  scripts/ops/env-manager.sh local start
  scripts/ops/env-manager.sh local deploy
  scripts/ops/env-manager.sh prod status
  scripts/ops/env-manager.sh stag deploy
  scripts/ops/env-manager.sh prod deploy --full
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
# Deployment — fast (default) or full stack rebuild; local | stag | prod
# ---------------------------------------------------------------------------

# Set by cmd_deploy; visible to _deploy_* helpers called from the same invocation.
DEPLOY_MODE="fast"
DEPLOY_SERVICES=""
DEPLOY_FORCE_BUILD=false
DO_BACKUP=true
DO_PULL=true
DO_ROLLBACK=true
DO_HEALTH=true

cmd_deploy() {
    DEPLOY_MODE="fast"
    DEPLOY_SERVICES=""
    DEPLOY_FORCE_BUILD=false
    DO_BACKUP=true
    DO_PULL=true
    DO_ROLLBACK=true
    DO_HEALTH=true

    case "$STACK_ENVIRONMENT" in
        local)
            DO_PULL=false
            DO_BACKUP=false
            DO_ROLLBACK=false
            ;;
        staging)
            ;;
        production)
            ;;
    esac

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --full)        DEPLOY_MODE="full" ;;
            --fast)        DEPLOY_MODE="fast" ;;
            --no-backup)   DO_BACKUP=false ;;
            --no-pull)     DO_PULL=false ;;
            --pull)        DO_PULL=true ;;
            --no-rollback) DO_ROLLBACK=false ;;
            --skip-health) DO_HEALTH=false ;;
            --build)       DEPLOY_FORCE_BUILD=true ;;
            --services=*)
                DEPLOY_SERVICES="${1#--services=}"
                ;;
            --services)
                shift
                DEPLOY_SERVICES="${1:-}"
                ;;
            -h|--help)
                _deploy_usage
                return 0
                ;;
            *) ui_error "Unknown deploy option: $1"; return 1 ;;
        esac
        shift
    done

    local PG_CONTAINER="" DB_USER="" DB_NAME=""
    case "$STACK_ENVIRONMENT" in
        local)
            DEPLOY_PATH="${DEPLOY_PATH:-$PROJECT_ROOT}"
            ;;
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

    ui_header "EMR ${STACK_ENVIRONMENT_TITLE} Deployment (${DEPLOY_MODE})"

    if [[ "$STACK_ENVIRONMENT" != "local" ]]; then
        _deploy_check_server
    fi
    _deploy_ensure_repo
    deploy_load_registry_config
    export EMR_IMAGE_TAG="$(deploy_resolve_image_tag)"
    if deploy_registry_enabled; then
        ui_info "Registry deploy — backend: ${EMR_BACKEND_IMAGE:-?}:${EMR_IMAGE_TAG}, frontend: ${EMR_FRONTEND_IMAGE:-?}:${EMR_IMAGE_TAG}"
    elif [[ "$STACK_ENVIRONMENT" != "local" ]]; then
        ui_info "Local build deploy (set EMR_USE_REGISTRY=1 in backend/env/registry.env to pull from GHCR)"
    fi
    _deploy_backup_database || true
    _deploy_pull_latest || { _deploy_rollback; return 1; }

    if [[ "$DEPLOY_MODE" == "full" ]]; then
        _deploy_stop_stack
        _deploy_build_up_full || { _deploy_rollback; return 1; }
    else
        _deploy_ensure_infra_up
        _deploy_build_up_fast || { _deploy_rollback; return 1; }
    fi

    _deploy_wait_healthy || { _deploy_rollback; return 1; }
    _deploy_show_summary
    ui_success "EMR ${STACK_ENVIRONMENT} ${DEPLOY_MODE} deployment complete"
}

cmd_update() { cmd_deploy "$@"; }

_deploy_usage() {
    cat <<'DEPLOY_USAGE'
Usage: env-manager.sh <env> deploy [options]

Environments: local | stag | prod

Modes:
  (default)   Fast — rebuild/restart app services; postgres/redis stay up.
  --full      Full stack — compose down, rebuild all services, compose up.

Options:
  --services=LIST   Comma-separated services (default: app tier per env)
  --pull            git pull (local: off by default; use --pull to enable)
  --no-pull         Skip git pull (stag/prod)
  --build           Force local image build (ignore registry.env)
  --no-backup       Skip pre-deploy DB snapshot (stag/prod)
  --no-rollback     Don't attempt rollback on failure (stag/prod)
  --skip-health     Don't wait for backend health after deploy

Default app services:
  local/stag: backend, frontend, celery-worker, celery-beat
  prod:        backend, frontend, celery-worker, celery-beat, nginx

Relevant env vars (stag/prod):
  DEPLOY_PATH       prod: /home/emrprod/emr, stag: /srv/emr
  SERVER_IP         prod: 172.16.0.32, stag: 172.16.0.46 (empty to skip check)
  BACKUP_DIR        prod: $HOME/emr-predeploy-backups, stag: $DEPLOY_PATH/backups
  DOCKER_BUILDKIT=1 Enabled automatically during local image builds

Registry (stag/prod): copy backend/env/registry.env.example → backend/env/registry.env
  EMR_USE_REGISTRY=1 pulls ghcr.io images built by CI (tag = git SHA).
DEPLOY_USAGE
}

_deploy_default_app_services() {
    case "$STACK_ENVIRONMENT" in
        production) echo "backend frontend celery-worker celery-beat nginx" ;;
        *)          echo "backend frontend celery-worker celery-beat" ;;
    esac
}

_deploy_resolve_services() {
    local raw="${DEPLOY_SERVICES:-}"
    if [[ -z "$raw" ]]; then
        _deploy_default_app_services
        return 0
    fi
    raw="${raw//,/ }"
    echo "$raw"
}

_deploy_enable_buildkit() {
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
}

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
    if [[ "$STACK_ENVIRONMENT" == "local" ]]; then
        cd "$PROJECT_ROOT"
        ui_info "Working directory: $(pwd)"
        return 0
    fi
    if [[ ! -d "$DEPLOY_PATH" ]]; then
        ui_error "Deployment directory $DEPLOY_PATH does not exist"
        exit 1
    fi
    cd "$DEPLOY_PATH"
    PROJECT_ROOT="$(pwd)"
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
    stack_load_env_vars
    ui_info "Working directory: $(pwd)"
}

_deploy_backup_database() {
    if [[ "$STACK_ENVIRONMENT" == "local" ]]; then
        return 0
    fi
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
    ui_step "Stopping existing ${STACK_ENVIRONMENT} containers (full deploy)"
    stack_compose down --timeout 30 || true
}

_deploy_ensure_infra_up() {
    ui_step "Ensuring data services are up (postgres, redis)"
    stack_compose up -d postgres redis
    if [[ "$STACK_ENVIRONMENT" == "production" ]]; then
        stack_compose up -d backup 2>/dev/null || true
    fi
}

_deploy_build_up_fast() {
    local up_services
    up_services=$(_deploy_resolve_services)

    if deploy_registry_enabled; then
        deploy_registry_login
        ui_step "Fast deploy — pulling backend + frontend (${EMR_IMAGE_TAG})"
        stack_compose pull backend frontend
        ui_step "Fast deploy — restarting: ${up_services}"
        # shellcheck disable=SC2086
        stack_compose up -d --no-deps $up_services
        return 0
    fi

    _deploy_enable_buildkit
    local build_services="" svc
    for svc in $up_services; do
        case "$svc" in
            backend|frontend)
                if ! echo " $build_services " | grep -q " ${svc} "; then
                    build_services="${build_services}${build_services:+ }${svc}"
                fi
                ;;
            celery-worker|celery-beat)
                if ! echo " $build_services " | grep -q ' backend '; then
                    build_services="${build_services}${build_services:+ }backend"
                fi
                ;;
        esac
    done
    if [[ -n "$build_services" ]]; then
        ui_step "Fast deploy — building: ${build_services}"
        # shellcheck disable=SC2086
        stack_compose build $build_services
    fi
    ui_step "Fast deploy — restarting: ${up_services}"
    # shellcheck disable=SC2086
    stack_compose up -d --no-deps $up_services
}

_deploy_build_up_full() {
    if deploy_registry_enabled; then
        deploy_registry_login
        ui_step "Full deploy — pulling images (${EMR_IMAGE_TAG}) and starting stack"
        stack_compose pull backend frontend
        stack_compose up -d
        return 0
    fi
    _deploy_enable_buildkit
    ui_step "Full deploy — rebuilding and starting entire stack"
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
                if [[ "$STACK_ENVIRONMENT" == "local" ]]; then
                    if curl -fsS "$STACK_HEALTH_URL" >/dev/null 2>&1; then
                        ui_success "Backend health probe OK (${STACK_HEALTH_URL})"
                        return 0
                    fi
                    echo "  attempt ${i}/${attempts}… (no Docker healthcheck; probing HTTP)"
                    sleep "$interval"
                    continue
                fi
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
    if [[ "$STACK_ENVIRONMENT" == "local" ]]; then
        ui_error "Deployment failed. Local deploy has no automatic rollback — fix and re-run deploy."
        return 1
    fi
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
