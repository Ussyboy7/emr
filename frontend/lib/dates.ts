/**
 * Canonical date helpers for the EMR frontend.
 *
 * - API / filters: YYYY-MM-DD (ISO date)
 * - UI display: DD/MM/YYYY (en-GB)
 * - Business calendar: server timezone when available (Africa/Lagos)
 */
import { peekServerNow, peekServerTimezone } from "@/lib/utils/serverTime";

export const DISPLAY_LOCALE = "en-GB";

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString). */
export function toApiDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @deprecated Alias for toApiDateString */
export const toLocalDateString = toApiDateString;

/** Parse YYYY-MM-DD to a local Date at noon (stable for calendar math). */
export function parseApiDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseApiDateParts(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function buildApiDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const last = lastDayOfMonth(year, month);
  return { start: buildApiDate(year, month, 1), end: buildApiDate(year, month, last) };
}

export function addDaysToApiDate(iso: string, delta: number): string {
  const d = parseApiDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + delta);
  return toApiDateString(d);
}

/** Today's date as YYYY-MM-DD (local fallback). */
export function todayApiDateString(): string {
  return toApiDateString(new Date());
}

/** @deprecated Use todayApiDateString */
export const todayLocalDateString = todayApiDateString;

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

/** Convert an ISO datetime (or Date) to YYYY-MM-DD in local time. */
export function toApiDateFromInstant(input: string | Date | null | undefined): string {
  if (input == null || input === "") return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  return toApiDateString(d);
}

/** Format for UI: 01 Jun 2026 (tables, compact lists) */
export function formatDisplayDateMedium(input: string | Date | null | undefined): string {
  if (input == null || input === "") return "—";
  const d =
    typeof input === "string"
      ? parseApiDate(input.slice(0, 10)) ?? new Date(input)
      : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(DISPLAY_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Format time only: HH:mm (24h) */
export function formatDisplayTime(input: string | Date | null | undefined): string {
  if (input == null || input === "") return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(DISPLAY_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** @deprecated Use toApiDateString */
export const formatLocalYmd = toApiDateString;

/** @deprecated Use toApiDateString */
export const formatLocalYyyyMmDd = toApiDateString;

/** Format for UI: DD/MM/YYYY */
export function formatDisplayDate(input: string | Date | null | undefined): string {
  if (input == null || input === "") return "—";
  const d = typeof input === "string" ? parseApiDate(input.slice(0, 10)) : input;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(DISPLAY_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Format for UI: DD/MM/YYYY HH:mm */
export function formatDisplayDateTime(input: string | Date | null | undefined): string {
  if (input == null || input === "") return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(DISPLAY_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Display an inclusive API date range: 01/06/2026 – 30/06/2026 */
export function formatDisplayDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start && !end) return "—";
  if (start && end) return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  return formatDisplayDate(start || end);
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

/** Days since Monday for a JS Date (Mon=0 … Sun=6). */
export function daysFromMonday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Monday through Sunday of the week containing server today (ISO week). */
export function localWeekBounds(serverToday?: string): { start: string; end: string } {
  const { year, month, day } = calendarFromServerToday(serverToday);
  const today = buildApiDate(year, month, day);
  const d = parseApiDate(today);
  if (!d || Number.isNaN(d.getTime())) return { start: today, end: today };
  // JS getDay(): 0=Sun … 6=Sat → Monday=0 … Sunday=6
  const monday = addDaysToApiDate(today, -daysFromMonday(d));
  const sunday = addDaysToApiDate(monday, 6);
  return { start: monday, end: sunday };
}

/** @deprecated Use {@link localWeekBounds} — kept for existing imports. */
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

/**
 * Resolve inclusive API dates from view mode.
 * Uses server calendar (Africa/Lagos) when the server-time anchor is available.
 */
export function analyticsRangeFromFilters(
  viewMode: AnalyticsViewMode,
  year: string,
  startDate: string,
  endDate: string,
  serverToday?: string
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
    const end = monthBounds(y, m).end;
    const start = monthBounds(prevYear, prevMonth).start;
    return { start, end };
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

/** Human label for the active preset period (for filter cards). */
export function analyticsPeriodLabel(
  viewMode: AnalyticsViewMode,
  year: string,
  startDate: string,
  endDate: string,
  serverToday?: string
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
