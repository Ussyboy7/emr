import type { Prescription, PrescriptionItem } from "@/lib/services/pharmacy-service";
import type { PrescriptionOrderItemInput } from "@/components/consultation/orders/PrescriptionOrderModal";

export const REFILLABLE_PRESCRIPTION_STATUSES = new Set([
  "dispensed",
  "partially_dispensed",
]);

export type RefillLineKey = `${number}:${number}`;

export function refillLineKey(prescriptionId: number, itemId: number): RefillLineKey {
  return `${prescriptionId}:${itemId}`;
}

export function parseDurationDays(duration?: string | null): number | "" {
  if (!duration) return "";
  const m = String(duration).match(/(\d+)\s*day/i);
  if (m) return parseInt(m[1], 10);
  return "";
}

export function parseDosageNumber(dose?: string | null): string {
  if (!dose) return "1";
  const trimmed = String(dose).trim();
  const m = trimmed.match(/^([\d.]+)/);
  return m ? m[1] : trimmed;
}

export function isRefillablePrescription(rx: Prescription): boolean {
  return REFILLABLE_PRESCRIPTION_STATUSES.has(rx.status);
}

export function isRefillableLine(rx: Prescription, item: PrescriptionItem): boolean {
  if (item.prescribing_record_only) return false;
  if (item.superseded_at) return false;
  const genericId =
    typeof item.generic === "number" && item.generic > 0
      ? item.generic
      : typeof (item as { generic_id?: number }).generic_id === "number"
        ? (item as { generic_id?: number }).generic_id!
        : null;
  if (!genericId) return false;
  if (rx.status === "dispensed") return true;
  return Boolean(item.is_dispensed);
}

export function prescriptionItemToOrderInput(item: PrescriptionItem): PrescriptionOrderItemInput | null {
  const generic =
    typeof item.generic === "number" && item.generic > 0
      ? item.generic
      : typeof (item as { generic_id?: number }).generic_id === "number"
        ? (item as { generic_id?: number }).generic_id!
        : null;
  if (!generic) return null;

  const unit = (item.unit || "tablet").trim().toLowerCase();
  const doseRaw = item.dose || item.dosage || "";
  const dosage = parseDosageNumber(doseRaw);

  return {
    generic,
    medication: null,
    medication_name:
      item.medication_name ||
      (item.medication_details as { name?: string } | undefined)?.name ||
      undefined,
    unit: unit || "tablet",
    dosage_form: item.dosage_form || (item.medication_details as { form?: string } | undefined)?.form,
    strength:
      item.strength ||
      (item.medication_details as { strength?: string } | undefined)?.strength,
    route: item.route || "Oral",
    dosage,
    frequency: item.frequency || "Once daily (OD)",
    duration: item.duration || "As directed",
    quantity: Math.max(item.quantity || item.dispensed_quantity || 1, 1),
    instructions: item.instructions || "",
  };
}

export function getRefillablePrescriptions(prescriptions: Prescription[]): Prescription[] {
  return [...prescriptions]
    .filter(isRefillablePrescription)
    .sort((a, b) => {
      const ta = new Date(b.dispensed_at || b.prescribed_at || 0).getTime();
      const tb = new Date(a.dispensed_at || a.prescribed_at || 0).getTime();
      return ta - tb;
    })
    .slice(0, 20);
}

export function orderInputsFromSelectedLines(
  prescriptions: Prescription[],
  selected: Set<RefillLineKey>
): PrescriptionOrderItemInput[] {
  const items: PrescriptionOrderItemInput[] = [];
  const seenGenerics = new Set<number>();

  for (const rx of prescriptions) {
    for (const line of rx.medications || []) {
      const key = refillLineKey(rx.id, line.id);
      if (!selected.has(key) || !isRefillableLine(rx, line)) continue;
      const mapped = prescriptionItemToOrderInput(line);
      if (!mapped || seenGenerics.has(mapped.generic)) continue;
      seenGenerics.add(mapped.generic);
      items.push(mapped);
    }
  }
  return items;
}
