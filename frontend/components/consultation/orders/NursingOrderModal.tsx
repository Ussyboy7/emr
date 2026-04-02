"use client";

import React, { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, DoorOpen, Droplets, Loader2, Syringe } from "lucide-react";
import { toast } from "sonner";

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

const ivFluids = [
  { name: "Normal Saline 0.9%", category: "Crystalloid" },
  { name: "Ringer's Lactate", category: "Crystalloid" },
  { name: "Dextrose 5% (D5W)", category: "Crystalloid" },
  { name: "Dextrose Saline", category: "Crystalloid" },
  { name: "Half Normal Saline 0.45%", category: "Crystalloid" },
  { name: "Hartmann's Solution", category: "Crystalloid" },
];

export function NursingOrderModal({
  open,
  onOpenChange,
  onSubmit,
  confirmLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: NursingOrderSubmitInput) => Promise<void>;
  confirmLabel?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
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
    setForm({
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
    setSubmitting(false);
  }, []);

  const handleConfirm = async () => {
    if (!form.type || !form.instructions.trim()) {
      toast.error("Procedure type and instructions are required.");
      return;
    }
    if (form.type === "Injection" && !form.medication?.trim()) {
      toast.error("Medication is required for Injection.");
      return;
    }
    if (form.type === "Dressing" && (!form.woundLocation || !form.woundType)) {
      toast.error("Wound type and location are required for Dressing.");
      return;
    }
    if (form.type === "IV Infusion" && !form.medication?.trim()) {
      toast.error("IV fluid is required for IV Infusion.");
      return;
    }
    if (
      form.type === "Observation Admission" &&
      (!form.ward?.trim() || !form.admissionDiagnosis?.trim() || !form.presentingComplaint?.trim())
    ) {
      toast.error("Ward, diagnosis, and presenting complaint are required for Observation Admission.");
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit({
        ...form,
        medication: form.medication?.trim() || undefined,
        dosage: form.dosage?.trim() || undefined,
        instructions: form.instructions.trim(),
        ward: form.ward?.trim() || undefined,
        admissionDiagnosis: form.admissionDiagnosis?.trim() || undefined,
        presentingComplaint: form.presentingComplaint?.trim() || undefined,
      });
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
      <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
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
          <div className="space-y-2">
            <Label>Procedure Type *</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
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
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Injection">Injection</SelectItem>
                <SelectItem value="Dressing">Wound Dressing</SelectItem>
                <SelectItem value="IV Infusion">IV Infusion</SelectItem>
                <SelectItem value="Observation Admission">Observation Admission (Day Care)</SelectItem>
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
                <Label>Medication *</Label>
                <Input
                  value={form.medication || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, medication: e.target.value }))}
                  placeholder="e.g., Diclofenac 75mg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dose</Label>
                  <Input
                    value={form.dosage || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, dosage: e.target.value }))}
                    placeholder="e.g., 1 amp, 2ml"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Route</Label>
                  <Select value={form.route || "Intramuscular (IM)"} onValueChange={(v) => setForm((prev) => ({ ...prev, route: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {injectionRoutes.map((route) => (
                        <SelectItem key={route} value={route}>
                          {route}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
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

          {form.type === "IV Infusion" && (
            <>
              <div className="space-y-2">
                <Label>IV Fluid *</Label>
                <Select value={form.medication || ""} onValueChange={(v) => setForm((prev) => ({ ...prev, medication: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select IV fluid" />
                  </SelectTrigger>
                  <SelectContent>
                    {ivFluids.map((fluid) => (
                      <SelectItem key={fluid.name} value={fluid.name}>
                        {fluid.name} ({fluid.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Volume/Rate</Label>
                <Input
                  value={form.dosage || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, dosage: e.target.value }))}
                  placeholder="e.g., 500ml over 4 hours"
                />
              </div>
            </>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting} className="bg-cyan-600 hover:bg-cyan-700">
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

