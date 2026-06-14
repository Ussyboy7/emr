"""Display formatting for dates in PDFs and exports (DD/MM/YYYY)."""
from __future__ import annotations

from datetime import date, datetime

from django.utils import timezone


def format_display_date(value: date | datetime | str | None) -> str:
    """Format as DD/MM/YYYY for reports and PDFs."""
    if value is None or value == "":
        return ""
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value[:10])
        except ValueError:
            return value
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%d/%m/%Y")


def format_display_range(start, end, *, separator: str = " to ") -> str:
    """Format an inclusive date range for human-readable output."""
    a = format_display_date(start)
    b = format_display_date(end)
    if a and b:
        return f"{a}{separator}{b}"
    return a or b


def format_display_datetime(value: datetime | None = None) -> str:
    """Format as DD/MM/YYYY HH:MM for report footers (server local time)."""
    dt = timezone.localtime(value) if value is not None else timezone.localtime()
    return dt.strftime("%d/%m/%Y %H:%M")


def format_display_month_year(value: date | datetime | str | None) -> str:
    """Format as Month YYYY (e.g. June 2026) for report titles."""
    if value is None or value == "":
        return ""
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value[:10])
        except ValueError:
            return value
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%B %Y")
