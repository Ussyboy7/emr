# EMR Support & Maintenance

Support tiers, incident response, and maintenance for the NPA EMR. For deploy, backup, logs, and health checks see [operations/RUNBOOK.md](../operations/RUNBOOK.md).

## Related documentation

| Topic | Document |
|-------|----------|
| Deploy, backup, logs, health | [operations/RUNBOOK.md](../operations/RUNBOOK.md) |
| Users, roles, clinics | [EMR_ADMINISTRATION_GUIDE.md](EMR_ADMINISTRATION_GUIDE.md) |
| End users | [user/EMR_USER_QUICK_START_GUIDE.md](../user/EMR_USER_QUICK_START_GUIDE.md) |
| In-app health | `/admin/health` |

**Operations commands:** `./scripts/production/env-manager.sh` (see [scripts/README.md](../../scripts/README.md)).

---

## Support tiers

| Tier | Scope | Target response |
|------|--------|-----------------|
| **1 — Help desk** | Password resets, access, navigation, basic how-to | &lt; 1 hour (business hours) |
| **2 — Application** | Workflow issues, data entry, reports | &lt; 4 hours |
| **3 — System admin** | Server, performance, availability, security alerts | &lt; 2 hours |
| **4 — Development** | Defects, enhancements, architecture | &lt; 24 hours |

**Hours:** Primary 08:00–18:00 Mon–Fri. Extended 07:00–20:00 for critical issues. **P1 system-down:** 24/7.

---

## Reporting an issue

### What to include (ticket template)

```
Subject: [P1|P2|P3|P4] <module> — short summary
Reporter: Name, role, clinic
When: Date/time (timezone)
URL / screen: e.g. /nursing/pool
Steps: 1… 2… 3…
Expected vs actual:
Patient/visit ID (if clinical, no unnecessary PHI):
Screenshot or error text:
Workaround tried:
```

### Priority definitions

| Priority | Meaning | Examples |
|----------|---------|----------|
| **P1** | System unusable or patient safety risk | Cannot log in site-wide; results lost; wrong patient data shown |
| **P2** | Major function broken for many users | Cannot register patients; lab queue stuck |
| **P3** | Limited impact or workaround exists | Single report wrong; slow page |
| **P4** | Cosmetic or enhancement | Label typo; feature request |

Escalate **P1/P2** to Tier 3 immediately. Log all incidents in your IT ticket system.

---

## First-line checks (before escalating)

1. **Health:** Open `/admin/health` (admin) or ask ops to check [RUNBOOK](../operations/RUNBOOK.md) health endpoints.
2. **Browser:** Hard refresh; try Chrome/Edge; clear cache only if IT approves.
3. **Access:** Confirm user role pages in **Admin → Users / Roles** match the module they need.
4. **Scope:** One user vs all users; one clinic vs all clinics.
5. **Recent change:** Deploy, config, or network change in the last 24 hours?

Do **not** run ad-hoc production shell scripts from old documentation. Use **env-manager** workflows in the runbook.

---

## Maintenance windows

| Activity | Typical window | Notes |
|----------|----------------|-------|
| Application deploy | Off-peak, announced | Restart backend + nginx per runbook |
| Database backup verify | Weekly | Backup card on `/admin/health` |
| Certificate renewal | Before expiry | SSL alerts via ops monitoring |
| User/role audits | Monthly | Remove leavers; review admin accounts |

Announce maintenance to clinical leads **≥ 24 hours** ahead unless emergency (P1).

---

## Incident response (summary)

1. **Acknowledge** ticket and assign priority.
2. **Communicate** to affected units (records, nursing, lab, etc.).
3. **Mitigate** — rollback deploy, disable feature flag, or failover per [RUNBOOK](../operations/RUNBOOK.md).
4. **Resolve** — fix forward or rollback; confirm health checks green.
5. **Post-incident** — short note: cause, fix, prevention (within 5 business days for P1/P2).

For security incidents (suspected breach, credential leak), follow [SECURITY.md](../../SECURITY.md) and involve ICT security immediately.

---

## User lifecycle

| Event | Action |
|-------|--------|
| New staff | Create user, assign role, distribute initial password securely |
| Role change | Update role pages; user re-login |
| Leave / transfer | Deactivate account same day |
| Forgot password | Tier 1 reset via admin; never share passwords in chat/email |

---

## Contacts

Use your organisation's **official IT service desk** channel (phone, email, or ticket portal). Do not publish personal mobile numbers in this repository.

---

*Last updated: documentation restructure. Operational commands and hostnames live in the runbook and env-manager, not here.*
