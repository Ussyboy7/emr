"""
Reports and Analytics views for the EMR system.
"""
from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from datetime import datetime, timedelta
from django.db.models import Count, Q, Sum, Avg
from django.http import HttpResponse
import csv
import json

from patients.models import Patient, Visit
from laboratory.models import LabOrder, LabTest
from pharmacy.models import Prescription, MedicationInventory
from radiology.models import RadiologyOrder, RadiologyStudy


class PatientDemographicsReportView(views.APIView):
    """Generate patient demographics report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        format_type = request.query_params.get('format', 'json')
        
        stats = {
            'total_patients': Patient.objects.filter(is_active=True).count(),
            'by_category': {},
            'by_gender': {},
            'by_age_group': {},
            'by_blood_group': {},
        }
        
        # By category
        for category, _ in Patient.CATEGORY_CHOICES:
            stats['by_category'][category] = Patient.objects.filter(
                category=category,
                is_active=True
            ).count()
        
        # By gender
        for gender, _ in Patient.GENDER_CHOICES:
            stats['by_gender'][gender] = Patient.objects.filter(
                gender=gender,
                is_active=True
            ).count()
        
        # By age group
        today = timezone.now().date()
        age_groups = {
            '0-18': Patient.objects.filter(is_active=True).extra(
                where=["EXTRACT(YEAR FROM AGE(date_of_birth)) BETWEEN 0 AND 18"]
            ).count(),
            '19-35': Patient.objects.filter(is_active=True).extra(
                where=["EXTRACT(YEAR FROM AGE(date_of_birth)) BETWEEN 19 AND 35"]
            ).count(),
            '36-50': Patient.objects.filter(is_active=True).extra(
                where=["EXTRACT(YEAR FROM AGE(date_of_birth)) BETWEEN 36 AND 50"]
            ).count(),
            '51-65': Patient.objects.filter(is_active=True).extra(
                where=["EXTRACT(YEAR FROM AGE(date_of_birth)) BETWEEN 51 AND 65"]
            ).count(),
            '65+': Patient.objects.filter(is_active=True).extra(
                where=["EXTRACT(YEAR FROM AGE(date_of_birth)) > 65"]
            ).count(),
        }
        stats['by_age_group'] = age_groups
        
        # By blood group
        for bg, _ in Patient.BLOOD_GROUP_CHOICES:
            stats['by_blood_group'][bg] = Patient.objects.filter(
                blood_group=bg,
                is_active=True
            ).count()
        
        if format_type == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="patient_demographics.csv"'
            writer = csv.writer(response)
            writer.writerow(['Metric', 'Value'])
            for key, value in stats.items():
                if isinstance(value, dict):
                    for k, v in value.items():
                        writer.writerow([f"{key}_{k}", v])
                else:
                    writer.writerow([key, value])
            return response
        
        return Response(stats)


class LabStatisticsReportView(views.APIView):
    """Generate laboratory statistics report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        queryset = LabOrder.objects.all()
        if start_date:
            queryset = queryset.filter(ordered_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(ordered_at__lte=end_date)
        
        stats = {
            'total_orders': queryset.count(),
            'by_priority': {},
            'by_status': {},
            'tests_completed': LabTest.objects.filter(
                order__in=queryset,
                status='verified'
            ).count(),
            'tests_pending': LabTest.objects.filter(
                order__in=queryset,
                status__in=['pending', 'sample_collected', 'processing', 'results_ready']
            ).count(),
        }
        
        for priority, _ in LabOrder.PRIORITY_CHOICES:
            stats['by_priority'][priority] = queryset.filter(priority=priority).count()
        
        for status, _ in LabTest.STATUS_CHOICES:
            stats['by_status'][status] = LabTest.objects.filter(
                order__in=queryset,
                status=status
            ).count()
        
        return Response(stats)


class ExportDataView(views.APIView):
    """Export data to CSV/JSON."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        model_type = request.query_params.get('model', 'patient')
        format_type = request.query_params.get('format', 'json')
        
        # This is a simplified export - in production, use proper serialization
        if format_type == 'json':
            data = {'message': 'Export functionality - implement based on model_type'}
            return Response(data)
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{model_type}_export.csv"'
        writer = csv.writer(response)
        writer.writerow(['Export', 'Not', 'Implemented', 'Yet'])
        return response

