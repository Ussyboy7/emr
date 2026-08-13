// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), message: vi.fn() } }));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/consultation/room-helpers', () => ({ debugConsultationRoom: vi.fn() }));
vi.mock('@/lib/consultation/prescription-refill', () => ({
  localDraftToOrderInput: vi.fn(),
}));
vi.mock('@/lib/consultation/orders-utils', () => ({
  buildInjectionOrderSummary: vi.fn(() => ({ medication: '', dosage: '', route: '', instructions: '' })),
  buildLabDraftOrders: vi.fn(() => ({ orders: [], error: null })),
  buildLabOrderPayloadFromDrafts: vi.fn(() => ({ priority: 'Routine', clinical_notes: '', tests_data: [] })),
  buildRadiologyDraftOrders: vi.fn(() => ({ orders: [], error: null })),
  buildRadiologyOrderPayloadFromDrafts: vi.fn(() => ({ priority: 'Routine', studies_data: [], clinical_notes: '' })),
  buildPrescriptionDrafts: vi.fn(() => ({ drafts: [], rejectedLabels: [] })),
  buildPhysioCreateOrderPayloads: vi.fn(() => []),
  buildEyeCreateOrderPayloads: vi.fn(() => []),
}));
vi.mock('@/lib/constants/medical-data', () => ({
  INJECTION_ROUTES: ['IM', 'IV'],
  DEFAULT_INJECTION_ROUTE: 'IM',
  REFERRAL_REASONS: ['Further evaluation'],
  REFERRAL_SPECIALTIES: ['Cardiology'],
}));
vi.mock('@/lib/constants/order-template-codes', () => ({
  LAB_OTHER_TEMPLATE_CODE: 'OTHER',
  RAD_OTHER_TEMPLATE_CODE: 'RAD_OTHER',
}));
vi.mock('@/lib/pagination-constants', () => ({
  CATALOG_SEARCH_PAGE_SIZE: 20,
  MAX_LIST_PAGE_SIZE: 200,
}));
vi.mock('@/lib/auth-errors', () => ({ isAuthenticationError: vi.fn(() => false) }));
vi.mock('@/lib/utils/patient-id', () => ({ resolvePatientNumericId: vi.fn((id: string) => parseInt(id)) }));
vi.mock('@/lib/utils/clinic-utils', () => ({
  getVisitServiceClinicsList: vi.fn(() => []),
  normalizeClinicName: vi.fn((n: string) => n),
}));

vi.mock('@/lib/services', () => ({
  consultationService: {
    getICD10Codes: vi.fn(() => Promise.resolve({ results: [] })),
    getSession: vi.fn(() => Promise.resolve({ visit: 1 })),
  },
  labService: {
    getTemplates: vi.fn(() => Promise.resolve({ results: [] })),
    resolveTemplateByCode: vi.fn(() => Promise.resolve(null)),
    createOrder: vi.fn(() => Promise.resolve({})),
  },
  radiologyService: {
    getTemplates: vi.fn(() => Promise.resolve({ results: [] })),
    resolveTemplateByCode: vi.fn(() => Promise.resolve(null)),
    createOrder: vi.fn(() => Promise.resolve({})),
  },
  pharmacyService: {
    createPrescription: vi.fn(() => Promise.resolve({ id: 1 })),
    cancelPrescription: vi.fn(() => Promise.resolve({})),
    getGenericsForPrescription: vi.fn(() => Promise.resolve({ results: [] })),
  },
  referralService: { createReferral: vi.fn(() => Promise.resolve({})) },
  visitService: { resolveVisit: vi.fn(() => Promise.resolve({ id: 1 })) },
  wardService: {
    getWards: vi.fn(() => Promise.resolve({ results: [] })),
    getAdmissions: vi.fn(() => Promise.resolve({ results: [] })),
    createAdmission: vi.fn(() => Promise.resolve({})),
  },
  physioService: {
    getOrders: vi.fn(() => Promise.resolve({ results: [] })),
    createOrder: vi.fn(() => Promise.resolve({})),
  },
  eyeCareService: {
    getOrders: vi.fn(() => Promise.resolve({ results: [] })),
    createOrder: vi.fn(() => Promise.resolve({})),
  },
}));

import { useConsultationRoomOrders } from './use-consultation-room-orders';
import { toast } from 'sonner';

const baseArgs = {
  currentPatient: null,
  sessionId: null,
  activeTab: 'orders',
  opdClinicNames: ['Main OPD'],
  onReferralCreated: vi.fn(),
  medicalNotesAssessment: '',
  loadPatientOverview: vi.fn(),
};

