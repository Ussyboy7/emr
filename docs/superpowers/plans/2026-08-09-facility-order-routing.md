# Facility Order Routing and Sample Accessioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HQ, Tin Can, Lagos Port Complex, and other medical facilities own incoming lab/radiology requests, route each test/study independently to local, Bode Thomas, or an external provider, and preserve facility-specific sample accession numbers and audit history.

**Architecture:** Keep one clinical `LabOrder` or `RadiologyOrder` for the encounter, but move active routing to `LabTest` and `RadiologyStudy`. A lab sample batch represents one physical collection event and gives all tests collected together one accession number generated from the collection facility code. Existing external dispatch models remain the audit mechanism for outbound test/study batches; new internal routing events cover local and Bode Thomas transfers.

**Tech Stack:** Django 4.2 + DRF + PostgreSQL; Next.js 16 App Router + React 18 + TypeScript; existing facility-scoping mixins, audit service, Vitest, and Django tests.

## Global Constraints

- Use `organization.Clinic` for medical facilities; do not use `WorkLocation` for order routing.
- Preserve one clinical order per patient encounter; do not duplicate orders when lines route to different destinations.
- Resolve order origin from the linked visit facility before consultation room, session, or user fallback.
- Do not hardcode `BT` for new lab accession numbers; derive a stable prefix from the collection clinic code.
- A physical sample batch may contain tests routed to different processing destinations.
- Existing orders and existing `BT-YY-NNNN` numbers remain readable and are not destructively rewritten.
- Every routing decision records actor, timestamp, previous destination, new destination, and reason.
- Facility-scoped users must only route/process data they are authorized to access.
- Existing `LabReferralDispatch` and `RadiologyReferralDispatch` remain the external dispatch records; extend their line-selection behavior rather than creating duplicate order records.

## File Map

- `backend/laboratory/models.py` — sample batches, per-test routing, and routing events.
- `backend/radiology/models.py` — per-study routing and routing events.
- `backend/common/order_location.py` and `backend/common/mixins.py` — canonical origin and processing-facility resolution.
- `backend/laboratory/serializers.py`, `backend/laboratory/views.py` — lab routing, collection, and worklist APIs.
- `backend/radiology/serializers.py`, `backend/radiology/views.py` — radiology routing and worklist APIs.
- `backend/laboratory/dispatch_*`, `backend/radiology/dispatch_*` — external referral line batches.
- `frontend/app/laboratory/orders/page.tsx` — HQ/origin triage and lab line routing.
- `frontend/app/radiology/orders/page.tsx` — radiology line routing and facility/source display.
- `frontend/lib/services/lab-service.ts`, `frontend/lib/services/radiology-service.ts` — new API clients.
- `backend/*/tests/` and `frontend/hooks/*.test.ts` — regression coverage.

---

### Task 1: Add sample batches and per-line routing state

**Files:**
- Modify: `backend/laboratory/models.py:225-295`
- Modify: `backend/radiology/models.py:247-313`
- Create: `backend/laboratory/migrations/0026_lab_sample_batch_and_test_routing.py`
- Create: `backend/radiology/migrations/0022_radiology_study_routing.py`
- Test: `backend/laboratory/tests/test_order_routing.py`
- Test: `backend/radiology/tests/test_order_routing.py`

**Interfaces:**
- Produces `LabSampleBatch.accession_number`, `LabTest.sample_batch`, `LabTest.processing_clinic`, `LabTest.routing_status`.
- Produces `RadiologyStudy.processing_clinic`, `RadiologyStudy.routing_status`, and external destination fields.
- Produces routing event rows used by API and audit history.

- [ ] **Step 1: Write failing model/API tests**

Cover these exact invariants:

