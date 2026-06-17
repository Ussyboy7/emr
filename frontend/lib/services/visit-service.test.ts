import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(),
  buildQueryString: vi.fn((params: Record<string, unknown>) => {
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '');
    if (!entries.length) return '';
    return '?' + entries.map(([k, v]) => `${k}=${v}`).join('&');
  }),
}));

vi.mock('../dates', () => ({
  peekServerTodayApi: vi.fn(() => '2025-01-15'),
}));

import { apiFetch } from '../api-client';
import { visitService } from './visit-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('visitService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getVisits', () => {
    it('fetches visits list', async () => {
      const payload = { results: [{ id: 1 }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await visitService.getVisits({ page: 1 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/visits/');
    });

    it('passes filter params', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await visitService.getVisits({ status: 'in_progress', nursing_pool: 1 });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('status=in_progress');
      expect(url).toContain('nursing_pool=1');
    });
  });

  describe('getVisit', () => {
    it('fetches single visit by ID', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'in_progress' });

      const res = await visitService.getVisit(5);
      expect(res.id).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith('/visits/5/');
    });
  });

  describe('createVisit', () => {
    it('posts new visit', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, status: 'scheduled' });

      const res = await visitService.createVisit({ patient: 10 } as any);
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/visits/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('updateVisit', () => {
    it('patches an existing visit', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, status: 'completed' });

      const res = await visitService.updateVisit(3, { status: 'completed' } as any);
      expect(res.status).toBe('completed');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/visits/3/',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('deleteVisit', () => {
    it('deletes a visit', async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await visitService.deleteVisit(3);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/visits/3/',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('closeWorkflow', () => {
    it('posts close-workflow action', async () => {
      mockApiFetch.mockResolvedValue({
        detail: 'Visit cancelled',
        visit_cancelled: true,
        queue_items_deactivated: 1,
        sessions_cancelled: 0,
        nursing_orders_cancelled: 0,
      });

      const res = await visitService.closeWorkflow(5, { reason: 'Patient left' });
      expect(res.visit_cancelled).toBe(true);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/visits/5/close-workflow/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getNursingPoolMetrics', () => {
    it('fetches nursing pool metrics', async () => {
      const metrics = { total: 10, pending_vitals: 3, ready_for_consultation: 5, in_consultation: 2, completed: 0 };
      mockApiFetch.mockResolvedValue(metrics);

      const res = await visitService.getNursingPoolMetrics({ status: 'in_progress' });
      expect(res.total).toBe(10);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/visits/nursing-pool-metrics/');
    });
  });

  describe('getListStats', () => {
    it('fetches visit list stats', async () => {
      const stats = { total: 100, scheduled: 20, inProgress: 30, completed: 50 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await visitService.getListStats();
      expect(res.total).toBe(100);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/visits/list-stats/');
    });
  });

  describe('resolveVisit', () => {
    it('resolves best-matching visit for patient', async () => {
      mockApiFetch.mockResolvedValue({ id: 7, status: 'in_progress' });

      const res = await visitService.resolveVisit({ patient: 5 });
      expect(res?.id).toBe(7);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/visits/resolve/');
    });

    it('returns null on error', async () => {
      mockApiFetch.mockRejectedValue(new Error('Not found'));

      const res = await visitService.resolveVisit({ patient: 999 });
      expect(res).toBeNull();
    });
  });
});
