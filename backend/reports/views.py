"""
Reports and Analytics views for the EMR system.
"""
from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from datetime import datetime, timedelta
from django.db.models import Count, Q, Sum, Avg, F, OuterRef, Subquery, DateField
from django.db.models.functions import Coalesce
from django.http import HttpResponse
import csv
import json

from patients.models import Patient, Visit, MedicalCertificate
from laboratory.models import LabOrder, LabTest, LabResult
from pharmacy.models import Prescription, MedicationInventory, PrescriptionItem, Dispense
from radiology.models import RadiologyOrder, RadiologyStudy
from nursing.models import NursingOrder, Procedure
from consultation.models import Referral, ConsultationSession, Diagnosis
from django.db.models.functions import ExtractMonth, ExtractYear, TruncMonth, TruncDay, TruncWeek

from reports.export_helpers import respond_with_export
from common.openapi import document_api_view


def _period_bounds_from_request(request, *, default_to_current_year=False):
    """Parse request query params into inclusive (start, end) date bounds."""
    from common.report_period import bounds_from_request

    return bounds_from_request(request, default_to_current_year=default_to_current_year)


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


@document_api_view(tag="Reports", summary="Patient demographics report")
class PatientDemographicsReportView(views.APIView):
    """Active patient register demographics snapshot."""

    def get(self, request):
        from common.report_period import parse_report_period
        from reports.patient_demographics_report import build_patient_demographics_report

        period = parse_report_period(request)
        period_start, period_end = _period_bounds_from_request(request)
        report = build_patient_demographics_report(
            period_start,
            period_end,
            all_time=period.all_time,
        )
        return respond_with_export(
            request,
            report,
            filename_prefix="patient_demographics",
            title="Patient Demographics",
        )


@document_api_view(tag="Reports", summary="Laboratory statistics report")
class LabStatisticsReportView(views.APIView):
    """Lab order and test volume for the selected period."""

    def get(self, request):
        from reports.lab_statistics_report import build_lab_statistics_report

        period_start, period_end = _period_bounds_from_request(request)
        report = build_lab_statistics_report(period_start, period_end)
        return respond_with_export(
            request,
            report,
            filename_prefix="lab_statistics",
            title="Lab Statistics",
        )


@document_api_view(tag="Reports", summary="Top diagnoses report")
class TopDiagnosesReportView(views.APIView):
    """Top ICD-10 diagnoses from completed consultations."""

    def get(self, request):
        from reports.top_diagnoses_report import build_top_diagnoses_report

        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        period_start, period_end = _period_bounds_from_request(request)
        report = build_top_diagnoses_report(period_start, period_end, limit=limit)
        return respond_with_export(
            request,
            report,
            filename_prefix="top_diagnoses",
            title="Top Diagnoses",
        )


@document_api_view(tag="Reports", summary="Laboratory performance report")
class LabPerformanceReportView(views.APIView):
    """Get laboratory performance metrics."""
    
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
        
        return respond_with_export(
            request, stats, filename_prefix="lab_performance", title="Lab Performance"
        )


@document_api_view(tag="Reports", summary="Pharmacy performance report")
class PharmacyPerformanceReportView(views.APIView):
    """Get pharmacy performance metrics."""
    
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
        
        return respond_with_export(
            request,
            stats,
            filename_prefix="pharmacy_performance",
            title="Pharmacy Performance",
        )


@document_api_view(tag="Reports", summary="Export report data")
class ExportDataView(views.APIView):
    """Export data to CSV/JSON."""
    
    def get(self, request):
        model_type = request.query_params.get('model', 'patient')
        data = {'message': 'Export functionality - implement based on model_type', 'model': model_type}
        return respond_with_export(
            request,
            data,
            filename_prefix=f"{model_type}_export",
            title=f"{model_type.title()} Export",
        )


@document_api_view(tag="Reports", summary="Attendance summary report")
class AttendanceSummaryReportView(views.APIView):
    """Generate attendance summary report by patient category."""
    
    def get(self, request):
        """Generate attendance summary with optional date filtering."""
        period_start, period_end = _period_bounds_from_request(
            request, default_to_current_year=True
        )

        history_queryset = Visit.objects.filter(
            status__in=['completed', 'in_progress']
        ).select_related('patient')
        visits_queryset = history_queryset.filter(
            date__gte=period_start,
            date__lte=period_end,
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
        report = {
            'data': categories,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'total_male': total_male,
                'total_female': total_female,
                'grand_total': grand_total,
                **lifecycle_summary,
            }
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="attendance_summary",
            title="Attendance Summary",
        )


