"use client";

import { useCurrentUser } from "@/hooks/use-current-user";

/** Wait for auth hydration before firing protected API calls. */
export function useAuthenticatedPage() {
  const { currentUser, hydrated } = useCurrentUser();
  return {
    ready: hydrated && Boolean(currentUser),
    hydrated,
    currentUser,
  };
}
