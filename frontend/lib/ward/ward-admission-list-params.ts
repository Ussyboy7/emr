import { formatLocalYmd } from '@/lib/laboratory/constants';
import { localWeekToTodayBounds } from '@/lib/dates';

export const WARD_ACTIVE_STATUS_IN = 'admitted,pending_discharge,transferred';

export type WardDateFilterState = {
  dateFilter: string;
  dateRange: { from: string; to: string };
  serverToday: string | null;
};

/** Build admission list/KPI date query params shared by Ward Rounds and Ward Care. */
export function buildWardAdmissionDateParams({
  dateFilter,
  dateRange,
  serverToday,
}: WardDateFilterState): Record<string, string | undefined> {
  const today = serverToday ? new Date(`${serverToday}T00:00:00`) : new Date();
  const todayYmd = serverToday || formatLocalYmd(today);

  if (dateRange.from || dateRange.to) {
    return {
      admission_date_after: dateRange.from || undefined,
      admission_date_before: dateRange.to || undefined,
    };
  }
  if (dateFilter === 'today') return { admission_date: todayYmd };
  if (dateFilter === 'week') {
    const { start, end } = localWeekToTodayBounds(serverToday || undefined);
    return { admission_date_after: start, admission_date_before: end };
  }
  if (dateFilter === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { admission_date_after: formatLocalYmd(start), admission_date_before: todayYmd };
  }
  return {};
}
