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
import { wardService } from './ward-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('wardService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getWards', () => {
    it('fetches wards list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'Ward A' }], count: 1 });

      const res = await wardService.getWards();
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/wards/');
    });
  });

  describe('getWard', () => {
    it('fetches single ward', async () => {
      mockApiFetch.mockResolvedValue({ id: 2, name: 'ICU' });

      const res = await wardService.getWard(2);
      expect(res.name).toBe('ICU');
      expect(mockApiFetch).toHaveBeenCalledWith('/wards/2/');
    });
  });

  describe('createWard', () => {
    it('posts new ward', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, name: 'Maternity' });

      const res = await wardService.createWard({
        ward_code: 'MAT',
        name: 'Maternity',
        ward_type: 'maternity',
        total_beds: 20,
      });
      expect(res.name).toBe('Maternity');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/wards/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getAdmissions', () => {
    it('fetches patient admissions', async () => {
      mockApiFetch.mockResolvedValue({
        results: [{ id: 1, admission_id: 'ADM-001' }],
        count: 1,
      });

      const res = await wardService.getAdmissions({ status: 'admitted' });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/admissions/');
      expect(url).toContain('status=admitted');
    });
  });

  describe('getAdmission', () => {
    it('fetches single admission', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, admission_id: 'ADM-005' });

      const res = await wardService.getAdmission(5);
      expect(res.id).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith('/admissions/5/');
    });
  });

  describe('createAdmission', () => {
    it('posts new admission', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, admission_id: 'ADM-001' });

      const res = await wardService.createAdmission({
        patient: 10,
        visit: 20,
        ward: 1,
        admission_type: 'emergency',
        admission_diagnosis: 'Acute appendicitis',
      });
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/admissions/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('dischargePatient', () => {
    it('posts discharge action', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, status: 'discharged' });

      const res = await wardService.dischargePatient(1, {
        discharge_type: 'normal',
        discharge_diagnosis: 'Resolved appendicitis',
      });
      expect(res.status).toBe('discharged');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/admissions/1/discharge/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('transferPatient', () => {
    it('posts transfer action', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, status: 'transferred' });

      await wardService.transferPatient(1, { new_ward_id: 3, transfer_reason: 'ICU needed' });
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/admissions/1/transfer/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getBeds', () => {
    it('fetches beds list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, bed_number: 'B-001' }], count: 1 });

      const res = await wardService.getBeds({ ward: 2 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/beds/');
    });
  });

  describe('createBed', () => {
    it('posts new bed', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, bed_number: 'B-001' });

      const res = await wardService.createBed({ ward: 1, bed_number: 'B-001' });
      expect(res.bed_number).toBe('B-001');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/beds/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getAssignments', () => {
    it('fetches ward assignments', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1 }], count: 1 });

      const res = await wardService.getAssignments({ admission: 5 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/assignments/');
    });
  });

  describe('createAssignment', () => {
    it('posts new assignment', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, admission: 5, nurse: 3 });

      const res = await wardService.createAssignment({
        admission: 5,
        nurse: 3,
        assignment_type: 'primary',
      });
      expect(res.nurse).toBe(3);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/assignments/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
