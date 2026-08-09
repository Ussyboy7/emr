"""
DRF viewsets for physiotherapy templates, orders, and sessions.
"""
from __future__ import annotations

from datetime import date as date_type, datetime, timedelta

from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.pagination import StandardPageNumberPagination

from common.session_report_pdf import build_physio_session_pdf_bytes
from accounts.utils import resolve_facility, resolve_facility_id
from common.cache_helpers import cache_get_or_set
from common.mixins import FacilityScopedMixin
from common.openapi import document_destroy_viewset, document_viewset
from organization.models import SystemConfig
from patients.models import Visit

from .filters import PhysioOrderFilter, PhysioSessionFilter
from .models import PhysioOrder, PhysioSession, PhysioTemplate
from .serializers import (
    PhysioOrderCreateSerializer,
    PhysioOrderSerializer,
    PhysioSessionCreateSerializer,
    PhysioSessionSerializer,
    PhysioTemplateSerializer,
)


ACTIVE_ORDER_STATUSES = ("pending", "scheduled", "in_progress")
ORDER_LEG_STATUSES = ACTIVE_ORDER_STATUSES + ("completed",)
ORDER_LEG_RANK = {"in_progress": 0, "scheduled": 1, "pending": 2, "completed": 3}


@document_viewset(tag="Physiotherapy", resource="physio templates")
class PhysioTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = PhysioTemplateSerializer
    pagination_class = StandardPageNumberPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return PhysioTemplate.objects.none()
        
        return PhysioTemplate.objects.all()


