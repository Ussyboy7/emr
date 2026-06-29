import { formatDisplayDate } from "@/lib/dates";
import { formatInventoryStockDisplay } from "@/lib/pharmacy/dispense-quantity";
import type { BatchAdjustmentHistory, MedicationInventory } from "@/lib/services";

export function formatBatchReceivedMeta(batch: MedicationInventory): string {
  const parts: string[] = [];
  const receivedOn = batch.received_at || batch.created_at;
  if (receivedOn) parts.push(`Received: ${formatDisplayDate(receivedOn)}`);
  if (batch.received_by_name) parts.push(`By: ${batch.received_by_name}`);
  return parts.join(" • ");
}

export function formatReceiptReceivedMeta(batch: {
  received_at?: string | null;
  receivedDate?: string;
  received_by_name?: string | null;
  receivedByName?: string;
}): string {
  const parts: string[] = [];
  const receivedOn = batch.received_at || batch.receivedDate;
  if (receivedOn) parts.push(`Received: ${formatDisplayDate(receivedOn)}`);
  const by = (batch.received_by_name || batch.receivedByName || "").trim();
  if (by) parts.push(`By: ${by}`);
  return parts.join(" • ");
}

const RECEIPT_EVENT_TYPES = new Set([
  "initial_receive",
  "receive",
  "opening_balance",
  "duplicate_merge",
]);

export function formatStockHistoryHeadline(
  entry: BatchAdjustmentHistory,
  packSize?: number | null,
  unit?: string | null,
): string {
  const deltaUnits = Number(entry.quantity_after || 0) - Number(entry.quantity_before || 0);
  const absUnits = Math.abs(deltaUnits);
  const stockLabel = formatInventoryStockDisplay(absUnits, packSize, unit);
  const eventType = entry.event_type || "adjustment";

  if (RECEIPT_EVENT_TYPES.has(eventType)) {
    const label = entry.event_label || entry.adjustment_reason || "Stock change";
    if (eventType === "opening_balance" || eventType === "initial_receive") {
      return `${label} — ${formatInventoryStockDisplay(
        Number(entry.quantity_after || 0),
        packSize,
        unit,
      )}`;
    }
    const sign = deltaUnits >= 0 ? "+" : "-";
    return `${label} ${sign}${stockLabel}`;
  }

  const direction = deltaUnits >= 0 ? "Increase" : "Decrease";
  return `${direction} by ${stockLabel}`;
}

export function buildClientOpeningBalanceEntry(
  batch: MedicationInventory,
): BatchAdjustmentHistory {
  const qty = Number(batch.quantity || 0);
  const receivedOn = batch.received_at || batch.created_at || new Date().toISOString();
  return {
    id: -Number(batch.id),
    batch_inventory: Number(batch.id),
    medication_name: batch.medication_name,
    batch_number: batch.batch_number,
    event_type: "opening_balance",
    event_label: "Opening balance",
    quantity_before: 0,
    quantity_after: qty,
    quantity_unit: batch.unit || "units",
    adjustment_reason: "",
    adjustment_notes: "",
    created_by_name: batch.received_by_name,
    created_at: receivedOn,
    is_synthetic: true,
  };
}

export function shouldShowHistoryBalanceChange(entry: BatchAdjustmentHistory): boolean {
  const eventType = entry.event_type || "adjustment";
  if (eventType === "adjustment") return true;
  if (eventType === "receive" || eventType === "duplicate_merge") return true;
  return Number(entry.quantity_before || 0) > 0;
}
export function ensureStockHistory(
  history: BatchAdjustmentHistory[],
  batch: MedicationInventory,
): BatchAdjustmentHistory[] {
  if (history.length > 0) return history;
  const qty = Number(batch.quantity || 0);
  if (qty <= 0) return history;
  return [buildClientOpeningBalanceEntry(batch)];
}
