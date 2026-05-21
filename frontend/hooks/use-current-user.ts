"use client";

import { logWarn } from '@/lib/client-logger';
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@/lib/npa-structure";
import { OrganizationContext } from "@/contexts/OrganizationContext";
import {
  apiFetch,
  hasOriginalTokens,
  hasTokens,
  AUTH_REFRESH_SESSION_MAX_AGE_SECONDS,
} from "@/lib/api-client";
import {
  AUTH_ALLOWED_PAGES_COOKIE,
  AUTH_HOME_ROUTE_COOKIE,
  AUTH_IS_SUPERUSER_COOKIE,
  AUTH_SESSION_COOKIE,
  LEGACY_AUTH_ALLOWED_PAGES_COOKIE,
  LEGACY_AUTH_HOME_ROUTE_COOKIE,
  LEGACY_AUTH_IS_SUPERUSER_COOKIE,
  LEGACY_AUTH_SESSION_COOKIE,
} from "@/lib/auth-cookie-names";
import { getHomeRouteForUser } from "@/lib/home-route";

interface ApiUser {
  id?: string | number;
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  employee_id?: string;
  grade_level?: string;
  directorate_name?: string;
  directorate?: string | { name?: string };
  division_name?: string;
  division?: string | { name?: string };
  department_name?: string;
  department?: string | { name?: string };
  system_role?: string | { name?: string };
  system_role_name?: string;
  permissions?: {
    pages?: string[];
    actions?: Record<string, unknown>;
  };
  is_active?: boolean;
  is_superuser?: boolean;
  clinics_ids?: number[];
  active_clinic_id?: number | null;
  multi_clinic_enabled?: boolean;
  [key: string]: unknown; // Allow additional properties
}

const CURRENT_USER_CACHE_TTL_MS = 30_000;
let cachedRemoteUser: User | null | undefined = undefined;
let cachedRemoteUserAt = 0;
let inFlightRemoteUserRequest: Promise<User | null> | null = null;

const toOptionalString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  return String(value);
};

const mapApiUserToUser = (data: ApiUser): User => {
  const name = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
  // system_role is now a ForeignKey (UUID), but backend returns system_role_name for display
  let roleName = data.system_role_name ?? (typeof data.system_role === 'object' && data.system_role?.name ? data.system_role.name : "");
  // UUID pattern to detect if we accidentally got a UUID instead of a name
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Never use UUID as role name
  if (uuidPattern.test(roleName)) {
    roleName = "";
  }
  // If user is superuser and no role name, default to "System Administrator"
  if (!roleName && data.is_superuser) {
    roleName = "System Administrator";
  }
  return {
    id: String(data.id ?? data.username),
    username: data.username ?? undefined,
    name: name.length > 0 ? name : data.username ?? "User",
    email: data.email ?? "",
    employeeId: data.employee_id ?? "",
    gradeLevel: data.grade_level ?? "",
    directorate: (data.directorate_name || (typeof data.directorate === 'string' ? data.directorate : (data.directorate as any)?.name) || '') as string,
    division: toOptionalString(data.division_name ?? (typeof data.division === 'string' ? data.division : data.division?.name)),
    department: toOptionalString(data.department_name ?? (typeof data.department === 'string' ? data.department : data.department?.name)),
    systemRole: (typeof data.system_role === 'string' ? data.system_role : (data.system_role as any)?.name) || roleName,
    permissions: (data.permissions as any)?.pages || [],
    permissionActions: (data.permissions as any)?.actions || {},
    avatar: undefined,
    active: data.is_active ?? true,
    isSuperuser: data.is_superuser ?? false,
    clinics_ids: data.clinics_ids ?? undefined,
    active_clinic_id: data.active_clinic_id ?? undefined,
    multi_clinic_enabled: data.multi_clinic_enabled ?? false,
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

const cacheRemoteUser = (user: User | null) => {
  cachedRemoteUser = user;
  cachedRemoteUserAt = Date.now();
};

const shouldUseCachedRemoteUser = (): boolean => {
  if (cachedRemoteUser === undefined) return false;
  return Date.now() - cachedRemoteUserAt < CURRENT_USER_CACHE_TTL_MS;
};

const writeAuthMirrorCookies = (mapped: User) => {
  try {
    // Ensure middleware can treat this browser session as authenticated.
    setCookie(AUTH_SESSION_COOKIE, "1", AUTH_REFRESH_SESSION_MAX_AGE_SECONDS);
    setCookie(AUTH_ALLOWED_PAGES_COOKIE, JSON.stringify(mapped.permissions || []), AUTH_REFRESH_SESSION_MAX_AGE_SECONDS);
    setCookie(AUTH_IS_SUPERUSER_COOKIE, mapped.isSuperuser ? "1" : "0", AUTH_REFRESH_SESSION_MAX_AGE_SECONDS);
    const home = getHomeRouteForUser(mapped);
    if (home) setCookie(AUTH_HOME_ROUTE_COOKIE, home, AUTH_REFRESH_SESSION_MAX_AGE_SECONDS);

    // Cleanup legacy cookie names to avoid confusion / stale state.
    clearCookie(LEGACY_AUTH_ALLOWED_PAGES_COOKIE);
    clearCookie(LEGACY_AUTH_IS_SUPERUSER_COOKIE);
    clearCookie(LEGACY_AUTH_HOME_ROUTE_COOKIE);
    clearCookie(LEGACY_AUTH_SESSION_COOKIE);
  } catch {
    // ignore cookie write errors
  }
};

export const useCurrentUser = () => {
  const organization = useContext(OrganizationContext);
  const users = organization?.users ?? [];
  const [remoteUser, setRemoteUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const loadCurrentUser = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    if (!hasTokens()) {
      cacheRemoteUser(null);
      setRemoteUser(null);
      setHydrated(true);
      return;
    }

    if (!force && shouldUseCachedRemoteUser()) {
      setRemoteUser(cachedRemoteUser ?? null);
      setHydrated(true);
      return;
    }

    try {
      if (!inFlightRemoteUserRequest) {
        inFlightRemoteUserRequest = (async () => {
          const response = await apiFetch("/accounts/auth/me/");
          const mapped = mapApiUserToUser(response as ApiUser);
          writeAuthMirrorCookies(mapped);
          cacheRemoteUser(mapped);
          return mapped;
        })().finally(() => {
          inFlightRemoteUserRequest = null;
        });
      }

      const mapped = await inFlightRemoteUserRequest;
      setRemoteUser(mapped);
    } catch (error) {
      logWarn("Failed to hydrate current user from API", error);
      cacheRemoteUser(null);
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
    cachedRemoteUser = undefined;
    cachedRemoteUserAt = 0;
    setHydrated(false);
    await loadCurrentUser({ force: true });
  }, [loadCurrentUser]);

  return {
    currentUser: resolvedUser,
    hydrated,
    refresh,
    isImpersonating: hasOriginalTokens(),
  };
};
