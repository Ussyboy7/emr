"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { UI_TRANSITION_DELAY } from '@/lib/constants/ui';
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { StandardPagination } from "@/components/StandardPagination";
import { adminService, type User as ApiUser } from "@/lib/services";
import {
  Users, Search, Plus, Edit, Trash2, MoreVertical, Eye, UserCog, Shield,
  Stethoscope, Syringe, FlaskConical, Pill, ScanLine, ClipboardList, Building2,
  Phone, Mail, Calendar, BadgeCheck, AlertTriangle, XCircle,
  Download, Upload, RefreshCw, Filter, UserPlus, Key, Lock, Unlock, Loader2
} from "lucide-react";

// Types
interface StaffMember {
  id: string;
  staffId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  departmentId?: number;
  clinic: string;
  clinicId?: number;
  employeeId?: string;
  username?: string;
  password?: string;
  dateJoined: string;
  status: 'Active' | 'Inactive';
  lastLogin?: string;
  permissions: string[];
  profilePhoto?: string;
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
  firstName: '', lastName: '', email: '', phone: '', role: '', department: '', clinic: '',
  username: '', password: '',
  dateJoined: new Date().toISOString().split('T')[0], status: 'Active', permissions: [], employeeId: ''
};

// Match backend SYSTEM_ROLE_CHOICES exactly
const roles = ['All Roles', 'Medical Doctor', 'Nursing Officer', 'Laboratory Scientist', 'Pharmacist', 'Radiologist', 'Medical Records Officer', 'System Administrator', 'Admin Staff'];
const statuses = ['All Status', 'Active', 'Inactive'];

