#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/stack-utils.sh"

usage() {
    cat <<'USAGE'
Usage: scripts/check-health.sh <environment> [options]

Options:
  --url <backend_url>        Override backend health endpoint
  --frontend-url <url>       Override frontend URL to ping
  --no-frontend              Skip frontend check
  --timeout <seconds>        Curl timeout (default: 10)
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

ENVIRONMENT="$1"
shift || true

CUSTOM_BACKEND=""
CUSTOM_FRONTEND=""
CHECK_FRONTEND=true
TIMEOUT=10

while [[ $# -gt 0 ]]; do
    case "$1" in
        --url|--backend-url)
            CUSTOM_BACKEND="$2"
            shift 2
            ;;
        --frontend-url)
            CUSTOM_FRONTEND="$2"
            shift 2
            ;;
        --no-frontend)
            CHECK_FRONTEND=false
            shift
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

stack_init_env "$ENVIRONMENT"

BACKEND_URL="${CUSTOM_BACKEND:-$STACK_HEALTH_URL}"
FRONTEND_URL="${CUSTOM_FRONTEND:-$STACK_FRONTEND_URL}"

echo "Checking backend health at $BACKEND_URL"
if curl -fSs --max-time "$TIMEOUT" "$BACKEND_URL" >/dev/null; then
    echo "✅ Backend healthy"
else
    echo "❌ Backend health check failed"
    exit 1
fi

if [[ "$CHECK_FRONTEND" == true && -n "$FRONTEND_URL" ]]; then
    echo "Checking frontend at $FRONTEND_URL"
    if curl -fSs --max-time "$TIMEOUT" "$FRONTEND_URL" >/dev/null; then
        echo "✅ Frontend reachable"
    else
        echo "⚠️  Frontend check failed"
    fi
fi
