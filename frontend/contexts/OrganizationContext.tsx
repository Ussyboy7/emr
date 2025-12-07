import { logError, logInfo } from '@/lib/client-logger';
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { User } from '@/lib/npa-structure';
import { updateOrganizationCache } from '@/lib/npa-structure';
import { apiFetch, hasTokens } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';

export interface Directorate {
  id: string;
  name: string;
  code: string;
  shortName?: string;
  description?: string;
  executiveDirectorId?: string;
  isActive: boolean;
}

export interface Division {
  id: string;
  name: string;
  code: string;
  shortName?: string;
  directorateId: string;
  generalManagerId?: string | null;
  isActive: boolean;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  shortName?: string;
  divisionId: string;
  assistantGeneralManagerId?: string | null;
  isActive: boolean;
}

export interface Office {
  id: string;
  name: string;
  code: string;
  officeType: string;
  directorateId?: string | null;
  divisionId?: string | null;
  departmentId?: string | null;
  parentId?: string | null;
  description?: string;
  isActive: boolean;
  allowExternalIntake: boolean;
  allowLateralRouting: boolean;
}

export interface OfficeMembership {
  id: string;
  officeId: string;
  officeName?: string;
  userId: string;
  assignmentRole: string;
  isPrimary: boolean;
  canRegister: boolean;
  canRoute: boolean;
  canApprove: boolean;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
}

export interface AssistantAssignment {
  id: string;
  executiveId: string;
  assistantId: string;
  type: 'TA' | 'PA';
  specialization?: string;
  permissions: string[];
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  permissions?: Record<string, boolean>;
  userCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

type CreateRoleInput = {
  name: string;
  description?: string;
  isActive?: boolean;
  permissions?: Record<string, boolean>;
};

type UpdateRoleInput = Partial<CreateRoleInput>;

interface OrganizationContextType {
  directorates: Directorate[];
  divisions: Division[];
  departments: Department[];
  assistantAssignments: AssistantAssignment[];
  offices: Office[];
  officeMemberships: OfficeMembership[];
  users: User[];
  roles: Role[];
  addRole: (role: CreateRoleInput) => Promise<Role>;
  updateRole: (id: string, updates: UpdateRoleInput) => Promise<Role | null>;
  deleteRole: (id: string) => Promise<void>;
  addDirectorate: (directorate: CreateDirectorateInput) => Promise<Directorate>;
  updateDirectorate: (id: string, updates: UpdateDirectorateInput) => Promise<Directorate | null>;
  deleteDirectorate: (id: string) => Promise<Directorate | null>;
  addDivision: (division: CreateDivisionInput) => Promise<Division>;
  updateDivision: (id: string, updates: UpdateDivisionInput) => Promise<Division | null>;
  deleteDivision: (id: string) => Promise<Division | null>;
  addDepartment: (department: CreateDepartmentInput) => Promise<Department>;
  updateDepartment: (id: string, updates: UpdateDepartmentInput) => Promise<Department | null>;
  deleteDepartment: (id: string) => Promise<Department | null>;
  addAssignment: (assignment: Omit<AssistantAssignment, 'id'>) => Promise<AssistantAssignment>;
  updateAssignment: (id: string, updates: Partial<AssistantAssignment>) => Promise<AssistantAssignment>;
  deleteAssignment: (id: string) => Promise<void>;
  resetOrganizationData: () => void;
  refreshOrganizationData: () => Promise<void>;
  isSyncing: boolean;
  updateUser: (id: string, updates: UpdateUserInput) => Promise<User>;
  addUser: (user: CreateUserInput) => Promise<User>;
}

type CreateDirectorateInput = {
  name: string;
  code: string;
  description?: string;
  executiveDirectorId?: string | null;
  isActive?: boolean;
};

type UpdateDirectorateInput = Partial<CreateDirectorateInput>;

type CreateDivisionInput = {
  name: string;
  code: string;
  directorateId: string;
  generalManagerId?: string | null;
  isActive?: boolean;
};

type UpdateDivisionInput = Partial<CreateDivisionInput>;

type CreateDepartmentInput = {
  name: string;
  code: string;
  divisionId: string;
  assistantGeneralManagerId?: string | null;
  isActive?: boolean;
};

type UpdateDepartmentInput = Partial<CreateDepartmentInput>;
type CreateUserInput = {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  systemRole?: string | null;
  gradeLevel?: string | null;
  directorateId?: string | null;
  divisionId?: string | null;
  departmentId?: string | null;
  isActive?: boolean;
  employeeId?: string | null;
};

type UpdateUserInput = {
  systemRole?: string | null;
  gradeLevel?: string | null;
  directorateId?: string | null;
  divisionId?: string | null;
  departmentId?: string | null;
  isActive?: boolean;
  email?: string;
  employeeId?: string | null;
};

export const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const unwrapResults = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && 'results' in payload) {
    const results = (payload as { results?: unknown }).results;
    if (Array.isArray(results)) return results as T[];
  }
  return [];
};

