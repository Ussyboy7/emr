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

export type DateQuery = { date?: string; start_date?: string; end_date?: string };

export const buildDateQuery = (dateFilter: string): DateQuery => {
  if (dateFilter === 'all') return {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yyyyMmDd = (d: Date) => d.toISOString().split('T')[0];
  if (dateFilter === 'today') return { date: yyyyMmDd(today) };
  if (dateFilter === 'week') {
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { start_date: yyyyMmDd(weekAgo), end_date: yyyyMmDd(today) };
  }
  if (dateFilter === 'month') {
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return { start_date: yyyyMmDd(monthAgo), end_date: yyyyMmDd(today) };
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
