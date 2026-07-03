# UAT Checklist — End-to-End Flows

| Field | Value |
|-------|-------|
| **Release** | |
| **UAT URL** | |
| **Clinical lead** | |
| **Date** | |

Guide: [VISIT_LIFECYCLE.md](../../workflows/VISIT_LIFECYCLE.md) · Run **once per release**.

---

## E2E-01 — Outpatient standard path *(required)*

| ☐ | Step | Department | Action | P/F/N/A | Notes |
|---|------|------------|--------|---------|-------|
| ☐ | 1 | Medical Records | Register TD-01 | | |
| ☐ | 2 | Medical Records | Create visit | | |
| ☐ | 3 | Nursing | Record vitals | | |
| ☐ | 4 | Consultation | Start session; document | | |
| ☐ | 5 | Consultation | Lab + pharmacy orders | | |
| ☐ | 6 | Laboratory | Enter + verify result | | |
| ☐ | 7 | Pharmacy | Dispense medication | | |
| ☐ | 8 | Consultation | Complete consultation | | |
| ☐ | 9 | Medical Records | Attendance report includes visit | | |

## E2E-02 — Room presence path

| ☐ | Step | Department | Action | P/F/N/A | Notes |
|---|------|------------|--------|---------|-------|
| ☐ | 1 | Consultation | Doctor on seat in room | | |
| ☐ | 2 | Nursing | Send patient to accepting room | | |
| ☐ | 3 | Consultation | Session completes | | |
| ☐ | 4 | Nursing | Away room blocks send | | |

## E2E-03 — Inpatient / ward path

| ☐ | Step | Department | Action | P/F/N/A | Notes |
|---|------|------------|--------|---------|-------|
| ☐ | 1 | Consultation | Admission handoff (TD-05) | | |
| ☐ | 2 | Nursing | Ward care + observations | | |
| ☐ | 3 | Consultation | Ward round doctor order | | |
| ☐ | 4 | Nursing | Perform ward order | | |
| ☐ | 5 | Medical Records | Ward/escort report (if used) | | |

## E2E-04 — Ancillary services path

| ☐ | Step | Department | Action | P/F/N/A | Notes |
|---|------|------------|--------|---------|-------|
| ☐ | 1 | Consultation | Orders: lab, rad, physio, eye | | |
| ☐ | 2 | Laboratory | Verify result | | |
| ☐ | 3 | Radiology | Verify report | | |
| ☐ | 4 | Physiotherapy | End treatment plan | | |
| ☐ | 5 | Eye Clinic | Complete session | | |
| ☐ | 6 | Consultation | All results on history | | |

## E2E-05 — Governance path

| ☐ | Step | Department | Action | P/F/N/A | Notes |
|---|------|------------|--------|---------|-------|
| ☐ | 1 | Consultation | Complete visit with diagnosis | | |
| ☐ | 2 | Medical Records | Correct ICD-10 (diagnosis review) | | |
| ☐ | 3 | HR | Annual checkup sign-off (TD-06) | | |
| ☐ | 4 | Administration | Audit entries present | | |

## E2E-06 — RBAC negative matrix *(ICT)*

| ☐ | Step | Action | Expected | P/F/N/A | Notes |
|---|------|--------|----------|---------|-------|
| ☐ | 1 | Pharmacist → register patient | Denied | | |
| ☐ | 2 | Lab Support → admin users | Denied | | |
| ☐ | 3 | MR Support → patient merge | Denied | | |
| ☐ | 4 | Staff pharmacist → HOD store | Denied | | |
| ☐ | 5 | Nurse → ward doctor order | Denied | | |

---

## Sign-off

| Result | ☐ Pass  ☐ Fail |
|--------|----------------|
| **Flows completed** | E2E-01: ☐  E2E-02: ☐  E2E-03: ☐  E2E-04: ☐  E2E-05: ☐  E2E-06: ☐ |
| **Open defects** | |
| **Clinical lead signature** | |
| **Date** | |

Minimum for release: **E2E-01 Pass** + at least one ancillary flow (E2E-02, 03, or 04).
