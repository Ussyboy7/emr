from rest_framework import serializers

from support.ticket_utils import SUPPORT_TICKET_STATUSES


class SupportTicketSerializer(serializers.Serializer):
    category = serializers.ChoiceField(
        choices=["technical", "access", "feature", "training", "other"],
    )
    priority = serializers.ChoiceField(
        choices=["low", "medium", "high", "critical"],
        default="medium",
    )
    subject = serializers.CharField(max_length=200)
    description = serializers.CharField(max_length=5000)


class SupportTicketStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=SUPPORT_TICKET_STATUSES)
