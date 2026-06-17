import { describe, expect, it } from 'vitest';
import { isPathAllowedByPages, getHomeRouteFromAllowedPages, getHomeRouteForUser } from './home-route';
import { ALL_PAGE_PERMISSIONS } from './page-permissions';

/** Sidebar hrefs — keep in sync with AppSidebar menuSections */
const SIDEBAR_NAV_HREFS = [
  "/medical-records", "/medical-records/patients/new", "/medical-records/patients",
  "/medical-records/patient-records", "/medical-records/visits/new", "/medical-records/visits",
  "/medical-records/appointments", "/medical-records/referrals", "/medical-records/coding",
  "/medical-records/reports",
  "/nursing", "/nursing/pool-queue", "/nursing/room-queue", "/nursing/vitals-history",
  "/nursing/procedures", "/nursing/procedures/history", "/nursing/wards", "/nursing/analytics",
  "/nursing/inventory", "/nursing/requests",
  "/consultation", "/consultation/start", "/consultation/history", "/consultation/wards",
  "/consultation/referrals", "/consultation/analytics",
  "/laboratory", "/laboratory/orders", "/laboratory/verification", "/laboratory/completed",
  "/laboratory/templates", "/laboratory/analytics",
  "/pharmacy", "/pharmacy/prescriptions", "/pharmacy/history", "/pharmacy/inventory",
  "/pharmacy/requests", "/pharmacy/generics", "/pharmacy/drugs", "/pharmacy/store",
  "/pharmacy/store/requests", "/pharmacy/analytics",
  "/radiology", "/radiology/orders", "/radiology/verification", "/radiology/completed",
  "/radiology/templates", "/radiology/viewer", "/radiology/analytics",
  "/physiotherapy", "/physiotherapy/orders", "/physiotherapy/completed", "/physiotherapy/analytics",
  "/eyecare", "/eyecare/orders", "/eyecare/completed", "/eyecare/analytics",
  "/hr", "/hr/annual-checkups", "/hr/exemptions",
  "/analytics", "/analytics/executive",
  "/admin", "/admin/users", "/admin/roles", "/admin/clinics", "/admin/rooms", "/admin/settings",
  "/admin/health", "/admin/annual-checkup-programme", "/admin/audit",
] as const;

describe('isPathAllowedByPages', () => {
  it('returns false for empty pathname', () => {
    expect(isPathAllowedByPages('', ['/dashboard'])).toBe(false);
    expect(isPathAllowedByPages('/', ['/dashboard'])).toBe(false);
  });

  it('allows exact match', () => {
    expect(isPathAllowedByPages('/nursing', ['/nursing'])).toBe(true);
  });

  it('allows nested routes via prefix', () => {
    expect(isPathAllowedByPages('/nursing/pool-queue', ['/nursing'])).toBe(true);
    expect(isPathAllowedByPages('/nursing/pool-queue/123', ['/nursing/pool-queue'])).toBe(true);
  });

  it('allows module dashboard when a child page is granted', () => {
    expect(isPathAllowedByPages('/medical-records', ['/medical-records/patients'])).toBe(true);
    expect(isPathAllowedByPages('/nursing', ['/nursing/inventory'])).toBe(true);
    expect(isPathAllowedByPages('/consultation', ['/consultation/start'])).toBe(true);
    expect(isPathAllowedByPages('/admin', ['/admin/clinics'])).toBe(true);
  });

  it('rejects unrelated paths', () => {
    expect(isPathAllowedByPages('/radiology', ['/nursing', '/pharmacy'])).toBe(false);
  });

  it('handles non-array allowedPages', () => {
    expect(isPathAllowedByPages('/dashboard', null as any)).toBe(false);
  });

  it('handles special patient-records → patients mapping', () => {
    expect(isPathAllowedByPages('/medical-records/patients/123', ['/medical-records/patient-records'])).toBe(true);
  });

  it('allows manage patients when parent medical-records is granted', () => {
    expect(isPathAllowedByPages('/medical-records/patients', ['/medical-records'])).toBe(true);
  });

  it('allows consultation room when start consultation is granted', () => {
    expect(isPathAllowedByPages('/consultation/room/12', ['/consultation/start'])).toBe(true);
    expect(isPathAllowedByPages('/consultation/room/12', ['/consultation'])).toBe(true);
    expect(isPathAllowedByPages('/consultation/room/12', ['/consultation/room'])).toBe(true);
  });

  it('denies consultation room without consultation access', () => {
    expect(isPathAllowedByPages('/consultation/room/12', ['/nursing'])).toBe(false);
  });
});

describe('page catalog access audit', () => {
  const routablePages = ALL_PAGE_PERMISSIONS.filter((p) => p.module !== 'User');

  it.each(routablePages.map((p) => [p.id, p.module] as const))(
    'granting %s allows navigation to itself',
    (pageId) => {
      expect(isPathAllowedByPages(pageId, [pageId])).toBe(true);
    },
  );

  it.each(SIDEBAR_NAV_HREFS)('sidebar href %s is in the page catalog', (href) => {
    const inCatalog = ALL_PAGE_PERMISSIONS.some((p) => p.id === href);
    expect(inCatalog, `${href} missing from ALL_PAGE_PERMISSIONS`).toBe(true);
  });

  it.each(SIDEBAR_NAV_HREFS)(
    'sidebar href %s is reachable when granted in role',
    (href) => {
      expect(isPathAllowedByPages(href, [href])).toBe(true);
    },
  );
});

describe('getHomeRouteFromAllowedPages', () => {
  it('returns null for empty pages', () => {
    expect(getHomeRouteFromAllowedPages([])).toBeNull();
  });

  it('returns /dashboard when allowed', () => {
    expect(getHomeRouteFromAllowedPages(['/dashboard'])).toBe('/dashboard');
  });

  it('returns a module dashboard for allowed pages', () => {
    const result = getHomeRouteFromAllowedPages(['/nursing/pool-queue', '/nursing']);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('getHomeRouteForUser', () => {
  it('returns null for null user', () => {
    expect(getHomeRouteForUser(null)).toBeNull();
    expect(getHomeRouteForUser(undefined)).toBeNull();
  });

  it('returns /dashboard for superuser', () => {
    expect(getHomeRouteForUser({ isSuperuser: true, permissions: [] } as any)).toBe('/dashboard');
  });

  it('delegates to getHomeRouteFromAllowedPages for normal user', () => {
    const result = getHomeRouteForUser({ isSuperuser: false, permissions: ['/nursing'] } as any);
    expect(result).toBeTruthy();
  });
});
