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

/** Resolve pack_size from API rows (number|string) or camelCase packSize. */
export function resolvePackSize(
  source?: (PackQuantityMedication & { packSize?: unknown }) | null
): number {
  if (!source) return 1;
  const raw = source.pack_size ?? (source as { packSize?: unknown }).packSize;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return getPackSize(source);
}

/** Normalize UI medication rows for pack/units helpers. */
export function asPackQuantityMedication(
  med?: (PackQuantityMedication & { packSize?: number | null }) | null
): PackQuantityMedication {
  if (!med) return {};
  return {
    unit: med.unit,
    form: med.form,
    pack_size: resolvePackSize(med),
    dispense_mode: med.dispense_mode,
  };
}

export function isTabletCapsuleUnit(unit?: string | null): boolean {
  return PACK_OR_UNITS_UNITS.has(String(unit || "").trim().toLowerCase());
}

export function canChooseQuantityEntryMode(mode: DispenseMode): boolean {
  return mode === "pack_or_units";
}

export function getDefaultQuantityEntryMode(mode: DispenseMode): QuantityEntryMode {
  return mode === "units_only" ? "units" : "pack";
}

/**
 * Prescription dispensing: tablet/capsule lines always allow pack or units
 * (clinical Rx is written in individual units, e.g. 3 capsules).
 */
export function getPrescriptionDispenseMode(
  medication?: PackQuantityMedication | null,
  prescribedUnit?: string | null
): DispenseMode {
  const base = getEffectiveDispenseMode(medication);
  if (base === "units_only") return "units_only";
  if (isTabletCapsuleUnit(prescribedUnit) || isTabletCapsuleUnit(medication?.unit)) {
    return "pack_or_units";
  }
  return base;
}

export function canChoosePrescriptionQuantityEntryMode(
  medication?: PackQuantityMedication | null,
  prescribedUnit?: string | null
): boolean {
  return canChooseQuantityEntryMode(getPrescriptionDispenseMode(medication, prescribedUnit));
}

/** Prescriptions are written in clinical units (e.g. 6 capsules) — default to units when both are allowed. */
export function getDefaultQuantityEntryModeForPrescription(
  mode: DispenseMode,
  options?: { medication?: PackQuantityMedication | null; prescribedUnit?: string | null }
): QuantityEntryMode {
  const effectiveMode =
    options?.medication != null || options?.prescribedUnit != null
      ? getPrescriptionDispenseMode(options?.medication, options?.prescribedUnit)
      : mode;
  if (effectiveMode === "pack_only") return "pack";
  return "units";
}

export function usesPackQuantityEntry(med?: PackQuantityMedication | null): boolean {
  const mode = getEffectiveDispenseMode(med);
  return mode !== "units_only";
}

export function toInventoryUnits(
  displayQty: number,
  med?: PackQuantityMedication | null,
  entryMode: QuantityEntryMode = "units",
  options?: { prescribedUnit?: string | null }
): number {
  const packSize = getPackSize(med);
  const mode =
    options?.prescribedUnit != null
      ? getPrescriptionDispenseMode(med, options.prescribedUnit)
      : getEffectiveDispenseMode(med);
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

function pluralizeUnitLabel(unit: string, qty: number): string {
  const trimmed = unit.trim() || "units";
  if (qty === 1) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower === "ml" || lower === "g" || lower === "mg" || lower === "l") return trimmed;
  if (lower.endsWith("s")) return trimmed;
  return `${trimmed}s`;
}

/** Stock line for inventory lists: packs + unit label when pack_size is set. */
export function formatInventoryStockDisplay(
  units: number,
  packSize?: number | null,
  unit?: string | null,
): string {
  const qty = Math.max(0, Math.round(Number(units) || 0));
  const unitLabel = pluralizeUnitLabel(String(unit || "units").trim() || "units", qty);
  const ps = Number(packSize);
  if (!Number.isFinite(ps) || ps <= 1) {
    return `${qty.toLocaleString()} ${unitLabel}`;
  }
  const packs = Math.floor(qty / ps);
  const remainder = qty % ps;
  const unitsPart = `${qty.toLocaleString()} ${unitLabel}`;
  if (remainder === 0) {
    return `${packs.toLocaleString()} pack${packs === 1 ? "" : "s"} (${unitsPart})`;
  }
  return `${unitsPart} (${packs.toLocaleString()} pack${packs === 1 ? "" : "s"} + ${remainder.toLocaleString()} loose)`;
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
  entryMode: QuantityEntryMode = "units",
  modeOverride?: DispenseMode
): string {
  const mode = modeOverride ?? getEffectiveDispenseMode(med);
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
  entryMode: QuantityEntryMode = "units",
  modeOverride?: DispenseMode
): string | null {
  const packSize = getPackSize(med);
  const unitLabel = String(med?.unit || "units").trim() || "units";
  if (entryMode !== "pack" || packSize <= 1) return null;
  const units = displayQty * packSize;
  return `${displayQty.toLocaleString()} pack${displayQty === 1 ? "" : "s"} = ${units.toLocaleString()} ${unitLabel}`;
}
