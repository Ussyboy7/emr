import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(),
  buildQueryString: vi.fn((params: Record<string, unknown>) => {
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '');
    if (!entries.length) return '';
    return '?' + entries.map(([k, v]) => `${k}=${v}`).join('&');
  }),
}));

import { apiFetch } from '../api-client';
import { consultationService } from './consultation-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('consultationService ICD-10 methods', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getICD10Codes', () => {
    it('fetches codes without params', async () => {
      const payload = { results: [{ id: 1, code: 'A00', description: 'Cholera', category: 'Infectious', is_active: true }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await consultationService.getICD10Codes();
      expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('/consultation/icd10-codes/'));
      expect(res.results).toHaveLength(1);
      expect(res.count).toBe(1);
    });

    it('passes search and category params', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await consultationService.getICD10Codes({ search: 'malaria', category: 'Infectious', page: 2, page_size: 50 });
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('search=malaria');
      expect(callArg).toContain('category=Infectious');
      expect(callArg).toContain('page=2');
    });
  });

  describe('resolveICD10Code', () => {
    it('returns code on success', async () => {
      const code = { id: 1, code: 'I10', description: 'Hypertension', category: 'Circulatory', is_active: true };
      mockApiFetch.mockResolvedValue(code);

      const res = await consultationService.resolveICD10Code('I10');
      expect(res).toEqual(code);
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('/consultation/icd10-codes/resolve/');
      expect(callArg).toContain('code=I10');
    });

    it('returns null on error', async () => {
      mockApiFetch.mockRejectedValue(new Error('Not found'));

      const res = await consultationService.resolveICD10Code('ZZZ.999');
      expect(res).toBeNull();
    });

    it('trims whitespace from code', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, code: 'I10' });

      await consultationService.resolveICD10Code('  I10  ');
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('code=I10');
    });
  });

  describe('getICD10Stats', () => {
    it('fetches stats from correct endpoint', async () => {
      const stats = {
        total_codes: 12000,
        active_codes: 11900,
        inactive_codes: 100,
        total_diagnoses: 50,
        categories: [{ category: 'Infectious', count: 600 }],
        top_used_codes: [{ code: 'I10', description: 'Hypertension', usage_count: 15 }],
      };
      mockApiFetch.mockResolvedValue(stats);

      const res = await consultationService.getICD10Stats();
      expect(mockApiFetch).toHaveBeenCalledWith('/consultation/icd10-codes/stats/');
      expect(res.total_codes).toBe(12000);
      expect(res.categories).toHaveLength(1);
      expect(res.top_used_codes[0].code).toBe('I10');
    });
  });

  describe('getICD10Categories', () => {
    it('fetches categories from correct endpoint', async () => {
      const cats = { results: [{ category: 'Infectious', count: 600 }, { category: 'Circulatory', count: 200 }], count: 2 };
      mockApiFetch.mockResolvedValue(cats);

      const res = await consultationService.getICD10Categories();
      expect(mockApiFetch).toHaveBeenCalledWith('/consultation/icd10-codes/categories/');
      expect(res.results).toHaveLength(2);
      expect(res.count).toBe(2);
    });
  });
});

describe('consultationService Diagnosis methods', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getDiagnoses', () => {
    it('fetches diagnoses with patient filter', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await consultationService.getDiagnoses({ patient: 42 });
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('/consultation/diagnoses/');
      expect(callArg).toContain('patient=42');
    });
  });

  describe('createDiagnosis', () => {
    it('posts diagnosis data', async () => {
      const diagnosis = { id: 1, patient: 5, icd10_code: 10, status: 'confirmed' as const };
      mockApiFetch.mockResolvedValue(diagnosis);

      const res = await consultationService.createDiagnosis({ patient: 5, icd10_code: 10 });
      expect(mockApiFetch).toHaveBeenCalledWith('/consultation/diagnoses/', expect.objectContaining({ method: 'POST' }));
      expect(res.id).toBe(1);
    });
  });

  describe('updateDiagnosis', () => {
    it('patches diagnosis by id', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, status: 'ruled_out' });

      await consultationService.updateDiagnosis(1, { status: 'ruled_out' });
      expect(mockApiFetch).toHaveBeenCalledWith('/consultation/diagnoses/1/', expect.objectContaining({ method: 'PATCH' }));
    });
  });

  describe('deleteDiagnosis', () => {
    it('deletes diagnosis by id', async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await consultationService.deleteDiagnosis(7);
      expect(mockApiFetch).toHaveBeenCalledWith('/consultation/diagnoses/7/', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('sessionHasDiagnosis', () => {
    it('returns true when session has diagnoses', async () => {
      mockApiFetch.mockResolvedValue({ exists: true });

      const res = await consultationService.sessionHasDiagnosis(99);
      expect(res).toBe(true);
    });

    it('returns false when session has no diagnoses', async () => {
      mockApiFetch.mockResolvedValue({ exists: false });

      const res = await consultationService.sessionHasDiagnosis(99);
      expect(res).toBe(false);
    });
  });
});
