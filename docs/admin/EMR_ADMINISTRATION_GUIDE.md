# EMR System Administration Guide

Guide for **application administrators** (users, roles, clinics, audit). Infrastructure and deploy procedures are in the [operations runbook](../operations/RUNBOOK.md).

## Related documentation

| Topic | Document |
|-------|----------|
| Operations (deploy, backup, health) | [operations/RUNBOOK.md](../operations/RUNBOOK.md) |
| System architecture | [architecture/OVERVIEW.md](../architecture/OVERVIEW.md) |
| RBAC | [architecture/AUTH_AND_RBAC.md](../architecture/AUTH_AND_RBAC.md) |
| Support tiers | [EMR_SUPPORT_MAINTENANCE.md](EMR_SUPPORT_MAINTENANCE.md) |
| Go-live | [testing/EMR_GO_LIVE_CHECKLIST.md](../testing/EMR_GO_LIVE_CHECKLIST.md) |

## Admin UI (`/admin`)

| Task | Path |
|------|------|
| Dashboard & KPIs | `/admin` |
| Users | `/admin/users` |
| Roles & page permissions | `/admin/roles` |
| Clinics & departments | `/admin/clinics` |
| Rooms | `/admin/rooms` |
| System settings | `/admin/settings` |
| **System health** (API, DB, disk, backups) | `/admin/health` |
| Audit trail | `/admin/audit` |
| Annual check-up programme | `/admin/annual-checkup-programme` |

Access requires Administration module pages on the user's role (or superuser).

## User management

### Create a user

1. Go to **Administration → User Management** (`/admin/users`).
2. Add user: username, email, name, clinic/department, system role.
3. Assign **roles** (page permissions come from roles).
4. Set a **temporary password**; user should change it on first login.
5. Optional: per-user page overrides (`custom_pages_mode` / `custom_pages`).

Do not share passwords by email or chat. Use your organisation's account-provisioning process.

### Roles & permissions

- Roles define which **UI pages** a user can open (see [AUTH_AND_RBAC.md](../architecture/AUTH_AND_RBAC.md)).
- The API enforces the same pages on the backend.
- Review roles after module go-lives or staff transfers.

### Password & lockout

- Password rules are configured under **System Settings → Security** (UI) and Django auth validators (backend).
- Failed login throttling applies to the auth endpoints.
- Unlock locked accounts from User Management or via support procedure.

## Clinics & multi-clinic

- Configure clinics and departments under `/admin/clinics`.
- When **multi-clinic** is enabled (`SystemConfig`), users may have multiple clinic assignments and an active clinic.
- Orders and visits are scoped by location clinic where applicable.

## Monitoring (application)

Use the in-app health page rather than ad-hoc server scripts:

1. **Admin dashboard** → System Health card → **View Details**
2. **`/admin/health`** — API uptime, database, disk volume, cache readiness, backup files, API performance

Backup **Warning / Not configured** means no backup file was found in configured search paths — see [RUNBOOK.md](../operations/RUNBOOK.md#backups).

For server-level commands (deploy, logs, emergency):

```bash
./scripts/production/env-manager.sh status
./scripts/production/env-manager.sh health
./scripts/production/env-manager.sh backup-status
```

## Audit trail

- View logs at `/admin/audit`.
- Coverage details: [architecture/AUDIT.md](../architecture/AUDIT.md).
- Review periodically for failed logins, permission changes, and bulk exports.

## Security practices

- No shared superuser accounts for daily work.
- Remove access promptly when staff leave.
- Do not publish internal URLs or credentials in user-facing docs.
- Report incidents per [SECURITY.md](../../SECURITY.md).

## Daily checklist (admin)

- [ ] Check `/admin/health` (or dashboard System Health)
- [ ] Review backup status on health page
- [ ] Scan audit log for failed auth or unusual exports
- [ ] Confirm no critical alerts from ops monitoring (if configured)

## Quarterly review

- [ ] Role assignments vs actual job functions
- [ ] Inactive users disabled
- [ ] This guide and [RUNBOOK.md](../operations/RUNBOOK.md) still match production layout

---

*Last reviewed: 2026-06. Update when admin UI or RBAC changes.*
