"""
Clinic-owned ICD-10 diagnoses on physiotherapy and eye clinic treatment episodes.

The referring doctor already records diagnoses on the consultation linked to an
order. These fields belong to the treating clinic instead, so the physio and
ophthalmology diagnosis reports can count clinic conclusions rather than
inherited medical codes.
"""

from __future__ import annotations

from typing import Any

from django.db.models.functions import Lower
from rest_framework import serializers

DIAGNOSIS_TYPES = ("Primary", "Secondary", "Differential")
MAX_CLINIC_DIAGNOSES = 20


def _clean_type(value: Any) -> str:
    dtype = str(value or "Primary").strip().title()
    return dtype if dtype in DIAGNOSIS_TYPES else "Primary"


def normalize_clinic_diagnoses(value: Any) -> list[dict]:
    """Validate and normalize ``[{code, name, type}]`` rows for storage."""
    from consultation.models import ICD10Code

    if value in (None, "", []):
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError("clinic_diagnoses must be a list of {code, name, type} rows.")
    if len(value) > MAX_CLINIC_DIAGNOSES:
        raise serializers.ValidationError(
            f"At most {MAX_CLINIC_DIAGNOSES} clinic diagnoses can be recorded."
        )

    rows: list[dict] = []
    seen: set[str] = set()
    for raw in value:
        if not isinstance(raw, dict):
            raise serializers.ValidationError("Each clinic diagnosis must be a {code, name, type} object.")
        code = str(raw.get("code") or "").strip().upper()
        if not code:
            raise serializers.ValidationError("Each clinic diagnosis needs an ICD-10 code.")
        if code in seen:
            continue
        seen.add(code)
        rows.append(
            {
                "code": code,
                "name": str(raw.get("name") or raw.get("description") or "").strip(),
                "type": _clean_type(raw.get("type")),
            }
        )

    if not rows:
        return []

    # Match case-insensitively so a stored code of any casing still validates.
    known = {
        code.upper(): description
        for code, description in ICD10Code.objects.annotate(code_lower=Lower("code"))
        .filter(code_lower__in=sorted(code.lower() for code in seen))
        .values_list("code", "description")
    }
    missing = sorted(code for code in seen if code not in known)
    if missing:
        raise serializers.ValidationError(
            f"Unknown ICD-10 code(s): {', '.join(missing)}."
        )

    return [
        {
            "code": row["code"],
            "name": row["name"] or known[row["code"]],
            "type": row["type"],
        }
        for row in rows
    ]


def clinic_diagnoses_rows(value: Any) -> list[dict]:
    """Tolerant read used by reports; malformed or empty rows are skipped."""
    out: list[dict] = []
    if not isinstance(value, list):
        return out
    seen: set[str] = set()
    for raw in value:
        if not isinstance(raw, dict):
            continue
        code = str(raw.get("code") or "").strip().upper()
        name = str(raw.get("name") or raw.get("description") or "").strip()
        if not code and not name:
            continue
        if code:
            if code in seen:
                continue
            seen.add(code)
        out.append({"code": code, "name": name, "type": _clean_type(raw.get("type"))})
    return out


class ClinicDiagnosesValidationMixin:
    """Serializer mixin: validate ``clinic_diagnoses`` on write."""

    def validate_clinic_diagnoses(self, value):
        return normalize_clinic_diagnoses(value)
