"""
Eyecare analytics: session metrics, demographics, and period breakdowns.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from django.db.models import Count, Q
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek

from eyecare.models import EyeSession
from patients.nursing_analytics import _build_attendance_by_category


def _session_duration_minutes(session: dict[str, Any]) -> float | None:
    if session.get('duration_minutes'):
        return float(session['duration_minutes'])
    started = session.get('started_at')
    completed = session.get('completed_at')
    if started and completed:
        return (completed - started).total_seconds() / 60
    return None


def build_eyecare_analytics(start_date: datetime, end_date: datetime) -> dict[str, Any]:
    sessions_qs = (
        EyeSession.objects.filter(
            scheduled_at__gte=start_date,
            scheduled_at__lte=end_date,
        )
        .exclude(status='cancelled')
        .select_related('order__patient')
    )

    session_rows = list(
        sessions_qs.values(
            'id',
            'status',
            'started_at',
            'completed_at',
            'duration_minutes',
            'order__patient__category',
            'order__patient__gender',
            'order__patient__employee_type',
            'order__patient__dependent_type',
        )
    )

    total_sessions = len(session_rows)
    completed_rows = [s for s in session_rows if s['status'] == 'completed']
    completed_count = len(completed_rows)

    durations = [
        d for d in (_session_duration_minutes(s) for s in completed_rows) if d is not None and d > 0
    ]
    avg_duration = sum(durations) / len(durations) if durations else 0.0
    completion_rate = (completed_count / total_sessions * 100) if total_sessions else 0.0

    visit_like = [
        {
            'id': row['id'],
            'patient__category': row['order__patient__category'],
            'patient__gender': row['order__patient__gender'],
            'patient__employee_type': row['order__patient__employee_type'],
            'patient__dependent_type': row['order__patient__dependent_type'],
        }
        for row in session_rows
    ]
    attendance_by_category, attendance_totals = _build_attendance_by_category(visit_like)

    scoped = sessions_qs

    daily = (
        scoped.annotate(day=TruncDate('scheduled_at'))
        .values('day')
        .annotate(sessions=Count('id'), completed=Count('id', filter=Q(status='completed')))
        .order_by('day')
    )
    by_day = [
        {
            'date': row['day'].isoformat() if row['day'] else None,
            'sessions': row['sessions'],
            'completed': row['completed'],
        }
        for row in daily
        if row['day']
    ]

    weekly = (
        scoped.annotate(w=TruncWeek('scheduled_at'))
        .values('w')
        .annotate(sessions=Count('id'), completed=Count('id', filter=Q(status='completed')))
        .order_by('w')
    )
    by_week = [
        {
            'week': row['w'].strftime('%Y-%m-%d') if row['w'] else None,
            'sessions': row['sessions'],
            'completed': row['completed'],
        }
        for row in weekly
        if row['w']
    ]

    monthly = (
        scoped.annotate(m=TruncMonth('scheduled_at'))
        .values('m')
        .annotate(sessions=Count('id'), completed=Count('id', filter=Q(status='completed')))
        .order_by('m')
    )
    by_month = [
        {
            'month': row['m'].strftime('%Y-%m') if row['m'] else None,
            'sessions': row['sessions'],
            'completed': row['completed'],
        }
        for row in monthly
        if row['m']
    ]

    return {
        'session_metrics': {
            'total_sessions': total_sessions,
            'completed_sessions': completed_count,
            'avg_duration': round(avg_duration, 1),
            'completion_rate': round(completion_rate, 1),
        },
        'patient_demographics': {
            'attendance_by_category': attendance_by_category,
            'attendance_totals': attendance_totals,
        },
        'by_day': by_day,
        'by_week': by_week,
        'by_month': by_month,
        'by_bimonth': [],
        'by_quarter': [],
        'by_halfyear': [],
        'period': {
            'start_date': start_date.date().isoformat(),
            'end_date': end_date.date().isoformat(),
        },
    }
