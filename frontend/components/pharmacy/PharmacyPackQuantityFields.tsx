"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canChooseQuantityEntryMode,
  getDefaultQuantityEntryMode,
  getDefaultQuantityEntryModeForPrescription,
  getEffectiveDispenseMode,
  getPrescriptionDispenseMode,
  getQuantityConversionHint,
  getQuantityFieldLabel,
  type PackQuantityMedication,
  type QuantityEntryMode,
  usesPackQuantityEntry,
} from "@/lib/pharmacy/dispense-quantity";

type PharmacyPackQuantityFieldsProps = {
  medication: PackQuantityMedication;
  displayQuantity: string;
  onDisplayQuantityChange: (value: string) => void;
  entryMode: QuantityEntryMode;
  onEntryModeChange: (mode: QuantityEntryMode) => void;
  maxDisplayQuantity?: number;
  placeholder?: string;
  className?: string;
  /** When set, uses prescription pack/units rules (tablet/capsule → pack_or_units, default units). */
  prescribedUnit?: string | null;
};

export function PharmacyPackQuantityFields({
  medication,
  displayQuantity,
  onDisplayQuantityChange,
  entryMode,
  onEntryModeChange,
  maxDisplayQuantity,
  placeholder,
  className,
  prescribedUnit,
}: PharmacyPackQuantityFieldsProps) {
  const isPrescriptionContext = prescribedUnit !== undefined;
  const dispenseMode = isPrescriptionContext
    ? getPrescriptionDispenseMode(medication, prescribedUnit)
    : getEffectiveDispenseMode(medication);
  const showPackEntry = usesPackQuantityEntry({ ...medication, dispense_mode: dispenseMode });
  const showToggle = canChooseQuantityEntryMode(dispenseMode);
  const conversionHint = getQuantityConversionHint(
    Math.max(0, Number.parseInt(displayQuantity || "0", 10) || 0),
    medication,
    entryMode,
    dispenseMode
  );

  if (!showPackEntry) {
    return (
      <div className={className}>
        <Label className="text-xs">{getQuantityFieldLabel(medication, "units", dispenseMode)}</Label>
        <Input
          className="mt-1"
          type="number"
          min={1}
          max={maxDisplayQuantity}
          value={displayQuantity}
          onChange={(e) => onDisplayQuantityChange(e.target.value)}
          placeholder={placeholder || "1"}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {showToggle && (
        <div className="mb-2">
          <Label className="text-xs text-muted-foreground">Give as</Label>
          <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mt-1">
            <button
              type="button"
              onClick={() => onEntryModeChange("pack")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                entryMode === "pack"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pack
            </button>
            <button
              type="button"
              onClick={() => onEntryModeChange("units")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                entryMode === "units"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Units
            </button>
          </div>
        </div>
      )}
      <Label className="text-xs">{getQuantityFieldLabel(medication, entryMode, dispenseMode)}</Label>
      <Input
        className="mt-1"
        type="number"
        min={1}
        max={maxDisplayQuantity}
        value={displayQuantity}
        onChange={(e) => onDisplayQuantityChange(e.target.value)}
        placeholder={placeholder || (entryMode === "pack" ? "1" : "10")}
      />
      {conversionHint && <p className="text-xs text-muted-foreground mt-1">{conversionHint}</p>}
    </div>
  );
}

export function defaultEntryModeForMedication(medication: PackQuantityMedication): QuantityEntryMode {
  return getDefaultQuantityEntryMode(getEffectiveDispenseMode(medication));
}

export function defaultEntryModeForPrescriptionDispense(
  medication: PackQuantityMedication,
  prescribedUnit?: string | null
): QuantityEntryMode {
  return getDefaultQuantityEntryModeForPrescription(getEffectiveDispenseMode(medication), {
    medication,
    prescribedUnit,
  });
}
