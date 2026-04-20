#!/usr/bin/env bash

# Quick script to check EMR backend service status across environments.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/stack-utils.sh
source "${SCRIPT_DIR}/../lib/stack-utils.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/stack/backend-status.sh <environment>

Environments:
  local   -> Check local development environment
  stag    -> Check staging environment
  prod    -> Check production environment
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

stack_init_env "$1"

BACKEND_CONTAINER="$STACK_BACKEND_CONTAINER"
case "$STACK_ENVIRONMENT" in
    local)      POSTGRES_CONTAINER="emr-postgres-local" ;;
    staging)    POSTGRES_CONTAINER="emr-postgres-stag" ;;
    production) POSTGRES_CONTAINER="emr-postgres-prod" ;;
esac

echo "=== EMR Backend Status Check (${STACK_ENVIRONMENT}) ==="
echo

echo "=== Container Status ==="
CONTAINER_INFO=$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "$BACKEND_CONTAINER" || true)
if [[ -n "$CONTAINER_INFO" ]]; then
    echo "$CONTAINER_INFO"
    echo "✓ Backend container running"
else
    echo "✗ Backend container '$BACKEND_CONTAINER' not running"
    exit 1
fi

echo
echo "=== Backend Container Logs (last 20 lines) ==="
docker logs --tail 20 "$BACKEND_CONTAINER" 2>&1 | tail -20

echo
echo "=== Health Check (${STACK_HEALTH_URL}) ==="
if curl -sS --max-time 10 "$STACK_HEALTH_URL" | head -1; then
    echo "✓ Health check successful"
else
    echo "✗ Health check failed"
fi

echo
echo "=== Database Connection Test ==="
if docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U emradmin >/dev/null 2>&1; then
        echo "✓ Database accepting connections (container: ${POSTGRES_CONTAINER})"
    else
        echo "✗ Database not accepting connections"
    fi
else
    echo "✗ Database container '${POSTGRES_CONTAINER}' not running"
fi

echo
echo "=== All EMR Containers ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "NAMES|emr-"
