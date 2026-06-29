"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  PharmacyPackQuantityFields,
  defaultEntryModeForPrescriptionDispense,
} from "@/components/pharmacy/PharmacyPackQuantityFields";
import {
  toInventoryUnits,
  usesPackQuantityEntry,
  type QuantityEntryMode,
} from "@/lib/pharmacy/dispense-quantity";
import { ArrowRightLeft, GitBranch, Loader2, Tag } from "lucide-react";
import type { MedicationBatch } from "@/app/pharmacy/prescriptions/TYPES";

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
      return "Over";
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
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  }
}

function dispenseUnitLabel(med: any): string {
  const form = String(med.dosage_form || med.medication_details?.form || "").toLowerCase();
  const unit = String(med.unit || "").trim();
  if (form.includes("softgel")) return unit || "softgels";
  if (form.includes("capsule")) return unit || "capsules";
  if (form.includes("tablet")) return unit || "tablets";
  return unit || "units";
}

function isPackDispenseMedication(med: any): boolean {
  const inventoryUnit = String(med?.medication_details?.unit || "")
    .trim()
    .toLowerCase();
  const hasPackUnit = inventoryUnit === "bottle" || inventoryUnit === "bottles";
  const prescribed = String(med?.unit || "")
    .trim()
    .toLowerCase();
  const isClinicalLiquid =
    prescribed === "ml" || prescribed === "milliliter" || prescribed === "milliliters";
  return isClinicalLiquid && hasPackUnit;
}

function usesTabletPackEntry(med: any): boolean {
  if (isPackDispenseMedication(med)) return false;
  const details = med?.medication_details;
  if (!details) return false;
  return usesPackQuantityEntry(details);
}

function getPackSizeMl(med: any): number | null {
  const packSize = Number(med?.medication_details?.pack_size ?? 0);
  return packSize > 0 ? packSize : null;
}

export type DispenseMedicationLineCardProps = {
  med: any;
  isSelected: boolean;
  batches: MedicationBatch[];
  dispenseQuantities: Record<string, number>;
  dispenseCoverageQuantities: Record<string, number>;
  dispenseEntryModes: Record<string, QuantityEntryMode>;
  isLoadingBrands: boolean;
  isLoadingSubstitutes: boolean;
  splittingComboItemId: string | null;
  splitComboAlertOpen: boolean;
  onSplitComboAlertOpenChange: (open: boolean) => void;
  medToSplit: any;
  onMedToSplit: (med: any) => void;
  onToggleSelect: (checked: boolean) => void;
  onRowActivate?: () => void;
  onDispenseQuantitiesChange: (medId: string, value: number) => void;
  onDispenseCoverageChange: (medId: string, value: number) => void;
  onDispenseEntryModeChange: (medId: string, mode: QuantityEntryMode) => void;
  onOpenBrandSelection: (med: any) => void;
  onOpenSubstitution: (med: any) => void;
  onConfirmSplitCombo: (med: any) => Promise<void>;
  getDefaultDispenseQuantity: (med: any) => number;
  getDefaultCoverageQuantity: (med: any) => number;
};

export function DispenseMedicationListHeader() {
  return (
    <div className="hidden lg:grid grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_5.5rem_6.5rem_7.5rem] gap-2 px-3 py-1.5 bg-muted/60 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
      <span />
      <span>Drug / sig</span>
      <span>Rx · stock</span>
      <span>Status</span>
      <span>Qty</span>
      <span className="text-right">Actions</span>
    </div>
  );
}

