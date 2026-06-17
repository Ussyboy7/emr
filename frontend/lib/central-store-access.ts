import type { User } from "@/lib/npa-structure";
import { isPathAllowedByPages } from "@/lib/home-route";

/** Clinic.code for the site that hosts the pharmacy central store. */
export const CENTRAL_STORE_CLINIC_CODE = "BODE-THOMAS";

export function userHasCentralStorePage(user?: User | null): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  const pages = Array.isArray(user.permissions) ? user.permissions : [];
  return isPathAllowedByPages("/pharmacy/store", pages);
}

/**
 * Show Central Store nav when the role allows it and the user is assigned to Bode Thomas
 * (not only when that clinic happens to be the active clinic).
 */
export function canShowCentralStoreNav(
  user: User | null | undefined,
  clinics: Array<{ id: number; code?: string }>,
): boolean {
  if (!user || !userHasCentralStorePage(user)) return false;
  if (user.isSuperuser) return true;
  const central = clinics.find(
    (c) => (c.code || "").toUpperCase() === CENTRAL_STORE_CLINIC_CODE,
  );
  if (!central) return false;
  const assigned = new Set(user.clinics_ids || []);
  return assigned.has(central.id);
}
