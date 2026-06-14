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

/** Match lab completed: search widens date to all-time; otherwise apply preset/custom range. */
export function buildCompletedSessionQueryParams(options: {
  debouncedSearch: string;
  dateFilter: string;
  dateRange: { from: string; to: string };
  currentPage: number;
  itemsPerPage: number;
}): CompletedSessionListParams {
  const searching = Boolean(options.debouncedSearch.trim());
  const effectiveDateFilter = searching || options.dateFilter === 'all' ? 'all' : options.dateFilter;
  const completedRange = buildCompletedAtApiRange(
    effectiveDateFilter,
    searching ? { from: '', to: '' } : options.dateRange,
  );

  return {
    status: 'completed',
    search: options.debouncedSearch.trim() || undefined,
    ...completedRange,
    page: options.currentPage,
    page_size: options.itemsPerPage,
    ordering: '-completed_at',
  };
}

/** Single-request completed-session stats (preferred over parallel COUNT calls). */
export async function fetchCompletedSessionStats(
  getCompletedStats: (
    params: Omit<
      CompletedSessionListParams,
      'page' | 'page_size' | 'status' | 'ordering'
    >,
  ) => Promise<CompletedSessionStats>,
  base: Omit<CompletedSessionListParams, 'page' | 'page_size' | 'has_diagnosis' | 'has_findings' | 'is_urgent' | 'has_recommendations'>,
): Promise<CompletedSessionStats> {
  return getCompletedStats(base);
}
