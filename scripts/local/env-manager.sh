#!/usr/bin/env bash
# Local operations entry-point.
# Thin wrapper around scripts/ops/env-manager.sh, with env pinned to local.
#
# Usage: scripts/local/env-manager.sh <command> [args]
# Run with no arguments for the full command list.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../ops/env-manager.sh" local "$@"
