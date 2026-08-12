import type { User } from "@/lib/npa-structure";
import { isPathAllowedByPages, userHasExactPageGrant } from "@/lib/home-route";

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
  return HOD_STORE_PAGES.some((page) => userHasExactPageGrant(page, pages, deniedPages));
}

/** Show HOD Store nav only for explicit HOD page grants or pharmacy head (not parent /pharmacy alone). */
export function canShowHodStoreNav(user?: User | null): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;

  const pages = Array.isArray(user.permissions) ? user.permissions : [];
  const deniedPages = user.deniedPages ?? [];

  const hodPageVisible = (page: string) => {
    if (userHasExactPageGrant(page, pages, deniedPages)) return true;
    if (user.isPharmacyHod && isPathAllowedByPages(page, pages, deniedPages)) return true;
    return false;
  };

  return HOD_STORE_PAGES.some(hodPageVisible);
}
