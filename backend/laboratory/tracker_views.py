"""Cross-workflow lab patient lookup for dashboard search."""
from django.db.models import Prefetch, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.openapi import document_api_view
from laboratory.models import LabOrder, LabResult, LabTest


def _test_status_display(status: str) -> str:
    return dict(LabTest.STATUS_CHOICES).get(status, status.replace('_', ' ').title())


def _orders_tab_for_status(status: str) -> str:
    if status == 'pending':
        return 'pending'
    if status in ('sample_collected', 'processing'):
        return 'processing'
    if status == 'results_ready':
        return 'results'
    if status == 'rejected':
        return 'rejected'
    return 'all'


def _filter_orders_by_search(qs, search: str):
    term = search.strip()
    if not term:
        return qs
    return qs.filter(
        Q(order_id__icontains=term)
        | Q(lab_number__icontains=term)
        | Q(tests__lab_number__icontains=term)
        | Q(patient__patient_id__icontains=term)
        | Q(patient__surname__icontains=term)
        | Q(patient__first_name__icontains=term)
        | Q(patient__middle_name__icontains=term)
    ).distinct()


def _filter_results_by_search(qs, search: str):
    term = search.strip()
    if not term:
        return qs
    return qs.filter(
        Q(order__order_id__icontains=term)
        | Q(order__lab_number__icontains=term)
        | Q(test__lab_number__icontains=term)
        | Q(test__code__icontains=term)
        | Q(test__name__icontains=term)
        | Q(patient__patient_id__icontains=term)
        | Q(patient__surname__icontains=term)
        | Q(patient__first_name__icontains=term)
        | Q(patient__middle_name__icontains=term)
    ).distinct()


@document_api_view(tag="Laboratory", summary="Cross-workflow lab patient tracker")
class LaboratoryPatientTrackerView(APIView):
    """
    GET /laboratory/patient-tracker/?search=...

    Returns active and completed lab tests for a patient search term with
    screen/tab hints for the frontend.
    """

    def get(self, request):
        search = (request.query_params.get('search') or '').strip()
        if len(search) < 1:
            return Response({'search': '', 'results': []})

        hits = []
        seen = set()

        orders_qs = (
            LabOrder.objects.all()
            .select_related('patient', 'doctor')
            .prefetch_related(
                Prefetch('tests', queryset=LabTest.objects.select_related('template').order_by('id'))
            )
        )
        orders_qs = _filter_orders_by_search(orders_qs, search)[:40]

        for order in orders_qs:
            patient = order.patient
            patient_name = patient.get_full_name() if patient else ''
            patient_id = getattr(patient, 'patient_id', '') or ''
            clinic = order.clinic or ''
            for test in order.tests.all():
                key = ('test', test.id)
                if key in seen:
                    continue
                seen.add(key)

                status = test.status
                if status == 'verified':
                    screen = 'completed'
                    tab = 'verified'
                    screen_label = 'Completed Tests'
                    tab_label = 'Verified'
                    href_screen = 'completed'
                else:
                    screen = 'lab_orders'
                    tab = _orders_tab_for_status(status)
                    screen_label = 'Lab Orders'
                    tab_label = {
                        'pending': 'Pending',
                        'processing': 'Processing',
                        'results': 'Results',
                        'rejected': 'Rework Required',
                        'all': 'All',
                    }.get(tab, tab)
                    href_screen = 'orders'

                hits.append({
                    'patient_name': patient_name,
                    'patient_id': patient_id,
                    'test_name': test.name,
                    'test_code': test.code,
                    'test_status': status,
                    'test_status_display': _test_status_display(status),
                    'lab_number': test.lab_number or order.lab_number,
                    'order_id': order.order_id,
                    'clinic': clinic,
                    'screen': screen,
                    'tab': tab,
                    'screen_label': screen_label,
                    'tab_label': tab_label,
                    'href_screen': href_screen,
                    'is_active': status != 'verified',
                })

        # Results awaiting verification (may overlap results_ready on orders — dedupe by test id)
        pending_verification = (
            LabResult.objects.filter(test__status='results_ready')
            .select_related('patient', 'order', 'test')
        )
        pending_verification = _filter_results_by_search(pending_verification, search)[:40]

        for row in pending_verification:
            test = row.test
            key = ('test', test.id)
            if key in seen:
                continue
            seen.add(key)
            patient = row.patient
            hits.append({
                'patient_name': patient.get_full_name() if patient else '',
                'patient_id': getattr(patient, 'patient_id', '') or '',
                'test_name': test.name,
                'test_code': test.code,
                'test_status': test.status,
                'test_status_display': _test_status_display(test.status),
                'lab_number': test.lab_number or (row.order.lab_number if row.order else None),
                'order_id': row.order.order_id if row.order else None,
                'clinic': row.order.clinic if row.order else None,
                'screen': 'verification',
                'tab': 'pending',
                'screen_label': 'Verify Results',
                'tab_label': 'Pending Review',
                'href_screen': 'verification',
                'is_active': True,
            })

        hits.sort(key=lambda h: (not h['is_active'], h['patient_name'], h['test_name']))

        return Response({'search': search, 'results': hits})
