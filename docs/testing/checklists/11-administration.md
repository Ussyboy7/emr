# UAT Checklist — ICT / Administration

| Field | Value |
|-------|-------|
| **Release** | |
| **UAT URL** | |
| **Tester** | |
| **Date** | |
| **Test user** | System Administrator / ICT Support |

Guides: [ROLE_ADMINISTRATION.md](../../user/ROLE_ADMINISTRATION.md) · [EMR_ADMINISTRATION_GUIDE.md](../../admin/EMR_ADMINISTRATION_GUIDE.md)

---

## Dashboard — `/admin`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-DASH-01 | Admin dashboard loads | | |

## Users — `/admin/users`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-USR-01 | Create UAT temp user | | |
| ☐ | UAT-ADM-USR-02 | Assign role → sidebar correct | | |
| ☐ | UAT-ADM-USR-03 | Per-user page deny works | | |
| ☐ | UAT-ADM-USR-04 | Deactivate user → login fails | | |

## Roles — `/admin/roles`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-ROL-01 | Duplicate Officer → Support | | |
| ☐ | UAT-ADM-ROL-02 | Assign capability (e.g. merge) | | |
| ☐ | UAT-ADM-ROL-03 | Page catalog complete | | |

## Clinics — `/admin/clinics`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-CLN-01 | All clinics listed | | |
| ☐ | UAT-ADM-CLN-02 | Edit department → visit picker | | |

## Rooms — `/admin/clinics` (Rooms tab)

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-ROM-01 | Create/edit consultation room | | |

## Settings — `/admin/settings`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-SET-01 | Idle timeout enforced | | |
| ☐ | UAT-ADM-SET-02 | Notification routing | | |

## System Health — `/admin/health`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-HLT-01 | DB / API / disk / backup status | | |
| ☐ | UAT-ADM-HLT-02 | Green after deploy | | |

## Annual Check-up Programme — `/admin/annual-checkup-programme`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-ACP-01 | Default investigation bundle | | |
| ☐ | UAT-ADM-ACP-02 | Edit programme → consultation panel | | |

## Audit — `/admin/audit`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-AUD-01 | Login events logged | | |
| ☐ | UAT-ADM-AUD-02 | Sensitive actions logged | | |
| ☐ | UAT-ADM-AUD-03 | Export has no excess PHI | | |

## Support Tickets — `/admin/support-tickets`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-ADM-TKT-01 | User ticket in admin queue | | |
| ☐ | UAT-ADM-TKT-02 | Resolve → user sees update | | |

---

## Sign-off

| Result | ☐ Pass  ☐ Fail |
|--------|----------------|
| **Open defects** | |
| **Tester signature** | |
| **Date** | |
