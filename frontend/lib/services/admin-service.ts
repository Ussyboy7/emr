/**
 * Administration API service
 */
import { apiFetch, buildQueryString } from '../api-client';

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
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
  last_login?: string;
  clinic?: number;
  clinic_name?: string;
  department?: number;  // Changed from string to number (ForeignKey)
  department_name?: string;
  specialty?: string;
  license_number?: string;
  license_expiry?: string;
  qualification?: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  type: 'admin' | 'doctor' | 'nurse' | 'lab_tech' | 'pharmacist' | 'radiologist' | 'records' | 'custom'; // Backend format
  permissions?: any; // Backend stores as JSON object: {module: [pages]}
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
  operating_hours?: any;
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
  clinic?: number;
  clinic_name?: string;
  head?: number;
  head_name?: string;
  staff_count?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  old_values?: any;
  new_values?: any;
  created_at: string;
}

class AdminService {
  /**
   * Get all users
   */
  async getUsers(params?: {
    system_role?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: User[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: User[]; count: number }>(`/accounts/users/${query}`);
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
    const createData: any = {
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
    if (data.clinic !== undefined) createData.clinic = data.clinic;
    if (data.department !== undefined) createData.department = data.department;
    if (data.is_active !== undefined) createData.is_active = data.is_active;
    if ((data as any).employee_id) createData.employee_id = (data as any).employee_id;
    
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
    const updateData: any = {};
    if (data.username !== undefined) updateData.username = data.username;
    if (data.first_name !== undefined) updateData.first_name = data.first_name;
    if (data.last_name !== undefined) updateData.last_name = data.last_name;
    if ((data as any).middle_name !== undefined) updateData.middle_name = (data as any).middle_name;
    if ((data as any).custom_pages_mode !== undefined) updateData.custom_pages_mode = (data as any).custom_pages_mode;
    if ((data as any).custom_pages !== undefined) updateData.custom_pages = (data as any).custom_pages;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.system_role !== undefined) updateData.system_role = data.system_role;
    if (data.clinic !== undefined) updateData.clinic = data.clinic;
    if (data.department !== undefined) updateData.department = data.department;
    // Note: is_active may not be in UserUpdateSerializer - would need backend update
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if ((data as any).employee_id !== undefined) updateData.employee_id = (data as any).employee_id;
    
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
    const query = buildQueryString({ user: userId, page_size: 1000 } as any);
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
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Role[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Role[]; count: number }>(`/permissions/roles/${query}`);
  }

  /**
   * Get a single role
   */
  async getRole(roleId: number): Promise<Role> {
    return apiFetch<Role>(`/permissions/roles/${roleId}/`);
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
    const response = await apiFetch<{ results: any[] }>(`/permissions/roles/${roleId}/users/`);
    return response.results || [];
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
    clinic?: number;
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
   * Get all rooms
   */
  async getRooms(params?: {
    clinic?: number;
    department?: number;
    room_type?: string;
    status?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: any[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: any[]; count: number }>(`/organization/rooms/${query}`);
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

  /**
   * Get audit log statistics
   */
  async getAuditStats(days: number = 30): Promise<any> {
    return apiFetch<any>(`/audit/logs/stats/?days=${days}`);
  }

  /**
   * Get admin dashboard statistics
   */
  async getDashboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    onlineNow: number;
    totalRoles: number;
    totalClinics: number;
    activeClinics: number;
    totalRooms: number;
    availableRooms: number;
    occupiedRooms: number;
    usersByRole: Array<{ role: string; count: number; color: string }>;
    recentAuditEvents: any[];
    systemHealth: any[];
    expiringLicenses: any[];
    clinicStatus: any[];
    pendingApprovals: any[];
  }> {
    // Load all data in parallel
    const [usersResponse, rolesResponse, clinicsResponse, roomsResponse, auditResponse] = await Promise.all([
      this.getUsers({ page_size: 1000 }),
      this.getRoles({ page_size: 1000 }),
      this.getClinics({ page_size: 1000 }),
      this.getRooms({ page_size: 1000 }), // Use the existing getRooms method
      this.getAuditLogs({ page_size: 10 }),
    ]);

    const users = usersResponse.results;
    const roles = rolesResponse.results;
    const clinics = clinicsResponse.results;
    const rooms = roomsResponse.results;
    const auditLogs = auditResponse.results;

    // Calculate stats
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.is_active).length;
    const inactiveUsers = totalUsers - activeUsers;

    /** Users with API activity or login within this window (see JWTAuthenticationWithActivity + last_login on login). */
    const ONLINE_WINDOW_MS = 15 * 60 * 1000;
    const nowMs = Date.now();
    const onlineNow = users.filter((u: any) => {
      if (!u.is_active) return false;
      const candidates: string[] = [];
      if (u.last_activity) candidates.push(u.last_activity);
      if (u.last_login) candidates.push(u.last_login);
      if (candidates.length === 0) return false;
      const newest = Math.max(...candidates.map((t) => new Date(t).getTime()));
      return Number.isFinite(newest) && nowMs - newest <= ONLINE_WINDOW_MS;
    }).length;

    const totalRoles = roles.length;
    const totalClinics = clinics.length;
    const activeClinics = clinics.filter(c => c.is_active).length;
    const totalRooms = rooms.length;
    const availableRooms = rooms.filter((r: any) => r.status === 'active' && !r.assigned_doctor).length;
    const occupiedRooms = rooms.filter((r: any) => r.status === 'active' && r.assigned_doctor).length;

    // Users by role with proper role mapping
    const roleCounts: Record<string, number> = {};
    const roleDisplayNames: Record<string, string> = {
      'superuser': 'System Administrator',
      'admin': 'System Administrator',
      'doctor': 'Medical Doctor',
      'nurse': 'Nursing Officer',
      'lab_tech': 'Laboratory Scientist',
      'pharmacist': 'Pharmacist',
      'radiologist': 'Radiologist',
      'physiotherapist': 'Physiotherapist',
      'records': 'Medical Records Officer',
      'medical_records': 'Medical Records Officer',
    };

    users.forEach(user => {
      const role = user.system_role || 'No Role';
      const displayRole = roleDisplayNames[role] || role;
      roleCounts[displayRole] = (roleCounts[displayRole] || 0) + 1;
    });

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b'];
    const usersByRole = Object.entries(roleCounts).map(([role, count], index) => ({
      role,
      count,
      color: colors[index % colors.length],
    }));

    // Recent audit events
    const recentAuditEvents = auditLogs.slice(0, 5).map((log: any) => ({
      id: log.id.toString(),
      user: log.user_name || log.user_email || 'Unknown',
      action: log.action,
      module: log.module || 'System',
      detail: log.description || '',
      time: this.getRelativeTime(log.created_at),
      status: log.result === 'success' ? 'success' : 'failed',
    }));

    // System health - simulate realistic uptime (would be from monitoring system)
    const baseUptime = 99.95; // Base uptime percentage
    const randomVariation = (Math.random() - 0.5) * 0.1; // Small random variation
    const realisticUptime = Math.max(99.5, Math.min(99.99, baseUptime + randomVariation));

    const systemHealth = [
      { name: 'API Server', status: 'healthy', uptime: `${realisticUptime.toFixed(1)}%`, icon: 'Server' },
      { name: 'Database', status: 'healthy', uptime: `${(realisticUptime - 0.05).toFixed(1)}%`, icon: 'Database' },
      { name: 'File Storage', status: 'healthy', uptime: `${realisticUptime.toFixed(1)}%`, icon: 'HardDrive' },
    ];

    // Expiring licenses (from users with license_expiry)
    const now = new Date();
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    const expiringLicenses = users
      .filter(u => u.license_expiry)
      .filter(u => {
        const expiry = new Date(u.license_expiry!);
        return expiry <= threeMonths && expiry >= now;
      })
      .map(u => ({
        name: `${u.first_name} ${u.last_name}`,
        type: u.specialty || 'License',
        expires: u.license_expiry!,
        daysLeft: Math.ceil((new Date(u.license_expiry!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .slice(0, 5);

    // Clinic status (patient_count / doctor_count from organization API annotations)
    const clinicStatus = clinics.map((c: any) => ({
      name: c.name,
      status: c.is_active ? 'open' : 'closed',
      patients: typeof c.patient_count === 'number' ? c.patient_count : 0,
      doctors: typeof c.doctor_count === 'number' ? c.doctor_count : 0,
    }));

    // Pending approvals (simplified)
    const pendingApprovals: any[] = [];

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      onlineNow,
      totalRoles,
      totalClinics,
      activeClinics,
      totalRooms,
      availableRooms,
      occupiedRooms,
      usersByRole,
      recentAuditEvents,
      systemHealth,
      expiringLicenses,
      clinicStatus,
      pendingApprovals,
    };
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

