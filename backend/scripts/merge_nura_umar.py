"""
One-off merge for the Mr UMAR SALIHU MOHAMMED duplicate case.

Background:
  - Original Staff record:    E-93610   (Mr MUHAMMAD UMAR SALIHU)
                              ED-93610-1 (Mrs NURA RABIAT — spouse)
  - Duplicate Officer record: E-A3755   (Mr UMAR SALIHU MOHAMMED)
                              ED-A3755-1 (Mrs NURA RABIAT — spouse, currently ORPHAN)
                              ED-A3755-2 (Mr UMAR SALMAN — child, UNTOUCHED)
  - Records officer did not know about the Convert-Staff-to-Officer flow,
    so created new records under a new personal number rather than
    promoting the originals.

Goal: merge everything to the A3755 records. End state:
  - E-A3755  (active, keeps its current data — division, location, phone, …)
  - ED-A3755-1 (active, principal_staff re-pointed to E-A3755)
  - ED-A3755-2 (untouched child)

This is a TWO-MERGE operation:
  1. Merge employee   E-93610    → E-A3755     (re-points clinical data +
                                                 re-points ED-93610-1's
                                                 principal_staff to E-A3755)
  2. Merge dependent  ED-93610-1 → ED-A3755-1  (re-points clinical data)

Idempotent guards: each merge refuses if the loser is already merged.

Run on prod:
  docker exec -i emr-backend-prod bash -c 'cd /app && PYTHONPATH=/app python scripts/merge_nura_umar.py'

DRY-RUN by default (--apply to actually run the merge).
"""
import argparse
import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "emr_backend.settings")
django.setup()

from django.contrib.auth import get_user_model
from patients.models import Patient
from patients.merge import merge_patients


User = get_user_model()


def get_admin_user():
    """Pick the first superuser. Used as the merged_by attribution."""
    return User.objects.filter(is_superuser=True).order_by("id").first()


def show_state(label, patient_ids):
    print(f"\n=== {label} ===")
    for pid in patient_ids:
        p = Patient.objects.filter(patient_id=pid).first()
        if not p:
            print(f"  {pid}: NOT FOUND")
            continue
        principal = p.principal_staff
        print(
            f"  {pid}: active={p.is_active}  merged_into={p.merged_into_id}  "
            f"principal_staff_id={p.principal_staff_id}  "
            f"({p.get_full_name()})"
        )
        if principal:
            print(f"    principal: {principal.patient_id}  {principal.get_full_name()}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually run the merge. Default is dry-run (prints what would happen).",
    )
    args = parser.parse_args()

    admin = get_admin_user()
    if not admin:
        print("ERROR: no superuser found in DB. Aborting.")
        sys.exit(1)
    print(f"Merging as user: {admin.username}  (is_superuser={admin.is_superuser})")

    # ---- Resolve records ----
    emp_winner = Patient.objects.filter(patient_id="E-A3755").first()
    emp_loser = Patient.objects.filter(patient_id="E-93610").first()
    dep_winner = Patient.objects.filter(patient_id="ED-A3755-1").first()
    dep_loser = Patient.objects.filter(patient_id="ED-93610-1").first()
    child = Patient.objects.filter(patient_id="ED-A3755-2").first()

    if not all([emp_winner, emp_loser, dep_winner, dep_loser, child]):
        print("ERROR: missing one of the expected records. Aborting.")
        print(
            f"  E-A3755={emp_winner}  E-93610={emp_loser}  "
            f"ED-A3755-1={dep_winner}  ED-93610-1={dep_loser}  "
            f"ED-A3755-2={child}"
        )
        sys.exit(1)

    if emp_winner.merged_into_id or emp_loser.merged_into_id:
        print("ERROR: employees already merged. Aborting to prevent double-merge.")
        sys.exit(1)
    if dep_winner.merged_into_id or dep_loser.merged_into_id:
        print("ERROR: dependents already merged. Aborting to prevent double-merge.")
        sys.exit(1)

    show_state(
        "BEFORE",
        ["E-A3755", "E-93610", "ED-A3755-1", "ED-93610-1", "ED-A3755-2"],
    )

    if not args.apply:
        print("\n=== DRY-RUN — no changes made. Re-run with --apply to merge. ===")
        return

    # ---- Merge 1: employee E-93610 → E-A3755 ----
    print("\n=== Merge 1: E-93610 → E-A3755 (employee) ===")
    result1 = merge_patients(
        winner_id=emp_winner.id,
        loser_id=emp_loser.id,
        user=admin,
        reason=(
            "Duplicate employee created when records officer promoted staff to "
            "officer by creating a new record instead of using the convert flow. "
            "Merging original (E-93610) into the officer record (E-A3755). "
            "E-A3755 retains its division, location, phone, emp_type=Officer; "
            "E-93610 (Staff) is tombstoned."
        ),
    )
    print(f"  winner_id={result1['winner_id']}  loser_id={result1['loser_id']}")
    print(f"  loser tombstoned: {result1['loser_old_patient_id']} → {result1['loser_new_patient_id']}")
    for k, v in result1["counters"].items():
        print(f"  {k}: {v}")
    print(f"  audit row: PatientMerge #{result1['merge_audit_id']}")

    # ---- Merge 2: dependent ED-93610-1 → ED-A3755-1 ----
    print("\n=== Merge 2: ED-93610-1 → ED-A3755-1 (dependent/spouse) ===")
    result2 = merge_patients(
        winner_id=dep_winner.id,
        loser_id=dep_loser.id,
        user=admin,
        reason=(
            "Duplicate spouse dependent created alongside the duplicate employee. "
            "Same name (Mrs NURA RABIAT) and same DOB (1998-10-18). "
            "Merging original (ED-93610-1) into the duplicate (ED-A3755-1), "
            "which is re-linked to E-A3755. The child (ED-A3755-2) is untouched."
        ),
    )
    print(f"  winner_id={result2['winner_id']}  loser_id={result2['loser_id']}")
    print(f"  loser tombstoned: {result2['loser_old_patient_id']} → {result2['loser_new_patient_id']}")
    for k, v in result2["counters"].items():
        print(f"  {k}: {v}")
    print(f"  audit row: PatientMerge #{result2['merge_audit_id']}")

    # ---- Re-link orphan: ED-A3755-1's principal_staff → E-A3755 ----
    print("\n=== Re-link ED-A3755-1.principal_staff → E-A3755 (was orphaned) ===")
    dep_winner.refresh_from_db()
    if dep_winner.principal_staff_id is None:
        dep_winner.principal_staff = emp_winner
        dep_winner.save(update_fields=["principal_staff", "updated_at"])
        print(f"  Re-linked. ED-A3755-1.principal_staff_id = {dep_winner.principal_staff_id}")
    else:
        print(f"  Already linked to principal_staff_id={dep_winner.principal_staff_id}")

    show_state(
        "AFTER",
        ["E-A3755", "E-93610", "ED-A3755-1", "ED-93610-1", "ED-A3755-2"],
    )

    print("\n=== DONE ===")


if __name__ == "__main__":
    main()
