"""FilterSet for appointment list (date range + standard fields)."""
import django_filters

from .models import Appointment


class AppointmentFilter(django_filters.FilterSet):
    start_date = django_filters.DateFilter(field_name="appointment_date", lookup_expr="gte")
    end_date = django_filters.DateFilter(field_name="appointment_date", lookup_expr="lte")

    class Meta:
        model = Appointment
        fields = [
            "patient",
            "doctor",
            "clinic",
            "status",
            "appointment_type",
            "appointment_date",
        ]
