"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";

/** Fine-grained capability check (aligned with backend ``user_has_capability``). */
export function useCapability(capabilityId: string): {
  allowed: boolean;
  hydrated: boolean;
  capabilities: string[];
} {
  const { currentUser, hydrated } = useCurrentUser();

  return useMemo(() => {
    const capabilities = Array.isArray(currentUser?.capabilities) ? currentUser.capabilities : [];
    if (!hydrated || !currentUser) {
      return { allowed: false, hydrated, capabilities };
    }
    if (currentUser.isSuperuser) {
      return { allowed: true, hydrated, capabilities };
    }
    return {
      allowed: capabilities.includes(capabilityId),
      hydrated,
      capabilities,
    };
  }, [currentUser, hydrated, capabilityId]);
}

/** Any of the listed capabilities (or superuser). */
export function useAnyCapability(capabilityIds: string[]): boolean {
  const { currentUser, hydrated } = useCurrentUser();
  return useMemo(() => {
    if (!hydrated || !currentUser) return false;
    if (currentUser.isSuperuser) return true;
    const caps = currentUser.capabilities ?? [];
    return capabilityIds.some((id) => caps.includes(id));
  }, [currentUser, hydrated, capabilityIds]);
}
