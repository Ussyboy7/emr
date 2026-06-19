/** Show idle warning this long before forced logout. */
export const IDLE_WARNING_LEAD_MS = 5 * 60 * 1000;

/** Show refresh warning this long before refresh token expiry. */
export const REFRESH_WARNING_LEAD_MS = 5 * 60 * 1000;

/** How often the session guard polls timers (ms). */
export const SESSION_GUARD_POLL_MS = 15 * 1000;

/** Backend JWT refresh lifetime; override in `.env.prod` with `NEXT_PUBLIC_JWT_REFRESH_HOURS=12`. */
export function getJwtRefreshHours(): number {
  const raw = process.env.NEXT_PUBLIC_JWT_REFRESH_HOURS;
  if (raw == null || raw === "") return 8;
  const hours = Number(raw);
  return Number.isFinite(hours) && hours > 0 ? hours : 8;
}

/** Cookie max-age for refresh/session cookies — keep aligned with backend `JWT_REFRESH_HOURS`. */
export const AUTH_REFRESH_SESSION_MAX_AGE_SECONDS = getJwtRefreshHours() * 60 * 60;

export function getRefreshLifetimeMs(): number {
  return AUTH_REFRESH_SESSION_MAX_AGE_SECONDS * 1000;
}

export {
  getIdleTimeoutMinutes,
  getIdleTimeoutMs,
} from "./auth-session-settings";
