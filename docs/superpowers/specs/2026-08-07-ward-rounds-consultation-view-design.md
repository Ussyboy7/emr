# Ward Rounds Enhancement — Consultation-Session-Like Doctor View

**Date:** 2026-08-07
**Status:** Approved design (pre-implementation)
**Scope:** Doctor Ward Rounds view only (`frontend/app/consultation/wards/page.tsx`). Nurse Ward Care view is unchanged.

## 1. Problem Statement

A patient can generate **two reports for the same Visit**:

1. **Consultation report** (`backend/consultation/report_pdf.py`)
2. **Ward admission summary** (`backend/wards/pdfs.py`)

Today the doctor's Ward Rounds view is functionally limited compared to a consultation session:

- No **patient history** tab (consultation room has one via shared `PatientHistoryTabs`).
- Notes are a flat, delimited string on `PatientAdmission.admission_notes` (not structured session-style fields).
- Orders are limited to nursing + pharmacy (`WardDoctorOrdersSection`); no lab, radiology, physio, eye, or referral from the ward.

More importantly, **order attribution between the two reports is imprecise**:

| Order type | Has `admission` FK? | Consultation report pulls by | Ward summary pulls by |
|---|---|---|---|
| Prescription | no | `session` | `visit` + date-window |
| Lab | no | **`visit`** | `visit` + date-window |
| Radiology | no | **`visit`** | `visit` + date-window |
| Nursing | **yes** | `session` | `admission` |
| Physio | no | `session` | *(not included)* |
| Eye | no | `session` | *(not included)* |

Defects today:

- The **consultation report** grabs lab + radiology by `visit`, so ward-ordered labs leak into it.
- The **ward summary** grabs pharmacy/lab/rad by `visit` + `ordered_at >= admission_date`, a crude heuristic, not a real link; consult orders can bleed in via date overlap.

## 2. Goals

- Give the doctor's Ward Rounds view the capabilities of the consultation session: **Patient History**, **Ward Notes**, and the **full order suite**.
- Make the **admission the source of truth for all ward-generated work**, and the consultation session the source of truth for consultation-generated work.
- Make the **Ward Admission Summary** the complete, authoritative, chronologically-ordered record of the admission (every clinical action attributable to it).
- Maximize component reuse while keeping the two clinical workflows' **orchestration separate**.

## 3. Non-Goals

- No changes to the nurse Ward Care view (`frontend/app/nursing/wards/page.tsx`).
- No structured/auto-saved notes fields on the admission (notes stay flat-timeline).
- No multi-admission-per-episode modeling (single admission is the atomic unit).
- No support for dietetics/speech/OT modules now (design leaves a plug-in seam).

## 4. Terminology

Ward Rounds tabs (replaces ambiguous "History"/"Notes"):

- **Patient History** — longitudinal record across encounters (what happened before).
- **Ward Notes** — progress notes belonging to this admission.
- **Orders** — current admission orders.
- **Summary** — current admission progress (clinical snapshot + assessment/plan).

"History" now unambiguously means patient history, not history-of-present-illness.

## 5. Architecture Principle

> **Reuse mechanisms, not workflows.**

Consultation and ward rounds share order-entry *mechanics* but are different clinical *processes*. Therefore:

- **Reuse:** order dialogs (Prescription/Lab/Radiology/Eye/Physio/Referral), form components, validation, search, dose calculator, API services (`createPrescription`, `createLab`, ...), payload builders/mappers.
- **Do NOT reuse:** the 2000-line `useConsultationRoomOrders` hook. It is bound to session/room lifecycle (drafts, autosave, room validation, session completion).

Split orchestration:

```
useConsultationRoomOrders()   ← consultation orchestration
useWardOrders()               ← admission orchestration (new)
```

Avoid a single parameterized hook (`mode: "consultation" | "admission"`) — it accumulates `if (isAdmission) ...` branches and becomes unmaintainable.

## 6. Backend Design

### 6.1 Schema — add `admission` FK to all order types

Add a nullable `admission` FK (`on_delete=SET_NULL`, `null=True`, `blank=True`) to:

