import { MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";

type PaginatedResponse<T> = {
  results: T[];
  count?: number;
  next?: string | null;
};

/**
 * Fetch every page of a paginated list API (up to maxPages) so client-side
 * filters are not silently truncated at page_size.
 */
export async function fetchAllPaginatedResults<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>,
  options?: { pageSize?: number; maxPages?: number }
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
    if (typeof res.count === "number") total = res.count;
    if (batch.length < pageSize) break;
    if (total != null && all.length >= total) break;
    page += 1;
  }

  return all;
}
