# EMR User Acceptance Testing — By Department & Module

Comprehensive UAT design aligned with the canonical page catalog (`frontend/lib/page-permissions.ts`), role guides (`docs/user/ROLE_*.md`), and clinical workflows (`docs/workflows/`).

**Use with:** [UAT_SIGNOFF.md](UAT_SIGNOFF.md) for formal sign-off · [UAT_SCENARIOS.md](UAT_SCENARIOS.md) for the shorter role checklist · **[Printable one-pagers](checklists/README.md)** per department.

---

## 1. How to run this UAT

### Environment

| Item | Requirement |
|------|-------------|
| **URL** | Staging or dedicated UAT host (never production) |
| **Data** | Seeded demo data **or** anonymised test patients approved by clinical governance |
| **Browsers** | Chrome or Edge (primary); Firefox smoke only |
| **Duration** | Allow **3–5 hours per department lead**; **1 day** for end-to-end clinical path |
| **ICT** | Create test users per section 2 before testers start |

### Pass criteria (per scenario)

| Result | Meaning |
|--------|---------|
| **Pass** | Steps complete; expected results match; no P1/P2 defect |
| **Fail** | Wrong data, blocked workflow, or RBAC breach — log defect in UAT_SIGNOFF §4 |
| **N/A** | Module not licensed / not in scope for this site (document reason) |
| **Blocked** | Upstream dependency failed — note blocking scenario ID |

### Defect logging

Tag tickets **UAT**, release version, and scenario ID (e.g. `UAT-LAB-ORD-003`). Template: [EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md).

### Scenario ID format

`UAT-{DEPT}-{PAGE}-{nn}`

| Code | Department |
|------|------------|
| `GLB` | Global (all roles) |
| `MR` | Medical Records |
| `NRS` | Nursing |
| `CON` | Consultation |
| `LAB` | Laboratory |
| `PHR` | Pharmacy |
| `RAD` | Radiology |
| `PHY` | Physiotherapy |
| `EYE` | Eye Clinic |
| `HR` | Human Resources |
| `ANL` | Analytics |
| `ADM` | Administration |
| `E2E` | Cross-department end-to-end |

---

## 2. Test users (ICT completes before UAT)

Create **Officer** and **Support** variants where the department uses both (see [ROLE_ADMINISTRATION.md](../user/ROLE_ADMINISTRATION.md)).

| Department | Officer role (primary tester) | Support role (optional) | Clinic / notes |
|------------|------------------------------|-------------------------|----------------|
| Medical Records | Medical Records Officer | Medical Records Support | Main OPD clinic |
| Nursing | Nursing Officer | Nursing Support | Same clinic |
| Consultation | Medical Doctor | — | Assigned consultation room |
| Laboratory | Laboratory Officer | Laboratory Support | Processing clinic if multi-site |
| Pharmacy | Pharmacist | Pharmacy Support | Dispensary clinic |
| Pharmacy (HOD) | Pharmacist (primary HOD @ Bode Thomas) | — | HOD Store pages only |
| Radiology | Radiologist | Radiology Support | Imaging clinic |
| Physiotherapy | Physiotherapist | — | |
| Eye Clinic | Ophthalmologist | — | |
| Human Resources | HR Officer | — | `hr_compliance_manage` capability |
| Analytics | System Administrator or delegate | — | Read-only clinical reports |
| ICT / Admin | System Administrator | ICT Support | |

**Negative-control user:** one role **without** the module under test (e.g. Pharmacist testing Medical Records register — must be denied).

---

## 3. Shared test data (clinical lead prepares)

| ID | Patient profile | Purpose |
|----|-----------------|---------|
| **TD-01** | New NPA employee (no prior EMR record) | Registration, first visit |
| **TD-02** | Existing employee with history | Search, amend, orders |
| **TD-03** | Dependent of TD-02 | Category / ID rules |
| **TD-04** | Non-NPA category | Registration validation |
| **TD-05** | Patient for admission | Ward rounds + ward care path |
| **TD-06** | Employee due annual check-up | HR compliance path |

Record fictional names/IDs on the UAT_SIGNOFF environment sheet — **no real PHI** in shared docs.

---

