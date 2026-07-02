"""Bundled PDF for the comprehensive MR report."""
from __future__ import annotations

from io import BytesIO
from typing import Any

from reportlab.platypus import PageBreak, Spacer

from common.date_display import format_display_datetime, format_display_range
from common.pdf import NPADocument, body_paragraph, centered_section_title, section_heading, small_paragraph
from reports.comprehensive_report_bundle import build_comprehensive_report_bundle
from reports.export_helpers import _table_from_rows


def _dict_rows_table(rows: list[dict], *, columns: list[tuple[str, str]] | None = None) -> Any:
    if not rows:
        return body_paragraph("No data for this period.")
    if columns is None:
        keys = [k for k in rows[0].keys() if k not in ("periods", "key", "source")]
        headers = [k.replace("_", " ").title() for k in keys]
        table_rows = [[row.get(k, "") for k in keys] for row in rows]
    else:
        headers = [h for _, h in columns]
        table_rows = [[row.get(k, "") for k, _ in columns] for row in rows]
    return _table_from_rows(headers, table_rows)


def _section_story(section: dict) -> list:
    story: list = []
    title = section.get("title") or section.get("key") or "Section"
    report = section.get("report") or {}
    story.append(section_heading(title))

    if report.get("error"):
        story.append(body_paragraph(f"Error: {report['error']}"))
        return story

    key = section.get("key")

    if key == "attendance_statistics":
        from reports.attendance_statistics_pdf import _matrix_table

        story.append(_matrix_table(report, use_pdf_labels=True))
        return story

    if key == "referral_tracking":
        retainership = report.get("retainership") or []
        if retainership:
            story.append(body_paragraph("Retainership hospitals"))
            story.append(
                _dict_rows_table(
                    retainership,
                    columns=[
                        ("sn", "S/N"),
                        ("facility", "Facility"),
                        ("new", "New"),
                        ("follow_up", "Follow-up"),
                        ("total", "Total"),
                    ],
                )
            )
        else:
            story.append(body_paragraph("No retainership referrals in period."))
        return story

    if key == "disease_pattern_compared":
        labels = report.get("period_labels") or []
        rows = report.get("data") or []
        if not rows:
            story.append(body_paragraph("No data."))
            return story
        headers = ["S/N", "Code", "Description", *labels]
        table_rows = []
        for row in rows:
            cells = [row.get("sn"), row.get("code"), row.get("description")]
            periods = row.get("periods") or {}
            for label in labels:
                cells.append((periods.get(label) or {}).get("total", 0))
            table_rows.append(cells)
        story.append(_table_from_rows(headers, table_rows))
        return story

    data = report.get("data")
    if isinstance(data, list) and data:
        if key == "radiological_services":
            story.append(
                _dict_rows_table(
                    data,
                    columns=[
                        ("sn", "S/N"),
                        ("modality", "Modality"),
                        ("location", "Location"),
                        ("male", "Male"),
                        ("female", "Female"),
                        ("count", "Total"),
                    ],
                )
            )
        elif key in ("physio_clinical_diagnosis", "eye_clinical_diagnosis"):
            story.append(
                _dict_rows_table(
                    data,
                    columns=[
                        ("sn", "S/N"),
                        ("code", "Code"),
                        ("description", "Description"),
                        ("count", "Count"),
                        ("percentage", "%"),
                    ],
                )
            )
        elif key == "disease_pattern":
            story.append(
                _dict_rows_table(
                    data,
                    columns=[
                        ("sn", "S/N"),
                        ("code", "Code"),
                        ("description", "Description"),
                        ("employee", "Employee"),
                        ("non_employee", "Non-emp."),
                        ("male", "Male"),
                        ("female", "Female"),
                        ("total", "Total"),
                        ("percentage", "%"),
                    ],
                )
            )
        else:
            story.append(_dict_rows_table(data))
        return story

    summary = report.get("summary")
    if isinstance(summary, dict) and summary:
        rows = [[k.replace("_", " ").title(), v] for k, v in summary.items() if not isinstance(v, (dict, list))]
        story.append(_table_from_rows(["Metric", "Value"], rows))
    else:
        story.append(body_paragraph("No data for this period."))
    return story


def build_comprehensive_report_pdf(report: dict, *, generated_by: str = "") -> bytes:
    buffer = BytesIO()
    doc = NPADocument(buffer, department="MEDICAL RECORDS UNIT", document_title="COMPREHENSIVE REPORT")
    story = [centered_section_title("COMPREHENSIVE REPORT"), Spacer(1, 8)]

    period_start = report.get("period_start")
    period_end = report.get("period_end")
    if period_start and period_end:
        story.append(body_paragraph(f"Period: {format_display_range(period_start, period_end)}"))
        story.append(Spacer(1, 10))

    sections = report.get("sections") or []
    for idx, section in enumerate(sections):
        if idx > 0:
            story.append(PageBreak())
        story.extend(_section_story(section))

    if generated_by:
        story.append(Spacer(1, 12))
        story.append(small_paragraph(f"Generated {format_display_datetime()} · {generated_by}"))

    doc.build(story)
    return buffer.getvalue()


def build_comprehensive_report_pdf_for_period(period_start, period_end, *, generated_by: str = "") -> bytes:
    report = build_comprehensive_report_bundle(period_start, period_end)
    return build_comprehensive_report_pdf(report, generated_by=generated_by)
