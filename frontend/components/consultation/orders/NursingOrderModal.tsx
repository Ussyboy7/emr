"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Activity, AlertTriangle, DoorOpen, Loader2, Syringe, X } from "lucide-react";
import { toast } from "sonner";
import { pharmacyService } from "@/lib/services";

function formatMedicationLabel(med: { name?: string; strength?: string; form?: string; dosage_form?: string }): string {
  const name = med?.name || "";
  const strength = (med?.strength || "").toString().trim();
  const form = (med?.dosage_form || med?.form || "").toString().trim();
  if (strength && form) return `${name} (${strength}, ${form})`;
  if (strength) return `${name} (${strength})`;
  if (form) return `${name} (${form})`;
  return name;
}

export type NursingOrderSubmitInput = {
  type: "Injection" | "Dressing" | "IV Infusion" | "Observation Admission";
  medication?: string;
  dosage?: string;
  route?: string;
  woundLocation?: string;
  woundType?: string;
  instructions: string;
  priority: "Routine" | "Urgent" | "STAT";
  ward?: string;
  admissionDiagnosis?: string;
  presentingComplaint?: string;
};

const injectionRoutes = [
  "Intramuscular (IM)",
  "Intravenous (IV)",
  "Subcutaneous (SC)",
  "Intradermal (ID)",
];

const DOSE_UNIT_OPTIONS = ["vial", "ampoule", "ml", "mg", "tablet", "capsule", "drop", "patch", "puff", "tube", "bottle", "sachet"];

const FREQUENCY_OPTIONS = [
  "Once daily (OD)",
  "Twice daily (BD)",
  "Three times daily (TDS)",
  "Four times daily (QDS)",
  "Every 6 hours (Q6H)",
  "Every 8 hours (Q8H)",
  "Every 12 hours (Q12H)",
  "At bedtime (Nocte)",
  "As needed (PRN)",
  "STAT (Single dose)",
];

const woundTypes = [
  "Surgical Wound",
  "Traumatic Wound",
  "Burn Wound",
  "Pressure Ulcer",
  "Diabetic Foot Ulcer",
  "Venous Leg Ulcer",
];

const woundLocations = [
  "Head/Neck",
  "Chest",
  "Abdomen",
  "Back",
  "Upper Limb - Left",
  "Upper Limb - Right",
  "Lower Limb - Left",
  "Lower Limb - Right",
  "Perineal Region",
  "Multiple Sites",
];

type MedConfig = {
  dose: string;
  doseUnit: string;
  frequency: string;
  durationDays: number | "";
  route: string;
  instructions: string;
};

type GenericResult = {
  id: number | string;
  name?: string;
  active_ingredient?: string;
  category?: string;
  dosage_form?: string;
  strength?: string;
  route?: string;
};

