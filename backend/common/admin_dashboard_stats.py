"""Server-side aggregates for the administration dashboard (replaces client fan-out)."""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from accounts.models import User
from accounts.presence import count_online_users, presence_window_seconds
from audit.models import ActivityLog
from common.cache_helpers import cache_get_or_set
from common.views import _collect_system_health
from consultation.models import ConsultationRoom, ConsultationSession
from organization.models import Clinic
from permissions.models import Role


ROLE_DISPLAY = {
    "superuser": "System Administrator",
    "admin": "System Administrator",
    "doctor": "Medical Doctor",
    "nurse": "Nursing Officer",
    "lab_tech": "Laboratory Scientist",
    "pharmacist": "Pharmacist",
    "radiologist": "Radiologist",
    "physiotherapist": "Physiotherapist",
    "records": "Medical Records Officer",
    "medical_records": "Medical Records Officer",
    "optometrist": "Optometrist",
    "ophthalmologist": "Ophthalmologist",
}


def _format_role(role: str) -> str:
    if role in ROLE_DISPLAY:
        return ROLE_DISPLAY[role]
    if role == "No Role":
        return role
    return role.replace("_", " ").title()


def _relative_time(ts) -> str:
    if not ts:
        return ""
    now = timezone.now()
    if timezone.is_naive(ts):
        ts = timezone.make_aware(ts)
    diff = (now - ts).total_seconds()
    minutes = int(diff // 60)
    hours = int(diff // 3600)
    days = int(diff // 86400)
    if minutes < 1:
        return "Just now"
    if minutes < 60:
        return f"{minutes}m ago"
    if hours < 24:
        return f"{hours}h ago"
    return f"{days}d ago"


def build_admin_dashboard_stats(metrics_payload: dict | None = None) -> dict:
    cache_key = "admin_dashboard_stats:v1"

    def _build() -> dict:
        user_qs = User.objects.all()
        total_users = user_qs.count()
        active_users = user_qs.filter(is_active=True).count()
        inactive_users = max(0, total_users - active_users)

        role_rows = (
            user_qs.filter(is_active=True)
            .values("system_role")
            .annotate(count=Count("id"))
            .order_by()
        )
        role_counts: dict[str, int] = {}
        for row in role_rows:
            raw = (row["system_role"] or "").strip() or "No Role"
            label = _format_role(raw)
            role_counts[label] = role_counts.get(label, 0) + row["count"]

        colors = [
            "#3b82f6",
            "#10b981",
            "#f59e0b",
            "#8b5cf6",
            "#ec4899",
            "#06b6d4",
            "#f97316",
            "#64748b",
        ]
        users_by_role = [
            {"role": role, "count": count, "color": colors[i % len(colors)]}
            for i, (role, count) in enumerate(
                sorted(role_counts.items(), key=lambda x: -x[1])
            )
        ]

        total_roles = Role.objects.count()
        roles_in_use = (
            Role.objects.annotate(uc=Count("user_roles"))
            .filter(uc__gt=0)
            .count()
        )

        total_clinics = Clinic.objects.count()
        active_clinics = Clinic.objects.filter(is_active=True).count()

        rooms_qs = ConsultationRoom.objects.filter(is_active=True, status="active")
        total_rooms = rooms_qs.count()
        occupied_room_ids = (
            ConsultationSession.objects.filter(status="active", room__isnull=False)
            .values_list("room_id", flat=True)
            .distinct()
        )
        occupied_rooms = rooms_qs.filter(id__in=occupied_room_ids).count()
        available_rooms = max(0, total_rooms - occupied_rooms)

        recent_logs = ActivityLog.objects.select_related("user").order_by("-created_at")[:5]
        recent_audit_events = [
            {
                "id": str(log.id),
                "user": (
                    (log.user.get_full_name() if log.user else None)
                    or getattr(log.user, "email", None)
                    or "Unknown"
                ),
                "action": log.action,
                "module": log.module or "System",
                "detail": log.description or "",
                "time": _relative_time(log.created_at),
                "status": "success" if log.result == "success" else "failed",
            }
            for log in recent_logs
        ]

        try:
            system_health = _collect_system_health()
        except Exception:
            system_health = []

        window_start = timezone.now().date() - timedelta(days=30)
        clinic_status = list(
            Clinic.objects.annotate(
                patient_count=Count(
                    "visits__patient",
                    filter=Q(visits__date__gte=window_start),
                    distinct=True,
                ),
                doctor_count=Count(
                    "consultation_rooms__sessions__doctor",
                    filter=Q(
                        consultation_rooms__sessions__doctor__is_active=True,
                        consultation_rooms__sessions__started_at__gte=timezone.now()
                        - timedelta(days=30),
                    ),
                    distinct=True,
                ),
            ).values("name", "is_active", "patient_count", "doctor_count")
        )
        clinic_rows = [
            {
                "name": c["name"],
                "status": "open" if c["is_active"] else "closed",
                "patients": c["patient_count"] or 0,
                "doctors": c["doctor_count"] or 0,
            }
            for c in clinic_status
        ]

        metrics = metrics_payload or {}
        return {
            "totalUsers": total_users,
            "activeUsers": active_users,
            "inactiveUsers": inactive_users,
            "onlineNow": count_online_users(),
            "presenceWindowSeconds": presence_window_seconds(),
            "totalRoles": total_roles,
            "rolesInUse": roles_in_use,
            "totalClinics": total_clinics,
            "activeClinics": active_clinics,
            "totalRooms": total_rooms,
            "availableRooms": available_rooms,
            "occupiedRooms": occupied_rooms,
            "usersByRole": users_by_role,
            "recentAuditEvents": recent_audit_events,
            "systemHealth": system_health,
            "expiringLicenses": [],
            "clinicStatus": clinic_rows,
            "pendingApprovals": [],
            "responseTimeMs": metrics.get("responseTimeMs"),
            "errorRate": metrics.get("errorRate"),
            "responseTimeSample": metrics.get("responseTimeSample"),
            "mediaStorageGb": metrics.get("mediaStorageGb"),
            "backupStatus": metrics.get("backupStatus"),
            "metricSources": metrics.get("sources"),
        }

    return cache_get_or_set(cache_key, _build, ttl=30)
