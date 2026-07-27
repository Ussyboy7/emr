from rest_framework.exceptions import PermissionDenied

from permissions.user_capabilities import user_has_capability


def ensure_doctor_action(user, message="Only doctors can perform this ward action."):
    if getattr(user, "is_superuser", False):
        return
    if user_has_capability(user, "ward_order_create") or user_has_capability(user, "ward_order_edit"):
        return
    raise PermissionDenied(message)


def ensure_nurse_action(user, message="Only nurses can perform this ward action."):
    if getattr(user, "is_superuser", False):
        return
    if user_has_capability(user, "ward_order_perform"):
        return
    raise PermissionDenied(message)
