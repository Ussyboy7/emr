"""Patient photo URL helpers for serializers across the EMR."""


def patient_photo_url(patient) -> str | None:
    if patient is None:
        return None
    photo = getattr(patient, "photo", None)
    if not photo:
        return None
    try:
        return photo.url
    except (ValueError, AttributeError):
        return None
