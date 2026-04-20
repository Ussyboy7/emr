#!/usr/bin/env bash
# Deploy the Staging environment.
# Thin wrapper around ops/deploy.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../ops/deploy.sh" stag "$@"
