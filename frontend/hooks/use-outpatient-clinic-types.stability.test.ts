// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/services', () => ({
  adminService: {
    getOutpatientClinicTypes: vi.fn(),
  },
}));

vi.mock('@/lib/pagination-constants', () => ({
  MAX_LIST_PAGE_SIZE: 999,
}));

import { useOutpatientClinicTypes } from './use-outpatient-clinic-types';
import { adminService } from '@/lib/services';

describe('useOutpatientClinicTypes names stability', () => {
  beforeEach(() => {
    vi.mocked(adminService.getOutpatientClinicTypes).mockResolvedValue({
      results: [{ id: 1, name: 'GOPD', sort_order: 1 }],
    } as never);
  });

  it('keeps the same names array reference across re-renders while types are unchanged', async () => {
    const { result, rerender } = renderHook(() => useOutpatientClinicTypes());

    await waitFor(() => {
      expect(result.current.names).toEqual(['GOPD']);
    });

    const firstRef = result.current.names;
    rerender();
    rerender();
    expect(result.current.names).toBe(firstRef);
  });
});
