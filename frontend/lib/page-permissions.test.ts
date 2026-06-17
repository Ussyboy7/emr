import { describe, expect, it } from 'vitest';
import { groupPagePermissionsByModule, normalizeRolePagePath, normalizeRolePagePaths } from './page-permissions';

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