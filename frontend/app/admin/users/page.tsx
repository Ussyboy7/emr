"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAdminPageAuth } from "@/hooks/use-admin-page-auth";
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { UI_TRANSITION_DELAY } from '@/lib/constants/ui';
import { formatDisplayDateTime } from '@/lib/dates';
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { adminService, type User as ApiUser, type Role as ApiRole } from "@/lib/services";
import { convertPermissionsFromBackend, groupPagePermissionsByModule, normalizeRolePagePaths, sortPageModules } from "@/lib/page-permissions";
import { getAccessRoleBadgeClass, getAccessRoleIcon } from "@/lib/access-role-display";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  Users, Search, Plus, Edit, Trash2, MoreVertical, Eye, UserCog, Shield,
  Building2, AlertTriangle, CheckCircle2, UserPlus, Key, Lock, Unlock, Loader2, Download, XCircle,
} from "lucide-react";

// Types
interface StaffMember {
  id: string;
  username: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone?: string;
  accessRoleId?: number;
  accessRoleName?: string;
  restrictedPages?: string[];
  status: string;
  employeeId?: string;
  lastLogin?: string;
  clinics?: number[];
  departmentId?: number;
  departmentName?: string;
}

interface Clinic {
  id: number;
  name: string;
  code: string;
}

interface Department {
  id: number;
  name: string;
  code: string;
  clinic?: number;
}

// Empty staff object for form initialization
const emptyStaff: Partial<StaffMember> = {
  firstName: '', middleName: '', lastName: '', email: '', phone: '', accessRoleId: undefined, restrictedPages: [],
  username: '', status: 'Active', employeeId: ''
};

const statuses = ['All Status', 'Active', 'Inactive'];

