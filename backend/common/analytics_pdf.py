"""Module analytics PDF layouts (NPA house style)."""
from __future__ import annotations

from io import BytesIO
from typing import Any

from django.utils import timezone

from reportlab.platypus import Spacer

from common.date_display import format_display_datetime, format_display_range
from common.pdf import NPADocument, body_paragraph, centered_section_title, section_heading, small_paragraph
from reports.export_helpers import _table_from_rows


def _module_pdf(
    report: dict[str, Any],
    *,
    title: str,
    department: str,
    generated_by: str = "",
    summary_pairs: list[tuple[str, Any]],
    table_sections: list[tuple[str, list[str], list[list[Any]]]],
) -> bytes:
    buffer = BytesIO()
    period = report.get("period") or {}
    period_label = ""
    if period.get("start") and period.get("end"):
        period_label = format_display_range(period["start"], period["end"])
    elif period.get("start_date") and period.get("end_date"):
        period_label = format_display_range(period["start_date"], period["end_date"])

    doc = NPADocument(buffer, department=department, document_title=title.upper())
    story = [centered_section_title(title.upper()), Spacer(1, 6)]
    if period_label:
        story.append(body_paragraph(f"Period: {period_label}"))
        story.append(Spacer(1, 8))

    story.append(section_heading("Summary"))
    story.append(
        _table_from_rows(
            ["Metric", "Value"],
            [[label, value] for label, value in summary_pairs],
        )
    )
    story.append(Spacer(1, 8))

    for section_title, headers, rows in table_sections:
        if not rows:
            continue
        story.append(section_heading(section_title))
        story.append(_table_from_rows(headers, rows))
        story.append(Spacer(1, 8))

    if generated_by:
        story.append(
            small_paragraph(
                f"Generated {format_display_datetime()} · {generated_by}"
            )
        )

    doc.build(story)
    return buffer.getvalue()


def build_nursing_analytics_pdf(report: dict, *, generated_by: str = "", department: str = "NURSING UNIT") -> bytes:
    summary = report.get("summary") or {}
    summary_pairs = [
        ("Total orders", summary.get("total_orders", 0)),
        ("Completed orders", summary.get("completed_orders", 0)),
        ("Pending orders", summary.get("pending_orders", 0)),
        ("Unique patients", summary.get("unique_patients", 0)),
    ]
    status_rows = [[k, v] for k, v in (report.get("orders_by_status") or {}).items()]
    month_rows = [
        [r.get("month", ""), r.get("orders", 0), r.get("completed", 0)]
        for r in report.get("by_month") or []
    ]
    sections = [
        ("Orders by status", ["Status", "Count"], status_rows),
        ("Monthly trend", ["Month", "Orders", "Completed"], month_rows),
    ]
    return _module_pdf(
        report,
        title="Nursing Analytics",
        department=department,
        generated_by=generated_by,
        summary_pairs=summary_pairs,
        table_sections=sections,
    )


def build_pharmacy_analytics_pdf(report: dict, *, generated_by: str = "", department: str = "PHARMACY") -> bytes:
    dispensing = report.get("dispensing") or {}
    prescribing = report.get("prescribing") or {}
    summary_pairs = [
        ("Dispense events", dispensing.get("dispense_events", 0)),
        ("Total quantity dispensed", dispensing.get("total_quantity_all_units", 0)),
        ("Prescriptions with activity", dispensing.get("prescriptions_with_activity", 0)),
        ("Unique patients dispensed", dispensing.get("unique_patients", 0)),
        ("New prescriptions written", prescribing.get("new_prescriptions", 0)),
    ]
    top_qty = [
        [r.get("name", ""), r.get("total_quantity", 0), r.get("dispense_events", 0)]
        for r in (report.get("top_medications_by_quantity") or [])[:15]
    ]
    month_rows = [
        [r.get("month", ""), r.get("dispense_events", 0), r.get("prescriptions", 0)]
        for r in report.get("by_month") or []
    ]
    sections = [
        ("Top medications (quantity)", ["Medication", "Quantity", "Events"], top_qty),
        ("Monthly dispensing", ["Month", "Events", "Prescriptions"], month_rows),
    ]
    return _module_pdf(
        report,
        title="Pharmacy Analytics",
        department=department,
        generated_by=generated_by,
        summary_pairs=summary_pairs,
        table_sections=sections,
    )


def build_laboratory_analytics_pdf(
    report: dict, *, generated_by: str = "", department: str = "LABORATORY"
) -> bytes:
    summary = report.get("summary") or {}
    summary_pairs = [
        ("Lab orders", summary.get("orders_count", 0)),
        ("Tests total", summary.get("tests_total", 0)),
        ("Tests verified", summary.get("tests_verified", 0)),
        ("Results ready", summary.get("tests_results_ready", 0)),
        ("Unique patients", summary.get("unique_patients", 0)),
    ]
    top_tests = [
        [r.get("code", ""), r.get("name", ""), r.get("count", 0)]
        for r in (report.get("top_tests") or [])[:15]
    ]
    month_rows = [
        [r.get("month", ""), r.get("orders", 0), r.get("tests", 0)]
        for r in report.get("by_month") or []
    ]
    sections = [
        ("Top tests", ["Code", "Test", "Count"], top_tests),
        ("Monthly volume", ["Month", "Orders", "Tests"], month_rows),
    ]
    return _module_pdf(
        report,
        title="Laboratory Analytics",
        department=department,
        generated_by=generated_by,
        summary_pairs=summary_pairs,
        table_sections=sections,
    )


def build_radiology_analytics_pdf(
    report: dict, *, generated_by: str = "", department: str = "RADIOLOGY"
) -> bytes:
    summary = report.get("summary") or {}
    processing = report.get("studies_processing_summary") or {}
    summary_pairs = [
        ("Radiology orders", summary.get("orders_count", 0)),
        ("Studies total", summary.get("studies_total", 0)),
        ("Studies verified", summary.get("studies_verified", 0)),
        ("Studies reported", summary.get("studies_reported", 0)),
        ("Critical studies", summary.get("studies_marked_critical", 0)),
        ("Unique patients", summary.get("unique_patients", 0)),
        ("In-house studies", processing.get("in_house", 0)),
        ("Outsourced studies", processing.get("outsourced", 0)),
    ]
    status_rows = [[k, v] for k, v in (report.get("studies_by_status") or {}).items()]
    modality_rows = [
        [modality, count]
        for modality, count in sorted(
            (report.get("studies_by_modality") or {}).items(),
            key=lambda item: (-item[1], item[0]),
        )[:15]
    ]
    procedure_rows = [
        [r.get("procedure", ""), r.get("count", 0)]
        for r in (report.get("top_procedures") or [])[:15]
    ]
    month_rows = [
        [r.get("month", ""), r.get("orders", 0), r.get("studies", 0)]
        for r in report.get("by_month") or []
    ]
    sections = [
        ("Studies by status", ["Status", "Count"], status_rows),
        ("Studies by modality", ["Modality", "Count"], modality_rows),
        ("Top procedures", ["Procedure", "Count"], procedure_rows),
        ("Monthly volume", ["Month", "Orders", "Studies"], month_rows),
    ]
    return _module_pdf(
        report,
        title="Radiology Analytics",
        department=department,
        generated_by=generated_by,
        summary_pairs=summary_pairs,
        table_sections=sections,
    )
