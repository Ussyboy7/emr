import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(),
  buildQueryString: vi.fn((params: Record<string, unknown>) => {
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '');
    if (!entries.length) return '';
    return '?' + entries.map(([k, v]) => `${k}=${v}`).join('&');
  }),
}));

import { apiFetch } from '../api-client';
import { adminService } from './admin-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('adminService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getUsers', () => {
    it('fetches users list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, username: 'admin' }], count: 1 });

      const res = await adminService.getUsers({ page: 1 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/users/');
    });
  });

  describe('getUser', () => {
    it('fetches single user', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, username: 'doctor1' });

      const res = await adminService.getUser(5);
      expect(res.username).toBe('doctor1');
      expect(mockApiFetch).toHaveBeenCalledWith('/accounts/users/5/');
    });
  });

  describe('createUser', () => {
    it('posts new user', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, username: 'newuser' });

      const res = await adminService.createUser({
        email: 'new@example.com',
        first_name: 'New',
        last_name: 'User',
      });
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/accounts/users/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('updateUser', () => {
    it('patches an existing user', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, first_name: 'Updated' });

      const res = await adminService.updateUser(3, { first_name: 'Updated' });
      expect(res.first_name).toBe('Updated');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/accounts/users/3/',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('deleteUser', () => {
    it('deletes a user', async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await adminService.deleteUser(3);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/accounts/users/3/',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('getRoles', () => {
    it('fetches roles list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'Doctor' }], count: 1 });

      const res = await adminService.getRoles();
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/permissions/roles/');
    });
  });

  describe('createRole', () => {
    it('posts new role', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, name: 'Nurse' });

      const res = await adminService.createRole({ name: 'Nurse', type: 'nurse' } as any);
      expect(res.name).toBe('Nurse');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/permissions/roles/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getClinics', () => {
    it('fetches clinics list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'Main Clinic' }], count: 1 });

      const res = await adminService.getClinics();
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/organization/clinics/');
    });
  });

  describe('getDepartments', () => {
    it('fetches departments list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'Emergency' }], count: 1 });

      const res = await adminService.getDepartments();
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/organization/departments/');
    });
  });

  describe('getAuditLogs', () => {
    it('fetches audit logs', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, action: 'login' }], count: 1 });

      const res = await adminService.getAuditLogs({ action: 'login' });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/audit/logs/');
    });
  });

  describe('resetPassword', () => {
    it('posts password reset', async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await adminService.resetPassword(5, 'NewSecurePass123!');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/accounts/users/5/reset_password/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('NewSecurePass123!'),
        }),
      );
    });
  });

  describe('getDashboardStats', () => {
    it('fetches admin dashboard stats', async () => {
      const stats = { totalUsers: 100, activeUsers: 80 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await adminService.getDashboardStats();
      expect(res.totalUsers).toBe(100);
      expect(mockApiFetch).toHaveBeenCalledWith('/common/dashboard/admin/');
    });
  });

  describe('assignRoleToUser', () => {
    it('posts role assignment', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, user: 5, role: 2 });

      const res = await adminService.assignRoleToUser(5, 2);
      expect(res.user).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/permissions/user-roles/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
