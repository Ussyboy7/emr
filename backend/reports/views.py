"""
Reports and Analytics views for the EMR system.
"""
from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from datetime import datetime, timedelta
from django.db.models import Count, Q, Sum, Avg, F, OuterRef, Subquery, DateField
from django.http import HttpResponse
import csv
import json

from patients.models import Patient, Visit, MedicalCertificate
from laboratory.models import LabOrder, LabTest
from pharmacy.models import Prescription, MedicationInventory, PrescriptionItem, Dispense
from radiology.models import RadiologyOrder, RadiologyStudy
from nursing.models import NursingOrder, Procedure
from consultation.models import Referral, ConsultationSession
from django.db.models.functions import ExtractMonth, ExtractYear, TruncMonth, TruncDay, TruncWeek


def _resolve_period_bounds(year=None, start_date=None, end_date=None, default_to_current_year=False):
    """Resolve report period bounds as dates."""
    if start_date and end_date:
        return start_date, end_date

    if year:
        try:
            year_int = int(year)
            return datetime(year_int, 1, 1).date(), datetime(year_int, 12, 31).date()
        except (ValueError, TypeError):
            pass

    if default_to_current_year:
        current_year = timezone.now().year
        return datetime(current_year, 1, 1).date(), datetime(current_year, 12, 31).date()

    return None, None


