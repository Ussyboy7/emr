#!/usr/bin/env bash
# Seed radiology templates only (for Docker or local backend).
# Usage: scripts/stack/seed-radiology.sh <environment>
# Example: scripts/stack/seed-radiology.sh local

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/stack-utils.sh
source "${SCRIPT_DIR}/../lib/stack-utils.sh"

if [[ $# -lt 1 ]]; then
    echo "Usage: scripts/stack/seed-radiology.sh <environment>" >&2
    echo "  environment: local | stag | prod" >&2
    echo "Example: scripts/stack/seed-radiology.sh local" >&2
    exit 1
fi

stack_init_env "$1"

echo "Seeding radiology templates in ${STACK_ENVIRONMENT}..."
stack_backend_manage populate_radiology_templates
echo "Done."
