/**
 * Administration API service
 */
import { apiFetch, buildQueryString } from '../api-client';
import { MAX_LIST_PAGE_SIZE } from '../pagination-constants';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  custom_pages_mode?: '' | 'replace' | 'add' | 'restrict';
  custom_pages?: string[];
  employee_id?: string;
  phone?: string;
  system_role?: string;
  access_role_id?: number | null;
  access_role_name?: string;
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
  last_login?: string;
  last_activity?: string;
  location_clinic?: number;
  location_clinic_name?: string;
  department?: number;  // Changed from string to number (ForeignKey)
  department_name?: string;
  specialty?: string;
  license_number?: string;
  license_expiry?: string;
  qualification?: string;
  location_clinics?: number[];  // Multi-clinic M2M assignments
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  type: 'admin' | 'doctor' | 'nurse' | 'lab_tech' | 'pharmacist' | 'radiologist' | 'records' | 'custom'; // Backend format
  permissions?: Record<string, string[]>; // Backend stores as JSON object: {module: [pages]}
  is_active: boolean;
  user_count?: number;
  created_at: string;
  updated_at: string;
}

export interface UserRoleAssignment {
  id: number;
  user: number;
  role: number;
  assigned_at?: string;
  assigned_by?: number | null;
}

export interface Clinic {
  id: number;
  code: string;
  name: string;
  description?: string;
  location?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  default_processing_clinic?: number | null;
  operating_hours?: Record<string, unknown>;
  services?: string[];
  staff_count?: number;
  room_count?: number;
  head?: number;
  head_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  description?: string;
  location_clinic?: number;
  clinic_name?: string;
  head?: number;
  head_name?: string;
  deputy_head?: number;
  deputy_head_name?: string;
  staff_count?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** GET /notifications/routing-matrix/ — admin notification audience hints. */
export interface NotificationRoutingMatrixResponse {
  source: 'default' | 'override';
  defaults?: Record<string, string[]>;
  matrix: Record<string, string[]>;
  description?: string;
}

/** Master OPD visit clinic (GOPD, Eye Clinic, …) — not the physical facility. */
export interface OutpatientClinicType {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FacilityVisitClinicRow {
  id: number;
  name: string;
  code: string;
}

export interface AuditLog {
  id: number;
  user?: number;
  user_name?: string;
  user_email?: string;
  user_role?: string;
  action: string;
  object_type?: string;
  object_id?: number;
  object_repr?: string;
  module?: string;
  description?: string;
  severity?: string;
  result: 'success' | 'failure' | 'warning';
  ip_address?: string;
  user_agent?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  created_at: string;
}

class AdminService {
  /**
   * Get all users
   */
  async getUsers(params?: {
    system_role?: string;
    access_role?: number | string;
    is_active?: boolean;
    department?: number;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: User[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: User[]; count: number }>(`/accounts/users/${query}`);
  }

  async getUserStats(): Promise<{
    total_active: number;
    by_system_role: Record<string, number>;
  }> {
    return apiFetch('/accounts/users/stats/');
  }

  async getUserRoleAssignmentSummary(): Promise<{
    assignments: number;
    unique_users: number;
  }> {
    return apiFetch('/permissions/user-roles/summary/');
  }

  /**
   * Get a single user
   */
  async getUser(userId: number): Promise<User> {
    return apiFetch<User>(`/accounts/users/${userId}/`);
  }

  /**
   * Create a new user
   */
  async createUser(data: Partial<User>): Promise<User> {
    // Map frontend fields to backend fields
    const createData: Record<string, unknown> = {
      username: (data as any).username || (data as any).email || `user_${Date.now()}`,
      email: data.email,
      first_name: (data as any).first_name || (data as any).firstName,
      last_name: (data as any).last_name || (data as any).lastName,
      middle_name: (data as any).middle_name || (data as any).middleName,
      password: (data as any).password || 'TempPassword123!',
      password_confirm: (data as any).password || 'TempPassword123!',
    };
    
    if (data.phone) createData.phone = data.phone;
    if (data.system_role) createData.system_role = data.system_role;
    if (data.location_clinic !== undefined) createData.location_clinic = data.location_clinic;
    if (data.department !== undefined) createData.department = data.department;
    if (data.is_active !== undefined) createData.is_active = data.is_active;
    if ((data as any).employee_id) createData.employee_id = (data as any).employee_id;
    if ((data as any).access_role_id !== undefined) createData.access_role_id = (data as any).access_role_id;
    if (data.location_clinics !== undefined) createData.location_clinics = data.location_clinics;
    
    return apiFetch<User>('/accounts/users/', {
      method: 'POST',
      body: JSON.stringify(createData),
    });
  }

  /**
   * Update a user
   */
  async updateUser(userId: number, data: Partial<User>): Promise<User> {
    // Map frontend fields to backend fields
    const updateData: Record<string, unknown> = {};
    if (data.username !== undefined) updateData.username = data.username;
    if (data.first_name !== undefined) updateData.first_name = data.first_name;
    if (data.last_name !== undefined) updateData.last_name = data.last_name;
    if ((data as any).middle_name !== undefined) updateData.middle_name = (data as any).middle_name;
    if ((data as any).custom_pages_mode !== undefined) updateData.custom_pages_mode = (data as any).custom_pages_mode;
    if ((data as any).custom_pages !== undefined) updateData.custom_pages = (data as any).custom_pages;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.system_role !== undefined) updateData.system_role = data.system_role;
    if (data.location_clinic !== undefined) updateData.location_clinic = data.location_clinic;
    if (data.department !== undefined) updateData.department = data.department;
    // Note: is_active may not be in UserUpdateSerializer - would need backend update
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if ((data as any).employee_id !== undefined) updateData.employee_id = (data as any).employee_id;
    if (data.location_clinics !== undefined) updateData.location_clinics = data.location_clinics;
    
    return apiFetch<User>(`/accounts/users/${userId}/`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });
  }

