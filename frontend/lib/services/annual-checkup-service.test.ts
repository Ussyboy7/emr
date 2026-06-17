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
import { annualCheckupService } from './annual-checkup-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('annualCheckupService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('list', () => {
    it('fetches annual checkups list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, status: 'in_progress' }], count: 1 });

      const res = await annualCheckupService.list({ programme_year: 2025 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/annual-checkups/');
    });
  });

  describe('getById', () => {
    it('fetches single checkup', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'completed' });

      const res = await annualCheckupService.getById(5);
      expect(res.id).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith('/annual-checkups/5/');
    });
  });

  describe('resolve', () => {
    it('resolves checkup by patient and visit', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, patient: 10, visit: 20 });

      const res = await annualCheckupService.resolve({ patient: 10, visit: 20 });
      expect(res.id).toBe(3);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/annual-checkups/resolve/');
    });
  });

  describe('ensureForVisit', () => {
    it('posts ensure-for-visit action', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, visit: 20, status: 'in_progress' });

      const res = await annualCheckupService.ensureForVisit(20);
      expect(res.visit).toBe(20);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/annual-checkups/ensure-for-visit/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"visit":20'),
        }),
      );
    });
  });

  describe('update', () => {
    it('patches checkup', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, fitness_outcome: 'fit' });

      const res = await annualCheckupService.update(5, { fitness_outcome: 'fit' });
      expect(res.fitness_outcome).toBe('fit');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/annual-checkups/5/',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('signOff', () => {
    it('posts sign-off action', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'completed', fitness_outcome: 'fit' });

      const res = await annualCheckupService.signOff(5, {
        fitness_outcome: 'fit',
        outcome_notes: 'All clear',
      });
      expect(res.status).toBe('completed');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/annual-checkups/5/sign-off/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"fitness_outcome":"fit"'),
        }),
      );
    });
  });

  describe('refreshComponents', () => {
    it('posts refresh-components action', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, checklist: [] });

      await annualCheckupService.refreshComponents(5);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/annual-checkups/5/refresh-components/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getProgramme', () => {
    it('fetches programme configuration', async () => {
      mockApiFetch.mockResolvedValue({
        programme_year: 2025,
        catalog: [{ code: 'CBC', label: 'Complete Blood Count' }],
        default_selected_codes: ['CBC'],
      });

      const res = await annualCheckupService.getProgramme(2025);
      expect(res.programme_year).toBe(2025);
      expect(res.catalog).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/annual-checkups/programme/');
    });
  });
});