const normalizeId = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') {
    if ('id' in (value as Record<string, unknown>)) {
      return normalizeId((value as Record<string, unknown>).id);
    }
    if ('pk' in (value as Record<string, unknown>)) {
      return normalizeId((value as Record<string, unknown>).pk);
    }
  }
  return String(value);
};

const mapApiUserToUser = (user: any): User => {
  const fullName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  // system_role is now a ForeignKey (UUID), but we need the name for display
  // Backend returns system_role_name for the role name
  // Ensure we never use the UUID as the role name - only use system_role_name
  // system_role is now a ForeignKey (UUID), but we need the name for display
  // Backend returns system_role_name for the role name - ALWAYS use this
  let roleName = user.system_role_name ?? '';
  
  // UUID pattern to detect if we accidentally got a UUID instead of a name
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  // If system_role_name is missing or is a UUID, try to get it from system_role object
  if ((!roleName || uuidPattern.test(roleName)) && user.system_role && typeof user.system_role === 'object' && user.system_role.name) {
    roleName = user.system_role.name;
  }
  
  // Final check: if roleName is still a UUID or empty, set to empty string
  // We should NEVER display a UUID as the role name
  if (!roleName || uuidPattern.test(roleName)) {
    roleName = '';
  }
  return {
    id: String(user.id ?? user.username),
    username: user.username ?? undefined,
    name: fullName.length > 0 ? fullName : user.username ?? 'User',
    email: user.email ?? '',
    employeeId: user.employee_id ?? '',
    gradeLevel: user.grade_level ?? '',
    systemRole: roleName, // Use role name for display, never the UUID
    directorate: normalizeId(user.directorate ?? user.directorate_id),
    division: normalizeId(user.division ?? user.division_id),
    department: normalizeId(user.department ?? user.department_id),
    avatar: undefined,
    active: user.is_active ?? true,
    isSuperuser: user.is_superuser ?? false,
  };
};

const mapApiDirectorate = (item: any): Directorate => ({
  id: String(item.id),
  name: item.name ?? 'Directorate',
  code: item.code ?? `DIR-${String(item.id).slice(0, 6).toUpperCase()}`,
  shortName: item.short_name ?? item.shortName ?? undefined,
  description: item.description ?? '',
  executiveDirectorId: normalizeId(item.executive_director ?? item.executive_director_id),
  isActive: item.is_active ?? true,
});

const mapApiDivision = (item: any): Division => ({
  id: String(item.id),
  name: item.name ?? 'Division',
  code: item.code ?? `DIV-${String(item.id).slice(0, 6).toUpperCase()}`,
  shortName: item.short_name ?? item.shortName ?? undefined,
  directorateId: normalizeId(item.directorate ?? item.directorate_id) ?? '',
  generalManagerId:
    item.general_manager === null || item.general_manager === undefined
      ? item.general_manager
      : String(item.general_manager ?? item.general_manager_id ?? ''),
  isActive: item.is_active ?? true,
});

