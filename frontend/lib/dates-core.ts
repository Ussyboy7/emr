// Pure date helpers (no server-time / api-client dependency).

export const DISPLAY_LOCALE = "en-GB";

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString). */
export function toApiDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

export function buildApiDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function monthBounds(year: number, month: number): { start: string; end: string } {
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
  end: string | null | undefined,
): string {
  if (!start && !end) return "—";
  if (start && end) return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  return formatDisplayDate(start || end);
}

/** Days since Monday for a JS Date (Mon=0 … Sun=6). */
export function daysFromMonday(d: Date): number {
  return (d.getDay() + 6) % 7;
}
