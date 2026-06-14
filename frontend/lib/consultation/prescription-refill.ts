import type { Prescription, PrescriptionItem } from "@/lib/services/pharmacy-service";
import type { PrescriptionOrderItemInput } from "@/components/consultation/orders/PrescriptionOrderModal";

/** Cancelled orders are excluded; all other statuses may be copied into a new draft. */
export const NON_REFILLABLE_PRESCRIPTION_STATUSES = new Set(["cancelled"]);

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
  return !NON_REFILLABLE_PRESCRIPTION_STATUSES.has(rx.status);
}

export function isRefillableLine(_rx: Prescription, item: PrescriptionItem): boolean {
  if (item.prescribing_record_only) return false;
  if (item.superseded_at) return false;
  const genericId =
    typeof item.generic === "number" && item.generic > 0
      ? item.generic
      : typeof (item as { generic_id?: number }).generic_id === "number"
        ? (item as { generic_id?: number }).generic_id!
        : null;
  return Boolean(genericId);
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

/** Local consultation draft row (room or history). */
export function localDraftToOrderInput(rx: {
  genericId?: number;
  medicationId?: number;
  medication?: string;
  dosage?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  unit?: string;
  form?: string;
  strength?: string;
  route?: string;
  instructions?: string;
}): PrescriptionOrderItemInput | null {
  const genericPk =
    typeof rx.genericId === "number" && rx.genericId > 0
      ? rx.genericId
      : typeof rx.medicationId === "number" && rx.medicationId > 0
        ? rx.medicationId
        : null;
  if (!genericPk) return null;

  const doseMatch = (rx.dosage || rx.dose || "").match(/^([\d.]+)/);
  return {
    generic: genericPk,
    medication_name: rx.medication,
    dosage: doseMatch?.[1] || rx.dosage || "1",
    frequency: rx.frequency || "Once daily (OD)",
    duration: rx.duration || "As directed",
    quantity: rx.quantity || 1,
    unit: rx.unit || "tablet",
    dosage_form: rx.form,
    strength: rx.strength,
    route: rx.route || "Oral",
    instructions: rx.instructions || "",
  };
}

/** API medication line on a pending/dispensed prescription. */
export function apiPrescriptionLineToOrderInput(m: Record<string, unknown>): PrescriptionOrderItemInput | null {
  const generic =
    typeof m.generic === "number" && m.generic > 0
      ? m.generic
      : typeof m.generic_id === "number" && m.generic_id > 0
        ? m.generic_id
        : null;
  if (!generic) return null;

  const med = m.medication as { name?: string } | undefined;
  const medDetails = m.medication_details as { name?: string; form?: string; strength?: string } | undefined;
  const doseRaw = (m.dose || m.dosage || "") as string;

  return {
    generic,
    medication: null,
    medication_name:
      (m.medication_name as string) || med?.name || medDetails?.name || undefined,
    unit: ((m.unit as string) || "tablet").trim().toLowerCase(),
    dosage_form: (m.dosage_form as string) || medDetails?.form,
    strength: (m.strength as string) || medDetails?.strength,
    route: (m.route as string) || "Oral",
    dosage: parseDosageNumber(doseRaw),
    frequency: (m.frequency as string) || "Once daily (OD)",
    duration: (m.duration as string) || "As directed",
    quantity: Math.max(Number(m.quantity) || Number(m.dispensed_quantity) || 1, 1),
    instructions: (m.instructions as string) || "",
  };
}

/** Payload item for pharmacy createPrescription `items` array. */
export function orderInputToCreateItem(i: PrescriptionOrderItemInput): Record<string, unknown> | null {
  const generic =
    typeof i.generic === "number" && Number.isFinite(i.generic) && i.generic > 0 ? i.generic : null;
  if (!generic) return null;
  return {
    generic,
    medication: null,
    medication_name: i.medication_name,
    quantity: i.quantity,
    unit: i.unit,
    dose: i.dosage,
    frequency: i.frequency,
    duration: i.duration,
    route: i.route || "Oral",
    instructions: i.instructions,
    dispensed_quantity: 0,
    is_dispensed: false,
  };
}

export function apiPrescriptionLineToCreateItem(m: Record<string, unknown>): Record<string, unknown> | null {
  const mapped = apiPrescriptionLineToOrderInput(m);
  return mapped ? orderInputToCreateItem(mapped) : null;
}

export type PrescriptionModalIntent = "add" | "refill" | "edit";

export function prescriptionModalCopy(intent: PrescriptionModalIntent | null): {
  dialogTitle?: string;
  dialogDescription?: string;
  confirmLabel?: string;
} {
  if (intent === "edit") {
    return {
      dialogTitle: "Edit prescription",
      dialogDescription:
        "Update dose, frequency, duration, and instructions. Saving will replace the queued prescription line.",
      confirmLabel: "Save changes",
    };
  }
  if (intent === "refill") {
    return {
      dialogTitle: "Review refill prescription",
      dialogDescription:
        "Adjust dose, frequency, and duration as needed before adding or sending to pharmacy.",
      confirmLabel: undefined,
    };
  }
  return {};
}
