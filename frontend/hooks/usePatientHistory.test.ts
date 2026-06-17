// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockOverview = { consultations: [], vitals: { results: [] } };
const mockMappedHistory = {
  consultations: [{ id: 1 }],
  labResults: [],
  imagingOrders: [],
  prescriptions: [],
  vitals: [],
  physioOrders: [],
  eyeOrders: [],
  wardAdmissions: [],
  certificates: [],
  referrals: [],
  medicalHistory: null,
  visits: [],
  annualCheckups: [],
};

vi.mock('@/lib/services', () => ({
  patientService: {
    getClinicalOverview: vi.fn(() => Promise.resolve(mockOverview)),
  },
}));
vi.mock('@/lib/clinical-overview-utils', () => ({
  mapClinicalOverviewToPatientHistory: vi.fn(() => mockMappedHistory),
}));

import { usePatientHistory } from './usePatientHistory';
import { patientService } from '@/lib/services';

describe('usePatientHistory', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty data when patientId is null', () => {
    const { result } = renderHook(() => usePatientHistory(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.data.consultations).toEqual([]);
  });

  it('loads data when patientId is provided', async () => {
    const { result } = renderHook(() => usePatientHistory(42));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(patientService.getClinicalOverview).toHaveBeenCalledWith(42);
    expect(result.current.data.consultations).toEqual([{ id: 1 }]);
  });

  it('reload triggers another fetch', async () => {
    const { result } = renderHook(() => usePatientHistory(10));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(patientService.getClinicalOverview).mockClear();
    await act(async () => { result.current.reload(); });
    expect(patientService.getClinicalOverview).toHaveBeenCalledWith(10);
  });
});
