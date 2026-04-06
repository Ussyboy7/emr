# ICT EMR audit — implementation checklist

Checklist derived from ICT observations (Medical Records, Nursing, Doctors, Pharmacy, Lab, Radiology, Physiotherapy). Use this for QA and sprint planning.

**Legend**

| Mark | Meaning |
|------|--------|
| `[x]` | Implemented or verified in codebase (spot-check). |
| `[ ]` | Open, not met, or needs verification. |
| **(P)** | Partial — some pieces exist; finish spec or confirm with users. |

**Layers:** **FE** = frontend, **BE** = backend/API, **DB** = schema/migrations/seed.

---

## 2.1 Medical Records Unit

- [ ] **(P)** **(i)** Delete option for corrections / duplicate entries — **FE/BE**  
  Appointments delete, patient soft-delete, dependents flow exist; confirm visit/diagnosis/MR record correction deletes if required.

- [ ] **(ii)** Male / female in **disease pattern** reports (not only employee vs non-employee) — **FE/BE/DB**  
  Current: employee / non-employee aggregation (`DiseasePatternReportView`, MR disease-pattern UI).

- [ ] **(iii)** Hospital specifications **clickable** in statistics view (drill-down / navigation) — **FE**

- [x] **(iv)** Dedicated field for **number of sick leave days** — **FE/BE/DB**  
  `MedicalCertificate.sick_leave_days` (illness purpose), MR certificate UI + print; Services & Activities report includes certificate totals.

- [ ] **(v)** Update **“Fire Service Department”** to ICT-approved name wherever it appears — **FE/DB/seed**

- [x] **(vi)** All clinic appointments visible on Medical Records interface — **FE/BE**  
  MR appointments page + API; confirm all clinics included in API/filters.

---

## 2.2 Nursing Department

### 2.2.1 Vitals and general nursing

- [ ] **(P)** **(i)** **FBS** and **RBS** specifications in vitals module — **FE/BE**  
  RBS + blood sugar captured; ensure **FBS** is explicit (labeling/workflow) if audit requires both named.

- [x] **(ii)** Doctors can view **FBS/RBS** on their interface — **FE**

### 2.2.2 Observation module (full spec)

- [ ] **(a)** Patient details: names, PN, gender, department, age, status, category, diagnosis — **FE/BE/DB**

- [ ] **(b)** Treatment sheet: drug name, dosage, time administered, time completed, drug reaction, nurse initials — **FE/BE/DB**

- [ ] **(c)** Continuous vitals for observation: temp, pulse, RR, BP, FBS, RBS — **FE/BE/DB**  
  Note: wards “Record Observation” is lighter than this spec.

### 2.2.3 Injections module

- [ ] **(P)** Tabular layout; patient status (Pensioner, ED, EMP, etc.) & staff category (Officer/Staff) — **FE/BE**

- [ ] **(P)** Drug, dosage, route; **nurse and doctor initials** (required) — **FE/BE/DB**

### 2.2.4 Wound dressing module

- [ ] **(P)** Tabular layout; same patient status / staff category selectors — **FE/BE**

- [ ] **(P)** Procedures: dressing, I&D, sutures, suture removal — **FE/BE**

- [ ] **(P)** **Nurse and doctor initials** required — **FE/BE/DB**

### Drugs requisition (Nursing ↔ Pharmacy)

- [ ] **(P)** Dedicated EMR module: description, qty requested, qty supplied, stock balance — **FE/BE/DB**  
  Catalog seed exists (`seed_nursing_requisition_catalog`); wire full workflow vs manual/stock-request only.

- [ ] Incorporate audit **item lists** (fluids, injectables, wound materials, other supplies with variants) — **DB/FE**

---

## 2.3 Doctors’ interface

- [ ] **(P)** **(i)** Responsibility for **Lab** and **X-ray** requests — **FE/BE**  
  Referral/responsibility UI + ICD-10 on orders; align with paper “responsibility form” if needed.

- [ ] **(ii)** Fix uploads from other departments **not displaying** — **FE/BE** (repro + storage URLs)

- [ ] **(P)** **(iii)** **Per-user** delete/removal rights — **BE/FE** (RBAC granularity per screen/action)

- [ ] **(iv)** Clinical indication / instruction fields **optional** (not mandatory) — **FE**  
  e.g. `LabOrderModal` still requires clinical indication in some paths.

- [x] **(v)** Prescription module: **“Partially Dispensed”** — **FE/BE**

- [ ] **(vi)** **Store** module development **complete** (per stakeholder definition) — **FE/BE**

- [ ] **(vii)** Medical Records: show **only total** prescriptions dispensed, **not** per-drug detail — **FE/BE**  
  Current MR dispensed-prescriptions report includes medication-level rows.

- [ ] **(P)** **(viii)** Extract **drug consumption patterns** from system — **BE/FE** (pharmacy analytics partial)

- [ ] **(ix)** Remove **generic** instructions; make **drug-specific** — **FE/BE/DB**

- [ ] **(P)** **(x)** **Diagnosis** displayed across **all** relevant units/departments — **FE**

---

## 2.4 Pharmacy

- [ ] **(P)** **(i)** Reports: prescriptions dispensed per **day, month, year** — **FE/BE**

- [ ] **(P)** **(ii)** **Range filters** for analysis — **FE/BE**  
  Analytics has some reporting; confirm all required ranges.

---

## 2.5 Laboratory Unit

- [ ] **(P)** **(i)** **Responsibility form**, **referral details**, **patient diagnosis** on Laboratory interface — **FE/BE**  
  Diagnosis blocks on lab orders exist; complete referral + responsibility parity if required.

---

## 2.6 Radiology Department

- [ ] **(P)** **(i)** Same as lab: **responsibility**, **referral**, **patient diagnosis** — **FE/BE**

---

## 2.7 Physiotherapy Unit

- [ ] **(i)** View patients **referred from Nursing** — **FE/BE** (explicit source/filter)

- [ ] **(ii)** Change **“Start Session”** to **“End Session”** (or correct workflow label per process) — **FE**  
  Physio pool-queue still uses “Start Session” in places.

- [x] **(iii)** Remove **“Supply needed for dressing”** (not applicable) — **FE**  
  No matches in current `physiotherapy` app paths; confirm in UI with stakeholders.

---

## Quick stats (manual update)

| Area | Done `[x]` | Open `[ ]` |
|------|------------|------------|
| 2.1 MR | 2 | 4 (+ partials) |
| 2.2 Nursing | 1 | many |
| 2.3 Doctors | 1 | many |
| 2.4–2.6 | 0 | all partial/open |
| 2.7 Physio | 1 | 2 |

*Last reviewed against codebase: 2026-04-02.*
