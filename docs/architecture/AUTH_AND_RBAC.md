# Authentication and RBAC

How users sign in, how the frontend gates pages, and how the backend enforces the same rules on API calls.

## Authentication

| Mechanism | Details |
|-----------|---------|
| Login | `POST /api/v1/accounts/auth/token/` (throttled: `auth_login`) |
| Refresh | `POST /api/v1/accounts/auth/token/refresh/` (throttled: `auth_refresh`) |
| Tokens | JWT access + refresh; access includes `pv` (permissions version) claim |
| Activity | `JWTAuthenticationWithActivity` updates `last_activity` for presence |
| Stale access | If `pv` on token ≠ `User.permissions_version` → 401 `permissions_stale` → re-login |

Frontend stores session markers in cookies (`lib/auth-cookie-names.ts`). `middleware.ts` redirects unauthenticated users to `/login`.

## Page permissions (frontend)

**Source of truth for UI pages:** `frontend/lib/page-permissions.ts` (`ALL_PAGE_PERMISSIONS`).

Each access role holds a list of page paths (e.g. `/nursing`, `/consultation/start`). Users may have per-user overrides:

- `custom_pages_mode`: `restrict` (only mode exposed in admin UI; `add`/`replace` exist in backend)
- `custom_pages`: paths subtracted from the role when mode is `restrict`

Middleware uses `isPathAllowedByPages()` (`lib/home-route.ts`) — exact match or prefix match.

Global pages for all authenticated users: `/notifications`, `/settings`, `/help`.

## Capabilities (fine-grained actions)

**Catalog (keep in sync):**

- `frontend/lib/capabilities.ts` (`ALL_CAPABILITIES`, `PAGE_TO_CAPABILITIES`)
- `backend/permissions/capabilities.py` (`CAPABILITY_CATALOG`, `PAGE_TO_CAPABILITIES`)

Run `make docs-check` after changing either file.

Roles store capabilities in `permissions` JSON:

```json
{ "pages": ["/medical-records/patients", "..."], "capabilities": ["patient_merge", "..."] }
```

When no capabilities are set, the field remains a plain page list.

**Resolution:** `permissions/user_capabilities.py` → `get_user_capabilities(user)`

- Superuser or `type=admin` role → all capability IDs
- Otherwise: union of explicit role capabilities + capabilities implied by granted pages

**Examples:**

| Capability | Typical grant |
|------------|----------------|
| `patient_delete` | ICT / admin roles |
| `patient_merge`, `patient_unmerge` | ICT / admin roles |
| `patient_convert_csr`, `patient_promote_officer`, `patient_convert_retiree` | Medical Records Officer or dept heads (lifecycle) |
| `annual_checkup_programme_edit` | Implied by `/admin/annual-checkup-programme` |
| `hr_compliance_manage` | Implied by `/hr` pages |
| `annual_checkup_signoff` | Medical Doctor preset |

`/auth/me` returns `permissions.capabilities: string[]` for UI hooks (`useCapability`, `patient-permissions.ts`).

## Page permissions (backend)

**Resolution:** `permissions/user_pages.py` → `get_user_allowed_pages(user)`

**API enforcement:** `permissions/drf_permissions.py` → `ApiPageAccessPermission`

**Path mapping:** `permissions/api_access.py` → `check_api_page_access(path, method, allowed_pages)`

Sensitive patient actions (delete, merge, CSR, programme edit) are enforced in **view helpers** (`patients/permissions.py`) via capabilities, not only page paths.

## `/auth/me` payload

`UserSerializer.get_permissions()` returns:

- `pages` — from `get_user_allowed_pages_for_response()`
- `capabilities` — from `get_user_capabilities_for_response()`
- `actions` — legacy module/action counts from `permission_actions.py`

Also: `access_role_id`, `access_role_name` on user records.

## Production rollout (capabilities + session version)

### 1. Migrate

```bash
# Local
make backend-migrate

# Docker prod (example)
docker exec emr-backend-prod python manage.py migrate accounts
```

Adds `User.permissions_version` (default `1`).

### 2. Backfill user access roles (if Access Role column shows "—")

Legacy accounts may have only `User.system_role` (text) and no `user_roles` row. The User Management **Access Role** column reads `user_roles` → `roles`, not `system_role`.

Dry-run:

```bash
python manage.py backfill_user_access_roles
```

Apply (matches `system_role` to `Role.name`, creates `UserRole`):

```bash
python manage.py backfill_user_access_roles --apply
```

Users with neither `system_role` nor an access role must be assigned manually under **Edit Staff → Access**.

### 3. Seed module support roles

```bash
python manage.py seed_support_roles --apply
```

Creates **Medical Records Support**, **Pharmacy Support**, **Laboratory Support**, **Nursing Support**, **Radiology Support**, **Physiotherapy Support**, **Clinical Support**, **HR Support**, and **ICT Support** from officer templates. Re-run with `--update-existing` after officer page changes.

### 4. Backfill role capabilities (recommended)

Dry-run first:

```bash
python manage.py backfill_role_capabilities
```

Apply defaults (admin types + name presets + page-implied caps):

```bash
python manage.py backfill_role_capabilities --apply
```

This bumps `permissions_version` for users on changed roles.

### 5. Re-login

All users should sign out and sign in again so JWTs include the current `pv` claim. Users with stale tokens receive `permissions_stale` on the next API call.

### 6. Manual review (optional)

**Admin → Roles & Permissions → Edit Role → Capabilities** — adjust grants per site policy.

**Admin → User Management → Edit Staff → Access** — access role + restrict pages.

Preview effective access: **View Role** or `GET /api/v1/permissions/roles/{id}/effective-access/`.

## Protected media

Uploads are not served publicly from `/media/`. Authenticated access via:

`GET /api/v1/common/media/<path>`

## Adding a new module page

1. Add path to `frontend/lib/page-permissions.ts`
2. Add path to `backend/permissions/page_catalog.py`
3. Map API prefix in `backend/permissions/api_access.py`
4. Add sidebar entry in `components/shared/AppSidebar.tsx`
5. Run `make docs-check`

## Adding a new capability

1. Add to `backend/permissions/capabilities.py` (`CAPABILITY_CATALOG`, optional `PAGE_TO_CAPABILITIES`)
2. Add to `frontend/lib/capabilities.ts`
3. Enforce in backend view/permission helper
4. Wire frontend with `useCapability` or `patient-permissions.ts`
5. Run `make docs-check`

## Tests

- `permissions/tests/test_api_access.py` — API path rules
- `permissions/tests/test_user_capabilities.py` — capability resolution
- `permissions/tests/test_backfill_role_capabilities.py` — backfill command
- `permissions/tests/test_backfill_user_access_roles.py` — legacy system_role → UserRole
- `permissions/tests/test_seed_support_roles.py` — support role seeding
- `frontend/lib/sidebar-pages.test.ts` — sidebar ↔ page catalog
