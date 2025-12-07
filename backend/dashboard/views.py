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


class DashboardStatsView(views.APIView):
    """Get dashboard statistics."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        today = timezone.now().date()
        start_of_day = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        end_of_day = timezone.make_aware(datetime.combine(today, datetime.max.time()))
        
        stats = {
            'patients': {
                'total': Patient.objects.filter(is_active=True).count(),
                'by_category': {
                    'employee': Patient.objects.filter(category='employee', is_active=True).count(),
                    'retiree': Patient.objects.filter(category='retiree', is_active=True).count(),
                    'nonnpa': Patient.objects.filter(category='nonnpa', is_active=True).count(),
                    'dependent': Patient.objects.filter(category='dependent', is_active=True).count(),
                },
                'new_today': Patient.objects.filter(created_at__date=today).count(),
            },
            'visits': {
                'total_today': Visit.objects.filter(date=today).count(),
                'scheduled': Visit.objects.filter(date=today, status='scheduled').count(),
                'in_progress': Visit.objects.filter(date=today, status='in_progress').count(),
                'completed': Visit.objects.filter(date=today, status='completed').count(),
            },
            'laboratory': {
                'pending_orders': LabOrder.objects.filter(tests__status='pending').distinct().count(),
                'pending_verification': LabTest.objects.filter(status='results_ready').count(),
                'completed_today': LabTest.objects.filter(
                    verified_at__date=today,
                    status='verified'
                ).count(),
            },
            'pharmacy': {
                'pending_prescriptions': Prescription.objects.filter(status='pending').count(),
                'dispensed_today': Prescription.objects.filter(
                    dispensed_at__date=today,
                    status='dispensed'
                ).count(),
            },
            'radiology': {
                'pending_orders': RadiologyOrder.objects.filter(
                    studies__status__in=['pending', 'scheduled']
                ).distinct().count(),
                'pending_verification': RadiologyStudy.objects.filter(status='reported').count(),
                'completed_today': RadiologyStudy.objects.filter(
                    verified_at__date=today,
                    status='verified'
                ).count(),
            },
            'consultation': {
                'active_sessions': ConsultationSession.objects.filter(status='active').count(),
                'completed_today': ConsultationSession.objects.filter(
                    ended_at__date=today,
                    status='completed'
                ).count(),
            },
            'nursing': {
                'pending_orders': NursingOrder.objects.filter(status='pending').count(),
                'in_progress': NursingOrder.objects.filter(status='in_progress').count(),
            },
        }
        
        return Response(stats)

