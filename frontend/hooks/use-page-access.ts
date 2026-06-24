"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { isPathAllowedByPages } from "@/lib/home-route";

/**
 * Page-path access check aligned with sidebar, middleware, and backend API rules.
 */
export function usePageAccess(path: string): {
  allowed: boolean;
  hydrated: boolean;
  permissions: string[];
} {
  const { currentUser, hydrated } = useCurrentUser();

  return useMemo(() => {
    const permissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
    if (!hydrated || !currentUser) {
      return { allowed: false, hydrated, permissions };
    }
    if (currentUser.isSuperuser) {
      return { allowed: true, hydrated, permissions };
    }
    return {
      allowed: isPathAllowedByPages(path, permissions, currentUser.deniedPages ?? []),
      hydrated,
      permissions,
    };
  }, [currentUser, hydrated, path]);
}
