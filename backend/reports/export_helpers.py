"""Shared CSV/PDF export helpers for report API views."""
from __future__ import annotations

import csv
from io import BytesIO, StringIO
from typing import Any

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.response import Response

from common.date_display import format_display_date, format_display_range, format_display_datetime

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

TABLE_KEYS = (
    "data",
    "items",
    "daily_data",
    "monthly_data",
    "dispensed_items",
    "top_facilities",
    "monthly_trend",
    "category_breakdown",
    "by_day",
    "by_week",
    "by_month",
    "by_bimonth",
    "by_quarter",
    "by_halfyear",
    "top_medications_by_quantity",
    "top_medications_by_events",
    "visits_trend",
    "test_distribution",
    "top_diagnoses",
    "weekly_activity",
    "top_tests",
    "top_procedures",
)


def get_export_type(request) -> str:
    qp = getattr(request, "query_params", None) or request.GET
    return qp.get("export", "json")


def generated_by_name(user) -> str:
    if user and getattr(user, "is_authenticated", False):
        return user.get_full_name() or getattr(user, "username", "") or ""
    return ""


def _para(text: str, *, bold: bool = False, size: float = 8) -> Paragraph:
    styles = npa_styles()
    font = FONT_BOLD if bold else FONT_BODY
    style = ParagraphStyle(
        f"ReportExport-{font}-{size}",
        parent=styles["body_compact"],
        fontName=font,
        fontSize=size,
        leading=size + 2,
    )
    return Paragraph(str(text).replace("\n", "<br/>"), style)


def _table_from_rows(headers: list[str], rows: list[list[Any]]) -> Table:
    data = [[_para(h, bold=True, size=7) for h in headers]]
    for row in rows:
        data.append([_para(c, size=7) for c in row])
    col_count = max(len(headers), 1)
    width = min(180 * mm / col_count, 40 * mm)
    table = Table(data, colWidths=[width] * col_count, repeatRows=1)
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


def build_generic_csv(report: Any, *, title: str = "Report") -> str:
    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow([title])
    writer.writerow([])

    if isinstance(report, list):
        if report and isinstance(report[0], dict):
            headers = list(report[0].keys())
            writer.writerow(headers)
            for row in report:
                writer.writerow([row.get(h, "") for h in headers])
        return buf.getvalue()

    if not isinstance(report, dict):
        writer.writerow([str(report)])
        return buf.getvalue()

    period_bits = [
        report.get("period_start"),
        report.get("period_end"),
        report.get("start_date"),
        report.get("end_date"),
        report.get("year"),
    ]
    period_bits = [b for b in period_bits if b]
    if period_bits:
        writer.writerow(["Period", format_display_range(period_bits[0], period_bits[1])])
    writer.writerow([])

    for key, value in report.items():
        if key in TABLE_KEYS:
            continue
        if isinstance(value, dict):
            writer.writerow([key.replace("_", " ").title()])
            for sub_key, sub_val in value.items():
                writer.writerow([sub_key, sub_val])
            writer.writerow([])
        elif isinstance(value, (int, float, str, bool)) or value is None:
            writer.writerow([key.replace("_", " ").title(), value])

    for table_key in TABLE_KEYS:
        rows = report.get(table_key)
        if not rows or not isinstance(rows, list):
            continue
        writer.writerow([])
        writer.writerow([table_key.replace("_", " ").title()])
        if rows and isinstance(rows[0], dict):
            headers = list(rows[0].keys())
            writer.writerow(headers)
            for row in rows:
                writer.writerow([row.get(h, "") for h in headers])
        elif rows and isinstance(rows[0], (list, tuple)):
            for row in rows:
                writer.writerow(list(row))
        else:
            for row in rows:
                writer.writerow([row])

    return buf.getvalue()


def build_generic_pdf(
    report: Any,
    *,
    title: str = "REPORT",
    generated_by: str = "",
    department: str = "MEDICAL RECORDS UNIT",
) -> bytes:
    buffer = BytesIO()
    doc = NPADocument(buffer, department=department, document_title=title)
    story = [centered_section_title(title.upper()), Spacer(1, 8)]

    if isinstance(report, list):
        if report and isinstance(report[0], dict):
            headers = list(report[0].keys())
            rows = [[row.get(h, "") for h in headers] for row in report]
            story.append(_table_from_rows(headers, rows))
        doc.build(story)
        return buffer.getvalue()

    if isinstance(report, dict):
        period_bits = [
            report.get("period_start"),
            report.get("period_end"),
            report.get("start_date"),
            report.get("end_date"),
        ]
        period_bits = [b for b in period_bits if b]
        if period_bits:
            story.append(body_paragraph(f"Period: {format_display_range(period_bits[0], period_bits[1])}"))
            story.append(Spacer(1, 6))

        summary_rows: list[list[Any]] = []
        for key, value in report.items():
            if key in TABLE_KEYS:
                continue
            if isinstance(value, dict):
                for sub_key, sub_val in value.items():
                    summary_rows.append([f"{key} — {sub_key}", sub_val])
            elif isinstance(value, (int, float, str, bool)) or value is None:
                summary_rows.append([key.replace("_", " ").title(), value])

        if summary_rows:
            story.append(section_heading("Summary"))
            story.append(_table_from_rows(["Metric", "Value"], summary_rows))
            story.append(Spacer(1, 8))

        for table_key in TABLE_KEYS:
            rows = report.get(table_key)
            if not rows or not isinstance(rows, list) or not rows:
                continue
            if isinstance(rows[0], dict):
                headers = list(rows[0].keys())
                table_rows = [[row.get(h, "") for h in headers] for row in rows]
                story.append(section_heading(table_key.replace("_", " ").title()))
                story.append(_table_from_rows(headers, table_rows))
                story.append(Spacer(1, 8))

    if generated_by:
        story.append(
            small_paragraph(
                f"Generated {format_display_datetime()} · {generated_by}"
            )
        )

    doc.build(story)
    return buffer.getvalue()


def respond_with_export(
    request,
    report: Any,
    *,
    filename_prefix: str,
    title: str,
    csv_builder=None,
    pdf_builder=None,
    department: str = "MEDICAL RECORDS UNIT",
):
    """Return JSON, CSV, or PDF based on ``export`` query param."""
    export_type = get_export_type(request)
    user = getattr(request, "user", None)
    generated_by = generated_by_name(user)

    if export_type == "csv":
        if csv_builder:
            csv_text = csv_builder(report)
        else:
            csv_text = build_generic_csv(report, title=title)
        filename = f"{filename_prefix}.csv"
        response = HttpResponse(csv_text, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    if export_type == "pdf":
        if pdf_builder:
            pdf_bytes = pdf_builder(report, generated_by=generated_by)
        else:
            pdf_bytes = build_generic_pdf(
                report, title=title, generated_by=generated_by, department=department
            )
        filename = f"{filename_prefix}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    if isinstance(report, list):
        return Response(report)
    return Response(report)
