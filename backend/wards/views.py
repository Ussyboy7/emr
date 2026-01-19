"""
Views for the Wards app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Ward, Bed, PatientAdmission, WardAssignment
from .serializers import WardSerializer, BedSerializer, PatientAdmissionSerializer, WardAssignmentSerializer
from audit.services import AuditService


class WardViewSet(viewsets.ModelViewSet):
    """ViewSet for managing wards."""

    permission_classes = [IsAuthenticated]
    serializer_class = WardSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['ward_type', 'status', 'floor', 'building']
    search_fields = ['name', 'ward_code', 'description']
    ordering_fields = ['name', 'ward_code', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        return Ward.objects.all().prefetch_related('beds')

    def perform_create(self, serializer):
        ward = serializer.save(created_by=self.request.user)

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='ward',
            object_id=str(ward.id),
            module='wards',
            object_repr=f'Ward {ward.ward_code}',
            description=f'Created ward {ward.name} ({ward.ward_code})',
            new_values={'ward_code': ward.ward_code, 'name': ward.name, 'ward_type': ward.ward_type},
            request=self.request,
        )

    @action(detail=True, methods=['get'])
    def beds(self, request, pk=None):
        """Get all beds in a ward."""
        ward = self.get_object()
        beds = ward.beds.all()
        serializer = BedSerializer(beds, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def occupancy(self, request, pk=None):
        """Get ward occupancy information."""
        ward = self.get_object()
        return Response({
            'ward_code': ward.ward_code,
            'name': ward.name,
            'total_beds': ward.total_beds,
            'occupied_beds': ward.occupied_beds,
            'available_beds': ward.available_beds,
            'occupancy_rate': ward.occupancy_rate,
            'status': ward.status,
        })


class BedViewSet(viewsets.ModelViewSet):
    """ViewSet for managing beds."""

    permission_classes = [IsAuthenticated]
    serializer_class = BedSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['ward', 'bed_type', 'status']
    search_fields = ['bed_number']
    ordering_fields = ['bed_number', 'created_at']
    ordering = ['bed_number']

    def get_queryset(self):
        return Bed.objects.all().select_related('ward', 'current_patient')

    def perform_create(self, serializer):
        bed = serializer.save()

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='bed',
            object_id=str(bed.id),
            module='wards',
            object_repr=f'Bed {bed.bed_number}',
            description=f'Created bed {bed.bed_number} in ward {bed.ward.name}',
            new_values={'bed_number': bed.bed_number, 'ward': bed.ward.name, 'bed_type': bed.bed_type},
            request=self.request,
        )

    @action(detail=True, methods=['post'])
    def assign_patient(self, request, pk=None):
        """Assign a patient to this bed."""
        bed = self.get_object()
        patient_id = request.data.get('patient_id')
        admission_date = request.data.get('admission_date')

        try:
            bed.assign_patient(patient_id, admission_date)

            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='bed',
                object_id=str(bed.id),
                module='wards',
                object_repr=f'Bed {bed.bed_number}',
                description=f'Assigned patient to bed {bed.bed_number}',
                old_values={'status': 'available'},
                new_values={'status': 'occupied', 'current_patient': patient_id},
                request=self.request,
            )

            return Response({'message': 'Patient assigned to bed successfully'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def discharge_patient(self, request, pk=None):
        """Discharge patient from this bed."""
        bed = self.get_object()

        try:
            bed.discharge_patient()

            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='bed',
                object_id=str(bed.id),
                module='wards',
                object_repr=f'Bed {bed.bed_number}',
                description=f'Discharged patient from bed {bed.bed_number}',
                old_values={'status': 'occupied'},
                new_values={'status': 'available'},
                request=self.request,
            )

            return Response({'message': 'Patient discharged from bed successfully'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PatientAdmissionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing patient admissions."""

    permission_classes = [IsAuthenticated]
    serializer_class = PatientAdmissionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'ward', 'bed', 'status', 'admission_type', 'admitting_doctor']
    search_fields = ['admission_id', 'admission_diagnosis', 'presenting_complaint']
    ordering_fields = ['admission_date', 'created_at']
    ordering = ['-admission_date']

    def get_queryset(self):
        return PatientAdmission.objects.all().select_related(
            'patient', 'visit', 'ward', 'bed', 'admitting_doctor',
            'discharge_doctor', 'nursing_order', 'transfer_to_ward'
        )

    def perform_create(self, serializer):
        admission = serializer.save(created_by=self.request.user)

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='admission',
            object_id=str(admission.id),
            module='wards',
            object_repr=f'Admission {admission.admission_id}',
            description=f'Admitted patient {admission.patient.get_full_name()} to ward {admission.ward.name}',
            new_values={
                'admission_id': admission.admission_id,
                'patient': admission.patient.get_full_name(),
                'ward': admission.ward.name
            },
            request=self.request,
        )

    @action(detail=True, methods=['post'])
    def discharge(self, request, pk=None):
        """Discharge a patient."""
        admission = self.get_object()
        discharge_data = request.data

        try:
            admission.discharge_patient(
                discharge_type=discharge_data.get('discharge_type', 'regular'),
                discharge_doctor=request.user,
                discharge_diagnosis=discharge_data.get('discharge_diagnosis'),
                discharge_notes=discharge_data.get('discharge_notes'),
                discharge_summary=discharge_data.get('discharge_summary'),
                follow_up_instructions=discharge_data.get('follow_up_instructions'),
            )

            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='admission',
                object_id=str(admission.id),
                module='wards',
                object_repr=f'Admission {admission.admission_id}',
                description=f'Discharged patient {admission.patient.get_full_name()} from ward {admission.ward.name}',
                old_values={'status': 'admitted'},
                new_values={'status': 'discharged', 'discharge_type': discharge_data.get('discharge_type')},
                request=self.request,
            )

            return Response({'message': 'Patient discharged successfully'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def transfer(self, request, pk=None):
        """Transfer patient to another ward."""
        admission = self.get_object()
        transfer_data = request.data

        try:
            new_ward_id = transfer_data.get('new_ward_id')
            transfer_reason = transfer_data.get('transfer_reason', '')

            if not new_ward_id:
                return Response({'error': 'New ward ID is required'}, status=status.HTTP_400_BAD_REQUEST)

            new_ward = Ward.objects.get(id=new_ward_id)

            # Update admission
            admission.transfer_to_ward = new_ward
            admission.transfer_reason = transfer_reason
            admission.status = 'transferred'
            admission.save()

            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='admission',
                object_id=str(admission.id),
                module='wards',
                object_repr=f'Admission {admission.admission_id}',
                description=f'Transferred patient {admission.patient.get_full_name()} from {admission.ward.name} to {new_ward.name}',
                old_values={'ward': admission.ward.name, 'status': 'admitted'},
                new_values={'transfer_to_ward': new_ward.name, 'status': 'transferred'},
                request=self.request,
            )

            return Response({'message': 'Patient transferred successfully'})
        except Ward.DoesNotExist:
            return Response({'error': 'New ward not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WardAssignmentViewSet(viewsets.ModelViewSet):
    """ViewSet for managing ward assignments."""

    permission_classes = [IsAuthenticated]
    serializer_class = WardAssignmentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['admission', 'nurse', 'assignment_type', 'status']
    search_fields = ['responsibilities', 'shift_notes']
    ordering_fields = ['assigned_at', 'completed_at']
    ordering = ['-assigned_at']

    def get_queryset(self):
        return WardAssignment.objects.all().select_related('admission__patient', 'admission__ward', 'nurse', 'assigned_by')

    def perform_create(self, serializer):
        assignment = serializer.save(assigned_by=self.request.user)

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='ward_assignment',
            object_id=str(assignment.id),
            module='wards',
            object_repr=f'Assignment {assignment.assignment_type}',
            description=f'Assigned nurse {assignment.nurse.get_full_name()} to patient {assignment.admission.patient.get_full_name()}',
            new_values={
                'nurse': assignment.nurse.get_full_name(),
                'patient': assignment.admission.patient.get_full_name(),
                'assignment_type': assignment.assignment_type
            },
            request=self.request,
        )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark assignment as completed."""
        assignment = self.get_object()
        notes = request.data.get('notes', '')

        try:
            assignment.complete_assignment(notes)

            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='ward_assignment',
                object_id=str(assignment.id),
                module='wards',
                object_repr=f'Assignment {assignment.assignment_type}',
                description=f'Completed ward assignment for nurse {assignment.nurse.get_full_name()}',
                old_values={'status': 'active'},
                new_values={'status': 'completed'},
                request=self.request,
            )

            return Response({'message': 'Assignment completed successfully'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)