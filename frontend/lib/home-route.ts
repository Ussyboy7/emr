import type { User } from "@/lib/npa-structure";

type ModuleRoute = {
  basePath: string;
  dashboardPath: string;
};

// Order matters: used to pick a default "home" when a user has multiple module accesses.
export const MODULE_ROUTE_PRIORITY: ModuleRoute[] = [
  { basePath: "/medical-records", dashboardPath: "/medical-records" },
  { basePath: "/nursing", dashboardPath: "/nursing" },
  { basePath: "/consultation", dashboardPath: "/consultation" },
  { basePath: "/laboratory", dashboardPath: "/laboratory" },
  { basePath: "/pharmacy", dashboardPath: "/pharmacy" },
  { basePath: "/radiology", dashboardPath: "/radiology" },
  { basePath: "/physiotherapy", dashboardPath: "/physiotherapy" },
  { basePath: "/analytics", dashboardPath: "/analytics" },
  { basePath: "/admin", dashboardPath: "/admin" },
];

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

