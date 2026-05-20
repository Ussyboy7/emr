"""
Views for the Organization app.
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Clinic, Department, Room, OutpatientClinicType, FacilityOutpatientClinic, WorkLocation
from .serializers import (
    ClinicSerializer,
    DepartmentSerializer,
    RoomSerializer,
    OutpatientClinicTypeSerializer,
    WorkLocationSerializer,
)
from audit.services import AuditService


class ClinicViewSet(viewsets.ModelViewSet):
    """ViewSet for managing clinics."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ClinicSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code', 'location']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    # Rolling window for "current activity" on the admin Clinic Status
    # tile. Lifetime counts were too broad — a doctor who consulted
    # once six months ago shouldn't show up as "active today".
    CLINIC_ACTIVITY_WINDOW_DAYS = 30

    def get_queryset(self):
        # We count *recent activity* rather than direct FKs because in
        # practice ``Patient.location_clinic`` and ``User.clinic`` are
        # rarely backfilled, but every Visit/ConsultationSession does
        # carry a clinic linkage (Visit.location_clinic and
        # ConsultationSession.room.clinic respectively). The 30-day
        # window keeps the dashboard tile honest: it reflects current
        # operational throughput, not "anyone who ever touched this
        # clinic".
        window_start = timezone.now() - timedelta(days=self.CLINIC_ACTIVITY_WINDOW_DAYS)
        window_start_date = window_start.date()
        return Clinic.objects.annotate(
            patient_count=Count(
                "visits__patient",
                filter=Q(visits__date__gte=window_start_date),
                distinct=True,
            ),
            doctor_count=Count(
                "consultation_rooms__sessions__doctor",
                filter=Q(
                    consultation_rooms__sessions__doctor__is_active=True,
                    consultation_rooms__sessions__started_at__gte=window_start,
                ),
                distinct=True,
            ),
        )
    
    def perform_create(self, serializer):
        """Create clinic and log audit."""
        clinic = serializer.save()
        types = list(
            OutpatientClinicType.objects.filter(is_active=True).order_by("sort_order", "name")
        )
        if types:
            FacilityOutpatientClinic.objects.bulk_create(
                [
                    FacilityOutpatientClinic(
                        facility=clinic,
                        clinic_type=t,
                        is_active=True,
                        sort_order=i,
                    )
                    for i, t in enumerate(types)
                ]
            )
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='clinic',
            object_id=str(clinic.id),
            module='administration',
            object_repr=clinic.name,
            description=f'Created clinic: {clinic.name}',
            new_values={'name': clinic.name, 'code': clinic.code, 'is_active': clinic.is_active},
            request=self.request,
        )
    
    def perform_update(self, serializer):
        """Update clinic and log audit."""
        old_instance = self.get_object()
        old_values = {'name': old_instance.name, 'code': old_instance.code, 'is_active': old_instance.is_active}
        clinic = serializer.save()
        new_values = {'name': clinic.name, 'code': clinic.code, 'is_active': clinic.is_active}
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='clinic',
            object_id=str(clinic.id),
            module='administration',
            object_repr=clinic.name,
            description=f'Updated clinic: {clinic.name}',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Delete clinic and log audit."""
        clinic_id = instance.id
        clinic_name = instance.name
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='clinic',
            object_id=str(clinic_id),
            module='administration',
            object_repr=clinic_name,
            description=f'Deleted clinic: {clinic_name}',
            old_values={'name': clinic_name},
            request=self.request,
        )
        instance.delete()

    @action(detail=False, methods=["get"], url_path="admin-stats")
    def admin_stats(self, request):
        """Aggregate counts for the Facilities & Departments admin KPI strip (full org, not paginated)."""
        from django.contrib.auth import get_user_model

        from consultation.models import ConsultationRoom

        User = get_user_model()

        total_clinics = Clinic.objects.count()
        active_clinics = Clinic.objects.filter(is_active=True).count()
        total_departments = Department.objects.count()

        facility_users = User.objects.filter(clinic__isnull=False, is_active=True).count()
        department_users = User.objects.filter(department__isnull=False, is_active=True).count()
        total_staff_links = facility_users + department_users

        org_rooms = Room.objects.filter(is_active=True, clinic__isnull=False).count()
        consult_rooms = ConsultationRoom.objects.filter(is_active=True, clinic__isnull=False).count()
        total_rooms = org_rooms + consult_rooms

        return Response(
            {
                "total_clinics": total_clinics,
                "active_clinics": active_clinics,
                "total_departments": total_departments,
                "total_staff_links": total_staff_links,
                "total_rooms": total_rooms,
            }
        )

    @action(detail=True, methods=["get", "put"])
    def visit_clinics(self, request, pk=None):
        """GET: OPD visit clinic types at this facility. PUT: replace offerings { type_ids: [id, ...] }."""
        facility = self.get_object()
        if request.method == "PUT":
            ids = request.data.get("type_ids")
            if not isinstance(ids, list):
                return Response({"detail": "type_ids must be a list"}, status=400)
            parsed = []
            for x in ids:
                try:
                    parsed.append(int(x))
                except (TypeError, ValueError):
                    return Response({"detail": "type_ids must be integers"}, status=400)
            unique_ids = []
            for i in parsed:
                if i not in unique_ids:
                    unique_ids.append(i)
            types = list(OutpatientClinicType.objects.filter(id__in=unique_ids))
            found = {t.id for t in types}
            if found != set(unique_ids):
                return Response({"detail": "One or more type_ids are invalid"}, status=400)
            type_by_id = {t.id: t for t in types}
            ordered = [type_by_id[i] for i in unique_ids]
            with transaction.atomic():
                FacilityOutpatientClinic.objects.filter(facility=facility).delete()
                FacilityOutpatientClinic.objects.bulk_create(
                    [
                        FacilityOutpatientClinic(
                            facility=facility,
                            clinic_type=t,
                            is_active=True,
                            sort_order=idx,
                        )
                        for idx, t in enumerate(ordered)
                    ]
                )

        qs = (
            FacilityOutpatientClinic.objects.filter(
                facility=facility, is_active=True, clinic_type__is_active=True
            )
            .select_related("clinic_type")
            .order_by("sort_order", "clinic_type__sort_order", "clinic_type__name")
        )
        return Response(
            [
                {
                    "id": o.clinic_type_id,
                    "name": o.clinic_type.name,
                    "code": o.clinic_type.code,
                }
                for o in qs
            ]
        )


class OutpatientClinicTypeViewSet(viewsets.ModelViewSet):
    """CRUD for master OPD visit clinic types (GOPD, Eye Clinic, …)."""

    permission_classes = [IsAuthenticated]
    serializer_class = OutpatientClinicTypeSerializer
    queryset = OutpatientClinicType.objects.all()
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "sort_order", "created_at"]
    ordering = ["sort_order", "name"]


class DepartmentViewSet(viewsets.ModelViewSet):
    """ViewSet for managing departments."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = DepartmentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['clinic', 'is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        return Department.objects.all().select_related('clinic', 'head')
    
    def perform_create(self, serializer):
        """Create department and log audit."""
        department = serializer.save()
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='department',
            object_id=str(department.id),
            module='administration',
            object_repr=department.name,
            description=f'Created department: {department.name}',
            new_values={'name': department.name, 'code': department.code, 'clinic_id': str(department.clinic.id) if department.clinic else None, 'is_active': department.is_active},
            request=self.request,
        )
    
    def perform_update(self, serializer):
        """Update department and log audit."""
        old_instance = self.get_object()
        old_values = {'name': old_instance.name, 'code': old_instance.code, 'is_active': old_instance.is_active}
        department = serializer.save()
        new_values = {'name': department.name, 'code': department.code, 'is_active': department.is_active}
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='department',
            object_id=str(department.id),
            module='administration',
            object_repr=department.name,
            description=f'Updated department: {department.name}',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Delete department and log audit."""
        dept_id = instance.id
        dept_name = instance.name
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='department',
            object_id=str(dept_id),
            module='administration',
            object_repr=dept_name,
            description=f'Deleted department: {dept_name}',
            old_values={'name': dept_name},
            request=self.request,
        )
        instance.delete()


class RoomViewSet(viewsets.ModelViewSet):
    """ViewSet for managing rooms."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = RoomSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['clinic', 'department', 'room_type', 'status', 'is_active']
    search_fields = ['name', 'room_number', 'location']
    ordering_fields = ['room_number', 'name']
    ordering = ['room_number']
    
    def get_queryset(self):
        return Room.objects.all().select_related('clinic', 'department')
    
    def perform_create(self, serializer):
        """Create room and log audit."""
        room = serializer.save()
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='room',
            object_id=str(room.id),
            module='administration',
            object_repr=room.name or room.room_number,
            description=f'Created room: {room.name or room.room_number}',
            new_values={'name': room.name, 'room_number': room.room_number, 'room_type': room.room_type, 'status': room.status, 'is_active': room.is_active},
            request=self.request,
        )
    
    def perform_update(self, serializer):
        """Update room and log audit."""
        old_instance = self.get_object()
        old_values = {'name': old_instance.name, 'status': old_instance.status, 'is_active': old_instance.is_active}
        room = serializer.save()
        new_values = {'name': room.name, 'status': room.status, 'is_active': room.is_active}
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='room',
            object_id=str(room.id),
            module='administration',
            object_repr=room.name or room.room_number,
            description=f'Updated room: {room.name or room.room_number}',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Delete room and log audit."""
        room_id = instance.id
        room_name = instance.name or instance.room_number
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='room',
            object_id=str(room_id),
            module='administration',
            object_repr=room_name,
            description=f'Deleted room: {room_name}',
            old_values={'name': room_name},
            request=self.request,
        )
        instance.delete()


class WorkLocationViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for employee work locations (port complexes)."""

    permission_classes = [IsAuthenticated]
    serializer_class = WorkLocationSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name"]
    ordering = ["name"]

    def get_queryset(self):
        return WorkLocation.objects.all()

