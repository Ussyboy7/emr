"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  IDLE_WARNING_LEAD_MS,
  REFRESH_WARNING_LEAD_MS,
  SESSION_GUARD_POLL_MS,
  getIdleTimeoutMs,
} from "@/lib/auth-session-config";
import { subscribeIdleTimeoutSettings } from "@/lib/auth-session-settings";
import { getStoredRefreshExpiresAt, redirectToLogin, apiFetch } from "@/lib/api-client";
import { subscribeSessionActivity } from "@/lib/session-activity";

const IDLE_ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

/**
 * Enforces idle logout and warns before refresh token expiry.
 * Mount once for authenticated app shell (e.g. Providers).
 */
export function useSessionGuard(enabled: boolean) {
  const lastActivityRef = useRef(Date.now());
  const idleWarnedRef = useRef(false);
  const refreshWarnedRef = useRef(false);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    idleWarnedRef.current = false;
    refreshWarnedRef.current = false;
  }, []);

  const staySignedIn = useCallback(() => {
    recordActivity();
    void apiFetch("/accounts/auth/me/").catch(() => {
      // Session may already be invalid; redirectToLogin handles the next failure.
    });
  }, [recordActivity]);

  useEffect(() => {
    if (!enabled) return;

    recordActivity();

    let throttleAt = 0;
    const onDomActivity = () => {
      const now = Date.now();
      if (now - throttleAt < 1000) return;
      throttleAt = now;
      recordActivity();
    };

    IDLE_ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, onDomActivity, { passive: true });
    });

    const unsubscribeApi = subscribeSessionActivity(recordActivity);

    const unsubscribeIdleSettings = subscribeIdleTimeoutSettings(recordActivity);

    const interval = setInterval(() => {
      const now = Date.now();
      const idleMs = now - lastActivityRef.current;
      const idleTimeoutMs = getIdleTimeoutMs();
      const idleRemaining = idleTimeoutMs - idleMs;

      if (idleRemaining <= 0) {
        redirectToLogin("idle_timeout");
        return;
      }

      if (idleRemaining <= IDLE_WARNING_LEAD_MS && !idleWarnedRef.current) {
        idleWarnedRef.current = true;
        toast.warning("You'll be logged out soon due to inactivity.", {
          description: "Save your work, or click Stay signed in to continue.",
          duration: IDLE_WARNING_LEAD_MS,
          action: {
            label: "Stay signed in",
            onClick: () => staySignedIn(),
          },
        });
        return;
      }

      const refreshExpiresAt = getStoredRefreshExpiresAt();
      if (!refreshExpiresAt) return;

      const refreshRemaining = refreshExpiresAt - now;
      if (refreshRemaining <= 0) {
        redirectToLogin("session_expired");
        return;
      }

      if (refreshRemaining <= REFRESH_WARNING_LEAD_MS && !refreshWarnedRef.current) {
        refreshWarnedRef.current = true;
        toast.warning("Your session will expire soon.", {
          description: "Save your work. Any activity will extend your session if still valid.",
          duration: REFRESH_WARNING_LEAD_MS,
          action: {
            label: "Stay signed in",
            onClick: () => staySignedIn(),
          },
        });
      }
    }, SESSION_GUARD_POLL_MS);

    return () => {
      IDLE_ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, onDomActivity);
      });
      unsubscribeApi();
      unsubscribeIdleSettings();
      clearInterval(interval);
    };
  }, [enabled, recordActivity, staySignedIn]);
}
