import { describe, expect, it, vi } from 'vitest';

const mockAnalyticsRange = vi.fn();
let mockServerToday = '2026-06-16';

vi.mock('react', () => ({
  useMemo: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock('@/components/providers/ServerDateProvider', () => ({
  useServerDateAnchor: vi.fn(() => mockServerToday),
}));

vi.mock('@/lib/dates', () => ({
  analyticsRangeFromFilters: (...args: any[]) => mockAnalyticsRange(...args),
}));

import { useReportDateRange } from './use-report-date-range';

describe('useReportDateRange', () => {
  it('passes all arguments through to analyticsRangeFromFilters', () => {
    mockAnalyticsRange.mockReturnValue({ start: '2026-01-01', end: '2026-01-31' });
    const result = useReportDateRange('monthly', '2026', '', '');
    expect(mockAnalyticsRange).toHaveBeenCalledWith('monthly', '2026', '', '', '2026-06-16');
    expect(result).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('returns null when analyticsRangeFromFilters returns null', () => {
    mockAnalyticsRange.mockReturnValue(null);
    const result = useReportDateRange('range', '2026', '', '');
    expect(result).toBeNull();
  });

  it('uses current server today from provider', () => {
    mockServerToday = '2025-12-31';
    mockAnalyticsRange.mockReturnValue({ start: '2025-01-01', end: '2025-12-31' });
    useReportDateRange('year', '2025', '', '');
    expect(mockAnalyticsRange).toHaveBeenCalledWith('year', '2025', '', '', '2025-12-31');
  });
});
