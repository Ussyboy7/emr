"""Doctor patient count — completed consultation sessions per doctor in a period."""
from __future__ import annotations

from datetime import date

from django.db.models import Count, Q

from consultation.models import ConsultationSession


def build_doctor_patient_count_report(
    period_start: date,
    period_end: date,
    *,
    org_facility_id: int | None = None,
    search: str | None = None,
) -> dict:
    from common.report_period import filter_inclusive_date_range

    qs = filter_inclusive_date_range(
        ConsultationSession.objects.filter(
            status="completed",
            doctor__isnull=False,
            patient__isnull=False,
        ),
        "started_at",
        period_start,
        period_end,
    )
    if org_facility_id is not None:
        qs = qs.filter(location_clinic_id=org_facility_id)
    if search:
        qs = qs.filter(
            Q(doctor__first_name__icontains=search)
            | Q(doctor__last_name__icontains=search)
            | Q(doctor__username__icontains=search)
        )

    aggregated = (
        qs.values(
            "doctor_id",
            "doctor__first_name",
            "doctor__last_name",
            "doctor__username",
        )
        .annotate(
            sessions=Count("id"),
            patients=Count("patient_id", distinct=True),
        )
        .order_by("-patients", "-sessions", "doctor__username")
    )

    total_sessions = sum(row["sessions"] for row in aggregated)
    distinct_patients = qs.values("patient_id").distinct().count()

    room_rows = (
        qs.exclude(room__isnull=True)
        .values("doctor_id", "room__name")
        .distinct()
        .order_by("doctor_id", "room__name")
    )
    rooms_by_doctor: dict[int, list[str]] = {}
    for room_row in room_rows:
        rooms_by_doctor.setdefault(room_row["doctor_id"], []).append(
            room_row["room__name"] or "—"
        )

    result = []
    for idx, row in enumerate(aggregated, start=1):
        name = f"{row.get('doctor__first_name') or ''} {row.get('doctor__last_name') or ''}".strip()
        sessions = row.get("sessions", 0) or 0
        rooms = rooms_by_doctor.get(row["doctor_id"], [])
        result.append(
            {
                "sn": idx,
                "doctor_id": row["doctor_id"],
                "doctor_name": name or (row.get("doctor__username") or "—"),
                "rooms": rooms,
                "room_display": ", ".join(rooms) if rooms else "—",
                "sessions": sessions,
                "patients": row.get("patients", 0) or 0,
                "percentage": round((sessions / total_sessions * 100) if total_sessions > 0 else 0, 1),
            }
        )

    return {
        "mode": "doctor_patient_count",
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "data": result,
        "summary": {
            "total_sessions": total_sessions,
            "distinct_patients": distinct_patients,
            "doctor_count": len(result),
            "grand_total": total_sessions,
        },
    }
