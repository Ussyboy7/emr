"""Post-merge verification: confirm the merge is correct and reversible.

Run on prod:
  docker exec -i emr-backend-prod bash -c 'cd /app && PYTHONPATH=/app python scripts/verify_nura_umar.py'
"""
import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "emr_backend.settings")
django.setup()

from patients.models import Patient, PatientMerge, Visit, VitalReading, MedicalCertificate
from laboratory.models import LabOrder, LabResult
from pharmacy.models import Prescription
from consultation.models import ConsultationSession, ConsultationQueue, Diagnosis
from radiology.models import RadiologyOrder, RadiologyReport


def header(s):
    print()
    print("=" * 78)
    print(s)
    print("=" * 78)


def clinical(patient_id):
    """Count clinical rows now pointing at this patient."""
    return {
        "visits":              Visit.objects.filter(patient_id=patient_id).count(),
        "vital_readings":      VitalReading.objects.filter(patient_id=patient_id).count(),
        "lab_orders":          LabOrder.objects.filter(patient_id=patient_id).count(),
        "lab_results":         LabResult.objects.filter(patient_id=patient_id).count(),
        "prescriptions":       Prescription.objects.filter(patient_id=patient_id).count(),
        "consult_sessions":    ConsultationSession.objects.filter(patient_id=patient_id).count(),
        "queue_items":         ConsultationQueue.objects.filter(patient_id=patient_id).count(),
        "diagnoses":           Diagnosis.objects.filter(patient_id=patient_id).count(),
        "radiology_orders":    RadiologyOrder.objects.filter(patient_id=patient_id).count(),
        "radiology_reports":   RadiologyReport.objects.filter(patient_id=patient_id).count(),
        "medical_certs":       MedicalCertificate.objects.filter(patient_id=patient_id).count(),
    }


def show(label, pid):
    p = Patient.objects.filter(patient_id=pid).first()
    if not p:
        print(f"  {label} ({pid}): NOT FOUND")
        return
    principal = p.principal_staff
    c = clinical(p.id)
    total = sum(c.values())
    print(
        f"  {label} ({pid}): active={p.is_active}  merged_into={p.merged_into_id}  "
        f"principal_staff_id={p.principal_staff_id}  "
        f"name={p.get_full_name()}  total_clinical={total}"
    )
    if principal:
        print(f"    principal: {principal.patient_id}  {principal.get_full_name()}")
    if p.merged_at:
        print(f"    merged_at: {p.merged_at}  reason: {p.merge_reason[:80]}")
    for k, v in c.items():
        if v:
            print(f"    {k}: {v}")


header("1) Active winners — E-A3755 and ED-A3755-1 should be live and linked")
show("employee winner", "E-A3755")
show("spouse winner", "ED-A3755-1")
show("child (untouched)", "ED-A3755-2")

header("2) Tombstoned losers — should be in DB under MERGED-* patient_id")
for pid in ["MERGED-1854-2026-06-04", "MERGED-4612-2026-06-04"]:
    p = Patient.objects.filter(patient_id=pid).first()
    if not p:
        print(f"  {pid}: NOT FOUND (BAD — tombstone missing!)")
        continue
    print(
        f"  {pid}: id={p.id}  original_patient_id={p.patient_id}  "
        f"active={p.is_active}  merged_into_id={p.merged_into_id}  "
        f"name={p.get_full_name()}  merged_at={p.merged_at}"
    )
    if p.principal_staff:
        print(f"    principal_staff_id preserved: {p.principal_staff_id} -> {p.principal_staff.patient_id}")

header("3) E-93610 / ED-93610-1 should NOT be findable by old patient_id")
for old_pid in ["E-93610", "ED-93610-1"]:
    p = Patient.objects.filter(patient_id=old_pid).first()
    if p:
        print(f"  {old_pid}: !! STILL EXISTS (id={p.id}, is_active={p.is_active}) — BAD")
    else:
        print(f"  {old_pid}: not findable by old id — CORRECT (renamed to MERGED-*)")

header("4) Audit rows")
for m in PatientMerge.objects.all().order_by("id"):
    print(
        f"  PatientMerge #{m.id}: {m.loser.patient_id} -> {m.winner.patient_id}  "
        f"by={m.merged_by.username}  at={m.merged_at}"
    )
    non_zero = {k: v for k, v in m.__dict__.items() if k.endswith("_repointed") and v}
    merged = {k: v for k, v in m.__dict__.items() if k.endswith("_merged") and v}
    if non_zero:
        print(f"    repointed: {non_zero}")
    if merged:
        print(f"    merged:    {merged}")
    print(f"    reason: {m.reason[:120]}")

header("5) Sanity: dependents of E-A3755")
emp = Patient.objects.filter(patient_id="E-A3755").first()
deps = Patient.objects.filter(principal_staff_id=emp.id, category="dependent").order_by("patient_id")
print(f"  E-A3755 has {deps.count()} dependents:")
for d in deps:
    print(f"    {d.patient_id}  {d.get_full_name()}  active={d.is_active}  merged_into={d.merged_into_id}")

header("6) No clinical data should reference the tombstoned IDs")
from patients.models import Visit, VitalReading
from laboratory.models import LabOrder, LabResult
for tomb in ["MERGED-1854-2026-06-04", "MERGED-4612-2026-06-04"]:
    p = Patient.objects.filter(patient_id=tomb).first()
    if not p:
        continue
    stuck = []
    for label, model in [
        ("Visit", Visit), ("VitalReading", VitalReading),
        ("LabOrder", LabOrder), ("LabResult", LabResult),
    ]:
        n = model.objects.filter(patient_id=p.id).count()
        if n:
            stuck.append(f"{label}={n}")
    if stuck:
        print(f"  {tomb}: !! STUCK clinical data still pointing at tombstone: {stuck}")
    else:
        print(f"  {tomb}: 0 clinical rows still pointing here — CORRECT")
