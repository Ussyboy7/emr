# Facility Performance Card — Design

**Date:** 2026-08-12
**Status:** Approved

## Problem

The operational dashboard payload (`backend/common/operational_dashboard.py`) ships a
`clinicPerformance` array whose values are fabricated: `target = count * 1.2` and
`avgWait = 0`. The frontend never renders the field, so the work is both wrong and dead.

## Decision

Replace the fake aggregation with a real per-facility performance card, rendered on the
main dashboard immediately after "Today's Activity", and rename the payload key to the
accurate domain term.

## Terminology

- **Facility** = physical site (`organization.Clinic`, e.g. "Bode Thomas Clinic"). This is
  the security/operational boundary. The aggregation is grouped by `location_clinic_id`
  (the facility FK), NOT by OPD clinic type.
- **Clinic type** = `OutpatientClinicType` (GOPD, Eye, …). Not used here.

## API contract

Replace `clinicPerformance` with:

```json
"facilityPerformance": [
  {
    "name": "Bode Thomas Clinic",
    "visits": 42,
    "completionRate": 88.1,
    "avgConsultationTime": 15.4,
    "labTestsProcessed": 23,
    "prescriptionsDispensed": 17
  }
]
```

Field semantics:

| Field | Meaning | Nullable |
|---|---|---|
| `name` | Facility name (`location_clinic.name`), "Unassigned" if null | no |
| `visits` | All visits in the scoped facility for the target date | no |
| `completionRate` | `completed visits / all visits` × 100 (1 decimal), `0.0` if no visits | no |
| `avgConsultationTime` | Mean `ended_at - started_at` (minutes) over completed `ConsultationSession`s scoped to the facility **today**; `null` when there are no completed sessions (0 would wrongly imply zero-duration consultations) | yes |
| `labTestsProcessed` | Count of distinct `LabTest`s whose results were entered today, i.e. `processed_at__date = today`, grouped via `order__location_clinic_id`. `processed_at` is the results-entry timestamp (set when results are submitted; not `created_at`, not `verified_at`). This is an event metric — "results processed today" — not a current-status snapshot. | no |
| `prescriptionsDispensed` | Count of `Prescription`s dispensed (`status="dispensed"`, `dispensed_at` on target date), grouped via `location_clinic_id` | no |

Grouping is keyed by the stable `location_clinic_id` across all four domains. Facility
names are resolved once from `organization.Clinic` and joined by ID — never joined across
independently aggregated results by name (names can collide or change).

## Scope behavior (unchanged)

```
request
  → resolve_facility_scope(request)
  → build_operational_dashboard(..., clinic_scope=clinic_scope)
  → scoped(querysets)
  → facilityPerformance
```

- Scoped facility user → their facility only (one row).
- Unrestricted / leadership → all facilities (one row per facility, sorted by `visits` desc).
- Uses the existing `scoped(qs, field=...)` helper and the existing 45s cache; the card is
  served by the single dashboard request — no new API call.

## Implementation

### Backend — `backend/common/operational_dashboard.py`

1. In `_build()`, after the existing per-facility visit counts, replace the
   `clinic_counts`/`clinic_rows` block (currently `patients`, `target`, `avgWait`) with a
   facility-keyed aggregation:
   - `visits` per facility: group `visits_today_qs` by `location_clinic_id` (already done).
   - `completionRate`: group by `location_clinic_id` with
     `Count("id", filter=Q(status="completed"))` over the same scoped today queryset.
   - `avgConsultationTime`: group completed sessions scoped to facility for today by
     `location_clinic_id`; compute mean `ended_at - started_at` per group (guard nulls).
   - `labTestsProcessed`: count distinct `LabTest` ids where
     `processed_at__date = today`, grouped by `order__location_clinic_id`. Do NOT filter
     on current `status` — status transitions (`results_ready` → `verified`) make a
     status snapshot misrepresent "processed today".
   - `prescriptionsDispensed`: `Prescription` grouped by `location_clinic_id`, filter
     `status="dispensed"` and `dispensed_at__date = today`.
2. Merge all domains by `location_clinic_id`; fall back to `"Unassigned"` when the FK is
   null. Sort by `visits` desc. Return rows as `facilityPerformance`.
3. Remove the `clinicPerformance` key from the response.

### Frontend

- `frontend/lib/services/dashboard-service.ts`:
  - Remove `clinicPerformance` from `OperationalDashboardPayload`.
  - Add `facilityPerformance` with the new shape (`name`, `visits`, `completionRate`,
    `avgConsultationTime: number | null`, `labTestsProcessed`, `prescriptionsDispensed`).
- `frontend/app/dashboard/page.tsx`:
  - Add a "Facility Performance" card immediately after the "Today's Activity" card.
  - Render a row per facility: name, visits, completion rate (%), avg consultation time
    (minutes, `—` when null), lab tests processed, prescriptions dispensed.
  - Guard empty state (no facilities / no data) with a muted "No data for this period"
    message; the card may still render with empty rows.

### Tests

- Backend `backend/common/tests/`:
  - Facility aggregation respects `clinic_scope` (scoped user sees one facility, SCOPE_ALL
    sees all).
  - `completionRate` = completed/all (denominator is all visits, not sessions).
  - `avgConsultationTime` is `null` with no completed sessions, and correct mean with data.
  - `labTestsProcessed` counts by `processed_at` date, not by current status (a test moved
    from `results_ready` to `verified` still counts once via its `processed_at`).
  - Grouping is by facility ID (two facilities, same row join integrity).
  - No `target` / `avgWait` / `clinicPerformance` keys present.
- Frontend: update `dashboard-service.test.ts` fixture to the new shape.

## Explicitly out of scope

- No wait-time metric (arrival→consultation-start is not reliably reconstructable from
  today's data; the card uses "Avg consultation time", never labeled as wait).
- No date-range controls or `/dashboard/performance` detail page.
- No targets column (no real target source; the fake `count * 1.2` is removed).