```python
def test_lab_tests_in_one_sample_batch_share_accession_but_route_independently():
    batch = LabSampleBatch.objects.create(
        order=order,
        collection_clinic=hq,
        accession_number="HQ-26-0001",
    )
    test_a.sample_batch = batch
    test_b.sample_batch = batch
    test_a.processing_clinic = hq
    test_b.processing_clinic = bode_thomas
    test_a.save()
    test_b.save()
    assert test_a.sample_batch.accession_number == test_b.sample_batch.accession_number
    assert test_a.processing_clinic_id != test_b.processing_clinic_id

def test_radiology_studies_have_independent_destinations():
    first.processing_clinic = bode_thomas
    second.outsourced_facility = "External Imaging Centre"
    first.save()
    second.save()
    assert first.processing_clinic_id == bode_thomas.id
    assert second.outsourced_facility == "External Imaging Centre"
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py test laboratory.tests.test_order_routing radiology.tests.test_order_routing`

Expected: FAIL because the new models/fields do not exist.

- [ ] **Step 3: Add the minimum schema**

Add:

```python
class LabSampleBatch(models.Model):
    accession_number = models.CharField(max_length=30, unique=True, db_index=True)
    order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name="sample_batches")
    collection_clinic = models.ForeignKey("organization.Clinic", on_delete=models.PROTECT)
    collected_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True)
    collected_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class LabTestRoutingEvent(models.Model):
    test = models.ForeignKey(LabTest, on_delete=models.CASCADE, related_name="routing_events")
    from_clinic = models.ForeignKey("organization.Clinic", on_delete=models.SET_NULL, null=True, blank=True, related_name="lab_route_events_from")
    to_clinic = models.ForeignKey("organization.Clinic", on_delete=models.SET_NULL, null=True, blank=True, related_name="lab_route_events_to")
    destination_type = models.CharField(max_length=20, choices=[("internal", "Internal"), ("external", "External")])
    external_destination = models.CharField(max_length=200, blank=True)
    reason = models.TextField(blank=True)
    changed_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True)
    changed_at = models.DateTimeField(auto_now_add=True)
```

Add equivalent `RadiologyStudyRoutingEvent` and fields on `RadiologyStudy`; use the existing `processing_method`/`outsourced_facility` vocabulary where possible. Add `pending_triage`, `approved_local`, `sent_to_processing`, `referred_external`, and `cancelled` without removing existing result statuses.

- [ ] **Step 4: Generate and apply migrations**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py makemigrations laboratory radiology` then `docker compose -f docker-compose.local.yml exec -T backend python manage.py migrate`

- [ ] **Step 5: Run focused tests and commit**

Run the focused tests again; expected: PASS. Commit with `feat: add per-line order routing and sample batches`.

---

### Task 2: Correct originating-facility resolution and default processing

**Files:**
- Modify: `backend/common/order_location.py`
- Modify: `backend/common/mixins.py:162-195`
- Modify: `backend/laboratory/serializers.py:458-480`
- Modify: `backend/radiology/serializers.py:289-308`
- Test: `backend/laboratory/tests/test_order_location.py`
- Test: `backend/radiology/tests/test_order_location.py`

**Interfaces:**
- Produces `resolve_order_origin_clinic(visit, session, user)` with visit-first precedence.
- Produces processing default resolution from the originating clinic’s `default_processing_clinic`.

- [ ] **Step 1: Add failing precedence tests**

Test a consultation order linked to a Tin Can visit but created by a user whose active clinic is Bode Thomas. Assert `location_clinic == Tin Can` and `processing_clinic == Tin Can.default_processing_clinic`.

- [ ] **Step 2: Run the tests and confirm the current Bode Thomas overwrite fails**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py test laboratory.tests.test_order_location radiology.tests.test_order_location`

- [ ] **Step 3: Implement canonical precedence**

Use this order for an order linked to an encounter:

```text
visit.location_clinic
consultation_session.location_clinic
consultation_session.room.location_clinic
user active clinic
```

