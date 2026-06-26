import type { User } from "@/lib/npa-structure";
import { isPathAllowedByPages } from "@/lib/home-route";

/** Who may open User Management (nav + page); API enforces department scope. */
export function canManageUsersNav(user?: User | null): boolean {
  if (!user) return false;
  return Boolean(
    user.isSuperuser || user.isStaff || user.isDepartmentHead || user.isPharmacyHod,
  );
}

export function userHasUserManagementPage(
  user?: User | null,
  allowedPages?: string[],
  deniedPages: string[] = [],
): boolean {
  const pages = allowedPages ?? user?.permissions ?? [];
  const denied = deniedPages ?? user?.deniedPages ?? [];
  return (
    isPathAllowedByPages("/admin/users", pages, denied) ||
    isPathAllowedByPages("/admin", pages, denied)
  );
}

/** Department-scoped user management UI (not full ICT admin). */
export function isScopedDepartmentUserManager(user?: User | null): boolean {
  if (!user) return false;
  if (user.isSuperuser || user.isStaff) return false;
  return Boolean(user.isDepartmentHead || user.isPharmacyHod);
}
