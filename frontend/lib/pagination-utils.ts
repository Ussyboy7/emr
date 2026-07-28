import { apiFetch } from './api-client';
import { MAX_LIST_PAGE_SIZE } from './pagination-constants';

export interface PaginatedResponse<T> {
  results?: T[];
  count?: number;
  next?: string | null;
}

/** Fetch every page of a list endpoint (uses max allowed page size per request). */
export async function fetchAllPaginated<T>(
  path: string,
  pageSize = MAX_LIST_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await apiFetch<PaginatedResponse<T>>(
      `${path}${sep}page=${page}&page_size=${pageSize}`,
    );
    all.push(...(res.results ?? []));
    if (!res.next) break;
    page += 1;
  }
  return all;
}

/**
 * Fetch every page via a callback (up to maxPages) so client-side filters are
 * not silently truncated at page_size.
 */
export async function fetchAllPaginatedResults<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>,
  options?: { pageSize?: number; maxPages?: number },
): Promise<T[]> {
  const pageSize = options?.pageSize ?? MAX_LIST_PAGE_SIZE;
  const maxPages = options?.maxPages ?? 50;
  const all: T[] = [];
  let page = 1;
  let total: number | undefined;

  while (page <= maxPages) {
    const res = await fetchPage(page, pageSize);
    const batch = res.results ?? [];
    all.push(...batch);
    if (typeof res.count === 'number') total = res.count;
    if (batch.length < pageSize) break;
    if (total != null && all.length >= total) break;
    page += 1;
  }

  return all;
}
