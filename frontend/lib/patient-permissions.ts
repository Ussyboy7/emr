import type { User } from "@/lib/npa-structure";

/** System Administrator / Admin Staff / superuser. */
export function isSystemAdminUser(user?: User | null): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  return (user.systemRole || "").toLowerCase().includes("admin");
}

/** Employee→Retiree, Staff→Officer, Retiree→CSR (dept head/deputy or system admin). */
export function canManagePatientLifecycle(user?: User | null): boolean {
  if (!user) return false;
  if (isSystemAdminUser(user)) return true;
  return Boolean(user.isDepartmentHead);
}
