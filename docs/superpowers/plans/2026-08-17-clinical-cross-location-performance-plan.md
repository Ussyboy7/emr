# Clinical Cross-Location Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop production-wide database pressure and make authorized cross-location clinical reports searchable and visible without weakening clinic-scoped writes or worklists.

**Architecture:** Replace the expensive clinic list join-count query with independent correlated counts. Make consultation report reads explicitly organization-wide for users who already have consultation-history access, while leaving session mutations scoped. Move lab result validation after database filters and include all relevant processing clinics in lab/radiology verification scope.

**Tech Stack:** Django 4.2, Django REST Framework, PostgreSQL, Next.js, TypeScript.

## Global Constraints

- Keep `/api/v1/` as the canonical API path.
- Do not expose clinical data to unauthenticated users.
- Keep order creation, editing, routing, verification actions, and worklists clinic-scoped.
- Run backend tests in Docker because the local database is not available.
- Run frontend type-check and lint before claiming completion.

---

### Task 1: Optimize Clinic Statistics

**Files:**
- Modify: `backend/organization/views.py:55-83`
- Modify: `backend/organization/serializers.py:49-62`
- Test: `backend/organization/tests/test_clinic_dept_api.py`

**Interfaces:**
- Preserve `GET /api/v1/organization/clinics/` response fields.
- Preserve `GET /api/v1/organization/clinics/?light=1` minimal response.

- [ ] **Step 1: Add a regression test for clinic list response and query count**

Add a test that creates a clinic, staff member, organization room, consultation room, visit, and consultation session, then asserts the list returns correct counts. Wrap the request with `assertNumQueries` so the list does not execute one count query per clinic.

- [ ] **Step 2: Run the focused organization test and confirm the baseline behavior**

Run:

```bash
docker compose -f docker-compose.local.yml exec -T -e TEST_DB_NAME="" backend python manage.py test organization.tests.test_clinic_dept_api --noinput
```

Expected: existing tests pass; the new query-count test fails if the current join-count/N+1 path remains.

- [ ] **Step 3: Replace multi-table joins with independent subqueries/aggregates**

Annotate staff, organization-room, consultation-room, recent-patient, and recent-doctor counts independently so visits and consultation sessions cannot multiply each other in one large join. Keep the serializer reading annotations and retain a fallback only for detail responses.

- [ ] **Step 4: Run the focused organization tests again**

Expected: all organization clinic tests pass and the query-count assertion stays within the defined bound.

- [ ] **Step 5: Commit the isolated performance fix**

```bash
git add backend/organization/views.py backend/organization/serializers.py backend/organization/tests/test_clinic_dept_api.py
git commit -m "perf(org): isolate clinic statistics queries"
```

---

### Task 2: Make Consultation Reports Cross-Location Readable

**Files:**
- Modify: `backend/consultation/views.py`
- Modify: `frontend/app/consultation/history/page.tsx`
- Modify: `frontend/lib/consultation-report.ts`
- Test: `backend/consultation/tests/test_report_attribution.py`

**Interfaces:**
- Add a report-specific read path that returns a session report and workspace bundle to authenticated users with consultation-history access.
- Do not change session create/update/delete or consultation queue scope.

- [ ] **Step 1: Add failing tests for cross-location report reads**

Create a session belonging to a different clinic than the authenticated user and assert the report read succeeds. Assert an unauthenticated request is rejected and a user without consultation-history permission remains rejected.

- [ ] **Step 2: Run the focused consultation tests and confirm failure**

```bash
docker compose -f docker-compose.local.yml exec -T -e TEST_DB_NAME="" backend python manage.py test consultation.tests.test_report_attribution --noinput
```

- [ ] **Step 3: Implement the report-only read path**

Use the existing authenticated consultation-history permission and return only the requested session’s report payload. Keep the normal session queryset clinic-scoped. Update the frontend history loader to call the report path without hardcoding `scope=all` for normal users.

- [ ] **Step 4: Run consultation tests and frontend checks**

```bash
docker compose -f docker-compose.local.yml exec -T -e TEST_DB_NAME="" backend python manage.py test consultation.tests.test_report_attribution --noinput
cd frontend && npx tsc --noEmit && npm run lint
```

- [ ] **Step 5: Commit the report access fix**

