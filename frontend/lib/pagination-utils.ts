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
