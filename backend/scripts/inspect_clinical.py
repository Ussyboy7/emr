"""Clinical-data inspection for the 4 records in the merge.

Run on prod:
  docker exec -i emr-backend-prod bash -c 'cd /app && PYTHONPATH=/app python scripts/inspect_clinical.py'
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


RELATED = [
    ("visits",              Visit),
    ("vital_readings",      VitalReading),
    ("lab_orders",          LabOrder),
    ("lab_results",         LabResult),
    ("prescriptions",       Prescription),
    ("consult_sessions",    ConsultationSession),
    ("queue_items",         ConsultationQueue),
    ("referrals",           Referral),
    ("diagnoses",           Diagnosis),
    ("admissions",          PatientAdmission),
    ("physio_orders",       PhysioOrder),
    ("eye_orders",          EyeOrder),
    ("nursing_orders",      NursingOrder),
    ("procedures",          Procedure),
    ("radiology_orders",    RadiologyOrder),
    ("radiology_reports",   RadiologyReport),
    ("appointments",        Appointment),
    ("medical_certs",       MedicalCertificate),
    ("medical_history",     MedicalHistory),
]


def counts(patient_id):
    out = {}
    for label, model in RELATED:
        out[label] = model.objects.filter(patient_id=patient_id).count()
    return out


RECORDS = [
    ("E-93610",   "Original Staff employee"),
    ("E-A3755",   "Duplicate Officer employee (WINNER)"),
    ("ED-93610-1", "Original spouse (NURA)"),
    ("ED-A3755-1", "Duplicate spouse (NURA) — currently ORPHAN (WINNER)"),
    ("ED-A3755-2", "Child (Mr UMAR SALMAN) — UNTOUCHED"),
]


print(f"{'patient_id':<12}  {'category':<11}  {'name':<28}  ", end="")
labels = [l for l, _ in RELATED]
print("  ".join(f"{l[:8]:>8}" for l in labels))

for pid, descr in RECORDS:
    p = Patient.objects.filter(patient_id=pid).first()
    if not p:
        print(f"{pid:<12}  NOT FOUND")
        continue
    c = counts(p.id)
    name = p.get_full_name()[:28]
    print(f"{pid:<12}  {p.category:<11}  {name:<28}  ", end="")
    print("  ".join(f"{c[l]:>8}" for l in labels))


print()
print("=" * 78)
print("Visit detail for each patient (first 5 per patient)")
print("=" * 78)
for pid, _ in RECORDS:
    p = Patient.objects.filter(patient_id=pid).first()
    if not p:
        continue
    print(f"\n--- {pid}  ({p.get_full_name()}) ---")
    visits = Visit.objects.filter(patient_id=p.id).order_by("-date", "-time")[:5]
    if not visits:
        print("  (no visits)")
    for v in visits:
        print(f"  visit_id={v.visit_id}  date={v.date}  status={v.status}  type={v.visit_type}  clinic={v.clinic}")


print()
print("=" * 78)
print("Sanity: any OTHER patients that reference E-93610 or E-A3755 via principal_staff")
print("=" * 78)
for pid in ["E-93610", "E-A3755"]:
    p = Patient.objects.filter(patient_id=pid).first()
    if not p:
        continue
    others = Patient.objects.filter(principal_staff_id=p.id).exclude(patient_id__in=[r[0] for r in RECORDS])
    print(f"\n  {pid} (ID={p.id}) has {others.count()} other dependents:")
    for o in others:
        print(f"    {o.patient_id}  {o.get_full_name()}  DOB={o.date_of_birth}  active={o.is_active}")
