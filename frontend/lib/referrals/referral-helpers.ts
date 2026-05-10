import { referralService, type Referral, type ResponsibilityFormIssuance } from "@/lib/services/referral-service";

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

export const REFERRAL_STATUS_OPTIONS_NO_DRAFT = REFERRAL_STATUS_OPTIONS.filter((o) => o.value !== "draft");

export function toLabel(value?: string) {
  return (value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human-readable referral status (uses curated labels; legacy `scheduled` maps to Records acknowledged). */
export function referralStatusLabel(status?: string) {
  const normalized = status === "scheduled" ? "approved_for_forms" : status;
  const opt = REFERRAL_STATUS_OPTIONS.find((o) => o.value === normalized);
  if (opt) return opt.label;
  return toLabel(status);
}

export function escapeHtml(value?: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const PRINT_LINE_BLANK = "________________";

/** P.N. / DEPT from API only (stored patient fields); empty → underscore line for handwriting. */
export function formatPatientPnDeptForPrint(referral: ReferralWithPatient): { pn: string; dept: string } {
  const pnRaw = (referral.patient_print_pn ?? "").trim();
  const deptRaw = (referral.patient_print_dept ?? "").trim();
  return {
    pn: pnRaw ? escapeHtml(pnRaw) : PRINT_LINE_BLANK,
    dept: deptRaw ? escapeHtml(deptRaw) : PRINT_LINE_BLANK,
  };
}

export function formatPrintDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export function getStatusBadgeClass(status: string) {
  const option = REFERRAL_STATUS_OPTIONS.find((opt) => opt.value === status);
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

export function buildReferralLetterHtml(referral: ReferralWithPatient) {
  const patientName = escapeHtml(referral.patient_name || "____________________________");
  const { pn, dept } = formatPatientPnDeptForPrint(referral);
  const facility = escapeHtml(referral.facility || "____________________________");
  const specialty = escapeHtml(referral.specialty || "____________________________");
  const reason = escapeHtml(referral.reason || "");
  const summary = escapeHtml(referral.clinical_summary || "");
  const referredBy = escapeHtml(referral.referred_by_name || "____________________________");
  const dateStr = escapeHtml(formatPrintDate(referral.referred_at));
  const referralId = escapeHtml(referral.referral_id || "");
  const urgency = escapeHtml(toLabel(referral.urgency || "routine"));

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Referral Letter - ${referralId}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 14px; line-height: 1.4; }
    h1, h2, h3, p { margin: 0; }
    .top { text-align: center; margin-bottom: 16px; }
    .small { font-size: 12px; color: #333; }
    .section { margin-top: 14px; }
    .label { font-weight: 700; }
    .box { border: 1px solid #ccc; padding: 10px; border-radius: 4px; white-space: pre-wrap; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; }
    .sig-line { border-top: 1px solid #222; margin-top: 36px; padding-top: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="top">
    <h2>NIGERIAN PORTS AUTHORITY</h2>
    <h3>MEDICAL DEPARTMENT</h3>
    <p><strong>REFERRAL LETTER</strong></p>
  </div>

  <div class="section">
    <p><span class="label">Date:</span> ${dateStr}</p>
    <p><span class="label">Referral ID:</span> ${referralId}</p>
    <p><span class="label">Urgency:</span> ${urgency}</p>
  </div>

  <div class="section">
    <p>To: The Medical Director</p>
    <p>${facility}</p>
  </div>

  <div class="section">
    <p>Please kindly evaluate and manage the patient below:</p>
    <p><span class="label">Patient Name:</span> ${patientName} (P.N. <span class="line">${pn}</span>) DEPT. <span class="line">${dept}</span></p>
    <p><span class="label">Referred Specialty/Unit:</span> ${specialty}</p>
  </div>

  <div class="section">
    <p class="label">Reason for Referral</p>
    <div class="box">${reason || "N/A"}</div>
  </div>

  <div class="section">
    <p class="label">Clinical Summary</p>
    <div class="box">${summary || "N/A"}</div>
  </div>

  <div class="sig-grid">
    <div>
      <div class="sig-line">Referring Doctor: ${referredBy}</div>
    </div>
    <div>
      <div class="sig-line">Medical Records Officer</div>
    </div>
  </div>
</body>
</html>`;
}

/** Returns false if pop-up was blocked. */
export function openPrintWindow(title: string, html: string): boolean {
  const popup = window.open("", "_blank", "width=900,height=1000");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.document.title = title;
  popup.focus();
  popup.print();
  return true;
}

export function printReferralLetter(referral: ReferralWithPatient) {
  return openPrintWindow(`Referral Letter - ${referral.referral_id}`, buildReferralLetterHtml(referral));
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
