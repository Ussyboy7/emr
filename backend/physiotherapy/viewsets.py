"""
DRF viewsets for physiotherapy templates, orders, and sessions.
"""
from __future__ import annotations

from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.session_report_pdf import build_physio_session_pdf_bytes
from patients.models import Visit

from .filters import PhysioSessionFilter
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


class PhysioOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    filterset_fields = ["status", "priority", "patient", "visit", "consultation_session", "referral_source"]
    search_fields = ["patient__surname", "patient__first_name", "patient__middle_name", "patient__patient_id"]
    ordering_fields = ["ordered_at", "scheduled_at", "status"]
    ordering = ["-ordered_at"]

    def get_queryset(self):
        return PhysioOrder.objects.select_related("patient", "ordered_by", "visit", "consultation_session").all()

    def get_serializer_class(self):
        if self.action == "create":
            return PhysioOrderCreateSerializer
        return PhysioOrderSerializer

    def perform_create(self, serializer):
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
            PhysioOrder.objects.filter(visit_id__in=visit_ids, status__in=ACTIVE_ORDER_STATUSES)
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
        visit_raw = request.data.get("visit")
        if visit_raw is None:
            return Response({"detail": "visit is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            visit_id = int(visit_raw)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid visit id"}, status=status.HTTP_400_BAD_REQUEST)
        if visit_id <= 0:
            return Response({"detail": "Invalid visit id"}, status=status.HTTP_400_BAD_REQUEST)

        visit = Visit.objects.select_related("patient").filter(pk=visit_id).first()
        if visit is None:
            return Response({"detail": "Visit not found."}, status=status.HTTP_404_NOT_FOUND)
        if visit.patient_id is None:
            return Response({"detail": "Visit has no patient."}, status=status.HTTP_400_BAD_REQUEST)

        order = (
            PhysioOrder.objects.filter(
                visit_id=visit_id,
                patient_id=visit.patient_id,
                status__in=ACTIVE_ORDER_STATUSES,
            )
            .order_by("-ordered_at")
            .first()
        )
        created = False
        if order is None:
            order = PhysioOrder.objects.create(
                patient_id=visit.patient_id,
                visit_id=visit_id,
                ordered_by=request.user,
                consultation_session=None,
                diagnosis="",
                chief_complaint="Nursing pool check-in — Physiotherapy",
                treatment_goal="",
                special_instructions="",
                priority="normal",
                status="scheduled",
                referral_source="nursing",
                scheduled_at=timezone.now(),
                sessions_completed=0,
            )
            created = True
        elif order.status == "pending":
            order.status = "scheduled"
            if order.scheduled_at is None:
                order.scheduled_at = timezone.now()
            order.save(update_fields=["status", "scheduled_at"])

        data = PhysioOrderSerializer(order).data
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class PhysioSessionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    filterset_class = PhysioSessionFilter
    search_fields = ["order__patient__surname", "order__patient__first_name", "order__patient__patient_id"]
    ordering_fields = ["scheduled_at", "created_at", "status", "session_number"]
    ordering = ["-scheduled_at", "session_number"]

    def get_queryset(self):
        return PhysioSession.objects.select_related("order", "order__patient", "physiotherapist", "template").all()

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
        session = (
            PhysioSession.objects.select_related("order", "order__patient", "physiotherapist")
            .filter(pk=pk)
            .first()
        )
        if session is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
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

        order = PhysioOrder.objects.filter(pk=order_id).first()
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
