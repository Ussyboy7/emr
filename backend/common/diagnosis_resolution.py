"""
Resolve ICD-10 diagnoses for orders and clinical reports.

Handles nursing-pool placeholders by falling back to the patient's last
structured consultation diagnosis.
"""

from __future__ import annotations

import re
from typing import Any, TypedDict

from consultation.models import Diagnosis

TYPE_PREFIX_RE = re.compile(r"^\[(Primary|Secondary|Differential)\]\s*", re.I)

NURSING_POOL_PLACEHOLDERS = frozenset(
    {
        "nursing pool check-in — physiotherapy",
        "nursing pool check-in — eye clinic",
    }
)


class ResolvedDiagnosis(TypedDict):
    code: str
    name: str
    type: str


def _is_placeholder_diagnosis(text: str) -> bool:
    return (text or "").strip().lower() in NURSING_POOL_PLACEHOLDERS


def parse_order_diagnosis_text(raw: str) -> list[ResolvedDiagnosis]:
    """Parse formatted order diagnosis text into ICD rows."""
    text = (raw or "").strip()
    if not text or _is_placeholder_diagnosis(text):
        return []

    if "\n" in text:
        chunks = [ln.strip() for ln in text.splitlines() if ln.strip()]
    elif re.search(r"\[(?:Primary|Secondary|Differential)\]", text, re.I):
        chunks = [
            part.strip()
            for part in re.split(r"(?=\[(?:Primary|Secondary|Differential)\]\s*)", text, flags=re.I)
            if part.strip()
        ]
    else:
        chunks = [text]

    out: list[ResolvedDiagnosis] = []
    for line in chunks:
        type_match = TYPE_PREFIX_RE.match(line)
        if type_match:
            dtype = type_match.group(1).title()
            rest = line[type_match.end() :].strip()
            dash = rest.find(" - ")
            if dash > 0:
                out.append(
                    {
                        "code": rest[:dash].strip(),
                        "name": rest[dash + 3 :].strip(),
                        "type": dtype,
                    }
                )
            else:
                out.append({"code": "", "name": rest, "type": dtype})
            continue

        dash = line.find(" - ")
        if dash > 0:
            out.append(
                {
                    "code": line[:dash].strip(),
                    "name": line[dash + 3 :].strip(),
                    "type": "Primary",
                }
            )
        elif line:
            out.append({"code": "", "name": line, "type": "Primary"})

    return [row for row in out if row["code"] or row["name"]]


def _diagnosis_model_rows(diagnoses: list) -> list[ResolvedDiagnosis]:
    out: list[ResolvedDiagnosis] = []
    for d in diagnoses:
        icd = getattr(d, "icd10_code", None)
        code = icd.code if icd else ""
        name = (icd.description if icd else "") or (getattr(d, "diagnosis_text", None) or "").strip()
        cert = (getattr(d, "certainty", None) or "").lower()
        if cert == "confirmed":
            dtype = "Primary"
        elif cert == "probable":
            dtype = "Secondary"
        else:
            dtype = "Differential"
        if code or name:
            out.append({"code": code, "name": name, "type": dtype})
    return out


def last_patient_diagnosis_rows(patient_id: int) -> list[ResolvedDiagnosis]:
    """Most recent completed consultation diagnoses for a patient."""
    if not patient_id:
        return []
    qs = (
        Diagnosis.objects.filter(
            patient_id=patient_id,
            icd10_code__isnull=False,
            session__status="completed",
        )
        .select_related("icd10_code", "session")
        .order_by("-diagnosed_at", "-id")
    )
    latest_session_id = qs.values_list("session_id", flat=True).first()
    if not latest_session_id:
        return []
    session_rows = list(qs.filter(session_id=latest_session_id))
    return _diagnosis_model_rows(session_rows)


def resolve_order_diagnoses(
    *,
    order: Any = None,
    patient_id: int | None = None,
    consultation_session: Any = None,
    diagnosis_text: str | None = None,
) -> list[ResolvedDiagnosis]:
    """
    Resolve all ICD-10 rows for an order-like record.

    Priority: session diagnoses → parsed order text → patient's last consultation.
    """
    session = consultation_session
    if session is None and order is not None:
        session = getattr(order, "consultation_session", None)

    if session is not None and getattr(session, "id", None):
        try:
            rows = _diagnosis_model_rows(list(session.diagnoses.select_related("icd10_code").all()))
            if rows:
                return rows
        except Exception:
            pass

    text = diagnosis_text
    if text is None and order is not None:
        text = getattr(order, "diagnosis", None) or ""
    parsed = parse_order_diagnosis_text(text or "")
    if parsed:
        return parsed

    pid = patient_id
    if pid is None and order is not None:
        pid = getattr(order, "patient_id", None)
    return last_patient_diagnosis_rows(pid or 0)


def format_diagnosis_rows(rows: list[ResolvedDiagnosis]) -> str:
    """Serialize resolved rows to order diagnosis text format."""
    lines: list[str] = []
    for row in rows:
        code = (row.get("code") or "").strip()
        name = (row.get("name") or "").strip()
        dtype = row.get("type") or "Primary"
        if code and name:
            lines.append(f"[{dtype}] {code} - {name}")
        elif name:
            lines.append(f"[{dtype}] {name}")
        elif code:
            lines.append(f"[{dtype}] {code}")
    return "\n".join(lines)


def resolve_patient_diagnosis_text(patient_id: int) -> str:
    rows = last_patient_diagnosis_rows(patient_id)
    return format_diagnosis_rows(rows)

