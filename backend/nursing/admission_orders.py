"""Link nursing orders to ward admissions and scope lists for Ward Care."""
from __future__ import annotations

from django.db.models import QuerySet
from django.utils import timezone

from wards.models import PatientAdmission


ACTIVE_ADMISSION_STATUSES = ('admitted', 'pending_discharge')


def resolve_active_admission(*, patient_id: int, visit_id: int | None) -> PatientAdmission | None:
    """Return the current ward stay for this patient on the given visit, if any."""
    if not patient_id or not visit_id:
        return None
    return (
        PatientAdmission.objects.filter(
            patient_id=patient_id,
            visit_id=visit_id,
            status__in=ACTIVE_ADMISSION_STATUSES,
        )
        .order_by('-admission_date')
        .first()
    )


def link_nursing_orders_to_admission(admission: PatientAdmission) -> int:
    """
    Attach visit-scoped nursing orders that were created without an admission FK
    (e.g. consultation handoff + injection sent in parallel).
    """
    if not admission.patient_id or not admission.visit_id:
        return 0

    qs = (
        admission.patient.nursing_orders.filter(
            visit_id=admission.visit_id,
            admission__isnull=True,
            ordered_at__gte=admission.admission_date,
        )
        .exclude(is_informational=True)
        .exclude(order_type__iexact='observation admission')
        .exclude(order_type__iexact='ward admission')
    )
    return qs.update(admission_id=admission.pk)


def filter_orders_for_admission(qs: QuerySet, admission_id: int) -> QuerySet:
    """
    Orders for a single ward admission chart — strictly this stay only.

    Do not include other visit-scoped consultation orders; those are linked at
    create time or via link_nursing_orders_to_admission after admission.
    """
    admission = PatientAdmission.objects.filter(pk=admission_id).first()
    if not admission:
        return qs.none()

    window_end = admission.discharge_date or timezone.now()
    return qs.filter(
        admission_id=admission.pk,
        patient_id=admission.patient_id,
        ordered_at__gte=admission.admission_date,
        ordered_at__lte=window_end,
    )