## 4. Global — all departments

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-GLB-AUTH-01 | Login | Open `/login`; enter valid credentials | Redirect to home module for role |
| UAT-GLB-AUTH-02 | Failed login | Wrong password ×3 (stop before lockout) | Clear error; account lockout message when threshold hit |
| UAT-GLB-AUTH-03 | Session idle | Idle past org timeout; interact | Warning then redirect to login |
| UAT-GLB-AUTH-04 | Sign out | Sign out from shared workstation | Session ends; back button does not restore clinical data |
| UAT-GLB-NAV-01 | Sidebar RBAC | Log in as each department user | Only permitted modules visible |
| UAT-GLB-NAV-02 | Deep link deny | Paste URL of forbidden module | Redirect to home or `/no-access` |
| UAT-GLB-NAV-03 | Notifications | Open `/notifications` | List loads; mark read works |
| UAT-GLB-NAV-04 | Settings | Open `/settings` | Profile/preferences save |
| UAT-GLB-NAV-05 | Help | Open `/help`, `/help/docs`, submit `/help/tickets` | Guides load; ticket submits |
| UAT-GLB-NAV-06 | Overview dashboard | User with `/dashboard` | Global overview widgets load |
| UAT-GLB-PHOTO-01 | Patient photo | Open patient with photo on chart | Avatar loads via authenticated media (no broken image) |

---

## 5. Medical Records department

**Guide:** [ROLE_MEDICAL_RECORDS.md](../user/ROLE_MEDICAL_RECORDS.md) · **Workflow:** [VISIT_LIFECYCLE.md](../workflows/VISIT_LIFECYCLE.md)

### 5.1 Module: Dashboard (`/medical-records`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-DASH-01 | Load dashboard | Open Medical Records home | Cards/metrics load without error |
| UAT-MR-DASH-02 | RBAC deny | Login as Pharmacist; navigate to `/medical-records` | Access denied |

### 5.2 Module: Register Patient (`/medical-records/patients/new`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-REG-01 | New employee | Register **TD-01** with required demographics + category | Patient ID generated; record saved |
| UAT-MR-REG-02 | Duplicate check | Search before create | Warning if duplicate suspected |
| UAT-MR-REG-03 | Dependent | Register **TD-03** linked to principal | Dependent ID format correct |
| UAT-MR-REG-04 | Non-NPA | Register **TD-04** | Category-specific fields enforced |
| UAT-MR-REG-05 | Photo upload | Attach optional photo | Photo visible on patient detail after save |
| UAT-MR-REG-06 | RBAC | Nursing Support without register page | Cannot access register screen |

### 5.3 Module: Manage Patients (`/medical-records/patients`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-PAT-01 | Search | Search by name, patient ID, personal number | Correct patient returned |
| UAT-MR-PAT-02 | Edit demographics | Update phone/address for **TD-02** | Changes persist after re-open |
| UAT-MR-PAT-03 | Patient detail | Open detail; review tabs | Demographics, visits, history visible |
| UAT-MR-PAT-04 | Merge (capability) | Officer with `patient_merge` merges duplicate | Single canonical record; audit entry |
| UAT-MR-PAT-05 | Merge deny | Support without capability | Merge action hidden or forbidden |

### 5.4 Module: Patient Records (`/medical-records/patient-records`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-REC-01 | Lookup | Find **TD-02** via lookup UI | Chart opens read-only where policy requires |
| UAT-MR-REC-02 | Cross-module read | Doctor opens same patient from consultation | Consistent demographics |

### 5.5 Module: Visits (`/medical-records/visits/new`, `/medical-records/visits`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-VIS-01 | Create visit | New visit for **TD-01** — clinic, date, type | Visit appears in manage list |
| UAT-MR-VIS-02 | Edit visit | Amend clinic/time on open visit | Updates saved |
| UAT-MR-VIS-03 | Nursing handoff | After create, check nursing pool | Visit appears in nursing queue (same day/clinic filter) |
| UAT-MR-VIS-04 | Cancel visit | Cancel test visit per policy | Status updated; removed from active queues |

### 5.6 Module: Appointments (`/medical-records/appointments`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-APT-01 | Schedule | Book appointment for **TD-02** | Slot saved; visible on calendar/list |
| UAT-MR-APT-02 | Reschedule | Move appointment | New time reflected |
| UAT-MR-APT-03 | Link to visit | Convert/check-in to visit if workflow used | Visit linkage correct |

### 5.7 Module: Referrals (`/medical-records/referrals`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-REF-01 | Records queue | Open referral from consultation | Same referral visible as consultation module |
| UAT-MR-REF-02 | Stamp/process | Complete records step per SOP | Status advances |

### 5.8 Module: ICD-10 Coding (`/medical-records/coding`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-ICD-01 | Search catalog | Search diagnosis code | Results with code + description |
| UAT-MR-ICD-02 | Select in workflow | Use code picker from another screen if linked | Selection returns to caller |

### 5.9 Module: Diagnosis Review (`/medical-records/diagnosis-review`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-DXR-01 | Queue load | Open diagnosis review list | Completed consultations with diagnoses listed |
| UAT-MR-DXR-02 | Correct code | Change ICD-10 on approved case | Correction saved; visible on consultation history |
| UAT-MR-DXR-03 | RBAC | Doctor without review page | Cannot access correction API/UI |

