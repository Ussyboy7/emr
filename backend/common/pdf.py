"""
Standardized PDF generation for Nigerian Ports Authority Medical Services.

Single source of truth for visual identity (letterhead, fonts, layouts, footers)
used by every backend-rendered PDF in the EMR. Modeled on the existing NPA paper
report template:

    [LOGO]   NIGERIAN PORTS AUTHORITY
             MEDICAL SERVICES DIVISION
             <DEPARTMENT NAME>
    -----------------------------------------------------------------
    Name: ...           Sex: ...               Doctor: ...
    Age: ...            Collection: ...        Lab. No.: ...
    Specimen: ...       Report Date: ...       Clinic: ...
    Dept.: ...                                 P/No.: ...
    Clinical Diagnosis: ...
    Request(s): ...
    -----------------------------------------------------------------
                       —— SECTION TITLE ——
    PARAMETER     RESULTS    UNITS     REF. VALUES     FLAGS
    ...

Public API:

    NPADocument                  Document wrapper with letterhead + footer on every page
    npa_styles()                 Dict of ParagraphStyle (title/section/body/label/small/italic …)
    body_paragraph(text)         Body text Paragraph
    small_paragraph(text)        Footer-sized muted Paragraph
    italic_paragraph(text)       Disclaimer-style italic Paragraph
    label_paragraph(text)        Bold label Paragraph
    section_heading(text)        Left-aligned navy heading (for sub-sections inside a body)
    centered_section_title(text) Centered italic title between two rules (HAEMATOLOGY REPORT-style)
    patient_info_block(...)      3-column patient/order header (Name / Sex / Doctor columns)
    request_line(label, value)   Single-line "Request(s): ..." entry
    data_table(...)              Header+rows table with optional FLAGS column auto-derivation
    flag_for_status(...)         Map a Status (Critical/Abnormal/Normal) + direction to H/L/HH/LL
    signature_line(role)         Centered signature line (Med. Lab. Scientist style)
    signature_block(...)         1- or 2-column signature lines
    certification_paragraph(t)   "I certify..." style block
    detach_slip(content)         Dashed-rule + small-print "should be detached..." pattern
"""

from __future__ import annotations

import os
from io import BytesIO
from typing import Iterable, Optional
from xml.sax.saxutils import escape

from django.utils import timezone

from common.date_display import format_display_datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image as RLImage,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


# ---------------------------------------------------------------------------
# Visual identity constants
# ---------------------------------------------------------------------------

COLOR_ACCENT = colors.HexColor("#1d3a6e")   # NPA navy (used sparingly: rules, headings)
COLOR_BODY = colors.HexColor("#111111")
COLOR_MUTED = colors.HexColor("#555555")
COLOR_LINE = colors.HexColor("#888888")     # darker grey for body rules to print well
COLOR_LIGHT_BG = colors.HexColor("#f3f4f6")
COLOR_CRITICAL = colors.HexColor("#b91c1c")
COLOR_ABNORMAL = colors.HexColor("#92400e")
COLOR_NORMAL = colors.HexColor("#16a34a")

FONT_BODY = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_ITALIC = "Helvetica-Oblique"
FONT_BOLD_ITALIC = "Helvetica-BoldOblique"

PAGE_MARGIN = 16 * mm
HEADER_HEIGHT = 42 * mm  # space reserved at top for centred logo + title block
FOOTER_HEIGHT = 14 * mm  # space reserved at bottom for footer

ORG_LINE_1 = "NIGERIAN PORTS AUTHORITY"
ORG_LINE_2 = "MEDICAL SERVICES DIVISION"
DEFAULT_DEPARTMENT_LINE = ""  # callers should set this per-document type

# Resolve the default logo path. Callers can override per-document.
_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
DEFAULT_LOGO_PATH = os.path.join(_ASSETS_DIR, "npa_logo.png")


# ---------------------------------------------------------------------------
# Paragraph styles
# ---------------------------------------------------------------------------

