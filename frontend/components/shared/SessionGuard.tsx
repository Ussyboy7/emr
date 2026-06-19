"use client";

import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSessionGuard } from "@/hooks/use-session-guard";
import { fetchOrgIdleTimeoutMinutes } from "@/lib/auth-session-settings";

/** Global idle timeout + session expiry warnings for authenticated users. */
export function SessionGuard() {
  const { currentUser, hydrated } = useCurrentUser();
  const enabled = Boolean(hydrated && currentUser);

  useEffect(() => {
    if (!enabled) return;
    void fetchOrgIdleTimeoutMinutes();
  }, [enabled]);

  useSessionGuard(enabled);
  return null;
}
