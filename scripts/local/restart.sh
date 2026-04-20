#!/usr/bin/env bash
# Restart the Local stack.
# Thin wrapper around stack/restart.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../stack/restart.sh" local "$@"
