"""
Synthetic test for merge + un-merge round-trip on local DB.

Run from the backend/ directory with:
    docker exec emr-backend-local python scripts/test_merge_unmerge_roundtrip.py

Creates two throwaway patients (with a Visit, a VitalReading, and a
MedicalHistory each), runs merge_patients(), then unmerge_patients(),
and asserts the data ends up in the original state.
"""
import os
import sys
import django

# This script lives in /app/scripts. Add /app to sys.path so 'emr_backend' resolves.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "emr_backend.settings")
django.setup()

from datetime import date
from django.contrib.auth import get_user_model
from patients.models import Patient, MedicalHistory, Visit, VitalReading
from patients.merge import merge_patients, unmerge_patients

User = get_user_model()

# Find a superuser to act as the merger.
admin = User.objects.filter(is_superuser=True).first()
if not admin:
    sys.exit("No superuser found in local DB. Run `make seed` first.")

# 1) Create two synthetic patients.
suffix = date.today().isoformat().replace("-", "") + "-x"
winner, _ = Patient.objects.update_or_create(
    patient_id=f"TEST-WINNER-{suffix}",
    defaults=dict(
        category="nonnpa",
        surname="TestWinner",
        first_name="Mer",
        gender="male",
        date_of_birth="1990-01-01",
        phone="08000000001",
    ),
)
loser, _ = Patient.objects.update_or_create(
    patient_id=f"TEST-LOSER-{suffix}",
    defaults=dict(
        category="nonnpa",
        surname="TestLoser",
        first_name="Unmer",
        gender="male",
        date_of_birth="1990-01-01",
        phone="08000000002",
    ),
)
print(f"Winner pk={winner.pk} id={winner.patient_id}")
print(f"Loser  pk={loser.pk} id={loser.patient_id}")

# Create one Visit + one VitalReading on each patient.
v_winner = Visit.objects.create(patient=winner, visit_id=f"TVW-{suffix}", date="2026-06-01", time="09:00")
v_loser = Visit.objects.create(patient=loser, visit_id=f"TVL-{suffix}", date="2026-06-01", time="09:00")
VitalReading.objects.create(patient=winner, visit=v_winner, temperature=37.0, heart_rate=72)
VitalReading.objects.create(patient=loser, visit=v_loser, temperature=37.1, heart_rate=70)

# Pre-existing medical history on both — to test the OneToOne-merge path.
MedicalHistory.objects.get_or_create(patient=winner, defaults={"diagnoses": ["diabetes"]})
MedicalHistory.objects.get_or_create(patient=loser, defaults={"allergies": ["penicillin"]})

# 2) Run merge.
print("\n=== MERGE ===")
result = merge_patients(
    winner_id=winner.pk, loser_id=loser.pk, user=admin,
    reason="[test] synthetic merge for un-merge round-trip",
)
print(f"  result keys: {list(result.keys())}")
print(f"  counters: {result['counters']}")
print(f"  repointed_rows keys: {list(result['repointed_rows'].keys())}")

# Refresh from DB.
winner.refresh_from_db()
loser.refresh_from_db()

# Assertions post-merge.
assert loser.is_active is False, f"loser should be inactive, got {loser.is_active}"
assert loser.merged_into_id == winner.pk, f"loser.merged_into should be winner, got {loser.merged_into_id}"
assert loser.patient_id.startswith("MERGED-"), f"loser.patient_id should be MERGED-..., got {loser.patient_id}"
mh_count_winner = MedicalHistory.objects.filter(patient=winner).count()
assert mh_count_winner == 1, f"winner should have 1 MedicalHistory (merged), got {mh_count_winner}"
mh_count_loser = MedicalHistory.objects.filter(patient=loser).count()
assert mh_count_loser == 0, f"loser should have 0 MedicalHistory, got {mh_count_loser}"

# Both visits and vitals should now be on the winner.
v_loser.refresh_from_db()
assert v_loser.patient_id == winner.pk, f"v_loser.patient should be winner, got {v_loser.patient_id}"
vital_loser = VitalReading.objects.get(visit=v_loser)
assert vital_loser.patient_id == winner.pk, f"vital_loser.patient should be winner, got {vital_loser.patient_id}"
print("  PASS: loser tombstoned, clinical FKs re-pointed to winner, MH merged")

# 3) Run un-merge.
print("\n=== UN-MERGE ===")
audit_id = result["merge_audit_id"]
unmerge_result = unmerge_patients(audit_id=audit_id, user=admin)
print(f"  result: {unmerge_result}")

# Refresh.
winner.refresh_from_db()
loser.refresh_from_db()

# Assertions post-un-merge.
assert loser.is_active is True, f"loser should be re-activated, got {loser.is_active}"
assert loser.merged_into_id is None, f"loser.merged_into should be None, got {loser.merged_into_id}"
assert loser.merged_at is None, f"loser.merged_at should be None"
assert loser.patient_id == f"TEST-LOSER-{suffix}", f"loser.patient_id should be restored to TEST-LOSER-..., got {loser.patient_id}"
# Visit + VitalReading re-pointed back to loser.
v_loser.refresh_from_db()
assert v_loser.patient_id == loser.pk, f"v_loser.patient should be loser, got {v_loser.patient_id}"
vital_loser = VitalReading.objects.get(visit=v_loser)
assert vital_loser.patient_id == loser.pk, f"vital_loser.patient should be loser, got {vital_loser.patient_id}"
# Winner's own visit/vital are still on winner (untouched).
v_winner.refresh_from_db()
assert v_winner.patient_id == winner.pk, f"v_winner.patient should still be winner, got {v_winner.patient_id}"
# After un-merge the loser's MedicalHistory is NOT restored (the merge was a
# field-level merge with deletion; we can't auto-split it back). The winner
# keeps the merged row.
print("  PASS: loser restored, clinical FKs re-pointed back, winner untouched")

# 4) Clean up the test patients.
print("\n=== CLEANUP ===")
from patients.models import PatientMerge
# PatientMerge has on_delete=PROTECT, so delete audit rows first.
PatientMerge.objects.filter(reason__startswith="[test]").delete()
PatientMerge.objects.filter(reason__startswith="UNMERGED: [test]").delete()
Patient.objects.filter(pk__in=[winner.pk, loser.pk]).delete()
print("  PASS: cleaned up test patients and audit rows")
print("\nAll assertions passed. Round-trip works.")
