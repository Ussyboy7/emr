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
import { medicalCertificateService } from './medical-certificate-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('medicalCertificateService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getCertificates', () => {
    it('fetches certificates list', async () => {
      const payload = {
        results: [{ id: 1, certificate_number: 'MC-001' }],
        count: 1,
      };
      mockApiFetch.mockResolvedValue(payload);

      const res = await medicalCertificateService.getCertificates({ page: 1 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/medical-certificates/');
    });

    it('passes patient filter', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await medicalCertificateService.getCertificates({ patient: '10' });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('patient=10');
    });
  });

  describe('createCertificate', () => {
    it('posts new medical certificate', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, certificate_number: 'MC-001', purpose: 'fitness' });

      const res = await medicalCertificateService.createCertificate({
        patient: 10,
        purpose: 'fitness',
        valid_from: '2025-01-01',
        valid_to: '2025-06-30',
      });
      expect(res.purpose).toBe('fitness');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/medical-certificates/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"purpose":"fitness"'),
        }),
      );
    });

    it('includes optional sick_leave_days', async () => {
      mockApiFetch.mockResolvedValue({ id: 2, sick_leave_days: 5 });

      await medicalCertificateService.createCertificate({
        patient: 10,
        purpose: 'illness',
        valid_from: '2025-01-10',
        valid_to: '2025-01-15',
        sick_leave_days: 5,
      });
      const body = mockApiFetch.mock.calls[0][1].body;
      expect(body).toContain('"sick_leave_days":5');
    });
  });
});
