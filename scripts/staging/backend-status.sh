#!/usr/bin/env bash
# Detailed Staging backend status.
# Thin wrapper around stack/backend-status.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../stack/backend-status.sh" stag "$@"