### 5.10 Module: Reports (`/medical-records/reports/*`)

Test **at least three** report types plus one export:

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-RPT-01 | Attendance statistics | `/reports/attendance-statistics` — date range | Matrix loads; numbers plausible |
| UAT-MR-RPT-02 | Clinic statistics | `/reports/clinic-statistics` | Per-clinic breakdown |
| UAT-MR-RPT-03 | New registrations | `/reports/new-registrations` | Matches TD-01 registration date |
| UAT-MR-RPT-04 | Lab statistics | `/reports/lab-statistics` | Reflects UAT lab orders |
| UAT-MR-RPT-05 | Patient demographics | `/reports/patient-demographics` | Category/gender breakdown |
| UAT-MR-RPT-06 | Export | CSV/PDF export if offered | File downloads; no PHI in filename |
| UAT-MR-RPT-07 | Dispensed prescriptions | `/reports/dispensed-prescriptions` | Shows pharmacy completions from E2E |

### 5.11 Module: Referral Facilities (`/medical-records/settings/referral-facilities`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-MR-RFF-01 | List facilities | Open settings | Facilities list loads |
| UAT-MR-RFF-02 | Add/edit | Create test external facility | Saved for referral forms |

---

## 6. Nursing department

**Guide:** [ROLE_NURSING.md](../user/ROLE_NURSING.md)

### 6.1 Module: Dashboard (`/nursing`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-NRS-DASH-01 | Load | Open nursing dashboard | Queue counts/cards load |

### 6.2 Module: Pool Queue (`/nursing/pool-queue`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-NRS-POOL-01 | List visits | Open pool for today's clinic | **TD-01** visit visible after MR creates visit |
| UAT-NRS-POOL-02 | Record vitals | Enter BP, pulse, temp, weight | Saved; visible on visit |
| UAT-NRS-POOL-03 | Stage advance | Move visit to ready-for-room per local SOP | Status card updates |
| UAT-NRS-POOL-04 | Filter/date | Change date filter | List matches selection |

### 6.3 Module: Room Queue (`/nursing/room-queue`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-NRS-ROOM-01 | Room list | Open room queue | Consultation rooms listed |
| UAT-NRS-ROOM-02 | Presence — on seat | Doctor checks in to room (see CON) | Room shows **Accepting** / on seat |
| UAT-NRS-ROOM-03 | Send to accepting room | Assign patient to on-seat room | Patient routed; doctor notified |
| UAT-NRS-ROOM-04 | Presence — away | Doctor away from room | Room shows **No doctor**; send blocked |
| UAT-NRS-ROOM-05 | Override | Supervisor with `consultation_queue_override` | Override with reason succeeds |
| UAT-NRS-ROOM-06 | Override deny | Nurse without capability | Override unavailable |

### 6.4 Module: Vitals History (`/nursing/vitals-history`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-NRS-VIT-01 | History list | Search **TD-02** | Prior vitals sessions listed |
| UAT-NRS-VIT-02 | Read-only integrity | Open entry | Values match pool entry |

### 6.5 Module: Procedures (`/nursing/procedures`, `/nursing/procedures/history`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-NRS-PROC-01 | Queue | Open procedures queue | Pending nursing orders listed |
| UAT-NRS-PROC-02 | Perform procedure | Complete injection/dressing per SOP | Order marked complete |
| UAT-NRS-PROC-03 | History | Open procedures history | Completed procedure documented |

### 6.6 Module: Ward Care (`/nursing/wards`)

Workspace tabs: **Care · Tasks · Timeline**.

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-NRS-WARD-01 | Admission list | Open ward care | Admitted patients listed |
| UAT-NRS-WARD-02 | Care tab | Open **TD-05** → Care | Clinical snapshot, latest handover, observation form |
| UAT-NRS-WARD-03 | Record observation | Save vitals/observation on Care | Entry appears under Timeline vitals (when present) |
| UAT-NRS-WARD-04 | Tasks — active only | Open Tasks | Only pending/active orders; no Active/History sub-tabs |
| UAT-NRS-WARD-05 | Administer order | Administer pending injection/dressing (`ward_order_perform`) | Order leaves Tasks; status complete |
| UAT-NRS-WARD-06 | Timeline handover | Add handover note on Timeline | Note on handover & nursing log |
| UAT-NRS-WARD-07 | Timeline completed | After administer, open Timeline | Completed order in compact “Completed orders” list |
| UAT-NRS-WARD-08 | Bed actions | Assign/change/remove bed from header | Bed status correct |
| UAT-NRS-WARD-09 | Discharge complete | Run nurse complete-discharge wizard when doctor-ordered | Admission closed per SOP |

