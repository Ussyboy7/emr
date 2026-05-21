"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, CheckCircle, User, Phone, Mail, Printer } from "lucide-react";
import type { ResponsibilityFormIssuance } from "@/lib/services/referral-service";
import {
  type ReferralWithPatient,
  toLabel,
  referralStatusLabel,
  getStatusBadgeClass,
  getUrgencyBadgeClass,
  getFacilityTypeBadgeClass,
} from "@/lib/referrals/referral-helpers";
import { ResponsibilityFormHistoryTable } from "@/components/referrals/responsibility-form-blocks";

function isApprovedForFormsLike(status: string) {
  return status === "approved_for_forms" || status === "scheduled";
}

/** Detail modal used only on the Medical Records referral queue (stamping / workflow). */
export function MedicalRecordsReferralDetailModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referral: ReferralWithPatient | null;
  forms: ResponsibilityFormIssuance[];
  formsLoading: boolean;
  isRecordsUser: boolean;
  onPrintLetter: (r: ReferralWithPatient) => void;
  onPrintForm: (r: ReferralWithPatient, form?: ResponsibilityFormIssuance) => void;
  onAcknowledgeForm?: (form: ResponsibilityFormIssuance) => void;
  acknowledgingFormId?: number | null;
  onCloseReferral: () => void;
}) {
  const {
    open,
    onOpenChange,
    referral,
    forms,
    formsLoading,
    isRecordsUser,
    onPrintLetter,
    onPrintForm,
    onAcknowledgeForm,
    acknowledgingFormId,
    onCloseReferral,
  } = props;

  /** Sent to Medical Records: timestamp from API, or status (covers legacy rows before submitted_at backfill). */
  const consultationSentToRecords =
    Boolean(referral?.submitted_at) ||
    (referral?.status &&
      [
        "submitted_to_records",
        "records_review",
        "approved_for_forms",
        "closed",
        "cancelled",
        "scheduled", // legacy → approved_for_forms in API list
      ].includes(referral.status));

  const stampWorkflowActive =
    referral != null &&
    (referral.status === "submitted_to_records" || referral.status === "records_review") &&
    consultationSentToRecords;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Records queue — {referral?.referral_id}
          </DialogTitle>
          <DialogDescription>
            {referral
              ? isApprovedForFormsLike(referral.status)
                ? "Records acknowledged when every current issuance is stamped. New responsibility forms from Consultation reopen review until stamped again. Eligible files auto-close after month-end unless a new form is issued in the new month. You can still close manually."
                : stampWorkflowActive
                  ? "Print the letter or forms as needed. After you physically stamp each slip, use Records stamp on that row. When every issuance is stamped, status becomes Records acknowledged automatically."
                  : consultationSentToRecords
                    ? "Print or review this referral. Stamp actions appear when the referral is submitted or in review."
                    : "The referring clinician must submit this referral from Consultation (Send to Medical Records) before stamping. You can still print if forms already exist."
              : "Medical Records referral queue."}
          </DialogDescription>
        </DialogHeader>
        {referral && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={getStatusBadgeClass(referral.status)}>
                  {referralStatusLabel(referral.status)}
                </Badge>
                <Badge variant="outline" className={getUrgencyBadgeClass(referral.urgency)}>
                  {toLabel(referral.urgency)}
                </Badge>
                <Badge variant="outline" className={getFacilityTypeBadgeClass(referral.facility_type)}>
                  {toLabel(referral.facility_type)}
                </Badge>
              </div>
              <div className="flex flex-col gap-2 min-w-0 lg:items-end">
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button size="sm" variant="outline" onClick={() => onPrintLetter(referral)}>
                    <Printer className="h-4 w-4 mr-1" />
                    Print letter
                  </Button>
                  {forms.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => onPrintForm(referral, forms[0])}>
                      <Printer className="h-4 w-4 mr-1" />
                      Print latest form
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Patient</Label>
                <p>{referral.patient_name ?? ""}</p>
              </div>
              {referral.referred_by_name && (
                <div>
                  <Label className="text-muted-foreground">Referred by</Label>
                  <p>{referral.referred_by_name}</p>
                </div>
              )}
              {referral.location_clinic_name && (
                <div>
                  <Label className="text-muted-foreground">Location</Label>
                  <p>{referral.location_clinic_name}</p>
                </div>
              )}
              <div className="col-span-2">
                <Label className="text-muted-foreground">Reason</Label>
                <p className="p-2 bg-muted/50 rounded mt-1">{referral.reason}</p>
              </div>
              {referral.clinical_summary && (
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Clinical summary</Label>
                  <p className="p-2 bg-muted/50 rounded mt-1">{referral.clinical_summary}</p>
                </div>
              )}
            </div>

            {(referral.contact_person || referral.contact_phone || referral.contact_email) && (
              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <Label className="text-xs font-medium text-muted-foreground">Receiving facility contact</Label>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                  {referral.contact_person && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      {referral.contact_person}
                    </span>
                  )}
                  {referral.contact_phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3 shrink-0" />
                      {referral.contact_phone}
                    </span>
                  )}
                  {referral.contact_email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3 shrink-0" />
                      {referral.contact_email}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Responsibility form history</Label>
                {isRecordsUser && stampWorkflowActive ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Stamp each printed slip, then use <strong>Records stamp</strong> on that row.
                  </p>
                ) : null}
                <div className="mt-2">
                  <ResponsibilityFormHistoryTable
                    forms={forms}
                    loading={formsLoading}
                    referralFacilityLabel={referral.facility || ""}
                    onPrint={(form) => onPrintForm(referral, form)}
                    isRecordsUser={isRecordsUser}
                    allowStampAcknowledgement={stampWorkflowActive}
                    onAcknowledgeForm={onAcknowledgeForm}
                    acknowledgingFormId={acknowledgingFormId}
                    emptyHint={
                      !formsLoading && forms.length === 0
                        ? isRecordsUser
                          ? "No forms yet. The referring clinician issues responsibility forms from Consultation → Referrals & forms."
                          : undefined
                        : undefined
                    }
                  />
                </div>
              </div>
            </div>

            {isRecordsUser && isApprovedForFormsLike(referral.status) && (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  When the referral file is complete, close it. New forms from Consultation may return this referral for another stamp.
                </p>
                <Button size="sm" className="w-fit" onClick={() => void onCloseReferral()}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Close referral
                </Button>
              </div>
            )}
            {referral.notes && (
              <div>
                <Label className="text-sm font-medium">Internal / return notes</Label>
                <p className="text-sm p-3 bg-muted/50 rounded">{referral.notes}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