def _build_visit_lifecycle_summary(period_visits_queryset, history_visits_queryset, start_date, end_date):
    """
    Build patient lifecycle metrics for a visit cohort.

    - new_registrations: patients seen in period who were registered in period
    - first_time_patients: patients whose earliest scoped visit falls in period
    - returning_patients: seen in period but earliest scoped visit was before period
    """
    patient_ids = period_visits_queryset.values_list('patient_id', flat=True).distinct()
    patients_qs = Patient.objects.filter(id__in=patient_ids)

    if not start_date or not end_date:
        total_seen = patients_qs.count()
        return {
            'new_registrations': 0,
            'first_time_patients': 0,
            'returning_patients': total_seen,
            'total_unique_patients_seen': total_seen,
            'total_visits': period_visits_queryset.count(),
        }

    first_visit_date_subquery = history_visits_queryset.filter(
        patient=OuterRef('pk')
    ).order_by('date', 'time', 'created_at', 'id').values('date')[:1]

    patients_qs = patients_qs.annotate(
        first_scoped_visit_date=Subquery(first_visit_date_subquery, output_field=DateField())
    )

    total_seen = patients_qs.count()
    first_time_patients = patients_qs.filter(
        first_scoped_visit_date__gte=start_date,
        first_scoped_visit_date__lte=end_date,
    ).count()
    new_registrations = patients_qs.filter(
        created_at__date__gte=start_date,
        created_at__date__lte=end_date,
    ).count()

    return {
        'new_registrations': new_registrations,
        'first_time_patients': first_time_patients,
        'returning_patients': max(total_seen - first_time_patients, 0),
        'total_unique_patients_seen': total_seen,
        'total_visits': period_visits_queryset.count(),
    }


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

        # Use structured diagnoses (ICD-10) instead of parsing free-text assessment.
        from consultation.models import Diagnosis

        qs = Diagnosis.objects.filter(
            session__status='completed',
            icd10_code__isnull=False,
        )

        # Filter by consultation session period (ended_at), if supplied.
        if start_date:
            qs = qs.filter(session__ended_at__gte=start_date)
        if end_date:
            qs = qs.filter(session__ended_at__lte=end_date)

        total = qs.count()
        aggregated = (
            qs.values(
                code=F('icd10_code__code'),
                description=F('icd10_code__description'),
            )
            .annotate(count=Count('id'))
            .order_by('-count')[:limit]
        )

        results = []
        for row in aggregated:
            code = row.get('code') or 'UNSPECIFIED'
            description = row.get('description') or ''
            count = row.get('count') or 0
            percentage = (count / total * 100) if total > 0 else 0
            results.append({
                # Keep `diagnosis` for backward compatibility with existing frontend code.
                'diagnosis': f"{code} - {description}" if description else code,
                'code': code,
                'description': description,
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
        
        # Parse query parameters
        year = request.query_params.get('year')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        parsed_start_date = parse_date(start_date) if start_date else None
        parsed_end_date = parse_date(end_date) if end_date else None
        
        # Build date filter
        history_queryset = Visit.objects.filter(status__in=['completed', 'in_progress']).select_related('patient')
        visits_queryset = history_queryset
        
        if start_date and end_date:
            if parsed_start_date and parsed_end_date:
                visits_queryset = visits_queryset.filter(date__gte=parsed_start_date, date__lte=parsed_end_date)
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

        period_start, period_end = _resolve_period_bounds(
            year=year,
            start_date=parsed_start_date,
            end_date=parsed_end_date,
            default_to_current_year=True,
        )
        lifecycle_summary = _build_visit_lifecycle_summary(
            period_visits_queryset=visits_queryset,
            history_visits_queryset=history_queryset,
            start_date=period_start,
            end_date=period_end,
        )
        
        # Get unique patients per category using a single, consistent cohort.
        # This ensures summary KPIs and table totals are derived from the same dataset.
        employee_visits = visits_queryset.filter(patient__category='employee')
        officers_visits = employee_visits.exclude(
            patient__employee_type__isnull=True
        ).exclude(
            patient__employee_type=''
        ).filter(
            patient__employee_type__icontains='officer'
        )
        staff_visits = employee_visits.exclude(
            patient__employee_type__icontains='officer'
        )
        dependents_visits = visits_queryset.filter(patient__category='dependent')
        emp_dep_visits = dependents_visits.exclude(
            patient__dependent_type__isnull=True
        ).filter(
            patient__dependent_type__icontains='employee'
        )
        ret_dep_visits = dependents_visits.exclude(
            patient__dependent_type__isnull=True
        ).filter(
            patient__dependent_type__icontains='retiree'
        )
        nonnpa_visits = visits_queryset.filter(patient__category='nonnpa')
        retiree_visits = visits_queryset.filter(patient__category='retiree')

        officers_count = officers_visits.values('patient').distinct().count()
        officers_male = officers_visits.filter(patient__gender='male').values('patient').distinct().count()
        officers_female = officers_visits.filter(patient__gender='female').values('patient').distinct().count()

        staff_count = staff_visits.values('patient').distinct().count()
        staff_male = staff_visits.filter(patient__gender='male').values('patient').distinct().count()
        staff_female = staff_visits.filter(patient__gender='female').values('patient').distinct().count()

        emp_dep_count = emp_dep_visits.values('patient').distinct().count()
        emp_dep_male = emp_dep_visits.filter(patient__gender='male').values('patient').distinct().count()
        emp_dep_female = emp_dep_visits.filter(patient__gender='female').values('patient').distinct().count()

        ret_dep_count = ret_dep_visits.values('patient').distinct().count()
        ret_dep_male = ret_dep_visits.filter(patient__gender='male').values('patient').distinct().count()
        ret_dep_female = ret_dep_visits.filter(patient__gender='female').values('patient').distinct().count()

        nonnpa_count = nonnpa_visits.values('patient').distinct().count()
        nonnpa_male = nonnpa_visits.filter(patient__gender='male').values('patient').distinct().count()
        nonnpa_female = nonnpa_visits.filter(patient__gender='female').values('patient').distinct().count()
        
        retiree_count = retiree_visits.values('patient').distinct().count()
        retiree_male = retiree_visits.filter(patient__gender='male').values('patient').distinct().count()
        retiree_female = retiree_visits.filter(patient__gender='female').values('patient').distinct().count()
        
        # Calculate totals
        total_employee = officers_count + staff_count
        total_non_employee = emp_dep_count + ret_dep_count + nonnpa_count + retiree_count
        grand_total = total_employee + total_non_employee
        
        # Calculate gender totals
        total_male = officers_male + staff_male + emp_dep_male + ret_dep_male + nonnpa_male + retiree_male
        total_female = officers_female + staff_female + emp_dep_female + ret_dep_female + nonnpa_female + retiree_female
        
        # Restrict lifecycle summary to the same category cohort shown in table totals.
        cohort_patient_ids = (
            list(officers_visits.values_list('patient_id', flat=True).distinct()) +
            list(staff_visits.values_list('patient_id', flat=True).distinct()) +
            list(emp_dep_visits.values_list('patient_id', flat=True).distinct()) +
            list(ret_dep_visits.values_list('patient_id', flat=True).distinct()) +
            list(nonnpa_visits.values_list('patient_id', flat=True).distinct()) +
            list(retiree_visits.values_list('patient_id', flat=True).distinct())
        )
        cohort_history_queryset = history_queryset.filter(patient_id__in=cohort_patient_ids)
        cohort_period_queryset = visits_queryset.filter(patient_id__in=cohort_patient_ids)
        lifecycle_summary = _build_visit_lifecycle_summary(
            period_visits_queryset=cohort_period_queryset,
            history_visits_queryset=cohort_history_queryset,
            start_date=period_start,
            end_date=period_end,
        )
        
        # Build response data
        categories = [
            {
                'sn': 1,
                'category': 'Officers',
                'employee': officers_count,
                'non_employee': 0,
                'male': officers_male,
                'female': officers_female,
                'total': officers_count,
                'percentage': round((officers_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 2,
                'category': 'Staff',
                'employee': staff_count,
                'non_employee': 0,
                'male': staff_male,
                'female': staff_female,
                'total': staff_count,
                'percentage': round((staff_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 3,
                'category': 'Employee Dependents',
                'employee': 0,
                'non_employee': emp_dep_count,
                'male': emp_dep_male,
                'female': emp_dep_female,
                'total': emp_dep_count,
                'percentage': round((emp_dep_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 4,
                'category': 'Retiree Dependents',
                'employee': 0,
                'non_employee': ret_dep_count,
                'male': ret_dep_male,
                'female': ret_dep_female,
                'total': ret_dep_count,
                'percentage': round((ret_dep_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 5,
                'category': 'Non-NPA',
                'employee': 0,
                'non_employee': nonnpa_count,
                'male': nonnpa_male,
                'female': nonnpa_female,
                'total': nonnpa_count,
                'percentage': round((nonnpa_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 6,
                'category': 'Retirees',
                'employee': 0,
                'non_employee': retiree_count,
                'male': retiree_male,
                'female': retiree_female,
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
                'total_male': total_male,
                'total_female': total_female,
                'grand_total': grand_total,
                **lifecycle_summary,
            }
        })


class VisitStatisticsReportView(views.APIView):
    """Visit statistics grouped by day/week/month with status breakdown."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils.dateparse import parse_date

        year = request.query_params.get('year')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        group_by = request.query_params.get('group_by', 'month')
        parsed_start = parse_date(start_date) if start_date else None
        parsed_end = parse_date(end_date) if end_date else None

        period_start, period_end = _resolve_period_bounds(
            year=year,
            start_date=parsed_start,
            end_date=parsed_end,
            default_to_current_year=True,
        )

        visits = Visit.objects.filter(
            date__gte=period_start, date__lte=period_end
        )

        trunc_fn = {'day': TruncDay, 'week': TruncWeek, 'month': TruncMonth}.get(group_by, TruncMonth)

        period_annotation = trunc_fn('date')

        grouped = visits.annotate(
            period=period_annotation
        ).values('period').annotate(
            completed=Count('id', filter=Q(status='completed')),
            cancelled=Count('id', filter=Q(status='cancelled')),
            in_progress=Count('id', filter=Q(status='in_progress')),
            scheduled=Count('id', filter=Q(status__in=['scheduled', 'pending'])),
            total=Count('id'),
            male=Count('id', filter=Q(patient__gender='male')),
            female=Count('id', filter=Q(patient__gender='female')),
            employee=Count('id', filter=Q(patient__category='employee')),
            non_employee=Count('id', filter=~Q(patient__category='employee')),
            officer=Count('id', filter=Q(patient__category='employee', patient__employee_type__icontains='officer')),
            staff=Count('id', filter=Q(patient__category='employee') & ~Q(patient__employee_type__icontains='officer')),
            emp_dependent=Count('id', filter=Q(patient__category='dependent', patient__dependent_type__icontains='employee')),
            ret_dependent=Count('id', filter=Q(patient__category='dependent', patient__dependent_type__icontains='retiree')),
            nonnpa=Count('id', filter=Q(patient__category='nonnpa')),
            retiree=Count('id', filter=Q(patient__category='retiree')),
        ).order_by('period')

        def format_label(dt, group):
            if group == 'day':
                return dt.strftime('%b %d, %Y')
            elif group == 'week':
                start_of_week = dt
                end_of_week = dt + timedelta(days=6)
                return f"{start_of_week.strftime('%b %d')} - {end_of_week.strftime('%b %d, %Y')}"
            return dt.strftime('%b %Y')

        data = []
        for entry in grouped:
            period_val = entry['period']
            if period_val is None:
                continue
            data.append({
                'period': period_val.isoformat(),
                'period_label': format_label(period_val, group_by),
                'completed': entry['completed'],
                'cancelled': entry['cancelled'],
                'in_progress': entry['in_progress'],
                'scheduled': entry['scheduled'],
                'total': entry['total'],
                'male': entry['male'],
                'female': entry['female'],
                'employee': entry['employee'],
                'non_employee': entry['non_employee'],
                'officer': entry['officer'],
                'staff': entry['staff'],
                'emp_dependent': entry['emp_dependent'],
                'ret_dependent': entry['ret_dependent'],
                'nonnpa': entry['nonnpa'],
                'retiree': entry['retiree'],
            })

        totals = visits.aggregate(
            completed=Count('id', filter=Q(status='completed')),
            cancelled=Count('id', filter=Q(status='cancelled')),
            in_progress=Count('id', filter=Q(status='in_progress')),
            scheduled=Count('id', filter=Q(status__in=['scheduled', 'pending'])),
            total=Count('id'),
            male=Count('id', filter=Q(patient__gender='male')),
            female=Count('id', filter=Q(patient__gender='female')),
            employee=Count('id', filter=Q(patient__category='employee')),
            non_employee=Count('id', filter=~Q(patient__category='employee')),
            officer=Count('id', filter=Q(patient__category='employee', patient__employee_type__icontains='officer')),
            staff=Count('id', filter=Q(patient__category='employee') & ~Q(patient__employee_type__icontains='officer')),
            emp_dependent=Count('id', filter=Q(patient__category='dependent', patient__dependent_type__icontains='employee')),
            ret_dependent=Count('id', filter=Q(patient__category='dependent', patient__dependent_type__icontains='retiree')),
            nonnpa=Count('id', filter=Q(patient__category='nonnpa')),
            retiree=Count('id', filter=Q(patient__category='retiree')),
        )

        return Response({
            'data': data,
            'summary': totals,
        })


class DispensedPrescriptionsReportView(views.APIView):
    """Generate dispensed prescriptions report by month."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        from django.utils.dateparse import parse_date

        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None
        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get all dispensed prescriptions for the selected period
        prescriptions = Prescription.objects.filter(
            status='dispensed',
            dispensed_at__isnull=False,
        ).select_related('patient').annotate(
            month=ExtractMonth('dispensed_at'),
        )
        if parsed_start_date and parsed_end_date:
            prescriptions = prescriptions.filter(
                dispensed_at__date__gte=parsed_start_date,
                dispensed_at__date__lte=parsed_end_date,
            )
        else:
            prescriptions = prescriptions.filter(dispensed_at__year=year_int)
        
        # Monthly breakdown
        # If user selected a date range within the same year, return every month in that span (even if 0)
        # so the UI doesn't look like data is "missing".
        months = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December']
        
        monthly_data = []
        total = 0

        if parsed_start_date and parsed_end_date and parsed_start_date.year == parsed_end_date.year:
            month_indices_to_show = list(range(parsed_start_date.month, parsed_end_date.month + 1))
            for month_index in month_indices_to_show:
                month_name = months[month_index - 1]
                count = prescriptions.filter(month=month_index).count()
                monthly_data.append({
                    'sn': len(monthly_data) + 1,
                    'month': month_name,
                    'total': count,
                })
                total += count
        else:
            # Default: only include months with data (matches the older "year" report behavior).
            for i, month_name in enumerate(months, 1):
                count = prescriptions.filter(month=i).count()
                if count > 0:
                    monthly_data.append({
                        'sn': len(monthly_data) + 1,
                        'month': month_name,
                        'total': count,
                    })
                    total += count
        
        male_patients = prescriptions.filter(patient__gender='male').values('patient_id').distinct().count()
        female_patients = prescriptions.filter(patient__gender='female').values('patient_id').distinct().count()
        grand_total_patients = male_patients + female_patients

        # Add percentage per month based on total dispensed prescriptions.
        for row in monthly_data:
            row['percentage'] = round((row['total'] / total * 100) if total > 0 else 0, 1)

        # Dispensed items breakdown (e.g., Paracetamol quantities dispensed)
        from django.db.models.functions import Coalesce
        from django.db.models import Value as DjangoValue

        # Get dispensed items that have associated Dispense records
        dispensed_item_ids = Dispense.objects.filter(
            dispensed_at__isnull=False
        ).values_list('prescription_item_id', flat=True).distinct()

        dispensed_items_qs = PrescriptionItem.objects.select_related(
            'medication',
            'generic',
            'prescription',
        ).filter(
            id__in=dispensed_item_ids,
            dispensed_quantity__gt=0,
        )

        # Filter by dispense date
        if parsed_start_date and parsed_end_date:
            dispense_ids = Dispense.objects.filter(
                dispensed_at__date__gte=parsed_start_date,
                dispensed_at__date__lte=parsed_end_date,
            ).values_list('prescription_item_id', flat=True).distinct()
            dispensed_items_qs = dispensed_items_qs.filter(id__in=dispense_ids)
        else:
            dispense_ids = Dispense.objects.filter(
                dispensed_at__year=year_int
            ).values_list('prescription_item_id', flat=True).distinct()
            dispensed_items_qs = dispensed_items_qs.filter(id__in=dispense_ids)

        dispensed_items_rows = (
            dispensed_items_qs
            .annotate(
                item_name=Coalesce('medication__name', 'generic__name', DjangoValue('Unknown')),
            )
            .values('item_name', 'unit')
            .annotate(total_dispensed_quantity=Sum('dispensed_quantity'))
            .order_by('-total_dispensed_quantity', 'item_name')[:200]
        )

        dispensed_items = []
        for idx, row in enumerate(dispensed_items_rows, 1):
            dispensed_items.append({
                'sn': idx,
                'medication': row.get('item_name') or 'Unknown',
                'unit': row.get('unit') or '',
                'quantity_dispensed': float(row.get('total_dispensed_quantity') or 0),
            })
        
        return Response({
            'data': monthly_data,
            'summary': {
                'total': total,
                'total_male': male_patients,
                'total_female': female_patients,
                'grand_total': grand_total_patients,
            }
            ,
            'dispensed_items': dispensed_items,
        })


class LaboratoryAttendanceReportView(views.APIView):
    """Generate laboratory attendance report by month and category."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        from django.utils.dateparse import parse_date

        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None

        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Build lab period/history querysets
        history_orders = LabOrder.objects.select_related('patient')
        lab_orders = history_orders
        if parsed_start_date and parsed_end_date:
            lab_orders = lab_orders.filter(ordered_at__date__gte=parsed_start_date, ordered_at__date__lte=parsed_end_date)
        else:
            lab_orders = lab_orders.filter(ordered_at__year=year_int)

        employee_orders = lab_orders.filter(patient__category='employee')
        officers_orders = employee_orders.exclude(
            patient__employee_type__isnull=True
        ).exclude(
            patient__employee_type=''
        ).filter(
            patient__employee_type__icontains='officer'
        )
        staff_orders = employee_orders.exclude(
            patient__employee_type__icontains='officer'
        )
        dependents_orders = lab_orders.filter(patient__category='dependent')
        emp_dep_orders = dependents_orders.exclude(
            patient__dependent_type__isnull=True
        ).filter(
            patient__dependent_type__icontains='employee'
        )
        ret_dep_orders = dependents_orders.exclude(
            patient__dependent_type__isnull=True
        ).filter(
            patient__dependent_type__icontains='retiree'
        )
        non_npa_orders = lab_orders.filter(patient__category='nonnpa')
        retiree_orders = lab_orders.filter(patient__category='retiree')

        officers_total = officers_orders.values('patient').distinct().count()
        officers_male = officers_orders.filter(patient__gender='male').values('patient').distinct().count()
        officers_female = officers_orders.filter(patient__gender='female').values('patient').distinct().count()

        staff_total = staff_orders.values('patient').distinct().count()
        staff_male = staff_orders.filter(patient__gender='male').values('patient').distinct().count()
        staff_female = staff_orders.filter(patient__gender='female').values('patient').distinct().count()

        emp_dep_total = emp_dep_orders.values('patient').distinct().count()
        emp_dep_male = emp_dep_orders.filter(patient__gender='male').values('patient').distinct().count()
        emp_dep_female = emp_dep_orders.filter(patient__gender='female').values('patient').distinct().count()

        ret_dep_total = ret_dep_orders.values('patient').distinct().count()
        ret_dep_male = ret_dep_orders.filter(patient__gender='male').values('patient').distinct().count()
        ret_dep_female = ret_dep_orders.filter(patient__gender='female').values('patient').distinct().count()

        non_npa_total = non_npa_orders.values('patient').distinct().count()
        non_npa_male = non_npa_orders.filter(patient__gender='male').values('patient').distinct().count()
        non_npa_female = non_npa_orders.filter(patient__gender='female').values('patient').distinct().count()

        retirees_total = retiree_orders.values('patient').distinct().count()
        retirees_male = retiree_orders.filter(patient__gender='male').values('patient').distinct().count()
        retirees_female = retiree_orders.filter(patient__gender='female').values('patient').distinct().count()

        total_employee = officers_total + staff_total
        total_non_employee = emp_dep_total + ret_dep_total + non_npa_total + retirees_total
        grand_total = total_employee + total_non_employee
        total_male = officers_male + staff_male + emp_dep_male + ret_dep_male + non_npa_male + retirees_male
        total_female = officers_female + staff_female + emp_dep_female + ret_dep_female + non_npa_female + retirees_female

        period_start, period_end = _resolve_period_bounds(
            year=year,
            start_date=parsed_start_date,
            end_date=parsed_end_date,
            default_to_current_year=not bool(year),
        )
        cohort_patient_ids = (
            list(officers_orders.values_list('patient_id', flat=True).distinct()) +
            list(staff_orders.values_list('patient_id', flat=True).distinct()) +
            list(emp_dep_orders.values_list('patient_id', flat=True).distinct()) +
            list(ret_dep_orders.values_list('patient_id', flat=True).distinct()) +
            list(non_npa_orders.values_list('patient_id', flat=True).distinct()) +
            list(retiree_orders.values_list('patient_id', flat=True).distinct())
        )
        unique_patient_ids = set(cohort_patient_ids)
        if period_start and period_end and unique_patient_ids:
            first_lab_date_subquery = history_orders.filter(
                patient=OuterRef('pk')
            ).order_by('ordered_at', 'id').values('ordered_at__date')[:1]
            patients_qs = Patient.objects.filter(id__in=unique_patient_ids).annotate(
                first_lab_order_date=Subquery(first_lab_date_subquery, output_field=DateField())
            )
            first_time_patients = patients_qs.filter(
                first_lab_order_date__gte=period_start,
                first_lab_order_date__lte=period_end,
            ).count()
            new_registrations = patients_qs.filter(
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            ).count()
            returning_patients = max(patients_qs.count() - first_time_patients, 0)
        else:
            first_time_patients = 0
            new_registrations = 0
            returning_patients = len(unique_patient_ids)

        data = [
            {
                'sn': 1,
                'category': 'Officers',
                'male': officers_male,
                'female': officers_female,
                'total': officers_total,
                'percentage': round((officers_total / grand_total * 100) if grand_total > 0 else 0, 1),
            },
            {
                'sn': 2,
                'category': 'Staff',
                'male': staff_male,
                'female': staff_female,
                'total': staff_total,
                'percentage': round((staff_total / grand_total * 100) if grand_total > 0 else 0, 1),
            },
            {
                'sn': 3,
                'category': 'Employee Dependents',
                'male': emp_dep_male,
                'female': emp_dep_female,
                'total': emp_dep_total,
                'percentage': round((emp_dep_total / grand_total * 100) if grand_total > 0 else 0, 1),
            },
            {
                'sn': 4,
                'category': 'Retiree Dependents',
                'male': ret_dep_male,
                'female': ret_dep_female,
                'total': ret_dep_total,
                'percentage': round((ret_dep_total / grand_total * 100) if grand_total > 0 else 0, 1),
            },
            {
                'sn': 5,
                'category': 'Non-NPA',
                'male': non_npa_male,
                'female': non_npa_female,
                'total': non_npa_total,
                'percentage': round((non_npa_total / grand_total * 100) if grand_total > 0 else 0, 1),
            },
            {
                'sn': 6,
                'category': 'Retirees',
                'male': retirees_male,
                'female': retirees_female,
                'total': retirees_total,
                'percentage': round((retirees_total / grand_total * 100) if grand_total > 0 else 0, 1),
            },
        ]
        
        return Response({
            'data': data,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'total_male': total_male,
                'total_female': total_female,
                'grand_total': grand_total,
                'new_registrations': new_registrations,
                'first_time_patients': first_time_patients,
                'returning_patients': returning_patients,
                'total_unique_patients_seen': len(unique_patient_ids),
                'total_visits': lab_orders.count(),
            }
        })


class ServicesActivitiesReportView(views.APIView):
    """Generate services and activities report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        from django.utils.dateparse import parse_date

        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None
        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get procedures for selected period with gender breakdown
        procedures = Procedure.objects.select_related('patient')
        if parsed_start_date and parsed_end_date:
            procedures = procedures.filter(
                performed_at__date__gte=parsed_start_date,
                performed_at__date__lte=parsed_end_date,
            )
        else:
            procedures = procedures.filter(performed_at__year=year_int)
        
        # Count by procedure type with gender breakdown
        injections_male = procedures.filter(
            procedure_type='injection',
            patient__gender='male'
        ).count()
        injections_female = procedures.filter(
            procedure_type='injection',
            patient__gender='female'
        ).count()
        injections = injections_male + injections_female
        
        dressing_male = procedures.filter(
            procedure_type='dressing',
            patient__gender='male'
        ).count()
        dressing_female = procedures.filter(
            procedure_type='dressing',
            patient__gender='female'
        ).count()
        dressing = dressing_male + dressing_female
        
        # Get nursing orders for sick leave tracking with gender breakdown
        nursing_orders = NursingOrder.objects.filter(
            order_type__icontains='sick'
        ).select_related('patient')
        if parsed_start_date and parsed_end_date:
            nursing_orders = nursing_orders.filter(
                ordered_at__date__gte=parsed_start_date,
                ordered_at__date__lte=parsed_end_date,
            )
        else:
            nursing_orders = nursing_orders.filter(ordered_at__year=year_int)
        
        sick_leave_male = nursing_orders.filter(
            patient__gender='male'
        ).count()
        sick_leave_female = nursing_orders.filter(
            patient__gender='female'
        ).count()
        sick_leave = sick_leave_male + sick_leave_female

        # Illness medical certificates (stored sick_leave_days + counts by patient gender)
        cert_sick_qs = MedicalCertificate.objects.filter(purpose="illness").select_related("patient")
        if parsed_start_date and parsed_end_date:
            cert_sick_qs = cert_sick_qs.filter(
                issued_at__date__gte=parsed_start_date,
                issued_at__date__lte=parsed_end_date,
            )
        else:
            cert_sick_qs = cert_sick_qs.filter(issued_at__year=year_int)
        cert_sick_leave_days_sum = cert_sick_qs.aggregate(total=Sum("sick_leave_days"))["total"] or 0
        cert_sick_male = cert_sick_qs.filter(patient__gender="male").count()
        cert_sick_female = cert_sick_qs.filter(patient__gender="female").count()
        cert_sick_issued = cert_sick_qs.count()
        
        # Get referrals from consultation with gender breakdown
        referrals = Referral.objects.select_related('patient')
        if parsed_start_date and parsed_end_date:
            referrals = referrals.filter(
                referred_at__date__gte=parsed_start_date,
                referred_at__date__lte=parsed_end_date,
            )
        else:
            referrals = referrals.filter(referred_at__year=year_int)
        
        referrals_male = referrals.filter(
            patient__gender='male'
        ).count()
        referrals_female = referrals.filter(
            patient__gender='female'
        ).count()
        referrals_total = referrals_male + referrals_female
        
        # Get observations (can be from consultation sessions) with gender breakdown
        observations_qs = ConsultationSession.objects.exclude(
            assessment=''
        ).exclude(
            assessment__isnull=True
        ).select_related('patient')
        if parsed_start_date and parsed_end_date:
            observations_qs = observations_qs.filter(
                started_at__date__gte=parsed_start_date,
                started_at__date__lte=parsed_end_date,
            )
        else:
            observations_qs = observations_qs.filter(started_at__year=year_int)
        
        observations_male = observations_qs.filter(
            patient__gender='male'
        ).count()
        observations_female = observations_qs.filter(
            patient__gender='female'
        ).count()
        observations = observations_male + observations_female
        
        categories = [
            {
                'sn': 1, 
                'category': 'Injections', 
                'count': injections,
                'male': injections_male,
                'female': injections_female
            },
            {
                'sn': 2, 
                'category': 'Dressing', 
                'count': dressing,
                'male': dressing_male,
                'female': dressing_female
            },
            {
                'sn': 3, 
                'category': 'Sick Leave', 
                'count': sick_leave,
                'male': sick_leave_male,
                'female': sick_leave_female
            },
            {
                'sn': 4, 
                'category': 'Referrals', 
                'count': referrals_total,
                'male': referrals_male,
                'female': referrals_female
            },
            {
                'sn': 5, 
                'category': 'Observations', 
                'count': observations,
                'male': observations_male,
                'female': observations_female
            },
        ]
        
        total = sum(c['count'] for c in categories)
        total_male = sum(c['male'] for c in categories)
        total_female = sum(c['female'] for c in categories)
        for row in categories:
            row['percentage'] = round((row['count'] / total * 100) if total > 0 else 0, 1)
        
        return Response({
            'data': categories,
            'summary': {
                'total': total,
                'total_male': total_male,
                'total_female': total_female,
            },
            'medical_certificate_sick_leave': {
                'certificates_issued': cert_sick_issued,
                'total_sick_leave_days': cert_sick_leave_days_sum,
                'male': cert_sick_male,
                'female': cert_sick_female,
            },
        })


class ComprehensiveReportView(views.APIView):
    """Generate comprehensive report with all metrics."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        from django.utils.dateparse import parse_date

        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None
        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Overview metrics
        visits = Visit.objects.filter(status__in=['completed', 'in_progress'])
        if parsed_start_date and parsed_end_date:
            visits = visits.filter(date__gte=parsed_start_date, date__lte=parsed_end_date)
        else:
            visits = visits.filter(date__year=year_int)
        total_visits = visits.count()
        
        prescriptions = Prescription.objects.all()
        if parsed_start_date and parsed_end_date:
            prescriptions = prescriptions.filter(prescribed_at__date__gte=parsed_start_date, prescribed_at__date__lte=parsed_end_date)
        else:
            prescriptions = prescriptions.filter(prescribed_at__year=year_int)
        total_prescriptions = prescriptions.count()
        dispensed_prescriptions = prescriptions.filter(status='dispensed').count()
        
        lab_orders = LabOrder.objects.all()
        if parsed_start_date and parsed_end_date:
            lab_orders = lab_orders.filter(ordered_at__date__gte=parsed_start_date, ordered_at__date__lte=parsed_end_date)
        else:
            lab_orders = lab_orders.filter(ordered_at__year=year_int)
        total_lab_tests = LabTest.objects.filter(order__in=lab_orders).count()
        
        nursing_orders = NursingOrder.objects.all()
        if parsed_start_date and parsed_end_date:
            nursing_orders = nursing_orders.filter(ordered_at__date__gte=parsed_start_date, ordered_at__date__lte=parsed_end_date)
        else:
            nursing_orders = nursing_orders.filter(ordered_at__year=year_int)
        total_nursing_orders = nursing_orders.count()
        
        procedures = Procedure.objects.all()
        if parsed_start_date and parsed_end_date:
            procedures = procedures.filter(performed_at__date__gte=parsed_start_date, performed_at__date__lte=parsed_end_date)
        else:
            procedures = procedures.filter(performed_at__year=year_int)
        injections = procedures.filter(procedure_type='injection').count()
        dressing = procedures.filter(procedure_type='dressing').count()
        
        # Category breakdown (unique patient attendance cohort)
        officers_qs = visits.filter(
            patient__category='employee',
            patient__employee_type__icontains='officer'
        )
        
        staff_qs = visits.filter(
            patient__category='employee'
        ).exclude(patient__employee_type__icontains='officer')
        
        emp_dep_qs = visits.filter(
            patient__category='dependent',
            patient__dependent_type__icontains='employee'
        )
        
        ret_dep_qs = visits.filter(
            patient__category='dependent',
            patient__dependent_type__icontains='retiree'
        )
        
        nonnpa_qs = visits.filter(patient__category='nonnpa')
        retiree_qs = visits.filter(patient__category='retiree')

        def category_counts(qs):
            male = qs.filter(patient__gender='male').values('patient').distinct().count()
            female = qs.filter(patient__gender='female').values('patient').distinct().count()
            total = qs.values('patient').distinct().count()
            return male, female, total

        officers_male, officers_female, officers_total = category_counts(officers_qs)
        staff_male, staff_female, staff_total = category_counts(staff_qs)
        emp_dep_male, emp_dep_female, emp_dep_total = category_counts(emp_dep_qs)
        ret_dep_male, ret_dep_female, ret_dep_total = category_counts(ret_dep_qs)
        nonnpa_male, nonnpa_female, nonnpa_total = category_counts(nonnpa_qs)
        retiree_male, retiree_female, retiree_total = category_counts(retiree_qs)
        category_grand_total = officers_total + staff_total + emp_dep_total + ret_dep_total + nonnpa_total + retiree_total
        total_employee = officers_total + staff_total
        total_non_employee = emp_dep_total + ret_dep_total + nonnpa_total + retiree_total
        total_male = officers_male + staff_male + emp_dep_male + ret_dep_male + nonnpa_male + retiree_male
        total_female = officers_female + staff_female + emp_dep_female + ret_dep_female + nonnpa_female + retiree_female

        categories = [
            {'sn': 1, 'category': 'Officers', 'male': officers_male, 'female': officers_female, 'total': officers_total},
            {'sn': 2, 'category': 'Staff', 'male': staff_male, 'female': staff_female, 'total': staff_total},
            {'sn': 3, 'category': 'Employee Dependents', 'male': emp_dep_male, 'female': emp_dep_female, 'total': emp_dep_total},
            {'sn': 4, 'category': 'Retiree Dependents', 'male': ret_dep_male, 'female': ret_dep_female, 'total': ret_dep_total},
            {'sn': 5, 'category': 'Non-NPA', 'male': nonnpa_male, 'female': nonnpa_female, 'total': nonnpa_total},
            {'sn': 6, 'category': 'Retirees', 'male': retiree_male, 'female': retiree_female, 'total': retiree_total},
        ]
        for row in categories:
            row['percentage'] = round((row['total'] / category_grand_total * 100) if category_grand_total > 0 else 0, 1)
        
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
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'total_male': total_male,
                'total_female': total_female,
                'grand_total': category_grand_total,
            },
            'category_breakdown': categories,
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
        from django.utils.dateparse import parse_date
        
        # Filter visits by clinic
        history_queryset = Visit.objects.filter(
            status__in=['completed', 'in_progress'],
            clinic__icontains=clinic_type
        ).select_related('patient')
        visits_queryset = history_queryset
        
        # Apply date filtering
        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None
        if start_date_str and end_date_str:
            if parsed_start_date and parsed_end_date:
                visits_queryset = visits_queryset.filter(date__gte=parsed_start_date, date__lte=parsed_end_date)
        elif year:
            try:
                year_int = int(year)
                visits_queryset = visits_queryset.filter(date__year=year_int)
            except (ValueError, TypeError):
                pass

        period_start, period_end = _resolve_period_bounds(
            year=year,
            start_date=parsed_start_date,
            end_date=parsed_end_date,
        )
        lifecycle_summary = _build_visit_lifecycle_summary(
            period_visits_queryset=visits_queryset,
            history_visits_queryset=history_queryset,
            start_date=period_start,
            end_date=period_end,
        )
        
        # Category breakdown (same structure as Attendance Summary for consistency)
        employee_visits = visits_queryset.filter(patient__category='employee')
        officers_visits = employee_visits.exclude(
            patient__employee_type__isnull=True
        ).exclude(
            patient__employee_type=''
        ).filter(
            patient__employee_type__icontains='officer'
        )
        staff_visits = employee_visits.exclude(
            patient__employee_type__icontains='officer'
        )

        dependents_visits = visits_queryset.filter(patient__category='dependent')
        emp_dep_visits = dependents_visits.exclude(
            patient__dependent_type__isnull=True
        ).filter(
            patient__dependent_type__icontains='employee'
        )
        ret_dep_visits = dependents_visits.exclude(
            patient__dependent_type__isnull=True
        ).filter(
            patient__dependent_type__icontains='retiree'
        )
        nonnpa_visits = visits_queryset.filter(patient__category='nonnpa')
        retiree_visits = visits_queryset.filter(patient__category='retiree')

        officers_count = officers_visits.values('patient').distinct().count()
        officers_male = officers_visits.filter(patient__gender='male').values('patient').distinct().count()
        officers_female = officers_visits.filter(patient__gender='female').values('patient').distinct().count()

        staff_count = staff_visits.values('patient').distinct().count()
        staff_male = staff_visits.filter(patient__gender='male').values('patient').distinct().count()
        staff_female = staff_visits.filter(patient__gender='female').values('patient').distinct().count()

        emp_dep_count = emp_dep_visits.values('patient').distinct().count()
        emp_dep_male = emp_dep_visits.filter(patient__gender='male').values('patient').distinct().count()
        emp_dep_female = emp_dep_visits.filter(patient__gender='female').values('patient').distinct().count()

        ret_dep_count = ret_dep_visits.values('patient').distinct().count()
        ret_dep_male = ret_dep_visits.filter(patient__gender='male').values('patient').distinct().count()
        ret_dep_female = ret_dep_visits.filter(patient__gender='female').values('patient').distinct().count()

        nonnpa_count = nonnpa_visits.values('patient').distinct().count()
        nonnpa_male = nonnpa_visits.filter(patient__gender='male').values('patient').distinct().count()
        nonnpa_female = nonnpa_visits.filter(patient__gender='female').values('patient').distinct().count()

        retiree_count = retiree_visits.values('patient').distinct().count()
        retiree_male = retiree_visits.filter(patient__gender='male').values('patient').distinct().count()
        retiree_female = retiree_visits.filter(patient__gender='female').values('patient').distinct().count()

        total_employee = officers_count + staff_count
        total_non_employee = emp_dep_count + ret_dep_count + nonnpa_count + retiree_count
        grand_total = total_employee + total_non_employee
        total_male = officers_male + staff_male + emp_dep_male + ret_dep_male + nonnpa_male + retiree_male
        total_female = officers_female + staff_female + emp_dep_female + ret_dep_female + nonnpa_female + retiree_female

        categories = [
            {
                'sn': 1,
                'category': 'Officers',
                'male': officers_male,
                'female': officers_female,
                'total': officers_count,
                'percentage': round((officers_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 2,
                'category': 'Staff',
                'male': staff_male,
                'female': staff_female,
                'total': staff_count,
                'percentage': round((staff_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 3,
                'category': 'Employee Dependents',
                'male': emp_dep_male,
                'female': emp_dep_female,
                'total': emp_dep_count,
                'percentage': round((emp_dep_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 4,
                'category': 'Retiree Dependents',
                'male': ret_dep_male,
                'female': ret_dep_female,
                'total': ret_dep_count,
                'percentage': round((ret_dep_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 5,
                'category': 'Non-NPA',
                'male': nonnpa_male,
                'female': nonnpa_female,
                'total': nonnpa_count,
                'percentage': round((nonnpa_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 6,
                'category': 'Retirees',
                'male': retiree_male,
                'female': retiree_female,
                'total': retiree_count,
                'percentage': round((retiree_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
        ]
        
        return Response({
            'data': categories,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'total_male': total_male,
                'total_female': total_female,
                'grand_total': grand_total,
                **lifecycle_summary,
            }
        })


class RadiologicalServicesReportView(views.APIView):
    """Generate radiological services report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        from django.utils.dateparse import parse_date

        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None

        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get radiology studies for period + history for lifecycle metrics.
        history_studies = RadiologyStudy.objects.select_related('order__patient')
        studies = history_studies
        if parsed_start_date and parsed_end_date:
            studies = studies.filter(created_at__date__gte=parsed_start_date, created_at__date__lte=parsed_end_date)
        else:
            studies = studies.filter(created_at__year=year_int)
        
        # Count by modality/type with gender breakdown
        xray_male = studies.filter(
            Q(modality__icontains='x-ray') | Q(modality__icontains='xray') | Q(procedure__icontains='x-ray'),
            order__patient__gender='male'
        ).count()
        xray_female = studies.filter(
            Q(modality__icontains='x-ray') | Q(modality__icontains='xray') | Q(procedure__icontains='x-ray'),
            order__patient__gender='female'
        ).count()
        xray_count = xray_male + xray_female
        
        ecg_male = studies.filter(
            Q(modality__icontains='ecg') | Q(procedure__icontains='ecg') | Q(procedure__icontains='electrocardiogram'),
            order__patient__gender='male'
        ).count()
        ecg_female = studies.filter(
            Q(modality__icontains='ecg') | Q(procedure__icontains='ecg') | Q(procedure__icontains='electrocardiogram'),
            order__patient__gender='female'
        ).count()
        ecg_count = ecg_male + ecg_female
        
        ultrasound_male = studies.filter(
            Q(modality__icontains='ultrasound') | Q(procedure__icontains='ultrasound'),
            order__patient__gender='male'
        ).count()
        ultrasound_female = studies.filter(
            Q(modality__icontains='ultrasound') | Q(procedure__icontains='ultrasound'),
            order__patient__gender='female'
        ).count()
        ultrasound_count = ultrasound_male + ultrasound_female
        
        ct_male = studies.filter(
            Q(modality__icontains='ct') | Q(modality__icontains='computed tomography') | Q(procedure__icontains='ct scan'),
            order__patient__gender='male'
        ).count()
        ct_female = studies.filter(
            Q(modality__icontains='ct') | Q(modality__icontains='computed tomography') | Q(procedure__icontains='ct scan'),
            order__patient__gender='female'
        ).count()
        ct_count = ct_male + ct_female
        
        mri_male = studies.filter(
            Q(modality__icontains='mri') | Q(procedure__icontains='magnetic resonance'),
            order__patient__gender='male'
        ).count()
        mri_female = studies.filter(
            Q(modality__icontains='mri') | Q(procedure__icontains='magnetic resonance'),
            order__patient__gender='female'
        ).count()
        mri_count = mri_male + mri_female
        
        other_male = studies.exclude(
            Q(modality__icontains='x-ray') | Q(modality__icontains='xray') |
            Q(modality__icontains='ecg') | Q(modality__icontains='ultrasound') |
            Q(modality__icontains='ct') | Q(modality__icontains='mri')
        ).exclude(
            Q(procedure__icontains='x-ray') | Q(procedure__icontains='ecg') |
            Q(procedure__icontains='ultrasound') | Q(procedure__icontains='ct scan') |
            Q(procedure__icontains='magnetic resonance')
        ).filter(
            order__patient__gender='male'
        ).count()
        other_female = studies.exclude(
            Q(modality__icontains='x-ray') | Q(modality__icontains='xray') |
            Q(modality__icontains='ecg') | Q(modality__icontains='ultrasound') |
            Q(modality__icontains='ct') | Q(modality__icontains='mri')
        ).exclude(
            Q(procedure__icontains='x-ray') | Q(procedure__icontains='ecg') |
            Q(procedure__icontains='ultrasound') | Q(procedure__icontains='ct scan') |
            Q(procedure__icontains='magnetic resonance')
        ).filter(
            order__patient__gender='female'
        ).count()
        other_count = other_male + other_female
        
        total = studies.count()
        total_male = xray_male + ecg_male + ultrasound_male + ct_male + mri_male + other_male
        total_female = xray_female + ecg_female + ultrasound_female + ct_female + mri_female + other_female
        total_employee = studies.filter(
            Q(order__patient__category='employee') | Q(order__patient__category='retiree')
        ).count()
        total_non_employee = studies.filter(
            Q(order__patient__category='dependent') | Q(order__patient__category='nonnpa')
        ).count()
        
        categories = [
            {
                'sn': 1, 
                'category': 'X-Ray', 
                'count': xray_count,
                'male': xray_male,
                'female': xray_female,
                'percentage': round((xray_count / total * 100) if total > 0 else 0, 1),
            },
            {
                'sn': 2, 
                'category': 'ECG', 
                'count': ecg_count,
                'male': ecg_male,
                'female': ecg_female,
                'percentage': round((ecg_count / total * 100) if total > 0 else 0, 1),
            },
            {
                'sn': 3, 
                'category': 'Ultrasound', 
                'count': ultrasound_count,
                'male': ultrasound_male,
                'female': ultrasound_female,
                'percentage': round((ultrasound_count / total * 100) if total > 0 else 0, 1),
            },
            {
                'sn': 4, 
                'category': 'CT Scan', 
                'count': ct_count,
                'male': ct_male,
                'female': ct_female,
                'percentage': round((ct_count / total * 100) if total > 0 else 0, 1),
            },
            {
                'sn': 5, 
                'category': 'MRI', 
                'count': mri_count,
                'male': mri_male,
                'female': mri_female,
                'percentage': round((mri_count / total * 100) if total > 0 else 0, 1),
            },
            {
                'sn': 6, 
                'category': 'Other', 
                'count': other_count,
                'male': other_male,
                'female': other_female,
                'percentage': round((other_count / total * 100) if total > 0 else 0, 1),
            },
        ]
        
        # Filter out zero counts
        categories = [c for c in categories if c['count'] > 0]
        
        period_start, period_end = _resolve_period_bounds(
            year=year,
            start_date=parsed_start_date,
            end_date=parsed_end_date,
            default_to_current_year=not bool(year),
        )
        patient_ids = studies.values_list('order__patient_id', flat=True).distinct()
        patients_qs = Patient.objects.filter(id__in=patient_ids)
        total_seen = patients_qs.count()
        if period_start and period_end and total_seen > 0:
            first_study_date_subquery = history_studies.filter(
                order__patient=OuterRef('pk')
            ).order_by('created_at', 'id').values('created_at__date')[:1]
            patients_qs = patients_qs.annotate(
                first_study_date=Subquery(first_study_date_subquery, output_field=DateField())
            )
            first_time_patients = patients_qs.filter(
                first_study_date__gte=period_start,
                first_study_date__lte=period_end,
            ).count()
            new_registrations = patients_qs.filter(
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            ).count()
            returning_patients = max(total_seen - first_time_patients, 0)
        else:
            first_time_patients = 0
            new_registrations = 0
            returning_patients = total_seen
        
        return Response({
            'data': categories,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'total_male': total_male,
                'total_female': total_female,
                'grand_total': total,
                'new_registrations': new_registrations,
                'first_time_patients': first_time_patients,
                'returning_patients': returning_patients,
                'total_unique_patients_seen': total_seen,
                'total_visits': total,
            }
        })


class ReferralTrackingReportView(views.APIView):
    """Generate referral tracking report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        from django.utils.dateparse import parse_date

        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None
        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get referrals for the selected period
        referrals = Referral.objects.select_related('patient')
        if parsed_start_date and parsed_end_date:
            referrals = referrals.filter(
                referred_at__date__gte=parsed_start_date,
                referred_at__date__lte=parsed_end_date,
            )
        else:
            referrals = referrals.filter(referred_at__year=year_int)
        
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
            'data': list(
                referrals.values(
                    'referral_id',
                    'patient__patient_id',
                    'patient__first_name',
                    'patient__surname',
                    'status',
                    'facility_type',
                    'specialty',
                    'facility',
                    'referred_at',
                )[:100]
            )  # Limit to 100 for preview
        })


class DiseasePatternReportView(views.APIView):
    """Generate disease pattern report from consultation sessions."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        from django.utils.dateparse import parse_date

        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None
        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Use structured ICD-10 diagnoses captured in consultation sessions.
        from consultation.models import Diagnosis

        diagnosis_qs = Diagnosis.objects.filter(
            session__status='completed',
            icd10_code__isnull=False,
        )
        if parsed_start_date and parsed_end_date:
            diagnosis_qs = diagnosis_qs.filter(
                session__started_at__date__gte=parsed_start_date,
                session__started_at__date__lte=parsed_end_date,
            )
        else:
            diagnosis_qs = diagnosis_qs.filter(session__started_at__year=year_int)

        diagnosis_rows = (
            diagnosis_qs
            .values(
                code=F('icd10_code__code'),
                description=F('icd10_code__description'),
            )
            .annotate(
                employee=Count(
                    'id',
                    filter=Q(patient__category__in=['employee', 'retiree'])
                ),
                non_employee=Count(
                    'id',
                    filter=~Q(patient__category__in=['employee', 'retiree'])
                ),
                male=Count('id', filter=Q(patient__gender='male')),
                female=Count('id', filter=Q(patient__gender='female')),
            )
            .annotate(total=F('employee') + F('non_employee'))
            .order_by('-total', 'code')
        )
        
        result = []
        for idx, row in enumerate(diagnosis_rows, 1):
            code = row.get('code') or 'UNSPECIFIED'
            description = row.get('description') or ''
            male = row.get('male', 0) or 0
            female = row.get('female', 0) or 0
            total = row.get('total', 0) or 0
            gender_other = max(0, (row.get('total', 0) or 0) - male - female)
            result.append({
                'sn': idx,
                'diagnosis': f"{code} - {description}" if description else code,
                'code': code,
                'description': description,
                'employee': row.get('employee', 0) or 0,
                'non_employee': row.get('non_employee', 0) or 0,
                'male': male,
                'female': female,
                'gender_other': gender_other,
                'total': total,
            })
        
        grand_total_e = sum(item['employee'] for item in result)
        grand_total_ne = sum(item['non_employee'] for item in result)
        grand_total_m = sum(item['male'] for item in result)
        grand_total_f = sum(item['female'] for item in result)
        grand_total_go = sum(item['gender_other'] for item in result)
        
        return Response({
            'data': result,
            'summary': {
                'total_employee': grand_total_e,
                'total_non_employee': grand_total_ne,
                'grand_total': grand_total_e + grand_total_ne,
                'total_male': grand_total_m,
                'total_female': grand_total_f,
                'total_gender_other': grand_total_go,
            }
        })


class GOPAttendanceReportView(views.APIView):
    """Generate GOPD (general outpatient) attendance report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year
        from django.utils.dateparse import parse_date
        
        # GOPD / legacy general-outpatient visit lines (primary clinic, JSON clinics list, or legacy labels)
        history_visits = Visit.objects.filter(
            status__in=['completed', 'in_progress']
        ).filter(
            Q(visit_type='consultation')
            | Q(clinic__icontains='general')
            | Q(clinic__icontains='outpatient')
            | Q(clinic__iexact='GOPD')
            | Q(clinic__iexact='gopd')
            | Q(clinics__contains=['GOPD'])
        ).select_related('patient').annotate(
            month=ExtractMonth('date')
        )
        visits = history_visits.filter(date__year=year_int)

        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None
        if parsed_start_date and parsed_end_date:
            visits = history_visits.filter(date__gte=parsed_start_date, date__lte=parsed_end_date)

        period_start, period_end = _resolve_period_bounds(
            year=year_int,
            start_date=parsed_start_date,
            end_date=parsed_end_date,
            default_to_current_year=not bool(year),
        )
        lifecycle_summary = _build_visit_lifecycle_summary(
            period_visits_queryset=visits,
            history_visits_queryset=history_visits,
            start_date=period_start,
            end_date=period_end,
        )
        
        officers_visits = visits.filter(
                patient__category='employee',
            patient__employee_type__icontains='officer'
        )
        staff_visits = visits.filter(patient__category='employee').exclude(
            patient__employee_type__icontains='officer'
        )
        emp_dep_visits = visits.filter(
                patient__category='dependent',
            patient__dependent_type__icontains='employee'
        )
        ret_dep_visits = visits.filter(
                patient__category='dependent',
            patient__dependent_type__icontains='retiree'
        )
        police_visits = visits.filter(
                patient__category='nonnpa',
            patient__nonnpa_type__icontains='police'
        )
        non_npa_visits = visits.filter(patient__category='nonnpa').exclude(
            patient__nonnpa_type__icontains='police'
        )
        retiree_visits = visits.filter(patient__category='retiree')

        def category_counts(qs):
            male = qs.filter(patient__gender='male').values('patient').distinct().count()
            female = qs.filter(patient__gender='female').values('patient').distinct().count()
            total = qs.values('patient').distinct().count()
            return male, female, total

        officers_male, officers_female, officers_total = category_counts(officers_visits)
        staff_male, staff_female, staff_total = category_counts(staff_visits)
        emp_dep_male, emp_dep_female, emp_dep_total = category_counts(emp_dep_visits)
        ret_dep_male, ret_dep_female, ret_dep_total = category_counts(ret_dep_visits)
        police_male, police_female, police_total = category_counts(police_visits)
        non_npa_male, non_npa_female, non_npa_total = category_counts(non_npa_visits)
        retiree_male, retiree_female, retiree_total = category_counts(retiree_visits)

        grand_total = (
            officers_total + staff_total + emp_dep_total +
            ret_dep_total + police_total + non_npa_total + retiree_total
        )
        total_employee = officers_total + staff_total
        total_non_employee = emp_dep_total + ret_dep_total + police_total + non_npa_total + retiree_total
        total_male = (
            officers_male + staff_male + emp_dep_male + ret_dep_male +
            police_male + non_npa_male + retiree_male
        )
        total_female = (
            officers_female + staff_female + emp_dep_female + ret_dep_female +
            police_female + non_npa_female + retiree_female
        )

        categories = [
            {'sn': 1, 'category': 'Officers', 'male': officers_male, 'female': officers_female, 'total': officers_total},
            {'sn': 2, 'category': 'Staff', 'male': staff_male, 'female': staff_female, 'total': staff_total},
            {'sn': 3, 'category': 'Employee Dependents', 'male': emp_dep_male, 'female': emp_dep_female, 'total': emp_dep_total},
            {'sn': 4, 'category': 'Retiree Dependents', 'male': ret_dep_male, 'female': ret_dep_female, 'total': ret_dep_total},
            {'sn': 5, 'category': 'Police', 'male': police_male, 'female': police_female, 'total': police_total},
            {'sn': 6, 'category': 'Non-NPA', 'male': non_npa_male, 'female': non_npa_female, 'total': non_npa_total},
            {'sn': 7, 'category': 'Retirees', 'male': retiree_male, 'female': retiree_female, 'total': retiree_total},
        ]
        for row in categories:
            row['percentage'] = round((row['total'] / grand_total * 100) if grand_total > 0 else 0, 1)
        
        return Response({
            'data': categories,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'total_male': total_male,
                'total_female': total_female,
            'grand_total': grand_total,
                **lifecycle_summary,
            },
        })


class EscortLogReportView(views.APIView):
    """
    Escort Log — every patient that physically left the ward with a nurse
    accompanying them to an external facility.

    Source of truth is :class:`wards.models.AdmissionEscort` (created during
    discharge initiation when the doctor flags the discharge as a transfer
    and the nurse confirms departure). Each row is one escort log entry and
    carries its referral, transport, primary nurse, additional nurses, and
    arrival confirmation outcome.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils.dateparse import parse_date
        from wards.models import AdmissionEscort

        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        status_filter = (request.query_params.get('status') or '').lower()
        outcome_filter = (request.query_params.get('outcome') or '').lower()

        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None

        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year

        # Period scope — by departure timestamp, falling back to created_at
        # for stub escorts that haven't been signed out yet (the doctor
        # initiated the referral but the nurse hasn't completed discharge).
        escorts = AdmissionEscort.objects.select_related(
            'admission', 'admission__patient', 'admission__ward',
            'referral', 'facility', 'primary_nurse',
            'arrival_confirmed_by', 'created_by',
        ).prefetch_related('additional_nurses')

        if parsed_start_date and parsed_end_date:
            escorts = escorts.filter(
                Q(departure_at__date__gte=parsed_start_date, departure_at__date__lte=parsed_end_date)
                | Q(departure_at__isnull=True, created_at__date__gte=parsed_start_date,
                    created_at__date__lte=parsed_end_date)
            )
        else:
            escorts = escorts.filter(
                Q(departure_at__year=year_int)
                | Q(departure_at__isnull=True, created_at__year=year_int)
            )

        # status: pending = not yet arrival-confirmed; confirmed = arrival logged.
        if status_filter == 'pending':
            escorts = escorts.filter(arrival_confirmed_at__isnull=True)
        elif status_filter == 'confirmed':
            escorts = escorts.filter(arrival_confirmed_at__isnull=False)

        if outcome_filter:
            escorts = escorts.filter(arrival_call_outcome=outcome_filter)

        escorts = escorts.order_by('-departure_at', '-created_at')

        # Summary metrics
        total = escorts.count()
        confirmed = escorts.filter(arrival_confirmed_at__isnull=False).count()
        pending = total - confirmed
        outcome_counts = {}
        for row in escorts.values('arrival_call_outcome').annotate(c=Count('id')):
            key = (row['arrival_call_outcome'] or 'unspecified') or 'unspecified'
            outcome_counts[key] = row['c']

        # Average time-to-arrival for confirmed escorts (departure → arrival).
        avg_minutes_to_arrival = None
        confirmed_with_times = escorts.filter(
            arrival_confirmed_at__isnull=False,
            departure_at__isnull=False,
        )
        if confirmed_with_times.exists():
            diffs = []
            for esc in confirmed_with_times.only('departure_at', 'arrival_confirmed_at')[:500]:
                if esc.arrival_confirmed_at and esc.departure_at:
                    delta = esc.arrival_confirmed_at - esc.departure_at
                    secs = delta.total_seconds()
                    if secs >= 0:
                        diffs.append(secs / 60.0)
            if diffs:
                avg_minutes_to_arrival = round(sum(diffs) / len(diffs), 1)

        # Pending > 24h since departure — escorts that should already have
        # been called back. Surfaced separately so duty nurses can chase.
        cutoff = timezone.now() - timedelta(hours=24)
        overdue = escorts.filter(
            arrival_confirmed_at__isnull=True,
            departure_at__isnull=False,
            departure_at__lte=cutoff,
        ).count()

        # Top facilities (where do we send patients most?)
        facility_counts = list(
            escorts.values('facility_name_snapshot')
            .annotate(c=Count('id'))
            .order_by('-c')[:10]
        )
        top_facilities = [
            {'facility': (row['facility_name_snapshot'] or 'Unspecified'), 'count': row['c']}
            for row in facility_counts
        ]

        # Detail rows (cap to 200 for the on-screen table; CSV export reads the same).
        rows = []
        for idx, esc in enumerate(escorts[:200], 1):
            adm = esc.admission
            patient = adm.patient if adm else None
            primary_name = esc.primary_nurse.get_full_name() if esc.primary_nurse_id else ''
            additional_names = ', '.join(
                n.get_full_name() for n in esc.additional_nurses.all()
            )
            rows.append({
                'sn': idx,
                'escort_id': esc.id,
                'patient_id': getattr(patient, 'patient_id', '') if patient else '',
                'patient_name': patient.get_full_name() if patient else '',
                'admission_id': adm.admission_id if adm else '',
                'ward': adm.ward.name if adm and adm.ward_id else '',
                'departure_at': esc.departure_at.isoformat() if esc.departure_at else None,
                'facility': esc.facility_name_snapshot or (
                    esc.facility.name if esc.facility_id else ''
                ),
                'transport_mode': esc.transport_mode or '',
                'primary_nurse': primary_name,
                'additional_nurses': additional_names,
                'referral_id': esc.referral.referral_id if esc.referral_id else '',
                'referral_status': esc.referral.status if esc.referral_id else '',
                'urgency': esc.referral.urgency if esc.referral_id else '',
                'handover_summary': esc.handover_summary or '',
                'arrival_confirmed_at': esc.arrival_confirmed_at.isoformat() if esc.arrival_confirmed_at else None,
                'arrival_outcome': esc.arrival_call_outcome or '',
                'arrival_notes': esc.arrival_notes or '',
                'arrival_confirmed_by': (
                    esc.arrival_confirmed_by.get_full_name() if esc.arrival_confirmed_by_id else ''
                ),
            })

        return Response({
            'summary': {
                'total': total,
                'pending': pending,
                'confirmed': confirmed,
                'overdue_pending': overdue,
                'avg_minutes_to_arrival': avg_minutes_to_arrival,
                'outcome_counts': outcome_counts,
            },
            'top_facilities': top_facilities,
            'data': rows,
        })


class WeekendCallDutyReportView(views.APIView):
    """Generate weekend call duty report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        from django.utils.dateparse import parse_date

        year = request.query_params.get('year')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        parsed_start_date = parse_date(start_date_str) if start_date_str else None
        parsed_end_date = parse_date(end_date_str) if end_date_str else None

        try:
            year_int = int(year) if year else timezone.now().year
        except (ValueError, TypeError):
            year_int = timezone.now().year
        
        # Get visits on weekends (Saturday=5, Sunday=6)
        # Database-agnostic approach: filter all visits, then filter by weekday in Python
        all_visits = Visit.objects.filter(
            status__in=['completed', 'in_progress']
        ).select_related('patient')

        if parsed_start_date and parsed_end_date:
            all_visits = all_visits.filter(
                date__gte=parsed_start_date,
                date__lte=parsed_end_date,
            )
        else:
            all_visits = all_visits.filter(date__year=year_int)
        
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
