#!/usr/bin/env bash
# Restart the Staging stack.
# Thin wrapper around stack/restart.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../stack/restart.sh" stag "$@"
