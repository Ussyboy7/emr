.PHONY: backend-install backend-install-dev backend-migrate backend-seed backend-run backend-reset db-bootstrap docs-schema docs-check test test-backend test-frontend test-backend-coverage ci ci-quick ci-docker ci-docker-quick security-check

VENV=backend/.venv
PYTHON=$(VENV)/bin/python
PIP=$(VENV)/bin/pip

backend-install:
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt
	$(PIP) install -r backend/requirements-dev.txt

backend-install-dev:
	$(PIP) install -r backend/requirements-dev.txt

backend-migrate:
	$(PYTHON) backend/manage.py migrate

backend-seed:
	$(PYTHON) backend/manage.py seed_demo_data

backend-run:
	$(PYTHON) backend/manage.py runserver 0.0.0.0:8001

backend-reset:
	rm -rf backend/.venv
	find backend -name "__pycache__" -type d -prune -exec rm -rf {} +

# Requires psql superuser privileges
db-bootstrap:
	psql -U postgres -f backend/scripts/bootstrap_postgres.sql

# Generate docs/database/schema.dot and schema.png (requires venv + requirements-dev.txt + graphviz)
docs-schema:
	bash backend/scripts/generate_schema_diagram.sh

# Fail if frontend catalogs diverge from backend
docs-check:
	python3 scripts/docs/check_page_catalog_sync.py
	python3 scripts/docs/check_capability_catalog_sync.py

# Local postgres defaults match docker-compose.local.yml (port 5435)
TEST_DB_ENV=DB_HOST=localhost DB_PORT=5435 DB_NAME=emr_db_local DB_USER=emradmin DB_PASSWORD=emradmin DJANGO_SETTINGS_MODULE=emr_backend.settings_test

test-backend:
	$(TEST_DB_ENV) PYTHON="$(abspath $(PYTHON))" bash scripts/ci/run-backend-tests.sh

test-backend-coverage:
	cd backend && $(TEST_DB_ENV) $(abspath $(PYTHON)) -m coverage run --source=. manage.py test --verbosity=0
	cd backend && $(abspath $(PYTHON)) -m coverage report --skip-covered --show-missing

test-frontend:
	cd frontend && npm test

test: test-backend test-frontend docs-check

# Mirror .github/workflows/ci-cd.yml before you push (see docs/operations/CI_CD.md)
ci:
	bash scripts/ci/run-local-ci.sh

ci-quick:
	bash scripts/ci/run-local-ci.sh --quick

# Docker-first local CI — no backend/.venv (see docs/operations/CI_CD.md)
ci-docker:
	bash scripts/ci/run-docker-ci.sh

ci-docker-quick:
	bash scripts/ci/run-docker-ci.sh --quick

security-check:
	$(PYTHON) -m bandit -r backend -lll -q
	$(PYTHON) -m pip_audit -r backend/requirements.txt
	cd frontend && npm audit --audit-level=critical

