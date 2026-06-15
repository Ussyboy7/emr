// Shared page-size limits for list and catalog API queries.

/** Paginated operational lists (patients, orders, visits, etc.). */
export const DEFAULT_LIST_PAGE_SIZE = 50;
export const LIST_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const MAX_LIST_PAGE_SIZE = 100;

/** Reference catalogs (templates, ICD-10 search results). */
export const DEFAULT_CATALOG_PAGE_SIZE = 100;
export const CATALOG_SEARCH_PAGE_SIZE = 50;
export const MAX_CATALOG_PAGE_SIZE = 500;

/** Dashboard previews and single-row lookups. */
export const PREVIEW_PAGE_SIZE = 5;

/** Small recent-item lists (e.g. repeat nursing orders). */
export const RECENT_LIST_PAGE_SIZE = 8;