def npa_styles() -> dict[str, ParagraphStyle]:
    """Return the canonical NPA paragraph styles."""
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "NPATitle", parent=base["Heading1"],
            fontName=FONT_BOLD, fontSize=15, leading=18,
            alignment=0, textColor=COLOR_BODY, spaceAfter=2,
        ),
        "section": ParagraphStyle(
            "NPASection", parent=base["Heading2"],
            fontName=FONT_BOLD, fontSize=11, leading=14,
            textColor=COLOR_ACCENT, spaceBefore=8, spaceAfter=4,
        ),
        "centered_title": ParagraphStyle(
            "NPACenteredTitle", parent=base["Heading2"],
            fontName=FONT_BOLD_ITALIC, fontSize=12, leading=16,
            alignment=1, textColor=COLOR_BODY, spaceBefore=2, spaceAfter=2,
        ),
        "body": ParagraphStyle(
            "NPABody", parent=base["Normal"],
            fontName=FONT_BODY, fontSize=10, leading=13,
            textColor=COLOR_BODY, spaceAfter=2,
        ),
        "body_compact": ParagraphStyle(
            "NPABodyCompact", parent=base["Normal"],
            fontName=FONT_BODY, fontSize=9.5, leading=12,
            textColor=COLOR_BODY, spaceAfter=0,
        ),
        "label": ParagraphStyle(
            "NPALabel", parent=base["Normal"],
            fontName=FONT_BOLD, fontSize=9.5, leading=12,
            textColor=COLOR_BODY,
        ),
        "small": ParagraphStyle(
            "NPASmall", parent=base["Normal"],
            fontName=FONT_BODY, fontSize=8, leading=10,
            textColor=COLOR_MUTED,
        ),
        "italic": ParagraphStyle(
            "NPAItalic", parent=base["Normal"],
            fontName=FONT_ITALIC, fontSize=9, leading=12,
            textColor=COLOR_MUTED,
        ),
        "param": ParagraphStyle(
            "NPAParam", parent=base["Normal"],
            fontName=FONT_ITALIC, fontSize=10, leading=13,
            textColor=COLOR_BODY,
        ),
    }


# ---------------------------------------------------------------------------
# Letterhead + footer canvas painters
# ---------------------------------------------------------------------------

def _draw_letterhead(
    canvas,
    doc,
    *,
    department_line: str = "",
    logo_path: str = DEFAULT_LOGO_PATH,
):
    """
    Centred letterhead — logo at the top centre, three title lines stacked
    centrally below it, with a solid rule across the page underneath.

        [LOGO]
        NIGERIAN PORTS AUTHORITY
        MEDICAL SERVICES DIVISION
        <DEPARTMENT NAME>
        ─────────────────────────
    """
    page_width, page_height = doc.pagesize
    canvas.saveState()

    centre_x = page_width / 2
    top_y = page_height - PAGE_MARGIN
    logo_size = 20 * mm  # crest is roughly square; preserve aspect ratio

    # Centred logo at the top.
    logo_bottom_y = top_y
    if logo_path and os.path.exists(logo_path):
        try:
            from reportlab.lib.utils import ImageReader

            img = ImageReader(logo_path)
            iw, ih = img.getSize()
            ratio = min(logo_size / iw, logo_size / ih)
            draw_w = iw * ratio
            draw_h = ih * ratio
            logo_bottom_y = top_y - draw_h
            canvas.drawImage(
                img,
                centre_x - draw_w / 2,
                logo_bottom_y,
                width=draw_w,
                height=draw_h,
                mask='auto',
                preserveAspectRatio=True,
            )
        except Exception:
            logo_bottom_y = top_y - logo_size

    # Centred title block below the logo.
    canvas.setFillColor(COLOR_BODY)
    text_y = logo_bottom_y - 5 * mm  # gap between logo and first line
    canvas.setFont(FONT_BOLD, 14)
    canvas.drawCentredString(centre_x, text_y, ORG_LINE_1)
    text_y -= 5 * mm
    canvas.setFont(FONT_BOLD, 11)
    canvas.drawCentredString(centre_x, text_y, ORG_LINE_2)
    if department_line:
        text_y -= 4.5 * mm
        canvas.drawCentredString(centre_x, text_y, department_line)

    # Solid rule under the letterhead (matches paper template).
    rule_y = top_y - HEADER_HEIGHT
    canvas.setStrokeColor(COLOR_BODY)
    canvas.setLineWidth(1.0)
    canvas.line(PAGE_MARGIN, rule_y, page_width - PAGE_MARGIN, rule_y)

    canvas.restoreState()


