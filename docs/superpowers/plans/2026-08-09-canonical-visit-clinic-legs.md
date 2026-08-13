# Canonical Visit Clinic Legs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `Visit.clinics` and `Visit.completed_clinics` the canonical multi-clinic workflow state, expose correct clinic filtering in Manage Visits, and provide a visit-level report that remains useful when specialty legs complete before consultation.

**Architecture:** Keep `visit_type` descriptive and `location_clinic` facility-scoped. Add one idempotent, transaction-safe clinic-leg completion helper used by consultation, physiotherapy, eye care, laboratory, and radiology terminal actions. Keep module-specific reports intact and add a visit summary endpoint/action that aggregates reports by visit.

**Tech Stack:** Django 4.2, Django REST Framework, PostgreSQL, Next.js, React, TypeScript, Vitest.

## Global Constraints

- Do not derive clinic-leg completion from `visit_type`.
- Do not use `Visit.clinic` as the only source for multi-clinic filtering; include `Visit.clinics`.
- Do not automatically close another clinic's queue or session when one clinic completes.
- Preserve facility scoping through `location_clinic`.
- Use the existing `apiFetch`, service, serializer, and React patterns.

### Task 1: Canonical Clinic-Leg Completion Service

**Files:**
- Modify: `backend/patients/nursing_leg_status.py`
- Test: `backend/patients/tests/test_nursing_leg_status.py`

- [ ] Add failing tests for idempotent completion, alias normalization, partial visits, and final-leg completion.
- [ ] Run the focused tests and confirm they fail before implementation.
- [ ] Add `complete_visit_clinic_leg(visit, clinic, *, completed_at=None)` using `select_for_update`, normalized clinic matching, idempotent `completed_clinics`, and `apply_visit_completion_after_leg`.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Route Clinical Modules Through the Canonical Service

**Files:**
- Modify: `backend/consultation/session_completion.py`
- Modify: `backend/physiotherapy/viewsets.py`
- Modify: `backend/eyecare/viewsets.py`
- Modify: laboratory and radiology terminal transition files identified by focused search
- Test: module workflow tests under `backend/{consultation,physiotherapy,eyecare,laboratory,radiology}/tests/`

- [ ] Add regression tests proving each terminal action updates `completed_clinics` without closing unrelated clinic legs.
- [ ] Replace duplicated direct calls to `mark_visit_clinic_completed` plus `apply_visit_completion_after_leg` with the shared helper.
- [ ] Reject generic terminal status PATCHes where a module has a canonical completion action.
- [ ] Run consultation, physiotherapy, eye care, laboratory, and radiology workflow tests.

### Task 3: Manage Visits Multi-Clinic Filtering and Display

**Files:**
- Modify: `backend/patients/views.py`
- Modify: `backend/patients/filters.py` if needed by the existing filter backend
- Modify: `frontend/lib/services/visit-service.ts`
- Modify: `frontend/app/medical-records/visits/page.tsx`
- Test: `backend/patients/tests/` and relevant frontend visit tests

- [ ] Add a backend test where `Visit.clinic` is `GOPD`, `Visit.clinics` contains `Physiotherapy`, and `clinic=Physiotherapy` returns the visit.
- [ ] Update the clinic filter to match the primary clinic or normalized entries in the clinics JSON list.
- [ ] Preserve exact visit-wide status filtering: `completed` means all required clinic legs completed.
- [ ] Keep the existing per-clinic checkmarks and make partial completion explicit in the row.
- [ ] Run patient API and frontend visit tests.

### Task 4: Visit-Level Summary Report

**Files:**
- Create or modify: `backend/patients/clinical_overview.py` / patient report view using existing aggregation patterns
- Modify: `backend/patients/serializers.py`
- Modify: `backend/patients/urls.py`
- Modify: `frontend/lib/services/visit-service.ts`
- Modify: `frontend/app/medical-records/visits/page.tsx`
- Test: backend patient report tests and frontend service tests

- [ ] Add a failing API test for a multi-clinic visit with completed physiotherapy and pending consultation.
- [ ] Expose a visit-scoped summary containing visit metadata, clinics, completed clinics, vitals, consultation, physiotherapy, eye care, laboratory, radiology, prescriptions, referrals, and notes.
- [ ] Keep the existing consultation report action separate; add a visit summary action that does not require a completed consultation session.
- [ ] Return partial data with explicit empty sections rather than failing when a specialty has no records.
- [ ] Add frontend service/UI tests for the summary action.

### Task 5: End-to-End Verification

**Files:**
- Test: affected backend and frontend suites

- [ ] Run `python manage.py test pharmacy laboratory radiology physiotherapy eyecare consultation wards patients accounts.tests.test_auth_api` through Docker.
- [ ] Run `npm run lint`, `npm run type-check`, and `npm run test -- --run` through Docker.
- [ ] Run `python manage.py check`, `python manage.py makemigrations --check --dry-run`, and `git diff --check`.
- [ ] Verify a multi-clinic example reports `Physiotherapy: completed`, `Consultation: pending`, and `Visit: in_progress` in Manage Visits and the visit summary.
