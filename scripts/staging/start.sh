#!/usr/bin/env bash
# Bring up the Staging stack.
# Thin wrapper around stack/start.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../stack/start.sh" stag "$@"
