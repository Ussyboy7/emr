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

**Page permissions** must match frontend routes — source of truth is documented in [AUTH_AND_RBAC.md](../architecture/AUTH_AND_RBAC.md). After adding UI pages or capabilities, run `make docs-check` in development.

**Capabilities** (merge patients, programme edit, etc.) are configured per access role under **Capabilities** in the role editor, or via `python manage.py backfill_role_capabilities --apply` after deploy.

## Officer vs support roles

Access roles are **global permission templates** — they are not tied to a department in the database. In practice you pair them like this:

| Field | Meaning | Example |
|-------|---------|---------|
| **Department** (User Management) | Where the person works | Medical Records, Pharmacy, ICT |
| **Access role** | What they can do in the EMR | Medical Records Officer vs Medical Records Support |

### Recommended naming

Use a consistent pattern so admins can scan the role list:

| Pattern | Who | Example |
|---------|-----|---------|
| `{Module} Officer` | Full module lead / professional | Medical Records Officer, Pharmacist |
| `{Module} Support` | Clerical, assistant, attachment staff in that module | Medical Records Support, Pharmacy Support |
| `ICT Administrator` | Full ICT / system admin | — |
| `ICT Support` | Helpdesk, limited admin pages | — |
| `Corps Member ({Module})` | NYSC / intern in a specific unit | Corps Member (Medical Records) |

Avoid vague names like **Corper** or **IT** alone — use **ICT Support** or **Corps Member (Laboratory)** so User Management stays clear.

### Creating support roles (production)

Seed all module support roles from existing officer roles:

```bash
python manage.py seed_support_roles
python manage.py seed_support_roles --apply
python manage.py seed_support_roles --apply --update-existing
```

Creates paired roles such as **Medical Records Officer** → **Medical Records Support**, plus standalone **ICT Support**. Assign Support to corps members and IT attachments; assign Officer to permanent module staff.

### Creating a support role manually

1. **Admin → Roles & Permissions** → find the officer role (e.g. Medical Records Officer).
2. Click **Duplicate** (copy icon) — pre-fills `{Name} Support`, copies pages, and strips sensitive capabilities (merge, delete, programme edit, etc.).
3. Adjust **Pages** and **Capabilities** (support usually keeps view/queue pages only).
4. Save, then assign under **Users → Edit Staff → Access Role**.

Department heads can still scope **which users** they manage; access role controls **which screens** those users see.

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
