import { buildCompletedAtApiRange } from '@/lib/utils/completed-session-filters';

export type CompletedSessionStats = {
  total: number;
  withDiagnosis: number;
  urgent: number;
  withFindings: number;
};

export type CompletedSessionListParams = {
  status: 'completed';
  search?: string;
  completed_after?: string;
  completed_before?: string;
  page?: number;
  page_size?: number;
  ordering?: string;
  has_diagnosis?: boolean;
  has_findings?: boolean;
  is_urgent?: boolean;
  has_recommendations?: boolean;
};

/** Apply preset/custom date range; search no longer widens to all-time. */
export function buildCompletedSessionQueryParams(options: {
  debouncedSearch: string;
  dateFilter: string;
  dateRange: { from: string; to: string };
  currentPage: number;
  itemsPerPage: number;
}): CompletedSessionListParams {
  const completedRange = buildCompletedAtApiRange(options.dateFilter, options.dateRange);

  return {
    status: 'completed',
    search: options.debouncedSearch.trim() || undefined,
    ...completedRange,
    page: options.currentPage,
    page_size: options.itemsPerPage,
    ordering: '-completed_at',
  };
}

export type CompletedSessionListResponse<T> = {
  results: T[];
  count: number;
  completed_stats?: CompletedSessionStats;
};

/** Prefer stats embedded in the list response; fall back to a separate stats call. */
export async function fetchCompletedSessionStats(
  getCompletedStats: (
    params: Omit<
      CompletedSessionListParams,
      'page' | 'page_size' | 'status' | 'ordering'
    >,
  ) => Promise<CompletedSessionStats>,
  base: Omit<CompletedSessionListParams, 'page' | 'page_size' | 'has_diagnosis' | 'has_findings' | 'is_urgent' | 'has_recommendations'>,
  embedded?: CompletedSessionStats,
): Promise<CompletedSessionStats> {
  if (embedded) {
    return embedded;
  }
  return getCompletedStats(base);
}