def _draw_footer(canvas, doc, *, document_serial: str = ""):
    page_width, _ = doc.pagesize
    canvas.saveState()

    canvas.setStrokeColor(COLOR_LINE)
    canvas.setLineWidth(0.4)
    canvas.line(PAGE_MARGIN, FOOTER_HEIGHT, page_width - PAGE_MARGIN, FOOTER_HEIGHT)

    canvas.setFillColor(COLOR_MUTED)
    canvas.setFont(FONT_BODY, 8)

    if document_serial:
        canvas.drawString(PAGE_MARGIN, FOOTER_HEIGHT - 9, f"Document: {document_serial}")

    generated = format_display_datetime()
    canvas.drawCentredString(page_width / 2, FOOTER_HEIGHT - 9, f"Generated: {generated}")

    page_num = canvas.getPageNumber()
    canvas.drawRightString(page_width - PAGE_MARGIN, FOOTER_HEIGHT - 9, f"Page {page_num}")

    canvas.restoreState()


# ---------------------------------------------------------------------------
# NPADocument
# ---------------------------------------------------------------------------

class NPADocument:
    """
    Wrap reportlab's `BaseDocTemplate` with the standard NPA letterhead + footer
    on every page.

    Every PDF generated by the EMR backend should use this so the institution's
    visual identity stays consistent.
    """

    def __init__(
        self,
        buffer: BytesIO,
        *,
        department: str = DEFAULT_DEPARTMENT_LINE,
        document_title: str = "",
        logo_path: str = DEFAULT_LOGO_PATH,
        pagesize=A4,
    ):
        self.department = department
        self.document_title = document_title
        self.logo_path = logo_path
        self._doc = BaseDocTemplate(
            buffer,
            pagesize=pagesize,
            leftMargin=PAGE_MARGIN,
            rightMargin=PAGE_MARGIN,
            topMargin=PAGE_MARGIN + HEADER_HEIGHT + 4,
            bottomMargin=PAGE_MARGIN + FOOTER_HEIGHT,
            title=document_title or "NPA Medical Services",
            author="Nigerian Ports Authority Medical Services",
        )

    def build(self, story, *, document_serial: str = ""):
        page_width, page_height = self._doc.pagesize
        frame = Frame(
            self._doc.leftMargin,
            self._doc.bottomMargin,
            page_width - self._doc.leftMargin - self._doc.rightMargin,
            page_height - self._doc.topMargin - self._doc.bottomMargin,
            id="body",
        )
        department = self.department
        logo_path = self.logo_path

        def on_page(canvas, doc):
            _draw_letterhead(canvas, doc, department_line=department, logo_path=logo_path)
            _draw_footer(canvas, doc, document_serial=document_serial)

        self._doc.addPageTemplates(
            [PageTemplate(id="main", frames=[frame], onPage=on_page)]
        )
        self._doc.build(story)

    @property
    def page_width(self) -> float:
        return self._doc.pagesize[0]

    @property
    def usable_width(self) -> float:
        return self.page_width - self._doc.leftMargin - self._doc.rightMargin


# ---------------------------------------------------------------------------
# Reusable flowable builders
# ---------------------------------------------------------------------------

def _safe(text) -> str:
    return escape("" if text is None else str(text)).replace("\n", "<br/>")


def section_heading(text: str) -> Paragraph:
    return Paragraph(_safe(text), npa_styles()["section"])


def body_paragraph(text: str) -> Paragraph:
    return Paragraph(_safe(text) if text not in (None, "") else "&nbsp;", npa_styles()["body"])


def rich_paragraph(html: str, style_key: str = "body") -> Paragraph:
    """
    Body paragraph that accepts pre-formatted reportlab mini-XML (`<b>`, `<i>`,
    `<font>`, `<br/>`, `&nbsp;`, etc.).

    The caller is responsible for escaping any untrusted/user-provided substrings
    before composing the markup. Use `body_paragraph` instead when the input is
    plain text.
    """
    return Paragraph(html if html not in (None, "") else "&nbsp;", npa_styles()[style_key])


def small_paragraph(text: str) -> Paragraph:
    return Paragraph(_safe(text), npa_styles()["small"])


def italic_paragraph(text: str) -> Paragraph:
    return Paragraph(_safe(text), npa_styles()["italic"])


def label_paragraph(text: str) -> Paragraph:
    return Paragraph(_safe(text), npa_styles()["label"])


def centered_section_title(text: str) -> Table:
    """
    Body-level centered italic title between two horizontal rules, e.g. "HAEMATOLOGY REPORT".
    """
    styles = npa_styles()
    para = Paragraph(_safe(text.upper()), styles["centered_title"])
    t = Table([[para]], colWidths=["*"])
    t.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LINEABOVE", (0, 0), (-1, 0), 0.6, COLOR_BODY),
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, COLOR_BODY),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return t


