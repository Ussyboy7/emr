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
  toApiDateString: vi.fn((d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }),
}));

import { apiFetch } from '../api-client';
import { analyticsService } from './analytics-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('analyticsService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getClinicalDashboard', () => {
    it('fetches clinical dashboard data', async () => {
      const payload = {
        period: { start_date: '2025-01-01', end_date: '2025-01-31' },
        metrics: { total_patients: 100, total_visits: 200 },
        clinic_distribution: { GOPD: 60, Emergency: 40 },
      };
      mockApiFetch.mockResolvedValue(payload);

      const res = await analyticsService.getClinicalDashboard('2025-01-01', '2025-01-31');
      expect(res.metrics.total_patients).toBe(100);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/analytics/dashboard/');
      expect(url).toContain('start_date=2025-01-01');
      expect(url).toContain('end_date=2025-01-31');
    });
  });

  describe('getClinicDistribution', () => {
    it('returns formatted clinic distribution', async () => {
      mockApiFetch.mockResolvedValue({
        period: {},
        metrics: {},
        clinic_distribution: { GOPD: 60, Eye: 20, Physio: 10 },
        overview: {},
        visits_trend: [],
        patient_demographics_percentages: {},
        top_diagnoses: [],
        consultation_metrics: {},
        lab_metrics: {},
        test_distribution: [],
        pharmacy_metrics: {},
        weekly_activity: [],
        patient_demographics: {},
      });

      const res = await analyticsService.getClinicDistribution();
      expect(res).toHaveLength(3);
      expect(res[0]).toEqual({ name: 'GOPD', value: 60 });
    });

    it('returns empty array on error', async () => {
      mockApiFetch.mockRejectedValue(new Error('Server error'));

      const res = await analyticsService.getClinicDistribution();
      expect(res).toEqual([]);
    });
  });
});