### 6.7 Module: Ward Stock (`/nursing/inventory`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-NRS-INV-01 | Stock list | Open ward stock | Items and quantities load |
| UAT-NRS-INV-02 | Adjust/issue | Record ward issue per SOP | Quantity updates |

### 6.8 Module: Drug Requests (`/nursing/requests`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-NRS-REQ-01 | Create request | Request drug from pharmacy | Request appears in pharmacy queue |
| UAT-NRS-REQ-02 | Receive | Confirm receipt when pharmacy issues | Ward stock updated |

### 6.9 Module: Nursing Analytics (`/nursing/analytics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-NRS-ANL-01 | Pool metrics | Open analytics; select period | Charts load; pool throughput plausible |

---

## 7. Consultation department (doctors)

**Guide:** [ROLE_CONSULTATION.md](../user/ROLE_CONSULTATION.md)

### 7.1 Module: Dashboard (`/consultation`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-CON-DASH-01 | Load | Open consultation dashboard | Today's queue/summary loads |

### 7.2 Module: Start Consultation (`/consultation/start`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-CON-START-01 | Pick patient | Select patient from queue | Room assignment flow starts |
| UAT-CON-START-02 | Vitals review | Open patient with nursing vitals | Vitals visible before documenting |
| UAT-CON-START-03 | Room presence | Enter assigned room | Heartbeat/presence shows on seat |

### 7.3 Module: Consultation Room (`/consultation/room/[roomId]`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-CON-ROOM-01 | Session start | Start session for queued patient | Active session; timer/status shown |
| UAT-CON-ROOM-02 | Documentation | Enter complaint, exam, assessment, plan | Fields save |
| UAT-CON-ROOM-03 | Diagnosis | Add ICD-10 diagnosis | Appears on summary |
| UAT-CON-ROOM-04 | Lab order | Order CBC (or local test set) | Order in laboratory queue |
| UAT-CON-ROOM-05 | Radiology order | Order chest X-ray (or local) | Order in radiology queue |
| UAT-CON-ROOM-06 | Pharmacy Rx | Prescribe oral medication | Prescription in pharmacy queue |
| UAT-CON-ROOM-07 | Nursing order | Add nursing procedure order | Appears in nursing procedures |
| UAT-CON-ROOM-08 | Physio order | Send physio order | Appears in physiotherapy queue |
| UAT-CON-ROOM-09 | Eye order | Send eye clinic order | Appears in eyecare queue |
| UAT-CON-ROOM-10 | Complete consultation | End session | Visit status updated; room can accept next |
| UAT-CON-ROOM-11 | Annual checkup | Run annual checkup panel if applicable | Investigations pre-ticked per programme |

### 7.4 Module: Consultation History (`/consultation/history`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-CON-HIST-01 | Search | Find **TD-02** past consultations | Sessions listed with diagnoses |
| UAT-CON-HIST-02 | Open detail | View completed session | Orders and notes match |

### 7.5 Module: Ward Rounds (`/consultation/wards`)

Workspace tabs: **Round · Orders · Timeline**.

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-CON-WARD-01 | Patient list | Open ward rounds | Admitted patients listed |
| UAT-CON-WARD-02 | Round tab | Open **TD-05** → Round | Snapshot, handover, vitals, assessment/plan note form |
| UAT-CON-WARD-03 | Assessment note | Save round note | Visible on Timeline |
| UAT-CON-WARD-04 | Create ward order | Orders → Add injection/med (`ward_order_create`) | Active on list; nursing Tasks shows it |
| UAT-CON-WARD-05 | Edit/cancel order | Amend/cancel pending order (`ward_order_edit`) | Status updates |
| UAT-CON-WARD-06 | Completed expander | Use “Show completed (N)” | Compact history rows (not full task cards) |
| UAT-CON-WARD-07 | Admit / discharge | Admission handoff and/or discharge wizard | Nurse can complete next steps |
| UAT-CON-WARD-08 | RBAC | Nurse attempts doctor-only order create | Denied without `ward_order_create` |

### 7.6 Module: Medical certificates (consultation room / patient record)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-CON-CERT-01 | Issue certificate | Issue fitness or illness/sick-leave certificate for patient | Certificate number saved; printable |
| UAT-CON-CERT-02 | History | Open patient record certificates | Issued certificate listed |

### 7.7 Module: Referrals (`/consultation/referrals`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-CON-REF-01 | Create referral | Generate referral for external facility | PDF/form generated |
| UAT-CON-REF-02 | Records visibility | Switch to Medical Records referrals | Same referral ID |

### 7.8 Module: Consultation Analytics (`/consultation/analytics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-CON-ANL-01 | Period report | Select month | Consultation counts/diagnoses charts load |