def patient_info_block(
    left: list[tuple[str, str]],
    middle: list[tuple[str, str]] | None = None,
    right: list[tuple[str, str]] | None = None,
    *,
    width: float = 6.5 * inch,
) -> Table:
    """
    3-column patient/order header. Each column is a list of (label, value) pairs.
    Renders as `Label: value` on each row, with bold label and regular value.
    """
    middle = middle or []
    right = right or []
    styles = npa_styles()

    label_style = styles["label"]
    value_style = styles["body_compact"]

    def _column_para(rows: list[tuple[str, str]]) -> Paragraph:
        parts = []
        for k, v in rows:
            label = escape(str(k or ""))
            value = escape("" if v in (None, "") else str(v))
            parts.append(f'<font name="{FONT_BOLD}">{label}:</font> {value}')
        text = "<br/>".join(parts) if parts else "&nbsp;"
        # Build a paragraph that renders compact lines.
        return Paragraph(text, value_style)

    cols = [_column_para(left), _column_para(middle), _column_para(right)]
    col_widths = [width / 3] * 3

    t = Table([cols], colWidths=col_widths)
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return t


def request_line(label: str, value: str, *, width: float = 6.5 * inch) -> Table:
    """A single 'Request(s): ...' style line that visually pairs with the patient block."""
    styles = npa_styles()
    para = Paragraph(
        f'<font name="{FONT_BOLD}">{escape(label)}:</font> {escape(value or "")}',
        styles["body"],
    )
    t = Table([[para]], colWidths=[width])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return t


def flag_for_status(status: str, *, value: float | None = None, low: float | None = None, high: float | None = None) -> str:
    """
    Map a status to its conventional clinical flag letter.

    H   above reference (Abnormal high)
    L   below reference (Abnormal low)
    HH  critically above reference
    LL  critically below reference
    """
    s = (status or "").strip().lower()
    if s in ("normal", ""):
        return ""
    direction = ""
    if value is not None and (high is not None or low is not None):
        try:
            if high is not None and float(value) > float(high):
                direction = "H"
            elif low is not None and float(value) < float(low):
                direction = "L"
        except Exception:
            direction = ""
    if s == "critical":
        return (direction * 2) if direction else "**"
    if s == "abnormal":
        return direction or "*"
    return ""


def data_table(
    headers: list[str],
    rows: list[list],
    *,
    col_widths: list[float] | None = None,
    row_statuses: list[str] | None = None,
    row_flags: list[str] | None = None,
    italic_col: int | None = 0,
    flag_col: int | None = None,
) -> Table:
    """
    Header + rows table. The look matches the NPA paper template:
      - bold uppercase header on a subtle tinted row, with a line under
      - parameter column rendered in italic
      - flag letters in the FLAGS column (when `flag_col` is set, derived from `row_statuses`)
      - all other text in plain black

    Parameters:
        headers       column header labels.
        rows          list of cell rows; each cell is coerced to string.
        col_widths    explicit column widths; auto if None.
        row_statuses  optional list of "Normal" / "Abnormal" / "Critical" matching `rows`.
        italic_col    column index to render in italic (e.g. parameter name col); -1 to disable.
        flag_col      column index that should contain the flag letters; if None, no auto-flagging.

    Header row repeats on each page break.
    """
    styles = npa_styles()

    def _para(text: str, italic: bool = False, bold: bool = False) -> Paragraph:
        if italic and bold:
            font = FONT_BOLD_ITALIC
        elif italic:
            font = FONT_ITALIC
        elif bold:
            font = FONT_BOLD
        else:
            font = FONT_BODY
        style = ParagraphStyle(
            f"NPACell-{font}",
            parent=styles["body_compact"],
            fontName=font,
        )
        return Paragraph(_safe(text), style)

    full_data: list[list] = [
        [_para(h, italic=False, bold=True) for h in headers]
    ]
    for row_idx, row in enumerate(rows):
        status = row_statuses[row_idx] if row_statuses and row_idx < len(row_statuses) else None
        explicit_flag = row_flags[row_idx] if row_flags and row_idx < len(row_flags) else None
        cells = []
        for col_idx, cell in enumerate(row):
            text = "" if cell is None else str(cell)
            italic = (italic_col is not None and col_idx == italic_col)
            bold = False
            # Auto-fill the flags column from explicit flag (preferred) or status.
            if flag_col is not None and col_idx == flag_col and not text:
                if explicit_flag is not None:
                    text = explicit_flag
                    bold = bool(text)
                elif status:
                    text = flag_for_status(status)
                    bold = bool(text)
            cells.append(_para(text, italic=italic, bold=bold))
        full_data.append(cells)

    table = Table(full_data, colWidths=col_widths, repeatRows=1)

    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_LIGHT_BG),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, COLOR_BODY),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, COLOR_BODY),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, COLOR_BODY),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]

    table.setStyle(TableStyle(style_cmds))
    return table


