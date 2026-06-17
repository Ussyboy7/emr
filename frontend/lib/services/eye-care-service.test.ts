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
import { eyeCareService } from './eye-care-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('eyeCareService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getOrders', () => {
    it('fetches eye orders', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, status: 'pending' }], count: 1 });

      const res = await eyeCareService.getOrders({ status: 'pending' });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/eyecare/orders');
    });
  });

  describe('getOrder', () => {
    it('fetches single eye order', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'in_progress' });

      const res = await eyeCareService.getOrder(5);
      expect(res.id).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith('/eyecare/orders/5/');
    });
  });

  describe('createOrder', () => {
    it('posts new eye order', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, patient: 10 });

      const res = await eyeCareService.createOrder({ patient: 10 } as any);
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/eyecare/orders/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('updateOrder', () => {
    it('patches an existing eye order', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, priority: 'urgent' });

      const res = await eyeCareService.updateOrder(3, { priority: 'urgent' } as any);
      expect(res.priority).toBe('urgent');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/eyecare/orders/3/',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('completeOrder', () => {
    it('posts complete action', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'completed' });

      const res = await eyeCareService.completeOrder(5);
      expect(res.status).toBe('completed');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/eyecare/orders/5/complete/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getSessions', () => {
    it('fetches eye sessions', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, session_number: 1 }], count: 1 });

      const res = await eyeCareService.getSessions({ order: 5 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/eyecare/sessions/');
    });
  });

  describe('getSession', () => {
    it('fetches single session', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, session_number: 2 });

      const res = await eyeCareService.getSession(3);
      expect(res.session_number).toBe(2);
      expect(mockApiFetch).toHaveBeenCalledWith('/eyecare/sessions/3/');
    });
  });

  describe('createSession', () => {
    it('posts new eye session', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, order: 5 });

      const res = await eyeCareService.createSession({ order: 5 } as any);
      expect(res.order).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/eyecare/sessions/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getOrderStats', () => {
    it('fetches order statistics', async () => {
      const stats = { pending: 5, in_progress: 3, cancelled: 0, completed: 10 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await eyeCareService.getOrderStats();
      expect(res.pending).toBe(5);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/eyecare/orders/stats/');
    });
  });

  describe('checkinFromVisit', () => {
    it('posts check-in from visit', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, patient: 10 });

      const res = await eyeCareService.checkinFromVisit(20);
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/eyecare/orders/checkin-from-visit/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"visit":20'),
        }),
      );
    });
  });
});
