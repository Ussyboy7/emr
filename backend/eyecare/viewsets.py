"""
DRF viewsets for Eye Clinic orders, sessions, and diagnostic uploads.
"""
from __future__ import annotations

import json

from datetime import date as date_type, datetime, timedelta

from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from common.pagination import StandardPageNumberPagination

from .report_pdf import build_eye_session_pdf_response
from accounts.utils import resolve_clinic, resolve_clinic_id
from common.cache_helpers import cache_get_or_set
from common.mixins import ClinicScopedMixin
from common.openapi import document_destroy_viewset, document_viewset
from organization.models import SystemConfig
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


ACTIVE_EYE_ORDER_STATUSES = ("pending", "scheduled", "in_progress")
EYE_ORDER_LEG_STATUSES = ACTIVE_EYE_ORDER_STATUSES + ("completed",)
EYE_ORDER_LEG_RANK = {"in_progress": 0, "scheduled": 1, "pending": 2, "completed": 3}


@document_viewset(tag="Eyecare", resource="eye orders")
class EyeOrderViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """Eye clinic orders (queue + CRUD)."""
    pagination_class = StandardPageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["priority", "patient", "visit", "consultation_session"]
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
        if getattr(self, 'swagger_fake_view', False):
            return EyeOrder.objects.none()
        
        qs = (
            EyeOrder.objects.select_related(
                "patient",
                "ordered_by",
                "visit",
                "visit__location_clinic",
                "consultation_session",
                "consultation_session__location_clinic",
                "consultation_session__room__clinic",
                "location_clinic",
            )
            .annotate(
                completed_sessions_count=Count(
                    "sessions",
                    filter=Q(sessions__status="completed"),
                )
            )
            .all()
        )

        params = self.request.query_params

        if self.action == "list":
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
                from common.report_period import apply_date_preset

                date_filter = (params.get("date_filter") or "today").strip().lower()
                qs = apply_date_preset(qs, date_filter, "ordered_at")

        return self.scope_queryset(qs)

    def get_serializer_class(self):
        if self.action == "create":
            return EyeOrderCreateSerializer
        return EyeOrderSerializer

    def perform_create(self, serializer):
        from common.order_location import apply_order_location_clinic

        self.auto_set_clinic(serializer)
        validated = apply_order_location_clinic(
            dict(serializer.validated_data),
            user=self.request.user,
        )
        for key, value in validated.items():
            serializer.validated_data[key] = value
        serializer.save(ordered_by=self.request.user)

    @extend_schema(tags=["Eyecare"], summary="Home dashboard", description="Single-request payload for the eye clinic home page.")
    @action(detail=False, methods=["get"], url_path="home-dashboard")
    def home_dashboard(self, request):
        """Single-request payload for the eye clinic home page."""
        day_str = (request.query_params.get("date") or "").strip()
        if day_str:
            try:
                today = date_type.fromisoformat(day_str[:10])
            except ValueError:
                today = timezone.localdate()
        else:
            today = timezone.localdate()

        scope_key = getattr(request.user, "pk", "anon")
        cache_key = f"eyecare_home:{scope_key}:{today.isoformat()}"

        def build() -> dict:
            orders_qs = self.scope_queryset(
                EyeOrder.objects.select_related(
                    "patient",
                    "ordered_by",
                    "visit",
                    "location_clinic",
                )
            )
            sessions_qs = self.scope_queryset(
                EyeSession.objects.select_related(
                    "order",
                    "order__patient",
                    "order__ordered_by",
                )
            )
            day_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
            day_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

            pending_qs = orders_qs.filter(status__in=["pending", "scheduled"])
            in_progress_qs = orders_qs.filter(status="in_progress")
            scheduled_today = orders_qs.filter(
                scheduled_at__date=today,
                status__in=["pending", "scheduled", "in_progress"],
            ).count()
            active_sessions_qs = sessions_qs.filter(status="in_progress")
            completed_today_qs = sessions_qs.filter(
                status="completed",
                completed_at__gte=day_start,
                completed_at__lte=day_end,
            )

            return {
                "date": today.isoformat(),
                "stats": {
                    "queue": pending_qs.count(),
                    "inProgress": in_progress_qs.count(),
                    "activeSessions": active_sessions_qs.count(),
                    "completedToday": completed_today_qs.count(),
                    "scheduledToday": scheduled_today,
                },
                "queuePreview": EyeOrderSerializer(
                    pending_qs.order_by("-ordered_at")[:4],
                    many=True,
                ).data,
                "inProgressOrders": EyeOrderSerializer(
                    in_progress_qs.order_by("-ordered_at")[:4],
                    many=True,
                ).data,
                "activeSessions": EyeSessionSerializer(
                    active_sessions_qs.order_by("-scheduled_at", "-created_at")[:5],
                    many=True,
                ).data,
                "recentCompletedSessions": EyeSessionSerializer(
                    completed_today_qs.order_by("-completed_at")[:5],
                    many=True,
                ).data,
            }

        return Response(cache_get_or_set(cache_key, build))

    def _orders_stats_queryset(self):
        """Orders queryset with list date filters but without status_tab."""
        qs = EyeOrder.objects.select_related(
            "patient", "ordered_by", "visit", "location_clinic"
        ).all()
        params = self.request.query_params
        after = (params.get("ordered_at_after") or "").strip()
        before = (params.get("ordered_at_before") or "").strip()
        if after or before:
            if after:
                qs = qs.filter(ordered_at__date__gte=after)
            if before:
                qs = qs.filter(ordered_at__date__lte=before)
        else:
            from common.report_period import apply_date_preset

            date_filter = (params.get("date_filter") or "today").strip().lower()
            qs = apply_date_preset(qs, date_filter, "ordered_at")
        return self.scope_queryset(qs)

    @extend_schema(tags=["Eyecare"], summary="Stats", description="Per-tab counts for eye orders (replaces 4 parallel COUNT list calls).")
    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Per-tab counts for eye orders (replaces 4 parallel COUNT list calls)."""
        qs = self._orders_stats_queryset()
        return Response({
            "pending": qs.filter(status__in=["pending", "scheduled"]).count(),
            "in_progress": qs.filter(status="in_progress").count(),
            "cancelled": qs.filter(status="cancelled").count(),
            "completed": qs.filter(status="completed").count(),
        })

    @extend_schema(tags=["Eyecare"], summary="Complete")
    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        order = self.get_object()
        order.status = "completed"
        order.completed_at = timezone.now()
        order.save(update_fields=["status", "completed_at"])
        if order.visit_id:
            from patients.models import Visit
            from patients.nursing_leg_status import (
                apply_visit_completion_after_leg,
                mark_visit_clinic_completed,
            )

            visit = Visit.objects.filter(pk=order.visit_id).first()
            if visit is not None:
                mark_visit_clinic_completed(visit, "Eye Clinic")
                apply_visit_completion_after_leg(visit)
                visit.save(update_fields=["completed_clinics", "status"])
        return Response(EyeOrderSerializer(order).data)

    @extend_schema(tags=["Eyecare"], summary="Checkins for visits")
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
                EyeOrder.objects.filter(visit_id__in=visit_ids, status__in=EYE_ORDER_LEG_STATUSES)
            )
            .order_by("-ordered_at")
        )
        best: dict[int, EyeOrder] = {}
        for o in orders:
            if not o.visit_id:
                continue
            existing = best.get(o.visit_id)
            if existing is None:
                best[o.visit_id] = o
                continue
            if EYE_ORDER_LEG_RANK.get(o.status, 9) < EYE_ORDER_LEG_RANK.get(existing.status, 9):
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

    @extend_schema(tags=["Eyecare"], summary="Checkin from visit")
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

        order = (
            self.scope_queryset(
                EyeOrder.objects.filter(
                    visit_id=visit_id,
                    patient_id=visit.patient_id,
                    status__in=ACTIVE_EYE_ORDER_STATUSES,
                )
            )
            .order_by("-ordered_at")
            .first()
        )
        created = False
        if order is None:
            from common.order_location import resolve_order_location_clinic
            from common.diagnosis_resolution import resolve_patient_diagnosis_text

            diagnosis_text = resolve_patient_diagnosis_text(visit.patient_id)
            create_kwargs = dict(
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
                diagnosis=diagnosis_text,
                treatment_plan="",
                special_instructions="",
                priority="routine",
                status="scheduled",
                scheduled_at=timezone.now(),
            )
            clinic = resolve_order_location_clinic(visit=visit, user=request.user)
            if clinic is not None:
                create_kwargs['location_clinic'] = clinic
            order = EyeOrder.objects.create(**create_kwargs)
            created = True
        elif order.status == "pending":
            order.status = "scheduled"
            if order.scheduled_at is None:
                order.scheduled_at = timezone.now()
            order.save(update_fields=["status", "scheduled_at"])

        data = EyeOrderSerializer(order).data
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@document_viewset(tag="Eyecare", resource="eye sessions")
class EyeSessionViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """Eye clinic clinical sessions."""
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    pagination_class = StandardPageNumberPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = EyeSessionFilter
    ordering_fields = ["scheduled_at", "created_at", "completed_at", "status", "session_number"]
    ordering = ["-completed_at", "-scheduled_at"]
    clinic_filter_field = 'order__location_clinic'

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return EyeSession.objects.none()
        
        return self.scope_queryset(
            EyeSession.objects.select_related("order", "order__patient", "order__ordered_by")
            .prefetch_related("diagnostic_uploads")
            .all()
        )

    def get_serializer_class(self):
        if self.action == "create":
            return EyeSessionCreateSerializer
        return EyeSessionSerializer

    @extend_schema(tags=["Eyecare"], summary="Completed stats", description="Aggregate completed-session card counts in one query.")
    @action(detail=False, methods=["get"], url_path="completed-stats")
    def completed_stats(self, request):
        """Aggregate completed-session card counts in one query."""
        from common.session_stats import aggregate_completed_session_stats

        qs = self.filter_queryset(self.get_queryset()).filter(status="completed")
        return Response(aggregate_completed_session_stats(qs, mode="eye"))

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

    @extend_schema(tags=["Eyecare"], summary="Session report pdf")
    @action(detail=True, methods=["get"], url_path="session_report_pdf")
    def session_report_pdf(self, request, pk=None):
        session = (
            EyeSession.objects.select_related(
                "order",
                "order__patient",
                "order__ordered_by",
                "order__location_clinic",
            )
            .get(pk=self.get_object().pk)
        )
        return build_eye_session_pdf_response(session)


@document_destroy_viewset(tag="Eyecare", resource="eye session diagnostic file")
class EyeSessionDiagnosticFileViewSet(mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Delete uploaded diagnostic rows (multi-upload only)."""
    queryset = EyeSessionDiagnosticFile.objects.all()
    serializer_class = EyeSessionDiagnosticFileSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        from organization.models import SystemConfig

        if SystemConfig.is_enabled('multi_clinic_enabled'):
            from accounts.utils import resolve_clinic_id

            clinic_id = resolve_clinic_id(self.request.user)
            if clinic_id is not None:
                qs = qs.filter(session__order__location_clinic_id=clinic_id)
        return qs
