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
import { hrService } from './hr-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('hrService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getCompliance', () => {
    it('fetches compliance data', async () => {
      const payload = {
        programme_year: 2025,
        summary: { completed: 50, in_progress: 20, exempt: 5, due: 15, overdue: 10, total_eligible: 100 },
        results: [{ patient_id: 1 }],
        count: 1,
      };
      mockApiFetch.mockResolvedValue(payload);

      const res = await hrService.getCompliance({ programme_year: 2025 });
      expect(res.programme_year).toBe(2025);
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/hr/compliance/');
    });
  });

  describe('getSummary', () => {
    it('fetches compliance summary', async () => {
      mockApiFetch.mockResolvedValue({
        programme_year: 2025,
        completed: 50,
        in_progress: 20,
        exempt: 5,
        due: 15,
        overdue: 10,
        total_eligible: 100,
      });

      const res = await hrService.getSummary(2025);
      expect(res.completed).toBe(50);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/hr/compliance/summary/');
    });
  });

  describe('listExemptions', () => {
    it('fetches exemptions list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, reason: 'medical' }], count: 1 });

      const res = await hrService.listExemptions({ programme_year: 2025 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/hr/exemptions/');
    });
  });

  describe('createExemption', () => {
    it('posts new exemption', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, patient: 5, reason: 'medical' });

      const res = await hrService.createExemption({
        patient: 5,
        programme_year: 2025,
        reason: 'medical',
      });
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/hr/exemptions/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('deleteExemption', () => {
    it('deletes an exemption', async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await hrService.deleteExemption(3);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/hr/exemptions/3/',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('exportCsv', () => {
    it('fetches CSV blob', async () => {
      const blob = new Blob(['csv data']);
      mockApiFetch.mockResolvedValue(blob);

      const res = await hrService.exportCsv(2025);
      expect(res).toBeInstanceOf(Blob);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/hr/compliance/export-csv/');
    });
  });
});