@document_api_view(tag="Reports", summary="Visit statistics report")
class VisitStatisticsReportView(views.APIView):
    """
    Visit statistics grouped by day/week/month with status breakdown.

    Query params: start_date, end_date, year, group_by (day|week|month),
    export (json|pdf|csv). Use ``export`` not ``format`` — DRF reserves ``format``.
    """

    def get(self, request):
        from django.utils.dateparse import parse_date

        from reports.visit_statistics import (
            build_visit_statistics_csv,
            build_visit_statistics_report,
        )
        from reports.visit_statistics_pdf import build_visit_statistics_pdf

        from common.report_period import parse_report_period

        year = request.query_params.get("year")
        period = parse_report_period(request)
        group_by = request.query_params.get("group_by", "month")
        export_type = request.query_params.get("export", "json")

        from common.report_period import resolve_report_bounds

        period_start, period_end = resolve_report_bounds(
            period,
            year=year,
            default_to_current_year=not period.all_time,
        )

        if group_by not in ("day", "week", "month"):
            group_by = "month"

        report = build_visit_statistics_report(
            start_date=period_start,
            end_date=period_end,
            group_by=group_by,
        )

        user = request.user
        generated_by = ""
        if user and user.is_authenticated:
            generated_by = user.get_full_name() or getattr(user, "username", "") or ""

        if export_type == "pdf":
            pdf_bytes = build_visit_statistics_pdf(report, generated_by=generated_by)
            filename = f"visit_statistics_{period_start}_{period_end}.pdf"
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        if export_type == "csv":
            csv_text = build_visit_statistics_csv(report)
            filename = f"visit_statistics_{period_start}_{period_end}.csv"
            response = HttpResponse(csv_text, content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        return Response(report)


@document_api_view(tag="Reports", summary="Dispensed prescriptions report")
class DispensedPrescriptionsReportView(views.APIView):
    """
    Prescription orders fully dispensed in the selected period.

    Counts one per :model:`pharmacy.Prescription` row (``status='dispensed'``),
    not per medication line. Query param ``group_by``: day | week | month.
    """

    def get(self, request):
        from reports.dispensed_prescriptions import (
            GROUP_BY_LABELS,
            build_prescription_period_breakdown,
        )

        period_start, period_end = _period_bounds_from_request(
            request, default_to_current_year=True
        )
        group_by = (request.query_params.get("group_by") or "month").strip().lower()
        if group_by not in ("day", "week", "month"):
            group_by = "month"

        prescriptions = Prescription.objects.filter(
            status='dispensed',
            dispensed_at__isnull=False,
            dispensed_at__date__gte=period_start,
            dispensed_at__date__lte=period_end,
        ).select_related('patient')

        period_data = build_prescription_period_breakdown(
            prescriptions,
            group_by=group_by,
            period_start=period_start,
            period_end=period_end,
        )
        total = sum(row["total"] for row in period_data)

        total_patients = prescriptions.values('patient_id').distinct().count()
        male_patients = prescriptions.filter(patient__gender='male').values('patient_id').distinct().count()
        female_patients = prescriptions.filter(patient__gender='female').values('patient_id').distinct().count()

        # Medication lines dispensed (quantities by drug name)
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
        dispense_ids = Dispense.objects.filter(
            dispensed_at__date__gte=period_start,
            dispensed_at__date__lte=period_end,
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
        report = {
            'data': period_data,
            'group_by': group_by,
            'group_by_label': GROUP_BY_LABELS[group_by],
            'summary': {
                'total': total,
                'total_patients': total_patients,
                'total_male': male_patients,
                'total_female': female_patients,
                'grand_total': total_patients,
            },
            'dispensed_items': dispensed_items,
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="prescriptions",
            title="Prescriptions Report",
        )


@document_api_view(tag="Reports", summary="Laboratory attendance report")
class LaboratoryAttendanceReportView(views.APIView):
    """Distinct patients with lab orders in the period, broken down by category."""

    def get(self, request):
        from reports.attendance_statistics import (
            distinct_patient_gender_counts_for_filter,
            mr_categorized_patients_q,
            mr_category_row_filters,
        )

        period_start, period_end = _period_bounds_from_request(
            request, default_to_current_year=True
        )

        history_orders = LabOrder.objects.filter(patient__isnull=False).select_related("patient")
        lab_orders = history_orders.filter(
            ordered_at__date__gte=period_start,
            ordered_at__date__lte=period_end,
        )

        grand_total = lab_orders.values("patient").distinct().count()
        data = []
        total_male = total_female = 0
        officers_total = staff_total = 0
        total_non_employee = 0

        for sn, label, filt in mr_category_row_filters():
            male, female, total = distinct_patient_gender_counts_for_filter(lab_orders, filt)
            total_male += male
            total_female += female
            if sn <= 2:
                officers_total += total if sn == 1 else 0
                staff_total += total if sn == 2 else 0
            else:
                total_non_employee += total
            data.append(
                {
                    "sn": sn,
                    "category": label,
                    "male": male,
                    "female": female,
                    "total": total,
                    "percentage": round((total / grand_total * 100) if grand_total > 0 else 0, 1),
                }
            )

        other_male, other_female, other_total = distinct_patient_gender_counts_for_filter(
            lab_orders, ~mr_categorized_patients_q()
        )
        if other_total > 0:
            total_male += other_male
            total_female += other_female
            total_non_employee += other_total
            data.append(
                {
                    "sn": len(data) + 1,
                    "category": "Other",
                    "male": other_male,
                    "female": other_female,
                    "total": other_total,
                    "percentage": round((other_total / grand_total * 100) if grand_total > 0 else 0, 1),
                }
            )

        total_employee = officers_total + staff_total
        unique_patient_ids = set(lab_orders.values_list("patient_id", flat=True).distinct())

        first_time_patients = 0
        returning_patients = 0
        if period_start and period_end and unique_patient_ids:
            first_lab_date_subquery = history_orders.filter(
                patient=OuterRef("pk")
            ).order_by("ordered_at", "id").values("ordered_at__date")[:1]
            patients_qs = Patient.objects.filter(id__in=unique_patient_ids).annotate(
                first_lab_order_date=Subquery(first_lab_date_subquery, output_field=DateField())
            )
            first_time_patients = patients_qs.filter(
                first_lab_order_date__gte=period_start,
                first_lab_order_date__lte=period_end,
            ).count()
            returning_patients = max(patients_qs.count() - first_time_patients, 0)

        report = {
            "data": data,
            "summary": {
                "total_employee": total_employee,
                "total_non_employee": total_non_employee,
                "total_male": total_male,
                "total_female": total_female,
                "grand_total": grand_total,
                "first_time_patients": first_time_patients,
                "returning_patients": returning_patients,
                "total_unique_patients_seen": grand_total,
                "total_lab_orders": lab_orders.count(),
            },
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="laboratory_attendance",
            title="Laboratory Attendance",
        )


@document_api_view(tag="Reports", summary="Services and activities report")
class ServicesActivitiesReportView(views.APIView):
    """Generate services and activities report."""

    def get(self, request):
        from nursing.procedure_queries import (
            base_procedures_queryset,
            distinct_patient_gender_counts,
            filter_procedures_by_history_type,
            filter_procedures_by_performed_period,
            gender_event_counts,
        )

        from common.report_period import parse_report_period, resolve_report_bounds

        period = parse_report_period(request)
        year = request.query_params.get("year")
        period_start, period_end = resolve_report_bounds(
            period,
            year=year,
            default_to_current_year=not period.all_time and not (period.start and period.end),
        )

        procedures = filter_procedures_by_performed_period(
            base_procedures_queryset(),
            start_date=period_start,
            end_date=period_end,
        )

        injections_qs = filter_procedures_by_history_type(procedures, "injection")
        injections_male = gender_event_counts(injections_qs, "male")
        injections_female = gender_event_counts(injections_qs, "female")
        injections = injections_male + injections_female

        dressing_qs = filter_procedures_by_history_type(procedures, "dressing")
        dressing_male = gender_event_counts(dressing_qs, "male")
        dressing_female = gender_event_counts(dressing_qs, "female")
        dressing = dressing_male + dressing_female

        sick_leave_qs = MedicalCertificate.objects.filter(
            purpose="illness",
            issued_at__date__gte=period_start,
            issued_at__date__lte=period_end,
        ).select_related("patient")
        sick_leave_male = gender_event_counts(sick_leave_qs, "male")
        sick_leave_female = gender_event_counts(sick_leave_qs, "female")
        sick_leave = sick_leave_male + sick_leave_female

        referrals_qs = Referral.objects.filter(
            referred_at__date__gte=period_start,
            referred_at__date__lte=period_end,
        ).select_related("patient")
        referrals_male = gender_event_counts(referrals_qs, "male")
        referrals_female = gender_event_counts(referrals_qs, "female")
        referrals_total = referrals_male + referrals_female

        observations_qs = filter_procedures_by_history_type(procedures, "ward_admission")
        observations_male = gender_event_counts(observations_qs, "male")
        observations_female = gender_event_counts(observations_qs, "female")
        observations = observations_male + observations_female

        categories = [
            {
                "sn": 1,
                "category": "Injections",
                "count": injections,
                "male": injections_male,
                "female": injections_female,
            },
            {
                "sn": 2,
                "category": "Dressing",
                "count": dressing,
                "male": dressing_male,
                "female": dressing_female,
            },
            {
                "sn": 3,
                "category": "Sick Leave",
                "count": sick_leave,
                "male": sick_leave_male,
                "female": sick_leave_female,
            },
            {
                "sn": 4,
                "category": "Referrals",
                "count": referrals_total,
                "male": referrals_male,
                "female": referrals_female,
            },
            {
                "sn": 5,
                "category": "Observations",
                "count": observations,
                "male": observations_male,
                "female": observations_female,
            },
        ]

        total = sum(c["count"] for c in categories)
        total_male, total_female = distinct_patient_gender_counts(
            injections_qs,
            dressing_qs,
            sick_leave_qs,
            referrals_qs,
            observations_qs,
        )
        for row in categories:
            row["percentage"] = round((row["count"] / total * 100) if total > 0 else 0, 1)

        report = {
            "data": categories,
            "summary": {
                "total": total,
                "total_male": total_male,
                "total_female": total_female,
            },
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="services_activities",
            title="Services and Activities",
        )


@document_api_view(tag="Reports", summary="Comprehensive clinical report")
class ComprehensiveReportView(views.APIView):
    """MR executive summary for the selected period."""

    def get(self, request):
        from common.report_period import parse_report_period
        from reports.attendance_statistics import attendable_visits_queryset
        from reports.comprehensive_report import build_comprehensive_report

        period = parse_report_period(request)
        period_start, period_end = _period_bounds_from_request(
            request, default_to_current_year=True
        )
        report = build_comprehensive_report(
            period_start,
            period_end,
            all_time=period.all_time,
            lifecycle_builder=_build_visit_lifecycle_summary,
            attendable_visits_queryset=attendable_visits_queryset,
        )
        return respond_with_export(
            request,
            report,
            filename_prefix="comprehensive",
            title="Comprehensive Report",
        )


@document_api_view(tag="Reports", summary="Clinic attendance report")
class ClinicAttendanceReportView(views.APIView):
    """Generate clinic attendance report by clinic type."""
    
    def get(self, request):
        clinic_type = request.query_params.get('clinic_type', '')
        period_start, period_end = _period_bounds_from_request(
            request, default_to_current_year=True
        )

        # Filter visits by clinic
        history_queryset = Visit.objects.filter(
            status__in=['completed', 'in_progress'],
            clinic__icontains=clinic_type,
        ).select_related('patient')
        visits_queryset = history_queryset.filter(
            date__gte=period_start,
            date__lte=period_end,
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
        report = {
            'data': categories,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'total_male': total_male,
                'total_female': total_female,
                'grand_total': grand_total,
                **lifecycle_summary,
            }
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="clinic_attendance",
            title="Clinic Attendance",
        )


@document_api_view(tag="Reports", summary="Radiological services report")
class RadiologicalServicesReportView(views.APIView):
    """Radiology study volumes by modality for the selected period."""

    def get(self, request):
        from reports.radiological_report import build_radiological_report

        period_start, period_end = _period_bounds_from_request(
            request, default_to_current_year=True
        )
        report = build_radiological_report(period_start, period_end)
        return respond_with_export(
            request,
            report,
            filename_prefix="radiological_services",
            title="Radiological Services",
        )


@document_api_view(tag="Reports", summary="Referral tracking report")
class ReferralTrackingReportView(views.APIView):
    """Referral volume and workflow tracking for the selected period."""

    def get(self, request):
        from reports.referral_tracking_report import build_referral_tracking_report

        period_start, period_end = _period_bounds_from_request(request)
        report = build_referral_tracking_report(period_start, period_end)
        return respond_with_export(
            request,
            report,
            filename_prefix="referral_tracking",
            title="Referral Tracking",
        )


@document_api_view(tag="Reports", summary="Disease pattern report")
class DiseasePatternReportView(views.APIView):
    """ICD-10 diagnosis frequency from completed consultations."""

    def get(self, request):
        from reports.disease_pattern_report import build_disease_pattern_report

        period_start, period_end = _period_bounds_from_request(
            request, default_to_current_year=True
        )
        report = build_disease_pattern_report(period_start, period_end)
        return respond_with_export(
            request,
            report,
            filename_prefix="disease_pattern",
            title="Disease Pattern",
        )


@document_api_view(tag="Reports", summary="GOP attendance report")
class GOPAttendanceReportView(views.APIView):
    """Generate GOPD (general outpatient) attendance report."""
    
    def get(self, request):
        period_start, period_end = _period_bounds_from_request(
            request, default_to_current_year=True
        )

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
        visits = history_visits.filter(
            date__gte=period_start,
            date__lte=period_end,
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
        report = {
            'data': categories,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'total_male': total_male,
                'total_female': total_female,
            'grand_total': grand_total,
                **lifecycle_summary,
            },
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="gop_attendance",
            title="GOPD Attendance",
        )


@document_api_view(tag="Reports", summary="Escort log report")
class EscortLogReportView(views.APIView):
    """Patients escorted from ward to external facilities."""

    def get(self, request):
        from reports.escort_log_report import build_escort_log_report

        period_start, period_end = _period_bounds_from_request(request)
        report = build_escort_log_report(
            period_start,
            period_end,
            status_filter=request.query_params.get("status") or "",
            outcome_filter=request.query_params.get("outcome") or "",
        )
        return respond_with_export(
            request,
            report,
            filename_prefix="escort_log",
            title="Escort Log",
        )


@document_api_view(tag="Reports", summary="Weekend call duty report")
class WeekendCallDutyReportView(views.APIView):
    """Weekend attendable visit volumes and patient breakdown."""

    def get(self, request):
        from reports.attendance_statistics import attendable_visits_queryset
        from reports.weekend_duty_report import build_weekend_duty_report

        period_start, period_end = _period_bounds_from_request(
            request, default_to_current_year=True
        )
        report = build_weekend_duty_report(
            period_start,
            period_end,
            attendable_visits_queryset=attendable_visits_queryset,
        )
        return respond_with_export(
            request,
            report,
            filename_prefix="weekend_duty",
            title="Weekend Call Duty",
        )


@document_api_view(tag="Reports", summary="New registrations report")
class NewRegistrationsReportView(views.APIView):
    """
    New patient registrations in the selected period.

    Returns a daily breakdown of newly registered patients by category,
    plus a summary of total / by-category counts.
    """

    def get(self, request):
        period_start, period_end = _period_bounds_from_request(request)

        qs = Patient.objects.filter(
            is_active=True,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        )

        total = qs.count()

        # By category
        by_category = {}
        for category, _ in Patient.CATEGORY_CHOICES:
            by_category[category] = qs.filter(category=category).count()

        # Daily breakdown
        daily_qs = (
            qs.annotate(registration_date=TruncDay('created_at'))
            .values('registration_date', 'category')
            .annotate(count=Count('id'))
            .order_by('registration_date', 'category')
        )
        daily_data = []
        for row in daily_qs:
            reg_date = row['registration_date']
            daily_data.append({
                'date': reg_date.date().isoformat() if reg_date else None,
                'category': row['category'],
                'count': row['count'],
            })
        report = {
            'total': total,
            'by_category': by_category,
            'daily_data': daily_data,
            'start_date': period_start.isoformat(),
            'end_date': period_end.isoformat(),
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="new_registrations",
            title="New Registrations",
        )


@document_api_view(tag="Reports", summary="Drug expiry watch report")
class DrugExpiryWatchReportView(views.APIView):
    """
    Drug expiry watch — pharmacy inventory batches expiring within N days.

    Query params:
      days (int, default 90) — buckets of 0-30, 31-60, 61-90, 90+
    """

    def get(self, request):
        try:
            days_window = int(request.query_params.get('days', 90))
        except (ValueError, TypeError):
            days_window = 90

        today = timezone.now().date()
        cutoff = today + timedelta(days=days_window)

        qs = (
            MedicationInventory.objects
            .filter(expiry_date__gte=today, expiry_date__lte=cutoff, quantity__gt=0)
            .select_related('medication', 'medication__generic')
            .order_by('expiry_date')
        )

        buckets = {
            '0_30': qs.filter(expiry_date__lte=today + timedelta(days=30)),
            '31_60': qs.filter(expiry_date__gt=today + timedelta(days=30), expiry_date__lte=today + timedelta(days=60)),
            '61_90': qs.filter(expiry_date__gt=today + timedelta(days=60), expiry_date__lte=today + timedelta(days=90)),
            '90_plus': qs.filter(expiry_date__gt=today + timedelta(days=90), expiry_date__lte=cutoff),
        }

        summary = {key: qs_.count() for key, qs_ in buckets.items()}

        # Already expired
        already_expired = MedicationInventory.objects.filter(
            expiry_date__lt=today,
            quantity__gt=0,
        ).count()
        summary['already_expired'] = already_expired

        items = []
        for inv in qs[:500]:  # Cap the list
            days_to_expiry = (inv.expiry_date - today).days
            if days_to_expiry <= 30:
                bucket = '0_30'
            elif days_to_expiry <= 60:
                bucket = '31_60'
            elif days_to_expiry <= 90:
                bucket = '61_90'
            else:
                bucket = '90_plus'
            items.append({
                'id': inv.id,
                'medication_name': inv.medication.name if inv.medication else '',
                'generic_name': inv.medication.generic.name if inv.medication and inv.medication.generic else '',
                'batch_number': inv.batch_number,
                'quantity': float(inv.quantity) if inv.quantity is not None else 0,
                'unit': inv.unit if hasattr(inv, 'unit') else '',
                'expiry_date': inv.expiry_date.isoformat(),
                'days_to_expiry': days_to_expiry,
                'bucket': bucket,
            })
        report = {
            'days_window': days_window,
            'cutoff_date': cutoff.isoformat(),
            'summary': summary,
            'items': items,
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="drug_expiry",
            title="Drug Expiry Watch",
        )


@document_api_view(tag="Reports", summary="Top prescribed drugs report")
class TopPrescribedDrugsReportView(views.APIView):
    """
    Top prescribed drugs in the selected period, aggregated by medication (or generic).
    """

    def get(self, request):
        try:
            limit = int(request.query_params.get('limit', 20))
        except (ValueError, TypeError):
            limit = 20
        period_start, period_end = _period_bounds_from_request(request)

        qs = PrescriptionItem.objects.filter(
            prescription__prescribed_at__date__gte=period_start,
            prescription__prescribed_at__date__lte=period_end,
        )

        # Aggregate by medication (brand), falling back to generic for items without a brand.
        from django.db.models import Sum, F
        rows = (
            qs.annotate(
                drug_name=Coalesce('medication__name', 'generic__name'),
                drug_id=Coalesce('medication__id', 'generic__id'),
            )
            .values('drug_name')
            .annotate(
                total_quantity=Sum('quantity'),
                prescription_count=Count('prescription', distinct=True),
            )
            .order_by('-prescription_count', '-total_quantity')[:limit]
        )

        total_lines = qs.count()
        results = []
        for i, row in enumerate(rows, start=1):
            count = row.get('prescription_count') or 0
            results.append({
                'sn': i,
                'drug_name': row.get('drug_name') or 'Unknown',
                'total_quantity': float(row.get('total_quantity') or 0),
                'prescription_count': count,
                'percentage': round((count / total_lines * 100), 1) if total_lines > 0 else 0,
            })
        report = {
            'total_lines': total_lines,
            'limit': limit,
            'data': results,
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="top_drugs",
            title="Top Prescribed Drugs",
        )


@document_api_view(tag="Reports", summary="Staff productivity report")
class StaffProductivityReportView(views.APIView):
    """
    Staff productivity — visits/consultations handled by each medical doctor in period.
    """

    def get(self, request):
        period_start, period_end = _period_bounds_from_request(request)

        from accounts.models import User
        doctors_qs = User.objects.filter(system_role='Medical Doctor', is_active=True)
        visit_qs = Visit.objects.filter(
            doctor__isnull=False,
            date__gte=period_start,
            date__lte=period_end,
        )

        rows = []
        for doctor in doctors_qs:
            doc_visits = visit_qs.filter(doctor=doctor)
            total = doc_visits.count()
            if total == 0:
                continue
            completed = doc_visits.filter(status='completed').count()
            cancelled = doc_visits.filter(status='cancelled').count()
            in_progress = doc_visits.filter(status='in_progress').count()
            rows.append({
                'doctor_id': doctor.id,
                'doctor_name': doctor.get_full_name() or doctor.username,
                'specialization': getattr(doctor, 'specialization', '') or '',
                'total_visits': total,
                'completed': completed,
                'in_progress': in_progress,
                'cancelled': cancelled,
                'completion_rate': round((completed / total * 100), 1) if total > 0 else 0,
            })

        rows.sort(key=lambda r: r['total_visits'], reverse=True)

        grand_total = sum(r['total_visits'] for r in rows)
        report = {
            'total_visits': grand_total,
            'staff_count': len(rows),
            'data': rows,
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="staff_productivity",
            title="Staff Productivity",
        )


@document_api_view(tag="Reports", summary="Critical lab results report")
class CriticalLabResultsReportView(views.APIView):
    """
    Critical lab results — list of LabResult records flagged as critical in period.
    """

    def get(self, request):
        period_start, period_end = _period_bounds_from_request(request)

        qs = (
            LabResult.objects
            .filter(
                overall_status='critical',
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            )
            .select_related('test', 'test__order', 'patient', 'order__patient')
        )

        total = qs.count()
        items = []
        for r in qs.order_by('-created_at')[:500]:
            test = r.test
            order = test.order if test else r.order
            patient = r.patient
            items.append({
                'id': r.id,
                'patient_id': patient.patient_id if patient else '',
                'patient_name': patient.get_full_name() if patient else '',
                'test_name': test.name if test else '',
                'test_code': test.code if test else '',
                'priority': r.priority,
                'order_id': order.order_id if order else '',
                'created_at': r.created_at.isoformat() if r.created_at else None,
            })
        report = {
            'total': total,
            'items': items,
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="critical_lab",
            title="Critical Lab Results",
        )


@document_api_view(tag="Reports", summary="Notifiable diseases report")
class NotifiableDiseasesReportView(views.APIView):
    """
    Notifiable diseases report — diagnoses whose ICD-10 code falls into Nigeria NCDC
    immediately-notifiable disease categories.

    ICD-10 prefixes covered (Nigeria NCDC list):
      A00  Cholera
      A01  Typhoid/Paratyphoid
      A15-A19  Tuberculosis
      A20  Plague
      A22  Anthrax
      A33-A35  Tetanus (neonatal, obstetric, other)
      A36  Diphtheria
      A39  Meningococcal infection
      A80  Poliomyelitis
      A90  Dengue
      A95  Yellow fever
      A96  Lassa fever
      A98  Other viral haemorrhagic fevers (Ebola, Marburg)
      B03  Smallpox
      B04  Monkeypox
      B05  Measles
      B15-B19  Viral hepatitis
      B50-B54  Malaria
      U07  COVID-19
    """

    NOTIFIABLE_PREFIXES = (
        'A00', 'A01', 'A15', 'A16', 'A17', 'A18', 'A19',
        'A20', 'A22', 'A33', 'A34', 'A35', 'A36', 'A39',
        'A80', 'A90', 'A95', 'A96', 'A98',
        'B03', 'B04', 'B05',
        'B15', 'B16', 'B17', 'B18', 'B19',
        'B50', 'B51', 'B52', 'B53', 'B54',
        'U07',
    )

    NOTIFIABLE_LABELS = {
        'A00': 'Cholera',
        'A01': 'Typhoid/Paratyphoid',
        'A15': 'Tuberculosis (respiratory)',
        'A16': 'Tuberculosis (respiratory)',
        'A17': 'Tuberculosis (nervous system)',
        'A18': 'Tuberculosis (other organs)',
        'A19': 'Miliary tuberculosis',
        'A20': 'Plague',
        'A22': 'Anthrax',
        'A33': 'Tetanus neonatorum',
        'A34': 'Obstetric tetanus',
        'A35': 'Other tetanus',
        'A36': 'Diphtheria',
        'A39': 'Meningococcal infection',
        'A80': 'Poliomyelitis',
        'A90': 'Dengue fever',
        'A95': 'Yellow fever',
        'A96': 'Lassa fever',
        'A98': 'Viral haemorrhagic fevers (Ebola/Marburg)',
        'B03': 'Smallpox',
        'B04': 'Monkeypox',
        'B05': 'Measles',
        'B15': 'Acute hepatitis A',
        'B16': 'Acute hepatitis B',
        'B17': 'Other acute viral hepatitis',
        'B18': 'Chronic viral hepatitis',
        'B19': 'Unspecified viral hepatitis',
        'B50': 'Plasmodium falciparum malaria',
        'B51': 'Plasmodium vivax malaria',
        'B52': 'Plasmodium malariae malaria',
        'B53': 'Other parasitologically confirmed malaria',
        'B54': 'Unspecified malaria',
        'U07': 'COVID-19',
    }

    def get(self, request):
        period_start, period_end = _period_bounds_from_request(request)

        qs = Diagnosis.objects.filter(
            icd10_code__code__startswith=tuple(self.NOTIFIABLE_PREFIXES),
            diagnosed_at__date__gte=period_start,
            diagnosed_at__date__lte=period_end,
        ).select_related('icd10_code', 'patient', 'session', 'diagnosed_by')

        total = qs.count()
        items = []
        for d in qs.order_by('-diagnosed_at')[:500]:
            code = d.icd10_code.code if d.icd10_code else ''
            # Find which prefix matched
            label = next(
                (lbl for prefix, lbl in self.NOTIFIABLE_LABELS.items() if code.startswith(prefix)),
                'Other notifiable',
            )
            items.append({
                'id': d.id,
                'patient_id': d.patient.patient_id if d.patient else '',
                'patient_name': d.patient.get_full_name() if d.patient else '',
                'icd10_code': code,
                'icd10_description': d.icd10_code.description if d.icd10_code else '',
                'disease_label': label,
                'status': d.status,
                'certainty': d.certainty,
                'diagnosed_by': d.diagnosed_by.get_full_name() if d.diagnosed_by else '',
                'diagnosed_at': d.diagnosed_at.isoformat() if d.diagnosed_at else None,
            })
        report = {
            'total': total,
            'items': items,
        }
        return respond_with_export(
            request,
            report,
            filename_prefix="notifiable_diseases",
            title="Notifiable Diseases",
        )


@document_api_view(tag="Reports", summary="Attendance statistics report")
class AttendanceStatisticsReportView(views.APIView):
    """
    BTMC-style attendance matrix by clinic and patient category.

    Query params: start_date, end_date, year, metric (attendance_count|distinct_patients),
    clinic_type (optional single-clinic filter), export (json|pdf|csv).
    Note: use ``export`` not ``format`` — DRF reserves ``format`` for content negotiation.
    """

    def get(self, request):
        from django.utils.dateparse import parse_date

        from reports.attendance_statistics import (
            attendable_visits_queryset,
            build_attendance_statistics_csv,
            build_attendance_statistics_report,
        )
        from reports.attendance_statistics_pdf import build_attendance_statistics_pdf

        from common.report_period import parse_report_period

        year = request.query_params.get("year")
        period = parse_report_period(request)
        metric = request.query_params.get("metric", "attendance_count")
        clinic_type = request.query_params.get("clinic_type") or None
        format_type = request.query_params.get("export", "json")

        if metric not in ("attendance_count", "distinct_patients"):
            metric = "attendance_count"

        from common.report_period import resolve_report_bounds

        period_start, period_end = resolve_report_bounds(
            period,
            year=year,
            default_to_current_year=not period.all_time,
        )

        report = build_attendance_statistics_report(
            start_date=period_start,
            end_date=period_end,
            metric=metric,
            clinic_filter=clinic_type,
        )

        history_qs = Visit.objects.all()
        period_qs = attendable_visits_queryset().filter(
            date__gte=period_start,
            date__lte=period_end,
        )
        lifecycle = _build_visit_lifecycle_summary(
            period_visits_queryset=period_qs,
            history_visits_queryset=history_qs,
            start_date=period_start,
            end_date=period_end,
        )
        report["summary"] = lifecycle

        user = request.user
        generated_by = ""
        if user and user.is_authenticated:
            generated_by = user.get_full_name() or getattr(user, "username", "") or ""

        if format_type == "pdf":
            pdf_bytes = build_attendance_statistics_pdf(
                report, generated_by=generated_by
            )
            filename = f"attendance_statistics_{period_start}_{period_end}.pdf"
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        if format_type == "csv":
            csv_text = build_attendance_statistics_csv(report)
            filename = f"attendance_statistics_{period_start}_{period_end}.csv"
            response = HttpResponse(csv_text, content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        return Response(report)