# Facility Performance Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fabricated `clinicPerformance` dashboard data with a real, facility-keyed performance aggregation served by the existing single dashboard request, and render it as a "Facility Performance" card after "Today's Activity".

**Architecture:** Extend `build_operational_dashboard` (`backend/common/operational_dashboard.py`) to aggregate five metrics per `location_clinic_id` (the stable facility FK) and emit them as `facilityPerformance`. The frontend updates the `OperationalDashboardPayload` type and renders the new card. Scope propagation is unchanged (`resolve_facility_scope` → `scoped()` querysets → response).

**Tech Stack:** Django 4.2 + DRF; Next.js 16 App Router + React 18 + TypeScript; Vitest; Django `TestCase` with Docker Postgres.

## Global Constraints

- "Facility" = `organization.Clinic` (physical site). Group by `location_clinic_id`, never by facility name (names can collide/change).
- `completionRate` denominator = all visits in the scoped facility for the target date; numerator = visits with `status="completed"`.
- `avgConsultationTime` = mean `ended_at - started_at` (minutes) over `ConsultationSession` where `status="completed"` and `started_at` is the target date; `null` (not `0`) when no such sessions.
- `labTestsProcessed` = count of distinct `LabTest` where `processed_at__date = today` (results-entry event), grouped via `order__location_clinic_id`. Do NOT filter on current `status`.
- `prescriptionsDispensed` = `Prescription` where `status="dispensed"` and `dispensed_at__date = today`, grouped via `location_clinic_id`.
- Remove the keys `clinicPerformance`, `target`, `avgWait`, and `criticalAlerts` from the response.
- Scope behavior is unchanged: `resolve_facility_scope` → `clinic_scope` → `scoped(qs, field=...)`.
- No new API endpoint; the card rides the existing `/common/dashboard/operational` request and its 45s cache.

## File Map

- `backend/common/operational_dashboard.py` — real facility aggregation + `facilityPerformance` response key.
- `backend/common/tests/test_operational_dashboard.py` — backend regression tests (new file).
- `frontend/lib/services/dashboard-service.ts` — replace `clinicPerformance` type with `facilityPerformance`.
- `frontend/lib/services/dashboard-service.test.ts` — update fixture to the new shape.
- `frontend/app/dashboard/page.tsx` — render the "Facility Performance" card after "Today's Activity".

---

### Task 1: Real per-facility aggregation in `build_operational_dashboard`

**Files:**
- Modify: `backend/common/operational_dashboard.py:160-173` (the `clinic_counts`/`clinic_rows` block) and the response dict (`:221`)
- Modify: `backend/common/operational_dashboard.py:1-18` (imports)
- Test: `backend/common/tests/test_operational_dashboard.py` (create)

**Interfaces:**
- Produces: `build_operational_dashboard(target_date=None, *, clinic_scope=None)` returns a dict now containing
  `facilityPerformance: list[{"name": str, "visits": int, "completionRate": float, "avgConsultationTime": float | None, "labTestsProcessed": int, "prescriptionsDispensed": int}]`.
- Consumes: `clinic_scope` values as documented (`None`, `SCOPE_ALL`, or a `Clinic` instance); existing `scoped(qs, field=...)` inner helper; `resolve_facility_scope` is NOT touched.

- [ ] **Step 1: Write the failing tests**

Create `backend/common/tests/test_operational_dashboard.py`:

