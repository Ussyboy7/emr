"""Shared report / analytics period parsing (inclusive dates, optional all-time)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date


@dataclass(frozen=True)
class ReportPeriod:
    all_time: bool
    start: date | None
    end: date | None


def parse_report_period(request) -> ReportPeriod:
    qp = getattr(request, "query_params", None) or request.GET
    if (qp.get("period") or "").strip().lower() == "all":
        return ReportPeriod(all_time=True, start=None, end=None)
    start = parse_date((qp.get("start_date") or qp.get("start") or "").strip() or None)
    end = parse_date((qp.get("end_date") or qp.get("end") or "").strip() or None)
    return ReportPeriod(all_time=False, start=start, end=end)


def all_time_bounds() -> tuple[date, date]:
    """Wide inclusive bounds for all-time queries and export labels."""
    return date(1970, 1, 1), timezone.localdate()


def resolve_report_bounds(
    period: ReportPeriod,
    *,
    year=None,
    default_to_current_year: bool = False,
) -> tuple[date, date]:
    """Resolve inclusive calendar bounds for MR reports."""
    if period.all_time:
        return all_time_bounds()
    if period.start and period.end:
        return period.start, period.end
    if year:
        try:
            year_int = int(year)
            return date(year_int, 1, 1), date(year_int, 12, 31)
        except (ValueError, TypeError):
            pass
    if default_to_current_year:
        y = timezone.now().year
        return date(y, 1, 1), date(y, 12, 31)
    return all_time_bounds()


def bounds_from_request(request, *, default_to_current_year: bool = False) -> tuple[date, date]:
    """Parse request and return (start_date, end_date) for queryset filters."""
    period = parse_report_period(request)
    year = (getattr(request, "query_params", None) or request.GET).get("year")
    return resolve_report_bounds(period, year=year, default_to_current_year=default_to_current_year)


def local_week_bounds() -> tuple[date, date]:
    """Monday through Sunday of the current server week."""
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    return week_start, week_start + timedelta(days=6)


def local_month_bounds_to_today() -> tuple[date, date]:
    """First day of current server month through today."""
    today = timezone.localdate()
    return today.replace(day=1), today


def apply_date_preset(qs, preset: str, field: str):
    """
    Apply today / week / month presets on a queryset.
    ``field`` is a DateField name or DateTimeField. Datetime fields use
    half-open timezone-aware ranges so ordinary timestamp indexes remain usable.
    """
    df = (preset or "").strip().lower()
    if not df or df == "all":
        return qs

    is_date_only = field == "date"
    today = timezone.localdate()

    if df == "today":
        if is_date_only:
            return qs.filter(**{field: today})
        return _filter_datetime_range(qs, field, today, today)

    if df == "week":
        start, end = local_week_bounds()
        if is_date_only:
            return qs.filter(**{f"{field}__gte": start, f"{field}__lte": end})
        return _filter_datetime_range(qs, field, start, end)

    if df == "month":
        start, end = local_month_bounds_to_today()
        if is_date_only:
            return qs.filter(**{f"{field}__gte": start, f"{field}__lte": end})
        return _filter_datetime_range(qs, field, start, end)

    return qs


def _filter_datetime_range(qs, field: str, start: date, end: date):
    tz = timezone.get_current_timezone()
    start_at = timezone.make_aware(datetime.combine(start, time.min), tz)
    end_at = timezone.make_aware(
        datetime.combine(end + timedelta(days=1), time.min),
        tz,
    )
    return qs.filter(**{f"{field}__gte": start_at, f"{field}__lt": end_at})


def filter_inclusive_date_range(qs, field: str, start: date | None, end: date | None):
    """Filter a datetime field to an inclusive calendar-date range.

    Equivalent to ``field__date__gte=start, field__date__lte=end`` but uses
    half-open timezone-aware bounds so ordinary timestamp indexes stay usable.
    ``start``/``end`` may be ``None`` for an open-ended side.
    """
    tz = timezone.get_current_timezone()
    if start is not None:
        start_at = timezone.make_aware(datetime.combine(start, time.min), tz)
        qs = qs.filter(**{f"{field}__gte": start_at})
    if end is not None:
        end_at = timezone.make_aware(
            datetime.combine(end + timedelta(days=1), time.min), tz
        )
        qs = qs.filter(**{f"{field}__lt": end_at})
    return qs
