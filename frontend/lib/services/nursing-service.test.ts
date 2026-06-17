import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(),
  buildQueryString: vi.fn((params: Record<string, unknown>) => {
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '');
    if (!entries.length) return '';
    return '?' + entries.map(([k, v]) => `${k}=${v}`).join('&');
  }),
}));

vi.mock('./visit-service', () => ({
  visitService: {
    getVisits: vi.fn().mockResolvedValue({ results: [], count: 0 }),
    getNursingPoolMetrics: vi.fn().mockResolvedValue({
      total: 10,
      pending_vitals: 3,
      ready_for_consultation: 5,
      in_consultation: 2,
      completed: 0,
    }),
  },
}));

vi.mock('../dates', () => ({
  todayApiDateString: vi.fn(() => '2025-01-15'),
  toApiDateFromInstant: vi.fn(() => '2025-01-15'),
}));

vi.mock('../utils/clinic-utils', () => ({
  getVisitServiceClinicsDisplay: vi.fn(() => 'GOPD'),
}));

vi.mock('../client-logger', () => ({
  logError: vi.fn(),
}));

import { apiFetch } from '../api-client';
import { nursingService } from './nursing-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('nursingService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getRoomQueueCount', () => {
    it('fetches active consultation queue and counts today rows', async () => {
      mockApiFetch.mockResolvedValue({
        results: [{ queued_at: '2025-01-15T10:00:00Z' }, { queued_at: '2025-01-15T11:00:00Z' }],
        count: 2,
      });

      const count = await nursingService.getRoomQueueCount('2025-01-15');
      expect(count).toBe(2);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/consultation/queue/');
    });

    it('returns 0 on error', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const count = await nursingService.getRoomQueueCount('2025-01-15');
      expect(count).toBe(0);
    });
  });

  describe('getPoolMetrics', () => {
    it('returns nursing pool metrics from visit service', async () => {
      const metrics = await nursingService.getPoolMetrics('2025-01-15');
      expect(metrics.totalInPool).toBe(10);
      expect(metrics.pendingVitals).toBe(3);
      expect(metrics.readyForConsultation).toBe(5);
    });
  });

  describe('getAnalyticsSummary', () => {
    it('fetches analytics with date range', async () => {
      const summary = { period: { start: '2025-01-01', end: '2025-01-31' }, summary: {} };
      mockApiFetch.mockResolvedValue(summary);

      const res = await nursingService.getAnalyticsSummary({ start: '2025-01-01', end: '2025-01-31' });
      expect(res.period.start).toBe('2025-01-01');
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/nursing/analytics/summary/');
    });
  });

  describe('resolveProcedureForOrder', () => {
    it('fetches procedure for a nursing order', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, order: 5 });

      const res = await nursingService.resolveProcedureForOrder(5);
      expect(res).toEqual({ id: 1, order: 5 });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/nursing/procedures/resolve/');
    });

    it('returns null on error', async () => {
      mockApiFetch.mockRejectedValue(new Error('Not found'));

      const res = await nursingService.resolveProcedureForOrder(999);
      expect(res).toBeNull();
    });
  });

  describe('getProceduresQueueStats', () => {
    it('fetches procedure queue statistics', async () => {
      const stats = { total: 20, pending: 10, completed: 8, injections: 2 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await nursingService.getProceduresQueueStats();
      expect(res.total).toBe(20);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/nursing/orders/list-stats/');
    });
  });

  describe('getProceduresHistoryStats', () => {
    it('fetches procedures history statistics', async () => {
      const stats = { total: 50, injections: 20, dressings: 10, medications: 15, observations: 5 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await nursingService.getProceduresHistoryStats();
      expect(res.total).toBe(50);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/nursing/procedures/history-stats/');
    });
  });

  describe('getPoolQueueCount', () => {
    it('returns pool count from metrics', async () => {
      const res = await nursingService.getPoolQueueCount('2025-01-15');
      expect(res.count).toBe(10);
    });
  });
});
