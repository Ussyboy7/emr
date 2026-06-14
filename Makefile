.PHONY: backend-install backend-migrate backend-seed backend-run backend-reset db-bootstrap docs-schema docs-check

VENV=backend/.venv
PYTHON=$(VENV)/bin/python
PIP=$(VENV)/bin/pip

backend-install:
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt

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

# Fail if frontend page-permissions.ts and backend page_catalog.py diverge
docs-check:
	python3 scripts/docs/check_page_catalog_sync.py

