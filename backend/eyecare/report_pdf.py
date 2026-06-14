"""NPA-letterhead PDF for eye clinic session reports (mirrors consultation/report_pdf.py)."""

from __future__ import annotations

import re
from io import BytesIO

from django.http import HttpResponse

from reportlab.lib.units import inch
from reportlab.platypus import Spacer

from common.date_display import format_display_datetime
from common.order_location import order_location_clinic_name
from common.pdf import (
    NPADocument,
    body_paragraph,
    data_table,
    patient_info_block,
    request_line,
    section_heading,
)


def _format_dt(value) -> str:
    if not value:
        return "—"
    try:
        return format_display_datetime(value) or "—"
    except Exception:
        return "—"


def _exam_row_key(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def _cell(value) -> str:
    text = str(value).strip() if value is not None else ""
    return text or "—"


_VISUAL_ACUITY_ROWS = (
    ("distanceUnaided", "Distance VA (Unaided)"),
    ("distanceAided", "Distance VA (Aided)"),
    ("pinhole", "Pinhole"),
    ("nearVa", "Near VA"),
)

_EXAMINATION_LABELS = (
    "Lid",
    "Conjunctiva",
    "Sclera",
    "Cornea",
    "Anterior Chamber (A/C)",
    "Iris",
    "Pupils",
    "Lens",
    "Optic Disc (CDR)",
    "Fundus",
)

_REFRACTION_GROUPS = (
    ("lensometry", "Lensometry"),
    ("autorefraction", "Autorefraction"),
    ("retinoscopy", "Retinoscopy"),
    ("subjective", "Subjective"),
)


def build_eye_session_pdf_bytes(session) -> bytes:
    """Render eye session SOAP as NPA PDF. Session must include order + patient."""
    order = session.order
    patient = order.patient
    pname = patient.get_full_name()
    pid = patient.patient_id or "—"
    age = getattr(patient, "age", None)
    gender = (patient.gender or "").upper() or "—"
    age_gender = f"{age} years / {gender}" if age is not None else gender

    clinician = order.ordered_by.get_full_name() if order.ordered_by else "—"
    location = order_location_clinic_name(order) or "—"

    duration_min = session.duration_minutes
    if duration_min is None and session.started_at and session.completed_at:
        duration_min = int(
            (session.completed_at - session.started_at).total_seconds() / 60
        )
    duration_str = f"{duration_min} min" if duration_min else "—"
    status_label = (session.status or "—").replace("_", " ").title()

    buffer = BytesIO()
    doc = NPADocument(
        buffer,
        department="OPHTHALMOLOGY / EYE CARE DEPARTMENT",
        document_title="EYE SESSION REPORT",
    )
    width = doc.usable_width
    story = []

    story.append(
        patient_info_block(
            left=[
                ("Patient Name", pname),
                ("Patient ID", pid),
                ("Age / Gender", age_gender),
            ],
            middle=[
                ("Location", location),
                ("Session", str(session.session_number or "—")),
                ("Clinician", clinician),
            ],
            right=[
                ("Scheduled", _format_dt(session.scheduled_at)),
                ("Completed", _format_dt(session.completed_at)),
                ("Duration", duration_str),
                ("Status", status_label),
            ],
            width=width,
        )
    )
    story.append(Spacer(1, 0.12 * inch))

    soap = session.soap_note if isinstance(session.soap_note, dict) else {}
    subj = soap.get("subjective") or {}
    obj = soap.get("objective") or {}
    assess = soap.get("assessment") or {}
    plan = soap.get("plan") or {}
    diag = obj.get("diagnostics") if isinstance(obj.get("diagnostics"), dict) else {}
    va = obj.get("visualAcuity") if isinstance(obj.get("visualAcuity"), dict) else {}
    exam = obj.get("examination") if isinstance(obj.get("examination"), dict) else {}
    refr = obj.get("refraction") if isinstance(obj.get("refraction"), dict) else {}

    story.append(section_heading("Subjective"))
    story.append(Spacer(1, 0.04 * inch))
    story.append(request_line("Chief Complaint", str(subj.get("chiefComplaint") or "—"), width=width))
    for label, key in [
        ("Past Ocular History", "ocularHistory"),
        ("Past Medical History", "medicalHistory"),
        ("Drug History", "drugHistory"),
        ("Allergies", "allergyHistory"),
        ("Social History", "socialHistory"),
        ("Family Ocular History", "familyOcularHistory"),
        ("Family Medical History", "familyMedicalHistory"),
    ]:
        value = subj.get(key)
        if value:
            story.append(request_line(label, str(value), width=width))
    story.append(Spacer(1, 0.1 * inch))

    story.append(section_heading("Objective — Visual Acuity"))
    story.append(Spacer(1, 0.04 * inch))
    va_rows = []
    for key, label in _VISUAL_ACUITY_ROWS:
        row = va.get(key) if isinstance(va.get(key), dict) else {}
        va_rows.append([
            label,
            _cell(row.get("od")),
            _cell(row.get("os")),
            _cell(row.get("ou")),
        ])
    story.append(
        data_table(
            ["Test", "OD", "OS", "OU"],
            va_rows,
            col_widths=[2.4 * inch, 1.2 * inch, 1.2 * inch, 1.2 * inch],
            italic_col=0,
        )
    )
    story.append(Spacer(1, 0.08 * inch))

    story.append(section_heading("Objective — Ocular Examination"))
    story.append(Spacer(1, 0.04 * inch))
    exam_rows = []
    for label in _EXAMINATION_LABELS:
        key = _exam_row_key(label)
        row = exam.get(key) if isinstance(exam.get(key), dict) else {}
        exam_rows.append([label, _cell(row.get("od")), _cell(row.get("os"))])
    story.append(
        data_table(
            ["Structure", "OD", "OS"],
            exam_rows,
            col_widths=[2.8 * inch, 1.5 * inch, 1.5 * inch],
            italic_col=0,
        )
    )
    story.append(Spacer(1, 0.08 * inch))

    story.append(section_heading("Objective — Diagnostics"))
    story.append(Spacer(1, 0.04 * inch))
    story.append(
        request_line(
            "IOP (OD / OS)",
            f"{_cell(diag.get('iopOd'))} / {_cell(diag.get('iopOs'))}  •  "
            f"Method: {_cell(diag.get('method'))}  •  Time: {_cell(diag.get('time'))}",
            width=width,
        )
    )
    story.append(
        request_line(
            "Pachymetry / OCT / Visual Field",
            f"{_cell(diag.get('pachymetry'))}  •  {_cell(diag.get('oct'))}  •  "
            f"{_cell(diag.get('visualField'))}",
            width=width,
        )
    )
    story.append(Spacer(1, 0.08 * inch))

    refr_rows = []
    for group, group_label in _REFRACTION_GROUPS:
        group_data = refr.get(group) if isinstance(refr.get(group), dict) else {}
        for eye in ("od", "os"):
            eye_data = group_data.get(eye) if isinstance(group_data.get(eye), dict) else {}
            refr_rows.append([
                group_label,
                eye.upper(),
                _cell(eye_data.get("sphere")),
                _cell(eye_data.get("cylinder")),
                _cell(eye_data.get("axis")),
                _cell(eye_data.get("va")),
            ])
    story.append(section_heading("Objective — Refraction"))
    story.append(Spacer(1, 0.04 * inch))
    story.append(
        data_table(
            ["Type", "Eye", "Sphere", "Cylinder", "Axis", "VA"],
            refr_rows,
            col_widths=[1.2 * inch, 0.5 * inch, 0.9 * inch, 0.9 * inch, 0.7 * inch, 0.7 * inch],
            italic_col=0,
        )
    )
    near = refr.get("nearAddition") if isinstance(refr.get("nearAddition"), dict) else {}
    if near.get("add") or near.get("nearVa") or near.get("va"):
        story.append(
            request_line(
                "Near Addition / Near VA",
                f"ADD: {_cell(near.get('add'))}  •  Near VA: {_cell(near.get('nearVa') or near.get('va'))}",
                width=width,
            )
        )
    story.append(Spacer(1, 0.08 * inch))

    story.append(section_heading("Assessment"))
    story.append(Spacer(1, 0.04 * inch))
    story.append(body_paragraph(str(assess.get("diagnosis") or "—")))
    story.append(Spacer(1, 0.08 * inch))

    story.append(section_heading("Plan"))
    story.append(Spacer(1, 0.04 * inch))
    story.append(request_line("Management Plan", str(plan.get("managementPlan") or "—"), width=width))
    story.append(request_line("Optical Correction", str(plan.get("opticalCorrection") or "—"), width=width))
    story.append(request_line("Medications", str(plan.get("medications") or "—"), width=width))
    story.append(request_line("Follow-up Date", str(plan.get("followUpDate") or "—"), width=width))

    doc.build(story, document_serial=f"EYE-{session.id}")
    return buffer.getvalue()


def build_eye_session_pdf_response(session) -> HttpResponse:
    pdf_bytes = build_eye_session_pdf_bytes(session)
    patient_id = session.order.patient.patient_id if session.order and session.order.patient else session.pk
    filename = f"eye_session_{patient_id}.pdf"
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response
