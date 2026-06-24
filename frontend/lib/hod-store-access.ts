import type { User } from "@/lib/npa-structure";
import { isPathAllowedByPages } from "@/lib/home-route";

const HOD_STORE_PAGES = [
  "/pharmacy/hod-store",
  "/pharmacy/hod-store/requests",
  "/pharmacy/hod-store/history",
] as const;

export function userHasHodStorePage(user?: User | null): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  const pages = Array.isArray(user.permissions) ? user.permissions : [];
  const deniedPages = user.deniedPages ?? [];
  return HOD_STORE_PAGES.some((page) => isPathAllowedByPages(page, pages, deniedPages));
}

/** Show HOD Store nav for Pharmacy primary head, superuser, or explicit page grant. */
export function canShowHodStoreNav(user?: User | null): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  if (user.isPharmacyHod) return true;
  return userHasHodStorePage(user);
}
