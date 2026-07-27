"""Reusable DRF fields for API serializers."""

from django.contrib.auth import get_user_model
from rest_framework import serializers


class OptionalUserPrimaryKeyField(serializers.PrimaryKeyRelatedField):
    """Accept a user PK when it exists; otherwise treat the field as unset."""

    def __init__(self, **kwargs):
        User = get_user_model()
        kwargs.setdefault('queryset', User.objects.all())
        kwargs.setdefault('required', False)
        kwargs.setdefault('allow_null', True)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        if data is None or data == '':
            return None
        try:
            return super().to_internal_value(data)
        except serializers.ValidationError:
            return None
