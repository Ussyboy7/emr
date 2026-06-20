#!/usr/bin/env bash
# Run the same checks as .github/workflows/ci-cd.yml (CI jobs only — no deploy).
#
# Usage:
#   make ci              # full (includes Docker build if Docker is running)
#   make ci-quick        # skip Docker image builds
#   bash scripts/ci/run-local-ci.sh --quick
#
# Prerequisites:
#   - make backend-install (venv + requirements + dev tools)
#   - Postgres on localhost:5435 (docker-compose.local.yml) for backend tests
#   - Node 20+ and npm ci in frontend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
QUICK=false

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=true ;;
    -h|--help)
      echo "Usage: $0 [--quick]"
      echo "  --quick   Skip Docker compose validate and image builds"
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

VENV_PYTHON="${PROJECT_ROOT}/backend/.venv/bin/python"
VENV_PIP="${PROJECT_ROOT}/backend/.venv/bin/pip"

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "❌ Missing backend/.venv — run: make backend-install" >&2
  exit 1
fi

# Match Makefile local test DB (docker-compose.local.yml)
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-5435}"
export DB_NAME="${DB_NAME:-emr_db_local}"
export DB_USER="${DB_USER:-emradmin}"
export DB_PASSWORD="${DB_PASSWORD:-emradmin}"
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-emr_backend.settings_test}"
export DJANGO_SECRET_KEY="${DJANGO_SECRET_KEY:-local-ci-secret-not-for-production}"
export PYTHON="${VENV_PYTHON}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8001/api}"

step() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "▶ $1"
  echo "════════════════════════════════════════════════════════════"
}

cd "${PROJECT_ROOT}"

# --- backend ---
step "Backend: migration check"
cd backend
"${VENV_PYTHON}" manage.py makemigrations --check --dry-run
cd "${PROJECT_ROOT}"

step "Backend: Django tests (Postgres ${DB_HOST}:${DB_PORT}/${DB_NAME})"
if ! command -v pg_isready >/dev/null 2>&1; then
  echo "⚠️  pg_isready not found — ensure Postgres is running on port ${DB_PORT}"
else
  if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" >/dev/null 2>&1; then
    echo "❌ Postgres not reachable at ${DB_HOST}:${DB_PORT}" >&2
    echo "   Start local stack: scripts/local/env-manager.sh start" >&2
    exit 1
  fi
fi
bash scripts/ci/run-backend-tests.sh

# --- frontend ---
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
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL}" npm run build
cd "${PROJECT_ROOT}"

# --- docs ---
step "Docs: catalog sync"
make docs-check

# --- security ---
step "Security: Bandit (high severity)"
"${VENV_PYTHON}" -m bandit -r backend -lll -q

step "Security: pip-audit"
"${VENV_PYTHON}" -m pip_audit -r backend/requirements.txt

step "Security: npm audit (critical)"
cd frontend
npm audit --audit-level=critical
cd "${PROJECT_ROOT}"

# --- docker (optional) ---
if $QUICK; then
  echo ""
  echo "⏭️  Skipping Docker validate (--quick)"
else
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    step "Docker: compose validate"
    bash scripts/ci/validate-compose.sh

    step "Docker: build backend image (no push)"
    docker build -f backend/Dockerfile.prod -t emr-backend:local-ci ./backend

    step "Docker: build staging frontend image (no push)"
    docker build -f frontend/Dockerfile.stag \
      --build-arg NEXT_PUBLIC_API_URL=http://172.16.0.46:8047/api \
      --build-arg NEXT_PUBLIC_ENVIRONMENT=staging \
      -t emr-frontend:local-ci ./frontend
  else
    echo ""
    echo "⚠️  Docker not running — skipping compose validate and image builds"
    echo "   Run full CI with Docker started, or use: make ci-quick"
  fi
fi

echo ""
echo "✅ Local CI passed — safe to push (deploy jobs still run on GitHub runners)"
