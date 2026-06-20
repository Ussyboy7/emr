"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Pill, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { pharmacyService } from "@/lib/services";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";

/** Match consultation room: "Name (strength, form)" */
function formatMedicationVariantLabel(med: { name?: string; strength?: string; form?: string; dosage_form?: string }): string {
  const name = med?.name || "";
  const strength = (med?.strength || "").toString().trim();
  const form = (med?.dosage_form || med?.form || "").toString().trim();
  if (strength && form) return `${name} (${strength}, ${form})`;
  if (strength) return `${name} (${strength})`;
  if (form) return `${name} (${form})`;
  return name;
}

const frequencyToDailyDoses: Record<string, number> = {
  "Once daily (OD)": 1,
  "Twice daily (BD)": 2,
  "Three times daily (TDS)": 3,
  "Four times daily (QDS)": 4,
  "Every 6 hours (Q6H)": 4,
  "Every 8 hours (Q8H)": 3,
  "Every 12 hours (Q12H)": 2,
  "At bedtime (Nocte)": 1,
  "As needed (PRN)": 2,
  Weekly: 1 / 7,
  "STAT (Single dose)": 0,
};

export type PrescriptionOrderItemInput = {
  // The pharmacy catalogue generic (required). The consultation modal
  // prescribes by generic molecule/strength/form — the specific brand is
  // chosen by the pharmacist at dispensing time.
  generic: number;
  medication_name?: string;
  // Brand FK is intentionally absent at prescribing time. Kept in the type
  // only for legacy consumers that still read `item.medication`. New code
  // should rely on `generic`.
  medication?: number | null;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  unit: string;
  dosage_form?: string;
  strength?: string;
  route?: string;
  instructions?: string;
};

export type PrescriptionOrderSubmitInput = {
  priority: "Routine" | "Urgent" | "STAT";
  clinicalIndication: string;
  items: PrescriptionOrderItemInput[];
};

/**
 * Shape of a row returned by `/v1/pharmacy/generics/for_prescription/`.
 * The consultation prescription flow searches the pharmacy *generics*
 * catalogue (canonical molecule + strength + form + route), not brand
 * inventory — the pharmacist picks the brand at dispense time.
 */
type GenericLike = {
  id: number | string;
  name?: string;
  active_ingredient?: string;
  category?: string;
  form?: string;
  dosage_form?: string;
  strength?: string;
  unit?: string;
  route?: string;
};

type MedicationConfig = {
  dosage: string;
  frequency: string;
  durationDays: number | "";
  route: string;
  unit: string;
  strength: string;
  form: string;
  quantity?: number;
  instructions: string;
  name?: string;
  generic_name?: string;
};

const PRESCRIPTION_UNIT_OPTIONS = [
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
];

/** Normalize API unit (e.g. "Tablet") to a value that exists in PRESCRIPTION_UNIT_OPTIONS so the Select displays correctly. */
function normalizeDoseUnit(unit: string | undefined): string {
  if (!unit || typeof unit !== "string") return "tablet";
  const u = unit.trim().toLowerCase();
  if (PRESCRIPTION_UNIT_OPTIONS.includes(u)) return u;
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
  return "tablet";
}

function parseDurationDaysFromString(duration?: string): number | "" {
  if (!duration) return "";
  const m = String(duration).match(/(\d+)\s*day/i);
  if (m) return parseInt(m[1], 10);
  return "";
}

function parseDosageNumberFromString(dose?: string): string {
  if (!dose) return "1";
  const trimmed = String(dose).trim();
  const m = trimmed.match(/^([\d.]+)/);
  return m ? m[1] : trimmed;
}

