# Authentication and RBAC

How users sign in, how the frontend gates pages, and how the backend enforces the same rules on API calls.

## Authentication

| Mechanism | Details |
|-----------|---------|
| Login | `POST /api/v1/accounts/auth/token/` (throttled: `auth_login`) |
| Refresh | `POST /api/v1/accounts/auth/token/refresh/` (throttled: `auth_refresh`) |
| Tokens | JWT access + refresh; access also stored in HTTP-only cookies for browser use |
| Activity | `JWTCookieAuthentication` updates `last_activity` for presence |

Frontend stores session markers in cookies (`lib/auth-cookie-names.ts`). `middleware.ts` redirects unauthenticated users to `/login`.

## Page permissions (frontend)

**Source of truth for UI pages:** `frontend/lib/page-permissions.ts` (`ALL_PAGE_PERMISSIONS`).

Each role holds a list of page paths (e.g. `/nursing`, `/consultation/start`). Users may have per-user overrides:

- `custom_pages_mode`: `add` | `restrict` | `replace`
- `custom_pages`: list of paths

Middleware uses `isPathAllowedByPages()` (`lib/home-route.ts`) — exact match or prefix match (e.g. `/medical-records/patients` allows nested routes).

Global pages for all authenticated users: `/notifications`, `/settings`, `/help`.

## Page permissions (backend)

**Resolution:** `permissions/user_pages.py` → `get_user_allowed_pages(user)`

- Superuser → full access sentinel
- Admin-type role → admin sentinel
- Otherwise: union of active role pages + overrides

**API enforcement:** `permissions/drf_permissions.py` → `ApiPageAccessPermission` (default on all DRF views)

**Path mapping:** `permissions/api_access.py` → `check_api_page_access(path, method, allowed_pages)`

Rules include:

- Module prefixes (`laboratory/` → `/laboratory` pages)
- Read vs write for `patients/`, `visits/`, `vitals/`
- Clinical shared reads (patient detail for any clinical module holder)
- **Fail closed** — unknown API paths return 403

Exempt paths: auth, health, notifications (user), upload, protected media, server-time.

## `/auth/me` payload

`UserSerializer.get_permissions()` returns:

- `pages` — from `get_user_allowed_pages_for_response()`
- `actions` — module/action counts from `permissions/permission_actions.py`

Keep `page_catalog.py` in sync with `page-permissions.ts` when adding pages.

## Protected media

Uploads are not served publicly from `/media/`. Authenticated access via:

`GET /api/v1/common/media/<path>`

Nginx returns 403 on direct `/media/` in production.

## Upload hardening

- Allowed types: PDF, JPEG, PNG, WebP
- Max size: 10 MB
- Folder allowlist in `common/upload_validation.py`
- Throttle scope: `file_upload`

## API documentation access

OpenAPI UI (`/api/docs/`, `/api/redoc/`) only when `ENABLE_API_DOCS=true` (typically local/staging, not public prod).

## Adding a new module page

1. Add path to `frontend/lib/page-permissions.ts`
2. Add path to `backend/permissions/page_catalog.py`
3. Map API prefix in `backend/permissions/api_access.py`
4. Optionally map page → action in `permission_actions.py`
5. Add sidebar entry in `components/shared/AppSidebar.tsx`

## Tests

- `permissions/tests/test_api_access.py` — API path rules
- `common/tests/test_security_helpers.py` — upload and media path validation
