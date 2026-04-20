#!/usr/bin/env bash
# Unified Local operations CLI.
# Thin wrapper around ops/manager.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../ops/manager.sh" local "$@"
