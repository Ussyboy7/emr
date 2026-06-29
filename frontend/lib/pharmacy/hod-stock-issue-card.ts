import type { HodStockIssue } from "@/lib/services";
import { formatDisplayDate } from "@/lib/dates";
import { formatIssuedQuantityDisplay } from "@/lib/pharmacy/dispense-quantity";

type QuantityContext = {
  unit: string;
  pack_size?: number | null;
  dispense_mode?: string | null;
};

export function formatHodIssueQuantity(
  row: HodStockIssue,
): string {
  return formatIssuedQuantityDisplay(
    Number(row.quantity),
    {
      unit: row.unit,
      pack_size: row.medication_pack_size ?? row.medication_details?.pack_size,
      dispense_mode: row.medication_details?.dispense_mode,
    },
    row.quantity_entry_mode,
  );
}

/** Primary list-card meta: quantity · issuer · date */
export function buildHodIssueCardMeta(row: HodStockIssue): string {
  const parts: string[] = [formatHodIssueQuantity(row)];
  if (row.issued_by_name?.trim()) {
    parts.push(row.issued_by_name.trim());
  }
  if (row.issued_at) {
    parts.push(formatDisplayDate(row.issued_at));
  }
  return parts.join(" · ");
}

/** Recipient / context line below meta (patient, reason, or both). */
export function buildHodIssueRecipientLine(row: HodStockIssue): string | null {
  const reason = row.reason?.trim();
  const patient = row.patient_name?.trim();
  const mrn = row.patient_mrn?.trim();

  if (patient) {
    const patientLabel = mrn ? `${patient} (${mrn})` : patient;
    if (reason && !reason.toLowerCase().includes("patient")) {
      return `${patientLabel} · ${reason}`;
    }
    return patientLabel;
  }

  return reason || null;
}

export function getHodIssueReasonBadgeLabel(row: HodStockIssue): string | null {
  const reason = row.reason?.trim();
  if (reason) return reason;
  if (row.patient_name?.trim()) return "Patient";
  return null;
}
