import type { User } from "@/lib/npa-structure";
import { ALL_PAGE_PERMISSIONS, normalizeRolePagePath } from "@/lib/page-permissions";

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

export function userHasExactPageGrant(
  pathname: string,
  allowedPages: string[],
  deniedPages: string[] = [],
): boolean {
  if (!pathname || isPathDeniedByPages(pathname, deniedPages)) return false;
  const normalizedPath = normalizeRolePagePath(pathname);
  const normalizedAllowed = (Array.isArray(allowedPages) ? allowedPages : []).map(normalizeRolePagePath);
  return normalizedAllowed.includes(normalizedPath);
}

export function isPathDeniedByPages(pathname: string, deniedPages: string[]): boolean {
  if (!pathname || !deniedPages?.length) return false;
  const normalizedPath = normalizeRolePagePath(pathname);
  const normalizedDenied = deniedPages.map(normalizeRolePagePath);

  return normalizedDenied.some((denied) => {
    if (!denied) return false;
    if (normalizedPath === denied) return true;
    if (normalizedPath.startsWith(denied + "/")) return true;
    return false;
  });
}

export function isPathAllowedByPages(
  pathname: string,
  allowedPages: string[],
  deniedPages: string[] = [],
): boolean {
  if (!pathname || pathname === "/") return false;
  if (isPathDeniedByPages(pathname, deniedPages)) return false;

  const allowed = Array.isArray(allowedPages) ? allowedPages : [];
  const normalizedPath = normalizeRolePagePath(pathname);
  const normalizedAllowed = allowed.map(normalizeRolePagePath);

  // Exact match
  if (normalizedAllowed.includes(normalizedPath)) return true;

  // Prefix match: parent grant allows child routes; child grant allows module dashboard (mirrors backend page_paths.py)
  if (normalizedAllowed.some((p) => {
    if (!p || p === "/") return false;
    if (normalizedPath === p || normalizedPath.startsWith(p + "/")) return true;
    if (p.startsWith(normalizedPath + "/")) return true;
    return false;
  })) {
    return true;
  }

  // Special case: allow /medical-records/patients/* if user has /medical-records/patient-records
  if (
    normalizedPath.startsWith("/medical-records/patients/") &&
    normalizedAllowed.includes("/medical-records/patient-records")
  ) {
    return true;
  }

  // Consultation room workspace: /consultation/start implies access to /consultation/room/[id]
  if (
    (normalizedPath === "/consultation/room" || normalizedPath.startsWith("/consultation/room/")) &&
    normalizedAllowed.some(
      (p) =>
        p === "/consultation" ||
        p === "/consultation/start" ||
        p === "/consultation/room" ||
        p.startsWith("/consultation/room/"),
    )
  ) {
    return true;
  }

  return false;
}

export function getHomeRouteFromAllowedPages(allowedPages: string[]): string | null {
  const pages = Array.isArray(allowedPages) ? allowedPages : [];
  if (pages.length === 0) return null;

  const normalizedPages = pages.map(normalizeRolePagePath);
  const allowedSet = new Set(normalizedPages);

  // Prefer module dashboards (exact)
  for (const m of MODULE_ROUTE_PRIORITY) {
    if (allowedSet.has(m.dashboardPath)) return m.dashboardPath;
  }

  // If the user has no module dashboards but does have the global overview dashboard, use it.
  // This keeps routing permission-only (no fallback), and allows "overview-only" roles.
  if (allowedSet.has("/dashboard")) return "/dashboard";

  // Otherwise choose the shortest allowed page inside the highest-priority module.
  for (const m of MODULE_ROUTE_PRIORITY) {
    const candidates = normalizedPages
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

