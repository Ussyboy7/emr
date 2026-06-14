"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer } from "lucide-react";
import type { ResponsibilityFormIssuance } from "@/lib/services/referral-service";
import { todayApiDateString } from "@/lib/dates";
import { formatPrintDate, toLabel } from "@/lib/referrals/referral-helpers";

export type ResponsibilityFormPayload = { valid_from: string; valid_to: string; notes: string };

const ymdSlice = (s: string) => (s && s.length >= 10 ? s.slice(0, 10) : "");

/**
 * True when proposed validity overlaps any still-current active form (inclusive ranges).
 * Empty or invalid proposed dates → false (no override UI until dates are chosen).
 * Non-overlapping renewals (e.g. April after March) → false.
 */
export function hasOverlappingActiveResponsibilityForm(
  forms: { status: string; valid_from: string; valid_to: string }[],
  proposedValidFrom: string,
  proposedValidTo: string
): boolean {
  const nf = ymdSlice(proposedValidFrom.trim());
  const nt = ymdSlice(proposedValidTo.trim());
  if (!nf || !nt || nf > nt) return false;
  const today = todayApiDateString();
  return forms.some((f) => {
    if (f.status !== "active") return false;
    const ef = ymdSlice(f.valid_from);
    const et = ymdSlice(f.valid_to);
    if (!ef || !et || et < today) return false;
    return !(nt < ef || nf > et);
  });
}

/** Active in DB but valid_to is in the past — show as Expired (matches eventual API status after expiry job). */
function effectiveResponsibilityFormStatus(form: { status: string; valid_to: string }): string {
  const et = ymdSlice(form.valid_to);
  if (form.status === "active" && et && et < todayApiDateString()) {
    return "expired";
  }
  return form.status;
}

