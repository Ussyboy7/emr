#!/usr/bin/env bash
# Open Staging real-time dashboard.
# Thin wrapper around ops/dashboard.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../ops/dashboard.sh" stag "$@"