---

## 8. Laboratory department

**Guide:** [ROLE_LABORATORY.md](../user/ROLE_LABORATORY.md) · **Integration:** [URIT5160](../../integration/urit5160/README.md) (if deployed)

### 8.1 Module: Dashboard (`/laboratory`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-LAB-DASH-01 | Load | Open lab dashboard | Pending counts accurate |

### 8.2 Module: Lab Orders (`/laboratory/orders`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-LAB-ORD-01 | Receive order | Find order from UAT-CON-ROOM-04 | Patient, visit, test match |
| UAT-LAB-ORD-02 | Facility filter | Filter by processing clinic | Only matching facility orders shown |
| UAT-LAB-ORD-03 | Collect/process | Advance order status per SOP | Status transitions correct |
| UAT-LAB-ORD-04 | Priority | STAT order displays prominently | SLA indicator if configured |

### 8.3 Module: Results entry & verification (`/laboratory/verification`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-LAB-VER-01 | Enter results | Manual entry for pending test | Values saved with units |
| UAT-LAB-VER-02 | Verify | Second user verifies (if dual-verify policy) | Result released to clinicians |
| UAT-LAB-VER-03 | Reject/hold | Hold incomplete result | Stays off completed list |
| UAT-LAB-VER-04 | Instrument feed | If URIT middleware enabled | Auto-posted result appears for verification |

### 8.4 Module: Completed (`/laboratory/completed`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-LAB-CMP-01 | Completed list | Open completed tests | UAT order listed with verify timestamp |
| UAT-LAB-CMP-02 | Clinician view | Doctor views result in consultation history | Matches lab entry |

### 8.5 Module: Templates (`/laboratory/templates`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-LAB-TPL-01 | Browse templates | Search test template | Template detail with parameters |
| UAT-LAB-TPL-02 | Edit (if permitted) | Update reference range on test template | Consultation ordering reflects change |

### 8.6 Module: Lab Analytics (`/laboratory/analytics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-LAB-ANL-01 | Volume report | Select period | Order volume by status/priority |

---

## 9. Pharmacy department

**Guide:** [ROLE_PHARMACY.md](../user/ROLE_PHARMACY.md) · **Workflow:** [PHARMACY.md](../workflows/PHARMACY.md)

### 9.1 Module: Dashboard (`/pharmacy`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHR-DASH-01 | Load | Open pharmacy dashboard | Pending Rx count matches queue |

### 9.2 Module: Prescriptions (`/pharmacy/prescriptions`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHR-RX-01 | Queue | Find Rx from UAT-CON-ROOM-06 | Patient, drug, strength, qty correct |
| UAT-PHR-RX-02 | Full dispense | Dispense full quantity | Status complete; inventory decremented |
| UAT-PHR-RX-03 | Partial dispense | Partial qty + owe balance | Remaining qty tracked |
| UAT-PHR-RX-04 | Topical pack | Dispense cream/ointment | Quantity in **tubes/packs**, not per-use |
| UAT-PHR-RX-05 | Allergy display | Patient with documented allergy | Warning visible before dispense |

### 9.3 Module: Dispense History (`/pharmacy/history`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHR-HIS-01 | History search | Find **TD-02** dispensations | UAT dispense recorded |

### 9.4 Module: Inventory (`/pharmacy/inventory`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHR-INV-01 | Stock view | Open dispensary inventory | Batch qty matches post-dispense |
| UAT-PHR-INV-02 | Stock history | View batch history | Receipt/dispense movements listed |

### 9.5 Module: Stock Requests (`/pharmacy/requests`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHR-REQ-01 | Request from central | Create request to central store | Request pending approval |
| UAT-PHR-REQ-02 | Approve/receive | Central store issues; dispensary confirms | Inventory increased |

### 9.6 Module: Drug Master & Generics (`/pharmacy/drugs`, `/pharmacy/generics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHR-MAS-01 | Search drug | Find medication by brand/generic | Strength and unit shown |
| UAT-PHR-MAS-02 | Add brand (if permitted) | Link new brand to generic | Appears in prescribing picker |

### 9.7 Module: Central Store (`/pharmacy/store`, `/pharmacy/store/requests`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHR-STR-01 | Store inventory | Bode Thomas operator views stock | Quantities load |
| UAT-PHR-STR-02 | Issue to dispensary | Approve dispensary request | Status issued → received |

### 9.8 Module: HOD Store (`/pharmacy/hod-store/*`)

*Tester must be primary Pharmacy HOD @ Bode Thomas or admin.*

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHR-HOD-01 | Nav visibility | Login as HOD | HOD Store menu visible |
| UAT-PHR-HOD-02 | Nav deny | Login as staff pharmacist | HOD Store hidden |
| UAT-PHR-HOD-03 | Issue without Rx | Issue stock from HOD store | Tracked in HOD history |
| UAT-PHR-HOD-04 | Request from central | HOD request → central issue → confirm | Stock received |

