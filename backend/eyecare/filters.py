import django_filters as filters
from django.db.models import Q

from common.session_filters import (
    filter_nonempty_findings,
    filter_nonempty_order_diagnosis,
    filter_session_search,
)

from .models import EyeSession


class EyeSessionFilter(filters.FilterSet):
    completed_after = filters.IsoDateTimeFilter(field_name="completed_at", lookup_expr="gte")
    completed_before = filters.IsoDateTimeFilter(field_name="completed_at", lookup_expr="lte")
    search = filters.CharFilter(method="filter_search")
    has_diagnosis = filters.BooleanFilter(method="filter_has_diagnosis")
    has_findings = filters.BooleanFilter(method="filter_has_findings")
    is_urgent = filters.BooleanFilter(method="filter_is_urgent")

    class Meta:
        model = EyeSession
        fields = [
            "order",
            "status",
            "scheduled_at",
            "search",
            "has_diagnosis",
            "has_findings",
            "is_urgent",
        ]

    def filter_search(self, queryset, name, value):
        term = (value or "").strip()
        if not term:
            return queryset
        extra = Q(order__chief_complaint__icontains=term) | Q(
            findings__icontains=term
        ) | Q(procedures_performed__icontains=term)
        return filter_session_search(queryset, term, extra_q=extra)

    def filter_has_diagnosis(self, queryset, name, value):
        return filter_nonempty_order_diagnosis(queryset, value)

    def filter_has_findings(self, queryset, name, value):
        return filter_nonempty_findings(queryset, value, field_name="findings")

    def filter_is_urgent(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(order__priority__in=["urgent", "emergency", "stat"])
