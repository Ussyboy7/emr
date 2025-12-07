"use client";

import { logWarn } from '@/lib/client-logger';
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@/lib/npa-structure";
import { OrganizationContext } from "@/contexts/OrganizationContext";
import { apiFetch, hasOriginalTokens, hasTokens } from "@/lib/api-client";

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
    avatar: undefined,
    active: data.is_active ?? true,
    isSuperuser: data.is_superuser ?? false,
  };
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
      setRemoteUser(mapApiUserToUser(response));
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

    return {
      ...orgMatch,
      ...remoteUser,
      directorate: orgMatch.directorate ?? remoteUser.directorate,
      division: orgMatch.division ?? remoteUser.division,
      department: orgMatch.department ?? remoteUser.department,
      systemRole: remoteUser.systemRole || orgMatch.systemRole,
      gradeLevel: remoteUser.gradeLevel || orgMatch.gradeLevel,
      active: orgMatch.active,
      // Preserve isSuperuser from remoteUser (API) as it's the source of truth
      isSuperuser: remoteUser.isSuperuser ?? orgMatch.isSuperuser ?? false,
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
