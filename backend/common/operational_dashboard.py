"""Single-request aggregates for the global EMR operational dashboard."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from django.db.models import Count, F, Q
from django.utils import timezone

from appointments.models import Appointment
from common.cache_helpers import cache_get_or_set
from common.mixins import SCOPE_ALL
from consultation.models import ConsultationQueue, ConsultationSession
from laboratory.models import LabTest
from patients.models import Visit
from pharmacy.models import MedicationInventory, Prescription


def _parse_api_date(raw: str | None) -> date:
    if raw:
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            pass
    return timezone.localdate()


def build_operational_dashboard(
    target_date: date | None = None, *, clinic_scope=None
) -> dict:
    """
    Single-request aggregates for the global EMR operational dashboard.

    ``clinic_scope`` mirrors ``common.mixins.resolve_facility_scope`` output:
    ``None`` (no scoping), ``SCOPE_ALL`` (all clinics), or a ``Clinic`` instance.
    """
    today = target_date or timezone.localdate()
    yesterday = today - timedelta(days=1)
    scope_id = getattr(clinic_scope, "id", None) if clinic_scope not in (None, SCOPE_ALL) else clinic_scope
    cache_key = f"operational_dashboard:{today.isoformat()}:{scope_id or 'all'}"

    def _build() -> dict:
        day_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        day_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        def scoped(qs, field="location_clinic_id"):
            if clinic_scope is None or clinic_scope == SCOPE_ALL:
                return qs
            return qs.filter(**{field: clinic_scope})

        visits_today_qs = scoped(
            Visit.objects.filter(Q(created_at__date=today) | Q(date=today))
        )
        patients_today = visits_today_qs.values("patient_id").distinct().count()
        patients_yesterday = (
            scoped(
                Visit.objects.filter(Q(created_at__date=yesterday) | Q(date=yesterday))
            )
            .values("patient_id")
            .distinct()
            .count()
        )
        patients_change = (
            round(((patients_today - patients_yesterday) / patients_yesterday) * 100)
            if patients_yesterday > 0
            else 0
        )

        consultation_today = scoped(
            ConsultationSession.objects.filter(
                started_at__gte=day_start,
                started_at__lte=day_end,
            )
        ).count()

        lab_agg = scoped(
            LabTest.objects.all(),
            field="order__location_clinic_id",
        ).aggregate(
            pending=Count("id", filter=Q(status="pending")),
            in_progress=Count(
                "id",
                filter=Q(status__in=["sample_collected", "processing", "results_ready"]),
            ),
            critical=Count("id", filter=Q(status="results_ready")),
        )
        lab_pending = lab_agg["pending"] or 0
        lab_tests_today = lab_pending + (lab_agg["in_progress"] or 0)

        prescriptions_today = scoped(
            Prescription.objects.filter(
                dispensed_at__date=today,
                status="dispensed",
            )
        ).count()

        consultation_waiting = scoped(
            ConsultationQueue.objects.filter(is_active=True), field="room__location_clinic_id"
        ).count()
        pharmacy_queue = scoped(
            Prescription.objects.filter(status="pending")
        ).count()

        nursing_pool = (
            scoped(
                Visit.objects.filter(date=today)
            )
            .exclude(status__in=["cancelled", "completed"])
            .count()
        )

        recent_visits = (
            visits_today_qs.select_related("patient", "location_clinic")
            .order_by("-created_at")[:5]
        )
        recent_patients = []
        for visit in recent_visits:
            patient = visit.patient
            status = visit.status
            if status == "completed":
                status_label = "Completed"
            elif status == "in_progress":
                status_label = "In Consultation"
            else:
                status_label = "Pending"
            recent_patients.append(
                {
                    "visitId": visit.id,
                    "id": patient.patient_id if patient else "",
                    "name": patient.get_full_name() if patient else "",
                    "clinic": getattr(visit.location_clinic, "name", None) or visit.clinic or "",
                    "locationClinicId": visit.location_clinic_id,
                    "time": (visit.created_at or timezone.now()).isoformat(),
                    "status": status_label,
                }
            )

        critical_alerts: list[dict] = []
        lab_critical = lab_agg["critical"] or 0
        if lab_critical:
            critical_alerts.append(
                {
                    "type": "lab",
                    "message": f"{lab_critical} critical lab result{'s' if lab_critical != 1 else ''} require attention",
                    "time": "Just now",
                }
            )
        low_stock = (
            scoped(MedicationInventory.objects.filter(quantity__lte=F("min_stock_level")))
            .exclude(quantity=0)
            .count()
        )
        if low_stock:
            critical_alerts.append(
                {
                    "type": "stock",
                    "message": f"{low_stock} medication{'s' if low_stock != 1 else ''} running low on stock",
                    "time": "Just now",
                }
            )

        # Per-organization-clinic breakdown (location_clinic FK, not the legacy string).
        clinic_counts: dict[str, int] = defaultdict(int)
        for row in visits_today_qs.values("location_clinic__name").annotate(c=Count("id")):
            label = (row.get("location_clinic__name") or "Unassigned").strip() or "Unassigned"
            clinic_counts[label] += row["c"]
        clinic_rows = [
            {
                "name": name,
                "patients": count,
                "target": round(count * 1.2),
                "avgWait": 0,
            }
            for name, count in sorted(clinic_counts.items(), key=lambda x: -x[1])[:5]
        ]

        upcoming = (
            scoped(
                Appointment.objects.filter(
                    appointment_date__gte=today,
                    status__in=["scheduled", "confirmed"],
                ),
                field="location_clinic_id",
            )
            .select_related("patient", "location_clinic")
            .order_by("appointment_date", "appointment_time")[:3]
        )
        upcoming_rows = [
            {
                "patient": apt.patient.get_full_name() if apt.patient_id else "Unknown Patient",
                "type": apt.appointment_type,
                "time": f"{apt.appointment_date} {apt.appointment_time}",
                "clinic": getattr(apt.location_clinic, "name", None) or "General",
            }
            for apt in upcoming
        ]

        return {
            "date": today.isoformat(),
            "todayStats": {
                "patientsToday": patients_today,
                "patientsChange": patients_change,
                "consultations": consultation_today,
                "consultationsChange": 0,
                "labTests": lab_tests_today,
                "labTestsChange": 0,
                "prescriptions": prescriptions_today,
                "prescriptionsChange": 0,
            },
            "queueStatus": {
                "nursingPool": nursing_pool,
                "consultationWaiting": consultation_waiting,
                "labPending": lab_pending,
                "pharmacyQueue": pharmacy_queue,
            },
            "recentPatients": recent_patients,
            "criticalAlerts": critical_alerts,
            "clinicPerformance": clinic_rows,
            "upcomingAppointments": upcoming_rows,
        }

    return cache_get_or_set(cache_key, _build)
