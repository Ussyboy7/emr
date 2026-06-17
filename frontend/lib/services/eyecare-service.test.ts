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
import { eyecareService } from './eyecare-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('eyecareService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getAnalyticsSummary', () => {
    it('fetches analytics with date range object', async () => {
      const payload = {
        session_metrics: { total_sessions: 100 },
        period: { start_date: '2025-01-01', end_date: '2025-01-31' },
      };
      mockApiFetch.mockResolvedValue(payload);

      const res = await eyecareService.getAnalyticsSummary({ start: '2025-01-01', end: '2025-01-31' });
      expect(res.session_metrics.total_sessions).toBe(100);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/eyecare/analytics/summary/');
      expect(url).toContain('start_date=2025-01-01');
      expect(url).toContain('end_date=2025-01-31');
    });

    it('fetches analytics with URLSearchParams', async () => {
      mockApiFetch.mockResolvedValue({ session_metrics: {}, period: {} });

      const params = new URLSearchParams({ start_date: '2025-01-01', end_date: '2025-01-31' });
      await eyecareService.getAnalyticsSummary(params);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/eyecare/analytics/summary/');
      expect(url).toContain('start_date=2025-01-01');
    });
  });
});
