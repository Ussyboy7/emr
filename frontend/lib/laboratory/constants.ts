export const LAB_TEST_STATUS = {
  PENDING: 'Pending',
  SAMPLE_COLLECTED: 'Sample Collected',
  PROCESSING: 'Processing',
  RESULTS_READY: 'Results Ready',
  REJECTED: 'Rejected',
  VERIFIED: 'Verified',
} as const;

export const LAB_ORDER_STATUS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  PROCESSING: 'Processing',
  RESULTS_READY: 'Results Ready',
  REWORK_REQUIRED: 'Rework Required',
  COMPLETED: 'Completed',
} as const;

import { toApiDateString } from "@/lib/dates";

export type DateQuery = { date?: string; start_date?: string; end_date?: string };

export { toApiDateString as formatLocalYmd } from "@/lib/dates";

/**
 * Build the `date` / `start_date` / `end_date` query params for list/stats
 * endpoints.
 *
 * Pass `todayIso` (YYYY-MM-DD from the server) as the anchor for
 * "today / week / month" so the calendar matches the server's calendar,
 * not the client's device clock. Falls back to local date only if the
 * caller cannot supply a server anchor (initial render before the
 * `/common/server-time/` fetch resolves).
 */
export const buildDateQuery = (dateFilter: string, todayIso?: string): DateQuery => {
  if (dateFilter === 'all') return {};

  const anchor = todayIso
    ? new Date(`${todayIso}T00:00:00`) // parsed as local midnight of the server date
    : (() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      })();

  const anchorYmd = todayIso ?? toApiDateString(anchor);

  if (dateFilter === 'today') return { date: anchorYmd };
  if (dateFilter === 'week') {
    const weekAgo = new Date(anchor);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { start_date: toApiDateString(weekAgo), end_date: anchorYmd };
  }
  if (dateFilter === 'month') {
    const monthAgo = new Date(anchor);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return { start_date: toApiDateString(monthAgo), end_date: anchorYmd };
  }
  return {};
};

export const formatRejectionReason = (notes: string | undefined): string => {
  if (!notes) return '';
  return notes
    .replace(/^REJECTED:\s*/i, '')
    .replace(/^Rejection:\s*/i, '')
    .trim();
};
