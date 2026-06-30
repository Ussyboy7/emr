import type { User } from '@/lib/npa-structure';
import { isPathAllowedByPages } from '@/lib/home-route';

/** Whether the user may navigate to a UI route (for dashboard quick actions, etc.). */
export function canNavigateToPage(user: User | null | undefined, href: string): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  const path = href.split('?')[0] || href;
  return isPathAllowedByPages(path, user.permissions ?? [], user.deniedPages ?? []);
}
