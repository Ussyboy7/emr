# UAT Checklist — Global (All Roles)

| Field | Value |
|-------|-------|
| **Release** | |
| **UAT URL** | |
| **Tester** | |
| **Date** | |
| **Role tested** | |

Guide: [EMR_USER_QUICK_START_GUIDE.md](../../user/EMR_USER_QUICK_START_GUIDE.md)

---

## Authentication

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-GLB-AUTH-01 | Login with valid credentials → home module | | |
| ☐ | UAT-GLB-AUTH-02 | Failed login shows clear error (stop before lockout) | | |
| ☐ | UAT-GLB-AUTH-03 | Idle timeout warns then logs out | | |
| ☐ | UAT-GLB-AUTH-04 | Sign out ends session; back button safe | | |

## Navigation & RBAC

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-GLB-NAV-01 | Sidebar shows only permitted modules | | |
| ☐ | UAT-GLB-NAV-02 | Deep link to forbidden URL → denied | | |
| ☐ | UAT-GLB-NAV-03 | Notifications load; mark read works | | |
| ☐ | UAT-GLB-NAV-04 | Settings save | | |
| ☐ | UAT-GLB-NAV-05 | Help, docs, support ticket submit | | |
| ☐ | UAT-GLB-NAV-06 | Overview dashboard (if granted) | | |
| ☐ | UAT-GLB-PHOTO-01 | Patient photo loads (no broken avatar) | | |

---

## Sign-off

| Result | ☐ Pass  ☐ Fail |
|--------|----------------|
| **Open defects** | |
| **Tester signature** | |
| **Date** | |

Return completed sheet to ICT with [UAT_SIGNOFF.md](../UAT_SIGNOFF.md).
