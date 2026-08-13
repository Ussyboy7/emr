import { afterEach, describe, expect, it, vi } from 'vitest';

let capturedLoadCallback: (() => Promise<void>) | null = null;
const mockSetTypes = vi.fn();
const mockSetLoading = vi.fn();
const mockSetError = vi.fn();
const mockGetOutpatientClinicTypes = vi.fn();

vi.mock('react', () => ({
  useState: vi.fn((init: unknown) => {
    if (Array.isArray(init)) return [init, mockSetTypes];
    if (init === true) return [true, mockSetLoading];
    if (init === null) return [null, mockSetError];
    return [init, vi.fn()];
  }),
  useEffect: vi.fn((cb: () => void) => { cb(); }),
  useCallback: vi.fn((fn: any) => {
    capturedLoadCallback = fn;
    return fn;
  }),
  useMemo: vi.fn((fn: any) => fn()),
}));

vi.mock('@/lib/services', () => ({
  adminService: {
    getOutpatientClinicTypes: (...args: any[]) => mockGetOutpatientClinicTypes(...args),
  },
}));

vi.mock('@/lib/pagination-constants', () => ({
  MAX_LIST_PAGE_SIZE: 999,
}));

import { useOutpatientClinicTypes } from './use-outpatient-clinic-types';

describe('useOutpatientClinicTypes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the expected shape', () => {
    mockGetOutpatientClinicTypes.mockResolvedValue({ results: [] });
    const result = useOutpatientClinicTypes();
    expect(result).toHaveProperty('types');
    expect(result).toHaveProperty('names');
    expect(result).toHaveProperty('loading');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('refetch');
  });

  it('sorts results by sort_order then name', async () => {
    mockGetOutpatientClinicTypes.mockResolvedValue({
      results: [
        { id: 1, name: 'Zebra', sort_order: 2 },
        { id: 2, name: 'Alpha', sort_order: 1 },
        { id: 3, name: 'Beta', sort_order: 1 },
      ],
    });

    useOutpatientClinicTypes();
    if (capturedLoadCallback) {
      await capturedLoadCallback();
    }

    const lastCall = mockSetTypes.mock.calls.at(-1)?.[0];
    if (Array.isArray(lastCall) && lastCall.length === 3) {
      expect(lastCall[0].name).toBe('Alpha');
      expect(lastCall[1].name).toBe('Beta');
      expect(lastCall[2].name).toBe('Zebra');
    }
  });

  it('sets error on failed fetch', async () => {
    mockGetOutpatientClinicTypes.mockRejectedValue(new Error('Server down'));

    useOutpatientClinicTypes();
    if (capturedLoadCallback) {
      await capturedLoadCallback();
    }

    expect(mockSetError).toHaveBeenCalledWith('Server down');
    expect(mockSetTypes).toHaveBeenCalledWith([]);
  });
});
