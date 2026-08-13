# Care Session Page Design

**Date:** 2026-08-10
**Status:** Approved (design gate passed)

## Summary

Replace the giant ward-admission detail modal (consultation/nursing `wards` pages)
with a canonical, deep-linkable **Care Session page** at
`/wards/admissions/[admissionId]`. The page is the single full record of an
inpatient stay: clinical orders, doctor→nurse instructions, progress notes,
timeline, and the patient's full consultation history.

The existing modal stays but is reduced to a **quick snapshot** (diagnosis,
complaint, latest instruction, status, key facts) with an **"Open Session →"**
link into the new page.

## Decisions (confirmed with user)

- **Route:** `/wards/admissions/[admissionId]` — deep-linkable; the modal no
  longer owns the full record.
- **`PatientAdmission` is the container**; the linked
  `consultation.ConsultationSession` (when present) is the canonical clinical
  context whose notes/diagnoses are reflected.
- **Orders tab = full parity with today's modal**: `WardDoctorOrdersSection`
  (Medication → real pharmacy prescription, Injection → nursing procedures
  queue, Dressing, Nursing instruction) plus the Lab, Radiology, Physio, Eye,
  Referral order modals. Doctors can prescribe drugs and injections from here.
- **Instructions tab reuses existing nursing orders** (`order_type = ward
  instruction`, already `pending → completed`, editable/cancellable from
  `WardDoctorOrdersSection`) plus legacy `admission_instructions` rendered
  read-only as provenance. **No new WardInstruction model.**
- **History tab = full parity with the consultation room's History tab**:
  `PatientHistoryTabs` with the consult-room config
  (`showVisits/Certificates/Documents/Referrals/Background`,
  `defaultTab="background"`, `allowDocumentActions={false}`) and every View
  button wired to the shared detail viewers already used by the patient-record
  page (`ConsultationReportModal`, `VitalsDetailModal`,
  `LabCompletedReportDialog`, `RadiologyCompletedReportDialog`,
  `PrescriptionReportDialog`, `VisitDetailModal`, `EyeSessionReportDialog`,
  physio/ward/referral dialogs). No new viewer code.
- **Session linkage:** new `PatientAdmission.consultation_session` FK set at
  creation (room hook + history flow both carry `sessionId`); data-migration
  backfill for existing rows; frontend fallback reselects the latest session
  for the admission's visit whose `started_at <= admission_date` when the FK is
  null.
- **Tabs:** Overview | Activities | Orders | Instructions | Notes | Timeline |
  History.
- **Timeline** is a chronological presentation (merged, time-ordered);
  **Activities** is the read-only aggregation of vitals/handover/procedure
  history already surfaced by existing ward cards.
- No generic Activity model; no new order-creation code outside reuse.

## Tabs

| Tab | Content | Source |
| --- | --- | --- |
| Overview | Clinical snapshot — diagnosis, complaint, session-linked notes summary, status, ward/bed, admitting doctor, admission type, length of stay | `PatientAdmission` + `ConsultationSession` |
| Activities | Vitals trend, latest handover, progress summaries, escalation banner, documents menu | existing `ward/` cards (`WardLatestHandoverCard`, etc.) |
| Orders | `WardDoctorOrdersSection` + Lab/Radiology/Physio/Eye/Referral order modals (full parity) | `WardDoctorOrdersSection.tsx` + `wards/page.tsx` order dialogs |
| Instructions | `ward instruction` nursing orders (reuse lifecycle) + legacy `admission_instructions` (read-only legacy block) | `/nursing/orders/?for_admission=` + admission field |
| Notes | `admission_notes` progress-note timeline (parsed entries) | `ProgressNotesTimeline.tsx` |
| Timeline | Merged chronological feed of orders + notes + vitals events | aggregation of tab sources |
| History | Full patient history (consult-room parity) | `PatientHistoryTabs` + shared viewers |

## Backend

### `backend/wards/models.py` — `PatientAdmission`

Add:

```python
consultation_session = models.ForeignKey(
    'consultation.ConsultationSession',
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name='admissions',
    help_text='Consultation session that motivated this admission.',
)
```

### Migration + backfill

`backend/wards/migrations/0014_patientadmission_consultation_session.py`:

- `AddField` `consultation_session`.
- `RunPython` backfill: for each admission without a session, pick the latest
  `ConsultationSession` for the same `visit` with `started_at <= admission_date`
  (ordering by `started_at` desc, then `id` desc). Eligibility predicate stays
  purely deterministic (same py path in both directions; reverse = no-op).

