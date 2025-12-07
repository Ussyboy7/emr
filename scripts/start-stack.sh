#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/stack-utils.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/start-stack.sh <environment> [options] [-- docker args]

Environments:
  local   -> docker-compose.local.yml
  stag    -> docker-compose.stag.yml
  prod    -> docker-compose.prod.yml

Options:
  --migrate | --with-migrations   Run Django migrations after containers start

All arguments after -- (or any unrecognized options) are passed to `docker compose up`.
Examples:
  scripts/start-stack.sh local
  scripts/start-stack.sh stag --migrate -- --build
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

ENVIRONMENT="$1"
shift || true

RUN_MIGRATIONS=false
DOCKER_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --migrate|--with-migrations)
            RUN_MIGRATIONS=true
            shift
            ;;
        --)
            shift
            DOCKER_ARGS+=("$@")
            break
            ;;
        *)
            DOCKER_ARGS+=("$1")
            shift
            ;;
    esac
done

stack_init_env "$ENVIRONMENT"

echo "Starting ${STACK_ENVIRONMENT} stack"
echo "  Compose : ${STACK_COMPOSE_FILE}"
echo "  Env file: ${STACK_ENV_FILE}"
if [[ "$RUN_MIGRATIONS" == true ]]; then
    echo "  Migrations: enabled"
fi

if [[ ${#DOCKER_ARGS[@]} -gt 0 ]]; then
    stack_compose up -d "${DOCKER_ARGS[@]}"
else
    stack_compose up -d
fi

if [[ "$RUN_MIGRATIONS" == true ]]; then
    echo "Running Django migrations..."
    stack_backend_manage migrate --noinput
fi

