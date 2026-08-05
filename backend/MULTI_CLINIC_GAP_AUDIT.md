# Multi-Clinic Support Gap Audit — NPA EMR Backend

Research-only audit (no code changed). Django 4.2 + DRF backend at `backend/`.
Multi-clinic is feature-flagged via `SystemConfig.is_enabled('multi_clinic_enabled')`.

Severity legend: **HIGH** = patient data reachable across clinics; **MED** = aggregate/PHI-adjacent or writable scope field; **LOW** = reference/display.

---

## 1. Models — clinic FK coverage (Task 1)

Two FK conventions exist: `location_clinic` (orders/visits, owning clinic) and `clinic` (rooms/wards/appointments/user home). `processing_clinic` (lab/radiology orders) is the secondary scoping target.

### Models WITH clinic FK (scopable directly)
| Model | Field | File:line |
|---|---|---|
| patients.Patient | location_clinic | patients/models.py:103 |
| patients.Visit | location_clinic (+ `clinics`, `completed_clinics` M2M) | patients/models.py:544 |
| pharmacy.MedicationInventory | location_clinic | pharmacy/models.py:299 |
| pharmacy.Prescription | location_clinic | pharmacy/models.py:398 |
| pharmacy.StockRequest | clinic | pharmacy/models.py:724 |
| pharmacy.StockIssueLine | location_clinic | pharmacy/models.py:911 |
| pharmacy.DispensaryReceiptLine | location_clinic | pharmacy/models.py:975 |
| physiotherapy.PhysioOrder | location_clinic | physiotherapy/models.py:54 |
| wards.Ward | clinic | wards/models.py:47 |
| consultation.ConsultationRoom | clinic | consultation/models.py:28 |
| consultation.ConsultationSession | location_clinic | consultation/models.py:140 |
| laboratory.LabOrder | location_clinic / processing_clinic / external_clinic | laboratory/models.py:138,146,117 |
| radiology.RadiologyOrder | location_clinic / processing_clinic / external_clinic | radiology/models.py:172,180,152 |
| eyecare.EyeOrder | location_clinic | eyecare/models.py:47 |
| nursing.NursingOrder | location_clinic | nursing/models.py:54 |
| accounts.User | clinic (home) / active_clinic (+ clinics M2M) | accounts/models.py:48,72,66 |
| appointments.Appointment / AppointmentSlot | clinic | appointments/models.py:40,130 |
| organization.Department / Room | clinic | organization/models.py:114,171 |

### Models with NO direct clinic FK (reached via relation)
- patients: VitalReading (671), MedicalHistory (789), AnnualCheckup (921), AnnualCheckupExemption (1024), **MedicalCertificate (1069)**, PatientRecordsNote (1160), PatientClinicalDocument (1217), PatientMerge (1308) — all via `patient.location_clinic` or `visit.location_clinic`.
- consultation: ConsultationRoomOccupancy (68) via room.clinic; PresentingComplaint (248), ConsultationQueue (291), Referral (399), ResponsibilityFormIssuance (528), Diagnosis (593) via session/patient.
- wards: Bed (125) via ward.clinic; PatientAdmission (216), WardAssignment (459), AdmissionObservationVital (529), AdmissionEscort (563), AdmissionTreatmentRow (674) — admission scoped via `visit__location_clinic`.
- pharmacy: PrescriptionItem (501), Dispense (617), StockRequestItem (777), StockIssue (798), HodStockIssue (938) via request/prescription.
- laboratory: LabTest (218), LabResult (450), LabReferralDispatch (318) via order.
- radiology: RadiologyStudy (240), RadiologyReport (336), RadiologyReferralDispatch (370) via order.
- physiotherapy: PhysioSession (90) via order; eyecare: EyeSession (93), EyeSessionDiagnosticFile (129) via order.
- Organization reference data: WorkLocation, OutpatientClinicType, FacilityOutpatientClinic, SystemConfig — no clinic (correct).
- Cross-cutting (unscoped by design): audit.ActivityLog, notifications.Notification (user-FK), permissions.Role/UserRole, accounts.SystemRole.
- App `hr` has **no models.py** — HR compliance reads patients.AnnualCheckup/Exemption via `hr/compliance.py:13`.

**Gap**: `hr` app duplicates scope on patient-owned models via a separate viewset (see Task 2); `MedicalCertificate` has no clinic field but is patient-owned.

---

## 2. Viewset / APIView scoping coverage (Task 2)

