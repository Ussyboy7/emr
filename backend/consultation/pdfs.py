"""
PDF builder for consultation-side referral documents.

Currently exposes :func:`build_responsibility_form_pdf`, the financial
responsibility form Medical Records hands the receiving hospital. Wording
and layout mirror the lab module's
:func:`laboratory.dispatch_pdfs.build_responsibility_form_pdf` so the
documents look identical apart from the consultation-specific Validity
row.

The small layout helpers (`_top_doctor_signature_block`, `_signoff_columns`,
`_dotted_remark_line`, `_plain_centered_title`) were copied verbatim from
``laboratory.dispatch_pdfs`` to keep the two apps decoupled — a cross-app
import would force one module to load the other on startup just for a few
ReportLab flowables.
"""

from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape as _escape

from django.utils import timezone

from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import HRFlowable, Paragraph, Spacer, Table, TableStyle

from common.date_display import format_display_date, format_display_month_year
from common.pdf import (
    COLOR_BODY,
    COLOR_LINE,
    NPADocument,
    body_paragraph,
    centered_section_title,
    label_paragraph,
    npa_styles,
    rich_paragraph,
    section_heading,
    signature_block,
    small_paragraph,
)


def _e(value) -> str:
    return _escape("" if value is None else str(value))


def _fmt_short(value) -> str:
    if not value:
        return "—"
    try:
        formatted = format_display_date(value)
        return formatted or "—"
    except Exception:
        return "—"


def _plain_centered_title(text: str) -> Paragraph:
    return Paragraph(text.upper(), npa_styles()["centered_title"])


# ---------------------------------------------------------------------------
# Patient field accessors (mirror laboratory.dispatch_pdfs)
# ---------------------------------------------------------------------------

def _division_line(patient) -> str:
    raw = (getattr(patient, "division", "") or "").strip()
    if raw:
        return raw.upper()
    if getattr(patient, "category", None) == "dependent" and getattr(patient, "principal_staff_id", None):
        ps = getattr(patient, "principal_staff", None)
        if ps is not None:
            pr = (getattr(ps, "division", "") or "").strip()
            if pr:
                return pr.upper()
    return "—"


def _personal_number_line(patient) -> str:
    raw = (getattr(patient, "personal_number", "") or "").strip()
    if raw:
        return raw.upper()
    if getattr(patient, "category", None) == "dependent" and getattr(patient, "principal_staff_id", None):
        ps = getattr(patient, "principal_staff", None)
        if ps is not None:
            pr = (getattr(ps, "personal_number", "") or "").strip()
            if pr:
                return pr.upper()
    return "—"


# ---------------------------------------------------------------------------
# Addressee — uses the snapshot copied onto the referral on save
# ---------------------------------------------------------------------------

def _addressee_lines(referral) -> list[str]:
    """
    Build the "To:" block lines for a referral.

    Prefers the partner's ``contact_person_title`` (frozen via the FK at
    issuance time) and falls back to the standard "The Medical Director"
    used everywhere else. Address comes from ``facility_address_snapshot``
    which is filled when ``facility_partner`` is set; otherwise we fall
    back to whatever live partner address exists, then to nothing.
    """
    role = "The Medical Director"
    partner = getattr(referral, "facility_partner", None)
    if partner is not None:
        title = (partner.contact_person_title or "").strip()
        if title:
            role = title

    name = (referral.facility or "").strip() or "External Hospital"

    addr = (referral.facility_address_snapshot or "").strip()
    if not addr and partner is not None:
        addr = (partner.address or "").strip()

    address_lines = [ln.strip() for ln in addr.splitlines() if ln.strip()]
    return [role, name, *address_lines]


# ---------------------------------------------------------------------------
# Layout helpers — copied from laboratory.dispatch_pdfs (see module docstring)
# ---------------------------------------------------------------------------

