"""
Inspect the Mrs NURA RABIAT / Mrs UMAR RABIAT duplicate-dependent case on prod.

Run via:
  bash scripts/ops/env-manager.sh prod shell 'python manage.py shell < backend/scripts/inspect_nura_umar.py'

Outputs a side-by-side comparison of:
  - The employee (Mr MUHAMMAD UMAR SALIHU)
  - Both duplicate dependents (ED-93610-1, ED-A3755-1)
  - Each duplicate's clinical data
  - Each duplicate's own dependents (children of the spouse, if any)
  - Any overlap (e.g., a child linked to BOTH duplicates)
"""

import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "emr_backend.settings")
django.setup()

from patients.models import Patient, Visit, VitalReading, MedicalCertificate, MedicalHistory
from laboratory.models import LabOrder, LabResult
from pharmacy.models import Prescription
from consultation.models import ConsultationSession, ConsultationQueue, Referral, Diagnosis
from wards.models import PatientAdmission
from physiotherapy.models import PhysioOrder
from eyecare.models import EyeOrder
from nursing.models import NursingOrder, Procedure
from radiology.models import RadiologyOrder, RadiologyReport
from appointments.models import Appointment
from django.db.models import Count


def fmt_patient(p):
    if not p:
        return "  (none)"
    return (
        f"  ID={p.id}  patient_id={p.patient_id}  name={p.get_full_name()}  "
        f"category={p.category}  active={p.is_active}  "
        f"DOB={p.date_of_birth}  gender={p.gender}  "
        f"phone={p.phone!r}  email={p.email!r}  "
        f"principal_staff_id={p.principal_staff_id}  "
        f"created_at={p.created_at.date()}"
    )


def count_for(model, patient_id):
    return model.objects.filter(patient_id=patient_id).count()


def clinical_summary(patient_id):
    return {
        "visits":              count_for(Visit, patient_id),
        "vital_readings":      count_for(VitalReading, patient_id),
        "lab_orders":          count_for(LabOrder, patient_id),
        "lab_results":         count_for(LabResult, patient_id),
        "prescriptions":       count_for(Prescription, patient_id),
        "consult_sessions":    count_for(ConsultationSession, patient_id),
        "queue_items":         count_for(ConsultationQueue, patient_id),
        "referrals":           count_for(Referral, patient_id),
        "diagnoses":           count_for(Diagnosis, patient_id),
        "admissions":          count_for(PatientAdmission, patient_id),
        "physio_orders":       count_for(PhysioOrder, patient_id),
        "eye_orders":          count_for(EyeOrder, patient_id),
        "nursing_orders":      count_for(NursingOrder, patient_id),
        "procedures":          count_for(Procedure, patient_id),
        "radiology_orders":    count_for(RadiologyOrder, patient_id),
        "radiology_reports":   count_for(RadiologyReport, patient_id),
        "appointments":        count_for(Appointment, patient_id),
        "medical_certs":       count_for(MedicalCertificate, patient_id),
    }


def dependents_of(patient_id):
    return list(Patient.objects.filter(principal_staff_id=patient_id, category="dependent"))


def header(s):
    print()
    print("=" * 78)
    print(s)
    print("=" * 78)


# ------------------------------------------------------------------ find employees
header("1) Find the employee — Mr MUHAMMAD UMAR SALIHU")
candidates = Patient.objects.filter(
    category__in=["employee", "retiree"],
).filter(
    surname__iexact="SALIHU"
).filter(
    first_name__icontains="MUHAMMAD"
)
print(f"  Match count: {candidates.count()}")
for c in candidates:
    print(fmt_patient(c))
    print(f"    Dependents count: {c.dependents.count()}")
    for d in c.dependents.all():
        print(f"    - {d.patient_id}  {d.get_full_name()}  DOB={d.date_of_birth}  active={d.is_active}")

if candidates.count() == 0:
    print("  !! No employee matched. Aborting.")
    raise SystemExit(0)

if candidates.count() > 1:
    print("  !! Multiple employees matched. Showing all; the user must disambiguate.")
    raise SystemExit(0)

employee = candidates.first()

# ------------------------------------------------------------------ find the duplicates
header("2) Find duplicate dependents — surname RABIAT, principal = employee")
deps = employee.dependents.filter(surname__iexact="RABIAT").order_by("patient_id")
print(f"  RABIAT dependents of {employee.patient_id}: {deps.count()}")
for d in deps:
    print(fmt_patient(d))

if deps.count() < 2:
    print("  !! Expected at least 2 RABIAT dependents. Aborting.")
    raise SystemExit(0)

# ------------------------------------------------------------------ inspect each duplicate
header("3) Inspect each candidate duplicate")
summaries = {}
for d in deps:
    print(f"\n----- {d.patient_id}  {d.get_full_name()} -----")
    print(fmt_patient(d))
    print(f"  her own dependents (children of the spouse):")
    her_kids = dependents_of(d.id)
    if not her_kids:
        print("    (none)")
    for k in her_kids:
        print(f"    - {k.patient_id}  {k.get_full_name()}  DOB={k.date_of_birth}  active={k.is_active}")
    print(f"  clinical-data counts:")
    s = clinical_summary(d.id)
    summaries[d.patient_id] = s
    for k, v in s.items():
        print(f"    {k:<22} {v}")

# ------------------------------------------------------------------ check overlaps on dependents
header("4) Check for overlapping children (a child linked to BOTH duplicates)")
dup_ids = [d.id for d in deps]
# Find all dependents whose principal_staff is in the dup set
all_grandkids = Patient.objects.filter(
    principal_staff_id__in=dup_ids, category="dependent"
).order_by("principal_staff_id", "patient_id")
print(f"  Total grandkids across both duplicates: {all_grandkids.count()}")
by_kid = {}
for g in all_grandkids:
    by_kid.setdefault((g.first_name, g.surname, g.date_of_birth), []).append(g)
overlaps = {k: v for k, v in by_kid.items() if len(v) > 1}
if not overlaps:
    print("  No overlapping children. Clean merge possible.")
else:
    print(f"  !! {len(overlaps)} child key(s) appear under BOTH duplicates. These need to be merged too.")
    for key, kids in overlaps.items():
        print(f"    {key} → {[k.patient_id + ' (parent=' + str(k.principal_staff_id) + ')' for k in kids]}")

# ------------------------------------------------------------------ comparison table
header("5) Side-by-side comparison (counts only)")
print(f"  {'metric':<22}  " + "  ".join(f"{pid:>14}" for pid in summaries))
for metric in [
    "visits", "vital_readings", "lab_orders", "prescriptions",
    "consult_sessions", "physio_orders", "nursing_orders",
    "radiology_orders", "appointments", "medical_certs",
]:
    row = f"  {metric:<22}  " + "  ".join(f"{summaries[pid][metric]:>14}" for pid in summaries)
    print(row)

# ------------------------------------------------------------------ visits detail
header("6) Visit detail on each duplicate (first 5 per duplicate)")
for d in deps:
    print(f"\n----- {d.patient_id} -----")
    visits = Visit.objects.filter(patient_id=d.id).order_by("-date", "-time")[:5]
    for v in visits:
        print(f"  visit_id={v.visit_id}  date={v.date}  time={v.time}  status={v.status}  type={v.visit_type}  clinic={v.clinic}")

print()
print("=" * 78)
print("DONE. Copy this output and share with the engineer designing the merge.")
print("=" * 78)
