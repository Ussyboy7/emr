import { describe, expect, it, vi } from 'vitest';
import type { PermissionProfile } from '@/lib/permissions';

const defaultProfile: PermissionProfile = {
  canAccessApprovals: false,
  canAccessAnalytics: false,
  canAccessAdministration: false,
  canAccessReports: false,
  canAccessDocumentManagement: true,
  canDistribute: false,
  allowedArchiveLevels: ['department'],
};

const mockGetPermissionProfile = vi.fn((): PermissionProfile => ({ ...defaultProfile }));
let mockAssistantAssignments: any[] = [];

vi.mock('react', () => ({
  useMemo: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock('@/lib/permissions', () => ({
  getPermissionProfile: (...args: any[]) => mockGetPermissionProfile(...args),
}));

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(() => ({
    assistantAssignments: mockAssistantAssignments,
  })),
}));

import { useUserPermissions } from './use-user-permissions';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
  employeeId: 'E001',
  gradeLevel: 'SSS2',
  directorate: 'IT',
  systemRole: 'Officer',
  permissions: [],
  permissionActions: {},
  active: true,
  isSuperuser: false,
  isStaff: false,
  isDepartmentHead: false,
  headedDepartments: [],
  multi_clinic_enabled: false,
  ...overrides,
});

describe('useUserPermissions', () => {
  it('returns base profile when no user', () => {
    const result = useUserPermissions(null);
    expect(result).toEqual(defaultProfile);
  });

  it('returns base profile when no assignments for user', () => {
    mockAssistantAssignments = [
      { assistantId: 'other', permissions: ['forward'] },
    ];
    const result = useUserPermissions(makeUser() as any);
    expect(result.canDistribute).toBe(false);
  });

  it('enhances canDistribute + canAccessApprovals for forward permission', () => {
    mockAssistantAssignments = [
      { assistantId: '1', permissions: ['forward'] },
    ];
    const result = useUserPermissions(makeUser() as any);
    expect(result.canDistribute).toBe(true);
    expect(result.canAccessApprovals).toBe(true);
  });

  it('enhances canAccessDocumentManagement for view permission', () => {
    mockAssistantAssignments = [
      { assistantId: '1', permissions: ['view'] },
    ];
    const result = useUserPermissions(makeUser() as any);
    expect(result.canAccessDocumentManagement).toBe(true);
  });

  it('enhances canAccessDocumentManagement for coordinate permission', () => {
    mockAssistantAssignments = [
      { assistantId: '1', permissions: ['coordinate'] },
    ];
    const result = useUserPermissions(makeUser() as any);
    expect(result.canAccessDocumentManagement).toBe(true);
  });

  it('superadmin always gets all permissions', () => {
    mockAssistantAssignments = [
      { assistantId: '1', permissions: ['forward'] },
    ];
    const result = useUserPermissions(
      makeUser({ isSuperuser: true }) as any,
    );
    expect(result.canAccessApprovals).toBe(true);
    expect(result.canAccessAnalytics).toBe(true);
    expect(result.canAccessAdministration).toBe(true);
    expect(result.canAccessReports).toBe(true);
    expect(result.canDistribute).toBe(true);
    expect(result.canAccessDocumentManagement).toBe(true);
  });

  it('superadmin via systemRole "Super Admin" also gets all permissions', () => {
    mockAssistantAssignments = [
      { assistantId: '1', permissions: [] },
    ];
    const result = useUserPermissions(
      makeUser({ systemRole: 'Super Admin' }) as any,
    );
    expect(result.canAccessApprovals).toBe(true);
    expect(result.canAccessAdministration).toBe(true);
  });
});
