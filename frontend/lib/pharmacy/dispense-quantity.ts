export type DispenseMode = "pack_only" | "units_only" | "pack_or_units";
export type QuantityEntryMode = "pack" | "units";

export type PackQuantityMedication = {
  unit?: string | null;
  form?: string | null;
  pack_size?: number | null;
  dispense_mode?: DispenseMode | string | null;
};

const PACK_ONLY_UNITS = new Set(["bottle", "bottles", "box", "pack", "vial", "tube", "jar"]);
const PACK_OR_UNITS_UNITS = new Set(["tablet", "capsule", "caplet"]);
const PACK_ONLY_FORMS = ["syrup", "suspension", "cream", "ointment", "gel", "lotion", "injection", "drop", "drops"];

export function inferDispenseMode(med?: PackQuantityMedication | null): DispenseMode {
  const unit = String(med?.unit || "").trim().toLowerCase();
  const form = String(med?.form || "").trim().toLowerCase();
  if (PACK_OR_UNITS_UNITS.has(unit)) return "pack_or_units";
  if (PACK_ONLY_UNITS.has(unit)) return "pack_only";
  if (PACK_ONLY_FORMS.some((token) => form.includes(token))) return "pack_only";
  return "units_only";
}

export function getEffectiveDispenseMode(med?: PackQuantityMedication | null): DispenseMode {
  const configured = med?.dispense_mode;
  if (configured === "pack_only" || configured === "units_only" || configured === "pack_or_units") {
    return configured;
  }
  return inferDispenseMode(med);
}

export function getPackSize(med?: PackQuantityMedication | null): number {
  const raw = Number(med?.pack_size ?? 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export function canChooseQuantityEntryMode(mode: DispenseMode): boolean {
  return mode === "pack_or_units";
}

export function getDefaultQuantityEntryMode(mode: DispenseMode): QuantityEntryMode {
  return mode === "units_only" ? "units" : "pack";
}

/** Prescriptions are written in clinical units (e.g. 6 capsules) — default to units when both are allowed. */
export function getDefaultQuantityEntryModeForPrescription(mode: DispenseMode): QuantityEntryMode {
  if (mode === "pack_only") return "pack";
  return "units";
}

export function usesPackQuantityEntry(med?: PackQuantityMedication | null): boolean {
  const mode = getEffectiveDispenseMode(med);
  return mode !== "units_only";
}

export function toInventoryUnits(
  displayQty: number,
  med?: PackQuantityMedication | null,
  entryMode: QuantityEntryMode = "units"
): number {
  const packSize = getPackSize(med);
  const mode = getEffectiveDispenseMode(med);
  if (entryMode === "pack") {
    if (mode === "units_only") {
      throw new Error("This medication must be issued in individual units, not packs.");
    }
    return displayQty * packSize;
  }
  if (mode === "pack_only") {
    throw new Error("This medication must be issued in whole packs.");
  }
  return displayQty;
}

export function formatPackDisplay(units: number, packSize?: number | null): string {
  if (!packSize || packSize <= 1) return `${units.toLocaleString()} units`;
  const packs = Math.floor(units / packSize);
  return `${packs.toLocaleString()} packs (${units.toLocaleString()} units)`;
}

export function formatIssuedQuantityDisplay(
  units: number,
  med?: PackQuantityMedication | null,
  entryMode?: QuantityEntryMode | string | null
): string {
  const packSize = getPackSize(med);
  const unitLabel = String(med?.unit || "units").trim() || "units";
  const normalizedEntry = entryMode === "pack" ? "pack" : entryMode === "units" ? "units" : "";

  if (normalizedEntry === "pack" && packSize > 1) {
    const packs = Math.floor(units / packSize);
    return `${packs.toLocaleString()} pack${packs === 1 ? "" : "s"} (${units.toLocaleString()} ${unitLabel})`;
  }
  if (normalizedEntry === "units" || packSize <= 1) {
    return `${units.toLocaleString()} ${unitLabel}`;
  }
  if (units % packSize === 0) {
    const packs = units / packSize;
    return `${packs.toLocaleString()} pack${packs === 1 ? "" : "s"} (${units.toLocaleString()} ${unitLabel})`;
  }
  return `${units.toLocaleString()} ${unitLabel}`;
}

export function getQuantityFieldLabel(
  med?: PackQuantityMedication | null,
  entryMode: QuantityEntryMode = "units"
): string {
  const mode = getEffectiveDispenseMode(med);
  const packSize = getPackSize(med);
  const unitLabel = String(med?.unit || "units").trim() || "units";
  if (mode === "pack_only" || entryMode === "pack") {
    return packSize > 1 ? `Packs (×${packSize} ${unitLabel} each)` : "Packs";
  }
  return `Quantity (${unitLabel})`;
}

export function getQuantityConversionHint(
  displayQty: number,
  med?: PackQuantityMedication | null,
  entryMode: QuantityEntryMode = "units"
): string | null {
  const packSize = getPackSize(med);
  const unitLabel = String(med?.unit || "units").trim() || "units";
  if (entryMode !== "pack" || packSize <= 1) return null;
  const units = displayQty * packSize;
  return `${displayQty.toLocaleString()} pack${displayQty === 1 ? "" : "s"} = ${units.toLocaleString()} ${unitLabel}`;
}
