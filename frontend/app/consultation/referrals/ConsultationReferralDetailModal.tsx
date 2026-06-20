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
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { Send, User, Phone, Mail, Printer, Pencil } from "lucide-react";
import type { ResponsibilityFormIssuance } from "@/lib/services/referral-service";
import {
  type ReferralWithPatient,
  toLabel,
  referralStatusLabel,
  getStatusBadgeClass,
  getUrgencyBadgeClass,
  getFacilityTypeBadgeClass,
} from "@/lib/referrals/referral-helpers";
import {
  ResponsibilityFormHistoryTable,
  ResponsibilityFormReissuePanel,
} from "@/components/referrals/responsibility-form-blocks";

type FormPayload = { valid_from: string; valid_to: string; notes: string };

function consultationHeaderDescription(status: ReferralWithPatient["status"]): string {
  switch (status) {
    case "draft":
    case "returned_for_correction":
      return "Edit while draft, print the letter, then issue a responsibility form — use “Issue form & send to Records” when ready for Medical Records.";
    case "submitted_to_records":
    case "records_review":
      return "With Medical Records for review. You can still print the letter and issue responsibility forms; workflow updates may also happen in the records queue.";
    case "approved_for_forms":
    case "scheduled":
      return "Records has acknowledged current issuances. Print the referral letter and issue or reissue responsibility forms below; a new issuance reopens the records queue until stamped again. Files may auto-close after month-end.";
    case "closed":
    case "cancelled":
      return "This referral is closed or cancelled. Printing is still available for the record.";
    default:
      return "Print the referral letter and issue responsibility forms from this page.";
  }
}

/** Detail modal on Consultation → Referrals & forms (clinician workflow only; no Medical Records approval actions). */
export function ConsultationReferralDetailModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referral: ReferralWithPatient | null;
  forms: ResponsibilityFormIssuance[];
  formsLoading: boolean;
  formPayload: FormPayload;
  onFormPayloadChange: (next: FormPayload) => void;
  issuingForm: boolean;
  canEditClinician: (r: ReferralWithPatient) => boolean;
  canSubmitToRecords: (r: ReferralWithPatient) => boolean;
  canClinicianIssueForm: (r: ReferralWithPatient) => boolean;
  submittingToRecords: boolean;
  onPrintLetter: (r: ReferralWithPatient) => void;
  onPrintForm: (r: ReferralWithPatient, form?: ResponsibilityFormIssuance) => void;
  onIssueForm: () => void;
  onIssueFormAndSend: () => void;
  onEdit: (r: ReferralWithPatient) => void;
  onSubmitToRecords: () => void;
  blockingActiveResponsibilityForm: boolean;
  formOverrideReason: string;
  onFormOverrideReasonChange: (value: string) => void;
}) {
  const {
    open,
    onOpenChange,
    referral,
    forms,
    formsLoading,
    formPayload,
    onFormPayloadChange,
    issuingForm,
    canEditClinician,
    canSubmitToRecords,
    canClinicianIssueForm,
    submittingToRecords,
    onPrintLetter,
    onPrintForm,
    onIssueForm,
    onIssueFormAndSend,
    onEdit,
    onSubmitToRecords,
    blockingActiveResponsibilityForm,
    formOverrideReason,
    onFormOverrideReasonChange,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.xl}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-emerald-500" />
            Consultation — {referral?.referral_id}
          </DialogTitle>
          <DialogDescription>{referral ? consultationHeaderDescription(referral.status) : ""}</DialogDescription>
        </DialogHeader>
        {referral && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
              <div className="flex flex-wrap gap-2">
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
                {canEditClinician(referral) && (
                  <Button size="sm" variant="secondary" onClick={() => onEdit(referral)}>
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
                {canSubmitToRecords(referral) && forms.length > 0 && (
                  <Button size="sm" onClick={() => void onSubmitToRecords()} disabled={submittingToRecords}>
                    <Send className="h-4 w-4 mr-1" />
                    {submittingToRecords ? "Sending…" : "Send to Medical Records"}
                  </Button>
                )}
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
            {referral.notes && (
              <div>
                <Label className="text-sm font-medium">Notes</Label>
                <p className="text-sm p-3 bg-muted/50 rounded">{referral.notes}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Responsibility form history</Label>
                <div className="mt-2">
                  <ResponsibilityFormHistoryTable
                    forms={forms}
                    loading={formsLoading}
                    referralFacilityLabel={referral.facility || ""}
                    onPrint={(form) => onPrintForm(referral, form)}
                    emptyHint={
                      !formsLoading && forms.length === 0 && canClinicianIssueForm(referral)
                        ? "Add validity dates below to issue the first form."
                        : undefined
                    }
                  />
                </div>
              </div>
              {canClinicianIssueForm(referral) && (() => {
                const showCombinedIssueAndSend =
                  canSubmitToRecords(referral) && forms.length === 0;
                return (
                  <ResponsibilityFormReissuePanel
                    title={forms.length > 0 ? "Issue another responsibility form" : "Issue responsibility form"}
                    description={
                      showCombinedIssueAndSend
                        ? "Use the primary button to issue and send to Medical Records in one step, or issue only if you still need to print or review first."
                        : "Set validity dates for this issuance. Reissues add another row in the history above."
                    }
                    formPayload={formPayload}
                    onFormPayloadChange={onFormPayloadChange}
                    onSubmit={showCombinedIssueAndSend ? onIssueFormAndSend : onIssueForm}
                    issuing={issuingForm}
                    submitLabel={
                      showCombinedIssueAndSend ? "Issue form & send to Records" : "Issue form"
                    }
                    submittingLabel={showCombinedIssueAndSend ? "Sending…" : "Saving…"}
                    secondarySubmitLabel={showCombinedIssueAndSend ? "Issue form only" : undefined}
                    onSecondarySubmit={showCombinedIssueAndSend ? onIssueForm : undefined}
                    blockingActiveForm={blockingActiveResponsibilityForm}
                    overrideReason={formOverrideReason}
                    onOverrideReasonChange={onFormOverrideReasonChange}
                  />
                );
              })()}
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
