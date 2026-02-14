"use client";

import { logWarn } from '@/lib/client-logger';
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@/lib/npa-structure";
import { OrganizationContext } from "@/contexts/OrganizationContext";
import { apiFetch, hasOriginalTokens, hasTokens } from "@/lib/api-client";
import {
  AUTH_ALLOWED_PAGES_COOKIE,
  AUTH_HOME_ROUTE_COOKIE,
  AUTH_IS_SUPERUSER_COOKIE,
  LEGACY_AUTH_ALLOWED_PAGES_COOKIE,
  LEGACY_AUTH_HOME_ROUTE_COOKIE,
  LEGACY_AUTH_IS_SUPERUSER_COOKIE,
} from "@/lib/auth-cookie-names";
import { getHomeRouteForUser } from "@/lib/home-route";

const toOptionalString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  return String(value);
};

const mapApiUserToUser = (data: any): User => {
  const name = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
  // system_role is now a ForeignKey (UUID), but backend returns system_role_name for display
  let roleName = data.system_role_name ?? (data.system_role?.name ?? "");
  // UUID pattern to detect if we accidentally got a UUID instead of a name
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Never use UUID as role name
  if (uuidPattern.test(roleName)) {
    roleName = "";
  }
  return {
    id: String(data.id ?? data.username),
    username: data.username ?? undefined,
    name: name.length > 0 ? name : data.username ?? "User",
    email: data.email ?? "",
    employeeId: data.employee_id ?? "",
    gradeLevel: data.grade_level ?? "",
    directorate: toOptionalString(data.directorate ?? data.directorate_id),
    division: toOptionalString(data.division ?? data.division_id),
    department: toOptionalString(data.department ?? data.department_id),
    systemRole: roleName, // Use role name for display
    permissions: data.permissions?.pages || [],
    permissionActions: data.permissions?.actions || {},
    avatar: undefined,
    active: data.is_active ?? true,
    isSuperuser: data.is_superuser ?? false,
  };
};

const setCookie = (name: string, value: string, maxAgeSeconds?: number) => {
  if (typeof document === "undefined") return;
  const maxAge = typeof maxAgeSeconds === "number" ? `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${maxAge}`;
};

const clearCookie = (name: string) => {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; SameSite=Lax; Max-Age=0`;
};

export const useCurrentUser = () => {
  const organization = useContext(OrganizationContext);
  const users = organization?.users ?? [];
  const [remoteUser, setRemoteUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const loadCurrentUser = useCallback(async () => {
    // Check for demo mode first
    if (typeof window !== 'undefined') {
      const demoUserStr = localStorage.getItem('demo_user');
      if (demoUserStr) {
        try {
          const demoUser = JSON.parse(demoUserStr);
          setRemoteUser({
            id: String(demoUser.id),
            username: demoUser.username,
            name: demoUser.name,
            email: demoUser.email,
            employeeId: demoUser.employeeId,
            gradeLevel: demoUser.gradeLevel,
            systemRole: demoUser.systemRole,
            permissions: demoUser.permissions?.pages || [],
            permissionActions: demoUser.permissions?.actions || {},
            isSuperuser: demoUser.isSuperuser,
            directorate: demoUser.directorate,
            division: demoUser.division,
            department: demoUser.department,
            avatar: undefined,
            active: true,
          });
          setHydrated(true);
          return;
        } catch (e) {
          // Fall through to API call
        }
      }
    }

    if (!hasTokens()) {
      setRemoteUser(null);
      setHydrated(true);
      return;
    }

    try {
      const response = await apiFetch("/accounts/auth/me/");
      const mapped = mapApiUserToUser(response);
      setRemoteUser(mapped);

      // Mirror authorization context into cookies for middleware (best-effort).
      try {
        setCookie(AUTH_ALLOWED_PAGES_COOKIE, JSON.stringify(mapped.permissions || []), 60 * 60 * 24 * 7);
        setCookie(AUTH_IS_SUPERUSER_COOKIE, mapped.isSuperuser ? "1" : "0", 60 * 60 * 24 * 7);
        const home = getHomeRouteForUser(mapped);
        if (home) setCookie(AUTH_HOME_ROUTE_COOKIE, home, 60 * 60 * 24 * 7);

        // Cleanup legacy cookie names to avoid confusion / stale state.
        clearCookie(LEGACY_AUTH_ALLOWED_PAGES_COOKIE);
        clearCookie(LEGACY_AUTH_IS_SUPERUSER_COOKIE);
        clearCookie(LEGACY_AUTH_HOME_ROUTE_COOKIE);
      } catch {
        // ignore cookie write errors
      }
    } catch (error) {
      logWarn("Failed to hydrate current user from API", error);
      setRemoteUser(null);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  const resolvedUser = useMemo(() => {
    if (!remoteUser) return null;
    const orgMatch = users.find(
      (candidate) =>
        candidate.id === remoteUser.id ||
        (remoteUser.username && candidate.username === remoteUser.username),
    );

    if (!orgMatch) {
      return remoteUser;
    }

    // Simply use the API response systemRole, no fallback needed
    return {
      ...orgMatch,
      ...remoteUser,
      systemRole: remoteUser.systemRole,
      permissions: remoteUser.permissions,
      permissionActions: remoteUser.permissionActions,
      isSuperuser: remoteUser.isSuperuser ?? false,
    } satisfies User;
  }, [remoteUser, users]);

  const refresh = useCallback(async () => {
    setHydrated(false);
    await loadCurrentUser();
  }, [loadCurrentUser]);

  return {
    currentUser: resolvedUser,
    hydrated,
    refresh,
    isImpersonating: hasOriginalTokens(),
  };
};
