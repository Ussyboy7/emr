"""
Analytics views for the main clinical dashboard.
"""
import json
from datetime import datetime, timedelta
from typing import Any, Dict

from django.db.models import Avg, Count, F, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.cache import cache_page
from django.views.decorators.http import require_GET

from patients.models import Patient, Visit
from laboratory.models import LabOrder
from pharmacy.models import Prescription
from consultation.models import ConsultationSession


@require_GET
def clinical_dashboard_analytics(request):
    """
    Comprehensive clinical dashboard analytics.
    """
    # Comprehensive dummy data for testing
    data = {
        'period': {
            'start_date': '2026-01-01',
            'end_date': '2026-12-31'
        },
        'metrics': {
            'total_patients': 3299,
            'total_visits': 15,
            'avg_wait_time_minutes': 22.0,
            'completion_rate_percentage': 98.5
        },
        'overview': {
            'patients': 3299,
            'clinical': 15,
            'laboratory': 85,
            'pharmacy': 45
        },
        'visits_trend': [
            {'month': 'May 2026', 'visits': 15, 'newPatients': 12},
            {'month': 'Apr 2026', 'visits': 12, 'newPatients': 9}
        ],
        'clinic_distribution': {
            'GOPD': 13,
            'Eye Clinic': 2,
            'Other': 0
        },
        'patient_demographics_percentages': {
            'employee': 79,
            'retiree': 11,
            'non_npa': 0,
            'dependent': 10
        },
        'top_diagnoses': [
            {'diagnosis': 'I10 - Essential (primary) hypertension', 'cases': 128},
            {'diagnosis': 'B50.9 - Plasmodium falciparum malaria, unspecified', 'cases': 34},
            {'diagnosis': 'N40 - Benign prostatic hyperplasia', 'cases': 21},
            {'diagnosis': 'J06.9 - Acute upper respiratory infection, unspecified', 'cases': 14},
            {'diagnosis': 'Z00.0 - General medical examination', 'cases': 14},
            {'diagnosis': 'C39.0 - Upper respiratory tract, part unspecified', 'cases': 9},
            {'diagnosis': 'E08.8 - Diabetes mellitus due to underlying condition with unspecified complications', 'cases': 8},
            {'diagnosis': 'N39.0 - Urinary tract infection, site not specified', 'cases': 6},
            {'diagnosis': 'N73.9 - Female pelvic inflammatory disease, unspecified', 'cases': 6},
            {'diagnosis': 'E08.6 - Diabetes mellitus due to underlying condition with other specified complications', 'cases': 5}
        ],
        'consultation_metrics': {
            'completed_sessions': 15,
            'avg_duration': 22,
            'avg_wait_time': 22
        },
        'lab_metrics': {
            'tests_this_month': 0,
            'avg_turnaround_hours': 35.8,
            'completion_rate': 98.5
        },
        'test_distribution': [
            {'test': 'Full Blood Count', 'count': 30},
            {'test': 'Malaria Parasite', 'count': 19},
            {'test': 'Liver Function Test', 'count': 13},
            {'test': 'Renal Function Test', 'count': 13},
            {'test': 'Lipid Profile', 'count': 12}
        ],
        'pharmacy_metrics': {
            'dispensed_this_month': 0,
            'pending_orders': 1,
            'avg_wait_time': 45,
            'low_stock_items': 256
        },
        'weekly_activity': [
            {'day': 'Mon', 'patients': 2, 'consultations': 2, 'lab_tests': 1, 'prescriptions': 1},
            {'day': 'Tue', 'patients': 2, 'consultations': 2, 'lab_tests': 1, 'prescriptions': 1},
            {'day': 'Wed', 'patients': 2, 'consultations': 2, 'lab_tests': 1, 'prescriptions': 1},
            {'day': 'Thu', 'patients': 2, 'consultations': 2, 'lab_tests': 1, 'prescriptions': 1},
            {'day': 'Fri', 'patients': 2, 'consultations': 2, 'lab_tests': 1, 'prescriptions': 1},
            {'day': 'Sat', 'patients': 2, 'consultations': 2, 'lab_tests': 1, 'prescriptions': 1},
            {'day': 'Sun', 'patients': 1, 'consultations': 1, 'lab_tests': 0, 'prescriptions': 1}
        ],
        'patient_demographics': {
            'attendance_by_category': [
                {'sn': 1, 'key': 'officers', 'label': 'Officers', 'male': 0, 'female': 0, 'total': 0, 'percentage': 0},
                {'sn': 2, 'key': 'staff', 'label': 'Staff', 'male': 8, 'female': 1, 'total': 9, 'percentage': 90.0},
                {'sn': 3, 'key': 'employee_dependents', 'label': 'Employee Dependents', 'male': 1, 'female': 0, 'total': 1, 'percentage': 10.0},
                {'sn': 4, 'key': 'retiree_dependents', 'label': 'Retiree Dependents', 'male': 0, 'female': 0, 'total': 0, 'percentage': 0},
                {'sn': 5, 'key': 'non_npa', 'label': 'Non-NPA', 'male': 0, 'female': 0, 'total': 0, 'percentage': 0},
                {'sn': 6, 'key': 'retirees', 'label': 'Retirees', 'male': 0, 'female': 0, 'total': 0, 'percentage': 0}
            ],
            'attendance_totals': {'male': 9, 'female': 1, 'total': 10}
        }
    }

    return JsonResponse(data)