### 9.9 Module: Pharmacy Analytics (`/pharmacy/analytics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHR-ANL-01 | Dispense stats | Select period | Counts match UAT dispensations |
| UAT-PHR-ANL-02 | HOD segment | View HOD store analytics | HOD issues separated from Rx |

---

## 10. Radiology department

### 10.1 Module: Dashboard (`/radiology`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-RAD-DASH-01 | Load | Open radiology dashboard | Pending study count |

### 10.2 Module: Study Orders (`/radiology/orders`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-RAD-ORD-01 | Receive order | Find order from UAT-CON-ROOM-05 | Modality, patient, visit correct |
| UAT-RAD-ORD-02 | Facility filter | Filter by processing clinic | List filters correctly |
| UAT-RAD-ORD-03 | Perform study | Mark in progress / complete image acquisition | Status advances |

### 10.3 Module: Verification (`/radiology/verification`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-RAD-VER-01 | Report entry | Enter radiology report | Report saved |
| UAT-RAD-VER-02 | Verify/sign | Radiologist verifies | Released to clinicians |

### 10.4 Module: Completed (`/radiology/completed`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-RAD-CMP-01 | Completed studies | List shows UAT study | Report viewable |

### 10.5 Module: Templates (`/radiology/templates`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-RAD-TPL-01 | Template browse | Open study template | Modality and body part correct |

### 10.6 Module: Radiology Analytics (`/radiology/analytics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-RAD-ANL-01 | Modality breakdown | Select period | Studies by modality chart |

---

## 11. Physiotherapy department

**Workflow:** [PHYSIOTHERAPY.md](../workflows/PHYSIOTHERAPY.md)

### 11.1 Module: Dashboard (`/physiotherapy`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHY-DASH-01 | Load | Open physio dashboard | Pending orders count |

### 11.2 Module: Orders (`/physiotherapy/orders`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHY-ORD-01 | Pending queue | Find order from UAT-CON-ROOM-08 | Diagnosis and patient match |
| UAT-PHY-ORD-02 | Schedule | Schedule session date/time | Moves to scheduled tab |
| UAT-PHY-ORD-03 | Start session | Start session; document assessment | Session `in_progress` |
| UAT-PHY-ORD-04 | Complete session | Green **Complete Session** flow | Session in completed list |
| UAT-PHY-ORD-05 | End treatment plan | **End treatment plan** on order | Order completed; leaves active queue |
| UAT-PHY-ORD-06 | Completed tab | View completed orders tab | UAT order listed |
| UAT-PHY-ORD-07 | Doctor visibility | Doctor refreshes consultation physio tab | Sees order status from API |

### 11.3 Module: Completed Sessions (`/physiotherapy/completed`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHY-CMP-01 | Session list | Open completed sessions | UAT session with report |
| UAT-PHY-CMP-02 | Session report | Generate/view report | Content matches documentation |

### 11.4 Module: Physiotherapy Analytics (`/physiotherapy/analytics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-PHY-ANL-01 | Throughput | Select period | Sessions/orders metrics load |

---

## 12. Eye Clinic department

### 12.1 Module: Dashboard (`/eyecare`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-EYE-DASH-01 | Load | Open eye clinic dashboard | Pending orders |

### 12.2 Module: Orders (`/eyecare/orders`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-EYE-ORD-01 | Receive order | Find order from UAT-CON-ROOM-09 | Patient and visit correct |
| UAT-EYE-ORD-02 | Session workflow | Start and document eye session | Status progresses |
| UAT-EYE-ORD-03 | Diagnostics upload | Attach diagnostic file if used | File viewable on session |

### 12.3 Module: Completed (`/eyecare/completed`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-EYE-CMP-01 | Completed list | UAT session completed | Listed with summary |

### 12.4 Module: Eye Clinic Analytics (`/eyecare/analytics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-EYE-ANL-01 | Period metrics | Select month | Order/session charts load |

---

## 13. Human Resources department

### 13.1 Module: Dashboard (`/hr`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-HR-DASH-01 | Compliance summary | Open HR dashboard | Compliance % and counts load |

### 13.2 Module: Annual Check-ups (`/hr/annual-checkups`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-HR-ACU-01 | Employee list | Find **TD-06** | Status shows due/compliant/pending |
| UAT-HR-ACU-02 | Filter/export | Filter by department; export if offered | Correct subset |
| UAT-HR-ACU-03 | Sign-off | Doctor with `annual_checkup_signoff` signs | Status updates to compliant |

