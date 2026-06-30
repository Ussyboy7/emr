"""Mirror ward observation vitals into patient-wide VitalReading rows."""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from patients.models import VitalReading


_SPO2_RE = re.compile(r'^\s*SpO2\s*([0-9.]+)\s*%?\s*$', re.IGNORECASE)


def _parse_spo2_from_notes(notes: str) -> Decimal | None:
    for line in notes.splitlines():
        m = _SPO2_RE.match(line.strip())
        if not m:
            continue
        try:
            return Decimal(m.group(1))
        except InvalidOperation:
            return None
    return None


def _nurse_notes_without_spo2_line(notes: str) -> str:
    lines = [ln for ln in notes.splitlines() if not _SPO2_RE.match(ln.strip())]
    return '\n'.join(lines).strip()


def sync_observation_vital_to_patient_vitals(obs_vital) -> VitalReading | None:
    """
    Create a VitalReading so ward obs vitals appear in nursing vitals history
    and patient records. Returns None when admission/patient is missing.
    """
    from wards.models import PatientAdmission

    try:
        admission = PatientAdmission.objects.select_related('patient', 'visit', 'ward').get(
            pk=obs_vital.admission_id,
        )
    except PatientAdmission.DoesNotExist:
        return None

    patient = admission.patient
    visit = admission.visit
    if patient is None:
        return None

    raw_notes = (obs_vital.notes or '').strip()
    spo2 = _parse_spo2_from_notes(raw_notes)
    nurse_notes = _nurse_notes_without_spo2_line(raw_notes)

    ward_name = ''
    ward = getattr(admission, 'ward', None)
    if ward is not None:
        ward_name = getattr(ward, 'name', '') or ''
    prefix = f'[{ward_name} observation]' if ward_name else '[Ward observation]'

    if nurse_notes:
        notes_body = f'{prefix}\n{nurse_notes}' if not nurse_notes.startswith('[') else nurse_notes
    else:
        notes_body = prefix

    glucose_bits: list[str] = []
    if obs_vital.fbs_mmol is not None:
        glucose_bits.append(f'FBS {obs_vital.fbs_mmol} mmol/L')
    if obs_vital.rbs_mmol is not None:
        glucose_bits.append(f'RBS {obs_vital.rbs_mmol} mmol/L')
    if glucose_bits:
        notes_body = f'{notes_body}\n{", ".join(glucose_bits)}'.strip()

    return VitalReading.objects.create(
        patient=patient,
        visit=visit,
        temperature=obs_vital.temperature_c,
        blood_pressure_systolic=obs_vital.bp_systolic,
        blood_pressure_diastolic=obs_vital.bp_diastolic,
        heart_rate=obs_vital.pulse,
        respiratory_rate=obs_vital.respiratory_rate,
        oxygen_saturation=spo2,
        notes=notes_body,
        recorded_by=obs_vital.recorded_by,
    )
