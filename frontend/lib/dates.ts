/**
 * Date helpers: re-exports pure format/parse utilities from dates-core,
 * plus server-calendar helpers that use the server-time anchor.
 */
export * from "./dates-core";

import {
  addDaysToApiDate,
  buildApiDate,
  daysFromMonday,
  formatDisplayDateRange,
  monthBounds,
  parseApiDate,
  parseApiDateParts,
  todayApiDateString,
  DISPLAY_LOCALE,
} from "./dates-core";
import { peekServerNow, peekServerTimezone } from "@/lib/utils/serverTime";

/** Best-known server calendar today (YYYY-MM-DD), else local today. */
export function peekServerTodayApi(): string {
  const peeked = peekServerNow();
  const tz = peekServerTimezone();
  if (peeked && tz) {
    return peeked.toLocaleDateString("en-CA", { timeZone: tz });
  }
  return todayApiDateString();
}

function calendarFromServerToday(serverToday?: string): { year: number; month: number; day: number } {
  const iso = serverToday?.trim() || peekServerTodayApi();
  return parseApiDateParts(iso) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
  };
}

/** YYYY-MM for the server (or local) calendar month containing today. */
export function peekServerTodayMonthPrefix(): string {
  return peekServerTodayApi().slice(0, 7);
}

/** Four-digit year for the server (or local) calendar today. */
export function peekServerTodayYear(): string {
  return peekServerTodayApi().slice(0, 4);
}

/** e.g. June 2026 — month/year headers in reports. */
export function formatDisplayMonthYear(input?: string | Date | null): string {
  const d =
    input == null || input === ""
      ? parseApiDate(peekServerTodayApi())
      : typeof input === "string"
        ? parseApiDate(input.slice(0, 10)) ?? new Date(input)
        : input;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(DISPLAY_LOCALE, { month: "long", year: "numeric" });
}

/** First and last calendar day of the month containing server today (or override). */
export function localMonthBounds(serverToday?: string): { start: string; end: string } {
  const { year, month } = calendarFromServerToday(serverToday);
  return monthBounds(year, month);
}

/** Monday through Sunday of the week containing server today (ISO week). */
export function localWeekBounds(serverToday?: string): { start: string; end: string } {
  const { year, month, day } = calendarFromServerToday(serverToday);
  const today = buildApiDate(year, month, day);
  const d = parseApiDate(today);
  if (!d || Number.isNaN(d.getTime())) return { start: today, end: today };
  const monday = addDaysToApiDate(today, -daysFromMonday(d));
  const sunday = addDaysToApiDate(monday, 6);
  return { start: monday, end: sunday };
}

/** @deprecated Use {@link localWeekBounds} */
export function localWeekToTodayBounds(serverToday?: string): { start: string; end: string } {
  return localWeekBounds(serverToday);
}

export type AnalyticsViewMode =
  | "all"
  | "daily"
  | "weekly"
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "half-yearly"
  | "annually"
  | "year"
  | "range";

export function analyticsRangeFromFilters(
  viewMode: AnalyticsViewMode,
  year: string,
  startDate: string,
  endDate: string,
  serverToday?: string,
): { start: string; end: string } | null {
  const { year: y, month: m, day: d } = calendarFromServerToday(serverToday);
  const monthIndex = m - 1;

  if (viewMode === "all") {
    return { start: "", end: "" };
  }
  if (viewMode === "daily") {
    const today = buildApiDate(y, m, d);
    return { start: today, end: today };
  }
  if (viewMode === "weekly") {
    return localWeekBounds(serverToday);
  }
  if (viewMode === "monthly") {
    return monthBounds(y, m);
  }
  if (viewMode === "bimonthly") {
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    return {
      start: monthBounds(prevYear, prevMonth).start,
      end: monthBounds(y, m).end,
    };
  }
  if (viewMode === "quarterly") {
    const quarterStartMonth = Math.floor(monthIndex / 3) * 3 + 1;
    const quarterEndMonth = quarterStartMonth + 2;
    return {
      start: monthBounds(y, quarterStartMonth).start,
      end: monthBounds(y, quarterEndMonth).end,
    };
  }
  if (viewMode === "half-yearly") {
    const halfStart = monthIndex < 6 ? 1 : 7;
    const halfEnd = monthIndex < 6 ? 6 : 12;
    return {
      start: monthBounds(y, halfStart).start,
      end: monthBounds(y, halfEnd).end,
    };
  }
  if (viewMode === "annually") {
    return { start: buildApiDate(y, 1, 1), end: buildApiDate(y, 12, 31) };
  }
  if (viewMode === "year") {
    const yr = year.trim();
    if (!/^\d{4}$/.test(yr)) return null;
    return { start: `${yr}-01-01`, end: `${yr}-12-31` };
  }
  if (!startDate?.trim() || !endDate?.trim()) return null;
  if (endDate < startDate) return null;
  return { start: startDate, end: endDate };
}

export function analyticsPeriodLabel(
  viewMode: AnalyticsViewMode,
  year: string,
  startDate: string,
  endDate: string,
  serverToday?: string,
): string {
  const range = analyticsRangeFromFilters(viewMode, year, startDate, endDate, serverToday);
  if (viewMode === "all") return "All time";
  if (!range) {
    if (viewMode === "year") return year ? `Year ${year}` : "Select year";
    if (viewMode === "range") return "Select start and end dates";
    return "—";
  }
  if (viewMode === "year") return `Year ${year} (${formatDisplayDateRange(range.start, range.end)})`;
  if (viewMode === "range") return formatDisplayDateRange(range.start, range.end);
  const preset: Record<string, string> = {
    daily: "Today",
    weekly: "This week (Mon–Sun)",
    monthly: "This month",
    bimonthly: "Last 2 months",
    quarterly: "This quarter",
    "half-yearly": "This half-year",
    annually: "This year",
  };
  const name = preset[viewMode] ?? viewMode;
  return `${name} (${formatDisplayDateRange(range.start, range.end)})`;
}
