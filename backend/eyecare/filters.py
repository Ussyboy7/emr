import django_filters as filters
from .models import EyeSession


class EyeSessionFilter(filters.FilterSet):
    completed_after = filters.IsoDateTimeFilter(field_name="completed_at", lookup_expr="gte")
    completed_before = filters.IsoDateTimeFilter(field_name="completed_at", lookup_expr="lte")

    class Meta:
        model = EyeSession
        fields = ["order", "status", "scheduled_at"]
