# UAT sign-off record

Use this form with [UAT_SCENARIOS.md](UAT_SCENARIOS.md). Complete one record per release candidate on your **UAT environment** (not production).

---

## 1. Environment

| Field | Value |
|-------|--------|
| **Release / version** | e.g. `v1.4.0-rc1` or git tag |
| **UAT URL** | *(from IT — do not use production URL)* |
| **UAT date range** | From: ________ To: ________ |
| **ICT coordinator** | Name, email |
| **Clinical lead** | Name, role |

**Pre-flight (ICT)**

- [ ] UAT database refreshed or seeded per plan
- [ ] Test users created for each role (see role table below)
- [ ] `ENABLE_API_DOCS=true` on UAT backend (optional, for API spot-checks)
- [ ] Backup taken before UAT window

---

## 2. Test users (ICT fills before UAT)

| Role | Username | Assigned to (tester) |
|------|----------|----------------------|
| Medical records | | |
| Nursing | | |
| Consultation | | |
| Laboratory | | |
| Pharmacy (+ HOD if applicable) | | |
| Radiology | | |
| Physiotherapy | | |
| Eye clinic | | |
| Human resources | | |
| Analytics (delegate) | | |
| Administration / ICT | | |

Passwords: distribute securely (not in this file or email body).

---

## 3. Execution

Each tester:

1. Read their [role user guide](../user/ROLE_MEDICAL_RECORDS.md) (pick the matching `ROLE_*.md`).
2. Work through their section in [UAT_BY_DEPARTMENT.md](UAT_BY_DEPARTMENT.md) (full) or [UAT_SCENARIOS.md](UAT_SCENARIOS.md) (quick).
3. Log defects (section 4).
4. Sign their row in section 5.

**Printable sheets:** [checklists/](checklists/README.md) — one PDF per department for field testing.

**End-to-end path** (clinical lead or delegate): complete the cross-cutting flow in UAT_SCENARIOS once per release.

---

## 4. Defect log

| ID | Date | Module | Priority (P1–P4) | Summary | Reporter | Status (open/fixed/waived) |
|----|------|--------|-------------------|---------|----------|----------------------------|
| UAT-001 | | | | | | |
| UAT-002 | | | | | | |

Use the ticket template in [EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md). Tag tickets **UAT** and the release version.

**Priority reminder**

| Priority | Meaning |
|----------|---------|
| P1 | System down or patient-safety risk — **blocks sign-off** |
| P2 | Major broken workflow — **blocks sign-off** unless ICT/clinical lead accepts waiver in writing |
| P3 | Workaround exists — may sign off with documented waiver |
| P4 | Cosmetic — does not block |

---

## 5. Role sign-off

| Role | Tester (print name) | Date | Result (Pass / Fail) | Open defects (IDs) | Signature |
|------|---------------------|------|----------------------|--------------------|-----------|
| Medical records | | | | | |
| Nursing | | | | | |
| Consultation | | | | | |
| Laboratory | | | | | |
| Pharmacy | | | | | |
| Radiology | | | | | |
| Physiotherapy | | | | | |
| Eye clinic | | | | | |
| Human resources | | | | | |
| Analytics | | | | | |
| Administration / ICT | | | | | |

---

## 6. Release decision

| Role | Name | Date | Decision |
|------|------|------|----------|
| **ICT lead** | | | Go / No-go |
| **Clinical governance** | | | Go / No-go |

**Go-live criteria (all required)**

- [ ] Every role row in section 5 is **Pass**, or Fail with accepted waiver documented
- [ ] No open **P1** defects
- [ ] No open **P2** defects (or written waiver attached)
- [ ] End-to-end clinical flow completed on UAT
- [ ] [EMR_GO_LIVE_CHECKLIST.md](EMR_GO_LIVE_CHECKLIST.md) scheduled for production cutover

**If No-go:** note reason and target re-test date below.

```
Decision notes:


```

---

## 7. Archive

Store completed copy (PDF or signed export) with ICT project files for the release. Link defect tickets in your ITSM tool.
