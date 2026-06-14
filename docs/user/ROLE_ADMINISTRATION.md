# Administration — User Guide

For system administrators managing users, roles, clinics, health monitoring, and configuration.

**Admin guide:** [EMR_ADMINISTRATION_GUIDE.md](../admin/EMR_ADMINISTRATION_GUIDE.md) · **Ops runbook:** [RUNBOOK.md](../operations/RUNBOOK.md)

## Typical sidebar modules

- Admin dashboard
- Users
- Roles & permissions
- Clinics / departments
- Rooms
- System settings
- System health (`/admin/health`)
- Audit log
- Annual check-up programme (if used)

## User & role management

| Task | Path |
|------|------|
| Create user | Admin → Users |
| Assign role | User detail → roles |
| Adjust page access | Roles → permissions (page list) |
| Deactivate leaver | Users → deactivate (same day) |

**Page permissions** must match frontend routes — source of truth is documented in [AUTH_AND_RBAC.md](../architecture/AUTH_AND_RBAC.md). After adding UI pages, run `make docs-check` in development.

## Health & operations

- **System health:** `/admin/health` — database, API, disk, backup status.
- **Deploy / backup:** use [RUNBOOK.md](../operations/RUNBOOK.md) and `env-manager.sh`, not legacy shell scripts.
- **Audit:** review authentication and sensitive actions regularly.

## Security practices

- No shared superuser accounts in production.
- Initial passwords: force change on first login where supported.
- Limit admin-type roles to ICT and named delegates.
- Report incidents per [SECURITY.md](../../SECURITY.md).

## Problems?

- **User cannot see module:** check role **pages**, not only role name.
- **Health warnings:** backup not configured on dev is expected; on production follow runbook.
- **Permission drift:** compare `page_catalog.py` with frontend after upgrades.

Support: [EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md)
