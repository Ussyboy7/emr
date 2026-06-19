"use client";

import { useCallback, useState } from "react";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useAuthenticatedPage } from "@/hooks/use-authenticated-page";
import { isAuthenticationError } from "@/lib/auth-errors";

/** Auth gating + login redirect for nursing pages. */
export function useNursingPageAuth() {
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const { ready, hydrated, currentUser } = useAuthenticatedPage();

  const handleAuthError = useCallback((error: unknown): boolean => {
    if (isAuthenticationError(error)) {
      setAuthError(error);
      return true;
    }
    return false;
  }, []);

  return { ready, hydrated, currentUser, authError, setAuthError, handleAuthError };
}
