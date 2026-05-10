import type { User } from "@/lib/npa-structure";
import { ALL_PAGE_PERMISSIONS } from "@/lib/page-permissions";

type ModuleRoute = {
  basePath: string;
  dashboardPath: string;
};

// Modules that are not standalone landing pages (no dashboard for users to "go to").
// Filter them out so users with only these pages don't get auto-routed to e.g. /notifications.
const NON_LANDING_MODULES = new Set(["Overview", "User"]);

/**
 * Module priority list, derived once from `ALL_PAGE_PERMISSIONS`.
 *
 * Source of truth: the page catalog. Modules appear here in the same order
 * they appear in `ALL_PAGE_PERMISSIONS`, and each module's dashboard is the
 * shortest path in its group (e.g. `/eyecare` for "Eye Clinic"). That means
 * adding a new module to the catalog automatically:
 *   - shows up in the home-route resolver,
 *   - participates in middleware redirects,
 *   - is reachable from the Permissions tab,
 * with **zero** secondary code edits — the Eye Clinic miss that locked
 * j.jackson out is no longer possible.
 */
export const MODULE_ROUTE_PRIORITY: ModuleRoute[] = (() => {
  const seen = new Set<string>();
  const ordered: ModuleRoute[] = [];
  for (const page of ALL_PAGE_PERMISSIONS) {
    if (NON_LANDING_MODULES.has(page.module)) continue;
    if (seen.has(page.module)) continue;
    seen.add(page.module);

    const modulePages = ALL_PAGE_PERMISSIONS.filter(
      (p) => p.module === page.module,
    );
    // Module "dashboard" / base path = shortest catalog id in the group
    // (e.g. `/eyecare` beats `/eyecare/orders`).
    const dashboard = modulePages.reduce((shortest, candidate) =>
      candidate.id.length < shortest.id.length ? candidate : shortest,
    );
    ordered.push({ basePath: dashboard.id, dashboardPath: dashboard.id });
  }
  return ordered;
})();

export function isPathAllowedByPages(pathname: string, allowedPages: string[]): boolean {
  if (!pathname || pathname === "/") return false;
  const allowed = Array.isArray(allowedPages) ? allowedPages : [];

  // Exact match
  if (allowed.includes(pathname)) return true;

  // Prefix match for nested routes (e.g. /medical-records/patients/123 allowed by /medical-records/patients)
  if (allowed.some((p) => {
    if (!p || p === "/") return false;
    return pathname === p || pathname.startsWith(p + "/");
  })) {
    return true;
  }

  // Special case: allow /medical-records/patients/* if user has /medical-records/patient-records
  if (pathname.startsWith("/medical-records/patients/") && allowed.includes("/medical-records/patient-records")) {
    return true;
  }

  return false;
}

export function getHomeRouteFromAllowedPages(allowedPages: string[]): string | null {
  const pages = Array.isArray(allowedPages) ? allowedPages : [];
  if (pages.length === 0) return null;

  const allowedSet = new Set(pages);

  // Prefer module dashboards (exact)
  for (const m of MODULE_ROUTE_PRIORITY) {
    if (allowedSet.has(m.dashboardPath)) return m.dashboardPath;
  }

  // If the user has no module dashboards but does have the global overview dashboard, use it.
  // This keeps routing permission-only (no fallback), and allows "overview-only" roles.
  if (allowedSet.has("/dashboard")) return "/dashboard";

  // Otherwise choose the shortest allowed page inside the highest-priority module.
  for (const m of MODULE_ROUTE_PRIORITY) {
    const candidates = pages
      .filter((p) => p === m.basePath || p.startsWith(m.basePath + "/"))
      .sort((a, b) => a.length - b.length);
    if (candidates.length > 0) return candidates[0];
  }

  return null;
}

export function getHomeRouteForUser(user: User | null | undefined): string | null {
  if (!user) return null;
  if (user.isSuperuser) return "/dashboard";
  return getHomeRouteFromAllowedPages(user.permissions || []);
}

