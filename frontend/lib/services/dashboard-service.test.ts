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
import { getOperationalDashboard } from './dashboard-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('dashboardService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getOperationalDashboard', () => {
    it('fetches operational dashboard data', async () => {
      const payload = {
        date: '2025-01-15',
        todayStats: { patientsToday: 50, consultations: 30, labTests: 20, prescriptions: 15 },
        queueStatus: { nursingPool: 5, consultationWaiting: 3, labPending: 2, pharmacyQueue: 1 },
        wardStatus: { activeAdmissions: 4, pendingDischarges: 1, escalated: 2, availableBeds: 6 },
        recentPatients: [],
        criticalAlerts: [],
        facilityPerformance: [],
        upcomingAppointments: [],
      };
      mockApiFetch.mockResolvedValue(payload);

      const res = await getOperationalDashboard();
      expect(res.date).toBe('2025-01-15');
      expect(res.todayStats.patientsToday).toBe(50);
      expect(Array.isArray(res.facilityPerformance)).toBe(true);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/common/dashboard/operational');
    });

    it('passes date param', async () => {
      mockApiFetch.mockResolvedValue({ date: '2025-01-10', todayStats: {} });

      await getOperationalDashboard({ date: '2025-01-10' });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('date=2025-01-10');
    });
  });
});
