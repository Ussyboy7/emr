#!/usr/bin/env bash
# Quick Production status snapshot.
# Thin wrapper around ops/status.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../ops/status.sh" prod "$@"
