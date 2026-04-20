#!/usr/bin/env bash
# Seed demo data into Local.
# Thin wrapper around stack/seed.sh.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../stack/seed.sh" local "$@"
