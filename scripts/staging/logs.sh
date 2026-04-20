#!/usr/bin/env bash
# Tail Staging logs.
# Thin wrapper around ops/logs.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../ops/logs.sh" stag "$@"