const mapApiDepartment = (item: any): Department => ({
  id: String(item.id),
  name: item.name ?? 'Department',
  code: item.code ?? `DEPT-${String(item.id).slice(0, 6).toUpperCase()}`,
  shortName: item.short_name ?? item.shortName ?? undefined,
  divisionId: normalizeId(item.division ?? item.division_id) ?? '',
  assistantGeneralManagerId:
    item.head_of_department === null || item.head_of_department === undefined
      ? item.head_of_department
      : String(item.head_of_department ?? item.head_of_department_id ?? ''),
  isActive: item.is_active ?? true,
});

const mapApiDelegation = (item: any): AssistantAssignment => {
  const permissions: string[] = [];
  if (item.can_minute) permissions.push('minute');
  if (item.can_forward) permissions.push('forward');
  if (item.can_approve) permissions.push('approve');

  return {
    id: String(item.id),
    executiveId: item.principal_id ?? item.principal?.id ?? '',
    assistantId: item.assistant_id ?? item.assistant?.id ?? '',
    type: item.can_approve ? 'TA' : 'PA',
    specialization: undefined,
    permissions: permissions.length > 0 ? permissions : ['view'],
  };
};

const mapApiRole = (item: any): Role => ({
  id: String(item.id),
  name: item.name ?? 'Role',
  description: item.description ?? '',
  isActive: item.is_active ?? true,
  permissions: item.permissions ?? {},
  userCount: item.user_count ?? 0,
  createdAt: item.created_at,
  updatedAt: item.updated_at,
});

const mapApiOffice = (item: any): Office => ({
  id: String(item.id),
  name: item.name ?? 'Office',
  code: item.code ?? `OFF-${String(item.id).slice(0, 6).toUpperCase()}`,
  officeType: item.office_type ?? 'custom',
  directorateId: normalizeId(item.directorate ?? item.directorate_id),
  divisionId: normalizeId(item.division ?? item.division_id),
  departmentId: normalizeId(item.department ?? item.department_id),
  parentId: normalizeId(item.parent ?? item.parent_id),
  description: item.description ?? '',
  isActive: item.is_active ?? true,
  allowExternalIntake: item.allow_external_intake ?? true,
  allowLateralRouting: item.allow_lateral_routing ?? true,
});

const mapApiOfficeMembership = (item: any): OfficeMembership => ({
  id: String(item.id),
  officeId: normalizeId(item.office ?? item.office_id) ?? '',
  officeName: item.office_name ?? item.office?.name ?? '',
  userId: normalizeId(item.user ?? item.user_id) ?? '',
  assignmentRole: item.assignment_role ?? 'staff',
  isPrimary: item.is_primary ?? false,
  canRegister: item.can_register ?? false,
  canRoute: item.can_route ?? true,
  canApprove: item.can_approve ?? false,
  startsAt: item.starts_at ?? undefined,
  endsAt: item.ends_at ?? undefined,
  isActive: item.is_active ?? true,
});

const cleanPayload = (payload: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

const sortByName = <T extends { name: string }>(items: T[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name));

const upsertById = <T extends { id: string }>(items: T[], item: T, comparator?: (items: T[]) => T[]): T[] => {
  const next = items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];

  return comparator ? comparator(next) : next;
};

const isCanonicalUser = (user: User): boolean => {
  const username = user.username ?? "";
  if (!username) return true;
  if (username === "superadmin") return true;
  return username.startsWith("user-");
};

const userDetailScore = (user: User): number => {
  let score = 0;
  if (user.division) score += 2;
  if (user.department) score += 1;
  if (user.systemRole) score += 1;
  return score;
};

const dedupeUsers = (incoming: User[]): User[] => {
  const byEmail = new Map<string, User>();

  for (const user of incoming) {
    const key = (user.email || user.id).toLowerCase();
    const existing = byEmail.get(key);

    if (!existing) {
      byEmail.set(key, user);
      continue;
    }

    const existingCanonical = isCanonicalUser(existing);
    const candidateCanonical = isCanonicalUser(user);

    if (candidateCanonical && !existingCanonical) {
      byEmail.set(key, user);
      continue;
    }

    if (candidateCanonical === existingCanonical) {
      const existingScore = userDetailScore(existing);
      const candidateScore = userDetailScore(user);
      if (candidateScore > existingScore) {
        byEmail.set(key, user);
      }
    }
  }

  return sortByName(Array.from(byEmail.values()));
};

