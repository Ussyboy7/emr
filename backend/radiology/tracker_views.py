"""Cross-workflow radiology patient lookup for dashboard search."""
from django.db.models import Prefetch, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.openapi import document_api_view
from radiology.models import RadiologyOrder, RadiologyReport, RadiologyStudy


def _study_status_display(status: str) -> str:
    choices = dict(RadiologyStudy.STATUS_CHOICES)
    if status == 'rejected':
        return 'Rejected'
    return choices.get(status, status.replace('_', ' ').title())


def _orders_tab_for_status(status: str) -> str:
    if status in ('pending', 'scheduled', 'acquired'):
        return 'pending'
    if status == 'processing':
        return 'processing'
    if status == 'reported':
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
        | Q(dispatches__dispatch_id__icontains=term)
        | Q(patient__patient_id__icontains=term)
        | Q(patient__surname__icontains=term)
        | Q(patient__first_name__icontains=term)
        | Q(patient__middle_name__icontains=term)
        | Q(studies__procedure__icontains=term)
        | Q(studies__modality__icontains=term)
        | Q(studies__body_part__icontains=term)
    ).distinct()


def _filter_reports_by_search(qs, search: str):
    term = search.strip()
    if not term:
        return qs
    return qs.filter(
        Q(order__order_id__icontains=term)
        | Q(order__dispatches__dispatch_id__icontains=term)
        | Q(study__procedure__icontains=term)
        | Q(study__modality__icontains=term)
        | Q(patient__patient_id__icontains=term)
        | Q(patient__surname__icontains=term)
        | Q(patient__first_name__icontains=term)
        | Q(patient__middle_name__icontains=term)
    ).distinct()


@document_api_view(tag="Radiology", summary="Cross-workflow radiology patient tracker")
class RadiologyPatientTrackerView(APIView):
    """
    GET /radiology/patient-tracker/?search=...

    Returns active and completed radiology studies for a patient search term
    with screen/tab hints for the frontend.
    """

    def get(self, request):
        search = (request.query_params.get('search') or '').strip()
        if len(search) < 1:
            return Response({'search': '', 'results': []})

        hits = []
        seen = set()

        orders_qs = (
            RadiologyOrder.objects.all()
            .select_related('patient', 'doctor')
            .prefetch_related(
                Prefetch('studies', queryset=RadiologyStudy.objects.select_related('template').order_by('id'))
            )
        )
        orders_qs = _filter_orders_by_search(orders_qs, search)[:40]

        for order in orders_qs:
            patient = order.patient
            patient_name = patient.get_full_name() if patient else ''
            patient_id = getattr(patient, 'patient_id', '') or ''
            clinic = order.clinic or ''
            for study in order.studies.all():
                key = ('study', study.id)
                if key in seen:
                    continue
                seen.add(key)

                status = study.status
                if status == 'verified':
                    screen = 'completed'
                    tab = 'verified'
                    screen_label = 'Completed Reports'
                    tab_label = 'Verified'
                    href_screen = 'completed'
                else:
                    screen = 'radiology_orders'
                    tab = _orders_tab_for_status(status)
                    screen_label = 'Study Orders'
                    tab_label = {
                        'pending': 'Pending',
                        'processing': 'Processing',
                        'results': 'Results',
                        'rejected': 'Rejected',
                        'all': 'All',
                    }.get(tab, tab)
                    href_screen = 'orders'

                hits.append({
                    'patient_name': patient_name,
                    'patient_id': patient_id,
                    'study_name': study.procedure,
                    'modality': study.modality or '',
                    'study_status': status,
                    'study_status_display': _study_status_display(status),
                    'order_id': order.order_id,
                    'clinic': clinic,
                    'screen': screen,
                    'tab': tab,
                    'screen_label': screen_label,
                    'tab_label': tab_label,
                    'href_screen': href_screen,
                    'is_active': status != 'verified',
                })

        pending_verification = (
            RadiologyReport.objects.filter(study__status='reported')
            .select_related('patient', 'order', 'study')
        )
        pending_verification = _filter_reports_by_search(pending_verification, search)[:40]

        for row in pending_verification:
            study = row.study
            key = ('study', study.id)
            if key in seen:
                continue
            seen.add(key)
            patient = row.patient
            hits.append({
                'patient_name': patient.get_full_name() if patient else '',
                'patient_id': getattr(patient, 'patient_id', '') or '',
                'study_name': study.procedure,
                'modality': study.modality or '',
                'study_status': study.status,
                'study_status_display': _study_status_display(study.status),
                'order_id': row.order.order_id if row.order else None,
                'clinic': row.order.clinic if row.order else None,
                'screen': 'verification',
                'tab': 'pending',
                'screen_label': 'Verify Reports',
                'tab_label': 'Pending Review',
                'href_screen': 'verification',
                'is_active': True,
            })

        hits.sort(key=lambda h: (not h['is_active'], h['patient_name'], h['study_name']))

        return Response({'search': search, 'results': hits})
