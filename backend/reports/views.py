"""
Reports and Analytics views for the EMR system.
"""
from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from datetime import datetime, timedelta
from django.db.models import Count, Q, Sum, Avg, F
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
        
        try:
            total_patients = Patient.objects.filter(is_active=True).count()
        except Exception as e:
            return Response({
                'error': 'Failed to load patient demographics',
                'total_patients': 0,
                'by_category': {},
                'by_gender': {},
                'by_age_group': {},
                'by_blood_group': {},
            }, status=500)
        
        stats = {
            'total_patients': total_patients,
            'by_category': {},
            'by_gender': {},
            'by_age_group': {},
            'by_blood_group': {},
        }
        
        # By category
        try:
            for category, _ in Patient.CATEGORY_CHOICES:
                stats['by_category'][category] = Patient.objects.filter(
                    category=category,
                    is_active=True
                ).count()
        except Exception:
            # If category field doesn't exist or has issues, provide fallback
            stats['by_category'] = {
                'employee': 0,
                'dependent': 0,
                'retiree': 0,
                'nonnpa': 0,
            }
        
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


class TopDiagnosesReportView(views.APIView):
    """Get top diagnoses from consultation sessions."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        limit = int(request.query_params.get('limit', 10))
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        from consultation.models import ConsultationSession
        
        queryset = ConsultationSession.objects.filter(status='completed')
        if start_date:
            queryset = queryset.filter(ended_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(ended_at__lte=end_date)
        
        # Extract diagnoses from assessment field (assuming ICD codes or diagnosis text)
        # For now, we'll look for common patterns in the assessment field
        diagnosis_counts = {}
        total_sessions = 0
        
        for session in queryset:
            if session.assessment:
                # Try to extract diagnosis from assessment field
                # This is a simplified approach - in production, you'd have a dedicated diagnosis field
                assessment_text = session.assessment.lower()
                # Look for common diagnosis patterns (this is a placeholder)
                # In a real system, you'd parse ICD codes or structured diagnosis data
                diagnosis = assessment_text[:100] if assessment_text else 'Unspecified'
                # For demo, group by first few words of assessment
                words = assessment_text.split()[:3]
                diagnosis_key = ' '.join(words).title() if words else 'Unspecified'
                diagnosis_counts[diagnosis_key] = diagnosis_counts.get(diagnosis_key, 0) + 1
                total_sessions += 1
        
        # Sort by count and take top N
        sorted_diagnoses = sorted(diagnosis_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
        
        results = []
        for diagnosis, count in sorted_diagnoses:
            percentage = (count / total_sessions * 100) if total_sessions > 0 else 0
            results.append({
                'diagnosis': diagnosis,
                'count': count,
                'percentage': round(percentage, 1),
            })
        
        return Response(results)


class LabPerformanceReportView(views.APIView):
    """Get laboratory performance metrics."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        today = timezone.now().date()
        start_of_month = today.replace(day=1)
        
        from laboratory.models import LabOrder, LabTest
        
        # Get all tests this month
        tests_this_month = LabTest.objects.filter(
            order__ordered_at__date__gte=start_of_month
        )
        
        # Completed tests
        completed_tests = tests_this_month.filter(status='verified').count()
        total_tests = tests_this_month.count()
        completion_rate = (completed_tests / total_tests * 100) if total_tests > 0 else 0
        
        # Average turnaround time (time from ordered to verified)
        verified_tests = LabTest.objects.filter(
            status='verified',
            verified_at__isnull=False,
            order__ordered_at__isnull=False
        ).exclude(verified_at__lt=F('order__ordered_at'))[:100]  # Sample for performance
        
        avg_turnaround_hours = 0
        if verified_tests.exists():
            from django.db.models import Avg
            from django.db.models.functions import Extract
            turnaround_diffs = []
            for test in verified_tests:
                if test.verified_at and test.order.ordered_at:
                    diff = test.verified_at - test.order.ordered_at
                    turnaround_diffs.append(diff.total_seconds() / 3600)  # Convert to hours
            avg_turnaround_hours = sum(turnaround_diffs) / len(turnaround_diffs) if turnaround_diffs else 0
        
        # Critical values (tests with abnormal/critical results)
        critical_values = LabTest.objects.filter(
            status='verified',
            verified_at__date__gte=start_of_month
        ).exclude(notes__isnull=True).exclude(notes='').filter(
            notes__icontains='critical'
        ).count()
        
        stats = {
            'tests_this_month': total_tests,
            'completed_tests': completed_tests,
            'completion_rate': round(completion_rate, 1),
            'avg_turnaround_hours': round(avg_turnaround_hours, 1),
            'critical_values': critical_values,
        }
        
        return Response(stats)


class PharmacyPerformanceReportView(views.APIView):
    """Get pharmacy performance metrics."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        today = timezone.now().date()
        start_of_month = today.replace(day=1)
        
        from pharmacy.models import Prescription, MedicationInventory
        
        # Prescriptions dispensed this month
        dispensed_this_month = Prescription.objects.filter(
            dispensed_at__date__gte=start_of_month,
            status='dispensed'
        ).count()
        
        # Pending prescriptions
        pending_prescriptions = Prescription.objects.filter(status='pending').count()
        
        # Average wait time (time from prescribed to dispensed)
        dispensed_prescriptions = Prescription.objects.filter(
            status='dispensed',
            dispensed_at__isnull=False,
            prescribed_at__isnull=False
        ).exclude(dispensed_at__lt=F('prescribed_at'))[:100]  # Sample for performance
        
        avg_wait_minutes = 0
        if dispensed_prescriptions.exists():
            wait_times = []
            for rx in dispensed_prescriptions:
                if rx.dispensed_at and rx.prescribed_at:
                    diff = rx.dispensed_at - rx.prescribed_at
                    wait_times.append(diff.total_seconds() / 60)  # Convert to minutes
            avg_wait_minutes = sum(wait_times) / len(wait_times) if wait_times else 0
        
        # Low stock items
        low_stock_count = MedicationInventory.objects.filter(
            quantity__lte=F('min_stock_level')
        ).count()
        
        stats = {
            'dispensed_this_month': dispensed_this_month,
            'pending_prescriptions': pending_prescriptions,
            'avg_wait_minutes': round(avg_wait_minutes, 1),
            'low_stock_items': low_stock_count,
        }
        
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

