# NPA EMR Documentation

Start here. This index lists **maintained** documentation. Generated API docs live in OpenAPI when enabled (see [api/README.md](api/README.md)).

## For developers

| Document | Description |
|----------|-------------|
| [architecture/OVERVIEW.md](architecture/OVERVIEW.md) | System components, request flow, environments |
| [architecture/AUTH_AND_RBAC.md](architecture/AUTH_AND_RBAC.md) | Login, JWT cookies, page permissions, API enforcement |
| [architecture/AUDIT.md](architecture/AUDIT.md) | Audit trail coverage and performance |
| [api/README.md](api/README.md) | OpenAPI, auth, versioning, throttling |
| [database/README.md](database/README.md) | Schema overview and ERD generation |
| [workflows/VISIT_LIFECYCLE.md](workflows/VISIT_LIFECYCLE.md) | End-to-end clinical flow |
| [../AGENTS.md](../AGENTS.md) | AI/dev agent conventions |
| [../scripts/README.md](../scripts/README.md) | Operational scripts architecture |

## For operations

| Document | Description |
|----------|-------------|
| [operations/RUNBOOK.md](operations/RUNBOOK.md) | Deploy, backup, health, incidents |
| [operations/CI_CD.md](operations/CI_CD.md) | GitHub Actions CI/CD and self-hosted runners |
| [../PRODUCTION_OPERATIONS.md](../PRODUCTION_OPERATIONS.md) | Quick pointer to runbook + env-manager |

## For administrators & users

| Document | Description |
|----------|-------------|
| [admin/EMR_ADMINISTRATION_GUIDE.md](admin/EMR_ADMINISTRATION_GUIDE.md) | Production admin procedures |
| [admin/EMR_SUPPORT_MAINTENANCE.md](admin/EMR_SUPPORT_MAINTENANCE.md) | Support and maintenance |
| [user/EMR_USER_QUICK_START_GUIDE.md](user/EMR_USER_QUICK_START_GUIDE.md) | End-user quick start |
| [user/ROLE_MEDICAL_RECORDS.md](user/ROLE_MEDICAL_RECORDS.md) | Medical records role guide |
| [user/ROLE_NURSING.md](user/ROLE_NURSING.md) | Nursing role guide |
| [user/ROLE_CONSULTATION.md](user/ROLE_CONSULTATION.md) | Consultation / doctor guide |
| [user/ROLE_LABORATORY.md](user/ROLE_LABORATORY.md) | Laboratory role guide |
| [user/ROLE_PHARMACY.md](user/ROLE_PHARMACY.md) | Pharmacy role guide |
| [user/ROLE_ADMINISTRATION.md](user/ROLE_ADMINISTRATION.md) | Administration role guide |

## Workflows & modules

| Document | Description |
|----------|-------------|
| [workflows/VISIT_LIFECYCLE.md](workflows/VISIT_LIFECYCLE.md) | Patient → visit → modules |
| [workflows/PHYSIOTHERAPY.md](workflows/PHYSIOTHERAPY.md) | Physiotherapy order flow |
| [workflows/PHARMACY.md](workflows/PHARMACY.md) | Medication strengths and topicals |

## Testing & go-live

| Document | Description |
|----------|-------------|
| [testing/README.md](testing/README.md) | Testing index |
| [testing/UAT_BY_DEPARTMENT.md](testing/UAT_BY_DEPARTMENT.md) | Full UAT — per department, per module |
| [testing/checklists/](testing/checklists/README.md) | Printable UAT one-pagers per department |
| [testing/UAT_SCENARIOS.md](testing/UAT_SCENARIOS.md) | Quick UAT role checklist |
| [testing/UAT_SIGNOFF.md](testing/UAT_SIGNOFF.md) | UAT sign-off and go/no-go record |
| [testing/EMR_GO_LIVE_CHECKLIST.md](testing/EMR_GO_LIVE_CHECKLIST.md) | Go-live checklist |

## Compliance & planning

| Document | Description |
|----------|-------------|
| [compliance/ICT_EMR_AUDIT_CHECKLIST.md](compliance/ICT_EMR_AUDIT_CHECKLIST.md) | ICT audit backlog |
| [planning/ANNUAL_CHECKUP_AND_ORACLE_HR.md](planning/ANNUAL_CHECKUP_AND_ORACLE_HR.md) | Annual check-up / HR integration notes |
| [planning/EMAIL_AND_SMTP.md](planning/EMAIL_AND_SMTP.md) | Email/SMTP requirements, ICT checklist, clinical mail roadmap (planned) |

## Integrations

| Document | Description |
|----------|-------------|
| [../integration/urit5160/README.md](../integration/urit5160/README.md) | URIT 5160 hematology analyzer (HL7 middleware) |

## Security

| Document | Description |
|----------|-------------|
| [../SECURITY.md](../SECURITY.md) | Vulnerability reporting and known incidents |

## Archive (historical only)

| Document | Description |
|----------|-------------|
| [archive/EMR_DEPLOYMENT_HISTORY.md](archive/EMR_DEPLOYMENT_HISTORY.md) | Original production deployment log (reference) |

## Local setup

- Backend: [../backend/README.md](../backend/README.md)
- Frontend: [../frontend/README.md](../frontend/README.md)

## Keeping docs honest

- **API endpoints** — document in OpenAPI (`ENABLE_API_DOCS=true`), not duplicate lists in markdown.
- **Page permissions** — source of truth: `frontend/lib/page-permissions.ts` and `backend/permissions/page_catalog.py`. Run `make docs-check` after adding pages.
- **Ops commands** — source of truth: `scripts/ops/env-manager.sh` (see `scripts/README.md`).
