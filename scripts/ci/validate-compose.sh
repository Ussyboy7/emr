#!/usr/bin/env bash
# Validate docker-compose files parse (used in CI).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"

echo "Validating docker-compose.stag.yml..."
docker compose -f docker-compose.stag.yml config --quiet

echo "Validating docker-compose.prod.yml..."
export DB_NAME="${DB_NAME:-emr_db_ci}"
export DB_USER="${DB_USER:-emradmin}"
export DB_PASSWORD="${DB_PASSWORD:-ci_password}"
export REDIS_PASSWORD="${REDIS_PASSWORD:-ci_redis_password}"
docker compose -f docker-compose.prod.yml config --quiet

echo "Compose files OK."