def _top_doctor_signature_block(*, role_text: str, name: str, width: float) -> Table:
    styles = npa_styles()
    rule = Table([[""]], colWidths=[width], rowHeights=[6])
    rule.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, 0), 0.4, COLOR_BODY),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    role_para = Paragraph(
        _escape(role_text or "").replace("\n", "<br/>"),
        styles["label"],
    )
    name_para = Paragraph(
        _escape(name or "").replace("\n", "<br/>") if name else "&nbsp;",
        styles["body_compact"],
    )
    stack = Table(
        [[rule], [Spacer(1, 4)], [role_para], [name_para]],
        colWidths=[width],
    )
    stack.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    stack.hAlign = "LEFT"
    return stack


def _signoff_columns(
    *,
    left_header_lines: list[str],
    right_header_lines: list[str],
    left_fields: list[str],
    right_fields: list[str],
    width: float,
) -> Table:
    from common.pdf import FONT_BOLD

    styles = npa_styles()
    gutter = 14
    col_w = (width - gutter) / 2

    def _hdr(text: str) -> Paragraph:
        return Paragraph(f"<b>{_e(text)}</b>", styles["body_compact"])

    def _label_with_dotted_fill(text: str, total_w: float) -> Table:
        if not text:
            return Table([[""]], colWidths=[total_w], rowHeights=[26])
        text_w = stringWidth(text, FONT_BOLD, 9.5) + 4
        text_w = min(text_w, total_w - 0.6 * inch)
        line_w = max(total_w - text_w, 0.6 * inch)
        lbl = Paragraph(_e(text), styles["label"])
        row = Table(
            [[lbl, ""]],
            colWidths=[text_w, line_w],
            rowHeights=[26],
        )
        row.setStyle(
            TableStyle(
                [
                    ("LINEBELOW", (1, 0), (1, 0), 0.6, COLOR_LINE, 0, [1, 2]),
                    ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 1),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ]
            )
        )
        return row

    n_header_rows = max(len(left_header_lines), len(right_header_lines))

    def _column(headers: list[str], fields: list[str], total_w: float) -> list:
        items: list = []
        for i in range(n_header_rows):
            line = headers[i] if i < len(headers) else ""
            items.append(_hdr(line) if line else Paragraph("&nbsp;", styles["body_compact"]))
        items.append(Spacer(1, 6))
        for label in fields:
            items.append(_label_with_dotted_fill(label, total_w))
        return items

    table = Table(
        [[
            _column(left_header_lines, left_fields, col_w),
            "",
            _column(right_header_lines, right_fields, col_w),
        ]],
        colWidths=[col_w, gutter, col_w],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def _dotted_remark_line() -> HRFlowable:
    return HRFlowable(
        width="100%",
        thickness=0.5,
        color=COLOR_LINE,
        dash=(1, 2),
        hAlign="LEFT",
        spaceBefore=14,
        spaceAfter=0,
    )


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

def build_responsibility_form_pdf(referral, form) -> bytes:
    """
    Build the responsibility form NPA hands to the receiving hospital.

    Layout mirrors the lab dispatch responsibility form, with one extra row
    at the top showing the form's monthly Validity window (specific to the
    consultation flow — lab dispatches do not have a recurring validity
    period).
    """
    buffer = BytesIO()
    doc = NPADocument(
        buffer,
        department="MEDICAL DEPARTMENT",
        document_title=f"Responsibility Form — {referral.referral_id}",
    )

    patient = referral.patient
    referring_doctor = referral.referred_by.get_full_name() if referral.referred_by else "—"

    pno = _personal_number_line(patient)
    department = _division_line(patient)

    # Header context — Date / Month / Validity for the issued slip
    issue_date = getattr(form, "issue_date", None) or referral.referred_at
    valid_from = getattr(form, "valid_from", None)
    valid_to = getattr(form, "valid_to", None)

    month_str = format_display_month_year(issue_date) if issue_date else "—"

    validity = "—"
    if valid_from and valid_to:
        validity = f"{format_display_date(valid_from)} – {format_display_date(valid_to)}"

    # Receiving facility for the right-hand detach signoff column
    partner = getattr(referral, "facility_partner", None)
    partner_role = "The Medical Director"
    if partner is not None and (partner.contact_person_title or "").strip():
        partner_role = partner.contact_person_title.strip()
    partner_name = (referral.facility or "").strip() or "External Hospital"

    # Both NAME lines repeat verbatim — top portion + detach slip.
    name_line = rich_paragraph(
        f"<b>NAME:</b> {_e(patient.get_full_name())} "
        f"&nbsp;&nbsp; <b>P.N.</b> {_e(pno)} "
        f"&nbsp;&nbsp; <b>DEPT.</b> {_e(department)}"
    )
    detach_name_line = rich_paragraph(
        f"<b>NAME:</b> {_e(patient.get_full_name())} "
        f"&nbsp;&nbsp; <b>P.N.</b> {_e(pno)} "
        f"&nbsp;&nbsp; <b>DEPT.</b> {_e(department)}"
    )

    top_signature = _top_doctor_signature_block(
        role_text="Doctor-in-charge\nFor: Managing Director, NPA",
        name=referring_doctor,
        width=doc.usable_width / 2,
    )

    story = [
        _plain_centered_title("RESPONSIBILITY FORM"),
        Spacer(1, 10),
        rich_paragraph(
            f"<b>Date:</b> {_e(_fmt_short(issue_date))}"
            f'<font color="#94a3b8">&nbsp;&nbsp;|&nbsp;&nbsp;</font>'
            f"<b>Month of:</b> {_e(month_str)}"
            f'<font color="#94a3b8">&nbsp;&nbsp;|&nbsp;&nbsp;</font>'
            f"<b>Validity:</b> {_e(validity)}"
        ),
        Spacer(1, 10),
        label_paragraph("To:"),
        *[body_paragraph(line) for line in _addressee_lines(referral)],
        Spacer(1, 10),
        name_line,
        Spacer(1, 10),
        body_paragraph(
            "I certify that the above named who is now referred for treatment "
            "at the hospital is a bona fide Pensioner/Employee/Spouse/"
            "Dependant of the Nigerian Ports Authority."
        ),
        Spacer(1, 4),
        body_paragraph(
            "The Nigerian Ports Authority hereby accepts responsibility for "
            "payment of the hospital bill on his/her behalf."
        ),
        Spacer(1, 18),
        top_signature,
        Spacer(1, 6),
        small_paragraph("Please quote on all bills."),
    ]

    # Detach slip
    story += [
        Spacer(1, 14),
        HRFlowable(
            width=doc.usable_width,
            thickness=0.6,
            color=COLOR_LINE,
            dash=(2, 2),
            hAlign="CENTER",
            spaceBefore=0,
            spaceAfter=8,
        ),
        small_paragraph(
            "This portion of the form should be detached and returned to the "
            "General Manager, Medical Services, Bode Thomas, Surulere."
        ),
        Spacer(1, 4),
        small_paragraph("No bill will be certified for payment without this slip."),
        Spacer(1, 8),
        rich_paragraph(
            f"<b>Form #</b> {_e(getattr(form, 'sequence_number', '—'))} "
            f"&nbsp;&nbsp; <b>Ref</b> {_e(referral.referral_id)} "
            f"&nbsp;&nbsp; <b>Issued by</b> {_e(referring_doctor)} "
            f"&nbsp;&nbsp; <b>Issue date</b> {_e(_fmt_short(issue_date))}"
        ),
        Spacer(1, 6),
        detach_name_line,
        Spacer(1, 8),
        _signoff_columns(
            left_header_lines=[
                "Doctor in Charge",
                "For: Managing Director, NPA",
            ],
            left_fields=[
                "Doctor's Name",
                "Signature",
                "Date",
            ],
            right_header_lines=[
                "Doctor in Charge",
                f"For: {partner_role}",
                partner_name,
            ],
            right_fields=[
                "Receiving Doctor's Name",
                "Signature",
                "Date",
            ],
            width=doc.usable_width,
        ),
        Spacer(1, 12),
        label_paragraph("Doctor's Remarks:"),
        Spacer(1, 2),
        *[_dotted_remark_line() for _ in range(5)],
    ]

    doc.build(story, document_serial=referral.referral_id)
    buffer.seek(0)
    return buffer.getvalue()


def _referral_location_name(referral) -> str:
    from common.order_location import location_clinic_name

    if referral.session_id:
        name = location_clinic_name(referral.session)
        if name:
            return name
    if referral.visit_id:
        return location_clinic_name(referral.visit) or ""
    return ""


def _urgency_label(urgency: str | None) -> str:
    return {
        "routine": "Routine",
        "urgent": "Urgent",
        "emergency": "Emergency",
    }.get((urgency or "").strip().lower(), (urgency or "—").strip() or "—")


def build_referral_letter_pdf(referral) -> bytes:
    """
    Build the formal specialist referral letter Medical Records issues to the
    receiving hospital. Layout mirrors the HTML letter the frontend used to
    print, wrapped in the standard NPA letterhead.
    """
    buffer = BytesIO()
    doc = NPADocument(
        buffer,
        department="MEDICAL DEPARTMENT",
        document_title=f"Referral Letter — {referral.referral_id}",
    )

    patient = referral.patient
    referring_doctor = referral.referred_by.get_full_name() if referral.referred_by else "—"
    pno = _personal_number_line(patient)
    department = _division_line(patient)
    location = _referral_location_name(referral)

    story = [
        centered_section_title("REFERRAL LETTER"),
        Spacer(1, 8),
        rich_paragraph(
            f"<b>Date:</b> {_e(_fmt_short(referral.referred_at))}"
            f'<font color="#94a3b8">&nbsp;&nbsp;|&nbsp;&nbsp;</font>'
            f"<b>Referral ID:</b> {_e(referral.referral_id)}"
            f'<font color="#94a3b8">&nbsp;&nbsp;|&nbsp;&nbsp;</font>'
            f"<b>Urgency:</b> {_e(_urgency_label(referral.urgency))}"
        ),
    ]
    if location:
        story.append(body_paragraph(f"Originating Location: {location}"))
    story += [
        Spacer(1, 10),
        label_paragraph("To:"),
        *[body_paragraph(line) for line in _addressee_lines(referral)],
        Spacer(1, 10),
        body_paragraph("Please kindly evaluate and manage the patient below:"),
        Spacer(1, 6),
        rich_paragraph(
            f"<b>Patient Name:</b> {_e(patient.get_full_name())} "
            f"(P.N. {_e(pno)}) "
            f"<b>DEPT.</b> {_e(department)}"
        ),
        body_paragraph(f"Referred Specialty/Unit: {referral.specialty or '—'}"),
        Spacer(1, 10),
        section_heading("Reason for Referral"),
        body_paragraph(referral.reason or "N/A"),
        Spacer(1, 8),
        section_heading("Clinical Summary"),
        body_paragraph(referral.clinical_summary or "N/A"),
        Spacer(1, 20),
        signature_block(
            left_role="Referring Doctor",
            left_name=referring_doctor,
            right_role="Medical Records Officer",
            right_name="",
            width=doc.usable_width,
        ),
    ]

    doc.build(story, document_serial=referral.referral_id)
    buffer.seek(0)
    return buffer.getvalue()


def build_referral_letter_pdf_response(referral):
    from django.http import HttpResponse

    pdf_bytes = build_referral_letter_pdf(referral)
    filename = f"referral_letter_{referral.referral_id}.pdf"
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


__all__ = [
    "build_referral_letter_pdf",
    "build_referral_letter_pdf_response",
    "build_responsibility_form_pdf",
]
