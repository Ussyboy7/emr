#!/usr/bin/env bash
# Tail logs from one or all services in an environment.
# Usage: scripts/ops/logs.sh <env> [service] [--tail N] [--follow]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/stack-utils.sh
source "${SCRIPT_DIR}/../lib/stack-utils.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/ops/logs.sh <env> [service] [options]

Environments: local | stag | prod

Options:
  --tail <N>   Number of lines to show (default: 100)
  --follow     Follow log output (Ctrl+C to exit)

Examples:
  scripts/ops/logs.sh prod
  scripts/ops/logs.sh prod backend --follow
  scripts/ops/logs.sh stag nginx --tail 200
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

stack_init_env "$1"
shift

SERVICE=""
TAIL=100
FOLLOW=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --tail)   TAIL="$2"; shift 2 ;;
        --follow) FOLLOW=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *)        SERVICE="$1"; shift ;;
    esac
done

ARGS=(logs --tail "$TAIL")
$FOLLOW && ARGS+=(-f)
[[ -n "$SERVICE" ]] && ARGS+=("$SERVICE")

stack_compose "${ARGS[@]}"