export function PrescriptionOrderModal({
  open,
  onOpenChange,
  patientAllergies,
  onSubmit,
  confirmLabel,
  initialItems,
  initialPriority,
  initialClinicalIndication,
  dialogTitle,
  dialogDescription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientAllergies?: string[];
  onSubmit: (payload: PrescriptionOrderSubmitInput) => Promise<void>;
  confirmLabel?: string;
  initialItems?: PrescriptionOrderItemInput[];
  initialPriority?: "Routine" | "Urgent" | "STAT";
  initialClinicalIndication?: string;
  dialogTitle?: string;
  dialogDescription?: string;
}) {
  const [generics, setGenerics] = useState<GenericLike[]>([]);
  const [loadingMedications, setLoadingMedications] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [medicationSearch, setMedicationSearch] = useState("");
  const [showMedicationDropdown, setShowMedicationDropdown] = useState(false);
  const [selectedMedications, setSelectedMedications] = useState<number[]>([]);
  const [medicationConfigs, setMedicationConfigs] = useState<Map<number, MedicationConfig>>(new Map());

  const [priority, setPriority] = useState<"Routine" | "Urgent" | "STAT">("Routine");
  const [clinicalIndication, setClinicalIndication] = useState("");

  const searchRequestIdRef = useRef(0);
  const medicationDropdownRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setMedicationSearch("");
    setShowMedicationDropdown(false);
    setSelectedMedications([]);
    setMedicationConfigs(new Map());
    setGenerics([]);
    setPriority("Routine");
    setClinicalIndication("");
    setSubmitting(false);
  }, []);

  const applyInitialItems = useCallback((items: PrescriptionOrderItemInput[]) => {
    const ids: number[] = [];
    const configs = new Map<number, MedicationConfig>();
    for (const item of items) {
      const medId = item.generic;
      if (!medId || !Number.isFinite(medId) || medId <= 0) continue;
      if (ids.includes(medId)) continue;
      ids.push(medId);
      const durationDays = parseDurationDaysFromString(item.duration);
      configs.set(medId, {
        dosage: parseDosageNumberFromString(item.dosage),
        frequency: item.frequency || "Once daily (OD)",
        durationDays,
        route: item.route || "Oral",
        unit: normalizeDoseUnit(item.unit),
        strength: (item.strength || "").trim(),
        form: (item.dosage_form || "").trim(),
        quantity: item.quantity,
        instructions: item.instructions || "",
        name: item.medication_name,
      });
    }
    setMedicationSearch("");
    setShowMedicationDropdown(false);
    setSelectedMedications(ids);
    setMedicationConfigs(configs);
    setGenerics([]);
    setSubmitting(false);
  }, []);

  // Debounced search (same as consultation room): search as you type, 300ms
  useEffect(() => {
    if (!open || !showMedicationDropdown) return;
    const searchTerm = medicationSearch.trim();
    if (!searchTerm) {
      setGenerics([]);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    const timeout = setTimeout(async () => {
      try {
        setLoadingMedications(true);
        // Prescribe by generic molecule (not brand). The pharmacist picks the
        // actual brand from dispensary inventory when filling the order.
        const res = await pharmacyService.getGenericsForPrescription({ search: searchTerm, page_size: 50 });
        if (requestId === searchRequestIdRef.current) {
          const results = (res as any)?.results || [];
          setGenerics(results);
          if (results.length === 0) {
            console.warn(`No generics found for search term: "${searchTerm}"`);
          }
        }
      } catch (err: any) {
        if (requestId === searchRequestIdRef.current) {
          console.error("Failed to search generics:", err);
          const errorMsg = err?.message || err?.detail || "Failed to load medication search results. Check that generics are configured in Pharmacy → Generics.";
          toast.error(errorMsg);
          setGenerics([]);
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setLoadingMedications(false);
        }
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [open, showMedicationDropdown, medicationSearch]);

  // Close dropdown when clicking outside the search block
  useEffect(() => {
    if (!open || !showMedicationDropdown) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const el = medicationDropdownRef.current;
      if (el && !el.contains(target)) setShowMedicationDropdown(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open, showMedicationDropdown]);

  // Reset or prefill when opening
  useEffect(() => {
    if (!open) return;
    if (initialItems?.length) {
      applyInitialItems(initialItems);
      setPriority(initialPriority || "Routine");
      setClinicalIndication(initialClinicalIndication || "");
    } else {
      reset();
    }
  }, [open, initialItems, initialPriority, initialClinicalIndication, reset, applyInitialItems]);

  const normalizeMedicationId = (id: number | string | undefined): number | null => {
    if (id == null) return null;
    const n = typeof id === "number" ? id : parseInt(id, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const toggleMedicationSelection = useCallback((med: GenericLike) => {
    const medId = normalizeMedicationId(med.id);
    if (!medId) return;

    setSelectedMedications((prev) => {
      const isSelected = prev.includes(medId);
      if (isSelected) {
        const next = prev.filter(id => id !== medId);
        setMedicationConfigs((prevConfigs) => {
          const nextConfigs = new Map(prevConfigs);
          nextConfigs.delete(medId);
          return nextConfigs;
        });
        return next;
      } else {
        const next = [medId, ...prev];

        setMedicationConfigs((prevConfigs) => {
          const nextConfigs = new Map(prevConfigs);
          if (!nextConfigs.has(medId)) {
            // GenericMedication fields are single-valued (one strength, one form,
            // one route per row) — no comma-splitting needed.
            const form = (med.dosage_form || med.form || "").trim();
            const defaultRouteFromForm = form.toLowerCase().includes("injection") || form.toLowerCase().includes("vial") ? "IV" : "Oral";
            nextConfigs.set(medId, {
              dosage: "",
              frequency: "Once daily (OD)",
              durationDays: "",
              route: med.route || defaultRouteFromForm,
              unit: normalizeDoseUnit(med.unit || form || undefined),
              strength: (med.strength || "").trim(),
              form,
              instructions: "",
              name: med.name,
              generic_name: med.active_ingredient,
            });
          }
          return nextConfigs;
        });
        return next;
      }
    });
  }, []);

  const updateMedicationConfig = useCallback((medId: number, field: keyof MedicationConfig, value: any) => {
    setMedicationConfigs((prev) => {
      const next = new Map(prev);
      const current = next.get(medId);
      if (!current) return next;
      const updated = { ...current, [field]: value };
      if (field === "dosage" || field === "frequency" || field === "durationDays") {
        const dailyDoses = frequencyToDailyDoses[updated.frequency] ?? 1;
        const dosageValue = parseFloat(String(updated.dosage || "").replace(/[^\d.]/g, "")) || 1;
        const days = updated.durationDays === "" ? 0 : Number(updated.durationDays || 0);
        updated.quantity =
          updated.frequency === "STAT (Single dose)"
            ? dosageValue
            : Math.ceil(dosageValue * dailyDoses * Math.max(days || 1, 1));
      }
      next.set(medId, updated);
      return next;
    });
  }, []);

  const getCalculatedQuantity = useCallback((cfg: MedicationConfig): number => {
    if (typeof cfg.quantity === "number" && Number.isFinite(cfg.quantity) && cfg.quantity > 0) {
      return cfg.quantity;
    }
    const dailyDoses = frequencyToDailyDoses[cfg.frequency] ?? 1;
    const dosageValue = parseFloat(String(cfg.dosage || "").replace(/[^\d.]/g, "")) || 1;
    const days = cfg.durationDays === "" ? 0 : Number(cfg.durationDays || 0);
    return cfg.frequency === "STAT (Single dose)"
      ? dosageValue
      : Math.ceil(dosageValue * dailyDoses * Math.max(days || 1, 1));
  }, []);

  // Results come from API search; no client-side filter needed
  const filteredMedications = generics;

  const buildSubmitPayload = (): PrescriptionOrderSubmitInput | null => {
    if (selectedMedications.length === 0) {
      toast.error("Please select at least one medication");
      return null;
    }
    const items: PrescriptionOrderItemInput[] = [];
    const missing: string[] = [];

    for (const medId of selectedMedications) {
      const med = generics.find((m) => normalizeMedicationId(m.id) === medId);
      const cfg = medicationConfigs.get(medId);
      const displayName = med?.name || cfg?.name || "Medication";
      if (!cfg) continue;

      // Mirror the UI behavior: merge defaults with saved config so "displayed values"
      // match what we validate and submit. Generic fields are single-valued.
      const medForm = (med?.dosage_form || med?.form || "").trim();
      const defaultCfg = {
        dosage: "",
        frequency: "Once daily (OD)" as const,
        durationDays: "" as const,
        route: med?.route || "Oral",
        unit: normalizeDoseUnit(med?.unit || medForm || undefined),
        strength: (med?.strength || "").trim() || cfg.strength,
        form: medForm || cfg.form,
        quantity: 0,
        instructions: "",
      };
      const mergedCfg = { ...defaultCfg, ...cfg };

      if (!mergedCfg.frequency?.trim()) missing.push(`${displayName} - frequency required`);
      const unitToSend = normalizeDoseUnit(mergedCfg.unit || "tablet");
      if (!unitToSend?.trim()) missing.push(`${displayName} - dose unit required`);

      // Quantity is inferred from dosage + frequency + durationDays (like room page)
      const dailyDoses = frequencyToDailyDoses[mergedCfg.frequency] ?? 1;
      const dosageValue = parseFloat(String(mergedCfg.dosage).replace(/[^\d.]/g, "")) || 1;
      const days = mergedCfg.durationDays === "" ? 0 : mergedCfg.durationDays || 0;
      const qty = Math.max(
        mergedCfg.frequency === "STAT (Single dose)"
          ? dosageValue
          : Math.ceil(dosageValue * dailyDoses * Math.max(days || 1, 1)),
        1
      );

      items.push({
        // `medId` IS the GenericMedication PK — the modal searches the
        // generics catalogue directly, so no brand/generic resolution needed.
        generic: medId,
        medication: null,
        medication_name: med?.name || mergedCfg.name || "",
        unit: unitToSend || "tablet",
        dosage_form: mergedCfg.form || med?.dosage_form || med?.form || "",
        strength: mergedCfg.strength || med?.strength || "",
        route: mergedCfg.route || med?.route || "Oral",
        dosage: mergedCfg.dosage || "As directed",
        frequency: mergedCfg.frequency || "Once daily (OD)",
        duration: (days ? `${days} days` : "As directed") as string,
        quantity: qty || 1,
        instructions: (mergedCfg.instructions?.trim() || clinicalIndication.trim()),
      });
    }

    if (missing.length > 0) {
      toast.error(
        `Please complete required fields for each medication: ${missing.join("; ")}`
      );
      return null;
    }

    return {
      priority,
      clinicalIndication: clinicalIndication.trim(),
      items,
    };
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const payload = buildSubmitPayload();
      if (!payload) return;

      await onSubmit(payload);
      onOpenChange(false);
      reset();
    } catch (err: any) {
      console.error("Failed to submit prescription order:", err);
      toast.error(err?.message || "Failed to add prescription");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className={MODAL_SIZES.ml}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-violet-500" />
            {dialogTitle || "Add Prescription"}
          </DialogTitle>
          <DialogDescription>
            {dialogDescription ||
              "Prescribe by generic molecule — search the pharmacy generics catalogue, configure dose details for each, and send them as one prescription order. The pharmacist will pick the brand from dispensary stock when filling the order."}
          </DialogDescription>
        </DialogHeader>

        {patientAllergies && patientAllergies.length > 0 && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>
                <strong>Allergies:</strong> {patientAllergies.join(", ")}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Medication Search */}
          <div className="space-y-2">
            <Label>Search and Select Medications *</Label>
            <div className="relative" ref={medicationDropdownRef}>
              <Input
                placeholder="Search generics by name, active ingredient, category, strength, form, or route..."
                value={medicationSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setMedicationSearch(v);
                  if (v.trim()) setShowMedicationDropdown(true);
                  else setShowMedicationDropdown(false);
                }}
                onFocus={() => { if (medicationSearch.trim()) setShowMedicationDropdown(true); }}
              />
              {showMedicationDropdown && medicationSearch.trim() && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
                  {loadingMedications ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                      Loading medications...
                    </div>
                  ) : filteredMedications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground space-y-2">
                      <div>No generics found for "{medicationSearch}"</div>
                      <div className="text-xs text-muted-foreground/75">Try a different search term, or check that generics have been added to Pharmacy → Generics.</div>
                    </div>
                  ) : (
                    filteredMedications.map((med) => {
                      const id = normalizeMedicationId(med.id);
                      if (!id) return null;
                      const isSelected = selectedMedications.includes(id);
                      return (
                        <div
                          key={id}
                          onClick={() => toggleMedicationSelection(med)}
                          className={`p-3 hover:bg-muted cursor-pointer border-b last:border-b-0 flex items-start gap-3 ${
                            isSelected ? "bg-violet-50 dark:bg-violet-900/20" : ""
                          }`}
                        >
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleMedicationSelection(med)} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{formatMedicationVariantLabel(med)}</div>
                            {(() => {
                              const subline = [med.active_ingredient, med.category]
                                .map((v) => (v || "").trim())
                                .filter((v) => v.length > 0)
                                .join(" • ");
                              return subline ? (
                                <div className="text-xs text-muted-foreground mt-1">{subline}</div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {selectedMedications.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="text-sm font-medium">Selected Medications ({selectedMedications.length}):</div>
                <div className="flex flex-wrap gap-2">
                  {selectedMedications.map((medId) => {
                    const med = generics.find((m) => normalizeMedicationId(m.id) === medId);
                    const cfg = medicationConfigs.get(medId);
                    const displayName = med ? formatMedicationVariantLabel(med) : (cfg ? formatMedicationVariantLabel({ name: cfg.name, strength: cfg.strength, form: cfg.form }) : "Medication");
                    return (
                      <Badge key={medId} variant="secondary" className="flex items-center gap-1">
                        {displayName}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => toggleMedicationSelection(med || { id: medId })} />
                      </Badge>
                    );
                  })}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedMedications([]);
                    setMedicationConfigs(new Map());
                  }}
                  className="text-xs"
                >
                  Clear All
                </Button>
              </div>
            )}
          </div>

          {/* Medication Configuration */}
          {selectedMedications.length > 0 && (
            <div className="space-y-4 border-t pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Configure Prescriptions</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Set dose, frequency, duration, route, and instructions for each selected medication
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {selectedMedications.length} medication{selectedMedications.length > 1 ? "s" : ""} selected
                </Badge>
              </div>

              <div className="space-y-3">
                {selectedMedications.map((medId) => {
                  const med = generics.find((m) => normalizeMedicationId(m.id) === medId);
                  const cfg = medicationConfigs.get(medId);
                  if (!cfg) return null;
                  const displayMed: GenericLike = med || { id: medId, name: cfg.name, active_ingredient: cfg.generic_name, strength: cfg.strength, form: cfg.form, dosage_form: cfg.form };
                  const activeIngredient = (med?.active_ingredient || cfg.generic_name || "").trim();
                  const renderMedForm = (med?.dosage_form || med?.form || "").trim();
                  const defaultCfg = {
                    dosage: "",
                    frequency: "Once daily (OD)" as const,
                    durationDays: "" as const,
                    route: med?.route || "Oral",
                    unit: normalizeDoseUnit(med?.unit || renderMedForm || undefined),
                    strength: (med?.strength || "").trim() || cfg.strength,
                    form: renderMedForm || cfg.form,
                    quantity: 0,
                    instructions: "",
                  };
                  const mergedCfg = { ...defaultCfg, ...cfg };

                  return (
                    <div key={medId} className="rounded-lg border border-l-4 border-l-violet-500 p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-medium text-sm">{formatMedicationVariantLabel(displayMed)}</div>
                          {activeIngredient ? (
                            <div className="text-xs text-muted-foreground">{activeIngredient}</div>
                          ) : null}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMedicationSelection(med || { id: medId })}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="space-y-1 md:col-span-4">
                            <Label className="text-xs">Dose per administration</Label>
                            <Input
                              type="text"
                              inputMode="decimal"
                              min={0.1}
                              step={0.1}
                              placeholder="e.g., 1, 5"
                              className="h-8 text-xs"
                              value={mergedCfg.dosage}
                              onChange={(e) => updateMedicationConfig(medId, "dosage", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1 md:col-span-3">
                            <Label className="text-xs">Dose unit <span className="text-red-500">*</span></Label>
                            <Select value={normalizeDoseUnit(mergedCfg.unit) || "tablet"} onValueChange={(v) => updateMedicationConfig(medId, "unit", v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRESCRIPTION_UNIT_OPTIONS.map((u) => (
                                  <SelectItem key={u} value={u}>{u}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 md:col-span-5">
                            <Label className="text-xs">Frequency <span className="text-red-500">*</span></Label>
                                <Select value={mergedCfg.frequency || "Once daily (OD)"} onValueChange={(v) => updateMedicationConfig(medId, "frequency", v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Once daily (OD)">Once daily (OD)</SelectItem>
                                    <SelectItem value="Twice daily (BD)">Twice daily (BD)</SelectItem>
                                    <SelectItem value="Three times daily (TDS)">Three times daily (TDS)</SelectItem>
                                    <SelectItem value="Four times daily (QDS)">Four times daily (QDS)</SelectItem>
                                    <SelectItem value="Every 6 hours (Q6H)">Every 6 hours</SelectItem>
                                    <SelectItem value="Every 8 hours (Q8H)">Every 8 hours</SelectItem>
                                    <SelectItem value="Every 12 hours (Q12H)">Every 12 hours</SelectItem>
                                    <SelectItem value="At bedtime (Nocte)">At bedtime (Nocte)</SelectItem>
                                    <SelectItem value="As needed (PRN)">As needed (PRN)</SelectItem>
                                    <SelectItem value="STAT (Single dose)">STAT (Single dose)</SelectItem>
                                    <SelectItem value="Weekly">Weekly</SelectItem>
                                  </SelectContent>
                                </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Duration (days)</Label>
                            <Input
                              type="number"
                              min={1}
                              placeholder="e.g., 7"
                              className="h-8 text-xs"
                              value={mergedCfg.durationDays === "" ? "" : String(mergedCfg.durationDays)}
                              onChange={(e) => {
                                const value = e.target.value;
                                const days = value === "" ? "" : parseInt(value, 10) || "";
                                updateMedicationConfig(medId, "durationDays", days);
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Route</Label>
                            <Select value={mergedCfg.route || "Oral"} onValueChange={(v) => updateMedicationConfig(medId, "route", v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Oral">Oral</SelectItem>
                                <SelectItem value="IV">Intravenous (IV)</SelectItem>
                                <SelectItem value="IM">Intramuscular (IM)</SelectItem>
                                <SelectItem value="SC">Subcutaneous (SC)</SelectItem>
                                <SelectItem value="Topical">Topical</SelectItem>
                                <SelectItem value="Inhalation">Inhalation</SelectItem>
                                <SelectItem value="Rectal">Rectal</SelectItem>
                                <SelectItem value="Ophthalmic">Ophthalmic</SelectItem>
                                <SelectItem value="Otic">Otic</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Instructions</Label>
                          <Textarea
                            placeholder="e.g., Take with food; rotate injection sites; monitor glucose"
                            className="min-h-[72px] text-xs resize-y"
                            value={mergedCfg.instructions || ""}
                            onChange={(e) => updateMedicationConfig(medId, "instructions", e.target.value)}
                            rows={3}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prescription Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Routine">
                    <Badge className="bg-blue-100 text-blue-800">Routine</Badge>
                  </SelectItem>
                  <SelectItem value="Urgent">
                    <Badge className="bg-amber-100 text-amber-800">Urgent</Badge>
                  </SelectItem>
                  <SelectItem value="STAT">
                    <Badge className="bg-red-100 text-red-800">STAT</Badge>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Clinical Indication */}
          <div className="space-y-2">
            <Label>Clinical Indication</Label>
            <Textarea
              value={clinicalIndication}
              onChange={(e) => setClinicalIndication(e.target.value)}
              placeholder="Reason for prescription, clinical context, and special instructions (optional)..."
              rows={3}
            />
          </div>

          {priority === "STAT" && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                STAT prescriptions require immediate attention from pharmacy.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || selectedMedications.length === 0}
            className="bg-violet-600 hover:bg-violet-700"
          >
                {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    {confirmLabel || `Add Prescription${selectedMedications.length > 1 ? "s" : ""}`}
                  </>
                )}
              </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
