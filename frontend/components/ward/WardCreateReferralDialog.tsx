"use client";

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import type { PatientAdmission } from "@/lib/services/ward-service";
import {
  FacilityPartnerSelect,
  type FacilityPartnerSelectValue,
} from "@/components/referrals/FacilityPartnerSelect";
import { REFERRAL_SPECIALTIES } from "@/lib/constants/medical-data";

/**
 * Ward-side "Create Referral" dialog. Mirrors the field set of the
 * consultation room's inline referral dialog (specialty, receiving facility,
 * reason, urgency, clinical summary, contact person/phone) but submits through
 * the admission-scoped `useWardOrders.createReferral` creator so the referral
 * is stamped with the patient, visit, and admission.
 */
export function WardCreateReferralDialog({
  open,
  onOpenChange,
  admission,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: PatientAdmission;
  onSubmit: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [facility, setFacility] = useState<FacilityPartnerSelectValue>({
    partnerId: null,
    facility: "",
    facility_type: "internal",
  });
  const [specialty, setSpecialty] = useState("");
  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "emergency">("routine");
  const [clinicalSummary, setClinicalSummary] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const reset = useCallback(() => {
    setFacility({ partnerId: null, facility: "", facility_type: "internal" });
    setSpecialty("");
    setReason("");
    setUrgency("routine");
    setClinicalSummary("");
    setContactPerson("");
    setContactPhone("");
    setSubmitting(false);
  }, []);

  const handleConfirm = async () => {
    if (!specialty) {
      toast.error("Referral specialty is required");
      return;
    }
    if (!facility.facility.trim()) {
      toast.error("Receiving facility is required");
      return;
    }
    if (!reason.trim()) {
      toast.error("Referral reason is required");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onSubmit({
        specialty,
        facility: facility.facility.trim(),
        facility_partner: facility.partnerId,
        facility_type: facility.facility_type,
        reason: reason.trim(),
        urgency,
        clinical_summary: clinicalSummary.trim() || undefined,
        contact_person: contactPerson.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
      });
      if (ok) {
        onOpenChange(false);
        reset();
      }
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
            <Send className="h-5 w-5 text-teal-500" />
            Create Referral
          </DialogTitle>
          <DialogDescription>
            Refer {admission.patient_name} to a specialist or receiving facility
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Specialty *</Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger>
                  <SelectValue placeholder="Select specialty" />
                </SelectTrigger>
                <SelectContent className="max-h-[250px]">
                  {REFERRAL_SPECIALTIES.map((spec) => (
                    <SelectItem key={spec} value={spec}>
                      {spec}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Urgency</Label>
              <Select
                value={urgency}
                onValueChange={(v: "routine" | "urgent" | "emergency") => setUrgency(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Referral Facility *</Label>
            <FacilityPartnerSelect value={facility} onChange={setFacility} showLabel={false} />
          </div>

          <div className="space-y-2">
            <Label>Reason for Referral *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you referring this patient?"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Clinical summary</Label>
            <Textarea
              value={clinicalSummary}
              onChange={(e) => setClinicalSummary(e.target.value)}
              placeholder="Brief clinical context for the receiving team"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact person</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Dr. / Nurse name"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact phone</Label>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Phone number"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || !specialty || !facility.facility.trim() || !reason.trim()}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Create Referral
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
