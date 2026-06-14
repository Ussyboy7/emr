"""
PDF builder for annual employee check-up clinical reports.
"""

from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape as _escape

from django.utils import timezone

from reportlab.platypus import Spacer, Table, TableStyle, Paragraph

from common.date_display import format_display_datetime
from common.pdf import (
    COLOR_ACCENT,
    COLOR_LIGHT_BG,
    COLOR_MUTED,
    NPADocument,
    body_paragraph,
    centered_section_title,
    data_table,
    italic_paragraph,
    label_paragraph,
    npa_styles,
    patient_info_block,
    section_heading,
    signature_block,
    small_paragraph,
)

from .annual_checkup_services import build_component_checklist


DEPARTMENT_LINE = "OCCUPATIONAL HEALTH & MEDICAL RECORDS"


def _fmt_dt(dt) -> str:
    if not dt:
        return "—"
    try:
        return format_display_datetime(dt)
    except Exception:
        return str(dt)


def _or_dash(value) -> str:
    if value in (None, ""):
        return "—"
    return str(value)


def _load_vitals(visit) -> list[dict]:
    rows = []
    for vital in visit.vital_readings.order_by("recorded_at"):
        rows.append(
            {
                "recorded_at": vital.recorded_at,
                "bp": f"{vital.blood_pressure_systolic or '—'}/{vital.blood_pressure_diastolic or '—'}",
                "hr": _or_dash(vital.heart_rate),
                "temp": _or_dash(vital.temperature),
                "rr": _or_dash(vital.respiratory_rate),
                "spo2": _or_dash(vital.oxygen_saturation),
                "weight": _or_dash(vital.weight),
                "height": _or_dash(vital.height),
                "bmi": _or_dash(vital.bmi),
            }
        )
    return rows


def _load_lab(visit) -> list[dict]:
    from laboratory.models import LabTest

    rows = []
    tests = (
        LabTest.objects.filter(order__visit=visit)
        .select_related("order", "template")
        .order_by("created_at")
    )
    for test in tests:
        summary = ""
        if test.results:
            parts = [f"{k}: {v}" for k, v in list(test.results.items())[:4]]
            summary = "; ".join(parts)
        rows.append(
            {
                "order": test.order.order_id if test.order_id else "—",
                "test": test.name or (test.template.name if test.template_id else test.code),
                "status": test.get_status_display(),
                "summary": summary or test.notes or "—",
            }
        )
    return rows


def _load_radiology(visit) -> list[dict]:
    from radiology.models import RadiologyStudy

    rows = []
    studies = (
        RadiologyStudy.objects.filter(order__visit=visit)
        .select_related("order", "template")
        .order_by("created_at")
    )
    for study in studies:
        rows.append(
            {
                "order": study.order.order_id if study.order_id else "—",
                "procedure": study.procedure,
                "status": study.get_status_display(),
                "report": (study.report or "")[:200] or "—",
            }
        )
    return rows


def _load_consultation_notes(visit) -> list[dict]:
    from consultation.models import ConsultationSession

    rows = []
    for session in ConsultationSession.objects.filter(visit=visit).order_by("started_at"):
        rows.append(
            {
                "session": session.session_id,
                "doctor": session.doctor.get_full_name() if session.doctor_id else "—",
                "complaint": session.presentation_complaint or "—",
                "exam": session.physical_examination or "—",
                "assessment": session.assessment or "—",
                "plan": session.plan or "—",
            }
        )
    return rows


