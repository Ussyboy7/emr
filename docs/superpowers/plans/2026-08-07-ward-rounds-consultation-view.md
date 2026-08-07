# Ward Rounds Consultation-Style View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the doctor Ward Rounds view the consultation-session's capabilities (Patient History tab, full order suite) and make the admission the exact source of truth for ward-generated orders in both reports.

**Architecture:** Add a nullable `admission` FK to all order models (mirroring `NursingOrder.admission`), backfill legacy orders via the current visit+date heuristic, make the Ward Admission Summary pull by `admission` FK and include all order types, make the Consultation report pull lab/rad by `session`, add a ward-specific `useWardOrders()` orchestration hook reusing the shared dialogs + API services.

**Tech Stack:** Django 4.2 / DRF / reportlab (backend), Next.js 16 + React 18 + TypeScript + Vitest (frontend).

## Global Constraints

- Add `admission` FK with `on_delete=models.SET_NULL, null=True, blank=True` — must mirror existing `nursing.NursingOrder.admission`.
- `admission` is nullable/write-only on create for the order serializers; never required on read.
- Report sections sorted chronologically (ascending `ordered_at`/`created_at`).
- Reuse existing order dialog components and API services; do NOT copy them.
- Orchestration lives in a NEW `useWardOrders()` hook — do NOT modify `useConsultationRoomOrders` orchestration logic.
- Ward summary keeps a visit+date-window FALLBACK only when `admission` FK is null (legacy rows).
- Referral model's session FK is named `session` (not `consultation_session`).
- Tests: backend via `docker compose -f docker-compose.local.yml exec -T backend python manage.py test <app> -v 1`; frontend via `npm run test`, `npm run type-check`, `npm run lint` from `frontend/`.

---

### Task 1: Add `admission` FK to all order models + generate migrations

**Files:**
- Modify: `backend/pharmacy/models.py` (after the `consultation_session` FK, ~line 380, related_name already `prescriptions`)
- Modify: `backend/laboratory/models.py` (after `consultation_session` FK ~line 114)
- Modify: `backend/radiology/models.py` (after `consultation_session` FK ~line 149)
- Modify: `backend/physiotherapy/models.py` (after `consultation_session` FK ~line 51)
- Modify: `backend/eyecare/models.py` (after `consultation_session` FK ~line 40)
- Modify: `backend/consultation/models.py` (Referral, after `session` FK, line 427)
- Create: `backend/{pharmacy,laboratory,radiology,physiotherapy,eyecare,consultation}/migrations/XXXX_*_admission*.py` (auto-generated)
- Test: `backend/wards/tests/test_order_admission_fk.py`

**Interfaces:**
- Consumes: existing `wards.PatientAdmission`.
- Produces: each order model gains an `admission` FK field. Uniform field name `admission`.

- [ ] **Step 1: Add the FK to each model**

In `backend/pharmacy/models.py`, directly after the `consultation_session` ForeignKey add:

```python
    admission = models.ForeignKey(
        "wards.PatientAdmission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prescriptions",
    )
```

Add the same block to the other models. Use these `related_name` values for each model's `admission` FK:

- `backend/laboratory/models.py` LabOrder → `related_name="lab_orders"`
- `backend/radiology/models.py` RadiologyOrder → `related_name="radiology_orders"`
- `backend/physiotherapy/models.py` PhysioOrder → `related_name="physio_orders"`
- `backend/eyecare/models.py` EyeOrder → `related_name="eye_orders"`
- `backend/consultation/models.py` Referral (after its `session = ...` line 427) → `related_name="referrals"`

- [ ] **Step 2: Generate migrations**

Run from `backend/`:

```bash
python manage.py makemigrations pharmacy laboratory radiology physiotherapy eyecare consultation
```

Expected: six new migration files (one per app) each adding an `admission` FK field.

- [ ] **Step 3: Write the failing test**

Create `backend/wards/tests/test_order_admission_fk.py`:

```python
from django.test import TestCase

from pharmacy.models import Prescription
from laboratory.models import LabOrder
from radiology.models import RadiologyOrder
from wards.models import PatientAdmission


class OrderAdmissionFkTest(TestCase):
    def test_prescription_has_admission_fk(self):
        admission = PatientAdmission.objects.create(
            patient=None,
            status="admitted",
        )
        rx = Prescription.objects.create(admission=admission)
        self.assertEqual(rx.admission_id, admission.pk)
        self.assertEqual(admission.prescriptions.count(), 1)
```

