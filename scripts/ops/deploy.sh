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

Relevant env vars (override by exporting before running):
  DEPLOY_PATH       Server-side repo root (default: this git checkout, i.e. PROJECT_ROOT)
  DEPLOY_USER       Unix account owning DEPLOY_PATH (default: devsecops; informational only)
  SERVER_IP         Expected server IP for sanity check (default: production 172.16.0.32,
                    staging 172.16.0.46). Export SERVER_IP= if you want to skip the IP match.
  BACKUP_DIR        Pre-deploy snapshot location (default: $DEPLOY_PATH/backups)

Examples:
  scripts/ops/deploy.sh stag
  DEPLOY_PATH=/srv/emr SERVER_IP=172.16.0.32 scripts/ops/deploy.sh prod
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

DEPLOY_PATH="${DEPLOY_PATH:-$PROJECT_ROOT}"
DEPLOY_USER="${DEPLOY_USER:-devsecops}"
# Production primary host per EMR deployment guide; staging host unchanged.
# Use `SERVER_IP=` (empty) before running to skip the host-IP check entirely.
# Default is applied only when SERVER_IP is unset (${var+x} is empty iff unset).
case "$STACK_ENVIRONMENT" in
    production)
        if [[ -z "${SERVER_IP+x}" ]]; then SERVER_IP="172.16.0.32"; fi
        ;;
    staging)
        if [[ -z "${SERVER_IP+x}" ]]; then SERVER_IP="172.16.0.46"; fi
        ;;
    *)
        if [[ -z "${SERVER_IP+x}" ]]; then SERVER_IP=""; fi
        ;;
esac
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_PATH}/backups}"

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
    ui_info "Working directory: $(pwd)"
}

backup_database() {
    $DO_BACKUP || { ui_warning "Skipping pre-deploy backup (--no-backup)"; return 0; }
    ui_step "Pre-deploy DB snapshot"
    mkdir -p "$BACKUP_DIR"
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
    ui_step "Waiting for backend at ${STACK_HEALTH_URL}"
    sleep 20
    local attempts=30
    for ((i=1; i<=attempts; i++)); do
        if curl -sf --max-time 5 "$STACK_HEALTH_URL" >/dev/null; then
            ui_success "Backend is healthy"
            return 0
        fi
        echo "  attempt ${i}/${attempts}…"
        sleep 5
    done
    ui_error "Backend did not become healthy within $((attempts*5))s"
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
