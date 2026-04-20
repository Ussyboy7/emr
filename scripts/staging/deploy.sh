#!/usr/bin/env bash
# Deploy the Staging environment (thin wrapper → ops/deploy.sh stag).
#
# Canonical server: 172.16.0.46 — checkout /srv/emr (typically devsecops).
# Pre-deploy SQL snapshots default to /srv/emr/backups.
#
# Override when needed: DEPLOY_PATH, BACKUP_DIR, SERVER_IP, STACK_HEALTH_URL_OVERRIDE.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../ops/deploy.sh" stag "$@"
