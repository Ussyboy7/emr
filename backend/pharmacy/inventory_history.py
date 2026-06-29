"""Build stock history entries for MedicationInventory from audit logs."""
from __future__ import annotations

from typing import Any

from django.utils import timezone

STOCK_EVENT_LABELS = {
    "initial_receive": "Initial receipt",
    "receive": "Additional receipt",
    "adjustment": "Manual adjustment",
    "duplicate_merge": "Duplicate batch rows merged",
    "opening_balance": "Opening balance",
    "update": "Stock update",
}


def _resolve_stock_event_type(log) -> str:
    meta = log.metadata or {}
    stock_event = meta.get("stock_event")
    if stock_event:
        return str(stock_event)
    if meta.get("batch_adjustment"):
        return "adjustment"
    if meta.get("duplicate_batch_merge"):
        return "duplicate_merge"
    if log.action == "create":
        return "initial_receive"
    description = log.description or ""
    if log.action == "update" and "Added stock to existing batch" in description:
        return "receive"
    return "update"


def _resolve_reason(log, event_type: str) -> str:
    meta = log.metadata or {}
    if event_type == "initial_receive":
        return STOCK_EVENT_LABELS["initial_receive"]
    if event_type == "receive":
        return STOCK_EVENT_LABELS["receive"]
    if event_type == "duplicate_merge":
        return meta.get("adjustment_reason") or STOCK_EVENT_LABELS["duplicate_merge"]
    return (
        meta.get("adjustment_reason")
        or meta.get("reason_display")
        or meta.get("adjustment_reason_display")
        or meta.get("reason")
        or meta.get("adjustmentReason")
        or STOCK_EVENT_LABELS.get(event_type, "")
    )


def _user_display(log) -> str | None:
    user = getattr(log, "user", None)
    if not user:
        return None
    full = getattr(user, "get_full_name", lambda: "")() or ""
    return full.strip() or getattr(user, "username", None) or str(user)


def build_history_entry_from_log(inventory, log) -> dict[str, Any] | None:
    meta = log.metadata or {}
    old_vals = log.old_values or {}
    new_vals = log.new_values or {}
    event_type = _resolve_stock_event_type(log)

    qty_before = old_vals.get("quantity")
    qty_after = new_vals.get("quantity")

    if log.action == "create" and qty_after is not None:
        qty_before = 0
    elif qty_before is None or qty_after is None:
        return None

    return {
        "id": log.id,
        "batch_inventory": inventory.id,
        "medication_name": inventory.medication.name if hasattr(inventory, "medication") else None,
        "batch_number": inventory.batch_number,
        "event_type": event_type,
        "event_label": STOCK_EVENT_LABELS.get(event_type, "Stock change"),
        "quantity_before": float(qty_before or 0),
        "quantity_after": float(qty_after or 0),
        "quantity_unit": meta.get("quantity_unit") or (inventory.unit or "units"),
        "adjustment_reason": _resolve_reason(log, event_type),
        "adjustment_notes": meta.get("adjustment_notes") or "",
        "created_by": getattr(log.user, "id", None) if getattr(log, "user", None) else None,
        "created_by_name": _user_display(log),
        "created_at": log.created_at.isoformat(),
        "is_synthetic": False,
    }


def build_synthetic_opening_balance(inventory) -> dict[str, Any]:
    received_by = getattr(inventory, "received_by", None)
    received_by_name = None
    if received_by:
        full = getattr(received_by, "get_full_name", lambda: "")() or ""
        received_by_name = full.strip() or getattr(received_by, "username", None)

    created_at = inventory.received_at or inventory.created_at or timezone.now()

    return {
        "id": -int(inventory.id),
        "batch_inventory": inventory.id,
        "medication_name": inventory.medication.name if hasattr(inventory, "medication") else None,
        "batch_number": inventory.batch_number,
        "event_type": "opening_balance",
        "event_label": STOCK_EVENT_LABELS["opening_balance"],
        "quantity_before": 0.0,
        "quantity_after": float(inventory.quantity or 0),
        "quantity_unit": inventory.unit or "units",
        "adjustment_reason": "",
        "adjustment_notes": "",
        "created_by": getattr(received_by, "id", None) if received_by else None,
        "created_by_name": received_by_name,
        "created_at": created_at.isoformat(),
        "is_synthetic": True,
    }


def build_stock_history(inventory, logs) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for log in logs:
        entry = build_history_entry_from_log(inventory, log)
        if entry:
            entries.append(entry)

    has_origin = any(e["event_type"] in ("initial_receive", "opening_balance") for e in entries)
    if not has_origin and float(inventory.quantity or 0) > 0:
        entries.append(build_synthetic_opening_balance(inventory))

    entries.sort(key=lambda e: e["created_at"], reverse=True)
    return entries[:50]
