/** Canonical dose units for prescription lines (matches backend pharmacy.units). */

export const PRESCRIPTION_DOSE_UNITS = [
  "tablet",
  "capsule",
  "ml",
  "mg",
  "g",
  "drop",
  "vial",
  "ampoule",
  "sachet",
  "suppository",
  "puff",
  "patch",
  "tube",
  "bottle",
] as const;

export type PrescriptionDoseUnit = (typeof PRESCRIPTION_DOSE_UNITS)[number];

export function inferDoseUnitFromForm(dosageForm?: string | null): PrescriptionDoseUnit {
  const f = String(dosageForm || "").trim().toLowerCase();
  if (!f) return "tablet";
  if (f.includes("tablet") || f.includes("caplet") || f.includes("chewable")) return "tablet";
  if (f.includes("capsule") || f.includes("softgel")) return "capsule";
  if (f.includes("syrup") || f.includes("suspension") || f.includes("solution") || f.includes("oral liquid")) {
    return "ml";
  }
  if (f.includes("injection") || f.includes("vial") || f.includes("ampoule")) return "vial";
  if (f.includes("inhaler") || f.includes("puff")) return "puff";
  if (f.includes("cream") || f.includes("ointment") || f.includes("gel") || f.includes("lotion")) return "tube";
  if (f.includes("drop") || f.includes("eye") || f.includes("ear") || f.includes("otic")) return "drop";
  if (f.includes("sachet")) return "sachet";
  if (f.includes("suppository")) return "suppository";
  if (f.includes("patch")) return "patch";
  if (f.includes("bottle")) return "bottle";
  return "tablet";
}

function singularizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === "tablets") return "tablet";
  if (u === "capsules") return "capsule";
  if (u === "vials") return "vial";
  if (u === "puffs") return "puff";
  if (u === "drops") return "drop";
  if (u === "tubes") return "tube";
  if (u === "bottles") return "bottle";
  if (u === "sachets") return "sachet";
  if (u === "suppositories") return "suppository";
  if (u === "patches") return "patch";
  if (u === "ampoules") return "ampoule";
  return u;
}

/** Normalize API/catalog unit for prescribe UI and submit payload. */
export function normalizePrescriptionDoseUnit(
  unit: string | undefined | null,
  dosageForm?: string | null,
): PrescriptionDoseUnit {
  const formInferred = inferDoseUnitFromForm(dosageForm);
  if (!unit || !String(unit).trim()) return formInferred;
  const cleaned = singularizeUnit(String(unit));
  if ((PRESCRIPTION_DOSE_UNITS as readonly string[]).includes(cleaned)) {
    if (cleaned === "tablet" && formInferred === "capsule") return "capsule";
    return cleaned as PrescriptionDoseUnit;
  }
  return formInferred;
}
