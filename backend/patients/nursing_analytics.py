"""
Nursing analytics: comprehensive metrics for patient flow, vitals quality, wait times, staff productivity, and demographics.

Includes:
- Patient Flow Efficiency: processing times, throughput, bottlenecks
- Vitals Quality: completion rates, accuracy, error analysis
- Wait Time Analytics: distribution, peak times, priority impact
- Staff Productivity: patients per hour, workload balance
- Demographics: category and gender breakdowns
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from django.db.models import Avg, Count, F, Q, QuerySet
from django.utils import timezone

from common.clinic_utils import active_opd_service_matches_code, normalize_clinic_name
from common.module_analytics import patient_category_breakdown, patient_gender_breakdown


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


def _attendance_bucket_key(row: dict[str, Any]) -> str:
    category = (row.get('patient__category') or '').strip().lower()
    employee_type = (row.get('patient__employee_type') or '').strip().lower()
    dependent_type = (row.get('patient__dependent_type') or '').strip().lower()

    if category == 'employee':
        return 'officers' if employee_type == 'officer' else 'staff'
    if category == 'dependent':
        return 'retiree_dependents' if 'retiree' in dependent_type else 'employee_dependents'
    if category == 'nonnpa':
        return 'non_npa'
    if category == 'retiree':
        return 'retirees'
    return 'other'


def _build_attendance_by_category(
    visits: list[dict[str, Any]],
    *,
    include_visit_ids: set[int] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    bucket_defs = [
        ('officers', 'Officers'),
        ('staff', 'Staff'),
        ('employee_dependents', 'Employee Dependents'),
        ('retiree_dependents', 'Retiree Dependents'),
        ('non_npa', 'Non-NPA'),
        ('retirees', 'Retirees'),
    ]
    stats: dict[str, dict[str, int]] = {
        key: {'male': 0, 'female': 0, 'total': 0} for key, _ in bucket_defs
    }
    totals = {'male': 0, 'female': 0, 'total': 0}

    for visit in visits:
        if include_visit_ids is not None and visit.get('id') not in include_visit_ids:
            continue
        key = _attendance_bucket_key(visit)
        if key not in stats:
            continue
        gender = (visit.get('patient__gender') or '').strip().lower()
        if gender == 'male':
            stats[key]['male'] += 1
            totals['male'] += 1
        elif gender == 'female':
            stats[key]['female'] += 1
            totals['female'] += 1
        stats[key]['total'] += 1
        totals['total'] += 1

    rows: list[dict[str, Any]] = []
    for idx, (key, label) in enumerate(bucket_defs, start=1):
        total = stats[key]['total']
        rows.append(
            {
                'sn': idx,
                'key': key,
                'label': label,
                'male': stats[key]['male'],
                'female': stats[key]['female'],
                'total': total,
                'percentage': (total / totals['total'] * 100) if totals['total'] > 0 else 0,
            }
        )
    return rows, totals


def _normalized_clinics_from_row(clinics, clinic) -> list[str]:
    raw = list(clinics or [])
    if clinic and clinic not in raw:
        raw.append(clinic)
    return [normalize_clinic_name(str(c)) for c in raw if c]


def _visit_has_physio_line(clinics, clinic) -> bool:
    return any(c == 'Physiotherapy' for c in _normalized_clinics_from_row(clinics, clinic))


def _visit_has_eye_line(clinics, clinic) -> bool:
    for c in _normalized_clinics_from_row(clinics, clinic):
        if active_opd_service_matches_code(c, 'eye-clinic'):
            return True
        if 'eye' in (c or '').lower():
            return True
    return False


def _is_multi_clinic_row(clinics, clinic) -> bool:
    names = [x for x in _normalized_clinics_from_row(clinics, clinic) if x]
    return len(set(names)) > 1


def build_nursing_pool_analytics_response(view, request, base: QuerySet) -> dict[str, Any]:
    from patients.views import apply_nursing_status_filter

    visit_rows = list(base.values('id', 'date', 'clinics', 'clinic'))
    all_ids = [r['id'] for r in visit_rows]
    if not all_ids:
        return {'summary': _empty_summary(), 'by_day': []}

    pending_ids = set(apply_nursing_status_filter(base, 'pending', request).values_list('id', flat=True))
    vitals_inc_ids = set(
        apply_nursing_status_filter(base, 'vitals_incomplete', request).values_list('id', flat=True)
    )
    ready_ids = set(apply_nursing_status_filter(base, 'ready', request).values_list('id', flat=True))
    sent_queue_ids = set(
        apply_nursing_status_filter(
            base, 'sent_to_room', request, sent_to_room_basis='queued_at'
        ).values_list('id', flat=True)
    )
    sent_aligned_ids = set(
        apply_nursing_status_filter(
            base, 'sent_to_room', request, sent_to_room_basis='visit_date'
        ).values_list('id', flat=True)
    )

    multi_ids: set[int] = set()
    eye_route_ids: set[int] = set()
    physio_route_ids: set[int] = set()
    for r in visit_rows:
        vid = r['id']
        if _is_multi_clinic_row(r.get('clinics'), r.get('clinic')):
            multi_ids.add(vid)
        if _visit_has_eye_line(r.get('clinics'), r.get('clinic')):
            eye_route_ids.add(vid)
        if _visit_has_physio_line(r.get('clinics'), r.get('clinic')):
            physio_route_ids.add(vid)

    from physiotherapy.models import PhysioOrder

    physio_visit_ids = set(
        PhysioOrder.objects.filter(
            visit_id__in=all_ids,
            status__in=['pending', 'scheduled', 'in_progress', 'completed'],
        ).values_list('visit_id', flat=True)
    )

    from eyecare.models import EyeOrder

    eye_visit_ids = set(
        EyeOrder.objects.filter(
            visit_id__in=all_ids,
            status__in=['pending', 'scheduled', 'in_progress'],
        ).values_list('visit_id', flat=True)
    )

    checked_in_physio_ids = physio_visit_ids & physio_route_ids
    checked_in_eye_ids = eye_visit_ids & eye_route_ids

    by_day_map: dict[Any, dict[str, int]] = defaultdict(
        lambda: {
            'total': 0,
            'pending_vitals': 0,
            'vitals_incomplete': 0,
            'ready_for_consultation': 0,
            'sent_to_room_aligned': 0,
            'sent_to_room_by_queue_date': 0,
            'multi_clinic': 0,
            'checked_in_physio': 0,
            'checked_in_eye': 0,
        }
    )

    for r in visit_rows:
        vid = r['id']
        dkey = r['date']
        bd = by_day_map[dkey]
        bd['total'] += 1
        if vid in pending_ids:
            bd['pending_vitals'] += 1
        if vid in vitals_inc_ids:
            bd['vitals_incomplete'] += 1
        if vid in ready_ids:
            bd['ready_for_consultation'] += 1
        if vid in sent_aligned_ids:
            bd['sent_to_room_aligned'] += 1
        if vid in sent_queue_ids:
            bd['sent_to_room_by_queue_date'] += 1
        if vid in multi_ids:
            bd['multi_clinic'] += 1
        if vid in checked_in_physio_ids:
            bd['checked_in_physio'] += 1
        if vid in checked_in_eye_ids:
            bd['checked_in_eye'] += 1

    by_day = []
    for dkey in sorted(by_day_map.keys()):
        row = by_day_map[dkey]
        by_day.append(
            {
                'date': dkey.isoformat() if hasattr(dkey, 'isoformat') else str(dkey),
                **row,
            }
        )

    summary = {
        'total': len(all_ids),
        'pending_vitals': len(pending_ids),
        'vitals_incomplete': len(vitals_inc_ids),
        'ready_for_consultation': len(ready_ids),
        # Legacy: same as pool dashboard card (queue date filter)
        'sent_to_room': len(sent_queue_ids),
        'sent_to_room_by_queue_date': len(sent_queue_ids),
        'sent_to_room_aligned': len(sent_aligned_ids),
        'multi_clinic_visits': len(multi_ids),
        'single_clinic_visits': len(all_ids) - len(multi_ids),
        'visits_with_eye_clinic': len(eye_route_ids),
        'visits_with_physiotherapy': len(physio_route_ids),
        'eye_checked_in': len(checked_in_eye_ids),
        'physio_checked_in': len(checked_in_physio_ids),
    }
    return {'summary': summary, 'by_day': by_day}


def _empty_summary() -> dict[str, int]:
    return {
        'total': 0,
        'pending_vitals': 0,
        'vitals_incomplete': 0,
        'ready_for_consultation': 0,
        'sent_to_room': 0,
        'sent_to_room_by_queue_date': 0,
        'sent_to_room_aligned': 0,
        'multi_clinic_visits': 0,
        'single_clinic_visits': 0,
        'visits_with_eye_clinic': 0,
        'visits_with_physiotherapy': 0,
        'eye_checked_in': 0,
        'physio_checked_in': 0,
    }


# =============================================================================
# PATIENT FLOW EFFICIENCY ANALYTICS
# =============================================================================

def build_patient_flow_analytics(base_qs: QuerySet, start_date: datetime, end_date: datetime) -> dict[str, Any]:
    """
    Analyze patient flow through nursing process: check-in → vitals → room assignment.
    """
    from patients.models import VitalReading
    from consultation.models import ConsultationQueue

    # base_qs is already scoped by visit calendar `date` (and status) from the ViewSet.
    # Do not re-filter on created_at — bookings created earlier but seen in-range were wrongly dropped.
    visits = list(base_qs.values(
        'id', 'created_at', 'patient_id', 'patient__surname', 'patient__first_name', 'patient__middle_name',
        'patient__category', 'patient__gender', 'patient__employee_type', 'patient__dependent_type'
    ))

    if not visits:
        return _empty_flow_analytics()

    visit_ids = [v['id'] for v in visits]

    # Get vitals data
    vitals_data = list(
        VitalReading.objects.filter(visit_id__in=visit_ids).values('visit_id', 'recorded_at')
    )

    # First room-queue time per visit (include inactive rows — completed consults deactivate queue items)
    first_queued_by_visit: dict[int, Any] = {}
    for row in (
        ConsultationQueue.objects.filter(visit_id__in=visit_ids)
        .values('visit_id', 'queued_at')
        .order_by('visit_id', 'queued_at')
    ):
        vid = row['visit_id']
        qt = row.get('queued_at')
        if vid not in first_queued_by_visit and qt is not None:
            first_queued_by_visit[vid] = qt

    # Calculate flow metrics
    flow_metrics = []
    bottlenecks = {'pool': [], 'vitals': [], 'room_assignment': []}

    for visit in visits:
        visit_id = visit['id']
        checkin_time = visit['created_at']

        # Find vitals completion time
        vitals_times = [
            _ensure_aware(v['recorded_at'])
            for v in vitals_data
            if v['visit_id'] == visit_id and v.get('recorded_at')
        ]
        vitals_complete_time = max(vitals_times) if vitals_times else None

        # Find queue entry time (room assignment)
        q_at = first_queued_by_visit.get(visit_id)
        room_assignment_time = _ensure_aware(q_at) if q_at else None

        # Calculate time intervals
        checkin_aw = _ensure_aware(checkin_time)
        anchor_after_vitals = vitals_complete_time or checkin_aw
        vitals_time = (
            (vitals_complete_time - checkin_aw).total_seconds() / 60
            if vitals_complete_time and checkin_aw
            else None
        )
        room_assignment_wait = (
            (room_assignment_time - anchor_after_vitals).total_seconds() / 60
            if room_assignment_time and anchor_after_vitals
            else None
        )
        total_processing_time = (
            (room_assignment_time - checkin_aw).total_seconds() / 60
            if room_assignment_time and checkin_aw
            else None
        )

        flow_metrics.append({
            'visit_id': visit_id,
            'patient_name': _compose_patient_name(visit),
            'checkin_time': checkin_time,
            'vitals_complete_time': vitals_complete_time,
            'room_assignment_time': room_assignment_time,
            'vitals_processing_time': vitals_time,
            'room_wait_time': room_assignment_wait,
            'total_processing_time': total_processing_time,
            'category': visit['patient__category'],
            'gender': visit['patient__gender'],
        })

        # Track bottlenecks
        if total_processing_time:
            if not vitals_complete_time and total_processing_time > 15:
                bottlenecks['pool'].append(total_processing_time)
            elif vitals_time and vitals_time > 10:
                bottlenecks['vitals'].append(vitals_time)
            elif room_assignment_wait and room_assignment_wait > 15:
                bottlenecks['room_assignment'].append(room_assignment_wait)

    # Calculate averages and statistics
    completed_flows = [f for f in flow_metrics if f['total_processing_time']]
    vitals_completed = [f for f in flow_metrics if f['vitals_complete_time']]

    avg_processing_time = sum(f['total_processing_time'] for f in completed_flows) / len(completed_flows) if completed_flows else 0
    avg_vitals_time = sum(f['vitals_processing_time'] for f in vitals_completed) / len(vitals_completed) if vitals_completed else 0
    avg_room_wait = sum(f['room_wait_time'] for f in completed_flows if f['room_wait_time']) / len([f for f in completed_flows if f['room_wait_time']]) if completed_flows else 0

    # Throughput analysis (patients per hour)
    hourly_throughput = defaultdict(int)
    for flow in completed_flows:
        hour = flow['room_assignment_time'].hour if flow['room_assignment_time'] else flow['checkin_time'].hour
        hourly_throughput[hour] += 1

    # Category analysis
    category_metrics = defaultdict(lambda: {'count': 0, 'avg_time': 0, 'total_time': 0})
    gender_metrics = defaultdict(lambda: {'count': 0, 'avg_time': 0, 'total_time': 0})

    for flow in completed_flows:
        cat = flow['category'] or 'unknown'
        gender = flow['gender'] or 'unknown'

        category_metrics[cat]['count'] += 1
        category_metrics[cat]['total_time'] += flow['total_processing_time']
        category_metrics[cat]['avg_time'] = category_metrics[cat]['total_time'] / category_metrics[cat]['count']

        gender_metrics[gender]['count'] += 1
        gender_metrics[gender]['total_time'] += flow['total_processing_time']
        gender_metrics[gender]['avg_time'] = gender_metrics[gender]['total_time'] / gender_metrics[gender]['count']

    visits_with_vitals = {v['visit_id'] for v in vitals_data if v.get('recorded_at')}
    attendance_by_category, attendance_totals = _build_attendance_by_category(
        visits,
        include_visit_ids=visits_with_vitals,
    )

    return {
        'summary': {
            'total_visits': len(visits),
            'completed_flows': len(completed_flows),
            'vitals_completion_rate': len(vitals_completed) / len(visits) * 100 if visits else 0,
            'average_processing_time': avg_processing_time,
            'average_vitals_time': avg_vitals_time,
            'average_room_wait': avg_room_wait,
        },
        'bottlenecks': {
            'pool_delays': {
                'count': len(bottlenecks['pool']),
                'average_delay': sum(bottlenecks['pool']) / len(bottlenecks['pool']) if bottlenecks['pool'] else 0,
            },
            'vitals_delays': {
                'count': len(bottlenecks['vitals']),
                'average_delay': sum(bottlenecks['vitals']) / len(bottlenecks['vitals']) if bottlenecks['vitals'] else 0,
            },
            'room_assignment_delays': {
                'count': len(bottlenecks['room_assignment']),
                'average_delay': sum(bottlenecks['room_assignment']) / len(bottlenecks['room_assignment']) if bottlenecks['room_assignment'] else 0,
            },
        },
        'throughput': dict(hourly_throughput),
        'category_analysis': dict(category_metrics),
        'gender_analysis': dict(gender_metrics),
        'attendance_by_category': attendance_by_category,
        'attendance_totals': attendance_totals,
        'peak_hours': sorted(hourly_throughput.items(), key=lambda x: x[1], reverse=True)[:3],
    }


def _empty_flow_analytics() -> dict[str, Any]:
    return {
        'summary': {
            'total_visits': 0,
            'completed_flows': 0,
            'vitals_completion_rate': 0,
            'average_processing_time': 0,
            'average_vitals_time': 0,
            'average_room_wait': 0,
        },
        'bottlenecks': {
            'pool_delays': {'count': 0, 'average_delay': 0},
            'vitals_delays': {'count': 0, 'average_delay': 0},
            'room_assignment_delays': {'count': 0, 'average_delay': 0},
        },
        'throughput': {},
        'category_analysis': {},
        'gender_analysis': {},
        'attendance_by_category': [],
        'attendance_totals': {'male': 0, 'female': 0, 'total': 0},
        'peak_hours': [],
    }


# =============================================================================
# VITALS QUALITY ANALYTICS
# =============================================================================

def build_vitals_quality_analytics(base_qs: QuerySet, start_date: datetime, end_date: datetime) -> dict[str, Any]:
    """
    Analyze vitals completion rates, accuracy, and quality metrics.
    """
    from patients.models import VitalReading

    visits = list(base_qs.values('id', 'patient__category', 'patient__gender'))

    if not visits:
        return _empty_vitals_quality_analytics()

    visit_ids = [v['id'] for v in visits]

    # Get all vitals for these visits
    vitals = list(VitalReading.objects.filter(
        visit_id__in=visit_ids
    ).values())

    # Analyze completion by vital type
    vital_types = {
        'temperature': 'temperature',
        'blood_pressure_systolic': 'blood_pressure_systolic',
        'blood_pressure_diastolic': 'blood_pressure_diastolic',
        'heart_rate': 'heart_rate',
        'respiratory_rate': 'respiratory_rate',
        'oxygen_saturation': 'oxygen_saturation',
        'weight': 'weight',
        'height': 'height',
        'pain_scale': 'pain_scale',
        'blood_sugar': 'blood_sugar',
        'random_blood_sugar': 'random_blood_sugar',
    }

    completion_stats = {}
    total_visits = len(visits)

    for vital_key, vital_field in vital_types.items():
        # Count unique visits with this vital present (avoid duplicate rows >100%)
        completed_visit_ids = {v['visit_id'] for v in vitals if v.get(vital_field) is not None}
        completed = len(completed_visit_ids)
        completion_stats[vital_key] = {
            'completed': completed,
            'completion_rate': (completed / total_visits * 100) if total_visits > 0 else 0,
        }

    # Calculate overall completion rate
    required_vitals = ['temperature', 'blood_pressure_systolic', 'blood_pressure_diastolic', 'heart_rate']
    fully_complete = sum(
        1
        for visit in visits
        if all(
            any(v.get(vital_field) is not None for v in vitals if v['visit_id'] == visit['id'])
            for vital_field in required_vitals
        )
    )

    overall_completion_rate = (fully_complete / total_visits * 100) if total_visits > 0 else 0

    # Error analysis (basic validation)
    errors = {
        'invalid_bp': 0,  # systolic <= diastolic
        'impossible_temp': 0,  # temp < 30 or > 45
        'invalid_hr': 0,  # hr < 30 or > 250
        'missing_critical': 0,  # no temp, bp, or hr
    }

    for vital in vitals:
        # Blood pressure validation
        systolic = vital.get('blood_pressure_systolic')
        diastolic = vital.get('blood_pressure_diastolic')
        if systolic and diastolic and systolic <= diastolic:
            errors['invalid_bp'] += 1

        # Temperature validation
        temp = vital.get('temperature')
        if temp and (temp < 30 or temp > 45):
            errors['impossible_temp'] += 1

        # Heart rate validation
        hr = vital.get('heart_rate')
        if hr and (hr < 30 or hr > 250):
            errors['invalid_hr'] += 1

    # Missing critical vitals
    for visit in visits:
        visit_vitals = [v for v in vitals if v['visit_id'] == visit['id']]
        has_temp = any(v.get('temperature') for v in visit_vitals)
        has_bp = any(v.get('blood_pressure_systolic') and v.get('blood_pressure_diastolic') for v in visit_vitals)
        has_hr = any(v.get('heart_rate') for v in visit_vitals)

        if not (has_temp and has_bp and has_hr):
            errors['missing_critical'] += 1

    # Category and gender analysis
    category_completion = defaultdict(lambda: {'total': 0, 'completed': 0})
    gender_completion = defaultdict(lambda: {'total': 0, 'completed': 0})

    for visit in visits:
        visit_vitals = [v for v in vitals if v['visit_id'] == visit['id']]
        has_required = all(
            any(v.get(vital_field) is not None for v in visit_vitals)
            for vital_field in required_vitals
        )

        cat = visit['patient__category'] or 'unknown'
        gender = visit['patient__gender'] or 'unknown'

        category_completion[cat]['total'] += 1
        gender_completion[gender]['total'] += 1

        if has_required:
            category_completion[cat]['completed'] += 1
            gender_completion[gender]['completed'] += 1

    # Calculate completion rates
    for cat in category_completion:
        total = category_completion[cat]['total']
        category_completion[cat]['rate'] = (category_completion[cat]['completed'] / total * 100) if total > 0 else 0

    for gen in gender_completion:
        total = gender_completion[gen]['total']
        gender_completion[gen]['rate'] = (gender_completion[gen]['completed'] / total * 100) if total > 0 else 0

    return {
        'summary': {
            'total_visits': total_visits,
            'fully_completed_visits': fully_complete,
            'total_vitals_recorded': len(vitals),
            'overall_completion_rate': overall_completion_rate,
            'average_vitals_per_visit': len(vitals) / total_visits if total_visits > 0 else 0,
        },
        'completion_by_vital': completion_stats,
        'error_analysis': errors,
        'category_completion': dict(category_completion),
        'gender_completion': dict(gender_completion),
    }


def _empty_vitals_quality_analytics() -> dict[str, Any]:
    return {
        'summary': {
            'total_visits': 0,
            'fully_completed_visits': 0,
            'total_vitals_recorded': 0,
            'overall_completion_rate': 0,
            'average_vitals_per_visit': 0,
        },
        'completion_by_vital': {},
        'error_analysis': {
            'invalid_bp': 0,
            'impossible_temp': 0,
            'invalid_hr': 0,
            'missing_critical': 0,
        },
        'category_completion': {},
        'gender_completion': {},
    }


# =============================================================================
# WAIT TIME ANALYTICS
# =============================================================================

def build_wait_time_analytics(base_qs: QuerySet, start_date: datetime, end_date: datetime) -> dict[str, Any]:
    """
    Analyze patient wait times through the nursing process.
    """
    from consultation.models import ConsultationQueue

    visits = list(base_qs.values('id', 'created_at', 'patient__category', 'patient__gender'))

    if not visits:
        return _empty_wait_time_analytics()

    visit_ids = [v['id'] for v in visits]

    # Get queue data
    queue_entries = list(
        ConsultationQueue.objects.filter(visit_id__in=visit_ids).values('visit_id', 'queued_at')
    )

    wait_times = []
    for visit in visits:
        visit_id = visit['id']
        checkin_time = visit['created_at']

        queue_entry = next((q for q in queue_entries if q['visit_id'] == visit_id), None)
        if queue_entry:
            queued_at = _ensure_aware(queue_entry.get('queued_at'))
            checkin_aw = _ensure_aware(checkin_time)
            if queued_at and checkin_aw:
                wait_time_minutes = (queued_at - checkin_aw).total_seconds() / 60
            else:
                wait_time_minutes = 0

            if wait_time_minutes >= 0:  # Only positive wait times
                wait_times.append({
                    'wait_time': wait_time_minutes,
                    'category': visit['patient__category'],
                    'gender': visit['patient__gender'],
                    'hour': checkin_time.hour,
                })

    # Distribution analysis
    distribution = {
        '0-5min': len([w for w in wait_times if w['wait_time'] <= 5]),
        '5-15min': len([w for w in wait_times if 5 < w['wait_time'] <= 15]),
        '15-30min': len([w for w in wait_times if 15 < w['wait_time'] <= 30]),
        '30-60min': len([w for w in wait_times if 30 < w['wait_time'] <= 60]),
        '60min+': len([w for w in wait_times if w['wait_time'] > 60]),
    }

    # Category analysis
    category_wait_times = defaultdict(list)
    gender_wait_times = defaultdict(list)

    for wait in wait_times:
        if wait['category']:
            category_wait_times[wait['category']].append(wait['wait_time'])
        if wait['gender']:
            gender_wait_times[wait['gender']].append(wait['wait_time'])

    category_stats = {}
    for cat, times in category_wait_times.items():
        category_stats[cat] = {
            'count': len(times),
            'average': sum(times) / len(times) if times else 0,
            'median': sorted(times)[len(times)//2] if times else 0,
            'max': max(times) if times else 0,
        }

    gender_stats = {}
    for gen, times in gender_wait_times.items():
        gender_stats[gen] = {
            'count': len(times),
            'average': sum(times) / len(times) if times else 0,
            'median': sorted(times)[len(times)//2] if times else 0,
            'max': max(times) if times else 0,
        }

    # Peak hour analysis
    hourly_waits = defaultdict(list)
    for wait in wait_times:
        hourly_waits[wait['hour']].append(wait['wait_time'])

    peak_hours = []
    for hour, times in hourly_waits.items():
        if times:
            peak_hours.append({
                'hour': hour,
                'average_wait': sum(times) / len(times),
                'patient_count': len(times),
            })

    peak_hours.sort(key=lambda x: x['average_wait'], reverse=True)

    return {
        'summary': {
            'total_waited': len(wait_times),
            'average_wait_time': sum(w['wait_time'] for w in wait_times) / len(wait_times) if wait_times else 0,
            'median_wait_time': sorted([w['wait_time'] for w in wait_times])[len(wait_times)//2] if wait_times else 0,
            'max_wait_time': max([w['wait_time'] for w in wait_times]) if wait_times else 0,
        },
        'distribution': distribution,
        'category_analysis': category_stats,
        'gender_analysis': gender_stats,
        'peak_hours': peak_hours[:5],  # Top 5 worst hours
    }


def _empty_wait_time_analytics() -> dict[str, Any]:
    return {
        'summary': {
            'total_waited': 0,
            'average_wait_time': 0,
            'median_wait_time': 0,
            'max_wait_time': 0,
        },
        'distribution': {
            '0-5min': 0,
            '5-15min': 0,
            '15-30min': 0,
            '30-60min': 0,
            '60min+': 0,
        },
        'category_analysis': {},
        'gender_analysis': {},
        'peak_hours': [],
    }


# =============================================================================
# COMPREHENSIVE NURSING ANALYTICS
# =============================================================================

def build_comprehensive_nursing_analytics(base_qs: QuerySet, start_date: datetime, end_date: datetime) -> dict[str, Any]:
    """
    Build comprehensive nursing analytics combining all metrics.
    """
    return {
        'patient_flow': build_patient_flow_analytics(base_qs, start_date, end_date),
        'vitals_quality': build_vitals_quality_analytics(base_qs, start_date, end_date),
        'wait_times': build_wait_time_analytics(base_qs, start_date, end_date),
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
        },
    }