def build_annual_checkup_report_pdf(annual_checkup) -> bytes:
    """Render the clinical annual check-up report PDF."""
    visit = annual_checkup.visit
    patient = annual_checkup.patient
    buffer = BytesIO()

    doc = NPADocument(
        buffer,
        department=DEPARTMENT_LINE,
        document_title=f"Annual Check-up {annual_checkup.programme_year}",
    )
    styles = npa_styles()
    page_width = doc.usable_width
    story: list = []

    story.append(centered_section_title("ANNUAL EMPLOYEE CHECK-UP REPORT"))

    is_final = annual_checkup.status == "completed"
    banner_text = (
        "FINAL · Signed off"
        if is_final
        else "INTERIM · Check-up in progress"
    )
    banner = Table(
        [[Paragraph(_escape(banner_text), styles["label"])]],
        colWidths=[page_width],
    )
    banner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), COLOR_LIGHT_BG),
                ("TEXTCOLOR", (0, 0), (-1, -1), COLOR_ACCENT),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(Spacer(1, 4))
    story.append(banner)
    story.append(Spacer(1, 8))

    age_phrase = f"{patient.age} yrs" if patient.age is not None else "—"
    story.append(
        patient_info_block(
            left=[
                ("Patient", patient.get_full_name()),
                ("Patient ID", patient.patient_id),
                ("Personal No.", _or_dash(patient.personal_number)),
                ("Division", _or_dash(patient.division)),
            ],
            middle=[
                ("Gender", patient.get_gender_display()),
                ("Age", age_phrase),
                ("Programme year", str(annual_checkup.programme_year)),
                ("Visit ID", visit.visit_id),
            ],
            right=[
                ("Visit date", str(visit.date)),
                ("Clinic", _or_dash(visit.clinic)),
                ("Location", _or_dash(visit.location)),
                ("Status", annual_checkup.get_status_display()),
            ],
        )
    )
    story.append(Spacer(1, 10))

    # Component checklist
    story.append(section_heading("1. Required components checklist"))
    checklist = build_component_checklist(annual_checkup)
    if checklist:
        rows = []
        for item in checklist:
            status = "Done" if item["done"] else "Pending"
            if item.get("override_reason"):
                status = f"Override: {item['override_reason']}"
            rows.append([item["label"], item.get("tier", "A"), status])
        story.append(
            data_table(
                ["Component", "Tier", "Status"],
                rows,
                col_widths=[page_width * 0.55, page_width * 0.12, page_width * 0.33],
            )
        )
    else:
        story.append(italic_paragraph("No components recorded."))

    # Vitals
    vitals = _load_vitals(visit)
    story.append(section_heading("2. Vital signs & anthropometry"))
    if vitals:
        rows = [
            [
                _fmt_dt(v["recorded_at"]),
                v["bp"],
                v["hr"],
                v["temp"],
                v["rr"],
                v["spo2"],
                v["weight"],
                v["height"],
                v["bmi"],
            ]
            for v in vitals
        ]
        story.append(
            data_table(
                ["Recorded", "BP", "HR", "Temp", "RR", "SpO₂", "Wt", "Ht", "BMI"],
                rows,
                col_widths=[page_width * 0.16] + [page_width * 0.105] * 8,
            )
        )
    else:
        story.append(italic_paragraph("No vitals recorded for this visit."))

    # Year-over-year vitals trend (prior completed programme year)
    from .models import AnnualCheckup

    prior = (
        AnnualCheckup.objects.filter(
            patient=patient,
            programme_year=annual_checkup.programme_year - 1,
            status="completed",
        )
        .select_related("visit")
        .first()
    )
    if prior and prior.visit_id:
        prior_vitals = _load_vitals(prior.visit)
        if prior_vitals:
            story.append(section_heading("2b. Prior year vitals (comparison)"))
            prior_row = prior_vitals[-1]
            current_row = vitals[-1] if vitals else None
            rows = [
                ["Metric", f"Prior ({prior.programme_year})", f"Current ({annual_checkup.programme_year})"],
                ["BP", prior_row["bp"], current_row["bp"] if current_row else "—"],
                ["Weight (kg)", prior_row["weight"], current_row["weight"] if current_row else "—"],
                ["BMI", prior_row["bmi"], current_row["bmi"] if current_row else "—"],
            ]
            story.append(
                data_table(
                    rows[0],
                    rows[1:],
                    col_widths=[page_width * 0.34, page_width * 0.33, page_width * 0.33],
                )
            )

    # Labs
    lab_rows = _load_lab(visit)
    story.append(section_heading("3. Laboratory"))
    if lab_rows:
        story.append(
            data_table(
                ["Order", "Test", "Status", "Results / notes"],
                [
                    [r["order"], r["test"], r["status"], r["summary"]]
                    for r in lab_rows
                ],
                col_widths=[
                    page_width * 0.14,
                    page_width * 0.28,
                    page_width * 0.14,
                    page_width * 0.44,
                ],
            )
        )
    else:
        story.append(italic_paragraph("No laboratory orders for this visit."))

    # Radiology
    rad_rows = _load_radiology(visit)
    story.append(section_heading("4. Radiology"))
    if rad_rows:
        story.append(
            data_table(
                ["Order", "Procedure", "Status", "Report excerpt"],
                [
                    [r["order"], r["procedure"], r["status"], r["report"]]
                    for r in rad_rows
                ],
                col_widths=[
                    page_width * 0.14,
                    page_width * 0.28,
                    page_width * 0.14,
                    page_width * 0.44,
                ],
            )
        )
    else:
        story.append(italic_paragraph("No radiology studies for this visit."))

    # Consultation
    consult_rows = _load_consultation_notes(visit)
    story.append(section_heading("5. Consultation notes"))
    if consult_rows:
        for row in consult_rows:
            story.append(label_paragraph(f"Session {row['session']} — Dr {row['doctor']}"))
            if row["complaint"] != "—":
                story.append(body_paragraph(f"Presentation: {row['complaint']}"))
            if row["exam"] != "—":
                story.append(body_paragraph(f"Physical examination: {row['exam']}"))
            if row["assessment"] != "—":
                story.append(body_paragraph(f"Assessment: {row['assessment']}"))
            if row["plan"] != "—":
                story.append(body_paragraph(f"Plan: {row['plan']}"))
            story.append(Spacer(1, 4))
    elif visit.clinical_notes:
        story.append(body_paragraph(visit.clinical_notes))
    else:
        story.append(italic_paragraph("No consultation notes recorded."))

    # Fitness outcome
    story.append(section_heading("6. Fitness assessment"))
    if annual_checkup.fitness_outcome:
        story.append(
            body_paragraph(
                annual_checkup.get_fitness_outcome_display()
            )
        )
    else:
        story.append(italic_paragraph("Fitness outcome not recorded."))

    if annual_checkup.outcome_notes:
        story.append(label_paragraph("Administrative outcome notes"))
        story.append(body_paragraph(annual_checkup.outcome_notes))

    if annual_checkup.sign_off_override_reason:
        story.append(label_paragraph("Incomplete component override"))
        story.append(small_paragraph(annual_checkup.sign_off_override_reason))

    if annual_checkup.signed_off_by_id:
        story.append(Spacer(1, 12))
        story.append(
            signature_block(
                left_role="Medical Doctor",
                left_name=annual_checkup.signed_off_by.get_full_name(),
            )
        )
        if annual_checkup.signed_off_at:
            story.append(small_paragraph(f"Signed: {_fmt_dt(annual_checkup.signed_off_at)}"))

    story.append(Spacer(1, 8))
    story.append(
        small_paragraph(
            f"Generated {_fmt_dt(timezone.now())}. "
            "This is a clinical record for occupational health purposes."
        )
    )

    doc.build(story)
    return buffer.getvalue()


