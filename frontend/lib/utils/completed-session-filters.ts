/**
 * Completed session list: API query bounds for `completed_after` / `completed_before`
 * (django-filter IsoDateTimeFilter on `completed_at`).
 */
export function buildCompletedAtApiRange(
  dateFilter: string,
  dateRange: { from: string; to: string }
): { completed_after?: string; completed_before?: string } {
  if (dateRange.from || dateRange.to) {
    const out: { completed_after?: string; completed_before?: string } = {};
    if (dateRange.from) {
      const d = new Date(`${dateRange.from}T00:00:00`);
      out.completed_after = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
    }
    if (dateRange.to) {
      const d = new Date(`${dateRange.to}T00:00:00`);
      out.completed_before = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
    }
    return out;
  }
  if (dateFilter === 'all') return {};
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (dateFilter === 'today') {
    return { completed_after: startToday.toISOString(), completed_before: endToday.toISOString() };
  }
  if (dateFilter === 'week') {
    const weekAgo = new Date(startToday);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { completed_after: weekAgo.toISOString() };
  }
  if (dateFilter === 'month') {
    const monthAgo = new Date(startToday);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return { completed_after: monthAgo.toISOString() };
  }
  return {};
}

/** Start of the rolling 7-day window (local midnight, 7 days before today). */
export function rollingWeekStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 7);
  return d;
}

/** Current calendar month [start, end] in local time. */
export function calendarMonthBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}
