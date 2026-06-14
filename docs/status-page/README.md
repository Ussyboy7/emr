# External status page (Upptime)

Optional **public uptime page** hosted separately from the EMR app (GitHub Pages + Upptime).

- Config template: [`.upptimerc.yml`](.upptimerc.yml)
- This is **not** the same as in-app health at `/admin/health`.

## When to use

- Organisation wants a simple external “is it up?” page
- IT monitors HTTP endpoints from outside the VPN

## When to use in-app health instead

- Disk usage, backup files, API timing, DB/cache readiness → **`/admin/health`**
- Day-to-day ops → [operations/RUNBOOK.md](../operations/RUNBOOK.md)

## Setup

Follow Upptime docs: [upptime.js.org](https://upptime.js.org/). Copy `.upptimerc.yml` to a dedicated public repo and configure GitHub Actions + Pages.

Update monitored URLs to match **your** production host and API paths (`/api/v1/health/` recommended over legacy paths).

---

*Remove or archive this folder if your organisation does not use an external status page.*
