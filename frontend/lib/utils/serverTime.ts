/**
 * Server time utilities.
 *
 * Why this exists:
 *   Our "Today / This week / This month" filters must match the calendar the
 *   backend is operating on, not the client's local clock. A user's device may
 *   be in a different timezone from the server, have a wrong clock, or cross
 *   midnight before/after the server — any of which can cause freshly-created
 *   records to mysteriously disappear from the "Today" tab until the user
 *   manually switches to "All Time".
 *
 * How:
 *   - Fetch `GET /common/server-time/` once and cache it together with the
 *     browser monotonic timestamp at which we fetched it.
 *   - To get "server now" at any later time, add the elapsed wall-clock delta
 *     to the anchor. This survives clock skew for the duration of a session.
 *   - Expose a short TTL so long-lived tabs eventually re-sync (in case the
 *     user leaves a tab open across midnight).
 */

import { apiFetch } from '@/lib/api-client';

type ServerTimePayload = {
  date: string; // YYYY-MM-DD in server timezone
  datetime: string; // ISO-8601 with offset
  timezone: string; // e.g. "Africa/Lagos"
};

type ServerTimeAnchor = {
  /** Server time (ms since epoch) when the payload was minted. */
  serverEpochMs: number;
  /** `performance.now()` (or Date.now fallback) at the moment of capture. */
  clientCapturedAt: number;
  timezone: string;
};

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const RETRY_AFTER_ERROR_MS = 30 * 1000;

let anchor: ServerTimeAnchor | null = null;
let anchorFetchedAt = 0;
let inflight: Promise<ServerTimeAnchor> | null = null;
let lastErrorAt = 0;

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const fetchAnchor = async (): Promise<ServerTimeAnchor> => {
  const before = now();
  const payload = await apiFetch<ServerTimePayload>('/common/server-time/');
  const after = now();
  // Estimate round-trip latency and anchor the server time at the midpoint
  // of request/response to minimize skew.
  const rttHalf = Math.max(0, (after - before) / 2);
  const serverEpochMs = new Date(payload.datetime).getTime() + rttHalf;
  return {
    serverEpochMs,
    clientCapturedAt: after,
    timezone: payload.timezone,
  };
};

const ensureAnchor = async (): Promise<ServerTimeAnchor> => {
  if (anchor && now() - anchorFetchedAt < REFRESH_INTERVAL_MS) return anchor;
  if (inflight) return inflight;
  // Back off briefly on repeated errors to avoid hammering the endpoint.
  if (!anchor && lastErrorAt && now() - lastErrorAt < RETRY_AFTER_ERROR_MS) {
    throw new Error('server-time fetch recently failed; using fallback');
  }
  inflight = fetchAnchor()
    .then((a) => {
      anchor = a;
      anchorFetchedAt = now();
      lastErrorAt = 0;
      return a;
    })
    .catch((err) => {
      lastErrorAt = now();
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

/** Current Date according to the server (or client fallback if unreachable). */
export const getServerNow = async (): Promise<Date> => {
  try {
    const a = await ensureAnchor();
    const elapsed = now() - a.clientCapturedAt;
    return new Date(a.serverEpochMs + elapsed);
  } catch {
    return new Date();
  }
};

/** Format a Date as `YYYY-MM-DD` in the server's timezone. */
export const formatInServerTz = async (d: Date): Promise<string> => {
  try {
    const a = await ensureAnchor();
    // en-CA gives `YYYY-MM-DD`, and `timeZone` ensures server calendar semantics.
    return d.toLocaleDateString('en-CA', { timeZone: a.timezone });
  } catch {
    // Fall back to local date.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
};

/** Server's "today" as `YYYY-MM-DD` in the server's timezone. */
export const getServerToday = async (): Promise<string> => {
  const d = await getServerNow();
  return formatInServerTz(d);
};

/**
 * Synchronous accessor: returns the last known anchor's server-time.
 * Returns null if we have not yet fetched the anchor. Useful when we want to
 * fall back to the client clock without blocking render.
 */
export const peekServerNow = (): Date | null => {
  if (!anchor) return null;
  const elapsed = now() - anchor.clientCapturedAt;
  return new Date(anchor.serverEpochMs + elapsed);
};

export const peekServerTimezone = (): string | null => anchor?.timezone ?? null;

/** Force re-fetch on next call (for tests). */
export const __resetServerTimeAnchor = (): void => {
  anchor = null;
  anchorFetchedAt = 0;
  inflight = null;
  lastErrorAt = 0;
};
