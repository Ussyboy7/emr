// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/services', () => ({
  pharmacyService: { createPrescription: vi.fn(() => Promise.resolve({ id: 1 })) },
  labService: { createOrder: vi.fn(() => Promise.resolve({ id: 1 })) },
  radiologyService: { createOrder: vi.fn(() => Promise.resolve({ id: 1 })) },
  physioService: { createOrder: vi.fn(() => Promise.resolve({ id: 1 })) },
  eyeCareService: { createOrder: vi.fn(() => Promise.resolve({ id: 1 })) },
  referralService: { createReferral: vi.fn(() => Promise.resolve({ id: 1 })) },
}));

import { useWardOrders } from './use-ward-orders';
import { toast } from 'sonner';
import {
  pharmacyService,
  labService,
  radiologyService,
  physioService,
  eyeCareService,
  referralService,
} from '@/lib/services';

const admission = {
  id: 7,
  admission_id: 'ADM-7',
  ward_name: 'Male Ward',
  admission_date: '2026-08-01',
  admission_type: 'inpatient',
  status: 'admitted',
} as const;

describe('useWardOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the saving flag (initially false)', () => {
    const { result } = renderHook(() => useWardOrders({ admission }));
    expect(result.current.saving).toBe(false);
  });

  it('createPrescription stamps visit/patient/admission and omits consultation_session', async () => {
    const onChanged = vi.fn();
    const { result } = renderHook(() =>
      useWardOrders({ admission, visitId: 11, patientId: 3, onChanged }),
    );
    let returned = false;
    await act(async () => {
      returned = await result.current.createPrescription({ items: [] });
    });
    expect(returned).toBe(true);
    expect(pharmacyService.createPrescription).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(pharmacyService.createPrescription).mock
      .calls[0][0] as unknown as Record<string, unknown>;
    expect(payload.admission).toBe(7);
    expect(payload.visit).toBe(11);
    expect(payload.patient).toBe(3);
    expect(payload).not.toHaveProperty('consultation_session');
    expect(toast.success).toHaveBeenCalledWith('Prescription placed');
    expect(onChanged).toHaveBeenCalled();
  });

  const stampedCreators: Array<[string, (...args: any[]) => Promise<unknown>, string]> = [
    ['createLab', labService.createOrder, 'Lab'],
    ['createRadiology', radiologyService.createOrder, 'Radiology'],
    ['createPhysio', physioService.createOrder, 'Physio'],
    ['createEye', eyeCareService.createOrder, 'Eye'],
    ['createReferral', referralService.createReferral, 'Referral'],
  ];

  it.each(stampedCreators)(
    '%s stamps the admission-scoped payload',
    async (name, service, label) => {
      const { result } = renderHook(() =>
        useWardOrders({ admission, visitId: 11, patientId: 3 }),
      );
      let returned = false;
      await act(async () => {
        returned = await (result.current as any)[name]({ notes: 'ward round' });
      });
      expect(returned).toBe(true);
      expect(service).toHaveBeenCalledTimes(1);
      const payload = vi.mocked(service).mock.calls[0][0];
      expect(payload.admission).toBe(7);
      expect(payload.visit).toBe(11);
      expect(payload.patient).toBe(3);
      expect(payload).not.toHaveProperty('consultation_session');
      expect(toast.success).toHaveBeenCalledWith(`${label} placed`);
    },
  );

  it('returns false and toasts an error when the service call rejects', async () => {
    vi.mocked(pharmacyService.createPrescription).mockRejectedValueOnce(new Error('boom'));
    const onChanged = vi.fn();
    const { result } = renderHook(() =>
      useWardOrders({ admission, visitId: 11, patientId: 3, onChanged }),
    );
    let returned = true;
    await act(async () => {
      returned = await result.current.createPrescription({ items: [] });
    });
    expect(returned).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Could not place prescription');
    expect(onChanged).not.toHaveBeenCalled();
  });
});
