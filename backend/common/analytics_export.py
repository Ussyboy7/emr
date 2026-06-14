"""Server-side CSV/PDF export for module analytics endpoints."""
from __future__ import annotations

from typing import Any

from common.analytics_pdf import (
    build_laboratory_analytics_pdf,
    build_nursing_analytics_pdf,
    build_pharmacy_analytics_pdf,
    build_radiology_analytics_pdf,
)
from reports.export_helpers import get_export_type, respond_with_export

MODULE_DEPARTMENTS: dict[str, str] = {
    "nursing": "NURSING UNIT",
    "pharmacy": "PHARMACY",
    "laboratory": "LABORATORY",
    "radiology": "RADIOLOGY",
    "consultation": "CONSULTATION",
    "physiotherapy": "PHYSIOTHERAPY",
    "eyecare": "EYECARE",
    "clinical": "MEDICAL SERVICES DIVISION",
}

MODULE_PDF_BUILDERS = {
    "nursing": build_nursing_analytics_pdf,
    "pharmacy": build_pharmacy_analytics_pdf,
    "laboratory": build_laboratory_analytics_pdf,
    "radiology": build_radiology_analytics_pdf,
}

MODULE_TITLES: dict[str, str] = {
    "nursing": "Nursing Analytics",
    "pharmacy": "Pharmacy Analytics",
    "laboratory": "Laboratory Analytics",
    "radiology": "Radiology Analytics",
    "consultation": "Consultation Analytics",
    "physiotherapy": "Physiotherapy Analytics",
    "eyecare": "Eyecare Analytics",
    "clinical": "Clinical Dashboard Analytics",
}


def maybe_export_analytics(request, report: Any, *, module_key: str):
    """
    Return an HttpResponse for export=csv|pdf, or None for normal JSON handling.
    """
    export_type = get_export_type(request)
    if export_type not in ("csv", "pdf"):
        return None
    title = MODULE_TITLES.get(module_key, "Analytics")
    department = MODULE_DEPARTMENTS.get(module_key, "MEDICAL SERVICES DIVISION")
    pdf_builder = MODULE_PDF_BUILDERS.get(module_key)
    return respond_with_export(
        request,
        report,
        filename_prefix=f"{module_key}_analytics",
        title=title,
        department=department,
        pdf_builder=pdf_builder,
    )
