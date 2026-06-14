"""
PDF builders for outsourced lab dispatch documents.

Generates two documents off a `LabReferralDispatch`:
  * Referral Letter — formal request to the external lab.
  * Responsibility Form — NPA's commitment to pay the bill, mirroring the
    consultation referral responsibility form (`buildResponsibilityFormHtml`)
    so the wording is consistent with what Medical Records already accepts.

Both use the standardized `common.pdf` house style (NPA letterhead with the
official crest + the new paper-template layout).
"""

from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape as _escape

from django.utils import timezone

from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import HRFlowable, Paragraph, Spacer, Table, TableStyle

from patients.models import Patient

from common.date_display import format_display_date
from common.pdf import (
    COLOR_BODY,
    COLOR_LINE,
    NPADocument,
    body_paragraph,
    centered_section_title,
    data_table,
    italic_paragraph,
    label_paragraph,
    npa_styles,
    patient_info_block,
    rich_paragraph,
    section_heading,
    signature_block,
    small_paragraph,
)


def _plain_centered_title(text: str) -> Paragraph:
    """Centered italic title without the horizontal rules above/below."""
    return Paragraph(text.upper(), npa_styles()["centered_title"])


def _e(value) -> str:
    """Escape an interpolation for use inside a rich_paragraph markup string."""
    return _escape("" if value is None else str(value))


def _addressee_lines(dispatch) -> list[str]:
    """
    Build the "To:" block lines for a dispatch.

    Prefers ``partner_address_snapshot`` (frozen when the dispatch was issued
    so the letter still prints accurately if the partner record is edited or
    deactivated later), falling back to the live ``LabPartner.address`` for
    older dispatches that pre-date the snapshot field.
    """
    partner = dispatch.partner  # None when partner_id was cleared via SET_NULL
    role = (partner.contact_person_title.strip() if partner else '') or 'The Medical Director'
    name = dispatch.partner_name.strip() or 'External Laboratory'

    addr = dispatch.partner_address_snapshot.strip()
    if not addr and partner is not None:
        addr = (partner.address or '').strip()

    address_lines = [ln.strip() for ln in addr.splitlines() if ln.strip()]
    return [role, name, *address_lines]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _fmt_short(value) -> str:
    if not value:
        return '—'
    try:
        formatted = format_display_date(value)
        return formatted or '—'
    except Exception:
        return '—'


def _patient_row_for_pdf(order) -> Patient:
    """Patient with principal_staff loaded — needed for dependent division / P/N."""
    return Patient.objects.select_related('principal_staff').get(pk=order.patient_id)


def _division_line(patient: Patient) -> str:
    """
    Division shown on lab referrals: employee/retiree use `division`;
    dependents use the principal staff member's division when their own is blank.
    """
    raw = (patient.division or '').strip()
    if raw:
        return raw.upper()
    if patient.category == 'dependent' and patient.principal_staff_id:
        ps = patient.principal_staff
        if ps is not None:
            pr = (ps.division or '').strip()
            if pr:
                return pr.upper()
    return '—'


def _personal_number_line(patient: Patient) -> str:
    """
    P/N on forms: stored `personal_number` for staff; for dependents fall back
    to the principal's personal number when the dependent record has none.
    """
    raw = (patient.personal_number or '').strip()
    if raw:
        return raw.upper()
    if patient.category == 'dependent' and patient.principal_staff_id:
        ps = patient.principal_staff
        if ps is not None:
            pr = (ps.personal_number or '').strip()
            if pr:
                return pr.upper()
    return '—'


def _patient_info(dispatch, *, doc, patient: Patient) -> object:
    """3-column patient header for the referral letter (no clinical diagnosis line)."""
    order = dispatch.order

    age_str = f"{patient.age} YEARS" if patient.age else "—"
    gender = (patient.gender or '').upper() or '—'

    doctor_name = order.doctor.get_full_name() if order.doctor else '—'
    clinic_name = order.clinic or '—'
    lab_no = order.lab_number or order.order_id or '—'

    # Referral letter: clinical context lives in the "Clinical Notes" section
    # below — omitting "Clinical Diagnosis" here avoids duplicating order notes
    # in the patient header.
    return patient_info_block(
        left=[
            ("Name", patient.get_full_name()),
            ("Age", age_str),
            ("Dept.", _division_line(patient)),
        ],
        middle=[
            ("Sex", gender),
            ("Order Date", _fmt_short(order.ordered_at)),
        ],
        right=[
            ("Doctor", doctor_name),
            ("Lab. No.", lab_no),
            ("Clinic", clinic_name),
            ("P/No.", _personal_number_line(patient)),
        ],
        width=doc.usable_width,
    )


