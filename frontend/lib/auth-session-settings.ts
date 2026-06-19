import { apiFetch } from "@/lib/api-client";

/** Org-wide idle logout policy (server source of truth). */
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
export const MIN_IDLE_TIMEOUT_MINUTES = 5;
export const MAX_IDLE_TIMEOUT_MINUTES = 240;

export type SecuritySettings = {
  idle_session_timeout_minutes: number;
};

type IdleTimeoutListener = () => void;
const listeners = new Set<IdleTimeoutListener>();

let cachedIdleMinutes: number | null = null;
let inFlightFetch: Promise<number> | null = null;

export function clampIdleTimeoutMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_IDLE_TIMEOUT_MINUTES;
  return Math.min(
    MAX_IDLE_TIMEOUT_MINUTES,
    Math.max(MIN_IDLE_TIMEOUT_MINUTES, Math.round(value))
  );
}

export function applyOrgIdleTimeoutMinutes(minutes: number): number {
  const clamped = clampIdleTimeoutMinutes(minutes);
  cachedIdleMinutes = clamped;
  listeners.forEach((listener) => listener());
  return clamped;
}

export function getIdleTimeoutMinutes(): number {
  return cachedIdleMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
}

export function getIdleTimeoutMs(): number {
  return getIdleTimeoutMinutes() * 60 * 1000;
}

export function subscribeIdleTimeoutSettings(listener: IdleTimeoutListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fetch org policy from the API (all authenticated clients). */
export async function fetchOrgIdleTimeoutMinutes(): Promise<number> {
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = apiFetch<SecuritySettings>("/organization/security-settings/")
    .then((data) => applyOrgIdleTimeoutMinutes(data.idle_session_timeout_minutes))
    .catch(() => {
      if (cachedIdleMinutes == null) {
        cachedIdleMinutes = DEFAULT_IDLE_TIMEOUT_MINUTES;
      }
      return cachedIdleMinutes;
    })
    .finally(() => {
      inFlightFetch = null;
    });

  return inFlightFetch;
}

export async function updateOrgIdleTimeoutMinutes(minutes: number): Promise<number> {
  const data = await apiFetch<SecuritySettings>("/organization/security-settings/", {
    method: "PATCH",
    body: JSON.stringify({ idle_session_timeout_minutes: minutes }),
  });
  return applyOrgIdleTimeoutMinutes(data.idle_session_timeout_minutes);
}

export function getLoginRedirectToastMessage(reason: string | null): string | null {
  switch (reason) {
    case "idle_timeout":
      return `You were signed out after ${getIdleTimeoutMinutes()} minutes of inactivity.`;
    case "session_expired":
      return "Your session expired. Please sign in again.";
    case "permissions_stale":
      return "Your access permissions changed. Please sign in again.";
    default:
      return null;
  }
}
