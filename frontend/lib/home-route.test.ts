import { describe, expect, it } from 'vitest';
import { isPathAllowedByPages, getHomeRouteFromAllowedPages, getHomeRouteForUser } from './home-route';

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
