"""
Nursing pool analytics: day trends, segment counts, multi-clinic legs, physio/eye check-ins.

Uses the same base queryset as nursing-pool-metrics (visit date + in_progress + nursing_pool exclusions).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from django.db.models import QuerySet

from common.clinic_utils import active_opd_service_matches_code, normalize_clinic_name


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
