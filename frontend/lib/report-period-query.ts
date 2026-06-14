import type { AnalyticsViewMode } from "@/lib/dates";

export type ReportDateRange = { start: string; end: string };

export function isAllTimeViewMode(viewMode: AnalyticsViewMode | string): boolean {
  return viewMode === "all";
}

/** True when the report/analytics fetch can run for the current filters. */
export function canFetchReportPeriod(
  viewMode: AnalyticsViewMode | string,
  range: ReportDateRange | null
): boolean {
  if (isAllTimeViewMode(viewMode)) return true;
  return Boolean(range?.start && range?.end);
}

export type ReportQueryStyle = "start_date" | "start";

/** Build API query params for a report or analytics period. */
export function buildReportPeriodQuery(
  viewMode: AnalyticsViewMode | string,
  range: ReportDateRange | null,
  style: ReportQueryStyle = "start_date"
): URLSearchParams | null {
  if (isAllTimeViewMode(viewMode)) {
    return new URLSearchParams({ period: "all" });
  }
  if (!range?.start || !range?.end) return null;
  if (style === "start_date") {
    return new URLSearchParams({ start_date: range.start, end_date: range.end });
  }
  return new URLSearchParams({ start: range.start, end: range.end });
}

export function reportPeriodFilenameSuffix(
  viewMode: AnalyticsViewMode | string,
  range: ReportDateRange | null,
  year: string
): string {
  if (isAllTimeViewMode(viewMode)) return "all_time";
  if (range?.start && range?.end) return `${range.start}_${range.end}`;
  return year || "export";
}

export function mergeReportPeriodQuery(
  viewMode: AnalyticsViewMode | string,
  range: ReportDateRange | null,
  extra?: Record<string, string>,
  style: ReportQueryStyle = "start_date"
): URLSearchParams | null {
  const base = buildReportPeriodQuery(viewMode, range, style);
  if (!base || !extra) return base;
  Object.entries(extra).forEach(([k, v]) => base.set(k, v));
  return base;
}

export const REPORT_VIEW_MODE_OPTIONS: { value: AnalyticsViewMode; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "bimonthly", label: "Bi-monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half-yearly", label: "Half-yearly" },
  { value: "annually", label: "Annually" },
  { value: "year", label: "By Year" },
  { value: "range", label: "Date Range" },
];
