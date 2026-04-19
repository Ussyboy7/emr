import { describe, expect, it } from 'vitest';
import { groupPagePermissionsByModule } from './page-permissions';

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