Change `LabRadiologyScopedMixin.auto_set_facility` so it does not replace a visit/session-derived origin with the user’s active clinic. Keep facility-access validation for explicit and resolved clinics. Set processing from `default_processing_clinic` only after origin resolution.

- [ ] **Step 4: Run tests and inspect serialized output**

Run both focused suites plus `laboratory.tests.test_lab_api` and `radiology.tests.test_order_api`; expected: PASS. Confirm API output includes both `location_clinic_name` and `processing_clinic_name`.

- [ ] **Step 5: Commit**

Commit with `fix: preserve order originating facility before processing routing`.

---

### Task 3: Add line-level routing APIs and audit history

**Files:**
- Modify: `backend/laboratory/serializers.py`, `backend/laboratory/views.py`
- Modify: `backend/radiology/serializers.py`, `backend/radiology/views.py`
- Modify: `backend/laboratory/dispatch_*`, `backend/radiology/dispatch_*` where selected line IDs are validated
- Test: `backend/laboratory/tests/test_order_routing.py`
- Test: `backend/radiology/tests/test_order_routing.py`

**Interfaces:**
- `POST /api/v1/lab-orders/{order_id}/route-tests/` accepts `{test_ids, destination_type, processing_clinic, external_destination, reason}`.
- `POST /api/v1/radiology-orders/{order_id}/route-studies/` accepts the analogous study payload.
- `POST /api/v1/lab-orders/{order_id}/collect-samples/` accepts `{test_ids, collection_clinic, collection_method, notes}` and returns the sample batch/accession.
- Route responses return updated line records plus routing events.

- [ ] **Step 1: Write failing API tests**

Cover local, Bode Thomas, external, mixed destinations, invalid facility access, empty line selection, and audit event creation. Assert that an external route cannot omit `external_destination` and an internal route cannot omit `processing_clinic`.

- [ ] **Step 2: Run focused API tests and confirm failure**

Run the two routing test modules; expected: missing action endpoints/fields.

- [ ] **Step 3: Implement route actions**

Use transaction boundaries and `select_for_update` on the selected lines. Validate the order’s origin scope and destination access. Update only selected tests/studies, append an event per line, and leave unrelated lines unchanged.

- [ ] **Step 4: Integrate external dispatch selection**

Ensure `LabReferralDispatch.tests` and `RadiologyReferralDispatch.studies` contain exactly the externally routed lines. Do not change existing dispatches silently; create a new dispatch for a new route.

- [ ] **Step 5: Run backend routing, dispatch, and RBAC tests; commit**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py test laboratory.tests radiology.tests permissions.tests`

Commit with `feat: add auditable line-level order routing APIs`.

---

### Task 4: Make facility-specific lab accessioning work

**Files:**
- Modify: `backend/laboratory/views.py:496-625`
- Modify: `backend/laboratory/serializers.py`
- Modify: `backend/laboratory/dispatch_pdfs.py`
- Test: `backend/laboratory/tests/test_order_routing.py`

- [ ] **Step 1: Add failing accession tests**

Assert that collection at HQ creates `HQ-YY-NNNN`, collection at Tin Can creates a Tin Can code prefix, tests in one batch share the accession, and tests collected later receive a different accession. Assert that existing `BT-YY-NNNN` values are not overwritten.

- [ ] **Step 2: Run tests to verify failure**

Run the focused laboratory routing tests; expected: current hardcoded `BT` behavior fails for HQ/Tin Can.

- [ ] **Step 3: Implement batch-based accession generation**

Generate the prefix from a sanitized `Clinic.code`, use a transaction/row lock for the serial, create one `LabSampleBatch`, and assign it only to selected tests. Keep `LabOrder.lab_number` as a compatibility fallback for legacy orders, but use the batch accession in new serialization and PDFs.

- [ ] **Step 4: Run laboratory lifecycle and dispatch tests; commit**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py test laboratory.tests`

Commit with `feat: generate collection-facility lab accessions`.

---