export function DispenseMedicationLineCard({
  med,
  isSelected,
  batches,
  dispenseQuantities,
  dispenseCoverageQuantities,
  dispenseEntryModes,
  isLoadingBrands,
  isLoadingSubstitutes,
  splittingComboItemId,
  splitComboAlertOpen,
  onSplitComboAlertOpenChange,
  medToSplit,
  onMedToSplit,
  onToggleSelect,
  onRowActivate,
  onDispenseQuantitiesChange,
  onDispenseCoverageChange,
  onDispenseEntryModeChange,
  onOpenBrandSelection,
  onOpenSubstitution,
  onConfirmSplitCombo,
  getDefaultDispenseQuantity,
  getDefaultCoverageQuantity,
}: DispenseMedicationLineCardProps) {
  const isAvailable =
    med.status === "Available" || med.status === "Low Stock" || med.status === "Partially Dispensed";
  const isPendingGeneric = med.status === "Pending";
  const needsBrandBeforeSelect = isPendingGeneric && !med.medication;
  const usesPackDispensing = isPackDispenseMedication(med);
  const packSizeMl = getPackSizeMl(med);
  const stockTotal = Array.isArray(batches)
    ? batches.reduce((total, b) => total + Number(b.quantity || 0), 0)
    : null;
  const remainingQty = Math.max(0, Number(med.remaining_quantity ?? med.quantity ?? 0));
  const prescribedQty = Number(med.quantity ?? 0);
  const dispensedQty = Number(med.dispensed_quantity || 0);
  const hasBrandLocked = Boolean(med.medication);
  const isOutOfStock = med.status === "Out of Stock";
  const unitLabel = dispenseUnitLabel(med);
  const showDispenseFields = isSelected && isAvailable && remainingQty > 0;
  const needsExpandedQty = usesTabletPackEntry(med) || usesPackDispensing;
  const showExpandedPanel =
    isSelected &&
    (Boolean(med.instructions) ||
      needsExpandedQty ||
      (isAvailable && remainingQty <= 0) ||
      isOutOfStock);

  const getEntryMode = (): QuantityEntryMode =>
    dispenseEntryModes[med.id] ??
    defaultEntryModeForPrescriptionDispense(med?.medication_details || {}, med?.unit);

  const inventoryUnits = (displayQty: number, mode: QuantityEntryMode) =>
    toInventoryUnits(displayQty, med.medication_details, mode, { prescribedUnit: med?.unit });

  const sigLine = [med.route, med.frequency, med.duration].filter(Boolean).join(" · ");
  const comboLine =
    med.can_split_combo && Array.isArray(med.combo_components) && med.combo_components.length > 1
      ? `Combo: ${med.combo_components.join(" + ")}`
      : null;

  const stockClass =
    stockTotal !== null && stockTotal < 50
      ? "text-red-600 dark:text-red-400"
      : "text-emerald-700 dark:text-emerald-400";

  return (
    <div
      className={
        !isAvailable && !isPendingGeneric
          ? "opacity-60 bg-muted/30"
          : isSelected
            ? "bg-violet-50/40 dark:bg-violet-900/10"
            : "hover:bg-muted/20"
      }
    >
      {/* Compact horizontal row */}
      <div className="flex items-center gap-2 px-2 sm:px-3 py-2 min-h-[3rem]">
        <Checkbox
          checked={isSelected}
          disabled={needsBrandBeforeSelect || (!isAvailable && !isPendingGeneric)}
          onCheckedChange={(checked) => onToggleSelect(checked === true)}
          className="h-4 w-4 shrink-0"
          id={`med-${med.id}`}
        />

        <div
          className={`flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_5.5rem_6.5rem_7.5rem] gap-x-2 gap-y-1 items-center ${
            needsBrandBeforeSelect ? "" : "cursor-pointer"
          }`}
          onClick={() => {
            if (needsBrandBeforeSelect) return;
            if (isAvailable || isPendingGeneric) onRowActivate?.();
          }}
        >
          {/* Drug + sig */}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" title={med.name}>
              {med.name}
              {med.strength &&
                !String(med.name || "")
                  .toLowerCase()
                  .includes(String(med.strength || "").toLowerCase()) && (
                  <span className="font-normal text-muted-foreground"> {med.strength}</span>
                )}
            </p>
            <p className="text-[11px] text-muted-foreground truncate" title={[sigLine, comboLine].filter(Boolean).join(" · ")}>
              {sigLine}
              {comboLine ? ` · ${comboLine}` : ""}
            </p>
          </div>

          {/* Rx / stock — horizontal metrics */}
          <div className="text-[11px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
            <span className="text-muted-foreground">Rx </span>
            <span className="font-medium">{prescribedQty}</span>
            {dispensedQty > 0 && (
              <>
                <span className="text-muted-foreground"> · left </span>
                <span className={remainingQty <= 0 ? "font-medium text-green-600" : "font-medium text-orange-600"}>
                  {remainingQty}
                </span>
              </>
            )}
            {stockTotal !== null && (
              <>
                <span className="text-muted-foreground"> · stk </span>
                <span className={`font-medium ${stockClass}`}>{stockTotal.toLocaleString()}</span>
              </>
            )}
          </div>

          {/* Status */}
          <div className="hidden lg:block">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${medicationStatusColor(med.status)}`}>
              {medicationStatusLabel(med.status)}
            </Badge>
          </div>

          {/* Inline qty (simple lines only) */}
          <div className="hidden lg:block" onClick={(e) => e.stopPropagation()}>
            {showDispenseFields && !needsExpandedQty ? (
              <Input
                type="number"
                min={1}
                step={1}
                className="h-7 text-xs w-full"
                value={dispenseQuantities[med.id] ?? getDefaultDispenseQuantity(med)}
                onChange={(e) => {
                  const inputValue = Math.max(1, parseInt(e.target.value, 10) || 1);
                  onDispenseQuantitiesChange(med.id, inputValue);
                  onDispenseCoverageChange(med.id, inputValue);
                }}
              />
            ) : showDispenseFields && needsExpandedQty ? (
              <span className="text-[11px] text-muted-foreground">↓ below</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">—</span>
            )}
          </div>

          {/* Actions — icon row */}
          <div className="flex items-center justify-end gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Badge
              variant="outline"
              className={`lg:hidden text-[10px] px-1.5 py-0 h-5 mr-1 ${medicationStatusColor(med.status)}`}
            >
              {medicationStatusLabel(med.status)}
            </Badge>

            {(!hasBrandLocked || isPendingGeneric) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-700"
                disabled={isLoadingBrands}
                title={hasBrandLocked ? "Change brand" : "Select brand"}
                onClick={() => onOpenBrandSelection(med)}
              >
                <Tag className="h-3.5 w-3.5" />
              </Button>
            )}

            {med.can_split_combo && (
              <AlertDialog open={splitComboAlertOpen} onOpenChange={onSplitComboAlertOpenChange}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-fuchsia-700"
                    disabled={Boolean(splittingComboItemId)}
                    title="Split combo"
                    onClick={() => onMedToSplit(med)}
                  >
                    {splittingComboItemId === String(med.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <GitBranch className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Split combo medication</AlertDialogTitle>
                    <AlertDialogDescription>
                      Split this combo into separate ingredient lines? Missing component generics will be
                      auto-created as placeholders so you can substitute during dispensing.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        onSplitComboAlertOpenChange(false);
                        await onConfirmSplitCombo(medToSplit);
                        onMedToSplit(null);
                      }}
                    >
                      Split combo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${isOutOfStock || med.status === "Low Stock" ? "text-amber-700" : "text-muted-foreground"}`}
              disabled={isLoadingSubstitutes}
              title="Substitute"
              onClick={() => onOpenSubstitution(med)}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile: qty row when selected */}
      {showDispenseFields && !needsExpandedQty && (
        <div className="lg:hidden px-3 pb-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Label className="text-xs shrink-0">Qty ({unitLabel})</Label>
          <Input
            type="number"
            min={1}
            className="h-8 w-24 text-sm"
            value={dispenseQuantities[med.id] ?? getDefaultDispenseQuantity(med)}
            onChange={(e) => {
              const inputValue = Math.max(1, parseInt(e.target.value, 10) || 1);
              onDispenseQuantitiesChange(med.id, inputValue);
              onDispenseCoverageChange(med.id, inputValue);
            }}
          />
        </div>
      )}

      {/* Expanded panel: instructions, pack qty, liquid coverage */}
      {showExpandedPanel && (
        <div
          className="px-3 pb-2 pt-1 border-t border-dashed space-y-2 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {med.instructions ? (
            <p className="text-blue-800 dark:text-blue-300">
              <span className="font-medium text-blue-700 dark:text-blue-400">Instructions:</span> {med.instructions}
            </p>
          ) : null}

          {med.substitution?.reason === "brand_selection" && med.substitution?.previous_brand && (
            <p className="text-emerald-600 dark:text-emerald-400">
              {med.substitution?.is_first_brand_selection !== false
                ? `Brand selected: ${med.name}`
                : `Brand switched from ${med.substitution.previous_brand}`}
            </p>
          )}
          {med.originalMedication && (
            <p className="text-amber-600 dark:text-amber-400">Substituted from {med.originalMedication}</p>
          )}

          {showDispenseFields && needsExpandedQty && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              {usesTabletPackEntry(med) && med.medication_details ? (
                <PharmacyPackQuantityFields
                  medication={med.medication_details}
                  prescribedUnit={med.unit ?? null}
                  displayQuantity={String(dispenseQuantities[med.id] ?? getDefaultDispenseQuantity(med))}
                  onDisplayQuantityChange={(value) => {
                    const inputValue = Math.max(1, parseInt(value, 10) || 1);
                    const mode = getEntryMode();
                    onDispenseQuantitiesChange(med.id, inputValue);
                    onDispenseCoverageChange(med.id, inventoryUnits(inputValue, mode));
                  }}
                  entryMode={getEntryMode()}
                  onEntryModeChange={(mode) => {
                    onDispenseEntryModeChange(med.id, mode);
                    const inputValue = dispenseQuantities[med.id] ?? getDefaultDispenseQuantity(med);
                    onDispenseCoverageChange(med.id, inventoryUnits(inputValue, mode));
                  }}
                  className="[&_input]:h-8"
                />
              ) : (
                <div>
                  <Label className="text-xs">Quantity ({usesPackDispensing ? "bottles" : unitLabel})</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 mt-1"
                    value={dispenseQuantities[med.id] ?? getDefaultDispenseQuantity(med)}
                    onChange={(e) => {
                      const inputValue = Math.max(1, parseInt(e.target.value, 10) || 1);
                      onDispenseQuantitiesChange(med.id, inputValue);
                      if (!usesPackDispensing) onDispenseCoverageChange(med.id, inputValue);
                    }}
                  />
                </div>
              )}
              {usesPackDispensing && (
                <div>
                  <Label className="text-xs">Clinical qty covered ({med.unit || "ml"})</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 mt-1"
                    value={dispenseCoverageQuantities[med.id] ?? getDefaultCoverageQuantity(med)}
                    onChange={(e) => {
                      const inputValue = Math.max(1, parseInt(e.target.value, 10) || 1);
                      onDispenseCoverageChange(med.id, inputValue);
                    }}
                  />
                  {packSizeMl ? (
                    <p className="text-[10px] text-muted-foreground mt-1">{packSizeMl} ml per bottle</p>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {isSelected && isAvailable && remainingQty <= 0 && (
            <p className="text-muted-foreground">This line is fully dispensed.</p>
          )}

          {isOutOfStock && (
            <p className="text-red-600 dark:text-red-400">Out of stock — substitute or contact procurement.</p>
          )}
        </div>
      )}
    </div>
  );
}
