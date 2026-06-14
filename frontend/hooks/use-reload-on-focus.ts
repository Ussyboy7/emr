"use client";

import { useEffect, useRef } from "react";

/** Default poll interval for clinic module home dashboards while the tab is visible. */
export const DEFAULT_CLINIC_DASHBOARD_POLL_MS = 30_000;

export interface UseReloadOnFocusOptions {
  /** When false, listeners are not attached. Default true. */
  enabled?: boolean;
  /** Minimum ms between reloads (focus or poll). Default 30_000. */
  minIntervalMs?: number;
  /** Poll while the tab is visible; 0 disables polling. Default 0. */
  pollIntervalMs?: number;
}

/**
 * Silently reload operational dashboards when the user returns to the tab,
 * with optional interval polling while visible. Throttles and de-dupes calls.
 */
export function useReloadOnFocus(
  reload: () => void | Promise<void>,
  options: UseReloadOnFocusOptions = {},
) {
  const { enabled = true, minIntervalMs = 30_000, pollIntervalMs = 0 } = options;
  const reloadRef = useRef(reload);
  const lastRunRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (!enabled) return;

    const tryReload = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const now = Date.now();
      if (lastRunRef.current > 0 && now - lastRunRef.current < minIntervalMs) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      lastRunRef.current = now;
      Promise.resolve(reloadRef.current())
        .catch(() => {
          // Background tick — keep the previous payload.
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        tryReload();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (pollIntervalMs > 0) {
      intervalId = setInterval(tryReload, pollIntervalMs);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [enabled, minIntervalMs, pollIntervalMs]);
}
