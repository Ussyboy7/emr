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

  it('shows for pharmacy HOD with module grant', () => {
    expect(
      canShowHodStoreNav({ ...baseUser, isPharmacyHod: true, permissions: ['/pharmacy'] }),
    ).toBe(true);
  });

  it('shows when hod-store page is explicitly granted', () => {
    expect(
      canShowHodStoreNav({ ...baseUser, permissions: ['/pharmacy/hod-store'] }),
    ).toBe(true);
  });

  it('hides for pharmacist with only parent /pharmacy grant', () => {
    expect(canShowHodStoreNav({ ...baseUser, permissions: ['/pharmacy'] })).toBe(false);
  });

  it('hides when hod-store is denied even for pharmacy HOD', () => {
    expect(
      canShowHodStoreNav({
        ...baseUser,
        isPharmacyHod: true,
        permissions: ['/pharmacy'],
        deniedPages: ['/pharmacy/hod-store'],
      }),
    ).toBe(false);
  });

  it('hides for regular pharmacist without pages', () => {
    expect(canShowHodStoreNav(baseUser)).toBe(false);
  });
});