```bash
git add backend/consultation/views.py frontend/app/consultation/history/page.tsx frontend/lib/consultation-report.ts backend/consultation/tests/test_report_attribution.py
git commit -m "fix(consultation): allow authorized cross-location report reads"
```

---

### Task 3: Optimize Completed Lab Result Search

**Files:**
- Modify: `backend/laboratory/views.py:1600-1672`
- Modify: `backend/laboratory/models.py` and generated migration if required
- Test: `backend/laboratory/tests/test_verification_filters.py`

**Interfaces:**
- Preserve `GET /api/v1/laboratory/verification/?status=verified` behavior.
- Preserve search fields and result-payload/file validation.

- [ ] **Step 1: Add failing tests for filtered completed-result search**

Create one valid verified result matching search and one unrelated result with an empty payload. Assert the matching result is returned and the query does not validate every unrelated row before applying search.

- [ ] **Step 2: Run the focused lab tests and confirm baseline failure/performance issue**

```bash
docker compose -f docker-compose.local.yml exec -T -e TEST_DB_NAME="" backend python manage.py test laboratory.tests.test_verification_filters --noinput
```

- [ ] **Step 3: Apply DRF filters before payload validation**

Build the base queryset, apply status/date/clinic/gender/processing filters, then apply `SearchFilter` and pagination-compatible filtering before validating payloads. Replace the full-table Python `iterator()` scan with a bounded validation path for the filtered candidates.

- [ ] **Step 4: Add indexes for the verified-result access path**

Add indexes covering the common status/date and processing-clinic predicates, generate the migration, and keep existing search behavior unchanged.

- [ ] **Step 5: Run lab tests and commit**

```bash
docker compose -f docker-compose.local.yml exec -T -e TEST_DB_NAME="" backend python manage.py test laboratory.tests.test_verification_filters laboratory.tests.test_lab_api --noinput
git add backend/laboratory/views.py backend/laboratory/models.py backend/laboratory/migrations backend/laboratory/tests/test_verification_filters.py
git commit -m "perf(lab): filter completed results before payload validation"
```

---

### Task 4: Fix Radiology Verification Scope

**Files:**
- Modify: `backend/radiology/views.py:1437-1502`
- Test: `backend/radiology/tests/test_radiology_api.py`

**Interfaces:**
- Preserve radiology verification permissions and verify/reject actions.
- A report is visible when the active clinic matches order origin, order processing, or study processing clinic.

- [ ] **Step 1: Add failing scope tests**

Create a reported study where the order origin differs from Bode Thomas and the study processing clinic is Bode Thomas. Assert a Bode Thomas user sees the report. Assert an unrelated clinic does not.

- [ ] **Step 2: Run the focused radiology tests and confirm failure**

```bash
docker compose -f docker-compose.local.yml exec -T -e TEST_DB_NAME="" backend python manage.py test radiology.tests.test_radiology_api radiology.tests.test_order_routing --noinput
```

- [ ] **Step 3: Use facility scope fields for all three destinations**

Configure `RadiologyReportViewSet` with scope fields for `order__location_clinic`, `order__processing_clinic`, and `study__processing_clinic`, preserving explicit clinic filters and permission checks.

- [ ] **Step 4: Run radiology tests and commit**

```bash
docker compose -f docker-compose.local.yml exec -T -e TEST_DB_NAME="" backend python manage.py test radiology.tests.test_radiology_api radiology.tests.test_order_routing --noinput
git add backend/radiology/views.py backend/radiology/tests/test_radiology_api.py
git commit -m "fix(radiology): include study processing clinic in verification scope"
```

---

### Task 5: Full Verification and Production Deployment

**Files:**
- No new files.

- [ ] **Step 1: Run the combined backend tests**

```bash
docker compose -f docker-compose.local.yml exec -T -e TEST_DB_NAME="" backend python manage.py test organization consultation laboratory radiology --noinput
```

- [ ] **Step 2: Run frontend checks**

```bash
cd frontend
npx tsc --noEmit
npm run lint
```

- [ ] **Step 3: Inspect the complete diff and working tree**

```bash
git status --short
```

- [ ] **Step 4: Push the implementation commits**

```bash
```

- [ ] **Step 5: Deploy backend first in production**

```bash
git pull
```

- [ ] **Step 6: Deploy frontend and verify the four workflows**

Verify clinic switching, completed lab search, cross-location consultation report viewing, and Bode Thomas radiology verification. Monitor PostgreSQL connection count and slow-query logs after deployment.
