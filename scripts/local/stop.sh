#!/usr/bin/env bash
# Stop the Local stack.
# Thin wrapper around stack/stop.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../stack/stop.sh" local "$@"
