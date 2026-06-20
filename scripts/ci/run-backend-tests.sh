#!/usr/bin/env bash
# Run the full backend test suite (CI and local via Makefile).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
VERBOSITY="${TEST_VERBOSITY:-1}"

APPS=($("${SCRIPT_DIR}/backend-test-apps.sh"))

cd "${PROJECT_ROOT}/backend"
PYTHON_BIN="${PYTHON:-python}"
"${PYTHON_BIN}" manage.py test "${APPS[@]}" --verbosity="${VERBOSITY}"
