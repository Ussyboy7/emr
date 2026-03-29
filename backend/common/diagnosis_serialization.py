"""
ICD-10 diagnosis payloads for orders linked to a consultation session or visit.
Used by pharmacy, laboratory, and radiology serializers.
"""

from __future__ import annotations

from typing import Any, List


def serialize_icd10_diagnoses_for_order(
    consultation_session: Any = None,
    visit: Any = None,
    patient: Any = None,
) -> List[dict]:
    """
    Return sorted list of {code, name, type, notes} for diagnoses on session or visit.

    Primary/Secondary/Differential follows consultation Diagnosis.certainty
    (confirmed -> Primary, probable -> Secondary, else Differential).
    """
    diagnoses: list = []

    if consultation_session is not None and getattr(consultation_session, "id", None):
        try:
            diagnoses = list(consultation_session.diagnoses.all())
        except Exception:
            diagnoses = []
    elif visit is not None and getattr(visit, "id", None):
        try:
            from consultation.models import Diagnosis

            qs = Diagnosis.objects.filter(visit_id=visit.id).select_related("icd10_code")
            if patient is not None and getattr(patient, "id", None):
                qs = qs.filter(patient_id=patient.id)
            diagnoses = list(qs.order_by("-diagnosed_at"))
        except Exception:
            diagnoses = []
    else:
        return []

    out = []
    for d in diagnoses:
        cert = (getattr(d, "certainty", None) or "").lower()
        if cert == "confirmed":
            dtype = "Primary"
        elif cert == "probable":
            dtype = "Secondary"
        else:
            dtype = "Differential"
        icd = getattr(d, "icd10_code", None)
        code = icd.code if icd else ""
        name = (icd.description if icd else "") or (getattr(d, "diagnosis_text", None) or "").strip()
        out.append(
            {
                "code": code,
                "name": name,
                "type": dtype,
                "notes": getattr(d, "notes", None) or "",
            }
        )

    order = {"Primary": 0, "Secondary": 1, "Differential": 2}
    out.sort(key=lambda x: (order.get(x["type"], 9), x["code"] or ""))
    return out
