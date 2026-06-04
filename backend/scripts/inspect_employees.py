"""Targeted lookup of E-93610 + E-A3755 (the duplicate employees) and all
related dependents, including any orphaned children of the duplicates.

Run on prod:
  docker exec -i emr-backend-prod bash -c 'cd /app && PYTHONPATH=/app python scripts/inspect_employees.py'
"""
import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "emr_backend.settings")
django.setup()

from patients.models import Patient


def fmt(p):
    if not p:
        return "(not found)"
    return (
        f"  ID={p.id}  patient_id={p.patient_id}  name={p.get_full_name()}  "
        f"category={p.category}  active={p.is_active}  DOB={p.date_of_birth}  "
        f"gender={p.gender}  created={p.created_at.date()}  "
        f"PN={p.personal_number!r}  emp_type={p.employee_type!r}  "
        f"division={p.division!r}  location={p.location!r}  "
        f"phone={p.phone!r}  email={p.email!r}  "
        f"principal_staff_id={p.principal_staff_id}"
    )


def header(s):
    print()
    print("=" * 78)
    print(s)
    print("=" * 78)


for pid in ["E-93610", "E-A3755"]:
    header(f"Lookup {pid}")
    p = Patient.objects.filter(patient_id=pid).first()
    if p:
        print(fmt(p))
        deps = Patient.objects.filter(principal_staff_id=p.id, category="dependent").order_by("patient_id")
        print(f"  Direct dependents: {deps.count()}")
        for d in deps:
            print("    " + fmt(d))
    else:
        print("  NOT FOUND")


header("Check for any patient with personal_number = '93610' or 'A3755'")
for pn in ["93610", "A3755"]:
    matches = Patient.objects.filter(personal_number__iexact=pn).order_by("patient_id")
    print(f"  personal_number={pn!r}: {matches.count()} match(es)")
    for m in matches:
        print("    " + fmt(m))


header("Sanity: dependents whose principal_staff_id is NULL but patient_id starts with ED-")
orphans = Patient.objects.filter(
    category="dependent",
    principal_staff_id__isnull=True,
    patient_id__startswith="ED-",
).order_by("patient_id")
print(f"  Count: {orphans.count()}")
for o in orphans:
    print("    " + fmt(o))
