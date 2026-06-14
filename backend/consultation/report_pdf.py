"""PDF generation for consultation reports using ReportLab + NPA house style."""

from io import BytesIO

from django.utils import timezone
from django.http import HttpResponse

from reportlab.lib.units import inch
from reportlab.platypus import Spacer

from common.date_display import format_display_datetime
from common.pdf import (
    NPADocument,
    patient_info_block,
    request_line,
    data_table,
    section_heading,
    body_paragraph,
)


def _format_dt(dt):
    if not dt:
        return "—"
    try:
        return format_display_datetime(dt)
    except Exception:
        return str(dt)


def _get_vital(session, field):
    """Get the latest vital reading value for the session's visit."""
    vital = getattr(session, "_vital_cache", None)
    if vital is None:
        visit = session.visit
        if visit:
            vital = visit.vital_readings.order_by("-recorded_at").first()
        session._vital_cache = vital
    if vital is None:
        return ""
    return str(getattr(vital, field, "") or "")


def build_consultation_report_pdf(session):
    """Generate a consultation report PDF and return it as an HttpResponse."""
    from consultation.models import Diagnosis

    if isinstance(session, int):
        from consultation.models import ConsultationSession

        session = ConsultationSession.objects.select_related(
            "patient", "doctor", "visit", "room", "created_by"
        ).prefetch_related(
            "diagnoses__icd10_code",
            "prescriptions__medications__generic",
            "prescriptions__medications__medication",
        ).get(pk=session)

    buffer = BytesIO()
    duration_min = None
    if session.ended_at and session.started_at:
        duration_min = int(
            (session.ended_at - session.started_at).total_seconds() / 60
        )
    elif session.started_at:
        now = timezone.now()
        duration_min = int((now - session.started_at).total_seconds() / 60)

    doc = NPADocument(
        buffer,
        department="CONSULTATION & CLINICAL SERVICES",
        document_title="CONSULTATION REPORT",
    )

    story = []

    # ── Patient info block ──
    patient = session.patient
    patient_age = getattr(patient, "age", None)
    age_str = f"{patient_age} YEARS" if patient_age else "—"
    gender = (patient.gender or "").upper() or "—"
    patient_id = getattr(patient, "patient_id", "") or "—"

    doctor_name = (
        session.doctor.get_full_name() if session.doctor else "—"
    )

    clinic_name = (
        session.room.clinic.name if session.room and session.room.clinic else "—"
    )

    duration_str = (
        f"{duration_min} min{' (ongoing)' if not session.ended_at else ''}"
        if duration_min is not None
        else "—"
    )

    story.append(
        patient_info_block(
            left=[
                ("Patient Name", patient.get_full_name() if patient else "—"),
                ("Patient ID", patient_id),
                ("Age / Gender", f"{age_str} / {gender}"),
            ],
            middle=[
                ("Clinic", clinic_name),
                ("Doctor", doctor_name),
                ("Room", session.room.name if session.room else "—"),
            ],
            right=[
                ("Status", session.get_status_display()),
                ("Duration", duration_str),
            ],
            width=6.5 * inch,
        )
    )
    story.append(Spacer(1, 0.1 * inch))

    # ── Clinical Notes ──
    has_notes = any([
        session.presentation_complaint,
        session.history_of_presenting_illness,
        session.physical_examination,
        session.assessment,
        session.plan,
    ])
    if has_notes:
        story.append(section_heading("Clinical Notes"))
        story.append(Spacer(1, 0.05 * inch))
        if session.presentation_complaint:
            story.append(request_line("Presentation Complaint", session.presentation_complaint))
        if session.history_of_presenting_illness:
            story.append(request_line("History of Present Illness", session.history_of_presenting_illness))
        if session.physical_examination:
            story.append(request_line("Physical Examination", session.physical_examination))
        if session.assessment:
            story.append(request_line("Assessment", session.assessment))
        if session.plan:
            story.append(request_line("Treatment Plan", session.plan))
        story.append(Spacer(1, 0.1 * inch))

    # ── Vitals ──
    visit = session.visit
    vital = None
    if visit:
        vital = visit.vital_readings.order_by("-recorded_at").first()
    if vital:
        story.append(section_heading("Vital Signs"))
        story.append(Spacer(1, 0.05 * inch))
        vital_headers = ["Parameter", "Value"]
        vital_rows = []
        fields = [
            ("Temperature", vital.temperature, "°C"),
            ("Blood Pressure", f"{vital.blood_pressure_systolic}/{vital.blood_pressure_diastolic}" if vital.blood_pressure_systolic and vital.blood_pressure_diastolic else None, ""),
            ("Heart Rate", vital.heart_rate, "bpm"),
            ("Respiratory Rate", vital.respiratory_rate, "/min"),
            ("Oxygen Saturation", vital.oxygen_saturation, "%"),
            ("Weight", vital.weight, "kg"),
            ("Height", vital.height, "cm"),
        ]
        for label, value, unit in fields:
            if value:
                vital_rows.append([label, f"{value}{' ' + unit if unit else ''}"])
        if vital_rows:
            story.append(
                data_table(
                    vital_headers,
                    vital_rows,
                    col_widths=[3 * inch, 3.5 * inch],
                    italic_col=0,
                )
            )
            story.append(Spacer(1, 0.1 * inch))

    # ── Diagnoses ──
    diagnoses = session.diagnoses.select_related("icd10_code").all()
    if diagnoses:
        story.append(section_heading("Diagnoses (ICD-10)"))
        story.append(Spacer(1, 0.05 * inch))
        dx_headers = ["ICD-10 Code", "Diagnosis", "Type"]
        dx_rows = []
        for dx in diagnoses:
            code = dx.icd10_code.code if dx.icd10_code else "—"
            name = dx.icd10_code.description if dx.icd10_code else (dx.diagnosis_text or "—")
            dx_type = {
                "confirmed": "Primary",
                "probable": "Secondary",
            }.get(dx.certainty, dx.certainty or "—")
            dx_rows.append([code, name, dx_type])
        story.append(
            data_table(
                dx_headers,
                dx_rows,
                col_widths=[1.2 * inch, 4 * inch, 1.3 * inch],
                italic_col=1,
            )
        )
        story.append(Spacer(1, 0.1 * inch))

    # ── Prescriptions ──
    prescriptions = session.prescriptions.prefetch_related(
        "medications__generic", "medications__medication"
    ).all()
    if prescriptions:
        story.append(section_heading("Prescriptions"))
        story.append(Spacer(1, 0.05 * inch))
        rx_headers = ["Medication", "Dose", "Frequency", "Duration", "Qty", "Dispensed"]
        rx_col_widths = [1.6 * inch, 0.9 * inch, 1.2 * inch, 0.8 * inch, 0.7 * inch, 0.8 * inch]
        rx_rows = []
        for rx in prescriptions:
            for item in rx.medications.all():
                med_name = (
                    item.medication.name
                    if item.medication
                    else (item.generic.name if item.generic else "—")
                )
                dose = item.dose or "—"
                freq = item.frequency or "—"
                dur = item.duration or "—"
                qty = f"{item.quantity} {item.unit}" if item.unit else str(item.quantity) if item.quantity else "—"
                dispensed = "Yes" if item.is_dispensed else "No"
                rx_rows.append([med_name, dose, freq, dur, qty, dispensed])
        if rx_rows:
            story.append(
                data_table(
                    rx_headers,
                    rx_rows,
                    col_widths=rx_col_widths,
                    italic_col=0,
                )
            )
            story.append(Spacer(1, 0.1 * inch))

    # ── Lab Orders ──
    if visit:
        from laboratory.models import LabOrder, LabTest
        lab_orders = LabOrder.objects.filter(visit=visit).prefetch_related(
            "tests__template"
        )
        lab_rows = []
        for order in lab_orders:
            tests = order.tests.all()
            if tests:
                for test in tests:
                    lab_rows.append([
                        test.template.name if test.template else test.name,
                        order.get_priority_display() if hasattr(order, "get_priority_display") else (order.priority or "Routine"),
                        test.get_status_display() if hasattr(test, "get_status_display") else (test.status or ""),
                    ])
            else:
                lab_rows.append([
                    "—",
                    order.get_priority_display() if hasattr(order, "get_priority_display") else (order.priority or "Routine"),
                    "—",
                ])
        if lab_rows:
            story.append(section_heading("Laboratory Orders"))
            story.append(Spacer(1, 0.05 * inch))
            story.append(
                data_table(
                    ["Test", "Priority", "Status"],
                    lab_rows,
                    col_widths=[3.5 * inch, 1.2 * inch, 1.8 * inch],
                    italic_col=0,
                )
            )
            story.append(Spacer(1, 0.1 * inch))

    # ── Radiology Orders ──
    if visit:
        from radiology.models import RadiologyOrder
        rad_orders = RadiologyOrder.objects.filter(visit=visit).prefetch_related(
            "studies"
        )
        rad_rows = []
        for order in rad_orders:
            studies = order.studies.all()
            if studies:
                for study in studies:
                    rad_rows.append([
                        study.procedure,
                        order.get_priority_display() if hasattr(order, "get_priority_display") else (order.priority or "Routine"),
                        study.get_status_display() if hasattr(study, "get_status_display") else (study.status or ""),
                    ])
            else:
                rad_rows.append([
                    "—",
                    order.get_priority_display() if hasattr(order, "get_priority_display") else (order.priority or "Routine"),
                    order.get_status_display() if hasattr(order, "get_status_display") else (order.status or ""),
                ])
        if rad_rows:
            story.append(section_heading("Radiology Orders"))
            story.append(Spacer(1, 0.05 * inch))
            story.append(
                data_table(
                    ["Procedure", "Priority", "Status"],
                    rad_rows,
                    col_widths=[3.5 * inch, 1.2 * inch, 1.8 * inch],
                    italic_col=0,
                )
            )
            story.append(Spacer(1, 0.1 * inch))

    # ── Physiotherapy Orders ──
    from physiotherapy.models import PhysioOrder
    physio_orders = PhysioOrder.objects.filter(consultation_session=session)
    if physio_orders:
        story.append(section_heading("Physiotherapy Orders"))
        story.append(Spacer(1, 0.05 * inch))
        physio_rows = [
            [
                p.diagnosis or "—",
                p.get_priority_display() if hasattr(p, "get_priority_display") else (p.priority or "Routine"),
                p.get_status_display() if hasattr(p, "get_status_display") else (p.status or ""),
            ]
            for p in physio_orders
        ]
        story.append(
            data_table(
                ["Diagnosis / Chief Complaint", "Priority", "Status"],
                physio_rows,
                col_widths=[3 * inch, 1.5 * inch, 2 * inch],
                italic_col=0,
            )
        )
        story.append(Spacer(1, 0.1 * inch))

    # ── Eye Care Orders ──
    from eyecare.models import EyeOrder
    eye_orders = EyeOrder.objects.filter(consultation_session=session)
    if eye_orders:
        story.append(section_heading("Eye Care Orders"))
        story.append(Spacer(1, 0.05 * inch))
        eye_rows = [
            [
                e.diagnosis or e.chief_complaint or "—",
                e.get_priority_display() if hasattr(e, "get_priority_display") else (e.priority or "Routine"),
                e.get_status_display() if hasattr(e, "get_status_display") else (e.status or ""),
            ]
            for e in eye_orders
        ]
        story.append(
            data_table(
                ["Diagnosis / Chief Complaint", "Priority", "Status"],
                eye_rows,
                col_widths=[3 * inch, 1.5 * inch, 2 * inch],
                italic_col=0,
            )
        )
        story.append(Spacer(1, 0.1 * inch))

    doc.build(
        story,
        document_serial=session.session_id,
    )

    pdf_bytes = buffer.getvalue()
    buffer.close()

    filename = f"consultation_report_{session.session_id}.pdf"
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
