import { describe, expect, it } from 'vitest';
import { canShowHodStoreNav } from '@/lib/hod-store-access';
import type { User } from '@/lib/npa-structure';

const baseUser: User = {
  id: '1',
  name: 'Test',
  email: 't@test.com',
  employeeId: '1',
  gradeLevel: '',
  directorate: '',
  systemRole: 'Pharmacist',
  permissions: [],
  active: true,
};

describe('canShowHodStoreNav', () => {
  it('shows for superuser', () => {
    expect(canShowHodStoreNav({ ...baseUser, isSuperuser: true })).toBe(true);
  });

  it('shows for pharmacy HOD flag', () => {
    expect(canShowHodStoreNav({ ...baseUser, isPharmacyHod: true })).toBe(true);
  });

  it('shows when hod-store page is granted', () => {
    expect(
      canShowHodStoreNav({ ...baseUser, permissions: ['/pharmacy/hod-store'] }),
    ).toBe(true);
  });

  it('hides for regular pharmacist without pages', () => {
    expect(canShowHodStoreNav(baseUser)).toBe(false);
  });
});
