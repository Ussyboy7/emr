"""Single-request aggregates for the global EMR operational dashboard."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from django.db.models import Avg, Count, F, Q
from django.utils import timezone

from appointments.models import Appointment
from common.cache_helpers import cache_get_or_set
from common.mixins import SCOPE_ALL
from consultation.models import ConsultationQueue, ConsultationSession
from laboratory.models import LabTest
from organization.models import Clinic
from patients.models import Visit
from pharmacy.models import Prescription
from wards.models import Bed, PatientAdmission


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
    cache_key = f"operational_dashboard:v2:{today.isoformat()}:{scope_id or 'all'}"

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

        admissions_qs = scoped(
            PatientAdmission.objects.all(),
            field="visit__location_clinic_id",
        )
        active_admissions = admissions_qs.filter(
            status__in=["admitted", "pending_discharge"]
        ).count()
        pending_discharges = admissions_qs.filter(status="pending_discharge").count()
        escalated_q = (
            Q(current_condition__icontains="needs doctor review")
            | Q(current_condition__icontains="escalat")
            | Q(current_condition__icontains="critical")
            | Q(current_condition__icontains="serious")
        )
        escalated_admissions = admissions_qs.filter(
            status__in=["admitted", "pending_discharge"]
        ).filter(escalated_q).count()

        beds_qs = scoped(Bed.objects.all(), field="ward__location_clinic_id")
        available_beds = beds_qs.filter(status="available").count()

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

        # ---- Facility performance -------------------------------------------------
        # Aggregate every domain keyed by the stable facility FK (location_clinic_id),
        # never by facility name. Names are resolved once and joined by ID.
        visit_rows = visits_today_qs.values("location_clinic_id").annotate(
            visits=Count("id"),
            completed=Count("id", filter=Q(status="completed")),
        )

        session_agg = (
            scoped(
                ConsultationSession.objects.filter(
                    status="completed",
                    started_at__date=today,
                    ended_at__isnull=False,
                )
            )
            .values("location_clinic_id")
            .annotate(avg_dur=Avg(F("ended_at") - F("started_at")))
        )
        session_minutes = {
            row["location_clinic_id"]: (
                round(row["avg_dur"].total_seconds() / 60, 1)
                if row["avg_dur"] is not None
                else None
            )
            for row in session_agg
        }

        lab_rows = (
            scoped(
                LabTest.objects.filter(processed_at__date=today),
                field="order__location_clinic_id",
            )
            .values("order__location_clinic_id")
            .annotate(n=Count("id", distinct=True))
        )
        lab_counts = {
            row["order__location_clinic_id"]: row["n"] for row in lab_rows
        }

        rx_rows = scoped(
            Prescription.objects.filter(
                status="dispensed",
                dispensed_at__date=today,
            )
        ).values("location_clinic_id").annotate(n=Count("id"))
        rx_counts = {row["location_clinic_id"]: row["n"] for row in rx_rows}

        facility_ids = (
            {row["location_clinic_id"] for row in visit_rows}
            | set(session_minutes)
            | set(lab_counts)
            | set(rx_counts)
        )
        name_map = dict(
            Clinic.objects.filter(id__in=facility_ids).values_list("id", "name")
        )

        facility_rows = []
        for fid in facility_ids:
            visit_row = next((r for r in visit_rows if r["location_clinic_id"] == fid), None)
            visits = visit_row["visits"] if visit_row else 0
            completed = visit_row["completed"] if visit_row else 0
            facility_rows.append(
                {
                    "name": (name_map.get(fid) or "Unassigned").strip() or "Unassigned",
                    "visits": visits,
                    "completionRate": round((completed / visits) * 100, 1) if visits else 0.0,
                    "avgConsultationTime": session_minutes.get(fid),
                    "labTestsProcessed": lab_counts.get(fid, 0),
                    "prescriptionsDispensed": rx_counts.get(fid, 0),
                }
            )
        facility_rows.sort(key=lambda r: -r["visits"])

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
            "wardStatus": {
                "activeAdmissions": active_admissions,
                "pendingDischarges": pending_discharges,
                "escalated": escalated_admissions,
                "availableBeds": available_beds,
            },
            "recentPatients": recent_patients,
            "facilityPerformance": facility_rows,
            "upcomingAppointments": upcoming_rows,
        }

    return cache_get_or_set(cache_key, _build)