# ---------------------------------------------------------------------------
# Referral letter
# ---------------------------------------------------------------------------

def build_referral_letter_pdf(dispatch) -> bytes:
    """
    Build the formal referral letter sent with outsourced samples.

        [letterhead]
        [3-column patient block — no duplicate diagnosis line]
        LABORATORY REFERRAL LETTER
        To: partner (+ address)
        Intro paragraph
        Investigations Requested (table) — sole list of tests
        Clinical Notes (when present)
        Forward-results paragraph (email + department + quote IDs)
        Referring Doctor | Med. Lab. Scientist signatures
        Date + Referral ID (below signatures)
        Electronic-validity footer
    """
    buffer = BytesIO()
    doc = NPADocument(
        buffer,
        department="MEDICAL LABORATORY SCIENCE DEPARTMENT",
        document_title=f"Laboratory Referral Letter — {dispatch.dispatch_id}",
    )

    tests = list(dispatch.tests.all())

    order = dispatch.order
    patient = _patient_row_for_pdf(order)
    referring_doctor = order.doctor.get_full_name() if order.doctor else "—"

    test_rows = [
        [
            t.name,
            t.code,
            (t.sample_type or '—'),
            (t.lab_number or '—'),
        ]
        for t in tests
    ]

    story = [
        _patient_info(dispatch, doc=doc, patient=patient),
        Spacer(1, 8),
        centered_section_title("LABORATORY REFERRAL LETTER"),
        Spacer(1, 4),
        # Letter-style cite-line: dispatch date on the left, Referral ID on the
        # right. This is the canonical place a recipient looks for "when was
        # this issued?" + "which slip is this?" before reading the body.
        rich_paragraph(
            f'<b>Date:</b> {_e(_fmt_short(dispatch.issued_at))}'
            f'<font color="#94a3b8">&nbsp;&nbsp;|&nbsp;&nbsp;</font>'
            f'<b>Referral ID:</b> {_e(dispatch.dispatch_id)}'
        ),
        Spacer(1, 8),
        label_paragraph("To:"),
        *[body_paragraph(line) for line in _addressee_lines(dispatch)],
        Spacer(1, 10),
        body_paragraph(
            "Please kindly perform the following laboratory investigation(s) "
            "for our patient named in the header above. The relevant sample(s) "
            "and clinical context accompany this letter."
        ),
        Spacer(1, 8),
        section_heading("Investigations Requested"),
        data_table(
            ['TEST', 'CODE', 'SAMPLE', 'LAB NO.'],
            test_rows,
            col_widths=[2.6 * inch, 0.9 * inch, 1.0 * inch, 1.5 * inch],
            italic_col=0,
        ),
    ]

    if order.clinical_notes:
        story += [
            Spacer(1, 10),
            section_heading("Clinical Notes"),
            body_paragraph(order.clinical_notes),
        ]

    if dispatch.notes:
        story += [
            Spacer(1, 8),
            section_heading("Dispatch Notes"),
            body_paragraph(dispatch.notes),
        ]

    story += [
        Spacer(1, 10),
        rich_paragraph(
            "Kindly forward results to "
            "<b>medicallab@nigerianports.gov.ng</b> "
            "(Nigerian Ports Authority Medical Services, "
            "Medical Laboratory Science Department). "
            "Please quote the "
            f"<b>Referral ID</b> ({_e(dispatch.dispatch_id)}) and "
            f"<b>Lab No.</b> ({_e(order.lab_number or order.order_id)}) "
            "in all correspondence."
        ),
        Spacer(1, 18),
        signature_block(
            left_role="Referring Doctor",
            left_name=referring_doctor,
            right_role="Med. Lab. Scientist",
            right_name=(
                dispatch.issued_by.get_full_name() if dispatch.issued_by else ""
            ),
            width=doc.usable_width,
        ),
        Spacer(1, 14),
        italic_paragraph(
            "This referral letter was generated electronically and is valid "
            "for laboratory testing."
        ),
    ]

    doc.build(story, document_serial=dispatch.dispatch_id)
    buffer.seek(0)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Responsibility form
# ---------------------------------------------------------------------------

