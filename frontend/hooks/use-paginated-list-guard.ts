'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Guards paginated list fetches against filter/page races and stale responses.
 * Pattern: reset page ref + bump generation on filter change, then fetch using currentPageRef.
 */
export function usePaginatedListGuard(currentPage: number) {
  const currentPageRef = useRef(currentPage);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const invalidateInFlight = useCallback(() => {
    loadGenerationRef.current += 1;
  }, []);

  const resetToFirstPage = useCallback(() => {
    currentPageRef.current = 1;
    invalidateInFlight();
  }, [invalidateInFlight]);

  const beginLoad = useCallback(() => {
    const generation = ++loadGenerationRef.current;
    return () => generation !== loadGenerationRef.current;
  }, []);

  return {
    currentPageRef,
    resetToFirstPage,
    beginLoad,
  };
}

/** Ignore out-of-order async responses (analytics, non-paginated fetches). */
export function useStaleRequestGuard() {
  const loadGenerationRef = useRef(0);

  const beginLoad = useCallback(() => {
    const generation = ++loadGenerationRef.current;
    return () => generation !== loadGenerationRef.current;
  }, []);

  return { beginLoad };
}

/** Reset list pagination when filters change (run before the load effect). */
export function useResetPageOnFilterChange(
  resetToFirstPage: () => void,
  setCurrentPage: (page: number) => void,
  filterDeps: readonly unknown[],
) {
  useEffect(() => {
    resetToFirstPage();
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter-only deps by design
  }, filterDeps);
}
