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
  it('maps legacy physiotherapy pool-queue to orders', () => {
    expect(normalizeRolePagePath('/physiotherapy/pool-queue')).toBe('/physiotherapy/orders');
  });
});

describe('normalizeRolePagePaths', () => {
  it('deduplicates and maps legacy paths', () => {
    expect(
      normalizeRolePagePaths(['/physiotherapy/pool-queue', '/physiotherapy/orders'])
    ).toEqual(['/physiotherapy/orders']);
  });
});