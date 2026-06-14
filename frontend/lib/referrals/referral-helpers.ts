import type { Referral, ResponsibilityFormIssuance } from "@/lib/services/referral-service";
import { formatDisplayDate } from "@/lib/dates";

export interface ReferralWithPatient extends Referral {
  patient_name?: string;
  referred_by_name?: string;
}

export const REFERRAL_STATUS_OPTIONS = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-800" },
  { value: "submitted_to_records", label: "Submitted to Records", color: "bg-blue-100 text-blue-800" },
  { value: "records_review", label: "Records Review", color: "bg-amber-100 text-amber-800" },
  { value: "returned_for_correction", label: "Returned for Correction", color: "bg-rose-100 text-rose-800" },
  { value: "approved_for_forms", label: "Records acknowledged", color: "bg-emerald-100 text-emerald-800" },
  { value: "closed", label: "Closed", color: "bg-purple-100 text-purple-800" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800" },
] as const;

export const REFERRAL_URGENCY_OPTIONS = [
  { value: "routine", label: "Routine", color: "bg-blue-100 text-blue-800" },
  { value: "urgent", label: "Urgent", color: "bg-amber-100 text-amber-800" },
  { value: "emergency", label: "Emergency", color: "bg-red-100 text-red-800" },
] as const;

export const REFERRAL_FACILITY_TYPE_OPTIONS = [
  { value: "internal", label: "Internal", color: "bg-teal-100 text-teal-800" },
  { value: "external", label: "External", color: "bg-orange-100 text-orange-800" },
  { value: "specialist", label: "Specialist", color: "bg-purple-100 text-purple-800" },
] as const;

export const REFERRAL_STATUS_OPTIONS_NO_DRAFT = [
  { value: "submitted_to_records", label: "Submitted to Records", color: "bg-blue-100 text-blue-800" },
  { value: "records_review", label: "Records Review", color: "bg-amber-100 text-amber-800" },
  { value: "returned_for_correction", label: "Returned for Correction", color: "bg-rose-100 text-rose-800" },
  { value: "approved_for_forms", label: "Records acknowledged", color: "bg-emerald-100 text-emerald-800" },
  { value: "closed", label: "Closed", color: "bg-purple-100 text-purple-800" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800" },
] as const;

export function toLabel(value?: string) {
  return (value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short summary for list rows (forms issued / awaiting Medical Records stamp). */
export function referralFormsSummary(referral: {
  responsibility_forms_count?: number;
  unstamped_responsibility_forms_count?: number;
}): string {
  const count = referral.responsibility_forms_count ?? 0;
  if (count === 0) return "No forms yet";
  const unstamped = referral.unstamped_responsibility_forms_count ?? 0;
  if (unstamped > 0) {
    return `${count} form${count === 1 ? "" : "s"} · ${unstamped} awaiting stamp`;
  }
  return `${count} form${count === 1 ? "" : "s"} · all stamped`;
}

/** Human-readable referral status (uses curated labels; legacy `scheduled` maps to Records acknowledged). */
export function referralStatusLabel(status?: string) {
  const normalized = status === "scheduled" ? "approved_for_forms" : status;
  const opt = REFERRAL_STATUS_OPTIONS.find((o) => o.value === normalized);
  if (opt) return opt.label;
  return toLabel(status);
}

export function formatPrintDate(value?: string) {
  if (!value) return "";
  const formatted = formatDisplayDate(value);
  return formatted === "—" ? value : formatted;
}

export function getStatusBadgeClass(status: string) {
  const normalized =
    status === "scheduled"
      ? "approved_for_forms"
      : status === "sent"
        ? "submitted_to_records"
        : status === "accepted"
          ? "records_review"
          : status === "completed"
            ? "closed"
            : status;
  const option = REFERRAL_STATUS_OPTIONS.find((opt) => opt.value === normalized);
  return option ? option.color : "bg-gray-100 text-gray-800";
}

export function getUrgencyBadgeClass(urgency: string) {
  const option = REFERRAL_URGENCY_OPTIONS.find((opt) => opt.value === urgency);
  return option ? option.color : "bg-blue-100 text-blue-800";
}

export function getFacilityTypeBadgeClass(facilityType: string) {
  const option = REFERRAL_FACILITY_TYPE_OPTIONS.find((opt) => opt.value === facilityType);
  return option ? option.color : "bg-gray-100 text-gray-800";
}

/**
 * Open the referral letter PDF in a new tab. The backend renders an
 * NPA-letterhead PDF so the printed output matches lab / certificate documents.
 */
export async function printReferralLetter(referral: ReferralWithPatient): Promise<boolean> {
  if (!referral?.id) return false;
  let objectUrl: string | null = null;
  try {
    const { referralService } = await import("@/lib/services/referral-service");
    const blob = await referralService.fetchReferralLetterPdf(referral.id);
    objectUrl = URL.createObjectURL(blob);
    const win = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!win) return false;
    return true;
  } catch {
    return false;
  } finally {
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
  }
}

/**
 * Open the responsibility form PDF in a new tab. The backend renders an
 * NPA-letterhead PDF using the issuance's frozen snapshots, so the printed
 * output is a faithful, audit-stable copy of what was issued.
 *
 * The PDF is fetched as a Blob through `apiFetch` (which attaches the JWT)
 * and surfaced as a `blob:` URL — opening the raw API URL fails with 401
 * because browsers don't send Bearer tokens on a plain `window.open`.
 *
 * Resolves to `false` when the popup is blocked, the user isn't auth'd, or
 * the request fails. Object URLs are revoked after 60 s so memory stays
 * bounded; that's well past the time it takes a tab to render the PDF.
 */
export async function printResponsibilityForm(
  referral: ReferralWithPatient,
  form: ResponsibilityFormIssuance,
): Promise<boolean> {
  if (!form?.id) return false;
  let objectUrl: string | null = null;
  try {
    const { referralService } = await import("@/lib/services/referral-service");
    const blob = await referralService.fetchResponsibilityFormPdf(referral.id, form.id);
    objectUrl = URL.createObjectURL(blob);
    const win = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!win) return false;
    return true;
  } catch {
    return false;
  } finally {
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
  }
}
