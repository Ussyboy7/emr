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
from nursing.models import NursingOrder, Procedure
from consultation.models import Referral, ConsultationSession
from django.db.models.functions import ExtractMonth, ExtractYear, TruncMonth
from django.db.models import Q


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


class AttendanceSummaryReportView(views.APIView):
    """Generate attendance summary report by patient category."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Generate attendance summary with optional date filtering."""
        from django.utils.dateparse import parse_date
        from django.db.models import Count
        
        # Parse query parameters
        year = request.query_params.get('year')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        # Build date filter
        visits_queryset = Visit.objects.filter(status__in=['completed', 'in_progress']).select_related('patient')
        
        if start_date and end_date:
            start = parse_date(start_date)
            end = parse_date(end_date)
            if start and end:
                visits_queryset = visits_queryset.filter(date__gte=start, date__lte=end)
        elif year:
            try:
                year_int = int(year)
                visits_queryset = visits_queryset.filter(date__year=year_int)
            except (ValueError, TypeError):
                pass
        else:
            # Default to current year
            current_year = timezone.now().year
            visits_queryset = visits_queryset.filter(date__year=current_year)
        
        # Get unique patients per category using distinct on patient
        # Officers
        officers_visits = visits_queryset.filter(
            patient__category='employee'
        ).exclude(patient__employee_type__isnull=True).exclude(patient__employee_type='')
        
        # Filter by employee_type containing 'Officer' (case-insensitive)
        officers_count = officers_visits.filter(
            patient__employee_type__icontains='officer'
        ).values('patient').distinct().count()
        
        # Staff (employees that are not officers)
        staff_count = officers_visits.exclude(
            patient__employee_type__icontains='officer'
        ).values('patient').distinct().count()
        
        # Employee Dependents
        emp_dep_visits = visits_queryset.filter(patient__category='dependent')
        emp_dep_count = emp_dep_visits.exclude(
            patient__dependent_type__isnull=True
        ).filter(
            patient__dependent_type__icontains='employee'
        ).values('patient').distinct().count()
        
        # Retiree Dependents
        ret_dep_count = emp_dep_visits.exclude(
            patient__dependent_type__isnull=True
        ).filter(
            patient__dependent_type__icontains='retiree'
        ).values('patient').distinct().count()
        
        # Non-NPA
        nonnpa_visits = visits_queryset.filter(patient__category='nonnpa')
        nonnpa_count = nonnpa_visits.values('patient').distinct().count()
        
        # Retirees
        retiree_visits = visits_queryset.filter(patient__category='retiree')
        retiree_count = retiree_visits.values('patient').distinct().count()
        
        # Calculate totals
        total_employee = officers_count + staff_count
        total_non_employee = emp_dep_count + ret_dep_count + nonnpa_count + retiree_count
        grand_total = total_employee + total_non_employee
        
        # Build response data
        categories = [
            {
                'sn': 1,
                'category': 'Officers',
                'employee': officers_count,
                'non_employee': 0,
                'total': officers_count,
                'percentage': round((officers_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 2,
                'category': 'Staff',
                'employee': staff_count,
                'non_employee': 0,
                'total': staff_count,
                'percentage': round((staff_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 3,
                'category': 'Employee Dependents',
                'employee': 0,
                'non_employee': emp_dep_count,
                'total': emp_dep_count,
                'percentage': round((emp_dep_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 4,
                'category': 'Retiree Dependents',
                'employee': 0,
                'non_employee': ret_dep_count,
                'total': ret_dep_count,
                'percentage': round((ret_dep_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 5,
                'category': 'Non-NPA',
                'employee': 0,
                'non_employee': nonnpa_count,
                'total': nonnpa_count,
                'percentage': round((nonnpa_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 6,
                'category': 'Retirees',
                'employee': 0,
                'non_employee': retiree_count,
                'total': retiree_count,
                'percentage': round((retiree_count / grand_total * 100) if grand_total > 0 else 0, 1)
            }
        ]
        
        # Filter out categories with 0 counts for cleaner display (optional)
        # Keep all categories for now to match NPA-EMR format
        
        return Response({
            'data': categories,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'grand_total': grand_total
            }
        })


class DispensedPrescriptionsReportView(views.APIView):
    """Generate dispensed prescriptions report by month."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year', timezone.now().year)
        try:
            year_int = int(year)
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get all dispensed prescriptions for the year
        prescriptions = Prescription.objects.filter(
            status='dispensed',
            dispensed_at__year=year_int
        ).annotate(
            month=ExtractMonth('dispensed_at')
        )
        
        # Monthly breakdown
        months = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December']
        
        monthly_data = []
        total = 0
        for i, month_name in enumerate(months, 1):
            count = prescriptions.filter(month=i).count()
            if count > 0:  # Only include months with data
                monthly_data.append({
                    'sn': len(monthly_data) + 1,
                    'month': month_name,
                    'total': count
                })
                total += count
        
        return Response({
            'data': monthly_data,
            'total': total
        })


class LaboratoryAttendanceReportView(views.APIView):
    """Generate laboratory attendance report by month and category."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year', timezone.now().year)
        try:
            year_int = int(year)
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get all lab orders for the year
        lab_orders = LabOrder.objects.filter(
            ordered_at__year=year_int
        ).select_related('patient').annotate(
            month=ExtractMonth('ordered_at')
        )
        
        months = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December']
        
        monthly_data = []
        total = 0
        
        for i, month_name in enumerate(months, 1):
            month_orders = lab_orders.filter(month=i)
            
            # Count by category (unique patients)
            officers = month_orders.filter(
                patient__category='employee',
                patient__employee_type__icontains='officer'
            ).values('patient').distinct().count()
            
            staff = month_orders.filter(
                patient__category='employee'
            ).exclude(patient__employee_type__icontains='officer').values('patient').distinct().count()
            
            dependents = month_orders.filter(
                patient__category='dependent',
                patient__dependent_type__icontains='employee'
            ).values('patient').distinct().count()
            
            retirees = month_orders.filter(
                patient__category='retiree'
            ).values('patient').distinct().count()
            
            non_npa = month_orders.filter(
                patient__category='nonnpa'
            ).values('patient').distinct().count()
            
            month_total = officers + staff + dependents + retirees + non_npa
            
            if month_total > 0:  # Only include months with data
                monthly_data.append({
                    'sn': len(monthly_data) + 1,
                    'month': month_name,
                    'officers': officers,
                    'staff': staff,
                    'dependents': dependents,
                    'retirees': retirees,
                    'non_npa': non_npa,
                    'total': month_total
                })
                total += month_total
        
        return Response({
            'data': monthly_data,
            'total': total
        })


class ServicesActivitiesReportView(views.APIView):
    """Generate services and activities report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year', timezone.now().year)
        try:
            year_int = int(year)
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get procedures for the year
        procedures = Procedure.objects.filter(
            performed_at__year=year_int
        )
        
        # Count by procedure type
        injections = procedures.filter(procedure_type='injection').count()
        dressing = procedures.filter(procedure_type='dressing').count()
        
        # Get nursing orders for sick leave tracking (if applicable)
        # For now, we'll use a simplified approach
        nursing_orders = NursingOrder.objects.filter(
            ordered_at__year=year_int,
            order_type__icontains='sick'
        ).count()
        
        # Get referrals from consultation
        referrals = Referral.objects.filter(
            created_at__year=year_int
        ).count()
        
        # Get observations (can be from consultation sessions)
        observations = ConsultationSession.objects.filter(
            started_at__year=year_int
        ).exclude(assessment='').exclude(assessment__isnull=True).count()
        
        categories = [
            {'sn': 1, 'category': 'Injections', 'count': injections},
            {'sn': 2, 'category': 'Dressing', 'count': dressing},
            {'sn': 3, 'category': 'Sick Leave', 'count': nursing_orders},
            {'sn': 4, 'category': 'Referrals', 'count': referrals},
            {'sn': 5, 'category': 'Observations', 'count': observations},
        ]
        
        # Filter out zero counts
        categories = [c for c in categories if c['count'] > 0]
        
        total = sum(c['count'] for c in categories)
        
        return Response({
            'data': categories,
            'total': total
        })


class ComprehensiveReportView(views.APIView):
    """Generate comprehensive report with all metrics."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year', timezone.now().year)
        try:
            year_int = int(year)
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Overview metrics
        visits = Visit.objects.filter(date__year=year_int, status__in=['completed', 'in_progress'])
        total_visits = visits.count()
        
        prescriptions = Prescription.objects.filter(prescribed_at__year=year_int)
        total_prescriptions = prescriptions.count()
        dispensed_prescriptions = prescriptions.filter(status='dispensed').count()
        
        lab_orders = LabOrder.objects.filter(ordered_at__year=year_int)
        total_lab_tests = LabTest.objects.filter(order__in=lab_orders).count()
        
        nursing_orders = NursingOrder.objects.filter(ordered_at__year=year_int)
        total_nursing_orders = nursing_orders.count()
        
        procedures = Procedure.objects.filter(performed_at__year=year_int)
        injections = procedures.filter(procedure_type='injection').count()
        dressing = procedures.filter(procedure_type='dressing').count()
        
        # Category breakdown (using visits)
        officers_visits = visits.filter(
            patient__category='employee',
            patient__employee_type__icontains='officer'
        ).values('patient').distinct()
        officers_count = officers_visits.count()
        
        staff_visits = visits.filter(
            patient__category='employee'
        ).exclude(patient__employee_type__icontains='officer').values('patient').distinct()
        staff_count = staff_visits.count()
        
        emp_dep_visits = visits.filter(
            patient__category='dependent',
            patient__dependent_type__icontains='employee'
        ).values('patient').distinct()
        emp_dep_count = emp_dep_visits.count()
        
        ret_dep_visits = visits.filter(
            patient__category='dependent',
            patient__dependent_type__icontains='retiree'
        ).values('patient').distinct()
        ret_dep_count = ret_dep_visits.count()
        
        nonnpa_visits = visits.filter(patient__category='nonnpa').values('patient').distinct()
        nonnpa_count = nonnpa_visits.count()
        
        # Monthly trend
        months = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December']
        
        monthly_trend = []
        for i, month_name in enumerate(months, 1):
            count = visits.filter(date__month=i).values('patient').distinct().count()
            monthly_trend.append({
                'month': month_name,
                'count': count
            })
        
        return Response({
            'year': str(year_int),
            'overview': {
                'total_visits': total_visits,
                'total_prescriptions': total_prescriptions,
                'dispensed_prescriptions': dispensed_prescriptions,
                'total_lab_tests': total_lab_tests,
                'total_nursing_orders': total_nursing_orders,
                'injections': injections,
                'dressing': dressing,
            },
            'category_breakdown': {
                'Officers': officers_count,
                'Staff': staff_count,
                'Employee Dependents': emp_dep_count,
                'Retiree Dependents': ret_dep_count,
                'Non-NPA': nonnpa_count,
            },
            'monthly_trend': monthly_trend
        })


class ClinicAttendanceReportView(views.APIView):
    """Generate clinic attendance report by clinic type."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        clinic_type = request.query_params.get('clinic_type', '')
        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        # Filter visits by clinic
        visits_queryset = Visit.objects.filter(
            status__in=['completed', 'in_progress'],
            clinic__icontains=clinic_type
        ).select_related('patient')
        
        # Apply date filtering
        if start_date_str and end_date_str:
            try:
                from django.utils.dateparse import parse_date
                start_date = parse_date(start_date_str)
                end_date = parse_date(end_date_str)
                if start_date and end_date:
                    visits_queryset = visits_queryset.filter(date__gte=start_date, date__lte=end_date)
            except (ValueError, TypeError):
                pass
        elif year:
            try:
                year_int = int(year)
                visits_queryset = visits_queryset.filter(date__year=year_int)
            except (ValueError, TypeError):
                pass
        
        # Monthly breakdown
        months = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December']
        
        monthly_data = []
        total_employee = 0
        total_non_employee = 0
        
        for i, month_name in enumerate(months, 1):
            month_visits = visits_queryset.filter(date__month=i)
            
            # Count unique employees
            employee_visits = month_visits.filter(
                Q(patient__category='employee') |
                Q(patient__category='retiree')
            ).values('patient').distinct()
            employee_count = employee_visits.count()
            
            # Count unique non-employees
            non_employee_visits = month_visits.filter(
                Q(patient__category='dependent') |
                Q(patient__category='nonnpa')
            ).values('patient').distinct()
            non_employee_count = non_employee_visits.count()
            
            month_total = employee_count + non_employee_count
            
            if month_total > 0:
                monthly_data.append({
                    'sn': len(monthly_data) + 1,
                    'month': month_name,
                    'employee': employee_count,
                    'non_employee': non_employee_count,
                    'total': month_total
                })
                total_employee += employee_count
                total_non_employee += non_employee_count
        
        grand_total = total_employee + total_non_employee
        
        return Response({
            'data': monthly_data,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'grand_total': grand_total
            }
        })


class RadiologicalServicesReportView(views.APIView):
    """Generate radiological services report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year', timezone.now().year)
        try:
            year_int = int(year)
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get radiology studies for the year
        studies = RadiologyStudy.objects.filter(
            created_at__year=year_int
        ).select_related('order__patient')
        
        # Count by modality/type
        xray_count = studies.filter(
            Q(modality__icontains='x-ray') | Q(modality__icontains='xray') | Q(procedure__icontains='x-ray')
        ).count()
        
        ecg_count = studies.filter(
            Q(modality__icontains='ecg') | Q(procedure__icontains='ecg') | Q(procedure__icontains='electrocardiogram')
        ).count()
        
        ultrasound_count = studies.filter(
            Q(modality__icontains='ultrasound') | Q(procedure__icontains='ultrasound')
        ).count()
        
        ct_count = studies.filter(
            Q(modality__icontains='ct') | Q(modality__icontains='computed tomography') | Q(procedure__icontains='ct scan')
        ).count()
        
        mri_count = studies.filter(
            Q(modality__icontains='mri') | Q(procedure__icontains='magnetic resonance')
        ).count()
        
        other_count = studies.exclude(
            Q(modality__icontains='x-ray') | Q(modality__icontains='xray') |
            Q(modality__icontains='ecg') | Q(modality__icontains='ultrasound') |
            Q(modality__icontains='ct') | Q(modality__icontains='mri')
        ).exclude(
            Q(procedure__icontains='x-ray') | Q(procedure__icontains='ecg') |
            Q(procedure__icontains='ultrasound') | Q(procedure__icontains='ct scan') |
            Q(procedure__icontains='magnetic resonance')
        ).count()
        
        total = studies.count()
        
        categories = [
            {'sn': 1, 'category': 'X-Ray', 'count': xray_count},
            {'sn': 2, 'category': 'ECG', 'count': ecg_count},
            {'sn': 3, 'category': 'Ultrasound', 'count': ultrasound_count},
            {'sn': 4, 'category': 'CT Scan', 'count': ct_count},
            {'sn': 5, 'category': 'MRI', 'count': mri_count},
            {'sn': 6, 'category': 'Other', 'count': other_count},
        ]
        
        # Filter out zero counts
        categories = [c for c in categories if c['count'] > 0]
        
        return Response({
            'data': categories,
            'total': total
        })


class ReferralTrackingReportView(views.APIView):
    """Generate referral tracking report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year', timezone.now().year)
        try:
            year_int = int(year)
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get referrals for the year
        referrals = Referral.objects.filter(
            created_at__year=year_int
        ).select_related('patient')
        
        # Count by status
        new_referrals = referrals.filter(status='sent').count()
        follow_ups = referrals.filter(status__in=['accepted', 'scheduled', 'completed']).count()
        completed = referrals.filter(status='completed').count()
        
        # Count by facility type
        internal = referrals.filter(facility_type='internal').count()
        external = referrals.filter(facility_type='external').count()
        specialist = referrals.filter(facility_type='specialist').count()
        
        total = referrals.count()
        
        return Response({
            'summary': {
                'new_referrals': new_referrals,
                'follow_ups': follow_ups,
                'completed': completed,
                'internal': internal,
                'external': external,
                'specialist': specialist,
                'total': total
            },
            'data': list(referrals.values('referral_id', 'patient__patient_id', 'status', 'facility_type', 'created_at')[:100])  # Limit to 100 for preview
        })


class DiseasePatternReportView(views.APIView):
    """Generate disease pattern report from consultation sessions."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year', timezone.now().year)
        try:
            year_int = int(year)
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get consultation sessions with assessments/diagnoses
        sessions = ConsultationSession.objects.filter(
            started_at__year=year_int,
            status='completed'
        ).exclude(
            assessment=''
        ).exclude(
            assessment__isnull=True
        ).select_related('patient')
        
        # Parse assessments to extract diagnoses
        from collections import defaultdict
        diagnosis_counts = defaultdict(lambda: {'employee': 0, 'non_employee': 0})
        
        for session in sessions:
            # Extract diagnosis from assessment field
            # Simple extraction - in real implementation, might need more sophisticated parsing
            assessment_text = session.assessment.lower()
            
            # Common diagnosis keywords (simplified - would use proper ICD-10 parsing in production)
            is_employee = session.patient.category in ['employee', 'retiree']
            
            # Try to extract diagnosis from assessment
            # This is a simplified version - in production, you'd parse structured diagnosis data
            if assessment_text:
                # For now, use the first line or first sentence as diagnosis
                diagnosis = session.assessment.split('\n')[0].split('.')[0].strip()
                if len(diagnosis) > 3:  # Only count if it's meaningful
                    if is_employee:
                        diagnosis_counts[diagnosis]['employee'] += 1
                    else:
                        diagnosis_counts[diagnosis]['non_employee'] += 1
        
        # Sort by total count and get top 15
        sorted_diagnoses = sorted(
            diagnosis_counts.items(),
            key=lambda x: x[1]['employee'] + x[1]['non_employee'],
            reverse=True
        )[:15]
        
        result = []
        for idx, (diagnosis, counts) in enumerate(sorted_diagnoses, 1):
            total = counts['employee'] + counts['non_employee']
            result.append({
                'sn': idx,
                'diagnosis': diagnosis,
                'employee': counts['employee'],
                'non_employee': counts['non_employee'],
                'total': total
            })
        
        grand_total_e = sum(item['employee'] for item in result)
        grand_total_ne = sum(item['non_employee'] for item in result)
        
        return Response({
            'data': result,
            'summary': {
                'total_employee': grand_total_e,
                'total_non_employee': grand_total_ne,
                'grand_total': grand_total_e + grand_total_ne
            }
        })


class GOPAttendanceReportView(views.APIView):
    """Generate General Outpatient (G.O.P) attendance report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year', timezone.now().year)
        try:
            year_int = int(year)
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # G.O.P typically means general outpatient visits (consultation type, general clinic, or routine visits)
        visits = Visit.objects.filter(
            date__year=year_int,
            status__in=['completed', 'in_progress']
        ).filter(
            Q(visit_type='consultation') | Q(clinic__icontains='general') | Q(clinic__icontains='outpatient')
        ).select_related('patient').annotate(
            month=ExtractMonth('date')
        )
        
        months = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December']
        
        monthly_data = []
        totals = {'officers': 0, 'staff': 0, 'dependents': 0, 'retirees': 0, 'police': 0, 'non_npa': 0}
        
        for i, month_name in enumerate(months, 1):
            month_visits = visits.filter(month=i)
            
            # Count by category (unique patients)
            officers = month_visits.filter(
                patient__category='employee',
                patient__employee_type__icontains='officer'
            ).values('patient').distinct().count()
            
            staff = month_visits.filter(
                patient__category='employee'
            ).exclude(patient__employee_type__icontains='officer').values('patient').distinct().count()
            
            dependents = month_visits.filter(
                patient__category='dependent',
                patient__dependent_type__icontains='employee'
            ).values('patient').distinct().count()
            
            retirees = month_visits.filter(
                patient__category='retiree'
            ).values('patient').distinct().count()
            
            police = month_visits.filter(
                patient__category='nonnpa',
                patient__nonnpa_type__icontains='police'
            ).values('patient').distinct().count()
            
            non_npa = month_visits.filter(
                patient__category='nonnpa'
            ).exclude(patient__nonnpa_type__icontains='police').values('patient').distinct().count()
            
            month_total = officers + staff + dependents + retirees + police + non_npa
            
            if month_total > 0:
                monthly_data.append({
                    'sn': len(monthly_data) + 1,
                    'month': month_name,
                    'officers': officers,
                    'staff': staff,
                    'dependents': dependents,
                    'retirees': retirees,
                    'police': police,
                    'non_npa': non_npa,
                    'total': month_total
                })
                totals['officers'] += officers
                totals['staff'] += staff
                totals['dependents'] += dependents
                totals['retirees'] += retirees
                totals['police'] += police
                totals['non_npa'] += non_npa
        
        grand_total = sum(totals.values())
        
        return Response({
            'data': monthly_data,
            'totals': totals,
            'grand_total': grand_total
        })


class WeekendCallDutyReportView(views.APIView):
    """Generate weekend call duty report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year', timezone.now().year)
        try:
            year_int = int(year)
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get visits on weekends (Saturday=5, Sunday=6)
        # Database-agnostic approach: filter all visits, then filter by weekday in Python
        all_visits = Visit.objects.filter(
            date__year=year_int,
            status__in=['completed', 'in_progress']
        ).select_related('patient')
        
        # Filter for weekends (Saturday=5, Sunday=6 in Python weekday())
        weekend_visit_ids = []
        for visit in all_visits:
            weekday = visit.date.weekday()  # Monday=0, Sunday=6
            if weekday in [5, 6]:  # Saturday=5, Sunday=6
                weekend_visit_ids.append(visit.id)
        
        visits = Visit.objects.filter(id__in=weekend_visit_ids).select_related('patient')
        
        # Count by category
        officers = visits.filter(
            patient__category='employee',
            patient__employee_type__icontains='officer'
        ).values('patient').distinct().count()
        
        staff = visits.filter(
            patient__category='employee'
        ).exclude(patient__employee_type__icontains='officer').values('patient').distinct().count()
        
        dependents = visits.filter(
            patient__category='dependent'
        ).values('patient').distinct().count()
        
        retirees = visits.filter(
            patient__category='retiree'
        ).values('patient').distinct().count()
        
        non_npa = visits.filter(
            patient__category='nonnpa'
        ).values('patient').distinct().count()
        
        total = visits.values('patient').distinct().count()
        
        # Monthly breakdown
        months = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December']
        
        monthly_data = []
        for i, month_name in enumerate(months, 1):
            month_visits = visits.filter(date__month=i).values('patient').distinct().count()
            if month_visits > 0:
                monthly_data.append({
                    'sn': len(monthly_data) + 1,
                    'month': month_name,
                    'count': month_visits
                })
        
        return Response({
            'summary': {
                'officers': officers,
                'staff': staff,
                'dependents': dependents,
                'retirees': retirees,
                'non_npa': non_npa,
                'total': total
            },
            'monthly_data': monthly_data
        })

