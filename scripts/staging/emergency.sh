#!/usr/bin/env bash
# Staging emergency operations.
# Thin wrapper around ops/emergency.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../ops/emergency.sh" stag "$@"