### Task 5: Build origin triage and destination-aware worklists

**Files:**
- Modify: `frontend/lib/services/lab-service.ts`, `frontend/lib/services/radiology-service.ts`
- Modify: `frontend/app/laboratory/orders/page.tsx`
- Modify: `frontend/app/radiology/orders/page.tsx`
- Create: `frontend/components/laboratory/OrderRoutingDialog.tsx`
- Create: `frontend/components/radiology/StudyRoutingDialog.tsx`
- Test: `frontend/lib/services/lab-service.test.ts`, `frontend/lib/services/radiology-service.test.ts`

- [ ] **Step 1: Add failing service tests**

Test route and collect-sample payloads, including selected line IDs, internal destination, external destination, reason, and collection clinic.

- [ ] **Step 2: Run focused service tests and confirm failure**

Run: `npm run test -- --run lib/services/lab-service.test.ts lib/services/radiology-service.test.ts`.

- [ ] **Step 3: Add API client methods and typed response fields**

Expose `routeTests`, `routeStudies`, and `collectSamples`; map `originating_clinic_name`, `processing_clinic_name`, `routing_status`, `sample_accession`, and external destination.

- [ ] **Step 4: Add triage controls**

On the origin facility worklist, render each test/study as a selectable line with destination, routing state, and sample accession. Add actions for local, Bode Thomas, and external routing. Prevent routing an already verified/cancelled line and require a reason for external referral.

- [ ] **Step 5: Add destination/origin filters and visible labels**

Show `Origin: HQ` and `Processing: Bode Thomas` on every relevant card/detail dialog. Separate origin-facility and processing-facility filters; keep source type as its own filter.

- [ ] **Step 6: Run frontend tests, type-check, lint; commit**

Run: `npm run test -- --run`, `npm run type-check`, `npm run lint`.

Commit with `feat: add facility triage and destination-aware worklists`.

---

### Task 6: Backfill compatibility and operational documentation

**Files:**
- Create: `backend/laboratory/management/commands/backfill_sample_batches.py`
- Create: `backend/laboratory/tests/test_backfill_sample_batches.py`
- Modify: `docs/README.md` or the relevant lab/radiology workflow documentation

- [ ] **Step 1: Add dry-run backfill tests**

Cover legacy orders with existing `BT` numbers, orders linked to visits with known origin, and ambiguous orders with no safe origin. Ambiguous records must be reported, not guessed.

- [ ] **Step 2: Implement the command**

Add `python manage.py backfill_sample_batches --dry-run` and an explicit `--apply` mode. Preserve existing accession values, create batches only when the collection facility is known, and emit counts for created, preserved, skipped, and ambiguous records.

- [ ] **Step 3: Document the workflow**

Document facility ownership, per-test/study routing, collection versus processing facilities, accession numbering, external referral, and the operator steps for HQ triage.

- [ ] **Step 4: Run full backend verification and commit**

Run: `docker compose -f docker-compose.local.yml exec -T backend python manage.py test laboratory.tests radiology.tests reports.tests permissions.tests` and `docker compose -f docker-compose.local.yml exec -T backend python manage.py check`.

Commit with `docs: document facility routing and accession workflow`.

---

## End-to-End Verification

1. Create a visit at HQ and start a consultation.
2. Create an order containing three lab tests and two radiology studies.
3. Confirm the order appears in HQ’s triage queue with `Origin: HQ`.
4. Route one lab test locally, one to Bode Thomas, and one externally.
5. Collect the three lab tests together at HQ and confirm they share one `HQ-YY-NNNN` accession.
6. Route radiology studies to different destinations and confirm independent worklist entries.
7. Confirm Bode Thomas sees only its assigned lines and sees `Origin: HQ`.
8. Confirm external dispatch records contain only the selected lines and preserve the original order/accession.
9. Enter results at each destination and verify they return to the original order.
10. Verify routing audit history shows every decision and actor.
