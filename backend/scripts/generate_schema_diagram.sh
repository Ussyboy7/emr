#!/usr/bin/env bash
# Generate docs/database/schema.dot and schema.png (core EMR apps).
# Prereqs: backend/venv, pip install -r backend/requirements-dev.txt, graphviz.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON="${ROOT}/backend/venv/bin/python"
cd "$ROOT/backend"
OUT_DIR="$ROOT/docs/database"
mkdir -p "$OUT_DIR"

APPS="accounts organization patients consultation nursing laboratory pharmacy radiology permissions audit"

DJANGO_SETTINGS_MODULE=emr_backend.settings_erd "$PYTHON" manage.py graph_models $APPS \
  --group-models \
  -o "$OUT_DIR/schema.dot"

dot -Kfdp -Tpng "$OUT_DIR/schema.dot" -o "$OUT_DIR/schema.png"
echo "Wrote $OUT_DIR/schema.dot and schema.png"
