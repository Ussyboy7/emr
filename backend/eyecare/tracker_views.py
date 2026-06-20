"""Cross-workflow eyecare patient lookup for dashboard search."""
import re

from django.db.models import Prefetch, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.openapi import document_api_view
from accounts.utils import resolve_clinic_id
from organization.models import SystemConfig
from eyecare.models import EyeOrder, EyeSession


def _status_display(status: str) -> str:
    return dict(EyeOrder.STATUS_CHOICES).get(status, status.replace('_', ' ').title())


def _orders_tab_for_status(status: str) -> str:
    if status in ('pending', 'scheduled'):
        return 'pending'
    if status == 'in_progress':
        return 'in_progress'
    if status == 'cancelled':
        return 'cancelled'
    if status == 'completed':
        return 'completed'
    return 'all'


def _format_eye_id(pk: int) -> str:
    return f'EYE-{pk:06d}'


def _filter_orders_by_search(qs, search: str):
    term = search.strip()
    if not term:
        return qs
    q = Q()
    if term.isdigit():
        q |= Q(pk=int(term))
    m = re.match(r'^EYE-(\d+)$', term, re.IGNORECASE)
    if m:
        q |= Q(pk=int(m.group(1)))
    return qs.filter(
        q
        | Q(patient__patient_id__icontains=term)
        | Q(patient__surname__icontains=term)
        | Q(patient__first_name__icontains=term)
        | Q(patient__middle_name__icontains=term)
        | Q(diagnosis__icontains=term)
        | Q(chief_complaint__icontains=term)
    ).distinct()


def _scope_orders_for_user(qs, user):
    if SystemConfig.is_enabled('multi_clinic_enabled'):
        clinic_id = resolve_clinic_id(user)
        if clinic_id is not None:
            qs = qs.filter(location_clinic_id=clinic_id)
    return qs


@document_api_view(tag="Eyecare", summary="Cross-workflow eyecare patient tracker")
class EyecarePatientTrackerView(APIView):
    """
    GET /eyecare/patient-tracker/?search=...

    Returns eye clinic orders/sessions with screen/tab hints for the frontend.
    """

    def get(self, request):
        search = (request.query_params.get('search') or '').strip()
        if len(search) < 1:
            return Response({'search': '', 'results': []})

        hits = []
        seen = set()

        orders_qs = (
            EyeOrder.objects.all()
            .select_related('patient', 'ordered_by')
            .prefetch_related(
                Prefetch('sessions', queryset=EyeSession.objects.order_by('id'))
            )
        )
        orders_qs = _scope_orders_for_user(orders_qs, request.user)
        orders_qs = _filter_orders_by_search(orders_qs, search)[:40]

        for order in orders_qs:
            patient = order.patient
            patient_name = patient.get_full_name() if patient else ''
            patient_id = getattr(patient, 'patient_id', '') or ''
            order_label = _format_eye_id(order.pk)
            summary = (order.diagnosis or order.chief_complaint or '')[:120]

            key = ('order', order.id)
            if key not in seen:
                seen.add(key)
                status = order.status
                if status == 'completed':
                    screen = 'completed'
                    tab = 'completed'
                    screen_label = 'Completed Sessions'
                    tab_label = 'Completed'
                    is_active = False
                else:
                    screen = 'orders'
                    tab = _orders_tab_for_status(status)
                    screen_label = 'Eye Orders'
                    tab_label = {
                        'pending': 'Pending',
                        'in_progress': 'In Progress',
                        'cancelled': 'Cancelled',
                        'completed': 'Completed',
                        'all': 'All',
                    }.get(tab, tab)
                    is_active = True

                hits.append({
                    'patient_name': patient_name,
                    'patient_id': patient_id,
                    'item_name': summary or 'Eye clinic order',
                    'item_code': order_label,
                    'item_status': status,
                    'item_status_display': _status_display(status),
                    'order_id': order_label,
                    'clinic': None,
                    'screen': screen,
                    'tab': tab,
                    'screen_label': screen_label,
                    'tab_label': tab_label,
                    'href_screen': 'orders' if is_active else 'completed',
                    'is_active': is_active,
                })

            for session in order.sessions.all():
                skey = ('session', session.id)
                if skey in seen:
                    continue
                seen.add(skey)
                if session.status != 'completed':
                    continue
                hits.append({
                    'patient_name': patient_name,
                    'patient_id': patient_id,
                    'item_name': f'Session {session.session_number}',
                    'item_code': _format_eye_id(session.pk),
                    'item_status': session.status,
                    'item_status_display': session.status.replace('_', ' ').title(),
                    'order_id': order_label,
                    'clinic': None,
                    'screen': 'completed',
                    'tab': 'completed',
                    'screen_label': 'Completed Sessions',
                    'tab_label': 'Completed',
                    'href_screen': 'completed',
                    'is_active': False,
                })

        hits.sort(key=lambda h: (not h['is_active'], h['patient_name'], h['item_name']))

        return Response({'search': search, 'results': hits})
