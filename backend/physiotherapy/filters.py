import django_filters as filters
from django.db.models import Q

from common.session_filters import (
    filter_nonempty_findings,
    filter_nonempty_order_diagnosis,
    filter_session_search,
)

from .models import PhysioOrder, PhysioSession


class PhysioOrderFilter(filters.FilterSet):
    ordered_at_after = filters.DateFilter(field_name="ordered_at", lookup_expr="date__gte")
    ordered_at_before = filters.DateFilter(field_name="ordered_at", lookup_expr="date__lte")

    class Meta:
        model = PhysioOrder
        fields = ["status", "priority", "patient", "visit", "consultation_session", "referral_source"]


class PhysioSessionFilter(filters.FilterSet):
    completed_after = filters.IsoDateTimeFilter(field_name="completed_at", lookup_expr="gte")
    completed_before = filters.IsoDateTimeFilter(field_name="completed_at", lookup_expr="lte")
    search = filters.CharFilter(method="filter_search")
    has_diagnosis = filters.BooleanFilter(method="filter_has_diagnosis")
    has_findings = filters.BooleanFilter(method="filter_has_findings")
    is_urgent = filters.BooleanFilter(method="filter_is_urgent")
    has_recommendations = filters.BooleanFilter(method="filter_has_recommendations")

    class Meta:
        model = PhysioSession
        fields = [
            "status",
            "physiotherapist",
            "order",
            "search",
            "has_diagnosis",
            "has_findings",
            "is_urgent",
            "has_recommendations",
        ]

    def filter_search(self, queryset, name, value):
        term = (value or "").strip()
        if not term:
            return queryset
        extra = (
            Q(assessment_findings__icontains=term)
            | Q(diagnosis_impression__icontains=term)
            | Q(treatment_performed__icontains=term)
        )
        return filter_session_search(queryset, term, extra_q=extra)

    def filter_has_diagnosis(self, queryset, name, value):
        return filter_nonempty_order_diagnosis(queryset, value)

    def filter_has_findings(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(
            Q(assessment_findings__gt="")
            | Q(diagnosis_impression__gt="")
            | Q(treatment_performed__gt="")
        )

    def filter_is_urgent(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(order__priority__in=["urgent", "high"])

    def filter_has_recommendations(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.exclude(recommendations=[])
