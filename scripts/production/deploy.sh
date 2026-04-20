#!/usr/bin/env bash
# Deploy the Production environment (thin wrapper → ops/deploy.sh prod).
#
# Canonical server: 172.16.0.32 — checkout /home/emrprod/emr (emrprod).
# Pre-deploy SQL snapshots go to $HOME/emr-predeploy-backups by default (not
# ./backups in the repo; that path is often not writable for emrprod).
#
# Override when needed: DEPLOY_PATH, BACKUP_DIR, SERVER_IP, STACK_HEALTH_URL_OVERRIDE.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../ops/deploy.sh" prod "$@"
