"""
Dashboard views for system statistics.
"""
from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from datetime import datetime, timedelta
from django.db.models import Count, Q

from patients.models import Patient, Visit
from laboratory.models import LabOrder, LabTest
from pharmacy.models import Prescription
from radiology.models import RadiologyOrder, RadiologyStudy
from consultation.models import ConsultationSession
from nursing.models import NursingOrder
from common.mixins import SCOPE_ALL, resolve_facility_scope
from common.openapi import document_api_view


@document_api_view(tag="Dashboard", summary="Module dashboard statistics")
class DashboardStatsView(views.APIView):
    """Get dashboard statistics."""
    
    def get(self, request):
        today = timezone.now().date()
        start_of_day = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        end_of_day = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        # Resolve clinic scope once; each counter below is scoped when multi-clinic
        # is enabled (``?clinic_id=<pk>`` overrides the session, ``scope=all`` is
        # leadership-only and lifts scoping entirely).
        scope = resolve_facility_scope(request)

        def scoped(qs, field="location_clinic_id"):
            if scope is None or scope == SCOPE_ALL:
                return qs
            return qs.filter(**{field: scope})

        patients_qs = scoped(Patient.objects.filter(is_active=True))
        visits_qs = scoped(Visit.objects.filter(date=today))
        lab_orders_qs = scoped(LabOrder.objects.all())
        lab_tests_qs = scoped(LabTest.objects.all(), field="order__location_clinic_id")
        prescriptions_qs = scoped(Prescription.objects.all())
        radiology_orders_qs = scoped(RadiologyOrder.objects.all())
        radiology_studies_qs = scoped(RadiologyStudy.objects.all(), field="order__location_clinic_id")
        consultation_sessions_qs = scoped(ConsultationSession.objects.all())
        nursing_orders_qs = scoped(NursingOrder.objects.all())

        stats = {
            'patients': {
                'total': patients_qs.count(),
                'by_category': {
                    'employee': patients_qs.filter(category='employee').count(),
                    'retiree': patients_qs.filter(category='retiree').count(),
                    'nonnpa': patients_qs.filter(category='nonnpa').count(),
                    'dependent': patients_qs.filter(category='dependent').count(),
                },
                'new_today': patients_qs.filter(created_at__date=today).count(),
            },
            'visits': {
                'total_today': visits_qs.count(),
                'scheduled': visits_qs.filter(status='scheduled').count(),
                'in_progress': visits_qs.filter(status='in_progress').count(),
                'completed': visits_qs.filter(status='completed').count(),
            },
            'laboratory': {
                'pending_orders': lab_orders_qs.filter(tests__status='pending').distinct().count(),
                'pending_verification': lab_tests_qs.filter(status='results_ready').count(),
                'completed_today': lab_tests_qs.filter(
                    verified_at__date=today,
                    status='verified'
                ).count(),
            },
            'pharmacy': {
                'pending_prescriptions': prescriptions_qs.filter(status='pending').count(),
                'dispensed_today': prescriptions_qs.filter(
                    dispensed_at__date=today,
                    status='dispensed'
                ).count(),
            },
            'radiology': {
                'pending_orders': radiology_orders_qs.filter(
                    studies__status__in=['pending', 'scheduled']
                ).distinct().count(),
                'pending_verification': radiology_studies_qs.filter(status='reported').count(),
                'completed_today': radiology_studies_qs.filter(
                    verified_at__date=today,
                    status='verified'
                ).count(),
            },
            'consultation': {
                'active_sessions': consultation_sessions_qs.filter(status='active').count(),
                'completed_today': consultation_sessions_qs.filter(
                    ended_at__date=today,
                    status='completed'
                ).count(),
            },
            'nursing': {
                'pending_orders': nursing_orders_qs.filter(status='pending').count(),
                'in_progress': nursing_orders_qs.filter(status='in_progress').count(),
            },
        }
        
        return Response(stats)

