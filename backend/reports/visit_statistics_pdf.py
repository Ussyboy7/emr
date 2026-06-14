"""PDF export for visit statistics (A4 portrait, NPA house style)."""
from __future__ import annotations

from io import BytesIO

from django.utils import timezone

from common.date_display import format_display_datetime, format_display_range

from reportlab.lib import colors
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
    section_heading,
    small_paragraph,
)


def _para(text: str, *, bold: bool = False, size: float = 8) -> Paragraph:
    styles = npa_styles()
    font = FONT_BOLD if bold else FONT_BODY
    style = ParagraphStyle(
        f"VisitStat-{font}-{size}",
        parent=styles["body_compact"],
        fontName=font,
        fontSize=size,
        leading=size + 2,
    )
    return Paragraph(str(text).replace("\n", "<br/>"), style)


def _simple_table(headers: list[str], rows: list[list], *, col_widths: list[float]) -> Table:
    header_row = [_para(h, bold=True, size=7) for h in headers]
    data = [header_row]
    for row in rows:
        data.append([_para(c, size=7) for c in row])

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), COLOR_LIGHT_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_BODY),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def build_visit_statistics_pdf(
    report: dict,
    *,
    generated_by: str = "",
    department: str = "MEDICAL RECORDS UNIT",
) -> bytes:
    buffer = BytesIO()
    period_start = report.get("period_start", "")
    period_end = report.get("period_end", "")
    group_label = report.get("group_by_label", "Monthly")
    summary = report.get("summary") or {}
    data = report.get("data") or []

    title = "VISIT STATISTICS"
    if period_start and period_end:
        title = f"VISIT STATISTICS ({format_display_range(period_start, period_end, separator=' TO ')})"

    doc = NPADocument(
        buffer,
        department=department,
        document_title=title,
    )

    summary_rows = [
        ["Completed", summary.get("completed", 0)],
        ["Cancelled", summary.get("cancelled", 0)],
        ["In Progress", summary.get("in_progress", 0)],
        ["Scheduled", summary.get("scheduled", 0)],
        ["Total Visits", summary.get("total", 0)],
        ["Male", summary.get("male", 0)],
        ["Female", summary.get("female", 0)],
    ]

    status_headers = [
        "Period",
        "Completed",
        "Cancelled",
        "In Progress",
        "Scheduled",
        "Total",
    ]
    status_rows = [
        [
            row.get("period_label", ""),
            row.get("completed", 0),
            row.get("cancelled", 0),
            row.get("in_progress", 0),
            row.get("scheduled", 0),
            row.get("total", 0),
        ]
        for row in data
    ]
    status_rows.append(
        [
            "TOTAL",
            summary.get("completed", 0),
            summary.get("cancelled", 0),
            summary.get("in_progress", 0),
            summary.get("scheduled", 0),
            summary.get("total", 0),
        ]
    )

    demog_headers = [
        "Period",
        "Male",
        "Female",
        "Officer",
        "Staff",
        "Employee",
        "Emp Dep",
        "Ret Dep",
        "Non-NPA",
        "Retiree",
        "Non-Emp",
        "Total",
    ]
    demog_rows = [
        [
            row.get("period_label", ""),
            row.get("male", 0),
            row.get("female", 0),
            row.get("officer", 0),
            row.get("staff", 0),
            row.get("employee", 0),
            row.get("emp_dependent", 0),
            row.get("ret_dependent", 0),
            row.get("nonnpa", 0),
            row.get("retiree", 0),
            row.get("non_employee", 0),
            row.get("total", 0),
        ]
        for row in data
    ]
    demog_rows.append(
        [
            "TOTAL",
            summary.get("male", 0),
            summary.get("female", 0),
            summary.get("officer", 0),
            summary.get("staff", 0),
            summary.get("employee", 0),
            summary.get("emp_dependent", 0),
            summary.get("ret_dependent", 0),
            summary.get("nonnpa", 0),
            summary.get("retiree", 0),
            summary.get("non_employee", 0),
            summary.get("total", 0),
        ]
    )

    story = [
        centered_section_title(title),
        Spacer(1, 6),
        body_paragraph(f"Period: {format_display_range(period_start, period_end)}"),
        body_paragraph(f"Grouping: {group_label}"),
        Spacer(1, 8),
        section_heading("Summary"),
        _simple_table(["Metric", "Count"], summary_rows, col_widths=[60 * mm, 30 * mm]),
        Spacer(1, 10),
        section_heading("Status breakdown"),
        _simple_table(
            status_headers,
            status_rows,
            col_widths=[32 * mm, 18 * mm, 18 * mm, 22 * mm, 18 * mm, 18 * mm],
        ),
        Spacer(1, 10),
        section_heading("Patient category breakdown"),
        _simple_table(
            demog_headers,
            demog_rows,
            col_widths=[24 * mm] + [14 * mm] * 11,
        ),
    ]
    if generated_by:
        story.append(Spacer(1, 10))
        story.append(
            small_paragraph(
                f"Generated {format_display_datetime()} · {generated_by}"
            )
        )

    doc.build(story)
    return buffer.getvalue()
