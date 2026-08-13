"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, DoorOpen, Loader2, Syringe } from "lucide-react";
import { toast } from "sonner";
import wardService, { type Ward } from "@/lib/services/ward-service";
import { MedicationGenericPicker } from "@/components/pharmacy/MedicationGenericPicker";
import {
  MedicationSelectionConfigList,
  type MedicationSelectionConfig,
} from "@/components/pharmacy/MedicationSelectionConfigList";
import {
  type GenericMedicationLike,
  DEFAULT_INJECTION_ROUTE,
  INJECTION_ROUTES,
  PROCEDURE_DOSE_UNITS,
  formatGenericMedicationLabel,
  genericMedicationKey,
} from "@/lib/pharmacy/generic-medication";

const formatMedicationLabel = formatGenericMedicationLabel;

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

type MedConfig = MedicationSelectionConfig;

export function NursingOrderModal({
  open,
  onOpenChange,
  onSubmit,
  confirmLabel,
  completeNowLabel,
  allowedTypes,
  initialPayload,
  observationDefaults,
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
  observationDefaults?: Pick<NursingOrderSubmitInput, "admissionDiagnosis" | "presentingComplaint">;
  descriptionExtra?: React.ReactNode;
  onSubmitCompleteNow?: (payload: NursingOrderSubmitInput) => Promise<void>;
}) {
  const procedureTypeOptions = useMemo(() =>
    allowedTypes?.length
      ? allowedTypes
      : (["Injection", "Dressing", "Observation Admission"] as const),
    [allowedTypes],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedGenerics, setSelectedGenerics] = useState<Map<string, GenericMedicationLike>>(new Map());
  const [medConfigs, setMedConfigs] = useState<Map<string, MedConfig>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loadingWards, setLoadingWards] = useState(false);
  const [form, setForm] = useState<NursingOrderSubmitInput>({
    type: "Injection",
    medication: "",
    dosage: "",
    route: DEFAULT_INJECTION_ROUTE,
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
      route: initialPayload?.route || DEFAULT_INJECTION_ROUTE,
      woundLocation: initialPayload?.woundLocation || "",
      woundType: initialPayload?.woundType || "",
      instructions: initialPayload?.instructions || "",
      priority: initialPayload?.priority || "Routine",
      ward: initialPayload?.ward || "",
      admissionDiagnosis: initialPayload?.admissionDiagnosis || (defaultType === "Observation Admission" ? observationDefaults?.admissionDiagnosis || "" : ""),
      presentingComplaint: initialPayload?.presentingComplaint || (defaultType === "Observation Admission" ? observationDefaults?.presentingComplaint || "" : ""),
    });
    setSelectedIds(new Set());
    setSelectedGenerics(new Map());
    setMedConfigs(new Map());
    setSubmitting(false);
  }, [initialPayload, observationDefaults, procedureTypeOptions]);

  const observationNotesComplete = Boolean(
    observationDefaults?.admissionDiagnosis?.trim() && observationDefaults?.presentingComplaint?.trim(),
  );

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
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open || allowedTypes?.length) return;
    setLoadingWards(true);
    wardService.getWards({ status: "active", page_size: 200 })
      .then((response) => setWards(response.results.filter((ward) => ward.status === "active" && ward.available_beds > 0)))
      .catch(() => toast.error("Unable to load active observation wards."))
      .finally(() => setLoadingWards(false));
  }, [open, allowedTypes]);

  const toggleMedication = useCallback((med: GenericMedicationLike, selected: boolean) => {
    const id = (med.id ?? "").toString();
    const key = genericMedicationKey(med);
    if (!id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!selected) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedGenerics((prev) => {
      const next = new Map(prev);
      if (!selected) next.delete(key);
      else next.set(key, med);
      return next;
    });
    setMedConfigs((prevConfigs) => {
      const nextConfigs = new Map(prevConfigs);
      if (!selected) {
        nextConfigs.delete(id);
        return nextConfigs;
      }
      if (!nextConfigs.has(id)) {
        const formVal = (med.dosage_form || med.form || "").trim();
        const defaultRoute =
          formVal.toLowerCase().includes("injection") || formVal.toLowerCase().includes("vial")
            ? DEFAULT_INJECTION_ROUTE
            : "Oral";
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
      const med = Array.from(selectedGenerics.values()).find((m) => (m.id ?? "").toString() === id);
      const cfg = medConfigs.get(id);
      const label = med ? formatMedicationLabel(med) : "Medication";
      medLabels.push(cfg?.instructions?.trim() ? `${label} (${cfg.instructions.trim()})` : label);
      if (cfg?.dose) doseParts.push(`${cfg.dose} ${cfg.doseUnit}`);
      if (cfg?.route && (INJECTION_ROUTES as readonly string[]).includes(cfg.route)) finalRoute = cfg.route;
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
                   admissionDiagnosis: v === "Observation Admission" ? observationDefaults?.admissionDiagnosis || "" : "",
                   presentingComplaint: v === "Observation Admission" ? observationDefaults?.presentingComplaint || "" : "",
                }));
                setSelectedIds(new Set());
                setSelectedGenerics(new Map());
                setMedConfigs(new Map());
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
                     {wards.map((ward) => (
                       <SelectItem key={ward.id} value={String(ward.id)}>
                         {ward.name} ({ward.available_beds} bed{ward.available_beds === 1 ? "" : "s"} available)
                       </SelectItem>
                     ))}
                     {!loadingWards && wards.length === 0 && (
                       <SelectItem value="none" disabled>No active ward has an available bed</SelectItem>
                     )}
                   </SelectContent>
                </Select>
              </div>
               {observationNotesComplete ? (
                 <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-900 dark:bg-cyan-950/20">
                   <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">From consultation notes</p>
                   <p className="mt-2 text-sm"><span className="font-medium">Diagnosis:</span> {observationDefaults?.admissionDiagnosis}</p>
                   <p className="mt-1 text-sm"><span className="font-medium">Presenting complaint:</span> {observationDefaults?.presentingComplaint}</p>
                 </div>
               ) : (
                 <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                   Complete Medical Notes first: a primary diagnosis and presenting complaint are required before creating an observation admission.
                 </div>
               )}
            </>
          )}

          {form.type === "Injection" && (
            <>
              <MedicationGenericPicker
                active={open}
                label="Search and Select Medications *"
                placeholder="Search generics by name, active ingredient, category..."
                selectedKeys={Array.from(selectedIds).map((id) => `g:${id}`)}
                selectedGenerics={selectedGenerics}
                onToggle={toggleMedication}
                onClearAll={() => {
                  setSelectedIds(new Set());
                  setSelectedGenerics(new Map());
                  setMedConfigs(new Map());
                }}
                selectionStyle="checkbox"
                selectedLabel="Selected medications"
              />

              <MedicationSelectionConfigList
                selectedIds={Array.from(selectedIds)}
                getMedication={(id) => selectedGenerics.get(`g:${id}`)}
                configs={medConfigs}
                onUpdateConfig={(id, patch) => {
                  for (const [k, v] of Object.entries(patch)) {
                    updateConfig(id, k as keyof MedConfig, v);
                  }
                }}
                onRemove={(id) => {
                  const medObj = selectedGenerics.get(`g:${id}`);
                  if (medObj) toggleMedication(medObj, false);
                }}
                doseUnitOptions={PROCEDURE_DOSE_UNITS}
                routeOptions={INJECTION_ROUTES}
              />
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
              disabled={submitting || (form.type === "Injection" && selectedIds.size === 0) || (form.type === "Observation Admission" && !observationNotesComplete)}
              className="border-violet-500/50 text-violet-700 dark:text-violet-300"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {completeNowLabel || "Add & complete now"}
            </Button>
          ) : null}
          <Button
            onClick={() => void handleConfirm()}
            disabled={submitting || (form.type === "Injection" && selectedIds.size === 0) || (form.type === "Observation Admission" && !observationNotesComplete)}
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