export const OrganizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [directorates, setDirectorates] = useState<Directorate[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assistantAssignments, setAssistantAssignments] = useState<AssistantAssignment[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [officeMemberships, setOfficeMemberships] = useState<OfficeMembership[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const { currentUser, hydrated } = useCurrentUser();

  const applyDirectorateUpdate = useCallback(
    (directorate: Directorate) => {
      setDirectorates((prev) => {
        const next = upsertById(prev, directorate, sortByName);
        updateOrganizationCache();
        return next;
      });
    },
    []
  );

  const applyDivisionUpdate = useCallback(
    (division: Division) => {
      setDivisions((prev) => {
        const next = upsertById(prev, division, sortByName);
        updateOrganizationCache();
        return next;
      });
    },
    []
  );

  const applyDepartmentUpdate = useCallback(
    (department: Department) => {
      setDepartments((prev) => {
        const next = upsertById(prev, department, sortByName);
        updateOrganizationCache();
        return next;
      });
    },
    []
  );

  const applyUserUpdate = useCallback(
    (userRecord: User) => {
      setUsers((prev) => {
        const next = upsertById(prev, userRecord, sortByName);
        updateOrganizationCache();
        return next;
      });
    },
    []
  );

  const applyRoleUpdate = useCallback(
    (role: Role) => {
      setRoles((prev) => {
        const next = upsertById(prev, role, sortByName);
        return next;
      });
    },
    []
  );

  const refreshOrganizationData = useCallback(async () => {
    if (!hydrated || !currentUser || !hasTokens()) {
      logInfo('Skipping organization data refresh:', { hydrated, hasCurrentUser: !!currentUser, hasTokens: hasTokens() });
      return;
    }

    logInfo('Refreshing organization data...');
    setIsSyncing(true);
    try {
      // Helper function to safely fetch API data
      const safeApiFetch = async (url: string): Promise<any> => {
        try {
          return await apiFetch(url);
        } catch (error: any) {
          // Log 404 errors as info (endpoint doesn't exist) but other errors as warnings
          if (error?.status === 404) {
            logInfo(`Endpoint not found (skipping): ${url}`);
            return { results: [] }; // Return empty result structure
          }
          logError(`Failed to fetch ${url}:`, error);
          return { results: [] };
        }
      };

      const [
        usersDataRaw,
        directoratesRaw,
        divisionsRaw,
        departmentsRaw,
        delegationsRaw,
        rolesRaw,
        officesRaw,
        officeMembershipsRaw,
      ] = await Promise.all([
        safeApiFetch('/accounts/users/'),
        safeApiFetch('/organization/directorates/?ordering=name&page_size=500'),
        safeApiFetch('/organization/divisions/?ordering=name&page_size=500'),
        safeApiFetch('/organization/departments/?ordering=name&page_size=500'),
        safeApiFetch('/correspondence/delegations/'),
        safeApiFetch('/organization/roles/?ordering=name'),
        safeApiFetch('/organization/offices/?ordering=name&page_size=500'),
        safeApiFetch('/organization/office-memberships/?ordering=office__name&page_size=500'),
      ]);

      const unwrappedUsers = unwrapResults<any>(usersDataRaw);
      logInfo('Users API response:', { raw: usersDataRaw, unwrapped: unwrappedUsers, count: unwrappedUsers.length });
      const apiUsers = dedupeUsers(unwrappedUsers.map(mapApiUserToUser));
      const sortedUsers = sortByName(apiUsers);
      logInfo('Mapped users:', { count: sortedUsers.length, sample: sortedUsers[0] });
      setUsers(sortedUsers);

      const apiDirectorates = unwrapResults<any>(directoratesRaw).map(mapApiDirectorate);
      const apiDivisions = unwrapResults<any>(divisionsRaw).map(mapApiDivision);
      const apiDepartments = unwrapResults<any>(departmentsRaw).map(mapApiDepartment);
      const apiDelegations = unwrapResults<any>(delegationsRaw).map(mapApiDelegation);
      const apiRoles = unwrapResults<any>(rolesRaw).map(mapApiRole);
      const apiOffices = unwrapResults<any>(officesRaw).map(mapApiOffice);
      const apiOfficeMemberships = unwrapResults<any>(officeMembershipsRaw).map(mapApiOfficeMembership);

      const sortedDirectorates = sortByName(apiDirectorates);
      const sortedDivisions = sortByName(apiDivisions);
      const sortedDepartments = sortByName(apiDepartments);
      const sortedRoles = sortByName(apiRoles);

      setDirectorates(sortedDirectorates);
      setDivisions(sortedDivisions);
      setDepartments(sortedDepartments);
      setAssistantAssignments(apiDelegations);
      const sortedOffices = sortByName(apiOffices);
      setOffices(sortedOffices);
      setOfficeMemberships(apiOfficeMemberships);
      setRoles(sortedRoles);
      updateOrganizationCache();

      setHasSynced(true);
      logInfo('Organization data loaded successfully:', { users: sortedUsers.length, directorates: sortedDirectorates.length, divisions: sortedDivisions.length, departments: sortedDepartments.length });
    } catch (error) {
      logError('Failed to load organization data from API', error);
      if (error instanceof Error) {
        logError('Error details:', { message: error.message, stack: error.stack });
      }
    } finally {
      setIsSyncing(false);
    }
  }, [hydrated, currentUser]);

  useEffect(() => {
    if (!hydrated || !currentUser || !hasTokens()) {
      return;
    }

    if (!hasSynced) {
      void refreshOrganizationData();
    }
  }, [hydrated, currentUser, hasSynced, refreshOrganizationData]);

  useEffect(() => {
    if (hydrated && currentUser && hasTokens()) {
      setHasSynced(false);
    }
  }, [currentUser?.id, hydrated]);

  const buildDirectoratePayload = (input: Partial<CreateDirectorateInput>) =>
    cleanPayload({
      name: input.name,
      code: input.code,
      description: input.description,
      executive_director:
        input.executiveDirectorId === undefined
          ? undefined
          : input.executiveDirectorId
          ? input.executiveDirectorId
          : null,
      is_active: input.isActive,
    });

  const buildDivisionPayload = (input: Partial<CreateDivisionInput>) =>
    cleanPayload({
      name: input.name,
      code: input.code,
      directorate: input.directorateId,
      general_manager:
        input.generalManagerId === undefined
          ? undefined
          : input.generalManagerId
          ? input.generalManagerId
          : null,
      is_active: input.isActive,
    });

  const buildDepartmentPayload = (input: Partial<CreateDepartmentInput>) =>
    cleanPayload({
      name: input.name,
      code: input.code,
      division: input.divisionId,
      head_of_department:
        input.assistantGeneralManagerId === undefined
          ? undefined
          : input.assistantGeneralManagerId
          ? input.assistantGeneralManagerId
          : null,
      is_active: input.isActive,
    });

  const buildUserPayload = (input: UpdateUserInput) =>
    cleanPayload({
      system_role: input.systemRole,
      grade_level: input.gradeLevel,
      directorate: input.directorateId === undefined ? undefined : input.directorateId || null,
      division: input.divisionId === undefined ? undefined : input.divisionId || null,
      department: input.departmentId === undefined ? undefined : input.departmentId || null,
      is_active: input.isActive,
      email: input.email,
      employee_id: input.employeeId === undefined ? undefined : input.employeeId ?? null,
    });

  const buildCreateUserPayload = (input: CreateUserInput) =>
    cleanPayload({
      username: input.username,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      password: input.password,
      system_role: input.systemRole,
      grade_level: input.gradeLevel,
      directorate: input.directorateId === undefined ? undefined : input.directorateId || null,
      division: input.divisionId === undefined ? undefined : input.divisionId || null,
      department: input.departmentId === undefined ? undefined : input.departmentId || null,
      is_active: input.isActive !== undefined ? input.isActive : true,
      employee_id: input.employeeId === undefined ? undefined : input.employeeId ?? null,
    });

  const addDirectorate = async (directorate: CreateDirectorateInput) => {
    const payload = buildDirectoratePayload(directorate);
    const response = await apiFetch('/organization/directorates/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = mapApiDirectorate(response);
    applyDirectorateUpdate(created);
    return created;
  };

  const updateDirectorate = async (id: string, updates: UpdateDirectorateInput) => {
    const payload = buildDirectoratePayload(updates);
    if (Object.keys(payload).length === 0) {
      return directorates.find((dir) => dir.id === id) ?? null;
    }
    const response = await apiFetch(`/organization/directorates/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const updated = mapApiDirectorate(response);
    applyDirectorateUpdate(updated);
    return updated;
  };

  const deleteDirectorate = async (id: string) => {
    const response = await apiFetch(`/organization/directorates/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });
    const updated = mapApiDirectorate(response);
    applyDirectorateUpdate(updated);
    return updated;
  };

  const addDivision = async (division: CreateDivisionInput) => {
    const payload = buildDivisionPayload(division);
    const response = await apiFetch('/organization/divisions/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = mapApiDivision(response);
    applyDivisionUpdate(created);
    return created;
  };

  const updateDivision = async (id: string, updates: UpdateDivisionInput) => {
    const payload = buildDivisionPayload(updates);
    if (Object.keys(payload).length === 0) {
      return divisions.find((div) => div.id === id) ?? null;
    }
    const response = await apiFetch(`/organization/divisions/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const updated = mapApiDivision(response);
    applyDivisionUpdate(updated);
    return updated;
  };

  const deleteDivision = async (id: string) => {
    const response = await apiFetch(`/organization/divisions/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });
    const updated = mapApiDivision(response);
    applyDivisionUpdate(updated);
    return updated;
  };

  const addDepartment = async (department: CreateDepartmentInput) => {
    const payload = buildDepartmentPayload(department);
    const response = await apiFetch('/organization/departments/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = mapApiDepartment(response);
    applyDepartmentUpdate(created);
    return created;
  };

  const updateDepartment = async (id: string, updates: UpdateDepartmentInput) => {
    const payload = buildDepartmentPayload(updates);
    if (Object.keys(payload).length === 0) {
      return departments.find((dept) => dept.id === id) ?? null;
    }
    const response = await apiFetch(`/organization/departments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const updated = mapApiDepartment(response);
    applyDepartmentUpdate(updated);
    return updated;
  };

  const deleteDepartment = async (id: string) => {
    const response = await apiFetch(`/organization/departments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });
    const updated = mapApiDepartment(response);
    applyDepartmentUpdate(updated);
    return updated;
  };

  const addUser = async (user: CreateUserInput) => {
    const payload = buildCreateUserPayload(user);
    const response = await apiFetch('/accounts/users/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = mapApiUserToUser(response);
    applyUserUpdate(created);
    return created;
  };

  const updateUser = async (id: string, updates: UpdateUserInput) => {
    const payload = buildUserPayload(updates);
    if (Object.keys(payload).length === 0) {
      const existing = users.find((user) => user.id === id);
      if (!existing) {
        throw new Error('User not found in context.');
      }
      return existing;
    }

    const response = await apiFetch(`/accounts/users/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    const updatedUser = mapApiUserToUser(response);
    applyUserUpdate(updatedUser);
    return updatedUser;
  };

  const applyAssignmentUpdate = useCallback(
    (assignment: AssistantAssignment) => {
      setAssistantAssignments((prev) => {
        const next = upsertById(prev, assignment);
        return next;
      });
    },
    []
  );

  const buildDelegationPayload = (assignment: Omit<AssistantAssignment, 'id'> | Partial<AssistantAssignment>) => {
    const permissions = ('permissions' in assignment && assignment.permissions) ? assignment.permissions : [];
    const type = 'type' in assignment ? assignment.type : undefined;
    
    // Determine can_approve from type or permissions
    const canApprove = type === 'TA' || (Array.isArray(permissions) && permissions.includes('approve'));
    const canMinute = Array.isArray(permissions) && (permissions.includes('minute') || permissions.includes('view'));
    const canForward = Array.isArray(permissions) && (permissions.includes('forward') || permissions.includes('view'));

    return cleanPayload({
      principal_id: 'executiveId' in assignment ? assignment.executiveId : undefined,
      assistant_id: 'assistantId' in assignment ? assignment.assistantId : undefined,
      can_approve: canApprove,
      can_minute: canMinute,
      can_forward: canForward,
      active: 'permissions' in assignment ? true : undefined, // Default to active for new assignments
    });
  };

  const addAssignment = async (assignment: Omit<AssistantAssignment, 'id'>) => {
    const payload = buildDelegationPayload(assignment);
    const response = await apiFetch('/correspondence/delegations/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = mapApiDelegation(response);
    applyAssignmentUpdate(created);
    return created;
  };

  const updateAssignment = async (id: string, updates: Partial<AssistantAssignment>) => {
    const existing = assistantAssignments.find((a) => a.id === id);
    if (!existing) {
      throw new Error('Assignment not found');
    }

    const merged = { ...existing, ...updates };
    const payload = buildDelegationPayload(merged);
    
    const response = await apiFetch(`/correspondence/delegations/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const updated = mapApiDelegation(response);
    applyAssignmentUpdate(updated);
    return updated;
  };

  const deleteAssignment = async (id: string) => {
    // Soft delete by setting active to false, or hard delete
    await apiFetch(`/correspondence/delegations/${id}/`, {
      method: 'DELETE',
    });
    setAssistantAssignments((prev) => prev.filter((assign) => assign.id !== id));
  };

  const addRole = async (role: CreateRoleInput): Promise<Role> => {
    const response = await apiFetch('/organization/roles/', {
      method: 'POST',
      body: JSON.stringify({
        name: role.name,
        description: role.description ?? '',
        is_active: role.isActive ?? true,
        permissions: role.permissions ?? {},
      }),
    });
    const created = mapApiRole(response);
    applyRoleUpdate(created);
    return created;
  };

  const updateRole = async (id: string, updates: UpdateRoleInput): Promise<Role | null> => {
    try {
      const response = await apiFetch(`/organization/roles/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: updates.name,
          description: updates.description,
          is_active: updates.isActive,
          permissions: updates.permissions,
        }),
      });
      const updated = mapApiRole(response);
      applyRoleUpdate(updated);
      return updated;
    } catch (error) {
      logError('Failed to update role', error);
      return null;
    }
  };

  const deleteRole = async (id: string): Promise<void> => {
    await apiFetch(`/organization/roles/${id}/`, {
      method: 'DELETE',
    });
    setRoles((prev) => prev.filter((role) => role.id !== id));
  };

  const resetOrganizationData = useCallback(() => {
    setDirectorates([]);
    setDivisions([]);
    setDepartments([]);
    setAssistantAssignments([]);
    setOffices([]);
    setOfficeMemberships([]);
    setUsers([]);
    setRoles([]);
    setHasSynced(false);
    updateOrganizationCache();
  }, []);

  return (
    <OrganizationContext.Provider
      value={{
        directorates,
        divisions,
        departments,
        assistantAssignments,
        offices,
        officeMemberships,
        users,
        roles,
        addRole,
        updateRole,
        deleteRole,
        addDirectorate,
        updateDirectorate,
        deleteDirectorate,
        addDivision,
        updateDivision,
        deleteDivision,
        addDepartment,
        updateDepartment,
        deleteDepartment,
        addAssignment,
        updateAssignment,
        deleteAssignment,
        resetOrganizationData,
        refreshOrganizationData,
        isSyncing,
        updateUser,
        addUser,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
};