export default function UserManagementPage() {
  const { ready, handleAuthError } = useAdminPageAuth();
  const { currentUser, hydrated, refresh: refreshCurrentUser } = useCurrentUser();

  const isScopedDeptHead = Boolean(
    hydrated &&
      currentUser?.isDepartmentHead &&
      !currentUser?.isStaff &&
      !currentUser?.isSuperuser,
  );

  const headedDepartments = currentUser?.headedDepartments ?? [];

  const [accessRoles, setAccessRoles] = useState<ApiRole[]>([]);
  const [userKpis, setUserKpis] = useState({
    totalStaff: 0,
    activeStaff: 0,
    inactiveStaff: 0,
    withAccessRole: 0,
  });
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const [roleFilter, setRoleFilter] = useState('all');

  const [statusFilter, setStatusFilter] = useState('all');

  const [allClinics, setAllClinics] = useState<Clinic[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const departmentOptions = useMemo(() => {
    if (isScopedDeptHead && headedDepartments.length > 0) {
      return headedDepartments.map((d) => ({
        id: d.id,
        name: d.name,
        code: "",
      }));
    }
    return allDepartments;
  }, [isScopedDeptHead, headedDepartments, allDepartments]);

  const roleFilterOptions = useMemo(() => {
    return accessRoles
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accessRoles]);

  const showDepartmentFilter = !isScopedDeptHead || headedDepartments.length > 1;
  const showRoleFilter = roleFilterOptions.length > 1;

  const formDepartmentOptions = departmentOptions;

  useEffect(() => {
    if (!isScopedDeptHead) return;
    if (headedDepartments.length === 1) {
      setDepartmentFilter(String(headedDepartments[0].id));
    }
  }, [isScopedDeptHead, headedDepartments]);

  useEffect(() => {
    if (showRoleFilter) return;
    setRoleFilter("all");
  }, [showRoleFilter]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  const loadUserKpis = useCallback(async () => {
    try {
      const [userStats, inactivePage, assignmentSummary] = await Promise.all([
        adminService.getUserStats(),
        adminService.getUsers({ page: 1, page_size: 1, is_active: false }),
        adminService.getUserRoleAssignmentSummary(),
      ]);
      const inactiveStaff = inactivePage.count ?? 0;
      const activeStaff = userStats.total_active ?? 0;
      setUserKpis({
        totalStaff: activeStaff + inactiveStaff,
        activeStaff,
        inactiveStaff,
        withAccessRole: assignmentSummary.unique_users ?? 0,
      });
    } catch (err: unknown) {
      console.error('Error loading user KPIs:', err);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const rolesResponse = await adminService.getRoles({ page_size: MAX_LIST_PAGE_SIZE });
      setAccessRoles(rolesResponse.results || []);
    } catch (err: any) {
      console.error('Error loading roles:', err);
    }
  }, []);

  const loadClinics = useCallback(async () => {
    try {
      const res = await adminService.getClinics({ page_size: MAX_LIST_PAGE_SIZE });
      setAllClinics(res.results || []);
    } catch (err: any) {
      console.error('Error loading clinics:', err);
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const res = await adminService.getDepartments({ page_size: MAX_LIST_PAGE_SIZE });
      setAllDepartments(res.results || []);
    } catch (err: any) {
      console.error('Error loading departments:', err);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
    void loadUserKpis();
  }, [loadRoles, loadUserKpis]);

  // Use a ref to track current page to avoid dependency loops
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  
  const loadStaff = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await adminService.getUsers({
        page: currentPageRef.current,
        page_size: itemsPerPage,
        search: debouncedSearch || undefined,
        access_role: roleFilter !== 'all' ? Number(roleFilter) : undefined,
        department: departmentFilter !== 'all' ? Number(departmentFilter) : undefined,
        is_active: statusFilter !== 'all' ? (statusFilter === 'Active') : undefined,
      });
      setTotalCount(response.count || response.results.length);

      // Transform API users to frontend format
      const transformedStaff: StaffMember[] = response.results.map((user: ApiUser) => ({
        id: user.id.toString(),
        firstName: user.first_name || '',
        middleName: (user as any).middle_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        username: user.username || '',
        accessRoleId: user.access_role_id ?? undefined,
        accessRoleName: user.access_role_name || undefined,
        restrictedPages: (user as any).custom_pages_mode === "restrict" && Array.isArray((user as any).custom_pages) ? (user as any).custom_pages : [],
        employeeId: user.employee_id,
        status: user.is_active ? 'Active' : 'Inactive' as StaffMember['status'],
        lastLogin: user.last_login,
        departmentId: user.department ?? undefined,
        departmentName: user.department_name || undefined,
      }));

      setStaff(transformedStaff);
    } catch (err: any) {
      if (handleAuthError(err)) return;
      setError(err.message || 'Failed to load staff');
      toast.error('Failed to load staff. Please try again.');
      console.error('Error loading staff:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, roleFilter, statusFilter, departmentFilter]);



  // Track previous filters and reset page to 1 when filters change
  const prevFiltersRef = useRef<{ searchQuery: string; roleFilter: string; statusFilter: string; departmentFilter: string } | null>(null);

  useEffect(() => {
    if (prevFiltersRef.current === null) {
      // First render - just store current values
      prevFiltersRef.current = { searchQuery, roleFilter, statusFilter, departmentFilter };
    }
    const filtersChanged =
      !prevFiltersRef.current ||
      prevFiltersRef.current.searchQuery !== searchQuery ||
      prevFiltersRef.current.roleFilter !== roleFilter ||
      prevFiltersRef.current.statusFilter !== statusFilter ||
      prevFiltersRef.current.departmentFilter !== departmentFilter;
    if (filtersChanged) {
      setCurrentPage(1);
    }
    prevFiltersRef.current = { searchQuery, roleFilter, statusFilter, departmentFilter };
  }, [searchQuery, roleFilter, statusFilter, departmentFilter]);
  
  // Also update ref when currentPage changes (for use in loadStaff)
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Load staff from API
  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  // Load clinics for multi-select
  useEffect(() => {
    loadClinics();
    loadDepartments();
  }, [loadClinics, loadDepartments]);

  // User-focused KPIs (not role catalog stats — see /admin/roles for those)
  const stats = userKpis;

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [formData, setFormData] = useState<Partial<StaffMember>>(emptyStaff);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ref to track selectedStaff for use in callbacks without stale closures
  const selectedStaffRef = useRef<StaffMember | null>(null);
  useEffect(() => {
    selectedStaffRef.current = selectedStaff;
  }, [selectedStaff]);

  // With server-side pagination and filtering, staff array contains only current page results
  const paginatedStaff = staff;


  const getStaffAccessRole = useCallback((member: StaffMember) => {
    const role = member.accessRoleId != null
      ? accessRoles.find((r) => r.id === member.accessRoleId)
      : undefined;
    return {
      name: member.accessRoleName,
      type: role?.type,
    };
  }, [accessRoles]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'Inactive': return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
      case 'On Leave': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'Suspended': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
      default: return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
    }
  };

  const openCreate = useCallback(() => {
    const defaults: Partial<StaffMember> = { ...emptyStaff };
    if (isScopedDeptHead && headedDepartments.length === 1) {
      defaults.departmentId = headedDepartments[0].id;
    }
    setFormData(defaults);
    setIsCreateDialogOpen(true);
  }, [isScopedDeptHead, headedDepartments]);

  const openEdit = useCallback(async (s: StaffMember) => {
    setSelectedStaff(s);
    setFormData({
      ...s,
    });
    setIsEditDialogOpen(true);

    try {
      const userId = parseInt(s.id, 10);
      const [user, assignments] = await Promise.all([
        adminService.getUser(userId),
        adminService.getUserRoleAssignments(userId),
      ]);
      const firstRoleId = assignments?.[0]?.role;
      if (firstRoleId != null) {
        setFormData((prev) => ({ ...prev, accessRoleId: Number(firstRoleId) }));
      } else {
        setFormData((prev) => ({ ...prev, accessRoleId: undefined }));
      }
      const restricted =
        user?.custom_pages_mode === "restrict" && Array.isArray(user.custom_pages)
          ? user.custom_pages
          : [];
      setFormData((prev) => ({ ...prev, restrictedPages: restricted }));
      if (Array.isArray((user as any)?.clinics_ids)) {
        setFormData((prev) => ({ ...prev, clinics: (user as any).clinics_ids }));
      }
      if ((user as any)?.department != null) {
        setFormData((prev) => ({ ...prev, departmentId: (user as any).department }));
      }
    } catch (e) {
      console.warn("Failed to load user role assignments", e);
    }
  }, []);

  // Consolidated handler for all staff actions - React will batch these updates automatically
  const handleStaffAction = useCallback((action: 'view' | 'edit' | 'delete' | 'resetPassword', staff: StaffMember) => {
    selectedStaffRef.current = staff;

    requestAnimationFrame(() => {
      setSelectedStaff(staff);
      switch (action) {
        case 'view':
          setIsViewDialogOpen(true);
          break;
        case 'edit':
          void openEdit(staff);
          break;
        case 'delete':
          setIsDeleteDialogOpen(true);
          break;
        case 'resetPassword':
          setIsResetPasswordDialogOpen(true);
          break;
      }
    });
  }, [openEdit]);

  const handleCreate = async () => {
    // Canonical: Surname is mandatory; first/middle are optional.
    if (!formData.lastName || !formData.email || !(formData as any).username || !(formData as any).password) {
      toast.error('Please fill in all required fields');
      return;
    }

    if ((formData as any).password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    if (!formData.accessRoleId) {
      toast.error('Please select an access role');
      return;
    }
    setIsSubmitting(true);
    try {
      const newUser = await adminService.createUser({
        username: (formData as any).username,
        password: (formData as any).password,
        first_name: formData.firstName,
        middle_name: (formData as any).middleName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        is_active: formData.status === 'Active',
        employee_id: formData.employeeId || undefined,
        department: formData.departmentId || undefined,
        access_role_id: Number(formData.accessRoleId),
        clinics: formData.clinics || [],
      } as any);

      if (!newUser.id) {
        throw new Error('User created but no ID returned from server');
      }
      if (formData.restrictedPages && formData.restrictedPages.length > 0) {
        await adminService.updateUser(newUser.id, {
          custom_pages_mode: "restrict",
          custom_pages: normalizeRolePagePaths(formData.restrictedPages),
        });
      }
      toast.success(`${formData.lastName}${formData.firstName ? ` ${formData.firstName}` : ''} has been added`);
      setIsCreateDialogOpen(false);
      setFormData(emptyStaff);
      await Promise.all([loadStaff(), loadUserKpis()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create staff member');
      console.error('Error creating staff:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedStaff) return;
    setIsSubmitting(true);
    
    try {
      const userId = parseInt(selectedStaff.id);
      await adminService.updateUser(userId, {
        first_name: formData.firstName,
        middle_name: (formData as any).middleName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        is_active: formData.status === 'Active',
        employee_id: formData.employeeId || undefined,
        department: formData.departmentId || undefined,
        custom_pages_mode: (formData.restrictedPages && formData.restrictedPages.length > 0) ? "restrict" : "",
        custom_pages: normalizeRolePagePaths(formData.restrictedPages || []),
        clinics: formData.clinics || [],
      });

      // Persist access role assignment (single-select UX).
      if (formData.accessRoleId) {
        const desiredRoleId = Number(formData.accessRoleId);
        const existing = await adminService.getUserRoleAssignments(userId);
        const hasDesired = existing.some((a) => a.role === desiredRoleId);
        await Promise.all(
          existing
            .filter((a) => a.role !== desiredRoleId)
            .map((a) => adminService.deleteUserRoleAssignment(a.id))
        );
        if (!hasDesired) {
          await adminService.assignRoleToUser(userId, desiredRoleId);
        }
      }

      if (currentUser && selectedStaff.id === currentUser.id) {
        await refreshCurrentUser();
      }
      
      toast.success(`${formData.lastName}${formData.firstName ? ` ${formData.firstName}` : ''}'s profile has been updated`);
      setIsEditDialogOpen(false);
      setSelectedStaff(null);
      setFormData(emptyStaff);
      await Promise.all([loadStaff(), loadUserKpis()]); // Reload staff list
    } catch (err: any) {
      toast.error(err.message || 'Failed to update staff member');
      console.error('Error updating staff:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedStaff) return;
    setIsSubmitting(true);
    
    try {
      const userId = parseInt(selectedStaff.id);
      await adminService.deleteUser(userId);
      toast.success(`${selectedStaff.firstName} ${selectedStaff.lastName} has been removed`);
      setIsDeleteDialogOpen(false);
      setSelectedStaff(null);
      await Promise.all([loadStaff(), loadUserKpis()]); // Reload staff list
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete staff member');
      console.error('Error deleting staff:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const [resetPasswordData, setResetPasswordData] = useState({ newPassword: '', confirmPassword: '' });

  const handleResetPassword = async () => {
    if (!selectedStaff) return;
    
    if (!resetPasswordData.newPassword) {
      toast.error('Please enter a new password');
      return;
    }
    
    if (resetPasswordData.newPassword !== resetPasswordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (resetPasswordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    
    setIsSubmitting(true);

    try {
      const userId = parseInt(selectedStaff.id);
      await adminService.resetPassword(userId, resetPasswordData.newPassword);
      toast.success(`Password reset successfully for ${selectedStaff.firstName} ${selectedStaff.lastName}`);
      setIsResetPasswordDialogOpen(false);
      setResetPasswordData({ newPassword: '', confirmPassword: '' });
      setSelectedStaff(null);
    } catch (err: any) {
      console.error('❌ Password reset failed:', err);
      let errorMessage = 'Failed to reset password';

      if (err?.response?.data?.new_password) {
        // Django validation errors come as array
        if (Array.isArray(err.response.data.new_password)) {
          errorMessage = err.response.data.new_password[0];
        } else {
          errorMessage = err.response.data.new_password;
        }
      } else if (err?.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err?.message) {
        errorMessage = err.message;
      }

      toast.error(`Password reset failed: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = useCallback(async (s: StaffMember) => {
    try {
      const userId = parseInt(s.id);
      const updated = await adminService.toggleUserStatus(userId);
      const newStatus: StaffMember["status"] = updated.is_active ? "Active" : "Inactive";

      // Update UI immediately even if list refresh is delayed/cached.
      setStaff((prev) =>
        prev.map((row) => (row.id === s.id ? { ...row, status: newStatus } : row))
      );

      toast.success(`${s.firstName} ${s.lastName} is now ${newStatus}`);

      // Best-effort refresh to ensure server truth is reflected.
      await Promise.all([loadStaff(), loadUserKpis()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle status');
      console.error('Error toggling status:', err);
    }
  }, [loadStaff, loadUserKpis]);

  const handleExport = async () => {
    try {
      const rows: StaffMember[] = [];
      let page = 1;
      const pageSize = 200;
      let total = 0;

      do {
        const response = await adminService.getUsers({
          page,
          page_size: pageSize,
          search: debouncedSearch || undefined,
          access_role: roleFilter !== 'all' ? Number(roleFilter) : undefined,
          department: departmentFilter !== 'all' ? Number(departmentFilter) : undefined,
          is_active: statusFilter !== 'all' ? statusFilter === 'Active' : undefined,
        });
        total = response.count || response.results.length;
        rows.push(...response.results.map((user: ApiUser) => ({
          id: user.id.toString(),
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          email: user.email || '',
          phone: user.phone || '',
          username: user.username || '',
          accessRoleName: user.access_role_name || '',
          employeeId: user.employee_id || '',
          status: user.is_active ? 'Active' : 'Inactive',
          departmentName: user.department_name || '',
        })) as StaffMember[]);
        if (rows.length >= total || response.results.length === 0) break;
        page += 1;
      } while (rows.length < total);

      const headers = ['Username', 'First Name', 'Last Name', 'Email', 'Phone', 'Employee ID', 'Access Role', 'Department', 'Status'];
      const csv = [
        headers.map(h => `"${h}"`).join(','),
        ...rows.map(row => [
          row.username,
          row.firstName,
          row.lastName,
          row.email,
          row.phone || '',
          row.employeeId || '',
          row.accessRoleName || '',
          row.departmentName || '',
          row.status,
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `staff_export_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} staff records`);
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to export staff list');
    }
  };

  if (!ready) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
      <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <UserCog className="h-8 w-8 text-blue-500" />
              User Management
            </h1>
            <p className="text-muted-foreground mt-1">Manage healthcare staff accounts and permissions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />Export
                </Button>
            <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
              <UserPlus className="h-4 w-4 mr-2" />Add Staff
            </Button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Staff</p>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.totalStaff}</p>
                </div>
                <Users className="h-8 w-8 text-purple-500 opacity-50 shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Active Staff</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.activeStaff}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-50 shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Inactive Staff</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.inactiveStaff}</p>
                </div>
                <XCircle className="h-8 w-8 text-amber-500 opacity-50 shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">With Access Role</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.withAccessRole}</p>
                </div>
                <Shield className="h-8 w-8 text-blue-500 opacity-50 shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or staff ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {showRoleFilter && (
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Access role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Access Roles</SelectItem>
                      {roleFilterOptions.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {showDepartmentFilter && (
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue placeholder="Department" /></SelectTrigger>
                    <SelectContent>
                      {!isScopedDeptHead && (
                        <SelectItem value="all">All Departments</SelectItem>
                      )}
                      {departmentOptions.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    {statuses.map(s => <SelectItem key={s} value={s === 'All Status' ? 'all' : s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Staff Table */}
      <Card>
          {loading ? (
            <CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
              <p>Loading staff...</p>
            </CardContent>
          ) : error ? (
            <CardContent className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" className="mt-4" onClick={loadStaff}>Retry</Button>
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Staff</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Access Role</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Department</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Last Login</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStaff.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No staff members found</td></tr>
                  ) : (
                  paginatedStaff.map((s) => {
                return (
                      <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-medium">
                              {s.firstName[0]}{s.lastName[0]}
                      </div>
                            <div>
                              <p className="font-medium text-foreground">{s.firstName} {s.lastName}</p>
                              <p className="text-xs text-muted-foreground">{s.employeeId || s.username} • {s.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          {(() => {
                            const { name, type } = getStaffAccessRole(s);
                            return (
                              <Badge variant="outline" className={`${getAccessRoleBadgeClass(type, name)} flex items-center gap-1 w-fit`}>
                                {getAccessRoleIcon(type, name)}
                                {name || "—"}
                              </Badge>
                            );
                          })()}
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{s.departmentName || "—"}</td>
                        <td className="p-4">
                          <Badge variant="outline" className={getStatusBadge(s.status)}>{s.status}</Badge>
                        </td>
                        <td className="p-4">
                          {s.lastLogin ? (
                            <p className="text-sm text-muted-foreground">
                              {formatDisplayDateTime(s.lastLogin)}
                            </p>
                          ) : (
                            <span className="text-muted-foreground text-sm">Never</span>
                          )}
                        </td>
                        <td className="p-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => handleStaffAction('view', s)}>
                                <Eye className="h-4 w-4 mr-2" />View Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleStaffAction('edit', s)}>
                                <Edit className="h-4 w-4 mr-2" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleStaffAction('resetPassword', s)}>
                                <Key className="h-4 w-4 mr-2" />Reset Password
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => toggleStatus(s)}>
                                {s.status === 'Active' ? (
                                  <><Lock className="h-4 w-4 mr-2" />Deactivate</>
                                ) : (
                                  <><Unlock className="h-4 w-4 mr-2" />Activate</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => handleStaffAction('delete', s)} className="text-rose-600">
                                <Trash2 className="h-4 w-4 mr-2" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !error && (
            <div className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="staff"
            />
            </div>
          )}
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setIsEditDialogOpen(false);
            // Only clear form data, keep selectedStaff for potential re-opening
            setFormData(emptyStaff);
          }
        }}>
          <DialogContent className={MODAL_SIZES.lg}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-500" />
                {isCreateDialogOpen ? 'Add New Staff' : 'Edit Staff'}
              </DialogTitle>
              <DialogDescription>
                {isCreateDialogOpen ? 'Create a new healthcare staff account' : `Update ${selectedStaff?.firstName}'s profile`}
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="basic" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="access">Access</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input value={formData.firstName || ''} onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                    <Label>Surname *</Label>
                    <Input value={formData.lastName || ''} onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))} />
                </div>
                </div>
                <div className="space-y-2">
                  <Label>Middle Name</Label>
                  <Input value={(formData as any).middleName || ''} onChange={(e) => setFormData(prev => ({ ...prev, middleName: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" value={formData.email || ''} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={formData.phone || ''} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} />
                  </div>
                </div>
                {isCreateDialogOpen && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Username *</Label>
                      <Input
                        value={(formData as any).username || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                        placeholder="e.g., john.doe"
                      />
                      <p className="text-xs text-muted-foreground">Unique login identifier</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <Input
                        type="password"
                        value={(formData as any).password || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Min 8 characters"
                      />
                      <p className="text-xs text-muted-foreground">Temporary password for user</p>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Status</Label>
                    <Select value={formData.status || 'Active'} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as StaffMember['status'] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Employee ID</Label>
                    <Input value={formData.employeeId || ''} onChange={(e) => setFormData(prev => ({ ...prev, employeeId: e.target.value }))} placeholder="e.g., NPA-2024-001" />
                    <p className="text-xs text-muted-foreground">Optional unique employee identifier</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Select
                      value={formData.departmentId?.toString() || 'none'}
                      onValueChange={(v) => setFormData(prev => ({ ...prev, departmentId: v === 'none' ? undefined : Number(v) }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>
                        {headedDepartments.length !== 1 && (
                          <SelectItem value="none">None</SelectItem>
                        )}
                        {formDepartmentOptions.map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="access" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Access Role *</Label>
                  <Select
                    value={formData.accessRoleId?.toString() || ''}
                    onValueChange={(v) => setFormData(prev => ({
                      ...prev,
                      accessRoleId: parseInt(v, 10),
                      restrictedPages: [],
                    }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select access role" /></SelectTrigger>
                    <SelectContent>
                      {accessRoles.map((r) => (
                        <SelectItem key={r.id} value={r.id.toString()}>
                          {r.name}{r.is_active ? "" : " (inactive)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This controls which module pages the user can access.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Clinics Assigned</Label>
                  <p className="text-xs text-muted-foreground">
                    Select the clinics this user can access. Users with 2+ clinics will see the clinic switcher.
                  </p>
                  <div className="rounded-md border p-3 max-h-[240px] overflow-y-auto space-y-1">
                    {allClinics.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Loading clinics...</p>
                    ) : (
                      allClinics.map((c) => {
                        const checked = (formData.clinics || []).includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer hover:bg-muted/50 rounded px-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setFormData((prev) => {
                                  const cur = new Set(prev.clinics || []);
                                  if (cur.has(c.id)) cur.delete(c.id);
                                  else cur.add(c.id);
                                  return { ...prev, clinics: Array.from(cur) };
                                });
                              }}
                            />
                            <span>{c.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Restrict pages (per-user)</Label>
                  <p className="text-xs text-muted-foreground">
                    Optional. These pages will be removed from the role’s allowed pages for this user only.
                  </p>
                  <div className="rounded-md border p-3 max-h-[360px] overflow-y-auto space-y-4">
                    {(() => {
                      const selectedRole = accessRoles.find((r) => r.id === formData.accessRoleId);
                      const pages = normalizeRolePagePaths(
                        convertPermissionsFromBackend(selectedRole?.permissions),
                      );
                      if (!selectedRole) {
                        return <p className="text-sm text-muted-foreground">Select an access role to see its pages.</p>;
                      }
                      if (pages.length === 0) {
                        return <p className="text-sm text-muted-foreground">This role has no page permissions configured.</p>;
                      }

                      const restricted = new Set(formData.restrictedPages || []);
                      const grouped = groupPagePermissionsByModule(pages);

                      return (
                        <div className="space-y-4">
                          {sortPageModules(Object.keys(grouped)).map((module) => {
                              const perms = grouped[module];
                              const selectedCount = perms.filter((p) => !restricted.has(p.id)).length;
                              return (
                                <div key={module} className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">{module}</p>
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                      {selectedCount}/{perms.length}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    {perms.map((p) => (
                                      <label key={p.id} className="flex items-center gap-2 text-sm">
                                        <input
                                          type="checkbox"
                                          checked={!restricted.has(p.id)}
                                          onChange={(e) => {
                                            setFormData((prev) => {
                                              const cur = new Set(prev.restrictedPages || []);
                                              // Checked means "allowed"; unchecked means "restricted"
                                              if (e.target.checked) cur.delete(p.id);
                                              else cur.add(p.id);
                                              return { ...prev, restrictedPages: Array.from(cur) };
                                            });
                                          }}
                                        />
                                        <span className="text-sm">{p.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      );
                    })()}
                  </div>
                </div>

              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); }}>Cancel</Button>
              <Button onClick={isCreateDialogOpen ? handleCreate : handleUpdate} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? 'Saving...' : isCreateDialogOpen ? 'Add Staff' : 'Save Changes'}
                    </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className={MODAL_SIZES.md}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-500" />
                Staff Profile
              </DialogTitle>
            </DialogHeader>
            {selectedStaff && (
              <div className="space-y-6 mt-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xl font-medium">
                    {selectedStaff.firstName[0]}{selectedStaff.lastName[0]}
                </div>
                  <div>
                    <h3 className="text-xl font-semibold">{selectedStaff.firstName} {selectedStaff.lastName}</h3>
                    <p className="text-muted-foreground">{selectedStaff.employeeId || selectedStaff.username}</p>
                    <Badge variant="outline" className={`${getAccessRoleBadgeClass(getStaffAccessRole(selectedStaff).type, selectedStaff.accessRoleName)} mt-1`}>
                      {getAccessRoleIcon(getStaffAccessRole(selectedStaff).type, selectedStaff.accessRoleName)} {selectedStaff.accessRoleName || "—"}
                    </Badge>
              </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedStaff.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Username</p>
                    <p className="font-medium">{selectedStaff.username || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedStaff.phone}</p>
                  </div>

                  {selectedStaff.employeeId && (
                    <div>
                      <p className="text-muted-foreground">Employee ID</p>
                      <p className="font-medium">{selectedStaff.employeeId}</p>
            </div>
          )}

                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant="outline" className={getStatusBadge(selectedStaff.status)}>{selectedStaff.status}</Badge>
                  </div>
                </div>


              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              <Button onClick={() => {
                const staffToEdit = selectedStaffRef.current;
                setIsViewDialogOpen(false);
                // Open edit dialog after a brief delay to let view dialog close
                if (staffToEdit) {
                  setTimeout(() => {
                    openEdit(staffToEdit);
                  }, UI_TRANSITION_DELAY);
                }
              }}>
                <Edit className="h-4 w-4 mr-2" />Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600">
                <Trash2 className="h-5 w-5" />
                Delete Staff Member
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{selectedStaff?.firstName} {selectedStaff?.lastName}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={isResetPasswordDialogOpen} onOpenChange={(open) => {
          setIsResetPasswordDialogOpen(open);
          if (!open) {
            setResetPasswordData({ newPassword: '', confirmPassword: '' });
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-500" />
                Reset Password
              </DialogTitle>
              <DialogDescription>
                Set a new password for <strong>{selectedStaff?.firstName} {selectedStaff?.lastName}</strong> ({selectedStaff?.email})
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>New Password *</Label>
                  <Input
                    type="password"
                    value={resetPasswordData.newPassword}
                    onChange={(e) => setResetPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="Enter new password (min 8 characters)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum 8 characters required
                  </p>
        </div>
              <div className="space-y-2">
                <Label>Confirm Password *</Label>
                <Input 
                  type="password" 
                  value={resetPasswordData.confirmPassword} 
                  onChange={(e) => setResetPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm new password"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsResetPasswordDialogOpen(false);
                setResetPasswordData({ newPassword: '', confirmPassword: '' });
              }}>Cancel</Button>
              <Button onClick={handleResetPassword} disabled={isSubmitting || !resetPasswordData.newPassword || !resetPasswordData.confirmPassword} className="bg-amber-600 hover:bg-amber-700">
                {isSubmitting ? 'Resetting...' : 'Reset Password'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
);
}
