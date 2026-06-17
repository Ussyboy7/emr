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
import { physioService } from './physio-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('physioService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getTemplates', () => {
    it('fetches physio templates', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'Heat Therapy' }], count: 1 });

      const res = await physioService.getTemplates({ category: 'thermal' });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/templates/');
    });
  });

  describe('getOrders', () => {
    it('fetches physio orders', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, status: 'pending' }], count: 1 });

      const res = await physioService.getOrders({ status: 'pending' });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/orders/');
    });
  });

  describe('getOrder', () => {
    it('fetches single order', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'scheduled' });

      const res = await physioService.getOrder(5);
      expect(res.id).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith('/orders/5/');
    });
  });

  describe('createOrder', () => {
    it('posts new physio order', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, status: 'pending' });

      const res = await physioService.createOrder({ patient: 10 } as any);
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/orders/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('scheduleOrder', () => {
    it('posts schedule for an order', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'scheduled' });

      const res = await physioService.scheduleOrder(5, '2025-01-20T09:00:00Z');
      expect(res.status).toBe('scheduled');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/orders/5/schedule/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('scheduled_at'),
        }),
      );
    });
  });

  describe('getSessions', () => {
    it('fetches physio sessions', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, session_number: 1 }], count: 1 });

      const res = await physioService.getSessions({ order: 5 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/sessions/');
    });
  });

  describe('getSession', () => {
    it('fetches single session', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, session_number: 2 });

      const res = await physioService.getSession(3);
      expect(res.session_number).toBe(2);
      expect(mockApiFetch).toHaveBeenCalledWith('/sessions/3/');
    });
  });

  describe('createSession', () => {
    it('posts new session', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, order: 5 });

      const res = await physioService.createSession({ order: 5 } as any);
      expect(res.order).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/sessions/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('startSession', () => {
    it('posts start-session action', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, status: 'in_progress' });

      const res = await physioService.startSession(3);
      expect(res.status).toBe('in_progress');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/sessions/3/start_session/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('completeSession', () => {
    it('posts complete-session action', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, status: 'completed' });

      const res = await physioService.completeSession(3, { pain_level_after: 2 });
      expect(res.status).toBe('completed');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/sessions/3/complete_session/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getStats', () => {
    it('fetches physio statistics', async () => {
      const stats = { total_orders: 50, pending_orders: 10, completed_sessions: 30, active_sessions: 5, total_sessions: 40 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await physioService.getStats();
      expect(res.total_orders).toBe(50);
      expect(mockApiFetch).toHaveBeenCalledWith('/stats/');
    });
  });

  describe('getOrderStats', () => {
    it('fetches order statistics', async () => {
      const stats = { pending: 5, scheduled: 3, in_progress: 2, cancelled: 0, completed: 10 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await physioService.getOrderStats();
      expect(res.pending).toBe(5);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/orders/stats/');
    });
  });
});
