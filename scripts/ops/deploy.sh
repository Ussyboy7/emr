#!/usr/bin/env bash
# Pull-and-redeploy an environment on its target server.
#
# Usage: scripts/ops/deploy.sh <stag|prod> [options]
#
# Expects the repository to already be checked out at $DEPLOY_PATH on the
# server. Performs: git pull -> pre-deploy DB backup (prod/stag) -> docker
# compose down -> docker compose up -d --build -> health check. Rolls back
# to the pre-deploy snapshot on failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/stack-utils.sh
source "${SCRIPT_DIR}/../lib/stack-utils.sh"
# shellcheck source=../lib/ui.sh
source "${SCRIPT_DIR}/../lib/ui.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/ops/deploy.sh <env> [options]

Environments: stag | prod (local is deployed via `scripts/local/start.sh`)

Options:
  --no-backup       Skip pre-deploy DB snapshot (NOT recommended)
  --no-pull         Skip `git pull` (deploy whatever is already checked out)
  --no-rollback     Don't attempt rollback on failure
  --skip-health     Don't wait for health check after deploy

Relevant env vars (override by exporting before running — each env has its own defaults):
  DEPLOY_PATH       Production default: /home/emrprod/emr
                    Staging default:    /srv/emr
  DEPLOY_USER       Informational only (default: devsecops)
  SERVER_IP         Host IP sanity check: prod 172.16.0.32, stag 172.16.0.46.
                    Export SERVER_IP= (empty) to skip the check.
  BACKUP_DIR        Production default: \$HOME/emr-predeploy-backups (writable; avoids
                    ./backups in the repo, which is often root-owned from Postgres mounts).
                    Staging default: \$DEPLOY_PATH/backups

Examples:
  scripts/staging/deploy.sh
  scripts/production/deploy.sh
  DEPLOY_PATH=/opt/emr-clone scripts/production/deploy.sh   # non-standard prod checkout
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

stack_init_env "$1"
shift

if [[ "$STACK_ENVIRONMENT" == "local" ]]; then
    ui_error "Local env is not deployed via this script. Use scripts/local/start.sh."
    exit 1
fi

DO_BACKUP=true
DO_PULL=true
DO_ROLLBACK=true
DO_HEALTH=true

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-backup)   DO_BACKUP=false ;;
        --no-pull)     DO_PULL=false ;;
        --no-rollback) DO_ROLLBACK=false ;;
        --skip-health) DO_HEALTH=false ;;
        -h|--help) usage; exit 0 ;;
        *) ui_error "Unknown option: $1"; usage; exit 1 ;;
    esac
    shift
done

DEPLOY_USER="${DEPLOY_USER:-devsecops}"

# Canonical layout (do not cross prod vs stag). Defaults apply only when each var is *unset*.
# Production: emrprod@emr, checkout ~/emr → /home/emrprod/emr
# Staging:    devsecops on staging VM, checkout /srv/emr
case "$STACK_ENVIRONMENT" in
    production)
        if [[ -z "${DEPLOY_PATH+x}" ]]; then DEPLOY_PATH="/home/emrprod/emr"; fi
        if [[ -z "${SERVER_IP+x}" ]]; then SERVER_IP="172.16.0.32"; fi
        if [[ -z "${BACKUP_DIR+x}" ]]; then BACKUP_DIR="${HOME}/emr-predeploy-backups"; fi
        ;;
    staging)
        if [[ -z "${DEPLOY_PATH+x}" ]]; then DEPLOY_PATH="/srv/emr"; fi
        if [[ -z "${SERVER_IP+x}" ]]; then SERVER_IP="172.16.0.46"; fi
        if [[ -z "${BACKUP_DIR+x}" ]]; then BACKUP_DIR="${DEPLOY_PATH}/backups"; fi
        ;;
    *)
        ui_error "deploy.sh only supports staging or production (got: ${STACK_ENVIRONMENT})"
        exit 1
        ;;