def build_hr_outcome_letter_pdf(annual_checkup) -> bytes:
    """HR-safe fit-for-duty letter — no clinical detail."""
    buffer = BytesIO()
    patient = annual_checkup.patient
    doc = NPADocument(
        buffer,
        department="HUMAN RESOURCES — OCCUPATIONAL HEALTH",
        document_title=f"Annual Check-up Outcome {annual_checkup.programme_year}",
    )
    styles = npa_styles()
    page_width = doc.usable_width
    story: list = []

    story.append(centered_section_title("ANNUAL CHECK-UP OUTCOME LETTER"))
    story.append(Spacer(1, 8))
    story.append(
        patient_info_block(
            left=[
                ("Employee", patient.get_full_name()),
                ("Personal No.", _or_dash(patient.personal_number)),
                ("Patient ID", patient.patient_id),
                ("Division", _or_dash(patient.division)),
            ],
            middle=[
                ("Programme year", str(annual_checkup.programme_year)),
                ("Visit date", str(annual_checkup.visit.date)),
                ("Visit ID", annual_checkup.visit.visit_id),
            ],
            right=[
                ("Signed off", _fmt_dt(annual_checkup.signed_off_at)),
                (
                    "Reviewing doctor",
                    annual_checkup.signed_off_by.get_full_name()
                    if annual_checkup.signed_off_by_id
                    else "—",
                ),
            ],
        )
    )
    story.append(Spacer(1, 12))
    story.append(section_heading("Fitness outcome"))
    story.append(
        body_paragraph(
            annual_checkup.get_fitness_outcome_display()
            if annual_checkup.fitness_outcome
            else "Pending"
        )
    )
    if annual_checkup.outcome_notes:
        story.append(section_heading("Work guidance (administrative)"))
        story.append(body_paragraph(annual_checkup.outcome_notes))

    story.append(Spacer(1, 12))
    story.append(
        italic_paragraph(
            "This letter contains administrative fitness guidance only. "
            "It does not include clinical diagnoses, laboratory results, or "
            "detailed medical findings. For clinical records, contact Occupational Health."
        )
    )

    if annual_checkup.signed_off_by_id:
        story.append(Spacer(1, 16))
        story.append(
            signature_block(
                left_role="Medical Doctor",
                left_name=annual_checkup.signed_off_by.get_full_name(),
            )
        )
        if annual_checkup.signed_off_at:
            story.append(small_paragraph(f"Signed: {_fmt_dt(annual_checkup.signed_off_at)}"))

    doc.build(story)
    return buffer.getvalue()
