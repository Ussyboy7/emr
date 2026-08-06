import type { User } from "@/lib/npa-structure";
import { isPathAllowedByPages, userHasExactPageGrant } from "@/lib/home-route";

/** Clinic.code for the site that hosts the pharmacy central store. */
export const CENTRAL_STORE_CLINIC_CODE = "BODE-THOMAS";

export function userHasCentralStorePage(user?: User | null): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  const pages = Array.isArray(user.permissions) ? user.permissions : [];
  const deniedPages = user.deniedPages ?? [];
  if (userHasExactPageGrant("/pharmacy/store", pages, deniedPages)) return true;
  if (user.isPharmacyHod && isPathAllowedByPages("/pharmacy/store", pages, deniedPages)) {
    return true;
  }
  return false;
}

function userAssignedToCentralStoreClinic(
  user: User,
  clinics: Array<{ id: number; code?: string }>,
): boolean | null {
  const assigned = new Set(user.location_clinics || []);
  if (assigned.size === 0) return false;
  const central = clinics.find(
    (c) => (c.code || "").toUpperCase() === CENTRAL_STORE_CLINIC_CODE,
  );
  if (!central) return null;
  return assigned.has(central.id);
}

/**
 * Show Central Store nav when the role allows it and the user is assigned to Bode Thomas.
 * While the clinic list is still loading, keep the link visible for eligible users to avoid flicker.
 */
export function canShowCentralStoreNav(
  user: User | null | undefined,
  clinics: Array<{ id: number; code?: string }>,
  options?: { clinicsLoading?: boolean },
): boolean {
  if (!user || !userHasCentralStorePage(user)) return false;
  if (user.isSuperuser) return true;

  const assignment = userAssignedToCentralStoreClinic(user, clinics);
  if (assignment === true) return true;
  if (assignment === false) return false;

  return Boolean(options?.clinicsLoading && (user.location_clinics?.length ?? 0) > 0);
}
