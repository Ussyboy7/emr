"""Per-room queue funnel stats for nursing dashboards."""
from __future__ import annotations

from datetime import date

from django.db.models import Count, Exists, OuterRef
from django.utils import timezone

from .models import ConsultationQueue, ConsultationSession


def build_room_queue_stats(
    room_ids: list[int],
    *,
    day: date | None = None,
) -> dict[str, dict[str, int]]:
    """Return sent/waiting/in_consult/completed/left counts per room for one calendar day."""
    if not room_ids:
        return {}

    day = day or timezone.localdate()
    stats: dict[str, dict[str, int]] = {
        str(rid): {
            'sent_today': 0,
            'waiting': 0,
            'in_consult': 0,
            'completed_today': 0,
            'left_without_consult': 0,
        }
        for rid in room_ids
    }

    sent_rows = (
        ConsultationQueue.objects.filter(room_id__in=room_ids, queued_at__date=day)
        .values('room_id')
        .annotate(count=Count('id'))
    )
    for row in sent_rows:
        stats[str(row['room_id'])]['sent_today'] = row['count']

    waiting_rows = (
        ConsultationQueue.objects.filter(room_id__in=room_ids, is_active=True)
        .values('room_id')
        .annotate(count=Count('id'))
    )
    for row in waiting_rows:
        stats[str(row['room_id'])]['waiting'] = row['count']

    in_consult_rows = (
        ConsultationSession.objects.filter(room_id__in=room_ids, status='active')
        .values('room_id')
        .annotate(count=Count('id'))
    )
    for row in in_consult_rows:
        stats[str(row['room_id'])]['in_consult'] = row['count']

    completed_rows = (
        ConsultationSession.objects.filter(
            room_id__in=room_ids,
            status='completed',
            started_at__date=day,
        )
        .values('room_id')
        .annotate(count=Count('id'))
    )
    for row in completed_rows:
        stats[str(row['room_id'])]['completed_today'] = row['count']

    seen_after_queue = ConsultationSession.objects.filter(
        room_id=OuterRef('room_id'),
        patient_id=OuterRef('patient_id'),
        started_at__gte=OuterRef('queued_at'),
    )
    left_rows = (
        ConsultationQueue.objects.filter(
            room_id__in=room_ids,
            queued_at__date=day,
            is_active=False,
        )
        .annotate(seen=Exists(seen_after_queue))
        .filter(seen=False)
        .values('room_id')
        .annotate(count=Count('id'))
    )
    for row in left_rows:
        stats[str(row['room_id'])]['left_without_consult'] = row['count']

    return stats
