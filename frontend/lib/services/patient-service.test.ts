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
import { patientService, formatPatientGenderLabel, sanitizePatientForRendering } from './patient-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('patientService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getPatients', () => {
    it('fetches patients list', async () => {
      const payload = { results: [{ id: 1, patient_id: 'PT-001' }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await patientService.getPatients({ page: 1, page_size: 10 });
      expect(res.results).toHaveLength(1);
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('/patients/');
    });

    it('passes search and filter params', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await patientService.getPatients({ search: 'John', category: 'employee', gender: 'male' });
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('search=John');
      expect(callArg).toContain('category=employee');
    });
  });

  describe('getPatientCounts', () => {
    it('fetches patient counts', async () => {
      const counts = { total: 100, employees: 60, retirees: 20, dependents: 15, nonnpa: 5 };
      mockApiFetch.mockResolvedValue(counts);

      const res = await patientService.getPatientCounts();
      expect(res.total).toBe(100);
      expect(mockApiFetch).toHaveBeenCalledWith('/patients/counts/');
    });
  });

  describe('getPatient', () => {
    it('fetches single patient by id', async () => {
      const patient = { id: 42, patient_id: 'PT-042', surname: 'Doe' };
      mockApiFetch.mockResolvedValue(patient);

      const res = await patientService.getPatient(42);
      expect(res.id).toBe(42);
      expect(mockApiFetch).toHaveBeenCalledWith('/patients/42/');
    });
  });

  describe('createPatient', () => {
    it('posts patient data', async () => {
      const newPatient = { id: 99, patient_id: 'PT-099' };
      mockApiFetch.mockResolvedValue(newPatient);

      const res = await patientService.createPatient({ surname: 'Test', first_name: 'User' } as any);
      expect(mockApiFetch).toHaveBeenCalledWith('/patients/', expect.objectContaining({ method: 'POST' }));
      expect(res.id).toBe(99);
    });
  });

  describe('updatePatient', () => {
    it('patches patient data', async () => {
      mockApiFetch.mockResolvedValue({ id: 42, surname: 'Updated' });

      await patientService.updatePatient(42, { surname: 'Updated' } as any);
      expect(mockApiFetch).toHaveBeenCalledWith('/patients/42/', expect.objectContaining({ method: 'PATCH' }));
    });
  });

  describe('deletePatient', () => {
    it('sends delete request', async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await patientService.deletePatient(42);
      expect(mockApiFetch).toHaveBeenCalledWith('/patients/42/', expect.objectContaining({ method: 'DELETE' }));
    });
  });
});

describe('formatPatientGenderLabel', () => {
  it('capitalizes known genders', () => {
    expect(formatPatientGenderLabel('male')).toBe('Male');
    expect(formatPatientGenderLabel('female')).toBe('Female');
  });

  it('handles empty or undefined', () => {
    expect(formatPatientGenderLabel('')).toBe('');
    expect(formatPatientGenderLabel(undefined as any)).toBe('');
  });
});

describe('sanitizePatientForRendering', () => {
  it('normalizes patient fields for rendering', () => {
    const patient = { id: 1, patient_id: 'PT-001', full_name: 'John Doe', gender: 'male', age: 30 };
    const result = sanitizePatientForRendering(patient as any);
    expect(result.patientId).toBe('PT-001');
    expect(result.name).toBe('John Doe');
    expect(result.gender).toBe('Male');
    expect(result.age).toBe(30);
  });

  it('throws on null input', () => {
    expect(() => sanitizePatientForRendering(null as any)).toThrow('Invalid patient data');
  });

  it('handles missing optional fields', () => {
    const patient = { id: 2 };
    const result = sanitizePatientForRendering(patient as any);
    expect(result.id).toBe('2');
    expect(result.name).toBe('');
    expect(result.mrn).toBe('');
  });
});
