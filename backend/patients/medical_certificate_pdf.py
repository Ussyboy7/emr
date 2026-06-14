"""Medical certificate PDF using the standard NPA house style (ReportLab)."""

from __future__ import annotations

from io import BytesIO

from django.http import HttpResponse

from reportlab.lib.units import inch
from reportlab.platypus import Spacer

from common.date_display import format_display_datetime, format_display_range
from common.pdf import (
    NPADocument,
    body_paragraph,
    centered_section_title,
    certification_paragraph,
    data_table,
    patient_info_block,
    section_heading,
    signature_block,
)

# PDF section titles — aligned with form labels and MedicalCertificate.PURPOSE_CHOICES.
PURPOSE_DISPLAY = {
    "fitness": "FITNESS CERTIFICATE",
    "illness": "ILLNESS / SICK LEAVE",
    "travel": "TRAVEL MEDICAL",
    "employment": "EMPLOYMENT MEDICAL",
}

CATEGORY_DISPLAY = {
    "employee": "Employee",
    "retiree": "Retiree",
    "dependent": "Dependent",
    "nonnpa": "Non-NPA",
}

CERTIFICATION_TEXT = {
    "fitness": (
        "This is to certify that {name} has been examined and is issued this fitness certificate."
    ),
    "illness": (
        "This is to certify that {name} has been examined and is on sick leave due to illness."
    ),
    "travel": (
        "This is to certify that {name} has been examined and is issued this travel medical certificate."
    ),
    "employment": (
        "This is to certify that {name} has been examined and is issued this employment medical certificate."
    ),
}


def _patient_display_name(certificate) -> str:
    if certificate.patient_name_snapshot:
        return certificate.patient_name_snapshot
    try:
        return certificate.patient.get_full_name()
    except Exception:
        return "—"


def _doctor_display_name(certificate) -> str:
    if certificate.doctor_name_snapshot:
        return certificate.doctor_name_snapshot
    if certificate.issued_by:
        try:
            return certificate.issued_by.get_full_name()
        except Exception:
            return str(certificate.issued_by)
    return "—"


def build_medical_certificate_pdf(certificate):
    """Generate a medical certificate PDF and return an HttpResponse."""
    from .models import MedicalCertificate

    if isinstance(certificate, int):
        certificate = (
            MedicalCertificate.objects.select_related("patient", "issued_by")
            .get(pk=certificate)
        )

    purpose_key = certificate.purpose or "fitness"
    purpose_title = PURPOSE_DISPLAY.get(purpose_key, purpose_key.replace("_", " ").upper())
    patient_name = _patient_display_name(certificate)
    patient_id = certificate.patient_id_snapshot or getattr(
        certificate.patient, "patient_id", "—"
    )
    category = CATEGORY_DISPLAY.get(
        certificate.patient_category_snapshot or "",
        certificate.patient_category_snapshot or "—",
    )
    doctor_name = _doctor_display_name(certificate)
    valid_range = format_display_range(certificate.valid_from, certificate.valid_to)
    issued = format_display_datetime(certificate.issued_at)

    patient = certificate.patient
    age = getattr(patient, "age", None) if patient else None
    age_str = f"{age} YEARS" if age else "—"
    gender = ""
    if patient and patient.gender:
        gender = str(patient.gender).upper()

    buffer = BytesIO()
    doc = NPADocument(
        buffer,
        department="MEDICAL RECORDS",
        document_title="MEDICAL CERTIFICATE",
    )

    story = [
        patient_info_block(
            left=[
                ("Patient Name", patient_name),
                ("Patient ID", patient_id or "—"),
                ("Category", category),
            ],
            middle=[
                ("Certificate No.", certificate.certificate_number),
                ("Issued", issued),
                ("Valid Period", valid_range or "—"),
            ],
            right=[
                ("Age", age_str),
                ("Sex", gender or "—"),
                ("Certificate Type", purpose_title),
            ],
            width=6.5 * inch,
        ),
        Spacer(1, 0.15 * inch),
        centered_section_title(purpose_title),
        Spacer(1, 0.12 * inch),
    ]

    cert_template = CERTIFICATION_TEXT.get(
        purpose_key,
        "This is to certify that {name} has been examined.",
    )
    story.append(certification_paragraph(cert_template.format(name=patient_name)))

    if valid_range:
        story.append(
            body_paragraph(f"The certificate is valid from {valid_range}.")
        )

    if purpose_key == "illness" and certificate.sick_leave_days:
        story.append(Spacer(1, 0.08 * inch))
        story.append(
            data_table(
                ["Item", "Details"],
                [["Sick leave (calendar days)", str(certificate.sick_leave_days)]],
                col_widths=[2.2 * inch, 4.3 * inch],
            )
        )

    findings = (certificate.findings or "").strip()
    if findings:
        story.append(Spacer(1, 0.12 * inch))
        story.append(section_heading("Clinical Findings"))
        story.append(body_paragraph(findings))

    recommendations = (certificate.recommendations or "").strip()
    if recommendations:
        story.append(Spacer(1, 0.1 * inch))
        story.append(section_heading("Recommendations"))
        story.append(body_paragraph(recommendations))

    story.append(Spacer(1, 0.25 * inch))
    story.append(
        signature_block(
            left_role="Medical Officer",
            left_name=doctor_name,
            width=6.5 * inch,
        )
    )

    doc.build(story, document_serial=certificate.certificate_number)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    filename = f"medical_certificate_{certificate.certificate_number}.pdf"
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response
