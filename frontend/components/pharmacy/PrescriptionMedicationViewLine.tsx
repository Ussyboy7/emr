"use client";

import { Badge } from "@/components/ui/badge";
import { joinDisplayParts } from "@/lib/utils/clinic-utils";

function pluralizeUnit(unit: string, qty: number): string {
  const u = String(unit || "unit").trim().toLowerCase();
  if (qty === 1) return u;
  if (u === "capsule") return "capsules";
  if (u === "tablet") return "tablets";
  if (u === "softgel") return "softgels";
  if (u === "vial") return "vials";
  if (u === "bottle") return "bottles";
  return u;
}

function medicationStatusLabel(status: string): string {
  switch (status) {
    case "Available":
      return "Ready";
    case "Low Stock":
      return "Low stock";
    case "Out of Stock":
      return "Out of stock";
    case "Pending":
      return "Needs brand";
    case "Partially Dispensed":
      return "Partial";
    case "Dispensed":
      return "Done";
    case "Over-dispensed":
      return "Over-dispensed";
    default:
      return status;
  }
}

function medicationStatusColor(status: string): string {
  switch (status) {
    case "Available":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "Low Stock":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "Out of Stock":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "Pending":
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
    case "Partially Dispensed":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "Dispensed":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "Over-dispensed":
      return "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  }
}

function formatDispensedSummary(med: any): string {
  const prescribedQty = Number(med.quantity || 0);
  const dispensedQty = Number(med.dispensed_quantity || med.dispensed || 0);
  const remaining = Math.max(0, prescribedQty - dispensedQty);
  const overBy = Math.max(0, dispensedQty - prescribedQty);
  const clinicalUnit = pluralizeUnit(med.unit || "unit", prescribedQty || 1);
  const stockQty = Number(med.stock_dispensed_quantity || 0);
  const stockUnit = String(med.stock_dispensed_unit || "").trim();

  let dispensedPart = `${dispensedQty} ${pluralizeUnit(med.unit || "unit", dispensedQty || 1)}`;
  if (stockQty > 0 && stockUnit && stockUnit.toLowerCase() !== String(med.unit || "").trim().toLowerCase()) {
    dispensedPart += ` (${stockQty} ${stockUnit})`;
  }

  if (overBy > 0) {
    return `Rx ${prescribedQty} ${clinicalUnit} · disp ${dispensedPart} · +${overBy} over`;
  }

  return `Rx ${prescribedQty} ${clinicalUnit} · disp ${dispensedPart} · left ${remaining} ${pluralizeUnit(med.unit || "unit", remaining || 1)}`;
}

export function PrescriptionMedicationViewListHeader() {
  return (
    <div className="hidden lg:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_6.5rem] gap-2 px-3 py-1.5 bg-muted/60 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
      <span>Drug / sig</span>
      <span>Rx · dispensed</span>
      <span className="text-right">Status</span>
    </div>
  );
}

export type PrescriptionMedicationViewLineProps = {
  med: any;
};

export function PrescriptionMedicationViewLine({ med }: PrescriptionMedicationViewLineProps) {
  const name = med.name || med.medication_name || "";
  const sigLine = joinDisplayParts([med.route, med.frequency, med.duration]);
  const strength = med.strength;
  const showStrength =
    strength &&
    !String(name).toLowerCase().includes(String(strength).toLowerCase());
  const status = med.status || "";
  const isOverDispensed = status === "Over-dispensed";
  const instructions = med.instructions || med.medication_details?.instructions;
  const dosage = med.dosage != null && String(med.dosage).trim() !== "" ? String(med.dosage).trim() : "";
  const qtySummary = formatDispensedSummary(med);

  return (
    <div className={isOverDispensed ? "bg-red-50/60 dark:bg-red-950/20" : undefined}>
      <div className="flex items-center gap-2 px-2 sm:px-3 py-2 min-h-[3rem]">
        <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_6.5rem] gap-x-2 gap-y-1 items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" title={name}>
              {name}
              {showStrength ? (
                <span className="font-normal text-muted-foreground"> {strength}</span>
              ) : null}
              {med.substitution ? (
                <span className="ml-1.5 text-xs font-normal text-amber-600 dark:text-amber-400">
                  Substituted
                </span>
              ) : null}
            </p>
            {sigLine ? (
              <p className="text-[11px] text-muted-foreground truncate" title={sigLine}>
                {sigLine}
              </p>
            ) : null}
          </div>

          <p
            className={`text-[11px] leading-tight ${
              isOverDispensed ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground"
            }`}
            title={qtySummary}
          >
            {qtySummary}
          </p>

          <div className="flex justify-end">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-5 ${medicationStatusColor(status)}`}
            >
              {medicationStatusLabel(status)}
            </Badge>
          </div>
        </div>
      </div>

      {(dosage || instructions || med.substitution) && (
        <div className="px-3 pb-2 pt-1 border-t border-dashed space-y-1 text-xs text-muted-foreground">
          {dosage ? (
            <p>
              <span className="font-medium text-foreground/80">Dose:</span> {dosage}
            </p>
          ) : null}
          {med.substitution && med.originalMedication ? (
            <p className="text-amber-700 dark:text-amber-400">
              Originally: {med.originalMedication}
            </p>
          ) : null}
          {instructions ? (
            <p className="text-blue-800 dark:text-blue-300">
              <span className="font-medium text-blue-700 dark:text-blue-400">Instructions:</span>{" "}
              {instructions}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