### Scoped (ClinicScopedMixin / LabRadiologyScopedMixin / manual scope_queryset)
- wards/views.py: WardViewSet (49), BedViewSet (109), PatientAdmissionViewSet (202, `clinic_filter_field='visit__location_clinic'`), WardAssignmentViewSet (1183), AdmissionObservationVitalViewSet (1292), AdmissionEscortViewSet (1324), AdmissionTreatmentRowViewSet (1446).
- eyecare/viewsets.py: EyeOrderViewSet (49), EyeSessionViewSet (394).
- appointments/views.py: AppointmentViewSet (27), AppointmentSlotViewSet (132).
- pharmacy/views.py: MedicationInventoryViewSet (439), PrescriptionViewSet (929), DispenseViewSet (1819), InventoryAlertViewSet (1913), StockRequestViewSet (1983), StockIssueViewSet (2489), HodStockIssueViewSet (2505).
- laboratory/views.py: LabOrderViewSet (194, LabRadiologyScopedMixin), LabResultViewSet (1205, ClinicScopedMixin `clinic_filter_field='order__processing_clinic'`).
- radiology/views.py: RadiologyOrderViewSet (221), RadiologyStudyViewSet (885), RadiologyReportViewSet (1183) — all LabRadiologyScopedMixin/ClinicScopedMixin.
- nursing/views.py: NursingOrderViewSet (34), ProcedureViewSet (269).
- physiotherapy/viewsets.py: PhysioOrderViewSet (64), PhysioSessionViewSet (335).
- patients/views.py: PatientViewSet (509), VitalReadingViewSet (1781, `clinic_filter_field='visit__location_clinic'`), AnnualCheckupViewSet (2080, `clinic_filter_field="visit__location_clinic"`).
- consultation/views.py: scope_queryset applied at 141, 198, 392, 417, 937, 1025, 1304, 1329, 1744, 1746, 2414.
- eyecare/tracker_views.py (56) and physiotherapy/tracker_views.py (41-46): **manual** `_scope_orders_for_user` via `resolve_clinic_id` + SystemConfig flag.

### UN-scoped — leak candidates
| Finding | Location | Severity |
|---|---|---|
| LaboratoryPatientTrackerView — `LabOrder.objects.all()` raw, NO clinic filter | laboratory/tracker_views.py:60,76-83 | **HIGH** |
| RadiologyPatientTrackerView — `RadiologyOrder.objects.all()` raw, NO clinic filter | radiology/tracker_views.py:64,80-87 | **HIGH** |
| MedicalCertificateViewSet — no mixin; `get_queryset` filters only by `patient` param | patients/views.py:2045-2064 | **HIGH** |
| LabTestViewSet — no mixin (per-order tests, no defense in depth) | laboratory/views.py:1108 | MED |
| HRComplianceViewSet — annual checkup data, no scoping | hr/views.py:42 | MED |
| DashboardStatsView — global counts (Patient/Visit/LabOrder/Prescription/RadiologyOrder/ConsultationSession/NursingOrder) | dashboard/views.py:21 | MED (aggregate) |
| ClinicalDashboardAnalyticsView → build_clinical_dashboard | analytics/views.py:16, analytics/clinical_dashboard.py | MED (aggregate) |
| build_operational_dashboard — global aggregates, cache key `operational_dashboard:{date}` | common/operational_dashboard.py:28,31 | MED (aggregate) |
| Module analytics (all global): Lab/Radiology/Nursing/Pharmacy/Eyecare/Physio | laboratory/analytics_views.py:24, radiology/analytics_views.py:24, nursing/analytics_views.py:13, physiotherapy/views.py:16,32, eyecare/views.py:16 | MED (aggregate) |
| 29 report APIViews — global, filter by legacy `clinic` **string** field | reports/views.py (e.g. 632, 916, 1477) | MED (aggregate) |
| support/views.py — ClientLogsView (56), SupportTicketView (96) etc. | support/views.py | LOW |

### Reference data viewsets — intentionally unscoped (correct)
LabPartnerViewSet (laboratory/views.py:105), LabTemplateViewSet (124), TemplateFieldOptionViewSet (1783), ImagingPartnerViewSet (radiology/views.py:96), RadiologyTemplateViewSet (115), PhysioTemplateViewSet (physiotherapy/viewsets.py:47), organization ClinicViewSet (41), wards ProcedureViewSet (269).

---

## 3. Detail / retrieve / update bypass checks (Task 3)

- DRF generic viewsets route `get_object` → `get_queryset` → `filter_queryset`, and the mixin overrides `filter_queryset` (common/mixins.py:37-39) to call `scope_queryset`. So **retrieve/update/destroy on mixin-based viewsets ARE scoped** (PK alone cannot escape clinic scope).
- **Bypass vectors — custom `@action` bodies using raw lookups**:
  - `Patient.objects.get(pk=result['winner_id'])` in merge action — patients/views.py:1020. **HIGH**
  - `get_object_or_404(Visit, pk=visit_id)` in ensure_for_visit — patients/views.py:2352. **MED-HIGH**
  - `ResponsibilityFormIssuance.objects.get(...)` — consultation/views.py:1978. LOW (session-guarded)
  - `form.objects.get(pk=form_pk, referral=referral)` — consultation/views.py:2194. LOW
  - HR `get_object_or_404` — hr/views.py:159. MED
  - `ImagingPartner.objects.get(...)` — radiology/views.py:662 (reference data). LOW
- Unscoped viewsets from Task 2 (MedicalCertificateViewSet, both trackers, HRComplianceViewSet) mean their `get_object`/`get` paths are entirely unscoped.
- Write-path auto-stamping is present: `auto_set_clinic(serializer)` (laboratory/views.py:388, radiology/views.py:400) and `apply_order_location_clinic` (laboratory/serializers.py:460-473, radiology/serializers.py:291-307, pharmacy/serializers.py:763-767).