esac

case "$STACK_ENVIRONMENT" in
    staging)
        PG_CONTAINER="emr-postgres-stag"
        DB_USER="${DB_USER:-emradmin}"
        DB_NAME="${DB_NAME:-emr_db_stag}"
        ;;
    production)
        PG_CONTAINER="emr-postgres-prod"
        DB_USER="${DB_USER:-emradmin}"
        DB_NAME="${DB_NAME:-emrprod}"
        ;;
esac

ui_header "EMR ${STACK_ENVIRONMENT_TITLE} Deployment"

check_server() {
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

ensure_repo() {
    if [[ ! -d "$DEPLOY_PATH" ]]; then
        ui_error "Deployment directory $DEPLOY_PATH does not exist"
        exit 1
    fi
    cd "$DEPLOY_PATH"
    PROJECT_ROOT="$(pwd)"
    # STACK_* was first resolved from the script’s tree; deployment must always
    # use the checkout at DEPLOY_PATH (especially when they differ).
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
    ui_info "Working directory: $(pwd)"
}

backup_database() {
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

pull_latest() {
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

stop_stack() {
    ui_step "Stopping existing ${STACK_ENVIRONMENT} containers"
    stack_compose down --timeout 30 || true
}

deploy_stack() {
    ui_step "Rebuilding and starting ${STACK_ENVIRONMENT} stack"
    docker image prune -f >/dev/null 2>&1 || true
    stack_compose up -d --build
}

wait_healthy() {
    $DO_HEALTH || { ui_warning "Skipping health probe (--skip-health)"; return 0; }
    # Probe **inside** the backend container (same as compose healthchecks). Curling
    # the host IP / nginx from the shell often loops forever: firewall, wrong Host,
    # IPv6 localhost, or ALLOWED_HOSTS edge cases — none of which mean Django is down.
    ui_step "Waiting for backend liveness in ${STACK_BACKEND_CONTAINER} (http://127.0.0.1:8000/api/health/live/)"
    ui_info "External URL for manual checks: ${STACK_HEALTH_URL}"
    local initial_sleep=8
    local attempts=24
    local interval=5
    sleep "$initial_sleep"
    local i
    for ((i = 1; i <= attempts; i++)); do
        if docker exec "$STACK_BACKEND_CONTAINER" \
            curl -sf --max-time 8 "http://127.0.0.1:8000/api/health/live/" >/dev/null 2>&1; then
            ui_success "Backend liveness OK"
            return 0
        fi
        if ! docker ps --format '{{.Names}}' | grep -q "^${STACK_BACKEND_CONTAINER}$"; then
            ui_warning "Container ${STACK_BACKEND_CONTAINER} is not running yet (attempt ${i}/${attempts})"
        fi
        echo "  attempt ${i}/${attempts}…"
        sleep "$interval"
    done
    ui_error "Backend did not respond in-container within ~$((initial_sleep + attempts * interval))s. Try: docker logs ${STACK_BACKEND_CONTAINER} — or redeploy with --skip-health if migrations are very slow."
    return 1
}

show_summary() {
    ui_subheader "Deployment summary"
    stack_compose ps
    echo
    echo "Service URLs:"
    echo "  Frontend:    ${STACK_FRONTEND_URL}"
    echo "  Backend API: ${STACK_HEALTH_URL%/api/health/live/}/api/"
    echo "  Health:      ${STACK_HEALTH_URL}"
}

rollback() {
    $DO_ROLLBACK || { ui_error "Deployment failed and --no-rollback was set. Manual intervention required."; return 1; }
    ui_error "Deployment failed. Rolling back…"
    stop_stack
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

trap 'rollback || true' ERR

check_server
ensure_repo
backup_database
pull_latest
stop_stack
deploy_stack
wait_healthy
show_summary

ui_success "EMR ${STACK_ENVIRONMENT} deployment complete"
