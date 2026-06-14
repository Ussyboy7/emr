"""PDF export for attendance statistics (A4 portrait, NPA house style)."""
from __future__ import annotations

from io import BytesIO

from django.utils import timezone

from common.date_display import format_display_datetime, format_display_month_year, format_display_range
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

from common.pdf import (
    COLOR_BODY,
    COLOR_LIGHT_BG,
    FONT_BODY,
    FONT_BOLD,
    NPADocument,
    body_paragraph,
    centered_section_title,
    npa_styles,
    small_paragraph,
)


def _para(text: str, *, bold: bool = False, size: float = 8) -> Paragraph:
    styles = npa_styles()
    font = FONT_BOLD if bold else FONT_BODY
    style = ParagraphStyle(
        f"AttStat-{font}-{size}",
        parent=styles["body_compact"],
        fontName=font,
        fontSize=size,
        leading=size + 2,
    )
    return Paragraph(str(text).replace("\n", "<br/>"), style)


def _matrix_table(report: dict, *, use_pdf_labels: bool = True) -> Table:
    headers = [
        "CATEGORY / CLINIC",
        "STAFF",
        "OFFICERS",
        "EMP. DEP.",
        "RETIREE",
        "RET. DEP.",
        "NON NPA",
        "TOTAL",
    ]
    header_row = [_para(h, bold=True, size=7) for h in headers]

    data = [header_row]
    row_styles: list[tuple] = []

    for block_idx, block in enumerate(report.get("clinics") or []):
        label = block.get("pdf_label") if use_pdf_labels else block.get("label")
        for row in block.get("rows") or []:
            gender = row.get("gender_label", "")
            clinic_cell = f"{label} ({gender})" if gender else label
            if row.get("gender") == "total":
                clinic_cell = f"Total, {label}"
            cells = [
                clinic_cell,
                row.get("staff", 0),
                row.get("officers", 0),
                row.get("employee_dependants", 0),
                row.get("retirees", 0),
                row.get("retiree_dependents", 0),
                row.get("non_npa", 0),
                row.get("row_total", 0),
            ]
            is_total = row.get("gender") == "total"
            data.append(
                [
                    _para(cells[0], bold=is_total, size=7),
                    *[_para(c, bold=is_total, size=7) for c in cells[1:]],
                ]
            )
            row_idx = len(data) - 1
            if is_total:
                row_styles.append(("FONTNAME", (0, row_idx), (-1, row_idx), FONT_BOLD))

    footer = report.get("footer") or {}
    for key in ("total_male", "total_female", "grand_total"):
        row = footer.get(key)
        if not row:
            continue
        cells = [
            row.get("gender_label", key),
            row.get("staff", 0),
            row.get("officers", 0),
            row.get("employee_dependants", 0),
            row.get("retirees", 0),
            row.get("retiree_dependents", 0),
            row.get("non_npa", 0),
            row.get("row_total", 0),
        ]
        data.append(
            [
                _para(cells[0], bold=True, size=7),
                *[_para(c, bold=True, size=7) for c in cells[1:]],
            ]
        )

    col_widths = [52 * mm, 16 * mm, 16 * mm, 16 * mm, 16 * mm, 16 * mm, 16 * mm, 16 * mm]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_LIGHT_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_BODY),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    style_commands.extend(row_styles)
    table.setStyle(TableStyle(style_commands))
    return table


def build_attendance_statistics_pdf(
    report: dict,
    *,
    generated_by: str = "",
    department: str = "MEDICAL RECORDS UNIT",
) -> bytes:
    buffer = BytesIO()
    period_start = report.get("period_start", "")
    period_end = report.get("period_end", "")
    metric_label = report.get("metric_label", "Attendance count")

    title = "ATTENDANCE STATISTICS"
    if period_start and period_end:
        if period_start[:7] == period_end[:7] and period_start.endswith("-01"):
            title = f"MONTHLY STATISTICS OF ATTENDANCE FOR {format_display_month_year(period_start).upper()}"
        else:
            title = f"ATTENDANCE STATISTICS ({format_display_range(period_start, period_end, separator=' TO ')})"

    doc = NPADocument(
        buffer,
        department=department,
        document_title=title,
    )

    story = [
        centered_section_title(title),
        Spacer(1, 6),
        body_paragraph(f"Period: {format_display_range(period_start, period_end)}"),
        body_paragraph(f"Metric: {metric_label}"),
        Spacer(1, 8),
        _matrix_table(report),
        Spacer(1, 10),
        small_paragraph(
            "Patients attending multiple clinics in the period appear in more than one clinic row. "
            "Weekend Call captures attendances on Saturday and Sunday."
        ),
    ]
    if generated_by:
        story.append(
            small_paragraph(
                f"Generated {format_display_datetime()} · {generated_by}"
            )
        )

    doc.build(story)
    return buffer.getvalue()
