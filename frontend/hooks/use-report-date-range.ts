"use client";

import { useMemo } from "react";
import { useServerDateAnchor } from "@/components/providers/ServerDateProvider";
import {
  analyticsRangeFromFilters,
  type AnalyticsViewMode,
} from "@/lib/dates";

/** Resolved API date range for report/analytics filters (server calendar). */
export function useReportDateRange(
  viewMode: AnalyticsViewMode | string,
  year: string,
  startDate: string,
  endDate: string
): { start: string; end: string } | null {
  const serverToday = useServerDateAnchor();
  return useMemo(
    () =>
      analyticsRangeFromFilters(
        viewMode as AnalyticsViewMode,
        year,
        startDate,
        endDate,
        serverToday
      ),
    [viewMode, year, startDate, endDate, serverToday]
  );
}
