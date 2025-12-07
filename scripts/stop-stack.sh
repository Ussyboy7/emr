#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/stack-utils.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/stop-stack.sh <environment> [options] [-- docker args]

Options:
  --prune            Run `docker container prune` and `docker image prune` after stopping

Any arguments after -- (or unknown flags) are forwarded to `docker compose down`.
Examples:
  scripts/stop-stack.sh local
  scripts/stop-stack.sh stag --prune
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

ENVIRONMENT="$1"
shift || true

SHOULD_PRUNE=false
DOWN_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --prune)
            SHOULD_PRUNE=true
            shift
            ;;
        --)
            shift
            DOWN_ARGS+=("$@")
            break
            ;;
        *)
            DOWN_ARGS+=("$1")
            shift
            ;;
    esac
done

stack_init_env "$ENVIRONMENT"

echo "Stopping ${STACK_ENVIRONMENT} stack"
if [[ ${#DOWN_ARGS[@]} -gt 0 ]]; then
    stack_compose down "${DOWN_ARGS[@]}"
else
    stack_compose down
fi

if [[ "$SHOULD_PRUNE" == true ]]; then
    echo "Pruning stopped containers and dangling images..."
    docker container prune -f >/dev/null
    docker image prune -f >/dev/null
fi

