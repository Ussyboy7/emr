import type { User } from "@/lib/npa-structure";

function hasCap(user: User | null | undefined, id: string): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  return (user.capabilities ?? []).includes(id);
}

/** Patient delete / merge admin actions. */
export function isSystemAdminUser(user?: User | null): boolean {
  return hasCap(user ?? null, "patient_delete") || hasCap(user ?? null, "patient_merge");
}

export function canDeletePatient(user?: User | null): boolean {
  return hasCap(user ?? null, "patient_delete");
}

export function canMergePatient(user?: User | null): boolean {
  return hasCap(user ?? null, "patient_merge");
}

export function canUnmergePatient(user?: User | null): boolean {
  return hasCap(user ?? null, "patient_unmerge");
}

/** Employee→Retiree, Staff→Officer, Retiree→CSR (capability or dept head/deputy). */
export function canManagePatientLifecycle(user?: User | null): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  if (
    hasCap(user, "patient_convert_csr") ||
    hasCap(user, "patient_promote_officer") ||
    hasCap(user, "patient_convert_retiree")
  ) {
    return true;
  }
  return Boolean(user.isDepartmentHead);
}

export function canEditAnnualCheckupProgramme(user?: User | null): boolean {
  return hasCap(user ?? null, "annual_checkup_programme_edit");
}
