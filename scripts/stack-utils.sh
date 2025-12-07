#!/usr/bin/env bash

# Shared helpers for stack management scripts.

STACK_UTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "${STACK_UTILS_DIR}/.." && pwd)}"

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
        echo "Environment name is required" >&2
        exit 1
    fi

    local requested_env="$1"
    case "$requested_env" in
        local)
            STACK_ENVIRONMENT="local"
            STACK_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.local.yml"
            STACK_ENV_FILE="${PROJECT_ROOT}/backend/env/local.env"
            STACK_BACKEND_SERVICE="backend"
            STACK_POSTGRES_SERVICE="postgres"
            STACK_HEALTH_URL="${STACK_HEALTH_URL_OVERRIDE:-http://localhost:8001/api/health/}"
            STACK_FRONTEND_URL="${STACK_FRONTEND_URL_OVERRIDE:-http://localhost:3001}"
            ;;
        stag|staging)
            STACK_ENVIRONMENT="staging"
            STACK_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.stag.yml"
            STACK_ENV_FILE="${PROJECT_ROOT}/backend/env/stag.env"
            STACK_BACKEND_SERVICE="backend_stag"
            STACK_POSTGRES_SERVICE="postgres_stag"
            STACK_HEALTH_URL="${STACK_HEALTH_URL_OVERRIDE:-http://172.16.0.46:4647/api/health/}"
            STACK_FRONTEND_URL="${STACK_FRONTEND_URL_OVERRIDE:-http://172.16.0.46:4647}"
            ;;
        prod|production)
            STACK_ENVIRONMENT="production"
            STACK_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"
            STACK_ENV_FILE="${PROJECT_ROOT}/backend/env/prod.env"
            STACK_BACKEND_SERVICE="backend"
            STACK_POSTGRES_SERVICE="postgres"
            STACK_HEALTH_URL="${STACK_HEALTH_URL_OVERRIDE:-https://emr.npa.gov.ng/api/health/}"
            STACK_FRONTEND_URL="${STACK_FRONTEND_URL_OVERRIDE:-https://emr.npa.gov.ng}"
            ;;
        *)
            echo "Unknown environment: ${requested_env}" >&2
            exit 1
            ;;
    esac

    stack_detect_compose_cmd
}

stack_compose() {
    stack_detect_compose_cmd
    if [[ $# -gt 0 ]]; then
        "${STACK_COMPOSE_CMD[@]}" -f "$STACK_COMPOSE_FILE" "$@"
    else
        "${STACK_COMPOSE_CMD[@]}" -f "$STACK_COMPOSE_FILE"
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

