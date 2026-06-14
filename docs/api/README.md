# API documentation

## OpenAPI (source of truth)

The backend uses **drf-spectacular**. Do not maintain a hand-written endpoint list in markdown.

| URL | Purpose |
|-----|---------|
| `/api/docs/` | Swagger UI |
| `/api/redoc/` | ReDoc |
| `/api/schema/` | OpenAPI JSON/YAML |

**Enable locally:**

```bash
# backend/env/local.env or docker-compose.local.yml
ENABLE_API_DOCS=true
```

In production, `ENABLE_API_DOCS` defaults to off unless explicitly enabled.

## Base URL and versioning

| Path | Status |
|------|--------|
| `/api/v1/…` | **Canonical** — use for all new clients |
| `/api/…` | Legacy alias; emits deprecation headers |

Frontend `apiFetch` should target `/api/v1/` (or `/api` via Next.js proxy in dev).

## Authentication

Send JWT on API requests:

```http
Authorization: Bearer <access_token>
```

Browser sessions also send access token via HTTP-only cookies; protected media and some flows rely on cookies.

**Obtain tokens:**

```http
POST /api/v1/accounts/auth/token/
Content-Type: application/json

{"username": "...", "password": "..."}
```

**Refresh:**

```http
POST /api/v1/accounts/auth/token/refresh/
{"refresh": "..."}
```

Rate limits apply (`auth_login`, `auth_refresh` scopes in DRF settings).

## Current user

```http
GET /api/v1/accounts/users/me/
```

Returns profile plus `permissions.pages` and `permissions.actions` for RBAC UI.

## Health (unauthenticated)

| Endpoint | Checks |
|----------|--------|
| `GET /health/live/` | Process only |
| `GET /health/` | Database + Redis |

## Throttling

Default DRF throttles plus named scopes, including:

- `auth_login`, `auth_refresh`
- `file_upload`

See `backend/emr_backend/settings.py` → `DEFAULT_THROTTLE_RATES`.

## RBAC on API calls

Even with a valid JWT, requests are denied if the user's role pages do not include the module required for that path. See [architecture/AUTH_AND_RBAC.md](../architecture/AUTH_AND_RBAC.md).

## Client code

Frontend services live in `frontend/lib/services/`. All HTTP goes through `frontend/lib/api-client.ts` (React Query compatible).

When adding endpoints:

1. Implement DRF view + URL
2. Add rule in `permissions/api_access.py` if not covered by a module prefix
3. Add `@document_viewset(...)` from `common/openapi.py` (or `@extend_schema` on custom actions)
4. Add frontend service method

Viewsets are grouped by tag in Swagger (`Authentication`, `Patients`, `Laboratory`, `Wards`, `Reports`, `Analytics`, etc.). Enable locally with `ENABLE_API_DOCS=true`.

Coverage includes all registered ViewSets, report APIViews, module analytics, patient trackers, dashboard/common utilities, and selected custom actions (`/users/me`, appointment confirm/cancel, audit stats).
