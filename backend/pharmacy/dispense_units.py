"""Pack vs unit quantity rules for pharmacy issue and dispense flows."""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError

DISPENSE_MODE_PACK_ONLY = "pack_only"
DISPENSE_MODE_UNITS_ONLY = "units_only"
DISPENSE_MODE_PACK_OR_UNITS = "pack_or_units"

DISPENSE_MODE_CHOICES = (
    (DISPENSE_MODE_PACK_ONLY, "Whole packs only"),
    (DISPENSE_MODE_UNITS_ONLY, "Individual units only"),
    (DISPENSE_MODE_PACK_OR_UNITS, "Pack or units (choose at issue)"),
)

QUANTITY_ENTRY_PACK = "pack"
QUANTITY_ENTRY_UNITS = "units"

QUANTITY_ENTRY_CHOICES = (
    (QUANTITY_ENTRY_PACK, "Pack"),
    (QUANTITY_ENTRY_UNITS, "Units"),
)

_PACK_ONLY_UNITS = frozenset(
    {"bottle", "bottles", "box", "pack", "vial", "tube", "jar"}
)
_PACK_OR_UNITS_UNITS = frozenset({"tablet", "capsule", "caplet"})
_PACK_ONLY_FORMS = (
    "syrup",
    "suspension",
    "cream",
    "ointment",
    "gel",
    "lotion",
    "injection",
    "drop",
    "drops",
)


def infer_dispense_mode(unit: str = "", form: str = "") -> str:
    u = (unit or "").strip().lower()
    f = (form or "").strip().lower()
    if u in _PACK_OR_UNITS_UNITS:
        return DISPENSE_MODE_PACK_OR_UNITS
    if u in _PACK_ONLY_UNITS:
        return DISPENSE_MODE_PACK_ONLY
    if any(token in f for token in _PACK_ONLY_FORMS):
        return DISPENSE_MODE_PACK_ONLY
    return DISPENSE_MODE_UNITS_ONLY


def effective_dispense_mode(medication) -> str:
    mode = (getattr(medication, "dispense_mode", None) or "").strip()
    if mode in dict(DISPENSE_MODE_CHOICES):
        return mode
    return infer_dispense_mode(
        getattr(medication, "unit", "") or "",
        getattr(medication, "form", "") or "",
    )


def medication_pack_size(medication) -> Decimal:
    raw = getattr(medication, "pack_size", None)
    try:
        size = Decimal(str(raw if raw not in (None, "") else 1))
    except Exception:
        size = Decimal("1")
    return size if size > 0 else Decimal("1")


def normalize_entry_mode(entry_mode: str | None) -> str:
    mode = (entry_mode or QUANTITY_ENTRY_UNITS).strip().lower()
    return mode if mode in dict(QUANTITY_ENTRY_CHOICES) else QUANTITY_ENTRY_UNITS


def display_to_inventory_units(
    medication,
    display_qty: Decimal,
    entry_mode: str | None,
) -> Decimal:
    if display_qty <= 0:
        raise ValidationError("Quantity must be greater than zero.")
    pack_size = medication_pack_size(medication)
    mode = effective_dispense_mode(medication)
    entry = normalize_entry_mode(entry_mode)

    if entry == QUANTITY_ENTRY_PACK:
        if mode == DISPENSE_MODE_UNITS_ONLY:
            raise ValidationError(
                "This medication must be issued in individual units, not packs."
            )
        return display_qty * pack_size

    if mode == DISPENSE_MODE_PACK_ONLY:
        raise ValidationError(
            "This medication must be issued in whole packs. Switch to pack entry."
        )
    return display_qty


def validate_inventory_units(
    medication,
    quantity: Decimal,
    entry_mode: str | None = None,
) -> None:
    if quantity <= 0:
        raise ValidationError("Quantity must be greater than zero.")
    pack_size = medication_pack_size(medication)
    mode = effective_dispense_mode(medication)
    entry = normalize_entry_mode(entry_mode)

    if mode == DISPENSE_MODE_PACK_ONLY and pack_size > 1:
        if quantity % pack_size != 0:
            raise ValidationError(
                f"Quantity must be in whole packs ({int(pack_size)} units per pack)."
            )
    if entry == QUANTITY_ENTRY_UNITS and mode == DISPENSE_MODE_PACK_ONLY:
        raise ValidationError(
            "This medication must be issued in whole packs. Switch to pack entry."
        )
