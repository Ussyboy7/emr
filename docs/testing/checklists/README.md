# EMR UAT — Printable Department Checklists

One-page-per-department checklists for field testing. Full scenario detail: [UAT_BY_DEPARTMENT.md](../UAT_BY_DEPARTMENT.md).

## How to print

1. Open the checklist file for your department.
2. Fill the **header** (release, UAT URL, tester, date) before testing.
3. Check **Pass / Fail / N/A** per row; note defect IDs (e.g. `UAT-001`) in the Notes column.
4. Sign the bottom and return to ICT with [UAT_SIGNOFF.md](../UAT_SIGNOFF.md).

**Tip:** Export to PDF from your browser (Print → Save as PDF) for signed archives.

## Checklist index

| Print this file | Department | Est. time |
|-----------------|------------|-----------|
| [00-global.md](00-global.md) | All roles — auth & navigation | 30 min |
| [01-medical-records.md](01-medical-records.md) | Medical Records | 3–4 h |
| [02-nursing.md](02-nursing.md) | Nursing | 3–4 h |
| [03-consultation.md](03-consultation.md) | Consultation (doctors) | 3–4 h |
| [04-laboratory.md](04-laboratory.md) | Laboratory | 2–3 h |
| [05-pharmacy.md](05-pharmacy.md) | Pharmacy | 3–4 h |
| [06-radiology.md](06-radiology.md) | Radiology | 2–3 h |
| [07-physiotherapy.md](07-physiotherapy.md) | Physiotherapy | 2 h |
| [08-eye-clinic.md](08-eye-clinic.md) | Eye Clinic | 1–2 h |
| [09-human-resources.md](09-human-resources.md) | Human Resources | 1–2 h |
| [10-analytics.md](10-analytics.md) | Analytics / management | 1 h |
| [11-administration.md](11-administration.md) | ICT / Administration | 2–3 h |
| [12-end-to-end.md](12-end-to-end.md) | Cross-department flows | 4–6 h |

## Test data reference

| ID | Use for |
|----|---------|
| TD-01 | New employee — registration + first visit |
| TD-02 | Existing patient — search, edit, history |
| TD-03 | Dependent of TD-02 |
| TD-04 | Non-NPA category |
| TD-05 | Ward admission path |
| TD-06 | Annual check-up / HR compliance |

Record fictional patient names on your UAT_SIGNOFF sheet only — not in these shared files.

## Execution order (recommended)

1. `11-administration` — provision users  
2. `00-global` — smoke per role  
3. `01-medical-records` — creates TD-01 visit  
4. `02-nursing` + `03-consultation` — parallel  
5. `04`–`08` — ancillary modules  
6. `12-end-to-end` — clinical lead  
7. `09`, `10` — HR and analytics  
