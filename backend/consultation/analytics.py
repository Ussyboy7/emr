"""
Consultation analytics: comprehensive metrics for consultation sessions, throughput, wait times, and clinical outcomes.

Includes:
- Session Efficiency: consultation durations, throughput, bottlenecks
- Queue Analytics: wait times, priority impact, room utilization
- Clinical Outcomes: diagnoses, referrals, prescriptions
- Doctor Productivity: sessions per doctor, average duration
- Patient Demographics: category and gender breakdowns
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from django.db.models import Case, CharField, Count, IntegerField, Q, QuerySet, Value, When
from django.db.models.functions import ExtractYear, TruncDate, TruncMonth, TruncWeek
from django.utils import timezone

def _ensure_aware(dt):
    """Normalize datetimes for safe subtraction (avoid naive/aware mix errors)."""
    if dt is None:
        return None
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _compose_patient_name(row: dict[str, Any]) -> str:
    parts = [
        (row.get('patient__surname') or '').strip(),
        (row.get('patient__first_name') or '').strip(),
        (row.get('patient__middle_name') or '').strip(),
    ]
    return ' '.join(part for part in parts if part).strip() or 'Unknown'


def _build_attendance_rows(
    category_gender_counts: dict[str, dict[str, int]],
    total_sessions: int,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    category_labels = {
        'employee': 'Officers',
        'retiree': 'Retirees',
        'dependent': 'Employee Dependents',
        'nonnpa': 'Non-NPA',
        'other': 'Other',
    }
    ordered_keys = ['employee', 'retiree', 'dependent', 'nonnpa', 'other']

    attendance_rows: list[dict[str, Any]] = []
    totals = {'male': 0, 'female': 0, 'total': 0}
    for key in ordered_keys:
        counts = category_gender_counts.get(key, {})
        male = int(counts.get('male', 0) or 0)
        female = int(counts.get('female', 0) or 0)
        total = int(counts.get('total', male + female) or 0)
        totals['male'] += male
        totals['female'] += female
        totals['total'] += total
        attendance_rows.append({
            'sn': len(attendance_rows) + 1,
            'key': key,
            'label': category_labels[key],
            'male': male,
            'female': female,
            'total': total,
            'percentage': (total / total_sessions * 100) if total_sessions > 0 else 0,
        })

    return attendance_rows, totals


def build_comprehensive_consultation_analytics(
    sessions: QuerySet, start_date: datetime, end_date: datetime
) -> dict[str, Any]:
    """
    Build comprehensive consultation analytics from session data.

    Args:
        sessions: Queryset of consultation sessions with related data
        start_date: Start of analysis period
        end_date: End of analysis period

    Returns:
        Dict containing all analytics metrics
    """
    # Convert to list for multiple iterations
    session_list = list(sessions.values(
        'id', 'session_id', 'status', 'started_at', 'ended_at', 'active_seconds',
        'room__name',
        'patient__id', 'patient__first_name', 'patient__surname', 'patient__middle_name',
        'patient__gender', 'patient__category', 'patient__employee_type', 'patient__dependent_type',
        'doctor__id', 'doctor__first_name', 'doctor__last_name'
    ))

    # Basic session metrics
    total_sessions = len(session_list)
    completed_sessions = [s for s in session_list if s['status'] == 'completed']
    active_sessions = [s for s in session_list if s['status'] == 'active']

    # Calculate durations for completed sessions
    session_durations = []
    for session in completed_sessions:
        if session.get('ended_at') and session.get('started_at'):
            started = _ensure_aware(session['started_at'])
            ended = _ensure_aware(session['ended_at'])
            if started and ended:
                duration_minutes = (ended - started).total_seconds() / 60
                session_durations.append(duration_minutes)

    avg_session_duration = sum(session_durations) / len(session_durations) if session_durations else 0
    median_duration = sorted(session_durations)[len(session_durations)//2] if session_durations else 0
    max_duration = max(session_durations) if session_durations else 0
    min_duration = min(session_durations) if session_durations else 0

    # Throughput by hour
    throughput = defaultdict(int)
    for session in session_list:
        if session.get('started_at'):
            started = _ensure_aware(session['started_at'])
            if start_date <= started <= end_date:
                hour = started.hour
                throughput[hour] += 1

    # Room utilization
    room_stats = defaultdict(lambda: {'sessions': 0, 'completed': 0, 'avg_duration': 0})
    for session in session_list:
        room_name = session.get('room__name') or 'Unknown'
        room_stats[room_name]['sessions'] += 1
        if session['status'] == 'completed':
            room_stats[room_name]['completed'] += 1

    # Calculate average durations per room
    for room_name, stats in room_stats.items():
        room_sessions = [s for s in completed_sessions if s.get('room__name') == room_name]
        if room_sessions:
            durations = []
            for session in room_sessions:
                if session.get('ended_at') and session.get('started_at'):
                    started = _ensure_aware(session['started_at'])
                    ended = _ensure_aware(session['ended_at'])
                    if started and ended:
                        duration_minutes = (ended - started).total_seconds() / 60
                        durations.append(duration_minutes)
            stats['avg_duration'] = sum(durations) / len(durations) if durations else 0

    # Doctor productivity
    doctor_stats = defaultdict(lambda: {'sessions': 0, 'completed': 0, 'total_duration': 0})
    for session in session_list:
        doctor_id = session.get('doctor__id')
        if doctor_id:
            doctor_name = f"{session.get('doctor__first_name', '')} {session.get('doctor__last_name', '')}".strip()
            doctor_stats[doctor_name]['sessions'] += 1
            if session['status'] == 'completed':
                doctor_stats[doctor_name]['completed'] += 1
                if session.get('ended_at') and session.get('started_at'):
                    started = _ensure_aware(session['started_at'])
                    ended = _ensure_aware(session['ended_at'])
                    if started and ended:
                        duration_minutes = (ended - started).total_seconds() / 60
                        doctor_stats[doctor_name]['total_duration'] += duration_minutes

    # Calculate averages for doctors
    for doctor, stats in doctor_stats.items():
        if stats['completed'] > 0:
            stats['avg_duration'] = stats['total_duration'] / stats['completed']
        else:
            stats['avg_duration'] = 0

    category_gender_counts: dict[str, dict[str, int]] = defaultdict(lambda: {'male': 0, 'female': 0, 'total': 0})
    for session in session_list:
        category = (session.get('patient__category') or 'other').strip().lower()
        if category not in {'employee', 'retiree', 'dependent', 'nonnpa'}:
            category = 'other'

        gender = (session.get('patient__gender') or '').strip().lower()
        if gender == 'male':
            category_gender_counts[category]['male'] += 1
        elif gender == 'female':
            category_gender_counts[category]['female'] += 1
        category_gender_counts[category]['total'] += 1

    attendance_by_category, attendance_totals = _build_attendance_rows(category_gender_counts, total_sessions)

    # Queue analytics (if we have queue data)
    # For now, we'll use session start times as proxy for queue completion

    # Clinical outcomes - we'll need to join with diagnoses, referrals, prescriptions
    # This would require additional queries in the view

    scoped_sessions = sessions.exclude(status='cancelled')

    daily = (
        scoped_sessions
        .annotate(day=TruncDate("started_at"))
        .values("day")
        .annotate(sessions=Count("id"), completed=Count("id", filter=Q(status="completed")))
        .order_by("day")
    )
    by_day = [
        {
            "date": row["day"].isoformat() if row["day"] else None,
            "sessions": row["sessions"],
            "completed": row["completed"],
        }
        for row in daily
        if row["day"]
    ]

    weekly = (
        scoped_sessions
        .annotate(w=TruncWeek("started_at"))
        .values("w")
        .annotate(sessions=Count("id"), completed=Count("id", filter=Q(status="completed")))
        .order_by("w")
    )
    by_week = [
        {
            "week": row["w"].strftime("%Y-%m-%d") if row["w"] else None,
            "sessions": row["sessions"],
            "completed": row["completed"],
        }
        for row in weekly
        if row["w"]
    ]

    monthly = (
        scoped_sessions
        .annotate(m=TruncMonth("started_at"))
        .values("m")
        .annotate(sessions=Count("id"), completed=Count("id", filter=Q(status="completed")))
        .order_by("m")
    )
    by_month = [
        {
            "month": row["m"].strftime("%Y-%m") if row["m"] else None,
            "sessions": row["sessions"],
            "completed": row["completed"],
        }
        for row in monthly
        if row["m"]
    ]

    bimonthly = (
        scoped_sessions
        .annotate(
            year=ExtractYear("started_at"),
            bimonth=Case(
                When(started_at__month__in=[1, 2], then=Value(1)),
                When(started_at__month__in=[3, 4], then=Value(2)),
                When(started_at__month__in=[5, 6], then=Value(3)),
                When(started_at__month__in=[7, 8], then=Value(4)),
                When(started_at__month__in=[9, 10], then=Value(5)),
                When(started_at__month__in=[11, 12], then=Value(6)),
                output_field=IntegerField()
            )
        )
        .values("year", "bimonth")
        .annotate(sessions=Count("id"), completed=Count("id", filter=Q(status="completed")))
        .order_by("year", "bimonth")
    )
    by_bimonth = [
        {
            "bimonth": f"{row['year']}-B{row['bimonth']}",
            "sessions": row["sessions"],
            "completed": row["completed"],
        }
        for row in bimonthly
    ]

    quarterly = (
        scoped_sessions
        .annotate(
            year=ExtractYear("started_at"),
            quarter=Case(
                When(started_at__month__in=[1, 2, 3], then=Value(1)),
                When(started_at__month__in=[4, 5, 6], then=Value(2)),
                When(started_at__month__in=[7, 8, 9], then=Value(3)),
                default=Value(4),
                output_field=IntegerField(),
            ),
        )
        .values("year", "quarter")
        .annotate(sessions=Count("id"), completed=Count("id", filter=Q(status="completed")))
        .order_by("year", "quarter")
    )
    by_quarter = [
        {
            "quarter": f"{row['year']}-Q{row['quarter']}",
            "sessions": row["sessions"],
            "completed": row["completed"],
        }
        for row in quarterly
    ]

    halfyearly = (
        scoped_sessions
        .annotate(
            year=ExtractYear("started_at"),
            half=Case(
                When(started_at__month__lte=6, then=Value('H1')),
                default=Value('H2'),
                output_field=CharField()
            )
        )
        .values("year", "half")
        .annotate(sessions=Count("id"), completed=Count("id", filter=Q(status="completed")))
        .order_by("year", "half")
    )
    by_halfyear = [
        {
            "halfyear": f"{row['year']}-{row['half']}",
            "sessions": row["sessions"],
            "completed": row["completed"],
        }
        for row in halfyearly
    ]

    return {
        'session_metrics': {
            'total_sessions': total_sessions,
            'completed_sessions': len(completed_sessions),
            'active_sessions': len(active_sessions),
            'completion_rate': (len(completed_sessions) / total_sessions * 100) if total_sessions > 0 else 0,
            'avg_duration': avg_session_duration,
            'median_duration': median_duration,
            'max_duration': max_duration,
            'min_duration': min_duration,
        },
        'throughput': dict(throughput),
        'room_utilization': dict(room_stats),
        'doctor_productivity': dict(doctor_stats),
        'patient_demographics': {
            'attendance_by_category': attendance_by_category,
            'attendance_totals': attendance_totals,
        },
        'by_day': by_day,
        'by_week': by_week,
        'by_month': by_month,
        'by_bimonth': by_bimonth,
        'by_quarter': by_quarter,
        'by_halfyear': by_halfyear,
        'period': {
            'start_date': start_date.date().isoformat(),
            'end_date': end_date.date().isoformat(),
        }
    }
