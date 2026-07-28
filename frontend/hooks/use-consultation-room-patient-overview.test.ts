// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockMapClinicalOverview = vi.fn(() => ({
  consultations: [],
  labResults: [],
  imagingOrders: [],
  prescriptions: [],
  vitals: [],
  physioOrders: [],
  eyeOrders: [],
  wardAdmissions: [],
  certificates: [],
  referrals: [],
  clinicalDocuments: [],
  medicalHistory: null,
  visits: [],
  annualCheckups: [],
}));
const mockMedicalHistoryForm = vi.fn(() => ({}));

vi.mock('@/lib/clinical-overview-utils', () => ({
  mapClinicalOverviewToPatientHistory: (...args: unknown[]) =>
    mockMapClinicalOverview(...(args as Parameters<typeof mockMapClinicalOverview>)),
  medicalHistoryFormFromRecord: (...args: unknown[]) =>
    mockMedicalHistoryForm(...(args as Parameters<typeof mockMedicalHistoryForm>)),
}));

const mockGetClinicalOverview = vi.fn(() => Promise.resolve({
  ward_admissions: { results: [] },
  vitals: { results: [] },
  medical_history: null,
}));

vi.mock('@/lib/services', () => ({
  patientService: {
    getClinicalOverview: (...args: unknown[]) =>
      mockGetClinicalOverview(...(args as Parameters<typeof mockGetClinicalOverview>)),
  },
}));
vi.mock('@/lib/consultation/room-helpers', () => ({
  processVitals: vi.fn((v: any) => v),
}));

import { useConsultationRoomPatientOverview } from './use-consultation-room-patient-overview';

describe('useConsultationRoomPatientOverview', () => {
  const createArgs = () => ({
    setWardAdmissions: vi.fn(),
    setPatientHistorySnapshot: vi.fn(),
    setMedicalHistory: vi.fn(),
    setCurrentPatient: vi.fn(),
  });

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns applyPatientOverview and loadPatientOverview', () => {
    const { result } = renderHook(() => useConsultationRoomPatientOverview(createArgs()));
    expect(typeof result.current.applyPatientOverview).toBe('function');
    expect(typeof result.current.loadPatientOverview).toBe('function');
  });

  it('applyPatientOverview calls setters with mapped data', () => {
    const args = createArgs();
    const { result } = renderHook(() => useConsultationRoomPatientOverview(args));
    const overview = { ward_admissions: { results: [{ id: 1 }] }, vitals: { results: [] }, medical_history: null };
    act(() => { result.current.applyPatientOverview(overview as any); });
    expect(args.setWardAdmissions).toHaveBeenCalledWith([{ id: 1 }]);
    expect(mockMapClinicalOverview).toHaveBeenCalledWith(overview);
    expect(args.setPatientHistorySnapshot).toHaveBeenCalled();
  });

  it('loadPatientOverview fetches and applies', async () => {
    const args = createArgs();
    const { result } = renderHook(() => useConsultationRoomPatientOverview(args));
    await act(async () => { await result.current.loadPatientOverview(42); });
    expect(mockGetClinicalOverview).toHaveBeenCalledWith(42);
    expect(args.setWardAdmissions).toHaveBeenCalled();
  });

  it('loadPatientOverview handles error gracefully', async () => {
    mockGetClinicalOverview.mockRejectedValueOnce(new Error('Network'));
    const args = createArgs();
    const { result } = renderHook(() => useConsultationRoomPatientOverview(args));
    await act(async () => { await result.current.loadPatientOverview(99); });
    expect(args.setWardAdmissions).toHaveBeenCalledWith([]);
    expect(args.setPatientHistorySnapshot).toHaveBeenCalledWith(null);
  });
});