function formStatusClass(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "expired":
      return "bg-muted text-muted-foreground";
    case "revoked":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
    case "used":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Read-only history: SN, date issued, facility (snapshot), validity, status, print. */
export function ResponsibilityFormHistoryTable(props: {
  forms: ResponsibilityFormIssuance[];
  loading: boolean;
  referralFacilityLabel: string;
  onPrint: (form: ResponsibilityFormIssuance) => void;
  /** If set, shown as the only empty-state line; otherwise a short default. */
  emptyHint?: string;
  /** Medical Records: show stamp column with acknowledge actions */
  isRecordsUser?: boolean;
  /** Clinician / read-only: show whether Medical Records has stamped each row */
  showStampStatus?: boolean;
  /** When true (consultation has submitted to records), show Acknowledge stamp buttons for pending rows */
  allowStampAcknowledgement?: boolean;
  onAcknowledgeForm?: (form: ResponsibilityFormIssuance) => void;
  acknowledgingFormId?: number | null;
}) {
  const {
    forms,
    loading,
    referralFacilityLabel,
    onPrint,
    emptyHint,
    isRecordsUser,
    showStampStatus,
    allowStampAcknowledgement,
    onAcknowledgeForm,
    acknowledgingFormId,
  } = props;

  const showStampColumn = isRecordsUser || showStampStatus;

  return (
    <div className="rounded-md border bg-background">
      {loading ? (
        <p className="text-sm text-muted-foreground p-4">Loading history…</p>
      ) : forms.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4">
          {emptyHint ?? "No forms issued yet for this referral."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14" title="1st issuance, 2nd issuance, … for this referral (top = earliest)">
                Seq.
              </TableHead>
              <TableHead className="min-w-[7rem]">Date issued</TableHead>
              <TableHead className="min-w-[10rem]">Facility</TableHead>
              <TableHead className="min-w-[9rem] hidden sm:table-cell">Valid period</TableHead>
              <TableHead className="w-24 hidden md:table-cell">Status</TableHead>
              {showStampColumn ? <TableHead className="min-w-[9rem]">Records stamp</TableHead> : null}
              <TableHead className="w-[5.5rem] text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...forms]
              .sort((a, b) => a.sequence_number - b.sequence_number)
              .map((form) => {
              const facility = (form.hospital_name_snapshot || "").trim() || referralFacilityLabel || "";
              const effStatus = effectiveResponsibilityFormStatus(form);
              const statusLabel = toLabel(effStatus);
              const stamped = Boolean(form.records_acknowledged_at);
              return (
                <TableRow key={form.id}>
                  <TableCell className="py-2.5 px-3 font-medium tabular-nums">{form.sequence_number}</TableCell>
                  <TableCell className="py-2.5 px-3 whitespace-nowrap">{formatPrintDate(form.issue_date)}</TableCell>
                  <TableCell className="py-2.5 px-3 max-w-[220px] truncate" title={facility}>
                    {facility}
                  </TableCell>
                  <TableCell className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap hidden sm:table-cell">
                    {form.valid_from} → {form.valid_to}
                  </TableCell>
                  <TableCell className="py-2.5 px-3 hidden md:table-cell">
                    <Badge variant="outline" className={`text-[10px] font-normal ${formStatusClass(effStatus)}`}>
                      {statusLabel}
                    </Badge>
                  </TableCell>
                  {showStampColumn ? (
                    <TableCell className="py-2.5 px-3 align-top">
                      {stamped ? (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <Badge variant="outline" className="text-[10px] font-normal bg-emerald-50 text-emerald-800 border-emerald-200">
                            Stamped
                          </Badge>
                          <div className="tabular-nums">{formatPrintDate(form.records_acknowledged_at!)}</div>
                          {form.records_acknowledged_by_name ? (
                            <div className="truncate max-w-[10rem]" title={form.records_acknowledged_by_name}>
                              {form.records_acknowledged_by_name}
                            </div>
                          ) : null}
                        </div>
                      ) : allowStampAcknowledgement && onAcknowledgeForm ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 text-xs"
                          disabled={acknowledgingFormId === form.id}
                          onClick={() => onAcknowledgeForm(form)}
                        >
                          {acknowledgingFormId === form.id ? "Saving…" : "Acknowledge stamp"}
                        </Button>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                        >
                          Awaiting stamp
                        </Badge>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className="py-2.5 px-3 text-right">
                    <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onPrint(form)}>
                      <Printer className="h-3.5 w-3.5 mr-1" />
                      Print
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** Issue / reissue form — separated below history. */
export function ResponsibilityFormReissuePanel(props: {
  title: string;
  description?: string;
  formPayload: ResponsibilityFormPayload;
  onFormPayloadChange: (next: ResponsibilityFormPayload) => void;
  onSubmit: () => void;
  issuing: boolean;
  submitLabel: string;
  submittingLabel: string;
  /** Optional secondary action (e.g. issue without sending to Medical Records). */
  secondarySubmitLabel?: string;
  onSecondarySubmit?: () => void;
  /** When true, another active form exists; backend requires override + reason. */
  blockingActiveForm?: boolean;
  overrideReason?: string;
  onOverrideReasonChange?: (value: string) => void;
}) {
  const {
    title,
    description,
    formPayload,
    onFormPayloadChange,
    onSubmit,
    issuing,
    submitLabel,
    submittingLabel,
    secondarySubmitLabel,
    onSecondarySubmit,
    blockingActiveForm,
    overrideReason = "",
    onOverrideReasonChange,
  } = props;

  const submitDisabled = issuing || (blockingActiveForm && !overrideReason.trim());

  return (
    <div className="rounded-lg border border-dashed border-primary/25 bg-muted/30 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="text-xs text-muted-foreground mt-1">{description}</p> : null}
      </div>
      {blockingActiveForm ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 space-y-2">
          <p className="text-xs text-amber-900 dark:text-amber-100 font-medium">
            The valid dates you entered overlap an active form that is still current. Choose dates that do not overlap, or enter a reason to
            override (e.g. wrong dates on prior form, re-stamp same month).
          </p>
          <div>
            <Label className="text-xs">Override reason (required)</Label>
            <Textarea
              className="mt-1 min-h-[4rem] text-sm"
              value={overrideReason}
              onChange={(e) => onOverrideReasonChange?.(e.target.value)}
              placeholder="Why issue another form despite overlapping dates?"
            />
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Valid from</Label>
          <Input
            type="date"
            className="mt-1"
            value={formPayload.valid_from}
            onChange={(e) => onFormPayloadChange({ ...formPayload, valid_from: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Valid to</Label>
          <Input
            type="date"
            className="mt-1"
            value={formPayload.valid_to}
            onChange={(e) => onFormPayloadChange({ ...formPayload, valid_to: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Notes</Label>
          <Input
            className="mt-1"
            value={formPayload.notes}
            onChange={(e) => onFormPayloadChange({ ...formPayload, notes: e.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void onSubmit()} disabled={submitDisabled}>
          {issuing ? submittingLabel : submitLabel}
        </Button>
        {secondarySubmitLabel && onSecondarySubmit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onSecondarySubmit()}
            disabled={submitDisabled}
          >
            {issuing ? submittingLabel : secondarySubmitLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
