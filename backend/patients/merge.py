"""
Generic patient-merge logic.

Used by:
  - backend/scripts/merge_nura_umar.py  (one-off for the duplicate case)
  - the future /api/v1/patients/{id}/merge/ endpoint

Performs a soft merge:
  - All clinical FKs (visits, lab orders, prescriptions, …) are re-pointed
    from loser to winner via bulk UPDATE.
  - Self-FKs (e.g. `principal_staff` for dependents of the loser) are
    re-pointed to winner.
  - OneToOne related models (MedicalHistory) are either re-pointed or
    merged (winner keeps its row, loser's non-empty fields are copied
    over, then the loser's row is deleted).
  - For each non-unique Patient field, if the winner's value is empty
    and the loser's is non-empty, the loser's value is copied to the
    winner.
  - The loser's `patient_id` is tombstoned to `MERGED-{loser.id}-{date}`
    to free the unique constraint; `is_active=False`, `merged_into`,
    `merged_at`, `merge_reason` are set.
  - A `PatientMerge` audit row is written with full snapshots of both
    records and per-model repointed counts.

Reversible: `unmerge_patients()` uses the `repointed_rows` JSON stored on
the `PatientMerge` audit row to accurately revert all FK re-points and
restore the loser's tombstone record.
"""
from __future__ import annotations

from datetime import date

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from patients.models import (
    MedicalHistory,
    Patient,
    PatientMerge,
)


# Models with a `patient` FK → Patient. (model, related_name_or_fk_field)
RELATED_TO_PATIENT = [
    "patients.Visit",
    "patients.VitalReading",
    "patients.MedicalCertificate",
    "laboratory.LabOrder",
    "laboratory.LabResult",
    "pharmacy.Prescription",
    "consultation.ConsultationSession",
    "consultation.ConsultationQueue",
    "consultation.Referral",
    "consultation.Diagnosis",
    "wards.PatientAdmission",
    "physiotherapy.PhysioOrder",
    "eyecare.EyeOrder",
    "nursing.NursingOrder",
    "nursing.Procedure",
    "radiology.RadiologyOrder",
    "radiology.RadiologyReport",
    "appointments.Appointment",
]

# Maps related-model app_label.ModelName → field name on PatientMerge audit.
RELATED_AUDIT_FIELD = {
    "Visit":              "visits_repointed",
    "VitalReading":       "vital_readings_repointed",
    "LabOrder":           "lab_orders_repointed",
    "LabResult":          "lab_results_repointed",
    "Prescription":       "prescriptions_repointed",
    "ConsultationSession": "consult_sessions_repointed",
    "ConsultationQueue":  "queue_items_repointed",
    "Referral":           "referrals_repointed",
    "Diagnosis":          "diagnoses_repointed",
    "PatientAdmission":   "admissions_repointed",
    "PhysioOrder":        "physio_orders_repointed",
    "EyeOrder":           "eye_orders_repointed",
    "NursingOrder":       "nursing_orders_repointed",
    "Procedure":          "procedures_repointed",
    "RadiologyOrder":     "radiology_orders_repointed",
    "RadiologyReport":    "radiology_reports_repointed",
    "Appointment":        "appointments_repointed",
    "MedicalCertificate": "medical_certs_repointed",
}

# OneToOne models that point to Patient.
ONETOONE_TO_PATIENT = [
    ("patients.MedicalHistory", MedicalHistory),
]

# Patient fields to copy from loser to winner when winner is empty.
PATIENT_COPY_FIELDS = [
    "phone",
    "email",
    "residential_address",
    "state_of_residence",
    "state_of_origin",
    "lga",
    "permanent_address",
    "blood_group",
    "genotype",
    "allergies",
    "religion",
    "tribe",
    "nok_surname",
    "nok_first_name",
    "nok_middle_name",
    "nok_relationship",
    "nok_address",
    "nok_phone",
]

# Self-FKs on Patient (dependents, etc.) that should re-point to winner.
PATIENT_SELF_FKS = [
    "principal_staff",
]


def _import_model(qualified_name: str):
    """Lazy-import a model from 'app_label.ModelName' string."""
    app_label, model_name = qualified_name.split(".")
    from django.apps import apps
    return apps.get_model(app_label, model_name)


