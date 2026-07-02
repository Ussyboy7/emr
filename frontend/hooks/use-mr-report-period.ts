"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerDateAnchor } from "@/components/providers/ServerDateProvider";
import {
  analyticsPeriodLabel,
  type AnalyticsViewMode,
} from "@/lib/dates";
import {
  canFetchReportPeriod,
  mergeReportPeriodQuery,
  reportPeriodFilenameSuffix,
  type ReportQueryStyle,
} from "@/lib/report-period-query";
import { useReportDateRange } from "@/hooks/use-report-date-range";

/** Shared period state for medical-records report pages. */
export function useMrReportPeriod(defaultViewMode: AnalyticsViewMode = "all") {
  const serverToday = useServerDateAnchor();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(defaultViewMode);

  const reportRange = useReportDateRange(viewMode, year, startDate, endDate);

  const periodLabel = useMemo(
    () => analyticsPeriodLabel(viewMode, year, startDate, endDate, serverToday),
    [viewMode, year, startDate, endDate, serverToday]
  );

  const canFetch = canFetchReportPeriod(viewMode, reportRange);

  const buildQuery = useCallback(
    (extra?: Record<string, string>, style: ReportQueryStyle = "start_date") =>
      mergeReportPeriodQuery(viewMode, reportRange, extra, style),
    [viewMode, reportRange]
  );

  const filenameSuffix = reportPeriodFilenameSuffix(viewMode, reportRange, year);

  const years = useMemo(
    () => Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString()),
    []
  );

  return {
    year,
    setYear,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    viewMode,
    setViewMode,
    reportRange,
    periodLabel,
    canFetch,
    buildQuery,
    filenameSuffix,
    years,
  };
}

/**
 * Fetch when auth is ready and the period is valid.
 * Uses a ref so callers need not wrap fetchReport in useCallback.
 */
export function useMrReportAutoFetch(
  ready: boolean,
  canFetch: boolean,
  fetchReport: () => void | Promise<void>,
  deps: readonly unknown[]
) {
  const fetchRef = useRef(fetchReport);
  fetchRef.current = fetchReport;

  useEffect(() => {
    if (!ready || !canFetch) return;
    void fetchRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, canFetch, ...deps]);
}