```python
"""Regression tests for the operational dashboard's facility performance card."""
from __future__ import annotations

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from common.mixins import SCOPE_ALL
from common.operational_dashboard import build_operational_dashboard
from consultation.models import ConsultationRoom, ConsultationSession
from laboratory.models import LabOrder, LabTest
from organization.models import Clinic
from patients.models import Patient, Visit
from pharmacy.models import Prescription

User = get_user_model()


class FacilityPerformanceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.fac_a = Clinic.objects.create(name="Facility A", code="A-01")
        self.fac_b = Clinic.objects.create(name="Facility B", code="B-01")
        self.room_a = ConsultationRoom.objects.create(
            name="Room A", room_number="A-ROOM-1", location_clinic=self.fac_a
        )
        self.room_b = ConsultationRoom.objects.create(
            name="Room B", room_number="B-ROOM-1", location_clinic=self.fac_b
        )
        self.pa = Patient.objects.create(
            patient_id="PERF-PT-A-01", surname="PerfA", first_name="A",
            gender="male", date_of_birth=date(1990, 1, 1),
        )
        self.pb = Patient.objects.create(
            patient_id="PERF-PT-B-01", surname="PerfB", first_name="B",
            gender="female", date_of_birth=date(1991, 2, 2),
        )
        self.today = timezone.localdate()

    def _visit(self, patient, clinic, status="completed"):
        return Visit.objects.create(
            patient=patient,
            visit_type="consultation",
            status=status,
            date=self.today,
            time="10:00",
            clinic="GOPD",
            location_clinic=clinic,
        )

    def _completed_session(self, patient, room, clinic, minutes=15):
        # started_at is auto_now_add, so it must be set via update() after create.
        started = timezone.now() - timedelta(minutes=minutes)
        session = ConsultationSession.objects.create(
            session_id=f"SESS-{patient.patient_id}-{room.room_number}",
            room=room,
            patient=patient,
            location_clinic=clinic,
            status="completed",
            ended_at=timezone.now(),
        )
        ConsultationSession.objects.filter(pk=session.pk).update(started_at=started)
        return session

    def _lab_order(self, patient, clinic):
        return LabOrder.objects.create(
            order_id=f"LAB-PERF-{patient.patient_id}",
            patient=patient,
            location_clinic=clinic,
        )

    def _lab_test(self, order, name):
        return LabTest.objects.create(
            order=order,
            name=name,
            code=name.upper()[:20],
            sample_type="Blood",
            status="verified",
            processed_at=timezone.now(),
        )

    def _rx(self, patient, clinic):
        return Prescription.objects.create(
            prescription_id=f"RX-PERF-{patient.patient_id}",
            patient=patient,
            location_clinic=clinic,
            status="dispensed",
            dispensed_at=timezone.now(),
        )

    def test_facility_performance_aggregates_per_facility(self):
        self._visit(self.pa, self.fac_a, status="completed")
        self._visit(self.pa, self.fac_a, status="in_progress")
        self._visit(self.pb, self.fac_b, status="completed")
        self._completed_session(self.pa, self.room_a, self.fac_a, minutes=30)
        self._lab_test(self._lab_order(self.pa, self.fac_a), "Glucose")
        self._rx(self.pa, self.fac_a)
        self._rx(self.pb, self.fac_b)

        data = build_operational_dashboard(self.today, clinic_scope=SCOPE_ALL)
        rows = {r["name"]: r for r in data["facilityPerformance"]}

        self.assertNotIn("clinicPerformance", data)
        self.assertNotIn("criticalAlerts", data)

        a = rows["Facility A"]
        self.assertEqual(a["visits"], 2)
        self.assertEqual(a["completionRate"], 50.0)
        self.assertEqual(a["avgConsultationTime"], 30.0)
        self.assertEqual(a["labTestsProcessed"], 1)
        self.assertEqual(a["prescriptionsDispensed"], 1)

        b = rows["Facility B"]
        self.assertEqual(b["visits"], 1)
        self.assertEqual(b["completionRate"], 100.0)
        self.assertEqual(b["avgConsultationTime"], None)
        self.assertEqual(b["labTestsProcessed"], 0)
        self.assertEqual(b["prescriptionsDispensed"], 1)

    def test_no_fake_target_or_avg_wait_keys(self):
        self._visit(self.pa, self.fac_a)
        data = build_operational_dashboard(self.today, clinic_scope=SCOPE_ALL)
        row = data["facilityPerformance"][0]
        self.assertNotIn("target", row)
        self.assertNotIn("avgWait", row)
        self.assertNotIn("patients", row)

    def test_scoped_user_sees_only_their_facility(self):
        self._visit(self.pa, self.fac_a)
        self._visit(self.pb, self.fac_b)

        data = build_operational_dashboard(self.today, clinic_scope=self.fac_a)
        names = [r["name"] for r in data["facilityPerformance"]]
        self.assertEqual(names, ["Facility A"])

    def test_avg_consultation_time_null_without_completed_sessions(self):
        self._visit(self.pa, self.fac_a)
        data = build_operational_dashboard(self.today, clinic_scope=self.fac_a)
        self.assertIsNone(data["facilityPerformance"][0]["avgConsultationTime"])

    def test_lab_processed_counts_event_not_current_status(self):
        # Test processed today but verified (status moved on) still counts once.
        order = self._lab_order(self.pa, self.fac_a)
        self._lab_test(order, "Glucose")
        data = build_operational_dashboard(self.today, clinic_scope=self.fac_a)
        self.assertEqual(data["facilityPerformance"][0]["labTestsProcessed"], 1)

    def test_completion_rate_denominator_is_visits(self):
        # Two visits, one completed -> 50%, even though there is a completed session.
        self._visit(self.pa, self.fac_a, status="completed")
        self._visit(self.pa, self.fac_a, status="in_progress")
        self._completed_session(self.pa, self.room_a, self.fac_a)
        data = build_operational_dashboard(self.today, clinic_scope=self.fac_a)
        self.assertEqual(data["facilityPerformance"][0]["completionRate"], 50.0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker exec emr-backend-local python manage.py test common.tests.test_operational_dashboard --keepdb`