def _top_doctor_signature_block(*, role_text: str, name: str, width: float) -> Table:
    """
    Thin rule sitting immediately above the Doctor-in-charge block (no 28pt gap
    like `signature_block`, which pushed the line away from the labels).
    """
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
    """
    Two-column signoff for the detach slip.

    Each row's label cell auto-sizes to the actual text width (using
    `pdfmetrics.stringWidth`), and the dotted rule fills the remaining cell
    width. So `Doctor's Name`, `Signature`, and `Date` each end where the
    text ends and the dots take over from there — matching how a paper form
    looks. All field rows are 26pt tall so the right and left baselines stay
    aligned even when individual labels are different lengths.
    """
    from common.pdf import FONT_BOLD

    styles = npa_styles()
    gutter = 14
    col_w = (width - gutter) / 2

    def _hdr(text: str) -> Paragraph:
        return Paragraph(f"<b>{_e(text)}</b>", styles["body_compact"])

    def _label_with_dotted_fill(text: str, total_w: float) -> Table:
        """Label flush-left with a dotted rule filling the rest of the row."""
        if not text:
            return Table([[""]], colWidths=[total_w], rowHeights=[26])
        # 4pt of breathing room between the label and the start of the dots.
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

    # Pad both sides to the same header line count so the field rows below
    # start on the same baseline regardless of how many header lines each
    # side actually needs (e.g. partner side often has an extra company-name
    # line that the NPA side lacks).
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
    """Single dotted rule used to give the recipient a line to write a remark on."""
    # spaceBefore=14 keeps the lines far enough apart for an adult to write a
    # remark between them — at 6pt they were too cramped to be useful.
    return HRFlowable(
        width="100%",
        thickness=0.5,
        color=COLOR_LINE,
        dash=(1, 2),
        hAlign='LEFT',
        spaceBefore=14,
        spaceAfter=0,
    )


def build_responsibility_form_pdf(dispatch) -> bytes:
    """
    Build the financial-responsibility form NPA hands to the partner lab.

    Layout:
        [letterhead]
        RESPONSIBILITY FORM
        To: [partner addressee]
        NAME / P.N. / DEPT. line
        Certification paragraph
        Doctor-in-charge signature (NPA side, single column)

        ── ── ── (half-width dotted detach line) ── ── ──

        Detach notice
        NAME / P.N. / DEPT. line
        Two-column sign-off (NPA Doctor-in-charge | Receiving Doctor at partner)
        Doctor's Remarks (5 dotted lines)
    """
    buffer = BytesIO()
    doc = NPADocument(
        buffer,
        department="MEDICAL LABORATORY SCIENCE DEPARTMENT",
        document_title=f"Responsibility Form — {dispatch.dispatch_id}",
    )

    order = dispatch.order
    patient = _patient_row_for_pdf(order)
    referring_doctor = order.doctor.get_full_name() if order.doctor else "—"

    pno = _personal_number_line(patient)
    department = _division_line(patient)

    # Partner addressee (used on the right column of the detach signoff so the
    # receiving lab signs under the recorded company name + role).
    partner = dispatch.partner
    partner_role = (
        (partner.contact_person_title.strip() if partner else '') or 'The Medical Director'
    )
    partner_name = dispatch.partner_name.strip() or 'External Laboratory'

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

    # Top signature: rule sits immediately above the Doctor-in-charge labels —
    # unlike `signature_block`, which reserves a tall spacer above the text.
    top_signature = _top_doctor_signature_block(
        role_text="Doctor-in-charge\nFor: Managing Director, NPA",
        name=referring_doctor,
        width=doc.usable_width / 2,
    )

    story = [
        _plain_centered_title("RESPONSIBILITY FORM"),
        Spacer(1, 10),
        label_paragraph("To:"),
        *[body_paragraph(line) for line in _addressee_lines(dispatch)],
        Spacer(1, 10),
        name_line,
        Spacer(1, 10),
        # Two short paragraphs — wording matches the printed NPA form
        # (the printed form uses "Department" rather than "Dependant", so we
        # keep that spelling for parity with the physical document).
        body_paragraph(
            "I certify that the above named who is now referred for treatment "
            "at the hospital is a bonafide Pensioner/Employee/Spouse/"
            "Department of the Nigerian Ports Authority."
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

    # ── Detach slip ─────────────────────────────────────────────────────────
    # Full-width dotted rule signals the cut line.
    story += [
        Spacer(1, 14),
        HRFlowable(
            width=doc.usable_width,
            thickness=0.6,
            color=COLOR_LINE,
            dash=(2, 2),
            hAlign='CENTER',
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

    doc.build(story, document_serial=dispatch.dispatch_id)
    buffer.seek(0)
    return buffer.getvalue()


__all__ = [
    "build_referral_letter_pdf",
    "build_responsibility_form_pdf",
]