export default function UserManagementPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [clinicFilter, setClinicFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const loadClinicsAndDepartments = useCallback(async () => {
    try {
      const [clinicsResponse, departmentsResponse] = await Promise.all([
        adminService.getClinics({ page_size: 1000 }),
        adminService.getDepartments({ page_size: 1000 }),
      ]);
      setClinics(clinicsResponse.results);
      setDepartments(departmentsResponse.results);
    } catch (err: any) {
      console.error('Error loading clinics/departments:', err);
    }
  }, []);

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
        search: searchQuery || undefined,
        system_role: roleFilter !== 'all' ? roleFilter : undefined,
        // Note: department and clinic filtering not yet implemented in backend
        is_active: statusFilter !== 'all' ? (statusFilter === 'Active') : undefined,
      });
      setTotalCount(response.count || response.results.length);

      // Transform API users to frontend format
      const transformedStaff: StaffMember[] = response.results.map((user: ApiUser) => ({
        id: user.id.toString(),
        staffId: user.employee_id || `NPA-${user.id}`,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        username: user.username || '',
        role: user.system_role || 'Staff',
        department: user.department_name || '',
        departmentId: user.department,
        clinic: user.clinic_name || '',
        clinicId: user.clinic,
        employeeId: user.employee_id,
        dateJoined: user.date_joined?.split('T')[0] || '',
        status: user.is_active ? 'Active' : 'Inactive' as StaffMember['status'],
        lastLogin: user.last_login,
        permissions: [],
      }));

      setStaff(transformedStaff);
    } catch (err: any) {
      setError(err.message || 'Failed to load staff');
      toast.error('Failed to load staff. Please try again.');
      console.error('Error loading staff:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, searchQuery, roleFilter, departmentFilter, clinicFilter, statusFilter]);

  // Load clinics and departments from API
  useEffect(() => {
    loadClinicsAndDepartments();
  }, [loadClinicsAndDepartments]);

  // Track previous filters and reset page to 1 when filters change
  const prevFiltersRef = useRef<{ searchQuery: string; roleFilter: string; departmentFilter: string; clinicFilter: string; statusFilter: string } | null>(null);
  
  useEffect(() => {
    if (prevFiltersRef.current === null) {
      // First render - just store current values
      prevFiltersRef.current = { searchQuery, roleFilter, departmentFilter, clinicFilter, statusFilter };
      return;
    }
    
    const filtersChanged = 
      prevFiltersRef.current.searchQuery !== searchQuery ||
      prevFiltersRef.current.roleFilter !== roleFilter ||
      prevFiltersRef.current.departmentFilter !== departmentFilter ||
      prevFiltersRef.current.clinicFilter !== clinicFilter ||
      prevFiltersRef.current.statusFilter !== statusFilter;
    
    if (filtersChanged && currentPage !== 1) {
      setCurrentPage(1);
    }
    
    prevFiltersRef.current = { searchQuery, roleFilter, departmentFilter, clinicFilter, statusFilter };
  }, [searchQuery, roleFilter, departmentFilter, clinicFilter, statusFilter]);
  
  // Also update ref when currentPage changes (for use in loadStaff)
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Load staff from API
  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

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


  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'Medical Doctor': return <Stethoscope className="h-4 w-4" />;
      case 'Nursing Officer': return <Syringe className="h-4 w-4" />;
      case 'Laboratory Scientist': return <FlaskConical className="h-4 w-4" />;
      case 'Pharmacist': return <Pill className="h-4 w-4" />;
      case 'Radiologist': return <ScanLine className="h-4 w-4" />;
      case 'Medical Records Officer': return <ClipboardList className="h-4 w-4" />;
      case 'System Administrator': return <Shield className="h-4 w-4" />;
      case 'Admin Staff': return <UserCog className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Medical Doctor': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'Nursing Officer': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
      case 'Laboratory Scientist': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'Pharmacist': return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30';
      case 'Radiologist': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'Medical Records Officer': return 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30';
      case 'System Administrator': return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
      case 'Admin Staff': return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30';
      default: return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
    }
  };

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
    setFormData(emptyStaff);
    setIsCreateDialogOpen(true);
  }, []);

  // Consolidated handler for all staff actions - React will batch these updates automatically
  const handleStaffAction = useCallback((action: 'view' | 'edit' | 'delete' | 'resetPassword', staff: StaffMember) => {
    // Update ref immediately
    selectedStaffRef.current = staff;
    
    // Use requestAnimationFrame to ensure dropdown closes before opening modal
    requestAnimationFrame(() => {
      setSelectedStaff(staff);
      switch (action) {
        case 'view':
          setIsViewDialogOpen(true);
          break;
        case 'edit':
          setFormData({
            ...staff,
            clinicId: staff.clinicId,
            departmentId: staff.departmentId,
          });
          setIsEditDialogOpen(true);
          break;
        case 'delete':
          setIsDeleteDialogOpen(true);
          break;
        case 'resetPassword':
          setIsResetPasswordDialogOpen(true);
          break;
      }
    });
  }, []);
  
  // Individual handlers for backward compatibility with other parts of code
  const openView = useCallback((s: StaffMember) => {
    setSelectedStaff(s);
    setIsViewDialogOpen(true);
  }, []);
  
  const openEdit = useCallback((s: StaffMember) => {
    setSelectedStaff(s);
    setFormData({
      ...s,
      clinicId: s.clinicId,
      departmentId: s.departmentId,
    });
    setIsEditDialogOpen(true);
  }, []);
  
  const openDelete = useCallback((s: StaffMember) => {
    setSelectedStaff(s);
    setIsDeleteDialogOpen(true);
  }, []);
  
  const openResetPassword = useCallback((s: StaffMember) => {
    setSelectedStaff(s);
    setIsResetPasswordDialogOpen(true);
  }, []);

  const handleCreate = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !(formData as any).username || !(formData as any).password) {
      toast.error('Please fill in all required fields');
      return;
    }

    if ((formData as any).password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    if (!formData.clinicId) {
      toast.error('Please select a clinic');
      return;
    }
    if (!formData.departmentId) {
      toast.error('Please select a department');
      return;
    }
    setIsSubmitting(true);
    
    try {
      const newUser = await adminService.createUser({
        username: (formData as any).username,
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        system_role: formData.role,
        clinic: formData.clinicId,
        department: formData.departmentId,
        is_active: formData.status === 'Active',
        employee_id: formData.employeeId || undefined,
      });
      
      toast.success(`${formData.firstName} ${formData.lastName} has been added`);
      setIsCreateDialogOpen(false);
      setFormData(emptyStaff);
      await loadStaff(); // Reload staff list
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
        username: (formData as any).username,
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        system_role: formData.role,
        clinic: formData.clinicId,
        department: formData.departmentId,
        is_active: formData.status === 'Active',
        employee_id: formData.employeeId || undefined,
      });
      
      toast.success(`${formData.firstName} ${formData.lastName}'s profile has been updated`);
      setIsEditDialogOpen(false);
      setSelectedStaff(null);
      setFormData(emptyStaff);
      await loadStaff(); // Reload staff list
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
      await loadStaff(); // Reload staff list
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
      await adminService.toggleUserStatus(userId);
      const newStatus = s.status === 'Active' ? 'Inactive' : 'Active';
      toast.success(`${s.firstName} ${s.lastName} is now ${newStatus}`);
      await loadStaff(); // Reload staff list
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle status');
      console.error('Error toggling status:', err);
    }
  }, [loadStaff]);

  const handleExport = () => {
    toast.success('Exporting staff list to CSV...');
  };

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

        {/* Total matches API count for current search/filters (paginated list is one page only). */}
        <div className="max-w-md">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total staff (this filter)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{totalCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Role breakdown is not shown here because results are paginated.
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-500 opacity-50 shrink-0" />
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
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r} value={r === 'All Roles' ? 'all' : r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter} disabled>
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="Department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments (Coming Soon)</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={clinicFilter} onValueChange={setClinicFilter} disabled>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Clinic" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clinics (Coming Soon)</SelectItem>
                    {clinics.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Role</th>
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
                              <p className="text-xs text-muted-foreground">{s.staffId} • {s.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={`${getRoleBadgeColor(s.role)} flex items-center gap-1 w-fit`}>
                            {getRoleIcon(s.role)}
                            {s.role}
                      </Badge>
                        </td>
                        <td className="p-4">
                          <p className="text-foreground">{s.department}</p>
                          <p className="text-xs text-muted-foreground">{s.clinic}</p>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={getStatusBadge(s.status)}>{s.status}</Badge>
                        </td>
                        <td className="p-4">
                          {s.lastLogin ? (
                            <p className="text-sm text-muted-foreground">
                              {new Date(s.lastLogin).toLocaleDateString()} {new Date(s.lastLogin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
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
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="professional">Professional</TabsTrigger>
                <TabsTrigger value="assignment">Assignment</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input value={formData.firstName || ''} onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                    <Label>Last Name *</Label>
                    <Input value={formData.lastName || ''} onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))} />
                </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" value={formData.email || ''} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone *</Label>
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
              </TabsContent>

              <TabsContent value="professional" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Role *</Label>
                  <Select value={formData.role || ''} onValueChange={(v) => setFormData(prev => ({ ...prev, role: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {roles.slice(1).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Employee ID</Label>
                  <Input value={formData.employeeId || ''} onChange={(e) => setFormData(prev => ({ ...prev, employeeId: e.target.value }))} placeholder="e.g., NPA-2024-001" />
                  <p className="text-xs text-muted-foreground">Optional unique employee identifier</p>
                </div>
              </TabsContent>

              <TabsContent value="assignment" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Clinic *</Label>
                    <Select 
                      value={formData.clinicId?.toString() || ''} 
                      onValueChange={(v) => {
                        const clinicId = parseInt(v);
                        const clinic = clinics.find(c => c.id === clinicId);
                        setFormData(prev => ({ 
                          ...prev, 
                          clinicId: clinicId,
                          clinic: clinic?.name || '',
                          departmentId: undefined, // Reset department when clinic changes
                          department: '',
                        }));
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select clinic" /></SelectTrigger>
                      <SelectContent>
                        {clinics.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Department *</Label>
                    <Select 
                      value={formData.departmentId?.toString() || ''} 
                      onValueChange={(v) => {
                        const departmentId = parseInt(v);
                        const department = departments.find(d => d.id === departmentId);
                        setFormData(prev => ({ 
                          ...prev, 
                          departmentId: departmentId,
                          department: department?.name || '',
                        }));
                      }}
                      disabled={!formData.clinicId}
                    >
                      <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>
                        {departments
                          .filter(d => !formData.clinicId || d.clinic === formData.clinicId)
                          .map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
                    <p className="text-muted-foreground">{selectedStaff.staffId}</p>
                    <Badge variant="outline" className={`${getRoleBadgeColor(selectedStaff.role)} mt-1`}>
                      {getRoleIcon(selectedStaff.role)} {selectedStaff.role}
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
                  <div>
                    <p className="text-muted-foreground">Department</p>
                    <p className="font-medium">{selectedStaff.department}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Clinic</p>
                    <p className="font-medium">{selectedStaff.clinic}</p>
                  </div>
                  {selectedStaff.employeeId && (
                    <div>
                      <p className="text-muted-foreground">Employee ID</p>
                      <p className="font-medium">{selectedStaff.employeeId}</p>
            </div>
          )}
                  <div>
                    <p className="text-muted-foreground">Date Joined</p>
                    <p className="font-medium">{selectedStaff.dateJoined}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant="outline" className={getStatusBadge(selectedStaff.status)}>{selectedStaff.status}</Badge>
                  </div>
                </div>

                {selectedStaff.permissions.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-2">Permissions</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedStaff.permissions.map(p => (
                        <Badge key={p} variant="secondary" className="text-xs">{p.replace('_', ' ')}</Badge>
                      ))}
      </div>
                  </div>
                )}
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
