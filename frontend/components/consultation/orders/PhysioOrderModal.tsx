"use client";

import React, { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type PhysioOrderSubmitInput = {
  historyClinicalFindings?: string;
  diagnosis: string;
  drugHistory?: string;
  specialInstructions?: string;
  priority?: "low" | "normal" | "high" | "urgent";
};

export function PhysioOrderModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: PhysioOrderSubmitInput) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PhysioOrderSubmitInput>({
    diagnosis: "",
    priority: "normal",
  });

  const reset = useCallback(() => {
    setForm({ diagnosis: "", priority: "normal" });
    setSubmitting(false);
  }, []);

  const handleConfirm = async () => {
    if (!form.diagnosis.trim()) {
      toast.error("Diagnosis is required");
      return;
    }
    try {
      setSubmitting(true);
      await onSubmit({
        diagnosis: form.diagnosis.trim(),
        historyClinicalFindings: form.historyClinicalFindings?.trim() || undefined,
        drugHistory: form.drugHistory?.trim() || undefined,
        specialInstructions: form.specialInstructions?.trim() || undefined,
        priority: form.priority || "normal",
      });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      console.error("Failed to submit physiotherapy order:", err);
      toast.error(err?.message || "Failed to add physiotherapy order");
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
      <DialogContent className={MODAL_SIZES.md}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-500" />
            Order Physiotherapy
          </DialogTitle>
          <DialogDescription>Create a physiotherapy treatment order - will be sent to Physiotherapy pool queue</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>History/Clinical Findings</Label>
            <Textarea value={form.historyClinicalFindings} onChange={(e) => setForm((p) => ({ ...p, historyClinicalFindings: e.target.value }))} placeholder="Patient's medical history and clinical findings..." rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Diagnosis *</Label>
            <Textarea value={form.diagnosis} onChange={(e) => setForm((p) => ({ ...p, diagnosis: e.target.value }))} placeholder="Primary diagnosis requiring physiotherapy" rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Drug History</Label>
            <Textarea value={form.drugHistory} onChange={(e) => setForm((p) => ({ ...p, drugHistory: e.target.value }))} placeholder="Current medications, allergies, and drug history..." rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as "low" | "normal" | "high" | "urgent" }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Special Instructions</Label>
            <Textarea value={form.specialInstructions} onChange={(e) => setForm((p) => ({ ...p, specialInstructions: e.target.value }))} placeholder="Any special requirements, contraindications, or notes for physiotherapist..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || !form.diagnosis.trim()} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Add Physiotherapy Order"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

