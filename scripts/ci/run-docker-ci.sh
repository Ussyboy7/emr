#!/usr/bin/env bash
# Run CI checks using Docker (no host venv). Mirrors run-local-ci.sh / ci-cd.yml.
#
# Usage:
#   make ci-docker              # full (includes prod image builds if Docker is running)
#   make ci-docker-quick        # skip Docker image builds
#   bash scripts/ci/run-docker-ci.sh [--quick]
#
# Prerequisites:
#   - Docker running
#   - scripts/local/env-manager.sh start  (or this script will start postgres + backend)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
QUICK=false

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=true ;;
    -h|--help)
      echo "Usage: $0 [--quick]"
      echo "  --quick   Skip Docker compose validate and prod/stag image builds"
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# shellcheck source=../lib/stack-utils.sh
source "${PROJECT_ROOT}/scripts/lib/stack-utils.sh"
stack_init_env local

step() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "▶ $1"
  echo "════════════════════════════════════════════════════════════"
}

wait_postgres() {
  local attempts=30
  local i
  for ((i = 1; i <= attempts; i++)); do
    if stack_compose exec -T postgres pg_isready -U emradmin -d emr_db_local >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "❌ Postgres did not become ready" >&2
  exit 1
}

cd "${PROJECT_ROOT}"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "❌ Docker is not running" >&2
  exit 1
fi

step "Docker: ensure local stack (postgres, redis, backend)"
stack_compose up -d postgres redis backend
wait_postgres

# --- backend (inside container — same DB/network as the running app) ---
step "Backend: migration check"
stack_compose_exec backend python manage.py makemigrations --check --dry-run

step "Backend: Django tests (Postgres service: postgres/emr_db_local)"
APPS=($("${SCRIPT_DIR}/backend-test-apps.sh"))
stack_compose_exec backend env DJANGO_SETTINGS_MODULE=emr_backend.settings_test \
  python manage.py test "${APPS[@]}" --verbosity=1

# --- frontend (host npm — node_modules live in the frontend container volume) ---
step "Frontend: npm ci"
cd frontend
npm ci

step "Frontend: Vitest"
npm test

step "Frontend: TypeScript"
npm run type-check

step "Frontend: ESLint"
npm run lint

step "Frontend: production build"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8001/api}" npm run build
cd "${PROJECT_ROOT}"

# --- docs ---
step "Docs: catalog sync"
make docs-check

# --- security (dev tools installed in backend container for this step only) ---
step "Security: Bandit + pip-audit (backend container)"
stack_compose_exec backend sh -c \
  "pip install -q bandit pip-audit && bandit -r . -lll -q && pip-audit -r requirements.txt"

step "Security: npm audit (critical)"
cd frontend
npm audit --audit-level=critical
cd "${PROJECT_ROOT}"

# --- docker validate / prod builds (optional) ---
if $QUICK; then
  echo ""
  echo "⏭️  Skipping Docker validate and image builds (--quick)"
else
  step "Docker: compose validate"
  bash scripts/ci/validate-compose.sh

  step "Docker: build backend image (no push)"
  docker build -f backend/Dockerfile.prod -t emr-backend:local-ci ./backend

  step "Docker: build staging frontend image (no push)"
  docker build -f frontend/Dockerfile.stag \
    --build-arg NEXT_PUBLIC_API_URL=http://172.16.0.46:8047/api \
    --build-arg NEXT_PUBLIC_ENVIRONMENT=staging \
    -t emr-frontend:local-ci ./frontend
fi

echo ""
echo "✅ Docker CI passed — safe to push (deploy jobs still run on GitHub runners)"
