import django_filters as filters
from .models import PhysioSession


class PhysioSessionFilter(filters.FilterSet):
    completed_after = filters.IsoDateTimeFilter(field_name="completed_at", lookup_expr="gte")
    completed_before = filters.IsoDateTimeFilter(field_name="completed_at", lookup_expr="lte")

    class Meta:
        model = PhysioSession
        fields = ["status", "physiotherapist", "order"]
