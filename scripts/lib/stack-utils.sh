#!/usr/bin/env bash

# ==============================================================================
# Shared helpers for stack-management scripts.
#
# Source this file and call `stack_init_env <local|stag|prod>` to populate the
# following globals:
#
#   STACK_ENVIRONMENT          Canonical env name (local|staging|production)
#   STACK_COMPOSE_FILE         Absolute path to the compose file for the env
#   STACK_ENV_FILE             Absolute path to backend/env/<env>.env
#   STACK_BACKEND_SERVICE      Docker Compose service name for Django
#   STACK_POSTGRES_SERVICE     Docker Compose service name for Postgres
#   STACK_HEALTH_URL           Backend health endpoint
#   STACK_FRONTEND_URL         Frontend URL
#   STACK_BACKEND_CONTAINER    Expected container name for the Django service
#   STACK_NGINX_CONTAINER      Expected container name for the nginx service
#   STACK_COMPOSE_CMD          Array: the detected compose CLI (docker compose|docker-compose)
#
# Helper functions:
#   stack_compose  [args...]            Run `docker compose -f <FILE> args...`
#   stack_compose_exec <service> args   Run a command inside a service with -T
#   stack_backend_manage <args...>      Run `python manage.py <args>` in backend
#   stack_load_env_vars                 Export values from STACK_ENV_FILE
#   stack_timestamp                     Print a YYYYMMDD_HHMMSS timestamp
# ==============================================================================

STACK_UTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# lib/ sits one level below scripts/, so the project root is two levels up.
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "${STACK_UTILS_DIR}/../.." && pwd)}"

STACK_COMPOSE_CMD=()

stack_detect_compose_cmd() {
    if [[ ${#STACK_COMPOSE_CMD[@]} -gt 0 ]]; then
        return 0
    fi

    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        STACK_COMPOSE_CMD=(docker compose)
    elif command -v docker-compose >/dev/null 2>&1; then
        STACK_COMPOSE_CMD=(docker-compose)
    else
        echo "Docker Compose is not installed. Please install Docker Desktop or the docker-compose plugin." >&2
        exit 1
    fi
}

stack_init_env() {
    if [[ $# -lt 1 ]]; then
        echo "Environment name is required (local | stag | prod)" >&2
        exit 1
    fi

    local requested_env="$1"
    case "$requested_env" in
        local)
            STACK_ENVIRONMENT="local"
            STACK_ENVIRONMENT_TITLE="Local"
            STACK_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.local.yml"
            STACK_ENV_FILE="${PROJECT_ROOT}/backend/env/local.env"
            STACK_BACKEND_SERVICE="backend"
            STACK_POSTGRES_SERVICE="postgres"
            STACK_BACKEND_CONTAINER="emr-backend-local"
            STACK_NGINX_CONTAINER=""  # no nginx in local stack
            STACK_HEALTH_URL="${STACK_HEALTH_URL_OVERRIDE:-http://localhost:8001/api/health/live/}"
            STACK_FRONTEND_URL="${STACK_FRONTEND_URL_OVERRIDE:-http://localhost:3001}"
            ;;
        stag|staging)
            STACK_ENVIRONMENT="staging"
            STACK_ENVIRONMENT_TITLE="Staging"
            # Staging host: 172.16.0.46 — backend/frontend published on host ports
            # (8047 / 4647) per docker-compose.stag.yml; no nginx reverse proxy by default.
            STACK_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.stag.yml"
            STACK_ENV_FILE="${PROJECT_ROOT}/backend/env/stag.env"
            # Compose service names in docker-compose.stag.yml are bare (e.g. `backend`);
            # only the container_name carries the `-stag` suffix.
            STACK_BACKEND_SERVICE="backend"
            STACK_POSTGRES_SERVICE="postgres"
            STACK_BACKEND_CONTAINER="emr-backend-stag"
            STACK_NGINX_CONTAINER=""  # no nginx in stag by default
            STACK_HEALTH_URL="${STACK_HEALTH_URL_OVERRIDE:-http://172.16.0.46:8047/api/health/live/}"
            STACK_FRONTEND_URL="${STACK_FRONTEND_URL_OVERRIDE:-http://172.16.0.46:4647}"
            ;;
        prod|production)
            STACK_ENVIRONMENT="production"
            STACK_ENVIRONMENT_TITLE="Production"
            # Production host: 172.16.0.32 (see docker-compose.prod.yml). Nginx :80
            # fronts the API — use the LAN IP from the host, not `localhost`, so
            # health checks are not broken by IPv6 (::1) or odd loopback routing.
            STACK_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"
            STACK_ENV_FILE="${PROJECT_ROOT}/backend/env/prod.env"
            STACK_BACKEND_SERVICE="backend"
            STACK_POSTGRES_SERVICE="postgres"
            STACK_BACKEND_CONTAINER="emr-backend-prod"
            STACK_NGINX_CONTAINER="emr-nginx-prod"
            STACK_HEALTH_URL="${STACK_HEALTH_URL_OVERRIDE:-http://172.16.0.32/api/health/live/}"
            STACK_FRONTEND_URL="${STACK_FRONTEND_URL_OVERRIDE:-http://172.16.0.32}"
            ;;
        *)
            echo "Unknown environment: ${requested_env} (expected local|stag|prod)" >&2
            exit 1
            ;;
    esac

    stack_detect_compose_cmd
}

stack_compose() {
    stack_detect_compose_cmd
    local compose_args=()
    if [[ -n "${STACK_ENV_FILE:-}" && -f "$STACK_ENV_FILE" ]]; then
        compose_args+=(--env-file "$STACK_ENV_FILE")
    fi
    compose_args+=(-f "$STACK_COMPOSE_FILE")
    if [[ $# -gt 0 ]]; then
        "${STACK_COMPOSE_CMD[@]}" "${compose_args[@]}" "$@"
    else
        "${STACK_COMPOSE_CMD[@]}" "${compose_args[@]}"
    fi
}

stack_compose_exec() {
    stack_compose exec -T "$@"
}

stack_backend_manage() {
    stack_compose_exec "$STACK_BACKEND_SERVICE" python manage.py "$@"
}

stack_load_env_vars() {
    if [[ -z "${STACK_ENV_FILE:-}" || ! -f "$STACK_ENV_FILE" ]]; then
        echo "Environment file not found for ${STACK_ENVIRONMENT}." >&2
        exit 1
    fi

    set -a
    # shellcheck source=/dev/null
    source "$STACK_ENV_FILE"
    set +a
}

stack_timestamp() {
    date +"%Y%m%d_%H%M%S"
}