Expected: `KeyError: 'facilityPerformance'` (the key doesn't exist yet).

- [ ] **Step 3: Update imports**

In `backend/common/operational_dashboard.py`, change the Django models import:

```python
from django.db.models import Avg, Count, F, Q
```

and add a Clinic import (`organization.models` is not currently imported):

```python
from organization.models import Clinic
```

Keep the existing `ConsultationSession`, `LabTest`, `Prescription`, `Visit` imports unchanged.

- [ ] **Step 4: Replace the aggregation block**

Replace the current `clinic_counts`/`clinic_rows` block (lines ~160-173) with:

```python
        # ---- Facility performance -------------------------------------------------
        # Aggregate every domain keyed by the stable facility FK (location_clinic_id),
        # never by facility name. Names are resolved once and joined by ID.
        visit_rows = visits_today_qs.values("location_clinic_id").annotate(
            visits=Count("id"),
            completed=Count("id", filter=Q(status="completed")),
        )

        session_agg = (
            scoped(
                ConsultationSession.objects.filter(
                    status="completed",
                    started_at__date=today,
                    ended_at__isnull=False,
                )
            )
            .values("location_clinic_id")
            .annotate(avg_dur=Avg(F("ended_at") - F("started_at")))
        )
        session_minutes = {
            row["location_clinic_id"]: (
                round(row["avg_dur"].total_seconds() / 60, 1)
                if row["avg_dur"] is not None
                else None
            )
            for row in session_agg
        }

        lab_rows = (
            scoped(
                LabTest.objects.filter(processed_at__date=today),
                field="order__location_clinic_id",
            )
            .values("order__location_clinic_id")
            .annotate(n=Count("id", distinct=True))
        )
        lab_counts = {
            row["order__location_clinic_id"]: row["n"] for row in lab_rows
        }

        rx_rows = scoped(
            Prescription.objects.filter(
                status="dispensed",
                dispensed_at__date=today,
            )
        ).values("location_clinic_id").annotate(n=Count("id"))
        rx_counts = {row["location_clinic_id"]: row["n"] for row in rx_rows}

        facility_ids = (
            {row["location_clinic_id"] for row in visit_rows if row["location_clinic_id"]}
            | set(session_minutes)
            | set(lab_counts)
            | set(rx_counts)
        )
        name_map = dict(
            Clinic.objects.filter(id__in=facility_ids).values_list("id", "name")
        )

        facility_rows = []
        for fid in sorted(facility_ids):
            visit_row = next((r for r in visit_rows if r["location_clinic_id"] == fid), None)
            visits = visit_row["visits"] if visit_row else 0
            completed = visit_row["completed"] if visit_row else 0
            facility_rows.append(
                {
                    "name": (name_map.get(fid) or "Unassigned").strip() or "Unassigned",
                    "visits": visits,
                    "completionRate": round((completed / visits) * 100, 1) if visits else 0.0,
                    "avgConsultationTime": session_minutes.get(fid),
                    "labTestsProcessed": lab_counts.get(fid, 0),
                    "prescriptionsDispensed": rx_counts.get(fid, 0),
                }
            )
        facility_rows.sort(key=lambda r: -r["visits"])
```

- [ ] **Step 5: Update the response dict**

In the `return` block, replace:

```python
            "recentPatients": recent_patients,
            "clinicPerformance": clinic_rows,
            "upcomingAppointments": upcoming_rows,
```

with:

```python
            "recentPatients": recent_patients,
            "facilityPerformance": facility_rows,
            "upcomingAppointments": upcoming_rows,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker exec emr-backend-local python manage.py test common.tests.test_operational_dashboard --keepdb`
Expected: 6 tests pass.

- [ ] **Step 7: Run the full common suite**

Run: `docker exec emr-backend-local python manage.py test common --keepdb`
Expected: all prior common tests (17) + new tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/common/operational_dashboard.py backend/common/tests/test_operational_dashboard.py
git commit -m "feat: real per-facility performance in operational dashboard"
```

---

### Task 2: Update the frontend dashboard service type and fixture

**Files:**
- Modify: `frontend/lib/services/dashboard-service.ts:39-45`
- Test: `frontend/lib/services/dashboard-service.test.ts:10-40`

**Interfaces:**
- Consumes: the backend `facilityPerformance` array shape from Task 1.
- Produces: `OperationalDashboardPayload.facilityPerformance` typed as
  `Array<{ name: string; visits: number; completionRate: number; avgConsultationTime: number | null; labTestsProcessed: number; prescriptionsDispensed: number }>`.
  Also removes `clinicPerformance` and `criticalAlerts` from the type.

- [ ] **Step 1: Write the failing test**

Update the fixture in `frontend/lib/services/dashboard-service.test.ts`. Replace the payload block:

```ts
        recentPatients: [],
        criticalAlerts: [],
        clinicPerformance: [],
        upcomingAppointments: [],
```

with:

```ts
        recentPatients: [],
        facilityPerformance: [],
        upcomingAppointments: [],
```

Then add a new assertion inside the first `it` block, after the existing `todayStats` assertion:

```ts
      expect(Array.isArray(res.facilityPerformance)).toBe(true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/services/dashboard-service.test.ts`
Expected: TypeScript error — `facilityPerformance` does not exist on `OperationalDashboardPayload` (or on `typeof res`).

- [ ] **Step 3: Update the type**

In `frontend/lib/services/dashboard-service.ts`, replace:

```ts
  criticalAlerts: Array<{ type: string; message: string; time: string }>;
  clinicPerformance: Array<{
    name: string;
    patients: number;
    target: number;
    avgWait: number;
  }>;
  upcomingAppointments: Array<{
```

with:

```ts
  facilityPerformance: Array<{
    name: string;
    visits: number;
    completionRate: number;
    avgConsultationTime: number | null;
    labTestsProcessed: number;
    prescriptionsDispensed: number;
  }>;
  upcomingAppointments: Array<{
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/services/dashboard-service.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/services/dashboard-service.ts frontend/lib/services/dashboard-service.test.ts
git commit -m "feat: type facility performance payload in dashboard service"
```

---

### Task 3: Render the Facility Performance card

**Files:**
- Modify: `frontend/app/dashboard/page.tsx:49-60` (state), `:79-110` (load data), `:208` (insert card between "Today's Activity" and "Recent Patients")

**Interfaces:**
- Consumes: `OperationalDashboardPayload.facilityPerformance` from Task 2, existing `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` shadcn components, and lucide icons already imported (`TestTube`, `Pill`, `Stethoscope`, `Users`).
- Produces: a self-contained "Facility Performance" card reading only local state; no new imports required beyond what the file already has.

- [ ] **Step 1: Write the failing test**

There is no existing test rendering `frontend/app/dashboard/page.tsx` (it is a full page with auth/useRouter/useCurrentUser). Rather than scaffold a heavy page test, add a focused unit test for a small pure render helper that the card will use. Create `frontend/app/dashboard/facility-performance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatFacilityMetric } from './facility-performance';

describe('formatFacilityMetric', () => {
  it('renders minutes, hiding null as an em dash', () => {
    expect(formatFacilityMetric(null)).toBe('—');
    expect(formatFacilityMetric(30.0)).toBe('30.0 min');
    expect(formatFacilityMetric(0)).toBe('0.0 min');
  });

  it('renders completion rate as a percentage', () => {
    expect(formatFacilityMetric(50.0, 'percent')).toBe('50.0%');
    expect(formatFacilityMetric(0, 'percent')).toBe('0%');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/dashboard/facility-performance.test.ts`
Expected: `Cannot find module './facility-performance'`.

- [ ] **Step 3: Create the helper**

Create `frontend/app/dashboard/facility-performance.ts`:

```ts
export type FacilityMetricKind = 'minutes' | 'percent';

export function formatFacilityMetric(
  value: number | null,
  kind: FacilityMetricKind = 'minutes',
): string {
  if (value === null) return '—';
  if (kind === 'percent') {
    return value === 0 ? '0%' : `${value}%`;
  }
  return `${value} min`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/facility-performance.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Add state and load the data**

In `frontend/app/dashboard/page.tsx`, add state after `recentPatients`:

```tsx
  const [facilityPerformance, setFacilityPerformance] = useState<OperationalDashboardPayload['facilityPerformance']>([]);
```

Ensure the type import is present at the top of the file (add it with the existing service import):

```tsx
import { getOperationalDashboard, type OperationalDashboardPayload } from '@/lib/services/dashboard-service';
```

In `loadDashboardData`, after `setUpcomingAppointments(data.upcomingAppointments);`, add:

```tsx
      setFacilityPerformance(data.facilityPerformance);
```

- [ ] **Step 6: Render the card**

Insert immediately after the closing `</Card>` of "Today's Activity" (currently line ~206) and before the `{/* Recent Patients */}` comment:

```tsx
        {/* Facility Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-indigo-500" />Facility Performance</CardTitle>
            <CardDescription>How each facility performed today</CardDescription>
          </CardHeader>
          <CardContent>
            {facilityPerformance.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No data for this period</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {facilityPerformance.map((f) => (
                  <div key={f.name} className="p-3 rounded-lg bg-muted/50">
                    <p className="font-medium text-sm mb-2">{f.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Visits</p>
                        <p className="text-lg font-bold">{f.visits}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Completion</p>
                        <p className="text-lg font-bold">{formatFacilityMetric(f.completionRate, 'percent')}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg consult</p>
                        <p className="text-lg font-bold">{formatFacilityMetric(f.avgConsultationTime)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Lab / Rx</p>
                        <p className="text-lg font-bold">{f.labTestsProcessed} / {f.prescriptionsDispensed}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
```

- [ ] **Step 7: Add the import for the helper**

In `frontend/app/dashboard/page.tsx`, add at the top (near the other local imports):

```tsx
import { formatFacilityMetric } from './facility-performance';
```

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 9: Run all frontend tests**

Run: `npx vitest run`
Expected: all tests pass (including the new `facility-performance` and updated `dashboard-service` suites).

- [ ] **Step 10: Commit**

```bash
git add frontend/app/dashboard/page.tsx frontend/app/dashboard/facility-performance.ts frontend/app/dashboard/facility-performance.test.ts
git commit -m "feat: render facility performance card on dashboard"
```

---

### Task 4: End-to-end verification

**Files:**
- None (verification only)

- [ ] **Step 1: Backend full test pass**

Run: `docker exec emr-backend-local python manage.py test common --keepdb`
Expected: all common tests pass.

- [ ] **Step 2: Frontend full test pass**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Live API check (dev DB)**

Run inside the backend container:

```python
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
admin = get_user_model().objects.filter(is_superuser=True).first()
c = APIClient(); c.force_authenticate(user=admin)
r = c.get('/common/dashboard/operational/', HTTP_HOST='localhost')
print(r.status_code)
print([ (x['name'], x['visits'], x['completionRate'], x['avgConsultationTime'], x['labTestsProcessed'], x['prescriptionsDispensed']) for x in r.data.get('facilityPerformance', []) ])
```

Run as: `docker exec emr-backend-local python manage.py shell -c "<above>"`
Expected: `200` and a list of facility rows with numeric values; `clinicPerformance` and `criticalAlerts` absent.

- [ ] **Step 4: Docs check (only if page permissions/capabilities changed — they did not)**

The dashboard is not a permission-gated page change (no new pages/capabilities). Skip `make docs-check` unless the implementation altered permission paths.

## Self-Review Notes

- Spec coverage: all five metrics, grouping-by-ID, `null` avg, scope behavior, key removal, card placement, and empty state are covered by Tasks 1-4.
- `avgConsultationTime` uses `session_minutes.get(fid)` which returns `None` for facilities with no sessions — satisfies the null requirement.
- `labTestsProcessed` uses `processed_at__date=today` with `distinct=True` — an event metric, not a status snapshot.
- Type consistency: `facilityPerformance` shape is identical across backend payload, `dashboard-service.ts`, and the card render.