### `backend/wards/serializers.py`

- `PatientAdmissionSerializer`: `consultation_session` already flows through
  `fields = '__all__'`. Add a read-only `consultation_session_id` convenience
  if needed by the page (keep minimal — the FK value is already serialized).
- Ensure it is writable at create from room/history contexts.

### `backend/wards/views.py`

- `perform_create` already defaults `admitting_doctor`; nothing else needed for
  the FK (modelled as a normal writable FK on create).
- No new endpoints required (admission detail already served at
  `/admissions/<pk>/`; nursing orders at `/nursing/orders/?for_admission=`).

### Permissions (`backend/permissions/…`)

- `page_paths.py` / `page_catalog.py` / `capabilities.py` / `permission_actions.py`:
  register `/wards/admissions/[admissionId]` as a page id
  (`/wards/admissions`), grantable to the same roles as `/consultation/wards`
  and `/nursing/wards`.
- `api_access.py`: the dynamic page path lives under frontend routing; the
  underlying APIs are already mapped (`wards/`, `admissions/` prefixes map to
  `/nursing/wards` + `/consultation/wards`). No API changes expected. Run
  `make docs-check` after registering capabilities.

## Frontend

### Services

- `frontend/lib/services/ward-service.ts`:
  - `PatientAdmission` type: add `consultation_session?: number | null`.
  - `createAdmission` input: add `consultation_session?: number | null`.
- `frontend/hooks/use-consultation-room-orders.ts` (room observation admission
  at ~:1280): include `consultation_session: sessionId` in
  `wardService.createAdmission(...)`.
- `frontend/lib/consultation/history-nursing-order.ts`
  (`buildHistoryNursingSubmission` observation branch): propagate the context's
  `consultation_session` into the admission payload.
- New session resolver helper (used by the page): given admission, return the
  linked session if present else latest-by-visit
  (`consultationService.getSession(id)` /
  `consultationService.resolveSessionForVisit({ visit })`).

### New page

`frontend/app/wards/admissions/[admissionId]/page.tsx` (+
`frontend/components/ward/care-session/*`):

- Fetch admission via `wardService.getAdmission(id)` + resolve linked session.
- Tabs: Overview | Activities | Orders | Instructions | Notes | Timeline |
  History (reactive `searchParams.tab` deep-link support).
- Orders tab: reuse `WardDoctorOrdersSection` (allowAdd/allowEditCancel gated by
  `userCanEditCancelWardOrders`) + the five order modals lifted from
  `wards/page.tsx`.
- History tab: `PatientHistoryTabs` config identical to
  `ConsultationRoomHistoryTab`, with View handlers wired to the shared viewers
  (from the patient-record page pattern).
- Shared viewers hosted on the page: consultation report, vitals, lab, imaging,
  prescription, physio, eye, ward, referral dialogs (all reusable components).

### Modal shrink

`frontend/app/consultation/wards/page.tsx` and
`frontend/app/nursing/wards/page.tsx`:

- Keep the modal as a quick snapshot (diagnosis, complaint, latest instruction,
  status, ward/bed, admitting doctor) + **"Open Session →"** button navigating
  to `/wards/admissions/[admissionId]`.
- Move the heavy tabs (orders/notes/timeline/patient history) out of the modal
  into the page.
- Doctor ward list keeps its inline triage affordances (escalation banner, quick
  order CTAs that already exist); the modal no longer duplicates full detail.

## Capability / Permission notes

- Page inherits the role sets already implied by `/consultation/wards`
  (doctors) and `/nursing/wards` (nurses).
- `ward_order_create` / `ward_order_edit` / `ward_order_perform` /
  `nursing_order_create` already gate the underlying order actions; the page
  applies the same `userCanEditCancelWardOrders` + `allowPerformOrders` logic
  as the current modal.
- `make docs-check` after any capability/page catalog change.

## Out of Scope

- New `WardInstruction` model — Instructions reuse existing `ward instruction`
  nursing orders.
- New detail viewer components — all reused from patient-record/room pages.
- Replacing `admission_instructions` semantics — remains the legacy observation
  handoff text, rendered read-only.
- Generic Activity model / new timeline event model.

## Verification

- Backend: wards migration applied (`python manage.py migrate wards`); backfill
  verified for a row with a session + a row without; `wards` + `nursing` test
  suites green in Docker.
- Frontend: `npm run type-check`, `npm run lint`, Vitest suites for
  ward-service/history-nursing-order additions green.
- `make docs-check` after permission/capability catalog changes.