def signature_line(role: str, *, width: float = 6.5 * inch) -> Table:
    """
    Centered signature space + role label below — matches the photo's
    "Med. Lab. Scientist" pattern at the bottom of the lab report body.
    """
    styles = npa_styles()
    para = Paragraph(_safe(role), styles["body_compact"])
    t = Table([[Spacer(1, 24)], [para]], colWidths=[2.6 * inch])
    t.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LINEABOVE", (0, 1), (-1, 1), 0.4, COLOR_BODY),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    # Wrap into a centered outer table so the signature box sits in the middle.
    outer = Table([[t]], colWidths=[width])
    outer.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 18),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return outer


def signature_block(
    *,
    left_role: str,
    left_name: str = "",
    right_role: str = "",
    right_name: str = "",
    width: float = 6.5 * inch,
) -> Table:
    """1- or 2-column signature block with line-above-name pattern."""
    styles = npa_styles()

    def cell(role: str, name: str) -> list:
        return [
            Spacer(1, 28),
            Paragraph(_safe(role), styles["label"]),
            Paragraph(_safe(name) if name else "&nbsp;", styles["body_compact"]),
        ]

    if right_role:
        col_w = width / 2
        data = [[cell(left_role, left_name), cell(right_role, right_name)]]
        col_widths = [col_w, col_w]
    else:
        data = [[cell(left_role, left_name)]]
        col_widths = [width]

    t = Table(data, colWidths=col_widths)
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEABOVE", (0, 0), (-1, 0), 0.4, COLOR_BODY),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    return t


def certification_paragraph(text: str) -> Paragraph:
    """Slightly more spaced body paragraph for legal-style certification statements."""
    style = ParagraphStyle(
        "NPACertification",
        parent=npa_styles()["body"],
        fontSize=10,
        leading=15,
        spaceBefore=8,
        spaceAfter=8,
    )
    return Paragraph(_safe(text), style)


def detach_slip(content_flowables: list, *, header_text: str = "This portion should be detached and returned.") -> list:
    """Build a 'detach below' slip pattern."""
    styles = npa_styles()
    spacer = Spacer(1, 18)

    rule = Table([[""]], colWidths=[6.5 * inch], rowHeights=[6])
    rule.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.6, COLOR_BODY)]))

    notice = Paragraph(_safe(header_text), styles["small"])
    return [spacer, rule, Spacer(1, 6), notice, Spacer(1, 6), *content_flowables]


# Backwards-compatible meta_table for callers not yet on patient_info_block
def meta_table(
    rows: Iterable[tuple[str, str]],
    *,
    label_width: float = 1.7 * inch,
    value_width: float = 4.4 * inch,
) -> Table:
    """Generic 2-column label/value table."""
    styles = npa_styles()
    data = [
        [
            Paragraph(_safe(label), styles["label"]),
            Paragraph(_safe(value) if value not in (None, "") else "&mdash;", styles["body"]),
        ]
        for label, value in rows
    ]
    t = Table(data, colWidths=[label_width, value_width])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.25, COLOR_LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return t


__all__ = [
    "NPADocument",
    "npa_styles",
    "section_heading",
    "centered_section_title",
    "body_paragraph",
    "rich_paragraph",
    "small_paragraph",
    "italic_paragraph",
    "label_paragraph",
    "patient_info_block",
    "request_line",
    "data_table",
    "flag_for_status",
    "signature_line",
    "signature_block",
    "certification_paragraph",
    "detach_slip",
    "meta_table",
    # Constants
    "COLOR_ACCENT",
    "COLOR_BODY",
    "COLOR_MUTED",
    "COLOR_LINE",
    "COLOR_LIGHT_BG",
    "COLOR_CRITICAL",
    "COLOR_ABNORMAL",
    "COLOR_NORMAL",
    "FONT_BODY",
    "FONT_BOLD",
    "FONT_ITALIC",
    "FONT_BOLD_ITALIC",
    "ORG_LINE_1",
    "ORG_LINE_2",
    "DEFAULT_LOGO_PATH",
]
