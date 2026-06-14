import { useCallback } from "react";
import { useServerDateAnchor } from "@/components/providers/ServerDateProvider";
import { analyticsRangeFromFilters, type AnalyticsViewMode } from "@/lib/dates";
import { buildReportPeriodQuery, reportPeriodFilenameSuffix } from "@/lib/report-period-query";
import { exportReportCsv, exportReportPdf } from "@/lib/report-export";

export type { AnalyticsViewMode };

export type AnalyticsQueryStyle = "start" | "start_date";

export function buildAnalyticsExportQuery(
  viewMode: AnalyticsViewMode,
  year: string,
  startDate: string,
  endDate: string,
  style: AnalyticsQueryStyle = "start",
  serverToday?: string
): URLSearchParams | null {
  const range = analyticsRangeFromFilters(viewMode, year, startDate, endDate, serverToday);
  return buildReportPeriodQuery(viewMode, range, style === "start_date" ? "start_date" : "start");
}

export function analyticsExportFilename(
  base: string,
  viewMode: AnalyticsViewMode,
  year: string,
  startDate: string,
  endDate: string,
  serverToday?: string
) {
  const range = analyticsRangeFromFilters(viewMode, year, startDate, endDate, serverToday);
  return `${base}_${reportPeriodFilenameSuffix(viewMode, range, year)}`;
}

export function useAnalyticsExportHandlers(options: {
  apiPath: string;
  filenameBase: string;
  viewMode: AnalyticsViewMode;
  year: string;
  startDate: string;
  endDate: string;
  queryStyle?: AnalyticsQueryStyle;
  extraParams?: Record<string, string>;
}) {
  const {
    apiPath,
    filenameBase,
    viewMode,
    year,
    startDate,
    endDate,
    queryStyle = "start",
    extraParams,
  } = options;

  const serverToday = useServerDateAnchor();

  const buildQuery = useCallback(() => {
    const params = buildAnalyticsExportQuery(viewMode, year, startDate, endDate, queryStyle, serverToday);
    if (!params) return null;
    if (extraParams) {
      Object.entries(extraParams).forEach(([k, v]) => params.set(k, v));
    }
    return params;
  }, [viewMode, year, startDate, endDate, queryStyle, extraParams, serverToday]);

  const handleExportCsv = useCallback(async () => {
    const filename = analyticsExportFilename(filenameBase, viewMode, year, startDate, endDate, serverToday);
    await exportReportCsv(apiPath, buildQuery(), `${filename}.csv`);
  }, [apiPath, buildQuery, filenameBase, viewMode, year, startDate, endDate, serverToday]);

  const handleDownloadPdf = useCallback(async () => {
    const filename = analyticsExportFilename(filenameBase, viewMode, year, startDate, endDate, serverToday);
    await exportReportPdf(apiPath, buildQuery(), `${filename}.pdf`);
  }, [apiPath, buildQuery, filenameBase, viewMode, year, startDate, endDate, serverToday]);

  return { handleExportCsv, handleDownloadPdf };
}