export function NursingOrderModal({
  open,
  onOpenChange,
  onSubmit,
  confirmLabel,
  completeNowLabel,
  allowedTypes,
  initialPayload,
  descriptionExtra,
  onSubmitCompleteNow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: NursingOrderSubmitInput) => Promise<void>;
  confirmLabel?: string;
  completeNowLabel?: string;
  /** When set, only these procedure types appear in the picker (e.g. nurse repeat flow). */
  allowedTypes?: Array<"Injection" | "Dressing">;
  initialPayload?: Partial<NursingOrderSubmitInput>;
  descriptionExtra?: React.ReactNode;
  onSubmitCompleteNow?: (payload: NursingOrderSubmitInput) => Promise<void>;
}) {
  const procedureTypeOptions = useMemo(() =>
    allowedTypes?.length
      ? allowedTypes
      : (["Injection", "Dressing", "Observation Admission"] as const),
    [allowedTypes],
  );
  const [generics, setGenerics] = useState<GenericResult[]>([]);
  const [loadingMedications, setLoadingMedications] = useState(false);
  const [medicationSearch, setMedicationSearch] = useState("");
  const [showMedicationDropdown, setShowMedicationDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [medConfigs, setMedConfigs] = useState<Map<string, MedConfig>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const searchRequestIdRef = useRef(0);
  const medicationDropdownRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<NursingOrderSubmitInput>({
    type: "Injection",
    medication: "",
    dosage: "",
    route: "Intramuscular (IM)",
    woundLocation: "",
    woundType: "",
    instructions: "",
    priority: "Routine",
    ward: "",
    admissionDiagnosis: "",
    presentingComplaint: "",
  });

  const reset = useCallback(() => {
    const defaultType = initialPayload?.type || procedureTypeOptions[0] || "Injection";
    setForm({
      type: defaultType,
      medication: initialPayload?.medication || "",
      dosage: initialPayload?.dosage || "",
      route: initialPayload?.route || "Intramuscular (IM)",
      woundLocation: initialPayload?.woundLocation || "",
      woundType: initialPayload?.woundType || "",
      instructions: initialPayload?.instructions || "",
      priority: initialPayload?.priority || "Routine",
      ward: initialPayload?.ward || "",
      admissionDiagnosis: initialPayload?.admissionDiagnosis || "",
      presentingComplaint: initialPayload?.presentingComplaint || "",
    });
    setGenerics([]);
    setMedicationSearch("");
    setShowMedicationDropdown(false);
    setSelectedIds(new Set());
    setMedConfigs(new Map());
    setSubmitting(false);
  }, [initialPayload, procedureTypeOptions]);

  useEffect(() => {
    if (open && initialPayload) {
      setForm((prev) => ({
        ...prev,
        ...initialPayload,
        type: initialPayload.type || prev.type,
      }));
    }
  }, [open, initialPayload]);

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
        const res = await pharmacyService.getGenericsForPrescription({ search: searchTerm, page_size: 50 });
        if (requestId === searchRequestIdRef.current) {
          const results = (res as any)?.results || [];
          setGenerics(results);
        }
      } catch (err: any) {
        if (requestId === searchRequestIdRef.current) {
          console.error("Failed to search generics:", err);
          toast.error(err?.message || "Failed to load medication search results");
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

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const normalizedId = (med: GenericResult): string => (med.id ?? "").toString();

  const toggleMedication = useCallback((med: GenericResult) => {
    const id = normalizedId(med);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setMedConfigs((prevConfigs) => {
          const nextConfigs = new Map(prevConfigs);
          nextConfigs.delete(id);
          return nextConfigs;
        });
      } else {
        next.add(id);
        setMedConfigs((prevConfigs) => {
          const nextConfigs = new Map(prevConfigs);
          if (!nextConfigs.has(id)) {
            const formVal = (med.dosage_form || "").trim();
            const defaultRoute = formVal.toLowerCase().includes("injection") || formVal.toLowerCase().includes("vial") ? "Intramuscular (IM)" : "Oral";
            nextConfigs.set(id, {
              dose: "",
              doseUnit: formVal.toLowerCase().includes("tablet") ? "tablet" : "vial",
              frequency: "Once daily (OD)",
              durationDays: "",
              route: med.route || defaultRoute,
              instructions: "",
            });
          }
          return nextConfigs;
        });
      }
      return next;
    });
  }, []);

  const updateConfig = useCallback((id: string, field: keyof MedConfig, value: any) => {
    setMedConfigs((prev) => {
      const next = new Map(prev);
      const current = next.get(id);
      if (!current) return next;
      next.set(id, { ...current, [field]: value });
      return next;
    });
  }, []);

  const selectedGenerics = generics.filter((m) => selectedIds.has(normalizedId(m)));

  const buildSubmitPayload = (): NursingOrderSubmitInput | null => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one medication");
      return null;
    }

    const medLabels: string[] = [];
    const doseParts: string[] = [];
    let finalRoute = form.route;
    const instrParts: string[] = [];

    for (const id of selectedIds) {
      const med = generics.find((m) => normalizedId(m) === id);
      const cfg = medConfigs.get(id);
      const label = med ? formatMedicationLabel(med) : "Medication";
      medLabels.push(cfg?.instructions?.trim() ? `${label} (${cfg.instructions.trim()})` : label);
      if (cfg?.dose) doseParts.push(`${cfg.dose} ${cfg.doseUnit}`);
      if (cfg?.route && injectionRoutes.includes(cfg.route)) finalRoute = cfg.route;
      if (cfg?.frequency) instrParts.push(`Freq: ${cfg.frequency}`);
      if (cfg?.durationDays !== "" && cfg?.durationDays) instrParts.push(`Dur: ${cfg.durationDays} days`);
    }

    const medication = medLabels.join(" + ");
    const dosage = doseParts.join(" + ") || undefined;
    const instructions = [instrParts.join(" | "), form.instructions].filter(Boolean).join(". ");

    return {
      ...form,
      medication,
      dosage,
      route: finalRoute,
      instructions: instructions || form.instructions,
    };
  };

  const normalizePayload = (payload: NursingOrderSubmitInput): NursingOrderSubmitInput => ({
    ...payload,
    medication: payload.medication?.trim() || undefined,
    dosage: payload.dosage?.trim() || undefined,
    instructions: payload.instructions.trim(),
    ward: payload.ward?.trim() || undefined,
    admissionDiagnosis: payload.admissionDiagnosis?.trim() || undefined,
    presentingComplaint: payload.presentingComplaint?.trim() || undefined,
  });

  const validatePayload = (payload: NursingOrderSubmitInput): boolean => {
    if (!payload.type || !payload.instructions.trim()) {
      toast.error("Procedure type and instructions are required.");
      return false;
    }
    if (payload.type === "Injection" && !payload.medication?.trim()) {
      toast.error("Medication is required for Injection.");
      return false;
    }
    if (payload.type === "Dressing" && (!payload.woundLocation || !payload.woundType)) {
      toast.error("Wound type and location are required for Dressing.");
      return false;
    }
    if (
      payload.type === "Observation Admission" &&
      (!payload.ward?.trim() || !payload.admissionDiagnosis?.trim() || !payload.presentingComplaint?.trim())
    ) {
      toast.error("Ward, diagnosis, and presenting complaint are required for Observation Admission.");
      return false;
    }
    return true;
  };

  const handleConfirm = async (
    payloadOverride?: NursingOrderSubmitInput,
    submitFn: (payload: NursingOrderSubmitInput) => Promise<void> = onSubmit
  ) => {
    const raw = payloadOverride || (form.type === "Injection" ? buildSubmitPayload() : form);
    if (!raw) return;
    if (!validatePayload(raw)) return;

    try {
      setSubmitting(true);
      await submitFn(normalizePayload(raw));
      onOpenChange(false);
      reset();
    } catch (err: any) {
      console.error("Failed to submit nursing order:", err);
      toast.error(err?.message || "Failed to add nursing order");
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
            <Syringe className="h-5 w-5 text-cyan-500" />
            Add Nursing Order
          </DialogTitle>
          <DialogDescription>
            Add nursing procedure to order - will be sent to Nursing queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {descriptionExtra}
          <div className="space-y-2">
            <Label>Procedure Type *</Label>
            <Select
              value={form.type}
              onValueChange={(v) => {
                setForm((prev) => ({
                  ...prev,
                  type: v as NursingOrderSubmitInput["type"],
                  medication: "",
                  dosage: "",
                  woundLocation: "",
                  woundType: "",
                  ward: "",
                  admissionDiagnosis: "",
                  presentingComplaint: "",
                }));
                setSelectedIds(new Set());
                setMedConfigs(new Map());
                setMedicationSearch("");
                setShowMedicationDropdown(false);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {procedureTypeOptions.includes("Injection") && (
                  <SelectItem value="Injection">Injection</SelectItem>
                )}
                {procedureTypeOptions.includes("Dressing") && (
                  <SelectItem value="Dressing">Wound Dressing</SelectItem>
                )}
                {!allowedTypes?.length && (
                  <SelectItem value="Observation Admission">Observation Admission (Day Care)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {form.type === "Observation Admission" && (
            <>
              <div className="space-y-2">
                <Label>Observation Ward *</Label>
                <Select value={form.ward || ""} onValueChange={(v) => setForm((prev) => ({ ...prev, ward: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ward for observation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FEMALE-MED">Female Medical Ward</SelectItem>
                    <SelectItem value="MALE-MED">Male Medical Ward</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observation Diagnosis *</Label>
                <Textarea
                  value={form.admissionDiagnosis || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, admissionDiagnosis: e.target.value }))}
                  placeholder="Primary diagnosis for observation"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Presenting Complaint *</Label>
                <Textarea
                  value={form.presentingComplaint || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, presentingComplaint: e.target.value }))}
                  placeholder="Patient's presenting complaint"
                  rows={2}
                />
              </div>
            </>
          )}

          {form.type === "Injection" && (
            <>
              <div className="space-y-2">
                <Label>Search and Select Medications *</Label>
                <div className="relative" ref={medicationDropdownRef}>
                  <Input
                    placeholder="Search generics by name, active ingredient, category..."
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
                      ) : generics.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No generics found for "{medicationSearch}"
                        </div>
                      ) : (
                        generics.map((med) => {
                          const id = normalizedId(med);
                          if (!id) return null;
                          const isSelected = selectedIds.has(id);
                          const label = formatMedicationLabel(med);
                          const subline = [med.active_ingredient, med.category]
                            .map((v) => (v || "").trim())
                            .filter((v) => v.length > 0)
                            .join(" • ");
                          return (
                            <div
                              key={id}
                              onClick={() => toggleMedication(med)}
                              className={`p-3 hover:bg-muted cursor-pointer border-b last:border-b-0 flex items-start gap-3 ${
                                isSelected ? "bg-violet-50 dark:bg-violet-900/20" : ""
                              }`}
                            >
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleMedication(med)} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{label}</div>
                                {subline ? (
                                  <div className="text-xs text-muted-foreground mt-1">{subline}</div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {selectedIds.size > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="text-sm font-medium">Selected Medications ({selectedIds.size}):</div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(selectedIds).map((id) => {
                        const med = generics.find((m) => normalizedId(m) === id);
                        const label = med ? formatMedicationLabel(med) : "Medication";
                        return (
                          <Badge key={id} variant="secondary" className="flex items-center gap-1">
                            {label}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => {
                              const med = generics.find((m) => normalizedId(m) === id);
                              if (med) toggleMedication(med);
                            }} />
                          </Badge>
                        );
                      })}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedIds(new Set());
                        setMedConfigs(new Map());
                      }}
                      className="text-xs"
                    >
                      Clear All
                    </Button>
                  </div>
                )}
              </div>

              {selectedIds.size > 0 && (
                <div className="space-y-4 border-t pt-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-semibold">Configure Prescriptions</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Set dose, frequency, duration, route, and instructions for each selected medication
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {selectedIds.size} medication{selectedIds.size > 1 ? "s" : ""} selected
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {Array.from(selectedIds).map((id) => {
                      const med = generics.find((m) => normalizedId(m) === id);
                      const cfg = medConfigs.get(id);
                      if (!cfg) return null;
                      const label = med ? formatMedicationLabel(med) : "Medication";
                      const activeIngredient = (med?.active_ingredient || "").trim();

                      return (
                        <div key={id} className="rounded-lg border border-l-4 border-l-cyan-500 p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="font-medium text-sm">{label}</div>
                              {activeIngredient ? (
                                <div className="text-xs text-muted-foreground">{activeIngredient}</div>
                              ) : null}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const medObj = generics.find((m) => normalizedId(m) === id);
                                if (medObj) toggleMedication(medObj);
                              }}
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
                                  value={cfg.dose}
                                  onChange={(e) => updateConfig(id, "dose", e.target.value)}
                                />
                              </div>
                              <div className="space-y-1 md:col-span-3">
                                <Label className="text-xs">Dose unit <span className="text-red-500">*</span></Label>
                                <Select value={cfg.doseUnit} onValueChange={(v) => updateConfig(id, "doseUnit", v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {DOSE_UNIT_OPTIONS.map((u) => (
                                      <SelectItem key={u} value={u}>{u}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1 md:col-span-5">
                                <Label className="text-xs">Frequency <span className="text-red-500">*</span></Label>
                                <Select value={cfg.frequency} onValueChange={(v) => updateConfig(id, "frequency", v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FREQUENCY_OPTIONS.map((f) => (
                                      <SelectItem key={f} value={f}>{f}</SelectItem>
                                    ))}
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
                                  value={cfg.durationDays === "" ? "" : String(cfg.durationDays)}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    updateConfig(id, "durationDays", value === "" ? "" : parseInt(value, 10) || "");
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Route</Label>
                                <Select value={cfg.route} onValueChange={(v) => updateConfig(id, "route", v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {injectionRoutes.map((r) => (
                                      <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Instructions</Label>
                              <Textarea
                                placeholder="e.g., Administer slowly; monitor for adverse reactions"
                                className="min-h-[72px] text-xs resize-y"
                                value={cfg.instructions}
                                onChange={(e) => updateConfig(id, "instructions", e.target.value)}
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
            </>
          )}

          {form.type === "Dressing" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Wound Type *</Label>
                <Select value={form.woundType || ""} onValueChange={(v) => setForm((prev) => ({ ...prev, woundType: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select wound type" />
                  </SelectTrigger>
                  <SelectContent>
                    {woundTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Location *</Label>
                <Select value={form.woundLocation || ""} onValueChange={(v) => setForm((prev) => ({ ...prev, woundLocation: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {woundLocations.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm((prev) => ({ ...prev, priority: v as NursingOrderSubmitInput["priority"] }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Routine">Routine</SelectItem>
                <SelectItem value="Urgent">Urgent</SelectItem>
                <SelectItem value="STAT">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Instructions *</Label>
            <Textarea
              value={form.instructions}
              onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
              placeholder="Detailed instructions for the nursing team..."
              rows={3}
            />
          </div>

          {form.priority === "STAT" && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                STAT orders require immediate attention from the nursing team.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          {onSubmitCompleteNow ? (
            <Button
              variant="outline"
              onClick={() => void handleConfirm(undefined, onSubmitCompleteNow)}
              disabled={submitting || (form.type === "Injection" && selectedIds.size === 0)}
              className="border-violet-500/50 text-violet-700 dark:text-violet-300"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {completeNowLabel || "Add & complete now"}
            </Button>
          ) : null}
          <Button
            onClick={() => void handleConfirm()}
            disabled={submitting || (form.type === "Injection" && selectedIds.size === 0)}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Syringe className="h-4 w-4 mr-2" />
                {confirmLabel || "Add to Order"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
