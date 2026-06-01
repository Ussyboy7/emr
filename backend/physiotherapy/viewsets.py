"""
DRF viewsets for physiotherapy templates, orders, and sessions.
"""
from __future__ import annotations

from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.session_report_pdf import build_physio_session_pdf_bytes
from accounts.utils import resolve_clinic, resolve_clinic_id
from common.mixins import ClinicScopedMixin
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


class StandardResultsPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


ACTIVE_ORDER_STATUSES = ("pending", "scheduled", "in_progress")


class PhysioTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PhysioTemplateSerializer
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        return PhysioTemplate.objects.all()


class PhysioOrderViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    filterset_class = PhysioOrderFilter
    search_fields = ["patient__surname", "patient__first_name", "patient__middle_name", "patient__patient_id"]
    ordering_fields = ["ordered_at", "scheduled_at", "status"]
    ordering = ["-ordered_at"]

    def get_queryset(self):
        return self.scope_queryset(
            PhysioOrder.objects.select_related("patient", "ordered_by", "visit", "consultation_session").all()
        )

    def get_serializer_class(self):
        if self.action == "create":
            return PhysioOrderCreateSerializer
        return PhysioOrderSerializer

    def perform_create(self, serializer):
        self.auto_set_clinic(serializer)
        # Prefer the patient's visit clinic as the order's location_clinic
        # so the physio in that clinic can see it, regardless of the
        # creator's active clinic (admin context, multi-clinic switching, etc.).
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            existing = serializer.validated_data.get('location_clinic')
            if existing is None:
                visit = serializer.validated_data.get('visit')
                if visit is not None and getattr(visit, 'location_clinic_id', None) is not None:
                    serializer.validated_data['location_clinic_id'] = visit.location_clinic_id
        serializer.save(ordered_by=self.request.user)

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
                PhysioOrder.objects.filter(visit_id__in=visit_ids, status__in=ACTIVE_ORDER_STATUSES)
            )
            .order_by("-ordered_at")
        )
        best: dict[int, PhysioOrder] = {}
        for o in orders:
            if o.visit_id and o.visit_id not in best:
                best[o.visit_id] = o

        out: dict[str, dict] = {}
        for vid in visit_ids:
            o = best.get(vid)
            if o:
                out[str(vid)] = {"checked_in": True, "order_id": o.id, "status": o.status}
            else:
                out[str(vid)] = {"checked_in": False}
        return Response({"results": out})

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
                v_clinic_id = resolve_clinic_id(self.request.user)
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
                create_kwargs = dict(
                    patient_id=visit.patient_id,
                    visit_id=visit_id,
                    ordered_by=request.user,
                    consultation_session=None,
                    diagnosis="Nursing pool check-in — Physiotherapy",
                    special_instructions="",
                    priority="normal",
                    status="scheduled",
                    referral_source="nursing",
                    scheduled_at=timezone.now(),
                    sessions_completed=0,
                )
                if SystemConfig.is_enabled('multi_clinic_enabled'):
                    # File the order under the patient's visit clinic so any physio
                    # assigned to that clinic can see it — not under the forwarder's
                    # active clinic, which may differ (admin context, switching, etc.).
                    clinic = None
                    if getattr(visit, 'location_clinic_id', None) is not None:
                        from organization.models import Clinic
                        clinic = visit.location_clinic
                    if clinic is None:
                        clinic = resolve_clinic(self.request.user)
                    if clinic is not None:
                        create_kwargs['location_clinic'] = clinic
                order = PhysioOrder.objects.create(**create_kwargs)
                created = True
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


class PhysioSessionViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    filterset_class = PhysioSessionFilter
    search_fields = ["order__patient__surname", "order__patient__first_name", "order__patient__patient_id"]
    ordering_fields = ["scheduled_at", "created_at", "status", "session_number"]
    ordering = ["-scheduled_at", "session_number"]
    clinic_filter_field = 'order__location_clinic'

    def get_queryset(self):
        return self.scope_queryset(
            PhysioSession.objects.select_related("order", "order__patient", "physiotherapist", "template").all()
        )

    def get_serializer_class(self):
        if self.action == "create":
            return PhysioSessionCreateSerializer
        return PhysioSessionSerializer

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
        if order.status != "completed":
            order.status = "completed"
            order.completed_at = now
            order.save(update_fields=["sessions_completed", "status", "completed_at"])
        else:
            order.save(update_fields=["sessions_completed"])

        return Response(PhysioSessionSerializer(session).data)

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
