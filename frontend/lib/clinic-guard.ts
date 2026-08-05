/**
 * Client-side clinic guard helpers.
 *
 * The backend scopes every clinic-owning queryset to the request's clinic, so
 * cross-clinic rows should never appear. These helpers are a defensive UI layer:
 * if a row attributed to another clinic ever slips through (e.g. stale cache or
 * an unscoped aggregation), it is visibly flagged instead of being silently
 * acted on.
 */

export interface ClinicOwned {
  /** Org-clinic FK id (location_clinic). */
  locationClinicId?: number | null;
  /** Legacy clinic FK id (Appointment.clinic). */
  clinicId?: number | null;
}

export function recordClinicId(record: ClinicOwned): number | null {
  const id = record.locationClinicId ?? record.clinicId ?? null;
  return typeof id === "number" ? id : null;
}

export function isClinicAllowed(record: ClinicOwned, activeClinicId: number | null): boolean {
  if (activeClinicId == null) return true;
  const id = recordClinicId(record);
  if (id == null) return true;
  return id === activeClinicId;
}

/**
 * Tailwind classes applied to a row when it belongs to a different clinic than
 * the active one (visible warning tint). Returns "" when the row is in-scope.
 */
export function clinicGuardRowClass(record: ClinicOwned, activeClinicId: number | null): string {
  if (isClinicAllowed(record, activeClinicId)) return "";
  return "bg-amber-500/10 ring-1 ring-amber-500/50";
}
