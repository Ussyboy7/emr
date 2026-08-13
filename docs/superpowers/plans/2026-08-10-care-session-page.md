# Care Session Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deep-linkable Care Session page (`/wards/admissions/[admissionId]`) that becomes the single full record of an inpatient stay — exact tabs Overview | Activities | Orders | Instructions | Notes | Timeline | History — and shrink the existing ward-admission detail modal to a quick snapshot with an "Open Session" link.

**Architecture:** `PatientAdmission` is the container. A new nullable `consultation_session` FK on `PatientAdmission` (set at create from the room/history flows, backfilled by migration, frontend-fallback to latest-by-visit) links the canonical `ConsultationSession`. The page reuses existing components wholesale: `WardDoctorOrdersSection` + five order modals (Orders), existing `ward instruction` nursing orders + `admission_instructions` (Instructions), `ProgressNotesTimeline` (Notes), patient-record shared viewers (History). **No new order-creation code, no new WardInstruction model, no new viewer components.**

**Tech Stack:** Django 4.2 + DRF; Next.js 16 App Router + React 18 + TS strict + shadcn/ui; Vitest (Node-only); backend tests via Docker.

## Global Constraints

- No new backend models except the `consultation_session` FK on `PatientAdmission`.
- Reuse existing components/services; no new order-creation code or detail viewers.
- Frontend strict TS; use `lib/api-client.ts` — no new HTTP client.
- Follow existing approval/no-overengineering stance: don't gold-plate; batch verification.
- `make docs-check` after any capability/page-catalog change.
- Do not commit unless explicitly requested.

---

### Task 1: Backend — `consultation_session` FK + backfill migration

**Files:**
- Modify: `backend/wards/models.py:283` (after `nursing_order` FK)
- Create: `backend/wards/migrations/0014_patientadmission_consultation_session.py`
- Test: `backend/wards/tests/test_admissions_api.py` (or new `test_consultation_session_link.py`)

**Interfaces:**
- Consumes: existing `PatientAdmission` model, `consultation.ConsultationSession` (`patient`, `visit`, `started_at`).
- Produces: `PatientAdmission.consultation_session` (nullable FK, related_name `admissions`); admission create accepts `consultation_session` pk; backfill populated existing rows.

- [ ] **Step 1: Add the field**

In `backend/wards/models.py` after the `nursing_order` field (line ~281):

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

- [ ] **Step 2: Generate the migration**

