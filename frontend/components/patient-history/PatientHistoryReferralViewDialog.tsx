"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDisplayDate } from "@/lib/dates";
import {
  referralService,
  type ResponsibilityFormIssuance,
} from "@/lib/services/referral-service";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  type ReferralWithPatient,
  getStatusBadgeClass,
  getUrgencyBadgeClass,
  getFacilityTypeBadgeClass,
  printReferralLetter,
  printResponsibilityForm,
  referralStatusLabel,
  toLabel,
} from "@/lib/referrals/referral-helpers";
import {
  ResponsibilityFormHistoryTable,
  ResponsibilityFormReissuePanel,
  hasOverlappingActiveResponsibilityForm,
  type ResponsibilityFormPayload,
} from "@/components/referrals/responsibility-form-blocks";

function formatDate(value?: string) {
  if (!value) return "—";
  const formatted = formatDisplayDate(value);
  return formatted === "—" ? value : formatted;
}

export function PatientHistoryReferralViewDialog({
  open,
  onOpenChange,
  referralId,
  refreshKey = 0,
  onReferralUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referralId: number | null;
  /** Increment to force reload (e.g. each View click). */
  refreshKey?: number;
  /** Bumps parent history lists (e.g. Referrals tab) after issue/submit. */
  onReferralUpdated?: () => void;
}) {
  const { currentUser } = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [referral, setReferral] = useState<ReferralWithPatient | null>(null);
  const [forms, setForms] = useState<ResponsibilityFormIssuance[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [issuingForm, setIssuingForm] = useState(false);
  const [formPayload, setFormPayload] = useState<ResponsibilityFormPayload>({
    valid_from: "",
    valid_to: "",
    notes: "",
  });
  const [formOverrideReason, setFormOverrideReason] = useState("");
  const [submittingToRecords, setSubmittingToRecords] = useState(false);

  const uid = currentUser?.id ? Number(currentUser.id) : NaN;
  const isMine = useCallback(
    (r: ReferralWithPatient) => {
      if (!Number.isFinite(uid)) return false;
      const rid = r.referred_by != null ? Number(r.referred_by) : NaN;
      const cid = r.created_by != null ? Number(r.created_by) : NaN;
      return uid === rid || uid === cid;
    },
    [uid],
  );

  const canIssueForm = useMemo(() => {
    if (!referral) return false;
    return isMine(referral) && referral.status !== "closed" && referral.status !== "cancelled";
  }, [referral, isMine]);

  const canSubmitToRecords = useMemo(() => {
    if (!referral) return false;
    return isMine(referral) && referral.status === "draft";
  }, [referral, isMine]);

  const blockingActiveForm = useMemo(
    () =>
      hasOverlappingActiveResponsibilityForm(forms, formPayload.valid_from, formPayload.valid_to),
    [forms, formPayload.valid_from, formPayload.valid_to],
  );

  const loadForms = useCallback(async (id: number) => {
    setFormsLoading(true);
    try {
      const rows = await referralService.getForms(id);
      setForms(rows || []);
    } catch {
      setForms([]);
    } finally {
      setFormsLoading(false);
    }
  }, []);

  const refreshReferral = useCallback(async (id: number) => {
    const row = await referralService.getReferral(id);
    setReferral(row as ReferralWithPatient);
    return row as ReferralWithPatient;
  }, []);

  const notifyReferralUpdated = useCallback(() => {
    onReferralUpdated?.();
  }, [onReferralUpdated]);

  useEffect(() => {
    if (!open || referralId == null) {
      setReferral(null);
      setForms([]);
      setFormPayload({ valid_from: "", valid_to: "", notes: "" });
      setFormOverrideReason("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    referralService
      .getReferral(referralId)
      .then(async (row) => {
        if (cancelled) return;
        setReferral(row as ReferralWithPatient);
        await loadForms(referralId);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load referral");
          setReferral(null);
          setForms([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, referralId, refreshKey, loadForms]);

  const handlePrintLetter = async () => {
    if (!referral) return;
    const ok = await printReferralLetter(referral);
    if (!ok) toast.error("Could not open the PDF — allow pop-ups or check sign-in.");
  };

  const handlePrintForm = async (form: ResponsibilityFormIssuance) => {
    if (!referral) return;
    const ok = await printResponsibilityForm(referral, form);
    if (!ok) toast.error("Could not open the PDF — allow pop-ups or check sign-in.");
  };

  const handleSubmitToRecords = async () => {
    if (!referral) return;
    if (forms.length === 0) {
      toast.error(
        "Issue at least one responsibility form before sending to Medical Records for acknowledgement.",
      );
      return;
    }
    setSubmittingToRecords(true);
    try {
      const updated = await referralService.submitToRecords(referral.id);
      setReferral({ ...referral, ...updated } as ReferralWithPatient);
      notifyReferralUpdated();
      toast.success("Sent to Medical Records for stamp / acknowledgement");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit to Medical Records");
    } finally {
      setSubmittingToRecords(false);
    }
  };

  const issueFormPayload = async (): Promise<boolean> => {
    if (!referral) return false;
    if (!formPayload.valid_from || !formPayload.valid_to) {
      toast.error("Set valid from and valid to dates");
      return false;
    }
    if (blockingActiveForm && !formOverrideReason.trim()) {
      toast.error("Enter an override reason — these dates overlap a current active form.");
      return false;
    }
    await referralService.issueForm(referral.id, {
      ...formPayload,
      ...(blockingActiveForm
        ? { override_active: true, override_reason: formOverrideReason.trim() }
        : {}),
    });
    await loadForms(referral.id);
    await refreshReferral(referral.id);
    setFormPayload({ valid_from: "", valid_to: "", notes: "" });
    setFormOverrideReason("");
    return true;
  };

  const handleIssueForm = async () => {
    try {
      setIssuingForm(true);
      const ok = await issueFormPayload();
      if (ok) {
        notifyReferralUpdated();
        toast.success("Responsibility form recorded");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to issue form");
    } finally {
      setIssuingForm(false);
    }
  };

  const handleIssueFormAndSend = async () => {
    if (!referral) return;
    try {
      setIssuingForm(true);
      const ok = await issueFormPayload();
      if (!ok) return;
      const updated = await referralService.submitToRecords(referral.id);
      setReferral({ ...referral, ...updated } as ReferralWithPatient);
      notifyReferralUpdated();
      toast.success("Form issued and sent to Medical Records");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to issue form and send to Records");
    } finally {
      setIssuingForm(false);
    }
  };

  const showCombinedIssueAndSend = canSubmitToRecords && forms.length === 0;

  const unstampedFormCount = forms.filter((f) => !f.records_acknowledged_at).length;
  const showStampPendingHint =
    referral != null &&
    unstampedFormCount > 0 &&
    (referral.status === "submitted_to_records" || referral.status === "records_review");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-teal-500" />
            Referral details
          </DialogTitle>
          <DialogDescription>
            {referral?.referral_id
              ? referral.status === "draft"
                ? `Referral ${referral.referral_id} — print the letter, then issue a responsibility form (and send to Medical Records in one step if ready).`
                : `Referral ${referral.referral_id} — print the letter or issue responsibility forms below.`
              : "Patient referral record"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : referral ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-wrap gap-2">
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
                <Button size="sm" variant="outline" onClick={() => void handlePrintLetter()}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print letter
                </Button>
                {forms.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => void handlePrintForm(forms[0])}>
                    <Printer className="h-4 w-4 mr-1" />
                    Print latest form
                  </Button>
                )}
                {canSubmitToRecords && forms.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => void handleSubmitToRecords()}
                    disabled={submittingToRecords}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    {submittingToRecords ? "Sending…" : "Send to Medical Records"}
                  </Button>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Referred</dt>
                <dd className="font-medium">{formatDate(referral.referred_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Referred by</dt>
                <dd className="font-medium">{referral.referred_by_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Facility</dt>
                <dd className="font-medium">{referral.facility || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Specialty</dt>
                <dd className="font-medium">{referral.specialty || "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Reason</dt>
                <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-medium">
                  {referral.reason || "—"}
                </dd>
              </div>
              {referral.clinical_summary ? (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Clinical summary</dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-medium">
                    {referral.clinical_summary}
                  </dd>
                </div>
              ) : null}
            </dl>

            {showStampPendingHint ? (
              <p className="text-xs text-muted-foreground rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                Medical Records must stamp {unstampedFormCount} form
                {unstampedFormCount === 1 ? "" : "s"} before status becomes{" "}
                <span className="font-medium">Records acknowledged</span>. Status updates here after
                stamping (refresh if viewing from another screen).
              </p>
            ) : null}

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Responsibility form history</Label>
                <div className="mt-2">
                  <ResponsibilityFormHistoryTable
                    forms={forms}
                    loading={formsLoading}
                    referralFacilityLabel={referral.facility || ""}
                    onPrint={(form) => void handlePrintForm(form)}
                    showStampStatus={forms.length > 0}
                    emptyHint={
                      !formsLoading && forms.length === 0 && canIssueForm
                        ? "Add validity dates below to issue the first form."
                        : undefined
                    }
                  />
                </div>
              </div>

              {canIssueForm ? (
                <ResponsibilityFormReissuePanel
                  title={forms.length > 0 ? "Issue another responsibility form" : "Issue responsibility form"}
                  description={
                    showCombinedIssueAndSend
                      ? "Use the primary button to issue and send to Medical Records in one step, or issue only if you still need to print or review first."
                      : "Set validity dates for this issuance. You can print the generated PDF from the history table."
                  }
                  formPayload={formPayload}
                  onFormPayloadChange={setFormPayload}
                  onSubmit={() =>
                    void (showCombinedIssueAndSend ? handleIssueFormAndSend() : handleIssueForm())
                  }
                  issuing={issuingForm}
                  submitLabel={
                    showCombinedIssueAndSend ? "Issue form & send to Records" : "Issue form"
                  }
                  submittingLabel={showCombinedIssueAndSend ? "Sending…" : "Saving…"}
                  secondarySubmitLabel={showCombinedIssueAndSend ? "Issue form only" : undefined}
                  onSecondarySubmit={showCombinedIssueAndSend ? () => void handleIssueForm() : undefined}
                  blockingActiveForm={blockingActiveForm}
                  overrideReason={formOverrideReason}
                  onOverrideReasonChange={setFormOverrideReason}
                />
              ) : referral.status !== "closed" && referral.status !== "cancelled" ? (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-3">
                  Only the referring clinician can issue responsibility forms for this referral.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">Referral not available.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