@document_viewset(tag="Physiotherapy", resource="physio orders")
class PhysioOrderViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    pagination_class = StandardPageNumberPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = PhysioOrderFilter
    ordering_fields = ["ordered_at", "scheduled_at", "status"]
    ordering = ["-ordered_at"]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return PhysioOrder.objects.none()
        
        return self.scope_queryset(
            PhysioOrder.objects.select_related(
                "patient",
                "ordered_by",
                "visit",
                "visit__location_clinic",
                "consultation_session",
                "consultation_session__location_clinic",
                "consultation_session__room__location_clinic",
                "location_clinic",
            ).all()
        )

    def get_serializer_class(self):
        if self.action == "create":
            return PhysioOrderCreateSerializer
        return PhysioOrderSerializer

    def perform_create(self, serializer):
        from common.order_location import apply_order_location_clinic

        self.auto_set_facility(serializer)
        validated = apply_order_location_clinic(
            dict(serializer.validated_data),
            user=self.request.user,
        )
        for key, value in validated.items():
            serializer.validated_data[key] = value
        serializer.save(ordered_by=self.request.user)

    @extend_schema(tags=["Physiotherapy"], summary="Schedule")
    @action(detail=True, methods=["post"])
    def schedule(self, request, pk=None):
        order = self.get_object()
        scheduled_raw = request.data.get("scheduled_at")
        scheduled_at = parse_datetime(scheduled_raw) if isinstance(scheduled_raw, str) and scheduled_raw else timezone.now()
        if scheduled_at is None:
            return Response({"detail": "Invalid scheduled_at datetime."}, status=status.HTTP_400_BAD_REQUEST)
        if timezone.is_naive(scheduled_at):
            scheduled_at = timezone.make_aware(scheduled_at)
        order.status = "scheduled"
        order.scheduled_at = scheduled_at
        order.save(update_fields=["status", "scheduled_at"])
        return Response(PhysioOrderSerializer(order).data)

    @extend_schema(tags=["Physiotherapy"], summary="Home dashboard", description="Single-request payload for the physiotherapy home page.")
    @action(detail=False, methods=["get"], url_path="home-dashboard")
    def home_dashboard(self, request):
        """Single-request payload for the physiotherapy home page."""
        day_str = (request.query_params.get("date") or "").strip()
        if day_str:
            try:
                today = date_type.fromisoformat(day_str[:10])
            except ValueError:
                today = timezone.localdate()
        else:
            today = timezone.localdate()
        tomorrow = today + timedelta(days=1)

        scope_key = getattr(request.user, "pk", "anon")
        cache_key = f"physio_home:{scope_key}:{today.isoformat()}"

        def build() -> dict:
            orders_qs = self.get_queryset()
            sessions_qs = self.scope_queryset(
                PhysioSession.objects.select_related(
                    "order",
                    "order__patient",
                    "physiotherapist",
                )
            )
            day_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
            day_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

            scheduled_tomorrow = orders_qs.filter(
                status="scheduled",
                scheduled_at__date=tomorrow,
            ).count()
            completed_today = sessions_qs.filter(
                status="completed",
                completed_at__gte=day_start,
                completed_at__lte=day_end,
            ).count()

            return {
                "date": today.isoformat(),
                "stats": {
                    "pending": orders_qs.filter(status="pending").count(),
                    "scheduled": orders_qs.filter(status="scheduled").count(),
                    "inProgress": orders_qs.filter(status="in_progress").count(),
                    "completedToday": completed_today,
                    "scheduledTomorrow": scheduled_tomorrow,
                },
                "recentOrders": PhysioOrderSerializer(
                    orders_qs.filter(ordered_at__date=today).order_by("-ordered_at")[:5],
                    many=True,
                ).data,
            }

        return Response(cache_get_or_set(cache_key, build))

    @extend_schema(tags=["Physiotherapy"], summary="Stats", description="Per-status counts for the current user/clinic scope.")
    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Per-status counts for the current user/clinic scope.

        Mirrors the list endpoint's date filter so the dashboard cards match
        the visible rows (e.g. with `ordered_at_after=2026-06-01` and
        `ordered_at_before=2026-06-01` the cards reflect "Today" only).
        """
        qs = self.get_queryset()
        # Apply date range only — do NOT honour `status` (we're counting
        # per-status; honouring it would always return 1 status bucket).
        date_after = request.query_params.get("ordered_at_after")
        if date_after:
            qs = qs.filter(ordered_at__date__gte=date_after)
        date_before = request.query_params.get("ordered_at_before")
        if date_before:
            qs = qs.filter(ordered_at__date__lte=date_before)
        rows = qs.values("status").annotate(count=Count("id"))
        counts = {row["status"]: row["count"] for row in rows}
        return Response({
            "pending": counts.get("pending", 0),
            "scheduled": counts.get("scheduled", 0),
            "in_progress": counts.get("in_progress", 0),
            "cancelled": counts.get("cancelled", 0),
            "completed": counts.get("completed", 0),
        })

    @extend_schema(tags=["Physiotherapy"], summary="Checkins for visits")
    @action(detail=False, methods=["get"], url_path="checkins-for-visits")
    def checkins_for_visits(self, request):
        raw = (request.query_params.get("visit_ids") or "").strip()
        if not raw:
            return Response({"results": {}})
        visit_ids: list[int] = []
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                vid = int(part)
                if vid > 0:
                    visit_ids.append(vid)
            except ValueError:
                continue
        if not visit_ids:
            return Response({"results": {}})

        orders = (
            self.scope_queryset(
                PhysioOrder.objects.filter(visit_id__in=visit_ids, status__in=ORDER_LEG_STATUSES)
            )
            .order_by("-ordered_at")
        )
        best: dict[int, PhysioOrder] = {}
        for o in orders:
            if not o.visit_id:
                continue
            existing = best.get(o.visit_id)
            if existing is None:
                best[o.visit_id] = o
                continue
            if ORDER_LEG_RANK.get(o.status, 9) < ORDER_LEG_RANK.get(existing.status, 9):
                best[o.visit_id] = o

        from patients.nursing_leg_status import order_leg_state

        out: dict[str, dict] = {}
        for vid in visit_ids:
            o = best.get(vid)
            if o:
                leg_state = order_leg_state(o.status)
                out[str(vid)] = {
                    "checked_in": leg_state != "pending",
                    "order_id": o.id,
                    "status": o.status,
                    "leg_state": leg_state,
                }
            else:
                out[str(vid)] = {"checked_in": False, "leg_state": "pending"}
        return Response({"results": out})

    @extend_schema(tags=["Physiotherapy"], summary="Checkin from visit")
    @action(detail=False, methods=["post"], url_path="checkin-from-visit")
    def checkin_from_visit(self, request):
        try:
            visit_raw = request.data.get("visit")
            if visit_raw is None:
                return Response({"detail": "visit is required"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                visit_id = int(visit_raw)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid visit id"}, status=status.HTTP_400_BAD_REQUEST)
            if visit_id <= 0:
                return Response({"detail": "Invalid visit id"}, status=status.HTTP_400_BAD_REQUEST)

            visit_qs = Visit.objects.select_related("patient").filter(pk=visit_id)
            if SystemConfig.is_enabled('multi_clinic_enabled'):
                v_clinic_id = resolve_facility_id(self.request.user)
                if v_clinic_id is not None:
                    visit_qs = visit_qs.filter(location_clinic=v_clinic_id)
            visit = visit_qs.first()
            if visit is None:
                return Response({"detail": "Visit not found."}, status=status.HTTP_404_NOT_FOUND)
            if visit.patient_id is None:
                return Response({"detail": "Visit has no patient."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": f"Error validating visit: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            order = (
                self.scope_queryset(
                    PhysioOrder.objects.filter(
                        visit_id=visit_id,
                        patient_id=visit.patient_id,
                        status__in=ACTIVE_ORDER_STATUSES,
                    )
                )
                .order_by("-ordered_at")
                .first()
            )
        except Exception as e:
            return Response({"detail": f"Failed to query physiotherapy orders: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        created = False
        if order is None:
            try:
                from physiotherapy.visit_orders import ensure_physio_order_for_visit

                order, created = ensure_physio_order_for_visit(
                    visit,
                    ordered_by=request.user,
                    referral_source="nursing",
                    diagnosis="Nursing pool check-in — Physiotherapy",
                )
                if order is None:
                    return Response(
                        {"detail": "This visit is not routed to Physiotherapy."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            except Exception as e:
                return Response({"detail": f"Failed to create physiotherapy order: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        elif order.status == "pending":
            try:
                order.status = "scheduled"
                if order.scheduled_at is None:
                    order.scheduled_at = timezone.now()
                order.save(update_fields=["status", "scheduled_at"])
            except Exception as e:
                return Response({"detail": f"Failed to update physiotherapy order: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            data = PhysioOrderSerializer(order).data
            return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except Exception as e:
            return Response({"detail": f"Failed to serialize physiotherapy order: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@document_viewset(tag="Physiotherapy", resource="physio sessions")
class PhysioSessionViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    pagination_class = StandardPageNumberPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = PhysioSessionFilter
    ordering_fields = ["scheduled_at", "created_at", "completed_at", "status", "session_number"]
    ordering = ["-completed_at", "-scheduled_at"]
    facility_filter_field = 'order__location_clinic'

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return PhysioSession.objects.none()
        
        return self.scope_queryset(
            PhysioSession.objects.select_related("order", "order__patient", "physiotherapist", "template").all()
        )

    def get_serializer_class(self):
        if self.action == "create":
            return PhysioSessionCreateSerializer
        return PhysioSessionSerializer

    @extend_schema(tags=["Physiotherapy"], summary="Completed stats", description="Aggregate completed-session card counts in one query.")
    @action(detail=False, methods=["get"], url_path="completed-stats")
    def completed_stats(self, request):
        """Aggregate completed-session card counts in one query."""
        from common.session_stats import aggregate_completed_session_stats

        qs = self.filter_queryset(self.get_queryset()).filter(status="completed")
        return Response(aggregate_completed_session_stats(qs, mode="physio"))

    @extend_schema(tags=["Physiotherapy"], summary="Start session")
    @action(detail=True, methods=["post"])
    def start_session(self, request, pk=None):
        session = self.get_object()
        if session.status not in ("scheduled", "in_progress"):
            return Response({"detail": "Session cannot be started from current status."}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        if session.started_at is None:
            session.started_at = now
        session.status = "in_progress"
        session.save(update_fields=["started_at", "status"])
        if session.order.status in ("pending", "scheduled"):
            session.order.status = "in_progress"
            session.order.save(update_fields=["status"])
        return Response(PhysioSessionSerializer(session).data)

    @extend_schema(tags=["Physiotherapy"], summary="Complete session")
    @action(detail=True, methods=["post"])
    def complete_session(self, request, pk=None):
        session = self.get_object()
        if session.status == "completed":
            return Response(PhysioSessionSerializer(session).data)
        now = timezone.now()
        if session.started_at is None:
            session.started_at = now
        session.completed_at = now
        session.status = "completed"
        if session.started_at and session.completed_at:
            duration = int((session.completed_at - session.started_at).total_seconds() // 60)
            session.duration_minutes = max(duration, 0)
        session.save(update_fields=["started_at", "completed_at", "status", "duration_minutes"])

        order = session.order
        completed_count = order.sessions.filter(status="completed").count()
        order.sessions_completed = completed_count
        order_completed_now = False
        if order.status != "completed":
            order.status = "completed"
            order.completed_at = now
            order.save(update_fields=["sessions_completed", "status", "completed_at"])
            order_completed_now = True
        else:
            order.save(update_fields=["sessions_completed"])

        if order_completed_now and order.visit_id:
            from patients.models import Visit
            from patients.nursing_leg_status import (
                apply_visit_completion_after_leg,
                mark_visit_clinic_completed,
            )

            visit = Visit.objects.filter(pk=order.visit_id).first()
            if visit is not None:
                mark_visit_clinic_completed(visit, "Physiotherapy")
                apply_visit_completion_after_leg(visit)
                visit.save(update_fields=["completed_clinics", "status"])

        return Response(PhysioSessionSerializer(session).data)

    @extend_schema(tags=["Physiotherapy"], summary="Session report pdf")
    @action(detail=True, methods=["get"], url_path="session_report_pdf")
    def session_report_pdf(self, request, pk=None):
        session = self.get_object()
        pdf_bytes = build_physio_session_pdf_bytes(session)
        filename = f"physio_session_{pk}.pdf"
        return HttpResponse(
            pdf_bytes,
            content_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @extend_schema(tags=["Physiotherapy"], summary="Create next session")
    @action(detail=False, methods=["post"], url_path="create_next_session")
    def create_next_session(self, request):
        order_raw = request.data.get("order_id")
        physio_raw = request.data.get("physiotherapist_id")
        scheduled_raw = request.data.get("scheduled_at")
        notes = request.data.get("notes") or ""
        try:
            order_id = int(order_raw)
            physiotherapist_id = int(physio_raw)
        except (TypeError, ValueError):
            return Response({"detail": "order_id and physiotherapist_id must be valid integers."}, status=status.HTTP_400_BAD_REQUEST)
        scheduled_at = parse_datetime(scheduled_raw) if isinstance(scheduled_raw, str) and scheduled_raw else timezone.now()
        if scheduled_at is None:
            return Response({"detail": "Invalid scheduled_at datetime."}, status=status.HTTP_400_BAD_REQUEST)
        if timezone.is_naive(scheduled_at):
            scheduled_at = timezone.make_aware(scheduled_at)

        order = self.scope_queryset(PhysioOrder.objects.filter(pk=order_id)).first()
        if order is None:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        last = order.sessions.order_by("-session_number").first()
        next_number = last.session_number if last else 0
        session = PhysioSession.objects.create(
            order=order,
            physiotherapist_id=physiotherapist_id,
            session_number=next_number + 1,
            status="scheduled",
            scheduled_at=scheduled_at,
            notes=str(notes),
        )
        return Response(PhysioSessionSerializer(session).data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=["Physiotherapy"], summary="Add recommendation")
    @action(detail=True, methods=["post"], url_path="add_recommendation")
    def add_recommendation(self, request, pk=None):
        session = self.get_object()
        recommendation = request.data.get("recommendation")
        if not isinstance(recommendation, str) or not recommendation.strip():
            return Response({"detail": "recommendation is required."}, status=status.HTTP_400_BAD_REQUEST)
        rec_type = request.data.get("type") if isinstance(request.data.get("type"), str) else "general"
        recs = list(session.recommendations or [])
        recs.append({"text": recommendation.strip(), "type": rec_type, "created_at": timezone.now().isoformat()})
        session.recommendations = recs
        session.save(update_fields=["recommendations"])
        return Response(PhysioSessionSerializer(session).data)
