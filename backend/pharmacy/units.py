"""Canonical dose-unit inference for generics and prescription lines."""

from __future__ import annotations


def infer_dose_unit(dosage_form: str | None) -> str:
    """Map dosage form text to a canonical prescribed unit."""
    f = (dosage_form or "").strip().lower()
    if not f:
        return "tablet"
    if any(k in f for k in ("tablet", "caplet", "chewable")):
        return "tablet"
    if any(k in f for k in ("capsule", "softgel")):
        return "capsule"
    if any(k in f for k in ("syrup", "suspension", "solution", "oral liquid")):
        return "ml"
    if any(k in f for k in ("injection", "vial", "ampoule")):
        return "vial"
    if any(k in f for k in ("inhaler", "puff")):
        return "puff"
    if any(k in f for k in ("cream", "ointment", "gel", "lotion")):
        return "tube"
    if any(k in f for k in ("drop", "eye", "ear", "otic")):
        return "drop"
    if "sachet" in f:
        return "sachet"
    if "suppository" in f:
        return "suppository"
    if "patch" in f:
        return "patch"
    if "bottle" in f:
        return "bottle"
    return f


def resolve_prescription_unit(
    *,
    unit: str | None,
    dosage_form: str | None,
    generic_unit: str | None = None,
    medication_unit: str | None = None,
) -> str:
    """
    Choose the unit stored on PrescriptionItem.

    Prefer explicit medication/generic units; infer from dosage form when blank
    or when a legacy default (tablet) conflicts with softgel/capsule forms.
    """
    form_inferred = infer_dose_unit(dosage_form)
    for candidate in (medication_unit, generic_unit, unit):
        if candidate is None:
            continue
        cleaned = str(candidate).strip().lower()
        if not cleaned:
            continue
        if cleaned in ("tablets",):
            cleaned = "tablet"
        if cleaned in ("capsules",):
            cleaned = "capsule"
        if cleaned in ("vials",):
            cleaned = "vial"
        if cleaned in ("puffs",):
            cleaned = "puff"
        if cleaned in ("drops",):
            cleaned = "drop"
        if cleaned in ("tubes",):
            cleaned = "tube"
        if cleaned in ("bottles",):
            cleaned = "bottle"
        if cleaned in ("sachets",):
            cleaned = "sachet"
        if cleaned in ("suppositories",):
            cleaned = "suppository"
        if cleaned in ("patches",):
            cleaned = "patch"
        if cleaned in ("ampoules",):
            cleaned = "ampoule"
        if cleaned == "tablet" and form_inferred == "capsule":
            return "capsule"
        return cleaned
    return form_inferred
