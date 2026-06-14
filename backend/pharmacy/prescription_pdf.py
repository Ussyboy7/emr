"""PDF generation for prescription reports using ReportLab + NPA house style."""

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


def build_prescription_pdf(prescription):
    """Generate a prescription report PDF and return it as an HttpResponse."""
    from .models import Prescription

    if isinstance(prescription, int):
        prescription = Prescription.objects.select_related(
            "patient", "doctor", "visit", "created_by"
        ).prefetch_related(
            "medications__generic",
            "medications__medication",
        ).get(pk=prescription)

    buffer = BytesIO()
    doc = NPADocument(
        buffer,
        department="PHARMACY DEPARTMENT",
        document_title="PRESCRIPTION",
    )

    story = []

    # ── Patient info block ──
    patient = prescription.patient
    patient_age = getattr(patient, "age", None)
    age_str = f"{patient_age} YEARS" if patient_age else "—"
    gender = (patient.gender or "").upper() or "—"
    patient_id = getattr(patient, "patient_id", "") or "—"

    doctor_name = (
        prescription.doctor.get_full_name()
        if prescription.doctor else "—"
    )

    clinic_name = (
        getattr(prescription.visit, "clinic", None)
        if prescription.visit else "—"
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
                ("Ordering Doctor", doctor_name),
                ("Prescription ID", prescription.prescription_id),
            ],
            right=[
                ("Status", prescription.get_status_display()),
                ("Prescribed", format_display_datetime(prescription.prescribed_at) if prescription.prescribed_at else "—"),
                ("Dispensed", format_display_datetime(prescription.dispensed_at) if prescription.dispensed_at else "—"),
            ],
            width=6.5 * inch,
        )
    )
    story.append(Spacer(1, 0.1 * inch))

    # ── Diagnosis / Notes ──
    if prescription.diagnosis:
        story.append(request_line("Diagnosis", prescription.diagnosis))
        story.append(Spacer(1, 0.1 * inch))

    if prescription.notes:
        story.append(request_line("Notes", prescription.notes))
        story.append(Spacer(1, 0.1 * inch))

    # ── Medication table ──
    story.append(section_heading("Medications"))
    story.append(Spacer(1, 0.08 * inch))

    headers = ["Medication", "Dose", "Frequency", "Duration", "Qty", "Dispensed"]
    col_widths = [1.6 * inch, 0.9 * inch, 1.2 * inch, 0.8 * inch, 0.7 * inch, 0.8 * inch]
    rows = []
    for item in prescription.medications.all():
        med_name = (
            item.medication.name
            if item.medication
            else (item.generic.name if item.generic else "—")
        )
        dose = item.dose or "—"
        freq = item.frequency or "—"
        dur = item.duration or "—"
        qty = f"{item.quantity} {item.unit}" if item.unit else str(item.quantity)
        dispensed = "Yes" if item.is_dispensed else "No"
        rows.append([med_name, dose, freq, dur, qty, dispensed])

    if rows:
        story.append(
            data_table(
                headers,
                rows,
                col_widths=col_widths,
                italic_col=0,
            )
        )
    else:
        story.append(body_paragraph("No medications listed."))

    story.append(Spacer(1, 0.2 * inch))

    # ── Dispensed by ──
    latest_dispense = prescription.dispenses.order_by("-dispensed_at").first()
    if latest_dispense and latest_dispense.dispensed_by:
        dispensed_by = latest_dispense.dispensed_by.get_full_name()
    else:
        dispensed_by = None

    if dispensed_by:
        story.append(
            body_paragraph(f"Dispensed by: {dispensed_by}")
        )
        story.append(Spacer(1, 0.1 * inch))

    doc.build(
        story,
        document_serial=prescription.prescription_id,
    )

    pdf_bytes = buffer.getvalue()
    buffer.close()

    filename = f"prescription_{prescription.prescription_id}.pdf"
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