Run:
```bash
python manage.py makemigrations wards
```
(Run from `backend/` with venv; if the shell can't run Django directly, run via the Docker backend container.)

- [ ] **Step 3: Add the backfill `RunPython`**

Edit `backend/wards/migrations/0014_patientadmission_consultation_session.py` so it reads:

```python
from django.db import migrations, models


def backfill_consultation_session(apps, schema_editor):
    PatientAdmission = apps.get_model('wards', 'PatientAdmission')
    ConsultationSession = apps.get_model('consultation', 'ConsultationSession')
    rows = []
    for admission in PatientAdmission.objects.filter(consultation_session__isnull=True) \
                                                 .exclude(visit__isnull=True) \
                                                 .only('id', 'visit_id', 'admission_date'):
        session = (
            ConsultationSession.objects
            .filter(visit_id=admission.visit_id)
            .filter(started_at__lte=admission.admission_date)
            .order_by('-started_at', '-id')
            .first()
        )
        if session is not None:
            rows.append((admission.id, session.id))
    for pk, session_id in rows:
        PatientAdmission.objects.filter(pk=pk).update(consultation_session_id=session_id)


def reverse_backfill(apps, schema_editor):
    pass  # field drop handles cleanup


class Migration(migrations.Migration):

    dependencies = [
        ('wards', '0013_backfill_admission_on_orders'),
        ('consultation', '<latest consultation migration>'),
    ]

    operations = [
        migrations.AddField(
            model_name='patientadmission',
            name='consultation_session',
            field=models.ForeignKey(
                blank=True,
                help_text='Consultation session that motivated this admission.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='admissions',
                to='consultation.consultationsession',
            ),
        ),
        migrations.RunPython(backfill_consultation_session, reverse_backfill),
    ]
```

Replace `<latest consultation migration>` by checking `backend/consultation/migrations/` for the newest file name.

- [ ] **Step 4: Apply the migration**

Run:
```bash
python manage.py migrate wards
```
Expected: applies cleanly, backfill runs with no errors.

- [ ] **Step 5: Backend test — create with session + fallback read**

Add to `backend/wards/tests/test_admissions_api.py` (follow the file's existing pattern for a doctor-authenticated create):

```python
def test_create_admission_links_consultation_session(self):
    # create a consultation session for a visit (consultation.tests helpers or
    # ConsultationSession.objects.create(patient=..., room=..., visit=..., doctor=...))
    # then POST /api/v1/admissions/ with {'patient','visit','ward', 'admission_type':'observation',
    #   'admission_diagnosis':'Dx', 'consultation_session': session.id}
    # assert response consultation_session == session.id
```

- [ ] **Step 6: Run backend wards tests**

Run via Docker:
```bash
docker compose -f docker-compose.local.yml exec -T backend python manage.py test wards
```
Expected: existing + new tests pass (ignore the known unrelated `permissions.tests...` failure if it appears — it is outside `wards`).

- [ ] **Step 7: Commit** (only when the user asks; otherwise leave staged work as part of the batch)

---

### Task 2: Frontend services — propagate session on create + resolver

**Files:**
- Modify: `frontend/lib/services/ward-service.ts` (`PatientAdmission` type + `createAdmission` input)
- Modify: `frontend/hooks/use-consultation-room-orders.ts:1280`
- Modify: `frontend/lib/consultation/history-nursing-order.ts:24-28`
- Create: `frontend/lib/ward/care-session-session-resolver.ts`
- Test: `frontend/lib/consultation/history-nursing-order.test.ts` (extend existing)

**Interfaces:**
- Consumes: `PatientAdmission.consultation_session`, `consultationService.getSession`, `consultationService.resolveSessionForVisit`, `wardService.getAdmission`.
- Produces: `PatientAdmission.consultation_session?: number | null`; `createAdmission` input field `consultation_session?: number | null`; `resolveCareSessionAdmissionSession(admission): Promise<ConsultationSession | null>`.

- [ ] **Step 1: Widen the type + input**

`frontend/lib/services/ward-service.ts`:

```ts
export interface PatientAdmission {
  // ...
  consultation_session?: number | null;
}
```

```ts
  async createAdmission(data: {
    patient: number;
    visit: number;
    // ...existing...
    consultation_session?: number | null;
  }): Promise<PatientAdmission> {
```

- [ ] **Step 2: Room hook passes the session**

`frontend/hooks/use-consultation-room-orders.ts` (the observation-admission branch ~:1280):

```ts
          await wardService.createAdmission({
            patient: numericPatientId,
            visit: numericVisitId,
            ward: Number(selectedWard.id),
            admission_type: 'observation',
            admission_diagnosis: primaryDx.description,
            presenting_complaint: order.presentingComplaint || '',
            admission_instructions: order.instructions || '',
            consultation_session: sessionId,
          });
```

- [ ] **Step 3: History flow propagates session**

`frontend/lib/consultation/history-nursing-order.ts` observation branch:

```ts
    return { kind: "admission" as const, payload: {
      patient: context.patient, visit: context.visit, ward, admission_type: "observation" as const,
      admission_diagnosis: payload.admissionDiagnosis || "", presenting_complaint: payload.presentingComplaint || "",
      admission_instructions: payload.instructions,
      consultation_session: context.consultation_session,
    } };
```

Update the `wardService.createAdmission` call site that consumes this payload (in `consultation/history/page.tsx` or wherever `buildHistoryNursingSubmission` is used) to pass `consultation_session` through.

- [ ] **Step 4: Session resolver helper**

Create `frontend/lib/ward/care-session-session-resolver.ts`:

```ts
import type { ConsultationSession } from '@/lib/services';
import { consultationService } from '@/lib/services';
import type { PatientAdmission } from '@/lib/services/ward-service';

export async function resolveCareSessionAdmissionSession(
  admission: PatientAdmission,
): Promise<ConsultationSession | null> {
  const linked = admission.consultation_session;
  if (typeof linked === 'number' && linked > 0) {
    try {
      const session = await consultationService.getSession(linked);
      if (session?.id) return session;
    } catch {
      // fall through to visit-based fallback
    }
  }
  if (!admission.visit) return null;
  try {
    const resolved = await consultationService.resolveSessionForVisit({ visit: admission.visit });
    return resolved?.id ? resolved : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Tests**

Extend `frontend/lib/consultation/history-nursing-order.test.ts` (or add sibling) — assert the observation payload now carries `consultation_session: context.consultation_session` and that a missing session still produces a valid admission payload.

- [ ] **Step 6: Verify frontend**

```bash
npm run type-check && npm run lint && npm run test -- --run
```
Expected: green (Node-only suites).

---

### Task 3: Care Session page shell + data fetching

**Files:**
- Create: `frontend/app/wards/admissions/[admissionId]/page.tsx`
- Create: `frontend/components/ward/care-session/CareSessionTabs.tsx`
- Create: `frontend/components/ward/care-session/CareSessionPageHeader.tsx`

**Interfaces:**
- Consumes: `wardService.getAdmission`, `resolveCareSessionAdmissionSession`, `PatientAdmission`, `ConsultationSession`.
- Produces: page route + `CareSessionProvider`-less prop drill; active tab from `searchParams.tab`; `onChangeTab(pathname, tab)` for URL sync.

- [ ] **Step 1: Layout shell**

`frontend/app/wards/admissions/[admissionId]/page.tsx`:

```tsx
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { wardService, type PatientAdmission } from "@/lib/services/ward-service";
import { resolveCareSessionAdmissionSession } from "@/lib/ward/care-session-session-resolver";
import type { ConsultationSession } from "@/lib/services";
import { CareSessionPageHeader } from "@/components/ward/care-session/CareSessionPageHeader";
import { CareSessionTabs } from "@/components/ward/care-session/CareSessionTabs";

export default function CareSessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const admissionId = Number(params?.admissionId);
  const [admission, setAdmission] = useState<PatientAdmission | null>(null);
  const [session, setSession] = useState<ConsultationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(admissionId) || admissionId <= 0) {
      setError("Invalid admission id.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const adm = await wardService.getAdmission(admissionId);
        if (cancelled) return;
        setAdmission(adm);
        const s = await resolveCareSessionAdmissionSession(adm);
        if (!cancelled) setSession(s);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load admission.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [admissionId]);

  const activeTab = useMemo(
    () => (searchParams?.get("tab") as string) || "overview",
    [searchParams],
  );

  const setActiveTab = (tab: string) => {
    router.replace(`/wards/admissions/${admissionId}?tab=${encodeURIComponent(tab)}`);
  };

  // render loading / error / not-found states, then:
  // <DashboardLayout>
  //   <CareSessionPageHeader admission={admission} session={session} />
  //   <CareSessionTabs admission={admission} session={session} activeTab={activeTab} onTabChange={setActiveTab} />
  // </DashboardLayout>
}
```

- [ ] **Step 2: Header**

`frontend/components/ward/care-session/CareSessionPageHeader.tsx` — patient name/photo, `admission_id`, ward/bed, status badge, admission type, length of stay, responsible-form + documents links (reuse `WardAdmissionDocumentsMenu`), and a discreet session chip when `session?.id` exists linking to the consultation room if applicable.

- [ ] **Step 3: Verify type-check**

```bash
npm run type-check
```
Expected: green.

---

### Task 4: Overview + Activities + Notes tabs

**Files:**
- Create: `frontend/components/ward/care-session/tabs/OverviewTab.tsx`
- Create: `frontend/components/ward/care-session/tabs/ActivitiesTab.tsx`
- Create: `frontend/components/ward/care-session/tabs/NotesTab.tsx`

**Interfaces:**
- Consumes: `PatientAdmission`, `ConsultationSession`, existing cards (`WardLatestHandoverCard`, `ProgressNotesTimeline`, `WardAdmissionDocumentsMenu`).
- Produces: three tab bodies reused by `CareSessionTabs`.

- [ ] **Step 1: OverviewTab** — clinical snapshot: admission diagnosis (linked-session diagnoses where available), presenting complaint, linked session notes summary (HPI/exam/assessment/plan), escalation banner (reuse `isEscalatedCondition`), status/ward/bed/doctor/type/started. Read-only.
- [ ] **Step 2: ActivitiesTab** — reuse existing aggregation components currently inside the modal: `WardLatestHandoverCard` (from `admission_notes`), recent progress note snippets, escalation banner, `WardAdmissionDocumentsMenu`. Fetch any required nursing/vital history via existing services if the reused cards need it.
- [ ] **Step 3: NotesTab** — render `ProgressNotesTimeline` with `admission.admission_notes` (same split/parse as today's modal) plus an append-inline composer that mirrors the modal's `[timestamp — Dr. X]` prepend and calls `wardService.updateAdmission(id, { admission_notes })` — reuse the exact logic/utilities (`buildNurseObservationNotePayload` where applicable) already present.
- [ ] **Step 4: Verify** type-check + lint green; tab renders in Storybook-less manual check later.

---

### Task 5: Instructions tab (reuse existing nursing orders)

**Files:**
- Create: `frontend/components/ward/care-session/tabs/InstructionsTab.tsx`

**Interfaces:**
- Consumes: `/nursing/orders/?for_admission=<id>` (via `apiFetch`), `admission.admission_instructions`, `isWardHandoffOrder`, `WardDoctorOrdersSection` semantics.
- Produces: Instructions list + legacy read-only block; no new API.

- [ ] **Step 1: Fetch & render** — query nursing orders for the admission, filter to `order_type = ward instruction` (exclude handoff artifacts via `isWardHandoffOrder`), render with status/priority/done/cancel affordances gated by the same `allowEditCancelOrders` logic used in `WardDoctorOrdersSection`.
- [ ] **Step 2: Legacy provenance block** — when `admission.admission_instructions` is non-empty, render a read-only "Instructions at admission" block sourced from the admission record.
- [ ] **Step 3: Verify** type-check + lint.

---

### Task 6: Orders tab (full parity)

**Files:**
- Create: `frontend/components/ward/care-session/tabs/OrdersTab.tsx`

**Interfaces:**
- Consumes: `WardDoctorOrdersSection` (props `admission`, `allowAddOrders`, `allowEditCancelOrders`, `allowPerformOrders`, `currentUserId`, `showRoutingInfo`, `historyDisplay`), the five order modals from `wards/page.tsx` (`LabOrderModal`, `RadiologyOrderModal`, `PhysioOrderModal`, `NewEyeOrderModal`, Referral modal) + their submit handlers (`handleWardLabOrder` etc.), `userCanEditCancelWardOrders`.

- [ ] **Step 1:** Port the Orders tab from today's modal: `WardDoctorOrdersSection` + the five modals + the submit handlers. Keep gating identical (`userCanEditCancelWardOrders(currentUser)` → `allowEditCancelOrders`, doctors → `allowAddOrders`, nurses → `allowPerformOrders`).
- [ ] **Step 2:** Verify type-check + lint + the existing `WardDoctorOrdersSection` Vitest suite still green.

---

### Task 7: Timeline tab

**Files:**
- Create: `frontend/components/ward/care-session/tabs/TimelineTab.tsx`

**Interfaces:**
- Consumes: admission (notes/session dates), nursing orders feed, vitals/handover data already fetched by sibling tabs.

- [ ] **Step 1:** Build a chronological merged feed (orders, progress notes, admission event, discharge event) reusing the same relative-time / date formatters used in `WardDoctorOrdersSection` (`relativeTime`, `formatDisplayDateTime`). Group by day; each entry shows icon + title + author + timestamp.
- [ ] **Step 2:** Verify type-check + lint.

---

### Task 8: History tab (full parity)

**Files:**
- Create: `frontend/components/ward/care-session/tabs/HistoryTab.tsx`

**Interfaces:**
- Consumes: `PatientHistoryTabs` (consult-room config), the shared viewers listed in Task 8 state, `consultationService.resolveSessionForVisit`, `loadConsultationReportSession`, transformers (`transformApiRowToCompletedTest`, `transformApiRadiologyReportToCompleted`).

- [ ] **Step 1: Replicate `ConsultationRoomHistoryTab` config** — same props (`showVisits`, `showCertificates`, `showDocuments`, `showReferrals`, `showBackground`, `allowDocumentActions={false}`, `defaultTab="background"`, `onViewVisit` → `resolveSessionForVisit` → `onViewConsultation`), plus `historyReloadToken`.
- [ ] **Step 2: Wire the View handlers** to page-hosted shared viewers exactly as `frontend/app/medical-records/patients/[patientId]/page.tsx` does (`viewSessionDetails` → `ConsultationReportModal`, `VitalsDetailModal`, `LabCompletedReportDialog`, `RadiologyCompletedReportDialog`, `PrescriptionReportDialog`, `VisitDetailModal`, `EyeSessionReportDialog`, physio/ward/referral dialogs).
- [ ] **Step 3: Verify** type-check + lint.

---

### Task 9: Host shared viewers on the page + wire everything in `CareSessionTabs`

**Files:**
- Modify: `frontend/app/wards/admissions/[admissionId]/page.tsx`
- Create: `frontend/components/ward/care-session/CareSessionTabs.tsx`

- [ ] **Step 1:** `CareSessionTabs` mounts the tab-list (Overview | Activities | Orders | Instructions | Notes | Timeline | History) and renders each tab body by `activeTab`.
- [ ] **Step 2:** Host the shared detail viewers (report/lab/imaging/prescription/vitals/visit/eye/physio/ward/referral dialogs) at page level (mirroring the patient-record page's pattern) and pass their setters into `HistoryTab`.

---

### Task 10: Shrink existing modals to quick snapshot + "Open Session" link

**Files:**
- Modify: `frontend/app/consultation/wards/page.tsx` (modal ~:1014, tabs at ~:1094, `PatientHistoryTabs` at ~:1396)
- Modify: `frontend/app/nursing/wards/page.tsx` (modal at ~:1290)

- [ ] **Step 1:** Reduce the consultation wards modal to: header (patient/photo/status/ward/bed), clinical snapshot (diagnosis, complaint, latest instruction via `resolveWardHandoffInstructions`, escalation banner), quick facts, and an **Open Session →** button to `/wards/admissions/[admissionId]`. Remove the giant tab block + `PatientHistoryTabs` block from the modal.
- [ ] **Step 2:** Add navigation `const openCareSession = (id) => router.push(\`/wards/admissions/${id}\`)` and reuse the doctor-side quick actions (orders CTAs / discharge / transfer) already present.
- [ ] **Step 3:** Repeat for the nursing wards modal — keep the nurse-relevant quick actions (bed assignment, arrival, discharge confirm) and add the same **Open Session →** link.
- [ ] **Step 4:** Verify type-check + lint + both pages' vitest (if any) green.

---

### Task 11: Permissions wiring + docs-check

**Files:**
- Modify: `frontend/lib/page-permissions.ts` (add `/wards/admissions` entry for doctors + nurses module rows)
- Modify: `frontend/lib/capabilities.ts` (add `/wards/admissions` mapping)
- Modify: `frontend/lib/home-route.ts` (only if a ward doctor/nurse home should deep-link; otherwise skip)
- Modify: `backend/permissions/page_paths.py`, `page_catalog.py`, `capabilities.py`, `permission_actions.py`
- Verify: `backend/permissions/api_access.py` already maps `wards/` + `admissions/` prefixes → `/nursing/wards` + `/consultation/wards`.

- [ ] **Step 1:** Register `/wards/admissions` page id for the two roles (doctor ward rounds + nursing ward care) in frontend `page-permissions.ts` and `capabilities.ts`, mirroring the `ward_order_*` capability grants.
- [ ] **Step 2:** Add the page to backend catalogs so role permission resolution/audit knows it.
- [ ] **Step 3:** Run:
```bash
make docs-check
```
Expected: docs/permissions checks green.

---

### Task 12: Integration verification

- [ ] **Step 1:** Backend:
```bash
docker compose -f docker-compose.local.yml exec -T backend python manage.py test wards nursing
```
- [ ] **Step 2:** Frontend:
```bash
npm run type-check && npm run lint && npm run test -- --run
```
- [ ] **Step 3:** Manual QA checklist for the user: create an observation admission from a consultation room → open `/wards/admissions/<id>` → verify tabs, Orders parity (prescribe medication → Pharmacy, injection → procedures), Instructions lifecycle, History View buttons, Notes composer, and that the modal now shows the quick snapshot + Open Session link.

---

## Self-Review

- **Spec coverage:** all seven tabs (T3–T9), session linkage (T1–T2), modal shrink (T10), permissions (T11), verification (T12). Legacy `admission_instructions` read-only (T5). No new models aside from the FK.
- **Placeholder scan:** no TBDs; each task names exact files and interface signatures.
- **Type consistency:** `consultation_session` used identically as `number | null` in backend serialization and `PatientAdmission.consultation_session?: number | null`; resolver returns `ConsultationSession | null`.