  /**
   * Assign an access Role to a user (drives `permissions.pages` for routing).
   */
  async assignRoleToUser(userId: number, roleId: number): Promise<UserRoleAssignment> {
    return apiFetch<UserRoleAssignment>('/permissions/user-roles/', {
      method: 'POST',
      body: JSON.stringify({ user: userId, role: roleId }),
    });
  }

  /**
   * Get role assignments for a user.
   */
  async getUserRoleAssignments(userId: number): Promise<UserRoleAssignment[]> {
    const query = buildQueryString({ user: userId, page_size: MAX_LIST_PAGE_SIZE } as any);
    const res = await apiFetch<{ results: UserRoleAssignment[] }>(`/permissions/user-roles/${query}`);
    return res.results || [];
  }

  /**
   * Delete a role assignment row.
   */
  async deleteUserRoleAssignment(id: number): Promise<void> {
    await apiFetch<void>(`/permissions/user-roles/${id}/`, { method: 'DELETE' });
  }

  /**
   * Delete a user
   */
  async deleteUser(userId: number): Promise<void> {
    return apiFetch<void>(`/accounts/users/${userId}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Reset user password (admin action)
   */
  async resetPassword(userId: number, newPassword: string): Promise<void> {
    return apiFetch<void>(`/accounts/users/${userId}/reset_password/`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
  }

  /**
   * Toggle user status
   */
  async toggleUserStatus(userId: number): Promise<User> {
    const user = await this.getUser(userId);
    return this.updateUser(userId, { is_active: !user.is_active });
  }

  /**
   * Get all roles
   */
  async getRoles(params?: {
    type?: string;
    /** Maps to backend grouped role types (system / clinical / administrative / custom). */
    type_group?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Role[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Role[]; count: number }>(`/permissions/roles/${query}`);
  }

  async getRoleListStats(): Promise<{
    total: number;
    active: number;
    clinical: number;
    totalUsers: number;
  }> {
    return apiFetch('/permissions/roles/list-stats/');
  }

  /**
   * Get system roles (professional roles)
   */
  async getSystemRoles(): Promise<{results: Array<{id: number, name: string, description: string, is_active: boolean}>}> {
    return apiFetch<{results: Array<{id: number, name: string, description: string, is_active: boolean}>}>('/accounts/system-roles/');
  }



  /**
   * Create a new role
   */
  async createRole(data: Partial<Role>): Promise<Role> {
    return apiFetch<Role>('/permissions/roles/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a role
   */
  async updateRole(roleId: number, data: Partial<Role>): Promise<Role> {
    return apiFetch<Role>(`/permissions/roles/${roleId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a role
   */
  async deleteRole(roleId: number): Promise<void> {
    return apiFetch<void>(`/permissions/roles/${roleId}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Get users with a specific role
   */
  async getRoleUsers(roleId: number): Promise<User[]> {
    const response = await apiFetch<{ results: User[] }>(`/permissions/roles/${roleId}/users/`);
    return response.results || [];
  }

  async getRoleEffectiveAccess(roleId: number): Promise<{
    pages: string[];
    capabilities: string[];
    explicit_capabilities: string[];
    implied_capabilities: string[];
    capability_details: { id: string; name: string; module: string; description: string }[];
    api_families: { page: string; pattern: string; methods: string; note: string }[];
  }> {
    return apiFetch(`/permissions/roles/${roleId}/effective-access/`);
  }

  /**
   * Get all clinics
   */
  async getClinics(params?: {
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Clinic[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Clinic[]; count: number }>(`/organization/clinics/${query}`);
  }

  async getWorkLocations(params?: {
    is_active?: boolean;
    search?: string;
  }): Promise<{ results: { id: number; name: string }[] }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: { id: number; name: string }[] }>(`/organization/work-locations/${query}`);
  }

  /** Full-org KPIs for Admin → Facilities & Departments (not paginated). */
  async getClinicAdminStats(): Promise<{
    total_clinics: number;
    active_clinics: number;
    total_departments: number;
    total_staff_links: number;
    total_rooms: number;
  }> {
    return apiFetch(`/organization/clinics/admin-stats/`);
  }

  /**
   * Get a single clinic
   */
  async getClinic(clinicId: number): Promise<Clinic> {
    return apiFetch<Clinic>(`/organization/clinics/${clinicId}/`);
  }

  /**
   * Create a new clinic
   */
  async createClinic(data: Partial<Clinic>): Promise<Clinic> {
    return apiFetch<Clinic>('/organization/clinics/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a clinic
   */
  async updateClinic(clinicId: number, data: Partial<Clinic>): Promise<Clinic> {
    return apiFetch<Clinic>(`/organization/clinics/${clinicId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a clinic
   */
  async deleteClinic(clinicId: number): Promise<void> {
    return apiFetch<void>(`/organization/clinics/${clinicId}/`, {
      method: 'DELETE',
    });
  }

  /** OPD visit clinic types offered at a facility (ordered). */
  async getFacilityVisitClinics(facilityId: number): Promise<FacilityVisitClinicRow[]> {
    return apiFetch<FacilityVisitClinicRow[]>(
      `/organization/clinics/${facilityId}/visit_clinics/`
    );
  }

  /** Replace which OPD types are offered at this facility. */
  async setFacilityVisitClinics(
    facilityId: number,
    typeIds: number[]
  ): Promise<FacilityVisitClinicRow[]> {
    return apiFetch<FacilityVisitClinicRow[]>(
      `/organization/clinics/${facilityId}/visit_clinics/`,
      {
        method: 'PUT',
        body: JSON.stringify({ type_ids: typeIds }),
      }
    );
  }

  async getOutpatientClinicTypes(params?: {
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: OutpatientClinicType[]; count: number }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | boolean | undefined>);
    return apiFetch<{ results: OutpatientClinicType[]; count: number }>(
      `/organization/outpatient-clinic-types/${query}`
    );
  }

  async createOutpatientClinicType(
    data: Partial<Pick<OutpatientClinicType, 'name' | 'code' | 'description' | 'is_active' | 'sort_order'>>
  ): Promise<OutpatientClinicType> {
    return apiFetch<OutpatientClinicType>('/organization/outpatient-clinic-types/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOutpatientClinicType(
    id: number,
    data: Partial<Pick<OutpatientClinicType, 'name' | 'code' | 'description' | 'is_active' | 'sort_order'>>
  ): Promise<OutpatientClinicType> {
    return apiFetch<OutpatientClinicType>(`/organization/outpatient-clinic-types/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteOutpatientClinicType(id: number): Promise<void> {
    return apiFetch<void>(`/organization/outpatient-clinic-types/${id}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Get all departments
   */
  async getDepartments(params?: {
    location_clinic?: number;
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Department[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Department[]; count: number }>(`/organization/departments/${query}`);
  }

  /**
   * Get a single department
   */
  async getDepartment(deptId: number): Promise<Department> {
    return apiFetch<Department>(`/organization/departments/${deptId}/`);
  }

  /**
   * Create a new department
   */
  async createDepartment(data: Partial<Department>): Promise<Department> {
    return apiFetch<Department>('/organization/departments/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a department
   */
  async updateDepartment(deptId: number, data: Partial<Department>): Promise<Department> {
    return apiFetch<Department>(`/organization/departments/${deptId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get all rooms.
   *
   * Hits ``/consultation/rooms/`` (``ConsultationRoom`` — the model the
   * Room Management page at ``/admin/rooms`` actually manages). The
   * older ``/organization/rooms/`` endpoint exposes a *different*
   * ``organization.Room`` table that has no UI today and is typically
   * empty, which is what caused the admin dashboard to show
   * ``Rooms: 0`` while the management page listed 11 rows.
   */
  async getRooms(params?: {
    location_clinic?: number;
    department?: number;
    room_type?: string;
    status?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Record<string, unknown>[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Record<string, unknown>[]; count: number }>(`/consultation/rooms/${query}`);
  }

  /**
   * Delete a department
   */
  async deleteDepartment(deptId: number): Promise<void> {
    return apiFetch<void>(`/organization/departments/${deptId}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(params?: {
    user?: number;
    action?: string;
    module?: string;
    object_type?: string;
    result?: string;
    severity?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: AuditLog[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: AuditLog[]; count: number }>(`/audit/logs/${query}`);
  }

  async getAuditModules(): Promise<{ results: string[] }> {
    return apiFetch<{ results: string[] }>(`/audit/logs/modules/`);
  }

  /**
   * Get audit log statistics
   */
  async getAuditStats(days: number = 30): Promise<any> {
    return apiFetch<any>(`/audit/logs/stats/?days=${days}`);
  }

  /**
   * Lightweight payload for the admin dashboard auto-poll. Returns
   * just the data that actually changes every few seconds (online
   * count + live system health) without dragging in the heavy
   * users/roles/audit fetches that `getDashboardStats()` does.
   *
   * The server caps work to a single `COUNT` against `users` plus the
   * three local probes (process clock, `SELECT 1`, `statvfs`), so this
   * is safe to call on a 30 s timer.
   */
  async getDashboardLive(): Promise<{
    onlineNow: number;
    presenceWindowSeconds: number;
    systemHealth: Record<string, unknown>[];
    serverTime: string;
  }> {
    return apiFetch<{
      onlineNow: number;
      presenceWindowSeconds: number;
      systemHealth: Record<string, unknown>[];
      serverTime: string;
    }>('/common/dashboard/live/');
  }

  /**
   * Notification routing matrix (role → department hints). Staff / superuser /
   * System Administrator only.
   */
  async getNotificationRoutingMatrix(): Promise<NotificationRoutingMatrixResponse> {
    return apiFetch<NotificationRoutingMatrixResponse>('/notifications/routing-matrix/');
  }

  async updateNotificationRoutingMatrix(
    matrix: Record<string, string[]>,
  ): Promise<{ source: string; matrix: Record<string, string[]> }> {
    return apiFetch<{ source: string; matrix: Record<string, string[]> }>(
      '/notifications/routing-matrix/',
      {
        method: 'PATCH',
        body: JSON.stringify({ matrix }),
      },
    );
  }

  async resetNotificationRoutingMatrix(): Promise<{
    source: string;
    matrix: Record<string, string[]>;
  }> {
    return apiFetch<{ source: string; matrix: Record<string, string[]> }>(
      '/notifications/routing-matrix/',
      { method: 'DELETE' },
    );
  }

  /**
   * Get admin dashboard statistics
   */
  async getDashboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    onlineNow: number;
    presenceWindowSeconds: number;
    totalRoles: number;
    /** Roles that have at least one user assigned. */
    rolesInUse: number;
    totalClinics: number;
    activeClinics: number;
    totalRooms: number;
    availableRooms: number;
    occupiedRooms: number;
    usersByRole: Array<{ role: string; count: number; color: string }>;
    recentAuditEvents: Record<string, unknown>[];
    systemHealth: Record<string, unknown>[];
    expiringLicenses: Record<string, unknown>[];
    clinicStatus: Record<string, unknown>[];
    pendingApprovals: Record<string, unknown>[];
    /** Only set when /common/metrics/ flags it as `live`. */
    responseTimeMs?: number;
    /** Only set when /common/metrics/ flags it as `live`. */
    errorRate?: number;
    /** Number of requests measured in the rolling 5-minute window. */
    responseTimeSample?: number;
    /** Cumulative MEDIA_ROOT size. */
    mediaStorageGb?: number;
    backupStatus?: Record<string, unknown>;
    /** Per-key data source: 'live' (real measurement) or 'sample' (placeholder). */
    metricSources?: Record<string, 'live' | 'sample'>;
  }> {
    return apiFetch('/common/dashboard/admin/');
  }

  /**
   * Live infrastructure metrics (health probes, backup scan, API timing).
   */
  async getSystemMetrics(): Promise<{
    systemHealth: Record<string, unknown>[];
    backupStatus?: Record<string, unknown>;
    responseTimeMs?: number;
    errorRate?: number;
    responseTimeSample?: number;
    mediaStorageGb?: number;
    sources?: Record<string, 'live' | 'sample'>;
  }> {
    return apiFetch('/common/metrics/');
  }

  /** Superuser-only: download the newest dump under allowed backup directories. */
  async downloadLatestBackup(): Promise<Blob> {
    return apiFetch<Blob>('/common/backups/latest/download/', {
      responseType: 'blob',
    });
  }

  async getOnlineUsers(): Promise<{
    users: Array<{
      id: number;
      name: string;
      email: string;
      role: string;
      clinic: string | null;
      lastActivity: string | null;
    }>;
    count: number;
    presenceWindowSeconds: number;
  }> {
    return apiFetch('/common/online-users/');
  }

  private getRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
}

export const adminService = new AdminService();

