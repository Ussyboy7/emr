import type { User } from '@/lib/npa-structure';
import { isPathAllowedByPages } from '@/lib/home-route';

export const WARD_ROUNDS_PAGE = '/consultation/wards';
export const WARD_CARE_PAGE = '/nursing/wards';

function userPages(user?: User | null): string[] {
  return user?.permissions ?? [];
}

function userDenied(user?: User | null): string[] {
  return user?.deniedPages ?? [];
}

function hasCapability(user: User | null | undefined, capabilityId: string): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  return (user.capabilities ?? []).includes(capabilityId);
}

function hasPage(user: User | null | undefined, page: string): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  return isPathAllowedByPages(page, userPages(user), userDenied(user));
}

/** Add doctor orders on an inpatient chart (Ward Rounds). */
export function userCanAddWardDoctorOrders(user?: User | null): boolean {
  return (
    hasCapability(user, 'ward_order_create') || hasPage(user, WARD_ROUNDS_PAGE)
  );
}

/** Edit/cancel pending doctor orders (Ward Rounds — not Ward Care task execution). */
export function userCanEditCancelWardOrders(user?: User | null): boolean {
  return (
    hasCapability(user, 'ward_order_edit') || hasPage(user, WARD_ROUNDS_PAGE)
  );
}

/** Administer injections/dressings and complete ward instructions (Ward Care). */
export function userCanPerformWardOrders(user?: User | null): boolean {
  return (
    hasCapability(user, 'ward_order_perform') || hasPage(user, WARD_CARE_PAGE)
  );
}