describe('useConsultationRoomOrders', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns initial empty state', () => {
    const { result } = renderHook(() => useConsultationRoomOrders(baseArgs));
    expect(result.current.diagnoses).toEqual([]);
    expect(result.current.prescriptions).toEqual([]);
    expect(result.current.labOrders).toEqual([]);
    expect(result.current.nursingOrders).toEqual([]);
    expect(result.current.radiologyOrders).toEqual([]);
  });

  it('resetOrderWorkspace clears all orders', () => {
    const { result } = renderHook(() => useConsultationRoomOrders(baseArgs));
    act(() => { result.current.setDiagnoses([{ id: 1 } as any]); });
    expect(result.current.diagnoses).toHaveLength(1);
    act(() => { result.current.resetOrderWorkspace(); });
    expect(result.current.diagnoses).toEqual([]);
  });

  it('sendPrescriptionsToPharmacy shows error when no prescriptions', async () => {
    const { result } = renderHook(() => useConsultationRoomOrders(baseArgs));
    await act(async () => { await result.current.sendPrescriptionsToPharmacy(); });
    expect(toast.error).toHaveBeenCalledWith('No prescriptions to send');
  });

  it('sendLabOrdersToLab shows info when no drafts', async () => {
    const { result } = renderHook(() => useConsultationRoomOrders(baseArgs));
    await act(async () => { await result.current.sendLabOrdersToLab(); });
    expect(toast.info).toHaveBeenCalledWith('No draft lab orders to send');
  });

  it('sendRadiologyOrders shows info when no drafts', async () => {
    const { result } = renderHook(() => useConsultationRoomOrders(baseArgs));
    await act(async () => { await result.current.sendRadiologyOrders(); });
    expect(toast.info).toHaveBeenCalledWith('No draft radiology orders to send');
  });

  it('exposes observation defaults derived from session notes', () => {
    const { result } = renderHook(() =>
      useConsultationRoomOrders({ ...baseArgs, medicalNotesComplaint: 'Fever' })
    );
    act(() => {
      result.current.setDiagnoses([
        {
          id: 1,
          certainty: 'confirmed',
          icd10_code_details: { code: 'R50', description: 'Fever' },
          diagnosis_text: 'Fever',
        } as any,
        {
          id: 2,
          certainty: 'possible',
          icd10_code_details: { code: 'B34', description: 'Viral infection' },
          diagnosis_text: '',
        } as any,
      ]);
    });
    expect(result.current.orderDialogsWorkspace.observationDefaults).toEqual({
      admissionDiagnosis: 'Fever',
      presentingComplaint: 'Fever',
    });
  });

  it('blocks observation admission when diagnosis/complaint notes are incomplete', () => {
    const { result } = renderHook(() =>
      useConsultationRoomOrders({
        ...baseArgs,
        currentPatient: { id: '1', visitId: '1', name: 'Ada' } as any,
        sessionId: 1,
        medicalNotesComplaint: '',
      })
    );
    act(() => {
      result.current.orderDialogsWorkspace.setNewNursingOrder({
        type: 'Observation Admission',
        medication: '',
        dosage: '',
        route: 'IM',
        woundLocation: '',
        woundType: '',
        instructions: 'Observe vitals hourly',
        priority: 'Routine',
        ward: '1',
        admissionDiagnoses: [],
        presentingComplaint: '',
      });
    });
    act(() => { result.current.orderDialogsWorkspace.addNursingOrder(); });
    expect(toast.error).toHaveBeenCalledWith(
      'Complete Medical Notes first: a primary diagnosis and presenting complaint are required before creating an observation admission.'
    );
    expect(result.current.nursingOrders).toEqual([]);
  });

  it('builds observation admission draft from complete session notes', () => {
    const { result } = renderHook(() =>
      useConsultationRoomOrders({
        ...baseArgs,
        currentPatient: { id: '1', visitId: '1', name: 'Ada' } as any,
        sessionId: 1,
        medicalNotesComplaint: 'Chest pain',
      })
    );
    act(() => {
      result.current.setDiagnoses([
        {
          id: 1,
          certainty: 'confirmed',
          icd10_code_details: { code: 'I10', description: 'Hypertension' },
          diagnosis_text: 'Hypertension',
        } as any,
      ]);
      result.current.orderDialogsWorkspace.setNewNursingOrder({
        type: 'Observation Admission',
        medication: '',
        dosage: '',
        route: 'IM',
        woundLocation: '',
        woundType: '',
        instructions: 'Monitor and reassess',
        priority: 'Routine',
        ward: '2',
        admissionDiagnoses: [],
        presentingComplaint: '',
      });
    });
    act(() => { result.current.orderDialogsWorkspace.addNursingOrder(); });
    expect(result.current.nursingOrders).toHaveLength(1);
    expect(result.current.nursingOrders[0].type).toBe('Observation Admission');
    expect(result.current.nursingOrders[0].ward).toBe('2');
    expect(result.current.nursingOrders[0].admissionDiagnoses).toEqual([
      { type: 'Primary', code: 'I10', description: 'Hypertension' },
    ]);
    expect(result.current.nursingOrders[0].presentingComplaint).toBe('Chest pain');
  });
});