---

## 4. Multi-clinic VIEW feasibility (Task 4)

- **No existing group-by-Clinic-FK endpoint.** No `by_clinic`/`group_by` query params anywhere.
- Existing "by clinic" outputs are either legacy **string** fields (`order.clinic`, `visit.clinic`) or external-clinic breakdowns:
  - `external_orders_by_clinic` (laboratory/analytics_views.py:92-109, radiology/analytics_views.py:111-128) — groups by `external_clinic` FK; the only real clinic-FK aggregation today.
  - Reports "clinic" filtering uses `clinic__icontains` on a string column (reports/views.py:632-644, 916, 1477) — **cannot join to organization.Clinic**.
- Natural aggregation candidates: DashboardStatsView (dashboard/views.py:21), build_clinical_dashboard (analytics/clinical_dashboard.py), build_operational_dashboard (common/operational_dashboard.py:28), module analytics views. These run unscoped global aggregates today — the multi-clinic view layer would scope them by `resolve_clinic_id`.
- **Cache-key hazard**: `operational_dashboard:{date}` (common/operational_dashboard.py:31) — must add clinic dimension to the cache key when scoping.
- No multi-clinic chart/breakdown endpoint exists; building it is greenfield.

---

## 5. Serializer clinic-field exposure (Task 5)

| File | Finding | Severity |
|---|---|---|
| pharmacy/serializers.py:1001 | `location_clinic` on StockIssueLine is **writable** (not in read_only_fields 1004-1012) — client can stamp arbitrary clinic | **MED** |
| accounts/serializers.py:211-212,242,268-269,291-292 | `clinics` M2M + `active_clinic` writable; guarded in views (superuser-only clinic reassignment views.py:233-240; active_clinic validated against assigned set views.py:305-319) | LOW (guarded) |
| laboratory/serializers.py:256,385-392 | `clinic` display string, `external_clinic_details` read-only; `validate_clinic` normalizes legacy string | OK |
| radiology/serializers.py:248-255,440-442 | same pattern as lab | OK |
| pharmacy/serializers.py:276-285,885-899 | location_clinic_name / StockRequest clinic_name read-only | OK |
| consultation/serializers.py:53-74 | resolves Clinic FK from location string on write | OK |
| patients/serializers.py:89-140,372-395,403-470 | resolves location_clinic from facility name; multi-clinic visit validation (single multi-clinic visit per patient/day) | OK |
| organization/serializers.py:50-78 | staff/room/patient counts per clinic (annotated) | OK |
| wards/serializers.py:153-159, appointments/serializers.py:18,35 | clinic/location_clinic name read-only display | OK |

---

## 6. Seed commands & migrations (Task 6)

- `organization/management/commands/seed_clinics.py` — seeds 9 NPA port clinics (BODE-THOMAS, TINCAN, APAPA, RIVERS, ONNE, DELTA, CALABAR, LEKKI, HQ-MARINA).
- `organization/management/commands/seed_port_clinics.py` — seeds 8 WorkLocations.
- `organization/migrations/0006_backfill_multi_clinic.py` — backfills `user.clinic` → `clinics` M2M; backfills `location_clinic` on order models; seeds `multi_clinic_enabled=false`.
- `accounts/migrations/0008_user_active_clinic_user_clinics_alter_user_clinic.py` — adds `active_clinic` + `clinics` M2M.
- `organization/migrations/0005_systemconfig_clinic_default_processing_clinic.py` — adds `Clinic.default_processing_clinic` and SystemConfig key.

---

## 7. TODO / FIXME / HACK comments (Task 7)

- Only one TODO in the whole backend: `common/services.py:118` — "TODO: Integrate with SMS provider" (unrelated to clinic).
- **No clinic-related TODO/FIXME markers exist** — multi-clinic work leaves no in-code breadcrumbs; the flag-off default (`multi_clinic_enabled=false`) is the only guard.

---

## Priority summary

1. **HIGH** — Add clinic scoping to `LaboratoryPatientTrackerView` and `RadiologyPatientTrackerView` (mirror eyecare/physio `_scope_orders_for_user` pattern). Cross-workflow search currently returns patients from all clinics.
2. **HIGH** — Scope `MedicalCertificateViewSet` (patients/views.py:2045) via patient clinic.
3. **HIGH** — Fix raw-lookup bypasses in `@action` bodies: patients/views.py:1020 (merge), 2352 (ensure_for_visit).
4. **MED** — Add mixin to `LabTestViewSet` (laboratory/views.py:1108) and `HRComplianceViewSet` (hr/views.py:42, :159).
5. **MED** — Make `location_clinic` read-only on StockIssueLine serializer (pharmacy/serializers.py:1001).
6. **MED** — Audit/scope all aggregate analytics + report views when multi-clinic flag is on; add clinic dimension to operational_dashboard cache key; replace legacy `clinic` string filters with `location_clinic` FK for real per-clinic reporting.
7. **LOW** — consultation raw `.objects.get` in custom actions (1978, 2194); support views.
