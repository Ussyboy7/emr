import { useCallback } from 'react';
import {
  buildWardAdmissionDateParams,
  type WardDateFilterState,
} from '@/lib/ward/ward-admission-list-params';

/** Shared date-filter query params for Ward Rounds and Ward Care admission lists. */
export function useWardAdmissionDateParams(state: WardDateFilterState) {
  const { dateFilter, dateRange: { from, to }, serverToday } = state;
  return useCallback(
    () => buildWardAdmissionDateParams({ dateFilter, dateRange: { from, to }, serverToday }),
    [dateFilter, from, to, serverToday],
  );
}
