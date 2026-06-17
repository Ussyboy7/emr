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
import { appointmentService } from './appointment-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('appointmentService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getAppointments', () => {
    it('fetches appointments list', async () => {
      const payload = { results: [{ id: 1, appointment_id: 'APT-001' }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await appointmentService.getAppointments({ page: 1 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/appointments/');
    });

    it('passes filter params', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await appointmentService.getAppointments({ status: 'scheduled', doctor: 5 });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('status=scheduled');
      expect(url).toContain('doctor=5');
    });
  });

  describe('getAppointment', () => {
    it('fetches single appointment', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, appointment_id: 'APT-003' });

      const res = await appointmentService.getAppointment(3);
      expect(res.id).toBe(3);
      expect(mockApiFetch).toHaveBeenCalledWith('/appointments/3/');
    });
  });

  describe('createAppointment', () => {
    it('posts new appointment', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, appointment_id: 'APT-001' });

      const res = await appointmentService.createAppointment({
        patient: 10,
        appointment_type: 'consultation',
        appointment_date: '2025-01-20',
        appointment_time: '09:00',
      });
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/appointments/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('updateAppointment', () => {
    it('patches an existing appointment', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, status: 'confirmed' });

      const res = await appointmentService.updateAppointment(3, { status: 'confirmed' });
      expect(res.status).toBe('confirmed');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/appointments/3/',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('deleteAppointment', () => {
    it('deletes an appointment', async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await appointmentService.deleteAppointment(3);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/appointments/3/',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('confirmAppointment', () => {
    it('posts confirm action', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'confirmed' });

      const res = await appointmentService.confirmAppointment(5);
      expect(res.status).toBe('confirmed');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/appointments/5/confirm/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('cancelAppointment', () => {
    it('posts cancel action', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'cancelled' });

      const res = await appointmentService.cancelAppointment(5);
      expect(res.status).toBe('cancelled');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/appointments/5/cancel/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getUpcomingAppointments', () => {
    it('fetches upcoming appointments', async () => {
      mockApiFetch.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const res = await appointmentService.getUpcomingAppointments();
      expect(res).toHaveLength(2);
      expect(mockApiFetch).toHaveBeenCalledWith('/appointments/upcoming/');
    });
  });

  describe('getTodayAppointments', () => {
    it('fetches today appointments', async () => {
      mockApiFetch.mockResolvedValue([{ id: 1 }]);

      const res = await appointmentService.getTodayAppointments();
      expect(res).toHaveLength(1);
      expect(mockApiFetch).toHaveBeenCalledWith('/appointments/today/');
    });
  });

  describe('getListStats', () => {
    it('fetches appointment list stats', async () => {
      const stats = { total: 50, scheduled: 20, confirmed: 15, inProgress: 10 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await appointmentService.getListStats();
      expect(res.total).toBe(50);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/appointments/list-stats/');
    });
  });
});
