"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  medicationId: number;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  unit: string;
  dosage_form?: string;
  strength?: string;
  route?: string;
  instructions: string;
};

export type PrescriptionOrderSubmitInput = {
  priority: "Routine" | "Urgent" | "STAT";
  clinicalIndication: string;
  items: PrescriptionOrderItemInput[];
};

type MedicationLike = {
  id: number | string;
  name?: string;
  generic_name?: string;
  form?: string;
  dosageForm?: string;
  dosage_form?: string;
  strength?: string;
  unit?: string;
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
];

const parseMedicationOptions = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
};

export function PrescriptionOrderModal({
  open,
  onOpenChange,
  patientAllergies,
  onSubmit,
  confirmLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientAllergies?: string[];
  onSubmit: (payload: PrescriptionOrderSubmitInput) => Promise<void>;
  confirmLabel?: string;
}) {
  const [medications, setMedications] = useState<MedicationLike[]>([]);
  const [loadingMedications, setLoadingMedications] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [medicationSearch, setMedicationSearch] = useState("");
  const [showMedicationDropdown, setShowMedicationDropdown] = useState(false);
  const [selectedMedications, setSelectedMedications] = useState<number[]>([]);
  const [medicationConfigs, setMedicationConfigs] = useState<Map<number, MedicationConfig>>(new Map());

  const [priority, setPriority] = useState<"Routine" | "Urgent" | "STAT">("Routine");
  const [clinicalIndication, setClinicalIndication] = useState("");

  const reset = useCallback(() => {
    setMedicationSearch("");
    setShowMedicationDropdown(false);
    setSelectedMedications([]);
    setMedicationConfigs(new Map());
    setPriority("Routine");
    setClinicalIndication("");
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      try {
        setLoadingMedications(true);
        const res = await pharmacyService.getMedications({ page_size: 500 } as any);
        setMedications((res as any)?.results || []);
      } catch (err: any) {
        console.error("Failed to load medications:", err);
        toast.error("Failed to load medications");
        setMedications([]);
      } finally {
        setLoadingMedications(false);
      }
    };

    load();
  }, [open]);

  const normalizeMedicationId = (id: number | string | undefined): number | null => {
    if (id == null) return null;
    const n = typeof id === "number" ? id : parseInt(id, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const toggleMedicationSelection = useCallback((med: MedicationLike) => {
    const medId = normalizeMedicationId(med.id);
    if (!medId) return;

    setSelectedMedications((prev) => {
      const isSelected = prev.includes(medId);
      if (isSelected) {
        // Remove from array
        const next = prev.filter(id => id !== medId);
        // remove config when deselecting
        setMedicationConfigs((prevConfigs) => {
          const nextConfigs = new Map(prevConfigs);
          nextConfigs.delete(medId);
          return nextConfigs;
        });
        return next;
      } else {
        // Add to beginning of array (newest first)
        const next = [medId, ...prev];

        // Close dropdown and clear search when medication is selected
        setShowMedicationDropdown(false);
        setMedicationSearch("");

        // ensure config exists
        setMedicationConfigs((prevConfigs) => {
          const nextConfigs = new Map(prevConfigs);
          if (!nextConfigs.has(medId)) {
            const formOptions = parseMedicationOptions(med.dosage_form || med.form || (med as any).dosageForm);
            const strengthOptions = parseMedicationOptions(med.strength);
            const form = (formOptions[0] || "").toLowerCase();
            const defaultRoute = form.includes("injection") || form.includes("vial") ? "IV" : "Oral";
            nextConfigs.set(medId, {
              dosage: "",
              frequency: "Once daily (OD)",
              durationDays: "",
              route: defaultRoute,
              unit: med.unit || formOptions[0] || "tablet",
              strength: strengthOptions[0] || "",
              form: formOptions[0] || "",
              instructions: "",
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

  const filteredMedications = useMemo(() => {
    const q = medicationSearch.trim().toLowerCase();
    if (!q) return medications;
    return medications.filter((m) => {
      const name = (m.name || "").toLowerCase();
      const generic = (m.generic_name || "").toLowerCase();
      const form = ((m.form || m.dosage_form || (m as any).dosageForm || "") as string).toLowerCase();
      return name.includes(q) || generic.includes(q) || form.includes(q);
    });
  }, [medications, medicationSearch]);

  const buildSubmitPayload = (): PrescriptionOrderSubmitInput | null => {
    if (selectedMedications.length === 0) {
      toast.error("Please select at least one medication");
      return null;
    }
    if (!clinicalIndication.trim()) {
      toast.error("Please provide clinical indication");
      return null;
    }

    const items: PrescriptionOrderItemInput[] = [];
    const missing: string[] = [];

    for (const medId of selectedMedications) {
      const med = medications.find((m) => normalizeMedicationId(m.id) === medId);
      const cfg = medicationConfigs.get(medId);
      if (!cfg?.dosage?.trim()) missing.push(`${med?.name || "Medication"} - dosage required`);
      if (!cfg?.frequency) missing.push(`${med?.name || "Medication"} - frequency required`);
      if (!cfg?.unit?.trim()) missing.push(`${med?.name || "Medication"} - unit required`);
      if (!cfg?.form?.trim()) missing.push(`${med?.name || "Medication"} - form required`);
      if (!cfg?.strength?.trim()) missing.push(`${med?.name || "Medication"} - strength required`);
      if (!cfg) continue;

      // Quantity is inferred from dosage + frequency + durationDays (like room page)
      const dailyDoses = frequencyToDailyDoses[cfg.frequency] ?? 1;
      const dosageValue = parseFloat(String(cfg.dosage).replace(/[^\d.]/g, "")) || 1;
      const days = cfg.durationDays === "" ? 0 : cfg.durationDays || 0;
      const qty =
        cfg.frequency === "STAT (Single dose)"
          ? dosageValue
          : Math.ceil(dosageValue * dailyDoses * Math.max(days || 1, 1));

      items.push({
        medicationId: medId,
        unit: cfg.unit || med?.unit || "tablet",
        dosage_form: cfg.form || med?.dosage_form || med?.form || (med as any)?.dosageForm || "",
        strength: cfg.strength || med?.strength || "",
        route: cfg.route || "Oral",
        dosage: cfg.dosage || "As directed",
        frequency: cfg.frequency || "Once daily (OD)",
        duration: days ? `${days} days` : "As directed",
        quantity: qty,
        instructions: (cfg.instructions || clinicalIndication).trim(),
      });
    }

    if (missing.length > 0) {
      toast.error("Please complete required fields for each medication (dosage, frequency, unit, form, strength).");
      return null;
    }

    return {
      priority,
      clinicalIndication: clinicalIndication.trim(),
      items,
    };
  };

  const handleConfirm = async () => {
    const payload = buildSubmitPayload();
    if (!payload) return;
    try {
      setSubmitting(true);
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
      <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-violet-500" />
            Add Prescription
          </DialogTitle>
          <DialogDescription>
            Search and select medications, then configure dosage details for each. All medications will be sent as one prescription order to Pharmacy queue.
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
            <div className="relative">
              <Input
                placeholder="Search medications by name or generic name..."
                value={medicationSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setMedicationSearch(v);
                  setShowMedicationDropdown(!!v.trim());
                }}
                onFocus={() => setShowMedicationDropdown(!!medicationSearch.trim())}
              />
              {showMedicationDropdown && medicationSearch.trim() && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
                  {loadingMedications ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                      Loading medications...
                    </div>
                  ) : filteredMedications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">No medications found.</div>
                  ) : (
                    filteredMedications.slice(0, 50).map((med) => {
                      const id = normalizeMedicationId(med.id);
                      if (!id) return null;
                      const isSelected = selectedMedications.has(id);
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
                            <div className="font-medium text-sm">{med.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {(med.generic_name || "").trim() ? `${med.generic_name} • ` : ""}
                              {med.dosage_form || med.form || (med as any).dosageForm || "N/A"}
                              {med.strength ? ` • ${med.strength}` : ""}
                            </div>
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
                  {medications
                    .filter((m) => {
                      const id = normalizeMedicationId(m.id);
                      return id != null && selectedMedications.includes(id);
                    })
                    .map((med) => {
                      const id = normalizeMedicationId(med.id)!;
                      return (
                        <Badge key={id} variant="secondary" className="flex items-center gap-1">
                          {med.name}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => toggleMedicationSelection(med)} />
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
                  <p className="text-xs text-muted-foreground mt-1">Set dosage, frequency, duration, unit, strength, and form for each selected medication</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {selectedMedications.length} medication{selectedMedications.length > 1 ? "s" : ""} selected
                </Badge>
              </div>

              <div className="space-y-3">
                {selectedMedications.map((medId) => {
                  const med = medications.find((m) => normalizeMedicationId(m.id) === medId);
                  if (!med) return null;
                  const cfg = medicationConfigs.get(medId) || {
                    dosage: "",
                    frequency: "Once daily (OD)",
                    durationDays: "" as const,
                    route: "Oral",
                    unit: med.unit || parseMedicationOptions(med.dosage_form || med.form || (med as any).dosageForm)[0] || "tablet",
                    strength: parseMedicationOptions(med.strength)[0] || "",
                    form: parseMedicationOptions(med.dosage_form || med.form || (med as any).dosageForm)[0] || "",
                    quantity: 0,
                    instructions: "",
                  };
                  const formOptions = parseMedicationOptions(med.dosage_form || med.form || (med as any).dosageForm);
                  const strengthOptions = parseMedicationOptions(med.strength);
                  const calculatedQuantity = getCalculatedQuantity(cfg);

                  return (
                    <div key={medId} className="rounded-lg border border-l-4 border-l-violet-500 p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-medium text-sm">{med.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {med.generic_name || ""} • {med.dosage_form || med.form || (med as any).dosageForm || "N/A"}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMedicationSelection(med)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Dosage <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="e.g., 1"
                            className="h-8 text-xs"
                            value={cfg.dosage || ""}
                            onChange={(e) => updateMedicationConfig(medId, "dosage", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Unit <span className="text-red-500">*</span>
                          </Label>
                          <Select value={cfg.strength || ""} onValueChange={(v) => updateMedicationConfig(medId, "strength", v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PRESCRIPTION_UNIT_OPTIONS.map((unit) => (
                                <SelectItem key={unit} value={unit}>
                                  {unit}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Form <span className="text-red-500">*</span>
                          </Label>
                          <Select value={cfg.form || ""} onValueChange={(v) => updateMedicationConfig(medId, "form", v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select form" />
                            </SelectTrigger>
                            <SelectContent>
                              {formOptions.map((form) => (
                                <SelectItem key={form} value={form}>
                                  {form}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Duration (days)</Label>
                          <Input
                            type="number"
                            min="1"
                            placeholder="e.g., 7"
                            className="h-8 text-xs"
                            value={cfg.durationDays === "" ? "" : String(cfg.durationDays)}
                            onChange={(e) => {
                              const value = e.target.value;
                              const days = value === "" ? "" : parseInt(value, 10) || "";
                              updateMedicationConfig(medId, "durationDays", days);
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Frequency <span className="text-red-500">*</span>
                          </Label>
                          <Select value={cfg.frequency || "Once daily (OD)"} onValueChange={(v) => updateMedicationConfig(medId, "frequency", v)}>
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
                              <SelectItem value="As needed (PRN)">As needed (PRN)</SelectItem>
                              <SelectItem value="STAT (Single dose)">STAT (Single dose)</SelectItem>
                              <SelectItem value="Weekly">Weekly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Strength <span className="text-red-500">*</span>
                          </Label>
                          <Select value={cfg.unit || "tablet"} onValueChange={(v) => updateMedicationConfig(medId, "unit", v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select strength" />
                            </SelectTrigger>
                            <SelectContent>
                              {strengthOptions.map((strength) => (
                                <SelectItem key={strength} value={strength}>
                                  {strength}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Route</Label>
                          <Select value={cfg.route || "Oral"} onValueChange={(v) => updateMedicationConfig(medId, "route", v)}>
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
                        <div className="space-y-1">
                          <Label className="text-xs">Calculated Quantity</Label>
                          <Input className="h-8 text-xs" value={String(calculatedQuantity)} readOnly />
                          <p className="text-[10px] text-muted-foreground">Dose x frequency x days</p>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        <Label className="text-xs">Instructions</Label>
                        <Textarea
                          placeholder="Special instructions (optional)"
                          rows={2}
                          className="text-xs"
                          value={cfg.instructions || ""}
                          onChange={(e) => updateMedicationConfig(medId, "instructions", e.target.value)}
                        />
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
            <Label>Clinical Indication *</Label>
            <Textarea
              value={clinicalIndication}
              onChange={(e) => setClinicalIndication(e.target.value)}
              placeholder="Reason for prescription, clinical context, and special instructions..."
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
            disabled={submitting || selectedMedications.length === 0 || !clinicalIndication.trim()}
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