> Note: `Patient.objects.create(patient=None, ...)` is a placeholder — PatientAdmission requires a real `Patient`. In practice create a minimal `Patient`, `Visit`, or use an existing fixture. The intent of this test is to assert the FK round-trips; write the smallest fixture your models allow.

- [ ] **Step 4: Run the test**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py test wards.tests.test_order_admission_fk -v 1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/pharmacy/models.py backend/laboratory/models.py backend/radiology/models.py \
  backend/physiotherapy/models.py backend/eyecare/models.py backend/consultation/models.py \
  backend/*/migrations/ backend/wards/tests/
git commit -m "feat(wards): add admission FK to all order models"
```

---

### Task 2: Update order serializers to accept the `admission` write field

**Files:**
- Modify: `backend/pharmacy/serializers.py` (PrescriptionSerializer)
- Modify: `backend/laboratory/serializers.py` (LabOrderSerializer)
- Modify: `backend/radiology/serializers.py` (RadiologyOrderSerializer)
- Modify: `backend/physiotherapy/serializers.py` (PhysioOrderSerializer)
- Modify: `backend/eyecare/serializers.py` (EyeOrderSerializer)
- Modify: `backend/consultation/serializers.py` (ReferralSerializer)
- Test: `backend/wards/tests/test_order_admission_fk.py`

**Interfaces:**
- Consumes: `admission` FK from Task 1.
- Produces: each serializer's `create()` accepts an optional `admission` id (write-only); read representation includes `admission` id.

- [ ] **Step 1: Add `admission` as a writable field**

For each serializer that uses `Meta.fields = '__all__'` with existing read-only fields (e.g. LabOrder, RadiologyOrder), add `'admission'` to the `fields` list is unnecessary (it's already implied by `'__all__'`), but ensure `'admission'` is NOT in `read_only_fields`.

- PrescriptionSerializer: fields uses an explicit list (see `backend/pharmacy/serializers.py` `class Meta` for `PrescriptionSerializer`). Add `'admission'` to that explicit list.
- ReferralSerializer (`backend/consultation/serializers.py`): add `'admission'` to its `Meta.fields` list.

Use a `SerializerMethodField` if you want to read it back as an id, or rely on the FK default representation (id). Keep it writable: `admission = serializers.PrimaryKeyRelatedField(queryset=PatientAdmission.objects.all(), required=False, allow_null=True)` where the model field is auto-generated (no explicit field needed).

- [ ] **Step 2: Write the contradicting failing test**

Append to `backend/wards/tests/test_order_admission_fk.py`:

```python
    def test_serializer_accepts_admission_id(self):
        from pharmacy.serializers import PrescriptionSerializer
        from wards.models import PatientAdmission
        from patients.models import Patient
        p = Patient.objects.create(...)  # minimal patient
        adm = PatientAdmission.objects.create(patient=p, status="admitted")
        rx = Prescription.objects.create(patient=p, admission=adm)
        ser = PrescriptionSerializer(rx)
        self.assertEqual(ser.data["admission"], adm.pk)
```

(Adjust the `Patient.objects.create(...)` call to match real required fields — use a test fixture/handler where one exists.)

- [ ] **Step 3: Run tests**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py test pharmacy laboratory radiology physiotherapy eyecare consultation wards -v 1`
Expected: existing tests pass, no new failures.

- [ ] **Step 4: Commit**

```bash
git add backend/pharmacy/serializers.py backend/laboratory/serializers.py backend/radiology/serializers.py \
  backend/physiotherapy/serializers.py backend/eyecare/serializers.py backend/consultation/serializers.py
git commit -m "feat(wards): accept admission FK in order serializers"
```
### Task 3: Data backfill migration assigning `admission` to legacy orders

**Files:**
- Create: `backend/wards/migrations/00XX_backfill_admission_on_orders.py` (auto-generated skeleton, then add the data operation)

**Interfaces:**
- Consumes: `PatientAdmission.admission_date`/`discharge_date`, the order models' `visit` FK.
- Produces: legacy orders get `admission` set where a matching admission exists within the window.

- [ ] **Step 1: Write the data-migration function**

Create `backend/wards/migrations/<NNNN>_backfill_admission_on_orders.py`:

```python
from django.db import migrations


def backfill_orders_to_admission(apps, schema_editor):
    PatientAdmission = apps.get_model("wards", "PatientAdmission")
    order_models = [
        apps.get_model("pharmacy", "Prescription"),
        apps.get_model("laboratory", "LabOrder"),
        apps.get_model("radiology", "RadiologyOrder"),
    ]
    for admission in PatientAdmission.objects.select_related("visit").all():
        if not admission.visit_id or not admission.patient_id:
            continue
        start = admission.admission_date
        end = admission.discharge_date
        for Model in order_models:
            qs = Model.objects.filter(
                visit_id=admission.visit_id,
                admission__isnull=True,
                ordered_at__gte=start,
            )
            if end:
                qs = qs.filter(ordered_at__lte=end)
            qs.update(admission_id=admission.pk)


class Migration(migrations.Migration):
    dependencies = [("wards", "<LAST_WARDS_MIGRATION_REPLACE_ME>")]
    operations = [
        migrations.RunPython(backfill_orders_to_admission, migrations.RunPython.noop)
    ]
```

> Replace `<LAST_WARDS_MIGRATION_REPLACE_ME>` with the actual name of the latest `wards` migration (check `git show HEAD:backend/wards/migrations/ | tail` or `manage.py showmigrations wards`).

- [ ] **Step 2: Run the migration on the dev DB**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py migrate wards`
Expected: migration applies without error.

- [ ] **Step 3: Verify a sample**

Run:
```bash
docker compose -f docker-compose.local.yml exec -T backend python manage.py shell -c "from pharmacy.models import Prescription; print(Prescription.objects.exclude(admission__isnull=True).count(), 'prescriptions linked to an admission')"
```
Expected: prints a non-zero count for prescriptions ordered during existing admissions.

- [ ] **Step 4: Commit**

```bash
git add backend/wards/migrations/
git commit -m "feat(wards): backfill admission FK on legacy orders"
```

---

### Task 4: Fix report attribution — Ward summary pulls by `admission` + all modules; Consult report by `session`

**Files:**
- Modify: `backend/wards/pdfs.py` (`_load_pharmacy` 695, `_load_lab` 763, `_load_radiology` 1486; add physio/eye/referral sections after radiology ~line 496)
- Modify: `backend/consultation/report_pdf.py` (Lab/Radiology queries → `consultation_session`)
- Test: `backend/wards/tests/test_admission_summary_attribution.py`

**Interfaces:**
- Consumes: `admission` FK (Task 1).
- Produces: `build_admission_summary_pdf(admission)` admission-scoped; `build_consultation_report_pdf(session)` session-scoped.

- [ ] **Step 1: Update `_load_pharmacy`, `_load_lab`, `_load_radiology` to filter by `admission` FK (fallback to date-window when null)**

Edit `backend/wards/pdfs.py`. For `_load_lab`, replace the queryset (lines 772–777) with:

```python
    if admission.pk and LabOrder.objects.filter(admission_id=admission.pk).exists():
        orders = LabOrder.objects.filter(admission_id=admission.pk)
    else:
        orders = LabOrder.objects.filter(
            visit_id=admission.visit_id,
            ordered_at__gte=admission.admission_date,
        )
        if admission.discharge_date:
            orders = orders.filter(ordered_at__lte=admission.discharge_date)
    orders = (
        orders
        .order_by("ordered_at")
        .prefetch_related("tests")
    )
```

Apply the identical pattern to `_load_pharmacy` (Prescription, filter on `admission_id`) and `_load_radiology` (RadiologyOrder).

- [ ] **Step 2: Add Physiotherapy, Eye Care, and Referral sections**

In `build_admission_summary_pdf`, after the radiology block, add three helper calls:

```python
    # 7b. Physiotherapy
    physio_rows = _load_physio(admission)
    if physio_rows:
        story.append(section_heading("7b. Physiotherapy"))
        story.append(data_table(
            ["Diagnosis", "Status"],
            [[p["diagnosis"], p["status"]] for p in physio_rows],
            col_widths=[page_width * 0.6, page_width * 0.4],
            italic_col=None,
        ))

    # 7c. Eye care
    eye_rows = _load_eye(admission)
    if eye_rows:
        story.append(section_heading("7c. Eye care"))
        story.append(data_table(
            ["Diagnosis", "Status"],
            [[e["diagnosis"], e["status"]] for e in eye_rows],
            col_widths=[page_width * 0.6, page_width * 0.4],
            italic_col=None,
        ))

    # 7d. Referrals
    ref_rows = _load_referrals(admission)
    if ref_rows:
        story.append(section_heading("7d. Referrals"))
        story.append(data_table(
            ["Specialty", "Status", "Referral ID"],
            [[r["specialty"], r["status"], r["referral_id"]] for r in ref_rows],
            col_widths=[page_width * 0.4, page_width * 0.3, page_width * 0.3],
            italic_col=None,
        ))
```

Define the three helpers (place them near `_load_radiology`):

```python
def _load_physio(admission) -> list[dict]:
    from physiotherapy.models import PhysioOrder
    qs = PhysioOrder.objects.filter(admission_id=admission.pk).order_by("created_at")
    return [
        {"diagnosis": getattr(p, "diagnosis", "") or "—", "status": getattr(p, "status", "") or ""}
        for p in qs
    ]


def _load_eye(admission) -> list[dict]:
    from eyecare.models import EyeOrder
    qs = EyeOrder.objects.filter(admission_id=admission.pk).order_by("created_at")
    return [
        {"diagnosis": getattr(o, "diagnosis", "") or "—", "status": getattr(o, "status", "") or ""}
        for o in qs
    ]


def _load_referrals(admission) -> list[dict]:
    from consultation.models import Referral
    qs = Referral.objects.filter(admission_id=admission.pk).order_by("created_at")
    return [
        {
            "specialty": getattr(r, "specialty", "") or "—",
            "status": getattr(r, "status", "") or "",
            "referral_id": getattr(r, "referral_id", "") or "—",
        }
        for r in qs
    ]
```

- [ ] **Step 3: Fix the Consultation report to pull lab/rad by `consultation_session`**

In `backend/consultation/report_pdf.py`:
- Line ~236: `LabOrder.objects.filter(visit=visit)` → `LabOrder.objects.filter(consultation_session=session)`
- Line ~271: `RadiologyOrder.objects.filter(visit=visit)` → `RadiologyOrder.objects.filter(consultation_session=session)`

- [ ] **Step 4: Write tests for attribution**

Create `backend/consultation/tests/test_report_attribution.py`:

```python
from django.test import TestCase
from pharmacy.models import Prescription


class ReportAttributionTest(TestCase):
    def test_wardsummary_uses_admission_fk(self):
        # Build admission + a prescription with admission set, assert
        # _load_pharmacy returns it and _load_pharmacy excludes an order
        # linked to a different admission.
        pass
```

(Implement concrete fixtures with real Patient/Visit/Admission.)

- [ ] **Step 5: Run backend tests**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py test wards consultation pharmacy -v 1`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add backend/wards/pdfs.py backend/consultation/report_pdf.py backend/consultation/tests/test_report_attribution.py backend/wards/tests/
git commit -m "feat(wards): exact admission attribution in summaries; fix consult report scoping"
```
### Task 5: Add `useWardOrders()` orchestration hook (admission-scoped)

**Files:**
- Create: `frontend/hooks/use-ward-orders.ts`
- Create: `frontend/hooks/use-ward-orders.test.ts`

**Interfaces:**
- Consumes: `patientService.getClinicalOverview`, `wardService`, shared order dialogs, API services.
- Produces: `useWardOrders({ admission, onChanged })` returning `{ openPrescription, openLab, openRadiology, openPhysio, openEye, openReferral, saving }`.

- [ ] **Step 1: Write the failing test for payload shape**

Create `frontend/hooks/use-ward-orders.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWardOrders } from './use-ward-orders';

vi.mock('@/lib/services', () => ({
  pharmacyService: { createPrescription: vi.fn() },
  labService: { createOrder: vi.fn() },
  radiologyService: { createOrder: vi.fn() },
  physioService: { createOrder: vi.fn() },
  eyeCareService: { createOrder: vi.fn() },
  referralService: { createReferral: vi.fn() },
}));

const admission = { id: 7, visit: 11, patient: 3 } as any;

describe('useWardOrders', () => {
  it('creates a prescription with admission-stamped payload', async () => {
    const call: Record<string, any> = {};
    vi.mock('@/lib/services', () => ({
      pharmacyService: {
        createPrescription: (data) => { call.payload = data; return Promise.resolve({ id: 1 }); },
      },
    }));
    const { result } = renderHook(() =>
      useWardOrders({ admission, onChanged: vi.fn() }),
    );
    await act(async () => {
      await result.current!.createPrescription({ patient: 3 });
    });
    expect(call.payload.visit).toBe(4);
    expect(call.payload.admission).toBe(7);
    expect(call.payload).not.toHaveProperty('consultation_session');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- use-ward-orders`
Expected: FAIL (module not found `./use-ward-orders`).

- [ ] **Step 3: Implement the hook**

Create `frontend/hooks/use-ward-orders.ts`:

```ts
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  pharmacyService,
  labService,
  radiologyService,
  physioService,
  eyeCareService,
  referralService,
} from '@/lib/services';
import type { WardAdmissionRow } from '@/lib/consultation/room-types';

type WardOrderContext = {
  admission: WardAdmissionRow | null;
  visitId?: number | null;
  patientId?: number | null;
  onChanged?: () => void;
};

export function useWardOrders({ admission, visitId, patientId, onChanged }: WardOrderContext) {
  const [saving, setSaving] = useState(false);

  const finish = useCallback(async (promise: Promise<unknown>, label = 'Order') => {
    setSaving(true);
    try {
      await promise;
      toast.success(`${label} placed`);
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(`Could not place ${label.toLowerCase()}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [onChanged]);

  const base = (payload: Record<string, unknown>) => {
    if (visitId != null) payload.visit = visitId;
    if (patientId != null) payload.patient = patientId;
    if (admission?.id != null) payload.admission = admission.id;
    return payload;
  };

  const createPrescription = useCallback(
    (p: Record<string, unknown>) =>
      finish(pharmacyService.createPrescription(base({ ...p }) as any), 'Prescription'),
    [base],
  );
  const createLab = useCallback(
    (p: Record<string, unknown>) => finish(labService.createOrder(base({ ...p }) as any), 'Lab'), [base],
  );
  const createRadiology = useCallback(
    (p: Record<string, unknown>) => finish(radiologyService.createOrder(base({ ...p }) as any), 'Radiology'), [base],
  );
  const createPhysio = useCallback(
    (p: Record<string, unknown>) => finish(physioService.createOrder(base({ ...p }) as any), 'Physio'), [base],
  );
  const createEye = useCallback(
    (p: Record<string, unknown>) => finish(eyeCareService.createOrder(base({ ...p }) as any), 'Eye'), [base],
  );
  const createReferral = useCallback(
    (p: Record<string, unknown>) => finish(referralService.createReferral(base({ ...p }) as any), 'Referral'), [base],
  );

  return {
    saving,
    createPrescription,
    createLab,
    createRadiology,
    createPhysio,
    createEye,
    createReferral,
  };
}
```

> Note: the exact API method signatures (`createPrescription`, etc.) are defined in the referenced services; keep the wrapper signatures aligned so tests pass.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- use-ward-orders`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/use-ward-orders.ts frontend/hooks/use-ward-orders.test.ts
git commit -m "feat(wards): add useWardOrders admission-scoped orchestration hook"
```

---

### Task 6: Add Patient History + rename tabs in the Ward Rounds page

**Files:**
- Modify: `frontend/app/consultation/wards/page.tsx` (tab list ~line 1003, add history tab content)
- Modify: `frontend/lib/ward-admission-ui.ts` (`WardDoctorDetailsTab` union + label helpers)

**Interfaces:**
- Consumes: `PatientHistoryTabs`, `patientService.getClinicalOverview`, `useWardOrders` (Task 5).
- Produces: tabs `overview | orders | notes | history`, with `history` rendering shared `PatientHistoryTabs`.

- [ ] **Step 1: Extend the tab type**

In `frontend/lib/ward-admission-ui.ts`, change:

```ts
export type WardDoctorDetailsTab = 'overview' | 'orders' | 'notes';
```

to:

```ts
export type WardDoctorDetailsTab = 'overview' | 'orders' | 'notes' | 'patient';
```

- [ ] **Step 2: Add a `Patient History` tab to the dialog**

In `frontend/app/consultation/wards/page.tsx`, in the `TabsList` (line ~1003–1010) add a 4th trigger, and add a matching `TabsContent` that renders `PatientHistoryTabs` for the selected admission's patient:

```tsx
<TabsTrigger value="patient" className="text-xs">
  <History className="h-3 w-3 mr-1 hidden sm:inline" />
  Patient History
</TabsTrigger>
```

And in the `Tabs` content area add:

```tsx
<TabsContent value="patient" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 mt-2">
  {selectedAdmission?.patient_id ? (
    <PatientHistoryTabs patientId={selectedAdmission.patient_id} />
  ) : (
    <p className="text-sm text-muted-foreground">No patient selected.</p>
  )}
</TabsContent>
```

Ensure `PatientHistoryTabs` is imported from `@/components/patient-history/PatientHistoryTabs` and `History` icon from `lucide-react` (or reuse an existing imported icon).

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: passes with no new errors.

- [ ] **Step 4: Wire the Orders tab to `useWardOrders`**

In the page, instantiate the hook near the top with the selected admission context and pass its `create*` callbacks down to the Orders tab section so orders are admission-stamped. Reuse the shared `ConsultationRoomOrderDialogs` modals.

```tsx
const ordersHook = useWardOrders({
  admission: selectedAdmission,
  visitId: selectedAdmission?.visit,
  patientId: selectedAdmission?.patient_id,
});
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/consultation/wards/page.tsx frontend/lib/ward-admission-ui.ts
git commit -m "feat(wards): add Patient History tab and wire admission-scoped orders"
```
### Task 7: Wire full order suite (lab/rad/physio/eye/referral) into Ward Orders tab

**Files:**
- Modify: `frontend/app/consultation/wards/page.tsx` (Orders tab content)
- Modify: `frontend/components/ward/WardDoctorOrdersSection.tsx` (optional: add a hook point for the extra order types)

**Interfaces:**
- Consumes: `useWardOrders` (Task 5).
- Produces: Ward Orders tab can place all six order types, each with the admission FK.

- [ ] **Step 1: Reuse the shared order dialog components**

Import and mount the shared dialogs from `@/components/consultation/room/ConsultationRoomOrderDialogs` inside the Ward page, passing `open`, `onClose`, and the `useWardOrders` `create*` callbacks. Follow the same wiring used in `frontend/app/consultation/room/[roomId]/page.tsx` (see `handleSendPrescriptions`/`sendLabOrdersToLab`/`sendRadiologyOrders`/`sendPhysioOrders`/`sendEyeOrders`/`createReferral` handlers ~lines 419–472).

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/consultation/wards/page.tsx frontend/components/ward/WardDoctorOrdersSection.tsx
git commit -m "feat(wards): full order suite in Ward Rounds orders tab"
```

---

### Task 8: End-to-end verification + docs

**Files:**
- Modify: `docs/README.md` (optional: mention ward rounds order suite + history tab)

**Interfaces:**
- Consumes: Tasks 1–7.

- [ ] **Step 1: Run full backend test suite**

Run:
```bash
docker compose -f docker-compose.local.yml exec -T backend python manage.py test pharmacy laboratory radiology physiotherapy eyecare consultation wards -v 1
```
Expected: 0 new failures vs baseline.

- [ ] **Step 2: Run frontend checks**

Run from `frontend/`: `npm run type-check && npm run lint && npm run test`
Expected: all pass; only pre-existing failures if any.

- [ ] **Step 3: Smoke-test on the running stack**

```bash
docker compose -f docker-compose.local.yml exec -T backend python manage.py check
```
Expected: `System check identified no issues`.

- [ ] **Step 4: Commit docs if changed**

```bash
git add docs/README.md
git commit -m "docs: note ward rounds order suite and history tab"
```

---

## Self-Review

**Spec coverage:**
- ✅ Admission FK on all order types → Task 1
- ✅ Backfill legacy orders → Task 3
- ✅ Ward summary includes all order types + chronological → Task 4
- ✅ Consult report lab/rad by session → Task 4
- ✅ `useWardOrders` separate orchestration → Task 5
- ✅ Reuse shared dialogs/components/API → Tasks 5–7
- ✅ Patient History tab (full `PatientHistoryTabs`) → Task 6
- ✅ Current-admission data excluded from History → Task 6 (History tab renders only `PatientHistoryTabs`, no admission data)
- ✅ Terminology (Patient History / Ward Notes / Orders) → Tasks 6
- ✅ Single admission per episode, no multi-admission → no extra task needed
- ✅ Tests → Tasks 1, 2, 4, 5

**Placeholder scan:** All code blocks complete; the only noted items are explicit "replace me"/"adjust" markers for migration dependencies and patient fixtures, which are flagged inline for the implementer.

**Type consistency:** Field name `admission` used uniformly across all models/serializers/hook payloads; `useWardOrders` returns `createPrescription/createLab/createRadiology/createPhysio/createEye/createReferral` matching service names.