### 13.3 Module: Exemptions (`/hr/exemptions`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-HR-EXM-01 | Create exemption | Record approved exemption for employee | Reflected on compliance list |
| UAT-HR-EXM-02 | RBAC | User without `hr_compliance_manage` | Write denied |

---

## 14. Analytics department (management reporting)

### 14.1 Module: Clinical Reports (`/analytics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ANL-CLN-01 | Clinical dashboard | Select date range | Cross-module metrics load |
| UAT-ANL-CLN-02 | Export | Export report if enabled | File downloads |
| UAT-ANL-CLN-03 | RBAC spot-check | User with only nursing role | Access denied (note: verify policy — clinical analytics may need tightening) |

### 14.2 Module: Executive Analytics (`/analytics/executive`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ANL-EXE-01 | Executive view | Open executive dashboard | High-level KPIs load |
| UAT-ANL-EXE-02 | RBAC | Non-admin user | Denied |

---

## 15. ICT / Administration department

**Guide:** [ROLE_ADMINISTRATION.md](../user/ROLE_ADMINISTRATION.md) · [EMR_ADMINISTRATION_GUIDE.md](../admin/EMR_ADMINISTRATION_GUIDE.md)

### 15.1 Module: Dashboard (`/admin`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-DASH-01 | Load | Open admin dashboard | Summary widgets load |

### 15.2 Module: User Management (`/admin/users`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-USR-01 | Create user | Create UAT temp user | Login succeeds |
| UAT-ADM-USR-02 | Assign role | Set Medical Records Support role | Sidebar matches role pages |
| UAT-ADM-USR-03 | Per-user deny | Deny `/medical-records/patients/new` on user | User blocked despite role grant |
| UAT-ADM-USR-04 | Deactivate | Deactivate leaver test account | Login fails |

### 15.3 Module: Roles & Permissions (`/admin/roles`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-ROL-01 | Duplicate support role | Duplicate Officer → Support | Sensitive capabilities stripped |
| UAT-ADM-ROL-02 | Capabilities | Assign `patient_merge` to test role | Merge UI appears for test user |
| UAT-ADM-ROL-03 | Page catalog | New page from release appears in picker | `make docs-check` parity |

### 15.4 Module: Clinics & Departments (`/admin/clinics`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-CLN-01 | List clinics | Open clinics page | All sites listed |
| UAT-ADM-CLN-02 | Edit department | Update department name | Reflected in visit clinic picker |

### 15.5 Module: Rooms (`/admin/clinics` → Rooms tab)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-ROM-01 | Consultation room | Create/edit consultation room | Appears in room queue |

### 15.6 Module: System Settings (`/admin/settings`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-SET-01 | Session idle timeout | Set idle timeout (within 5–240 min) | Users logged out after period |
| UAT-ADM-SET-02 | Notification routing | Edit routing with capability | Notifications route correctly |

### 15.7 Module: System Health (`/admin/health`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-HLT-01 | Health page | Open `/admin/health` | DB, API, disk, backup status shown |
| UAT-ADM-HLT-02 | Post-deploy | Run after env-manager deploy | All checks green on UAT |

### 15.8 Module: Annual Check-up Programme (`/admin/annual-checkup-programme`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-ACP-01 | Programme defaults | View default investigation bundle | Matches consultation annual panel |
| UAT-ADM-ACP-02 | Edit programme | Change default test with capability | Consultation panel reflects change |

### 15.9 Module: Audit Trail (`/admin/audit`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-AUD-01 | Login audit | After UAT-GLB-AUTH-01 | Login event listed |
| UAT-ADM-AUD-02 | Sensitive action | After patient merge | Merge action logged |
| UAT-ADM-AUD-03 | No PHI export | Review export if any | No excessive PHI in CSV |

### 15.10 Module: Support Tickets (`/admin/support-tickets`)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| UAT-ADM-TKT-01 | User ticket | Submit from `/help/tickets` | Appears in admin queue |
| UAT-ADM-TKT-02 | Resolve | Admin closes ticket | User sees updated status |

---

## 16. Cross-department end-to-end flows

Run **once per release** with clinical lead + delegates. Reference: [VISIT_LIFECYCLE.md](../workflows/VISIT_LIFECYCLE.md).

### 16.1 E2E-01 — Outpatient standard path

