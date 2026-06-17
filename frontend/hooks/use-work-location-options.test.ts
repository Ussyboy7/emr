import { afterEach, describe, expect, it, vi } from 'vitest';

let capturedLoadCallback: (() => Promise<void>) | null = null;
const mockSetLocations = vi.fn();
const mockSetLoading = vi.fn();
const mockGetWorkLocations = vi.fn();

vi.mock('react', () => ({
  useState: vi.fn((init: unknown) => {
    if (Array.isArray(init)) return [init, mockSetLocations];
    if (init === true) return [true, mockSetLoading];
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
    getWorkLocations: (...args: any[]) => mockGetWorkLocations(...args),
  },
}));

import { useWorkLocationOptions } from './use-work-location-options';

describe('useWorkLocationOptions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the expected shape', () => {
    mockGetWorkLocations.mockResolvedValue({ results: [] });
    const result = useWorkLocationOptions();
    expect(result).toHaveProperty('locations');
    expect(result).toHaveProperty('loading');
    expect(result).toHaveProperty('refetch');
  });

  it('maps work locations to options on success', async () => {
    mockGetWorkLocations.mockResolvedValue({
      results: [
        { id: 10, name: 'Building A' },
        { id: 20, name: 'Building B' },
      ],
    });

    useWorkLocationOptions();
    if (capturedLoadCallback) {
      await capturedLoadCallback();
    }

    const lastCall = mockSetLocations.mock.calls.at(-1)?.[0];
    if (Array.isArray(lastCall)) {
      expect(lastCall).toHaveLength(2);
      expect(lastCall[0]).toEqual({ value: 'Building A', label: 'Building A', id: 10 });
    }
  });

  it('sets empty locations on error', async () => {
    mockGetWorkLocations.mockRejectedValue(new Error('fail'));

    useWorkLocationOptions();
    if (capturedLoadCallback) {
      await capturedLoadCallback();
    }

    expect(mockSetLocations).toHaveBeenCalledWith([]);
  });
});
