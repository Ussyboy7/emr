/**
 * Helpers for OPD visit-clinic filter UIs (data comes from the API, not this file).
 */

export const ALL_CLINICS_FILTER_LABEL = "All Clinics";

/** Dropdown values: "All Clinics" plus each active type name from the API. */
export function buildVisitClinicFilterOptions(names: readonly string[]): string[] {
  return [ALL_CLINICS_FILTER_LABEL, ...names];
}
