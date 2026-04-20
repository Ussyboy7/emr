#!/usr/bin/env bash
# Run Staging health checks.
# Thin wrapper around stack/health.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../stack/health.sh" stag "$@"
