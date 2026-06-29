import { describe, expect, it } from 'vitest';
import { convertPermissionsFromBackend, expandRolePagesForRestrictUI, getPageNavConstraintNote, getRestrictUIPageEntries, groupRestrictUIPageEntries, groupPagePermissionsByModule, normalizeRolePagePath, normalizeRolePagePaths, sortPageModules } from './page-permissions';

describe('convertPermissionsFromBackend', () => {
  it('reads string arrays and legacy pages objects', () => {
    expect(convertPermissionsFromBackend(['/nursing'])).toEqual(['/nursing']);
    expect(convertPermissionsFromBackend({ pages: ['/pharmacy'] })).toEqual(['/pharmacy']);
    expect(convertPermissionsFromBackend(null)).toEqual([]);
  });
});

describe('sortPageModules', () => {
  it('orders known modules before unknown', () => {
    expect(sortPageModules(['Administration', 'Human Resources', 'Other'])).toEqual([
      'Human Resources',
      'Administration',
      'Other',
    ]);
  });
});

describe('expandRolePagesForRestrictUI', () => {
  it('expands parent module grants into catalog subpages', () => {
    const expanded = expandRolePagesForRestrictUI(['/pharmacy']);
    expect(expanded).toContain('/pharmacy');
    expect(expanded).toContain('/pharmacy/inventory');
    expect(expanded).toContain('/pharmacy/hod-store');
    expect(expanded).toContain('/pharmacy/requests');
  });
});

describe('getRestrictUIPageEntries', () => {
  it('marks explicit vs implied pages for parent grants', () => {
    const entries = getRestrictUIPageEntries(['/pharmacy', '/pharmacy/store']);
    const hod = entries.find((e) => e.id === '/pharmacy/hod-store');
    const store = entries.find((e) => e.id === '/pharmacy/store');
    const rx = entries.find((e) => e.id === '/pharmacy/prescriptions');
    expect(hod?.source).toBe('implied');
    expect(hod?.navNote).toContain('Pharmacy Head');
    expect(store?.source).toBe('explicit');
    expect(store?.navNote).toContain('Bode Thomas');
    expect(rx?.source).toBe('implied');
  });

  it('returns nav constraint notes for HOD and central store', () => {
    expect(getPageNavConstraintNote('/pharmacy/hod-store')).toBeDefined();
    expect(getPageNavConstraintNote('/pharmacy/prescriptions')).toBeUndefined();
  });
});

describe('groupPagePermissionsByModule', () => {
  it('groups permissions by module', () => {
    const pageIds = ['/pharmacy/prescriptions', '/laboratory/orders', 'unknown'];
    const result = groupPagePermissionsByModule(pageIds);
    expect(result).toHaveProperty('Pharmacy');
    expect(result).toHaveProperty('Laboratory');
    expect(result).toHaveProperty('Other');
  });

  it('handles empty array', () => {
    const result = groupPagePermissionsByModule([]);
    expect(result).toEqual({});
  });
});

describe('normalizeRolePagePath', () => {
  it('maps legacy nursing patient-vitals to vitals-history', () => {
    expect(normalizeRolePagePath('/nursing/patient-vitals')).toBe('/nursing/vitals-history');
  });

  it('maps legacy medical-records dependents to patients', () => {
    expect(normalizeRolePagePath('/medical-records/dependents')).toBe('/medical-records/patients');
  });
});

describe('normalizeRolePagePaths', () => {
  it('deduplicates and maps legacy paths', () => {
    expect(
      normalizeRolePagePaths(['/nursing/patient-vitals', '/nursing/vitals-history'])
    ).toEqual(['/nursing/vitals-history']);
  });
});