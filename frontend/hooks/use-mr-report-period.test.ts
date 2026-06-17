// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/components/providers/ServerDateProvider', () => ({
  useServerDateAnchor: vi.fn(() => new Date('2024-06-15')),
}));
vi.mock('@/lib/dates', () => ({
  analyticsPeriodLabel: vi.fn(() => 'All Time'),
}));
vi.mock('@/lib/report-period-query', () => ({
  canFetchReportPeriod: vi.fn(() => true),
  mergeReportPeriodQuery: vi.fn((_vm: string, _rr: any, extra?: any) => ({ ...extra })),
  reportPeriodFilenameSuffix: vi.fn(() => '_all'),
}));
vi.mock('@/hooks/use-report-date-range', () => ({
  useReportDateRange: vi.fn(() => ({ start: '2024-01-01', end: '2024-12-31' })),
}));

import { useMrReportPeriod } from './use-mr-report-period';

describe('useMrReportPeriod', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns initial state with default viewMode "all"', () => {
    const { result } = renderHook(() => useMrReportPeriod());
    expect(result.current.viewMode).toBe('all');
    expect(result.current.startDate).toBe('');
    expect(result.current.endDate).toBe('');
    expect(result.current.canFetch).toBe(true);
    expect(result.current.periodLabel).toBe('All Time');
  });

  it('setYear updates year state', () => {
    const { result } = renderHook(() => useMrReportPeriod());
    act(() => { result.current.setYear('2023'); });
    expect(result.current.year).toBe('2023');
  });

  it('setViewMode updates view mode', () => {
    const { result } = renderHook(() => useMrReportPeriod());
    act(() => { result.current.setViewMode('monthly'); });
    expect(result.current.viewMode).toBe('monthly');
  });

  it('buildQuery returns merged query params', () => {
    const { result } = renderHook(() => useMrReportPeriod());
    const query = result.current.buildQuery({ extra: 'val' });
    expect(query).toEqual({ extra: 'val' });
  });

  it('years array contains current year', () => {
    const { result } = renderHook(() => useMrReportPeriod());
    expect(result.current.years).toContain(new Date().getFullYear().toString());
    expect(result.current.years.length).toBe(10);
  });
});
