# NPA EMR Frontend

Next.js 16 (App Router) + React 18 + TypeScript + Tailwind + shadcn/ui.

## Quick start

```bash
npm install
npm run dev
```

→ http://localhost:3001

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server (port 3001) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript |
| `npm run test` | Vitest unit tests |

## Structure

```
frontend/
├── app/              # Routes (admin, consultation, nursing, …)
├── components/       # UI (shadcn/ui) and shared layouts
├── lib/
│   ├── api-client.ts      # HTTP + auth cookies
│   ├── page-permissions.ts # RBAC page catalog (sync with backend)
│   └── services/          # API service modules
├── hooks/
├── middleware.ts     # Auth + page permission guard
└── contexts/
```

## Configuration

- API URL: `NEXT_PUBLIC_API_URL` (use `/api` in local dev for Next proxy)
- Env files: `.env.local`, `.env.stag`, `.env.prod`

## RBAC

Route access is enforced in `middleware.ts` using cookies from `/auth/me` permissions. Page IDs must match `lib/page-permissions.ts` and backend `permissions/page_catalog.py`.

See [../docs/architecture/AUTH_AND_RBAC.md](../docs/architecture/AUTH_AND_RBAC.md).

## Documentation

- [../docs/README.md](../docs/README.md)
- [../README.md](../README.md)
