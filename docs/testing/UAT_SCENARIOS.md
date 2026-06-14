# EMR User Acceptance Testing — Scenarios

Merged UAT guide for healthcare staff. **Environment:** use the UAT URL and accounts provided by IT. Allow **2–4 hours per role**.

## Preparation

- [ ] UAT login URL and role-specific test user from IT
- [ ] This document and your [role user guide](../user/)
- [ ] Sample patient details (fictional or approved test data)
- [ ] Stable network; Chrome or Edge recommended

**Readiness smoke test**

- [ ] Login page loads
- [ ] Dashboard loads without errors
- [ ] Sidebar shows only modules allowed for your role

---

## All roles — access & navigation

- [ ] Log in with assigned credentials
- [ ] Confirm home module matches role
- [ ] Open **Notifications**, **Settings**, **Help** (`/help`)
- [ ] Sign out; confirm session ends
- [ ] Failed login shows clear message (do not retry until lockout window passes)

---

## Medical records

Guide: [ROLE_MEDICAL_RECORDS.md](../user/ROLE_MEDICAL_RECORDS.md)

- [ ] Register new patient (required fields, category rules)
- [ ] Search patient by name, ID, personal number
- [ ] Open patient detail; verify demographics
- [ ] Update contact details; save and re-open
- [ ] Create visit (date, time, clinic)
- [ ] Schedule or view appointment
- [ ] Run one operational report (attendance or clinic stats)
- [ ] Confirm user **without** records role cannot register patients (admin test)

---

## Nursing

Guide: [ROLE_NURSING.md](../user/ROLE_NURSING.md)

- [ ] Open nursing pool / queue
- [ ] Select visit; record vitals (temp, BP, pulse)
- [ ] Verify vitals visible on visit / consultation handoff
- [ ] Complete or advance nursing stage as per local workflow
- [ ] Optional: nursing procedure documentation

---

## Consultation (doctors)

Guide: [ROLE_CONSULTATION.md](../user/ROLE_CONSULTATION.md)

- [ ] Start consultation from queue
- [ ] Document complaint, examination, assessment
- [ ] Order lab test; verify appears in laboratory queue
- [ ] Order medication; verify pharmacy queue
- [ ] Complete consultation; visit status updates correctly
- [ ] Confirm can **view** patient chart but not bulk patient list (if role is consultation-only)

---

## Laboratory

Guide: [ROLE_LABORATORY.md](../user/ROLE_LABORATORY.md)

- [ ] View pending orders
- [ ] Enter or import results
- [ ] Verify / sign off result
- [ ] Completed list shows correct patient and visit
- [ ] Reject or hold workflow (if used locally)

---

## Pharmacy

Guide: [ROLE_PHARMACY.md](../user/ROLE_PHARMACY.md)

- [ ] View pending prescriptions
- [ ] Dispense or partial dispense
- [ ] Inventory lookup (if enabled)
- [ ] Completed dispensing history

---

## Administration

Guide: [ROLE_ADMINISTRATION.md](../user/ROLE_ADMINISTRATION.md)

- [ ] Create or edit user; assign role
- [ ] Confirm role pages match expected sidebar for test user
- [ ] System health page (`/admin/health`) shows database and API status
- [ ] Audit log shows recent login (no sensitive data in export)
- [ ] Clinic / department configuration readable

---

## Cross-cutting clinical flow (end-to-end)

Recommended once per release on UAT:

1. Register patient (records)
2. Create visit (records)
3. Vitals (nursing)
4. Consultation + orders (doctor)
5. Lab result (lab)
6. Dispense (pharmacy)
7. Close visit / verify reports

Reference: [workflows/VISIT_LIFECYCLE.md](../workflows/VISIT_LIFECYCLE.md)

---

## Defect reporting during UAT

Use the ticket template in [EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md). Tag **UAT** and module name.

---

## Sign-off

Complete the formal record in **[UAT_SIGNOFF.md](UAT_SIGNOFF.md)** (environment header, defect log, role sign-off, go/no-go).

Quick checklist while testing:

| Role | Done? |
|------|-------|
| Medical records | [ ] |
| Nursing | [ ] |
| Consultation | [ ] |
| Laboratory | [ ] |
| Pharmacy | [ ] |
| Administration | [ ] |
| End-to-end clinical flow | [ ] |
| ICT go/no-go | [ ] |

**Release criteria:** No open P1/P2 defects; P3 with agreed workaround documented in UAT_SIGNOFF.