def _is_admin(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if user.is_superuser:
        return True
    role = (getattr(user, "system_role", "") or "").strip().lower()
    return role in {"system administrator", "admin staff"}


def merge_patients(winner_id: int, loser_id: int, user, reason: str) -> dict:
    """
    Merge two Patient records. See module docstring.

    Returns:
        dict with keys: winner_id, loser_id, counters (dict of audit_field→int),
        merge_audit_id.

    Raises:
        ValidationError on invalid merge (self-merge, already merged).
        PermissionDenied if user is not an admin.
    """
    if winner_id == loser_id:
        raise ValidationError("Cannot merge a record with itself.")
    if not _is_admin(user):
        raise PermissionDenied(
            "Only super admin or admin users can merge patients."
        )

    with transaction.atomic():
        winner = Patient.objects.select_for_update().get(pk=winner_id)
        loser = Patient.objects.select_for_update().get(pk=loser_id)

        if loser.merged_into_id is not None:
            raise ValidationError(
                f"Loser patient {loser.patient_id} is already merged "
                f"into patient_id={loser.merged_into_id}."
            )
        if winner.merged_into_id is not None:
            raise ValidationError(
                f"Winner patient {winner.patient_id} is itself a merged record. "
                "Choose a non-merged record as the winner."
            )

        # 1) Snapshots (preserved forever in the audit row).
        from patients.serializers import PatientSerializer
        winner_snap = PatientSerializer(winner).data
        loser_snap = PatientSerializer(loser).data

        counters = {}
        repointed_rows = {}  # model_name → [list of PKs] (for un-merge)

        # 2) Re-point FK-to-Patient for every related model.
        for qualified in RELATED_TO_PATIENT:
            model = _import_model(qualified)
            model_name = model.__name__
            audit_field = RELATED_AUDIT_FIELD.get(model_name)
            if not audit_field:
                continue
            rows = list(
                model.objects.filter(patient_id=loser)
                .exclude(patient_id=winner)  # safety
                .values_list("pk", flat=True)
            )
            if rows:
                model.objects.filter(pk__in=rows).update(patient_id=winner)
                repointed_rows[model_name] = rows
            counters[audit_field] = counters.get(audit_field, 0) + len(rows)

        # 3) Handle OneToOne (MedicalHistory).
        mh_audit_repointed = 0
        mh_audit_merged = 0
        oto_entries = {}
        for qualified, model in ONETOONE_TO_PATIENT:
            model_name = model.__name__
            try:
                loser_oh = model.objects.get(patient=loser)
            except model.DoesNotExist:
                continue
            try:
                winner_oh = model.objects.get(patient=winner)
            except model.DoesNotExist:
                # No conflict — re-point loser's row to winner.
                loser_oh.patient = winner
                loser_oh.save()
                oto_entries[model_name] = {"pk": loser_oh.pk, "action": "repoint"}
                mh_audit_repointed += 1
                continue
            # Both have a row — merge fields then delete loser.
            for f in model._meta.get_fields():
                if f.name in {"id", "patient"} or f.auto_created:
                    continue
                if not hasattr(winner_oh, f.name):
                    continue
                winner_val = getattr(winner_oh, f.name)
                loser_val = getattr(loser_oh, f.name)
                if not winner_val and loser_val:
                    setattr(winner_oh, f.name, loser_val)
            winner_oh.save()
            oto_entries[model_name] = {"action": "merged", "pk": loser_oh.pk}
            loser_oh.delete()
            mh_audit_merged += 1
        if oto_entries:
            repointed_rows["__onetoone__"] = oto_entries
        counters["medical_history_repointed"] = mh_audit_repointed
        counters["medical_history_merged"] = mh_audit_merged

        # 4) Re-point self-FKs (dependents of the loser → winner).
        deps_repointed = 0
        dep_rows = {}
        for fk_field in PATIENT_SELF_FKS:
            pks = list(
                Patient.objects.filter(**{fk_field: loser})
                .exclude(pk=winner.pk)  # safety
                .values_list("pk", flat=True)
            )
            if pks:
                Patient.objects.filter(pk__in=pks).update(**{fk_field: winner})
                dep_rows[fk_field] = pks
            deps_repointed += len(pks)
        if dep_rows:
            repointed_rows["__self_fks__"] = dep_rows
        counters["dependents_repointed"] = deps_repointed

        # 5) Copy empty fields from loser to winner.
        copied = []
        for f in PATIENT_COPY_FIELDS:
            w_val = getattr(winner, f, None)
            l_val = getattr(loser, f, None)
            if not w_val and l_val:
                setattr(winner, f, l_val)
                copied.append(f)
        if copied:
            winner.save(update_fields=copied + ["updated_at"])

        # 6) Tombstone the loser. patient_id must change to free the unique
        #    constraint; is_active=False and merged_into set.
        old_patient_id = loser.patient_id
        loser.patient_id = f"MERGED-{loser.id}-{date.today().isoformat()}"
        loser.is_active = False
        loser.merged_into = winner
        loser.merged_at = timezone.now()
        loser.merge_reason = reason
        loser.save(
            update_fields=[
                "patient_id",
                "is_active",
                "merged_into",
                "merged_at",
                "merge_reason",
                "updated_at",
            ]
        )

        # 7) Audit row.
        audit = PatientMerge.objects.create(
            winner=winner,
            loser=loser,
            merged_by=user,
            reason=reason,
            winner_snapshot=winner_snap,
            loser_snapshot=loser_snap,
            repointed_rows=repointed_rows,
            **counters,
        )

    return {
        "winner_id": winner.id,
        "winner_patient_id": winner.patient_id,
        "loser_id": loser.id,
        "loser_old_patient_id": old_patient_id,
        "loser_new_patient_id": loser.patient_id,
        "counters": counters,
        "merge_audit_id": audit.id,
        "repointed_rows": repointed_rows,
    }


def unmerge_patients(audit_id: int, user) -> dict:
    """
    Reverse a patient merge identified by *audit_id*.

    Uses the ``repointed_rows`` JSON from the ``PatientMerge`` audit row to
    accurately re-point FKs back from the winner to the loser, then restores
    the loser's tombstone record (``patient_id``, ``is_active``, ``merged_into``,
    ``merged_at``, ``merge_reason``).

    Raises:
        PatientMerge.DoesNotExist if audit_id is invalid.
        PermissionDenied if user is not an admin.
        ValidationError if the audit row has no repointed_rows data
            (legacy merge that cannot be automatically reversed).
    """
    if not _is_admin(user):
        raise PermissionDenied(
            "Only super admin or admin users can un-merge patients."
        )

    with transaction.atomic():
        audit = PatientMerge.objects.select_related(
            "winner", "loser"
        ).select_for_update().get(pk=audit_id)

        winner = audit.winner
        loser = audit.loser
        orig_loser_patient_id = audit.loser_snapshot.get("patient_id", loser.patient_id)

        if not audit.repointed_rows:
            raise ValidationError(
                "This merge was performed before repointed_rows was stored; "
                "automatic un-merge is not possible. Contact a developer to "
                "reverse manually from the audit snapshots."
            )

        repointed = audit.repointed_rows

        # 1) Re-point FK-to-Patient rows back: winner → loser.
        for qualified in RELATED_TO_PATIENT:
            model = _import_model(qualified)
            model_name = model.__name__
            pks = repointed.get(model_name, [])
            if pks:
                n = model.objects.filter(pk__in=pks, patient_id=winner).update(
                    patient_id=loser
                )
                if n != len(pks):
                    pass  # Some rows may have been deleted since merge; that's OK.

        # 2) Handle OneToOne reversal.
        oto = repointed.get("__onetoone__", {})
        for qualified, model_cls in ONETOONE_TO_PATIENT:
            model_name = model_cls.__name__
            entry = oto.get(model_name)
            if not entry:
                continue
            if entry.get("action") == "repoint":
                # Re-point the row back to the loser.
                try:
                    oh = model_cls.objects.get(pk=entry["pk"])
                except model_cls.DoesNotExist:
                    continue
                oh.patient = loser
                oh.save()
            elif entry.get("action") == "merged":
                # Row was merged & deleted — skip (can't split merged data).
                pass

        # 3) Re-point self-FKs back: winner → loser.
        sfk = repointed.get("__self_fks__", {})
        for fk_field, pks in sfk.items():
            actual = Patient.objects.filter(pk__in=pks, **{fk_field: winner})
            if actual.exists():
                actual.update(**{fk_field: loser})

        # 4) Restore the loser's tombstone record.
        loser.patient_id = orig_loser_patient_id
        loser.is_active = True
        loser.merged_into = None
        loser.merged_at = None
        loser.merge_reason = ""
        loser.save(
            update_fields=[
                "patient_id",
                "is_active",
                "merged_into",
                "merged_at",
                "merge_reason",
                "updated_at",
            ]
        )

        # 5) Write an un-merge audit row (winner/loser swapped roles).
        unmerge_audit = PatientMerge.objects.create(
            winner=winner,
            loser=loser,
            merged_by=user,
            reason=f"UNMERGED: {audit.reason}",
            winner_snapshot=audit.winner_snapshot,
            loser_snapshot=audit.loser_snapshot,
            repointed_rows={},
        )

    return {
        "audit_id": unmerge_audit.id,
        "original_audit_id": audit.id,
        "winner_id": winner.id,
        "winner_patient_id": winner.patient_id,
        "loser_id": loser.id,
        "loser_patient_id": loser.patient_id,
    }
