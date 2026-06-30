"""Bed occupancy helpers for ward admissions."""
from __future__ import annotations

from django.utils import timezone

from wards.models import Bed, PatientAdmission


def clear_admission_bed(admission: PatientAdmission) -> Bed | None:
    """Release the patient's current bed, if any."""
    old_bed = admission.bed
    if not old_bed:
        return None

    old_ward = old_bed.ward
    old_bed.current_patient = None
    old_bed.status = 'available'
    old_bed.admission_date = None
    old_bed.save(update_fields=['current_patient', 'status', 'admission_date'])
    old_ward.recalculate_occupancy()
    return old_bed


def assign_admission_bed(admission: PatientAdmission, bed: Bed) -> None:
    """Occupy a bed for an admitted patient (same ward only)."""
    if bed.ward_id != admission.ward_id:
        raise ValueError("Bed does not belong to this patient's ward")

    if (
        bed.status == 'occupied'
        and bed.current_patient_id
        and bed.current_patient_id != admission.patient_id
    ):
        raise ValueError('Bed is already occupied by another patient')

    old_bed = admission.bed
    if old_bed and old_bed.id != bed.id:
        clear_admission_bed(admission)

    bed.current_patient = admission.patient
    bed.status = 'occupied'
    bed.admission_date = admission.admission_date or timezone.now()
    bed.save(update_fields=['current_patient', 'status', 'admission_date'])

    admission.bed = bed
    admission.save(update_fields=['bed'])
    admission.ward.recalculate_occupancy()


def sync_bed_occupancy_after_admission_create(admission: PatientAdmission) -> None:
    """Mark bed occupied when admission is created with a bed FK."""
    if not admission.bed_id:
        return
    bed = Bed.objects.select_related('ward').filter(pk=admission.bed_id).first()
    if not bed:
        admission.bed = None
        admission.save(update_fields=['bed'])
        return
    if bed.ward_id != admission.ward_id:
        admission.bed = None
        admission.save(update_fields=['bed'])
        return
    assign_admission_bed(admission, bed)
