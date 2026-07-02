"""Previous-period bounds for MR comparative reports."""
from __future__ import annotations

from datetime import date, timedelta


def previous_period_bounds(start: date, end: date) -> tuple[date, date]:
    """Return the immediately preceding period of the same inclusive length."""
    length_days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length_days - 1)
    return prev_start, prev_end


def pct_change(current: int, previous: int) -> float | None:
    if previous == 0:
        return None if current == 0 else 100.0
    return round((current - previous) / previous * 100, 1)
