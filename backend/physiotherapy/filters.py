import django_filters as filters
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

    class Meta:
        model = PhysioSession
        fields = ["status", "physiotherapist", "order"]
