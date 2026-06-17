import { afterEach, describe, expect, it, vi } from 'vitest';

let capturedLoadCallback: (() => Promise<void>) | null = null;
const mockSetLocations = vi.fn();
const mockSetLoading = vi.fn();
const mockSetError = vi.fn();
const mockGetClinics = vi.fn();

vi.mock('react', () => ({
  useState: vi.fn((init: unknown) => {
    if (Array.isArray(init)) return [init, mockSetLocations];
    if (init === true) return [true, mockSetLoading];
    if (init === null) return [null, mockSetError];
    return [init, vi.fn()];
  }),
  useEffect: vi.fn((cb: () => void) => { cb(); }),
  useCallback: vi.fn((fn: any) => {
    capturedLoadCallback = fn;
    return fn;
  }),
}));

vi.mock('@/lib/services', () => ({
  adminService: {
    getClinics: (...args: any[]) => mockGetClinics(...args),
  },
}));

vi.mock('@/lib/pagination-constants', () => ({
  MAX_LIST_PAGE_SIZE: 999,
}));

import { useLocationOptions } from './use-location-options';

describe('useLocationOptions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the expected shape', () => {
    mockGetClinics.mockResolvedValue({ results: [] });
    const result = useLocationOptions();
    expect(result).toHaveProperty('locations');
    expect(result).toHaveProperty('loading');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('refetch');
  });

  it('maps clinics to LocationOption format on successful fetch', async () => {
    mockGetClinics.mockResolvedValue({
      results: [
        { id: 1, name: 'Main', location: 'Floor 1' },
        { id: 2, name: 'Branch', location: '' },
      ],
    });

    const result = useLocationOptions();
    if (capturedLoadCallback) {
      await capturedLoadCallback();
    }

    expect(mockSetLocations).toHaveBeenCalled();
    const lastCall = mockSetLocations.mock.calls.at(-1)?.[0];
    if (Array.isArray(lastCall)) {
      expect(lastCall).toHaveLength(2);
      expect(lastCall[0]).toEqual({ value: 'Main', label: 'Main • Floor 1', id: 1 });
      expect(lastCall[1]).toEqual({ value: 'Branch', label: 'Branch', id: 2 });
    }
  });

  it('prepends "All Locations" when includeAll is true', async () => {
    mockGetClinics.mockResolvedValue({
      results: [{ id: 1, name: 'Clinic A', location: '' }],
    });

    useLocationOptions({ includeAll: true });
    if (capturedLoadCallback) {
      await capturedLoadCallback();
    }

    const allCalls = mockSetLocations.mock.calls;
    const withAll = allCalls.find(
      (c) => Array.isArray(c[0]) && c[0].length > 0 && c[0][0]?.value === 'all',
    );
    expect(withAll).toBeTruthy();
  });

  it('sets error on failed fetch', async () => {
    mockGetClinics.mockRejectedValue(new Error('Network error'));

    useLocationOptions();
    if (capturedLoadCallback) {
      await capturedLoadCallback();
    }

    expect(mockSetError).toHaveBeenCalledWith('Network error');
    expect(mockSetLocations).toHaveBeenCalledWith([]);
  });
});