- `pharmacy.Prescription`
- `laboratory.LabOrder`
- `radiology.RadiologyOrder`
- `physiotherapy.PhysioOrder`
- `eyecare.EyeOrder`
- `consultation.Referral` (note: this model's session FK is named `session`, not `consultation_session`)

This mirrors the existing `nursing.NursingOrder.admission`. One migration per app.

### 6.2 Data backfill migration

Stamp existing/legacy orders with the matching admission using the **same heuristic the report currently uses**:

```
patient + visit + ordered_at within [admission_date, discharge_date]
```

This preserves today's report output exactly while moving to the clean FK. For each admission, update matching rows across the five order types. Non-destructive (only sets the FK where a match exists).

### 6.3 Report attribution — exact FK, not heuristics

**`backend/wards/pdfs.py` (Ward Admission Summary):**
- `_load_pharmacy`, `_load_lab`, `_load_radiology` → filter by `admission` FK.
- Add **Physiotherapy**, **Eye Care**, and **Referrals** sections (currently absent).
- Order each section chronologically.
- Add a plug-in seam so future care modules (dietetics, speech, OT) can contribute sections.

**`backend/consultation/report_pdf.py` (Consultation report):**
- Lab & Radiology → filter by `consultation_session` (currently `visit`), so ward orders no longer leak into the consultation report.
- (Prescriptions already filter by `session`; Physio/Eye already by `session`.)

### 6.4 Serializers

Accept an optional `admission` field on create for the five order types (write path only; `admission` id).

## 7. Frontend Design — Doctor Ward Rounds (`frontend/app/consultation/wards/page.tsx`)

### 7.1 Tabs

New tab set for the admission detail dialog:

| Tab | Content |
|---|---|
| **Patient History** | Shared `PatientHistoryTabs` component, fed by `patientService.getClinicalOverview(patientId)` (same as consultation room's `ConsultationRoomHistoryTab`). Current-admission data is **excluded**. |
| **Ward Notes** | Existing flat progress-note timeline (`ProgressNotesTimeline`). Doctor↔nurse notes stay on `admission_notes` and flow into the summary's Progress section. |
| **Orders** | Full order suite via shared dialogs, orchestrated by the new `useWardOrders` hook. |
| **Summary** | Existing clinical snapshot (diagnosis, complaint, instructions) + assessment/plan + save note (unchanged from current "Round" tab). |

### 7.2 New hook — `useWardOrders()`

Admission-specific orchestration. Responsibilities:

- Resolve `visit` from the admission.
- Open each shared order dialog.
- Build the create payload with `{ visit, admission }` (not `consultation_session`).
- Refresh order list + reload admission after create.
- Toast success/error.

Kept intentionally small (~few hundred lines). No drafts/autosave/lifecycle — those are consultation concerns.

### 7.3 Shared components reused (not duplicated)

- `ConsultationOrderListCard`
- `ConsultationRoomOrderDialogs` (prescription/lab/radiology/eye/physio/referral modals)
- `WardDoctorOrdersSection` (nursing + pharmacy rows)
- `PatientHistoryTabs`
- API service methods (`createPrescription`, `createLabOrder`, `createRadiologyOrder`, `createPhysioOrder`, `createEyeOrder`, `createReferral`)

## 8. Data Flow

```
Doctor opens Ward Rounds → selects admitted patient
  → dialog with tabs: Patient History | Ward Notes | Orders | Summary
  → Orders tab → useWardOrders hook → shared dialog
      → create { patient, visit, admission, ... } → backend serializer stores admission FK
  → Ward Admission Summary PDF (on discharge) pulls orders by admission FK
  → Consultation report pulls orders by consultation_session FK
```

## 9. Error Handling & Edge Cases

- **Orders with no matching admission** (legacy, not backfilled): reports keep the visit + date-window fallback so they still surface. *(Exact fallback strategy finalized during implementation; default: FK primary, heuristic fallback only where FK null.)*
- **Patient with no active admission**: the Ward Rounds list only shows admitted patients, so Orders/Notes tabs are only reachable when an admission exists.
- **Physio/Eye/Referral on an admission without a visit**: guard on `admission.visit_id` (orders require a visit); disable order entry if absent.

## 10. Testing

- **Backend:** migration backfill unit test (matching + non-matching rows); report builders include all order types and exclude cross-context orders; serializer accepts `admission`.
- **Frontend:** `useWardOrders` hook test (payload shape: `{ visit, admission }`, not session); tab render test; Patient History tab loads overview.

## 11. Out of Scope / Future

- Multi-admission-per-episode model.
- Structured auto-saved notes on admission.
- Dietetics / Speech / Occupational Therapy modules (seam only).
- Changes to the nurse Ward Care view.