| Step | Department | Scenario ID | Action |
|------|------------|-------------|--------|
| 1 | Medical Records | UAT-MR-REG-01 | Register **TD-01** |
| 2 | Medical Records | UAT-MR-VIS-01 | Create visit |
| 3 | Nursing | UAT-NRS-POOL-02 | Record vitals |
| 4 | Consultation | UAT-CON-ROOM-01–03 | Start session; document |
| 5 | Consultation | UAT-CON-ROOM-04,06 | Lab + pharmacy orders |
| 6 | Laboratory | UAT-LAB-VER-01–02 | Result + verify |
| 7 | Pharmacy | UAT-PHR-RX-02 | Dispense |
| 8 | Consultation | UAT-CON-ROOM-10 | Complete consultation |
| 9 | Medical Records | UAT-MR-RPT-01 | Attendance report includes visit |

### 16.2 E2E-02 — Room presence path

| Step | Department | Action |
|------|------------|--------|
| 1 | Consultation | Doctor checks into room (on seat) |
| 2 | Nursing | UAT-NRS-ROOM-03 — send patient to accepting room |
| 3 | Consultation | Session starts; complete |
| 4 | Nursing | UAT-NRS-ROOM-04 — verify away room blocks send |

### 16.3 E2E-03 — Inpatient / ward path

| Step | Department | Action |
|------|------------|--------|
| 1 | Consultation | UAT-CON-WARD-07 — admission handoff for **TD-05** |
| 2 | Nursing | UAT-NRS-WARD-01–08 — Care / Tasks / Timeline, observations, administer |
| 3 | Consultation | UAT-CON-WARD-04 — ward round doctor order |
| 4 | Nursing | UAT-NRS-WARD-05 — perform order; UAT-NRS-WARD-07 timeline completed |
| 5 | Medical Records | UAT-MR-RPT-06 — escort/ward report if applicable |

### 16.4 E2E-04 — Ancillary services path

| Step | Department | Action |
|------|------------|--------|
| 1 | Consultation | Orders: lab, radiology, physio, eye |
| 2 | Laboratory | Complete UAT-LAB-VER-02 |
| 3 | Radiology | Complete UAT-RAD-VER-02 |
| 4 | Physiotherapy | Complete UAT-PHY-ORD-05 |
| 5 | Eye Clinic | Complete UAT-EYE-ORD-02 |
| 6 | Consultation | UAT-CON-HIST-02 — all results visible on history |

### 16.5 E2E-05 — Governance path

| Step | Department | Action |
|------|------------|--------|
| 1 | Consultation | Complete visit with diagnosis |
| 2 | Medical Records | UAT-MR-DXR-02 — correct ICD-10 |
| 3 | HR | UAT-HR-ACU-03 — annual checkup sign-off for **TD-06** |
| 4 | Administration | UAT-ADM-AUD-02 — audit entries present |

### 16.6 E2E-06 — RBAC negative matrix (ICT)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Pharmacist → `/medical-records/patients/new` | Denied |
| 2 | Lab Support → `/admin/users` | Denied |
| 3 | MR Support → patient merge | Denied without capability |
| 4 | Staff pharmacist → `/pharmacy/hod-store` | Hidden/denied |
| 5 | Nurse → `/consultation/wards` doctor order | Denied without `ward_order_create` |

---

## 17. Department sign-off summary

| Department | Modules tested | Tester | Date | Pass/Fail | Open defects |
|------------|----------------|--------|------|-----------|--------------|
| Global | §4 | | | | |
| Medical Records | §5 (all submodules in scope) | | | | |
| Nursing | §6 | | | | |
| Consultation | §7 | | | | |
| Laboratory | §8 | | | | |
| Pharmacy | §9 | | | | |
| Radiology | §10 | | | | |
| Physiotherapy | §11 | | | | |
| Eye Clinic | §12 | | | | |
| Human Resources | §13 | | | | |
| Analytics | §14 | | | | |
| Administration | §15 | | | | |
| End-to-end | §16 (minimum E2E-01 + one ancillary) | | | | |

**Release gate:** No open P1/P2 defects; all department rows Pass or waived in [UAT_SIGNOFF.md](UAT_SIGNOFF.md).

---

## 18. Traceability to documentation

| UAT section | Primary docs |
|-------------|--------------|
| Medical Records | ROLE_MEDICAL_RECORDS.md, VISIT_LIFECYCLE.md §1 |
| Nursing | ROLE_NURSING.md, VISIT_LIFECYCLE.md §2 |
| Consultation | ROLE_CONSULTATION.md, VISIT_LIFECYCLE.md §3 |
| Laboratory | ROLE_LABORATORY.md, VISIT_LIFECYCLE.md §4, integration/urit5160 |
| Pharmacy | ROLE_PHARMACY.md, PHARMACY.md |
| Radiology | VISIT_LIFECYCLE.md §6 |
| Physiotherapy | PHYSIOTHERAPY.md |
| RBAC / Admin | AUTH_AND_RBAC.md, ROLE_ADMINISTRATION.md |
| Page catalog | `frontend/lib/page-permissions.ts`, `make docs-check` |
