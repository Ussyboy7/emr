#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/stack-utils.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/seed-data.sh <environment> [-- manage.py args]

Examples:
  scripts/seed-data.sh local
  scripts/seed-data.sh stag -- --reset
  scripts/seed-data.sh stag -- --skip-users --reset
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

ENVIRONMENT="$1"
shift || true

MANAGE_ARGS=("$@")

stack_init_env "$ENVIRONMENT"

echo "Seeding demo data in ${STACK_ENVIRONMENT}..."
if [[ ${#MANAGE_ARGS[@]} -gt 0 ]]; then
    stack_backend_manage seed_demo_data "${MANAGE_ARGS[@]}"
else
    stack_backend_manage seed_demo_data
fi
