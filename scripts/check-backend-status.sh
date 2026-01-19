#!/usr/bin/env bash

# Quick script to check EMR backend service status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/stack-utils.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/check-backend-status.sh <environment>

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

ENVIRONMENT="$1"
stack_init_env "$ENVIRONMENT"

echo "=== EMR Backend Status Check ($STACK_ENVIRONMENT) ==="
echo ""

# Determine container names based on environment
case "$ENVIRONMENT" in
    local)
        BACKEND_CONTAINER="emr-backend-local"
        POSTGRES_CONTAINER="emr-postgres-local"
        DB_NAME="emr_db_local"
        ;;
    stag|staging)
        BACKEND_CONTAINER="emr-backend-stag"
        POSTGRES_CONTAINER="emr-postgres-stag"
        DB_NAME="emr_db_stag"
        ;;
    prod|production)
        BACKEND_CONTAINER="emr-backend"
        POSTGRES_CONTAINER="emr-postgres"
        DB_NAME="emr_db_prod"
        ;;
    *)
        echo "Unknown environment: $ENVIRONMENT" >&2
        exit 1
        ;;
esac

# Check container status
echo "=== Container Status ==="
CONTAINER_INFO=$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "$BACKEND_CONTAINER" || true)
if [[ -n "$CONTAINER_INFO" ]]; then
    echo "$CONTAINER_INFO"
    echo "✅ Backend container running"
else
    echo "❌ Backend container not running"
    exit 1
fi

echo ""
echo "=== Backend Container Logs (last 20 lines) ==="
docker logs --tail 20 "$BACKEND_CONTAINER" 2>&1 | tail -20

echo ""
echo "=== Health Check ==="
if curl -s --max-time 10 "$STACK_HEALTH_URL" | head -1; then
    echo "✅ Health check successful"
else
    echo "❌ Health check failed"
fi

echo ""
echo "=== Database Connection Test ==="
DB_CONTAINER_INFO=$(docker ps --format "table {{.Names}}" | grep "$POSTGRES_CONTAINER" || true)
if [[ -n "$DB_CONTAINER_INFO" ]]; then
    # Try to connect to database
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U emradmin -d "$DB_NAME" >/dev/null 2>&1; then
        echo "✅ Database connection successful"
    else
        echo "❌ Database connection failed"
    fi
else
    echo "❌ Database container not running"
fi

echo ""
echo "=== All EMR Containers ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "NAMES|emr-"
