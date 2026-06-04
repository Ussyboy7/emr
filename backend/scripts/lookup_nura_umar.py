"""Quick lookup: where do ED-93610-1 and ED-A3755-1 actually live?

Run on prod:
  docker exec -i emr-backend-prod bash -c 'cd /app && PYTHONPATH=/app python scripts/lookup_nura_umar.py'
"""
import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "emr_backend.settings")
django.setup()

from patients.models import Patient


def fmt(p):
    if not p:
        return "(not found)"
    principal = p.principal_staff
    return (
        f"ID={p.id}  patient_id={p.patient_id}  name={p.get_full_name()}  "
        f"category={p.category}  active={p.is_active}  DOB={p.date_of_birth}  "
        f"gender={p.gender}  created={p.created_at.date()}  "
        f"principal_staff_id={p.principal_staff_id}  "
        f"principal_name={principal.get_full_name() if principal else None}  "
        f"principal_patient_id={principal.patient_id if principal else None}"
    )


print("=" * 78)
print("Direct lookup of ED-93610-1 and ED-A3755-1")
print("=" * 78)
for pid in ["ED-93610-1", "ED-A3755-1"]:
    p = Patient.objects.filter(patient_id=pid).first()
    print(f"\n{pid}:")
    if p:
        print("  " + fmt(p))
    else:
        print("  NOT FOUND")

print()
print("=" * 78)
print("All dependents with surname RABIAT (any principal)")
print("=" * 78)
rabiats = Patient.objects.filter(category="dependent", surname__iexact="RABIAT").order_by("patient_id")
print(f"Count: {rabiats.count()}")
for r in rabiats:
    print("  " + fmt(r))

print()
print("=" * 78)
print("All employees/retirees named like 'MUHAMMAD ... SALIHU' or '... SALIHU'")
print("=" * 78)
emps = Patient.objects.filter(
    category__in=["employee", "retiree"],
    surname__iexact="SALIHU",
).order_by("patient_id")
print(f"Count: {emps.count()}")
for e in emps:
    print("  " + fmt(e))

print()
print("=" * 78)
print("All dependents named NURA RABIAT or UMAR RABIAT (any case)")
print("=" * 78)
nura_umar = Patient.objects.filter(
    category="dependent", surname__iexact="RABIAT"
).filter(
    first_name__iregex=r"^(nura|umar)$"
).order_by("patient_id")
print(f"Count: {nura_umar.count()}")
for n in nura_umar:
    print("  " + fmt(n))
