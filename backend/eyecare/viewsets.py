"""
DRF viewsets for Eye Clinic orders, sessions, and diagnostic uploads.
"""
from __future__ import annotations

import json

from datetime import timedelta

from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from common.session_report_pdf import build_eye_session_pdf_bytes
from patients.models import Visit

from .filters import EyeSessionFilter
from .models import EyeOrder, EyeSession, EyeSessionDiagnosticFile
from .serializers import (
    EyeOrderCreateSerializer,
    EyeOrderSerializer,
    EyeSessionCreateSerializer,
    EyeSessionDiagnosticFileSerializer,
    EyeSessionSerializer,
)


class StandardResultsPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500


ACTIVE_EYE_ORDER_STATUSES = ("pending", "scheduled", "in_progress")


class EyeOrderViewSet(viewsets.ModelViewSet):
    """Eye clinic orders (queue + CRUD)."""

    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["priority", "patient", "visit"]
    search_fields = [
        "patient__first_name",
        "patient__surname",
        "patient__patient_id",
        "diagnosis",
        "chief_complaint",
    ]
    ordering_fields = ["ordered_at", "scheduled_at", "status", "priority"]
    ordering = ["-ordered_at"]

    def get_queryset(self):
        qs = (
            EyeOrder.objects.select_related("patient", "ordered_by", "visit", "consultation_session")
            .annotate(
                completed_sessions_count=Count(
                    "sessions",
                    filter=Q(sessions__status="completed"),
                )
            )
            .all()
        )

        params = self.request.query_params
        status_tab = (params.get("status_tab") or "").strip().lower()
        if status_tab == "pending":
            qs = qs.filter(status__in=["pending", "scheduled"])
        elif status_tab == "in_progress":
            qs = qs.filter(status="in_progress")
        elif status_tab == "cancelled":
            qs = qs.filter(status="cancelled")
        elif status_tab == "completed":
            qs = qs.filter(status="completed")
        elif params.get("status"):
            qs = qs.filter(status=params.get("status"))

        after = (params.get("ordered_at_after") or "").strip()
        before = (params.get("ordered_at_before") or "").strip()
        if after or before:
            if after:
                qs = qs.filter(ordered_at__date__gte=after)
            if before:
                qs = qs.filter(ordered_at__date__lte=before)
        else:
            date_filter = (params.get("date_filter") or "today").strip().lower()
            today = timezone.now().date()
            if date_filter == "today":
                qs = qs.filter(ordered_at__date=today)
            elif date_filter == "week":
                qs = qs.filter(ordered_at__date__gte=today - timedelta(days=7))
            elif date_filter == "month":
                qs = qs.filter(ordered_at__date__gte=today - timedelta(days=31))
            # "all" — no extra date constraint

        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return EyeOrderCreateSerializer
        return EyeOrderSerializer

    def perform_create(self, serializer):
        serializer.save(ordered_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        order = self.get_object()
        order.status = "completed"
        order.completed_at = timezone.now()
        order.save(update_fields=["status", "completed_at"])
        return Response(EyeOrderSerializer(order).data)

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
            EyeOrder.objects.filter(visit_id__in=visit_ids, status__in=ACTIVE_EYE_ORDER_STATUSES)
            .order_by("-ordered_at")
        )
        best: dict[int, EyeOrder] = {}
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
            EyeOrder.objects.filter(
                visit_id=visit_id,
                patient_id=visit.patient_id,
                status__in=ACTIVE_EYE_ORDER_STATUSES,
            )
            .order_by("-ordered_at")
            .first()
        )
        created = False
        if order is None:
            order = EyeOrder.objects.create(
                patient_id=visit.patient_id,
                visit_id=visit_id,
                ordered_by=request.user,
                consultation_session=None,
                chief_complaint="Nursing pool check-in — Eye Clinic",
                visual_acuity_od="",
                visual_acuity_os="",
                visual_acuity_ou="",
                refraction_od="",
                refraction_os="",
                diagnosis="",
                treatment_plan="",
                special_instructions="",
                priority="routine",
                status="scheduled",
                scheduled_at=timezone.now(),
            )
            created = True
        elif order.status == "pending":
            order.status = "scheduled"
            if order.scheduled_at is None:
                order.scheduled_at = timezone.now()
            order.save(update_fields=["status", "scheduled_at"])

        data = EyeOrderSerializer(order).data
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class EyeSessionViewSet(viewsets.ModelViewSet):
    """Eye clinic clinical sessions."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = EyeSessionFilter
    ordering_fields = ["scheduled_at", "created_at", "status", "session_number"]
    ordering = ["-scheduled_at"]

    def get_queryset(self):
        return (
            EyeSession.objects.select_related("order", "order__patient", "order__ordered_by")
            .prefetch_related("diagnostic_uploads")
            .all()
        )

    def get_serializer_class(self):
        if self.action == "create":
            return EyeSessionCreateSerializer
        return EyeSessionSerializer

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        ctype = (request.content_type or "").lower()
        if "multipart/form-data" in ctype:
            data: dict = {}
            for key in request.POST:
                val = request.POST.get(key)
                if val is None:
                    continue
                if key == "soap_note":
                    try:
                        data[key] = json.loads(val) if val.strip() else {}
                    except json.JSONDecodeError:
                        data[key] = {}
                elif key in ("session_number", "duration_minutes"):
                    try:
                        data[key] = int(val)
                    except (TypeError, ValueError):
                        pass
                else:
                    data[key] = val

            for form_key, category in (
                ("pachymetry_files", "pachymetry"),
                ("oct_files", "oct"),
                ("visual_field_files", "visual_field"),
            ):
                for f in request.FILES.getlist(form_key):
                    EyeSessionDiagnosticFile.objects.create(session=instance, category=category, file=f)

            serializer = self.get_serializer(instance, data=data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(EyeSessionSerializer(instance, context={"request": request}).data)
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["get"], url_path="session_report_pdf")
    def session_report_pdf(self, request, pk=None):
        session = (
            EyeSession.objects.select_related("order", "order__patient")
            .filter(pk=pk)
            .first()
        )
        if session is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = build_eye_session_pdf_bytes(session)
        filename = f"eye_session_{pk}.pdf"
        return HttpResponse(
            pdf_bytes,
            content_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


class EyeSessionDiagnosticFileViewSet(mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Delete uploaded diagnostic rows (multi-upload only)."""

    permission_classes = [IsAuthenticated]
    queryset = EyeSessionDiagnosticFile.objects.all()
    serializer_class = EyeSessionDiagnosticFileSerializer
