"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginatedListGuard, useResetPageOnFilterChange } from "@/hooks/use-paginated-list-guard";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { toApiDateFromInstant } from "@/lib/dates";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { adminService, type Role as ApiRole } from "@/lib/services";
import {
  ALL_PAGE_PERMISSIONS,
  convertPermissionsFromBackend,
  normalizeRolePagePaths,
  PAGE_MODULE_ORDER,
  type PagePermission,
} from "@/lib/page-permissions";
import {
  ALL_CAPABILITIES,
  convertCapabilitiesFromBackend,
  groupCapabilitiesByModule,
  SENSITIVE_CAPABILITY_IDS,
} from "@/lib/capabilities";
import { PermissionsCatalogTab } from "@/components/admin/PermissionsCatalogTab";
import { EffectiveAccessPreview } from "@/components/admin/EffectiveAccessPreview";
import {
  Shield, Search, Plus, Edit, Trash2, Eye, Users, Lock, Key, AlertTriangle, CheckCircle2, Loader2,
  Stethoscope, Building2, Settings, UserCog, Check, Copy,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface Role {
  id: string;
  name: string;
  description: string;
  type: 'System' | 'Clinical' | 'Administrative' | 'Custom';
  permissions: string[];
  capabilities: string[];
  userCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SystemRole {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const pageModules = [...new Set(ALL_PAGE_PERMISSIONS.map((p) => p.module))];
const roleTypes = ['All Types', 'System', 'Clinical', 'Administrative', 'Custom'];

function mapTypeFilterToTypeGroup(typeFilter: string): string | undefined {
  if (typeFilter === 'all') return undefined;
  const m: Record<string, string> = {
    System: 'system',
    Clinical: 'clinical',
    Administrative: 'administrative',
    Custom: 'custom',
  };
  return m[typeFilter];
}

export default function RolesPermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // System roles management state
  const [allSystemRoles, setAllSystemRoles] = useState<SystemRole[]>([]);
  const [systemRoleDialogOpen, setSystemRoleDialogOpen] = useState(false);
  const [editingSystemRole, setEditingSystemRole] = useState<SystemRole | null>(null);
  const [systemRoleForm, setSystemRoleForm] = useState({
    name: '',
    description: '',
    is_active: true,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const { currentPageRef, resetToFirstPage, beginLoad } = usePaginatedListGuard(currentPage);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [roleStats, setRoleStats] = useState({
    total: 0,
    active: 0,
    clinical: 0,
    totalUsers: 0,
  });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'Clinical' as Role['type'],
    permissions: [] as string[],
    capabilities: [] as string[],
    isActive: true,
  });

  useEffect(() => {
    loadAllSystemRoles();
  }, []);

  // Map backend role types to frontend types
  const mapRoleType = (backendType: string): Role['type'] => {
    const typeMap: Record<string, Role['type']> = {
      'admin': 'System',
      'doctor': 'Clinical',
      'nurse': 'Clinical',
      'lab_tech': 'Clinical',
      'pharmacist': 'Clinical',
      'radiologist': 'Clinical',
      'records': 'Administrative',
      'custom': 'Custom',
    };
    return typeMap[backendType] || 'Custom';
  };

  // Map frontend role types to backend types
  const mapToBackendType = (frontendType: Role['type']): 'admin' | 'doctor' | 'nurse' | 'lab_tech' | 'pharmacist' | 'radiologist' | 'records' | 'custom' => {
    const typeMap: Record<Role['type'], 'admin' | 'doctor' | 'nurse' | 'lab_tech' | 'pharmacist' | 'radiologist' | 'records' | 'custom'> = {
      'System': 'admin',
      'Clinical': 'doctor', // Default to doctor for clinical
      'Administrative': 'records',
      'Custom': 'custom',
    };
    return typeMap[frontendType] || 'custom';
  };

  // Convert permissions from frontend array format to backend page-based format
  const convertPermissionsToBackend = (pages: string[], capabilities: string[]) => {
    const payload: { pages: string[]; capabilities?: string[] } = { pages };
    if (capabilities.length > 0) payload.capabilities = capabilities;
    return payload;
  };

  const loadRoleStats = useCallback(async () => {
    try {
      const stats = await adminService.getRoleListStats();
      setRoleStats({
        total: stats.total ?? 0,
        active: stats.active ?? 0,
        clinical: stats.clinical ?? 0,
        totalUsers: stats.totalUsers ?? 0,
      });
    } catch (e) {
      console.error('Error loading role stats:', e);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    const isStale = beginLoad();
    try {
      setLoading(true);
      setError(null);
      const typeGroup = mapTypeFilterToTypeGroup(typeFilter);
      const response = await adminService.getRoles({
        page: currentPageRef.current,
        page_size: itemsPerPage,
        search: debouncedSearch.trim() || undefined,
        type_group: typeGroup,
        is_active: statusFilter !== 'all' ? statusFilter === 'Active' : undefined,
      });
      if (isStale()) return;
      setTotalCount(response.count ?? response.results.length);

      const transformedRoles: Role[] = response.results.map((role: ApiRole) => ({
        id: role.id.toString(),
        name: role.name,
        description: role.description || '',
        type: mapRoleType(role.type),
        permissions: normalizeRolePagePaths(convertPermissionsFromBackend(role.permissions)),
        capabilities: convertCapabilitiesFromBackend(role.permissions),
        userCount: role.user_count || 0,
        isActive: role.is_active,
        createdAt: toApiDateFromInstant(role.created_at),
        updatedAt: toApiDateFromInstant(role.updated_at),
      }));

      setRoles(transformedRoles);
    } catch (err: any) {
      setError(err.message || 'Failed to load roles');
      toast.error('Failed to load roles. Please try again.');
      console.error('Error loading roles:', err);
    } finally {
      setLoading(false);
    }
  }, [itemsPerPage, debouncedSearch, typeFilter, statusFilter, beginLoad, currentPageRef]);

  useResetPageOnFilterChange(resetToFirstPage, setCurrentPage, [
    debouncedSearch, typeFilter, statusFilter, itemsPerPage,
  ]);

  useEffect(() => {
    void loadRoleStats();
  }, [loadRoleStats]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles, currentPage]);

  const getRoleIcon = (type: string) => {
    switch (type) {
      case 'Clinical': return <Stethoscope className="h-4 w-4" />;
      case 'Administrative': return <Building2 className="h-4 w-4" />;
      case 'System': return <Settings className="h-4 w-4" />;
      default: return <Key className="h-4 w-4" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'Clinical': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'Administrative': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'System': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
      default: return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    }
  };

  const getPermissionsByModule = (pageIds: string[]) => {
    const grouped: Record<string, PagePermission[]> = {};
    pageIds.forEach((id) => {
      const page = ALL_PAGE_PERMISSIONS.find((p) => p.id === id);
      if (page) {
        if (!grouped[page.module]) grouped[page.module] = [];
        grouped[page.module].push(page);
      }
    });
    return grouped;
  };

  const togglePermission = (permId: string) => {
    setFormData(prev => ({ ...prev, permissions: prev.permissions.includes(permId) ? prev.permissions.filter(p => p !== permId) : [...prev.permissions, permId] }));
  };

  const toggleModulePermissions = (module: string) => {
    const modulePageIds = ALL_PAGE_PERMISSIONS.filter((p) => p.module === module).map((p) => p.id);
    const allSelected = modulePageIds.every(id => formData.permissions.includes(id));
    setFormData(prev => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter(p => !modulePageIds.includes(p))
        : [...new Set([...prev.permissions, ...modulePageIds])]
    }));
  };

  const resetForm = () => { setFormData({ name: '', description: '', type: 'Clinical', permissions: [], capabilities: [], isActive: true }); };
  const openCreate = () => { resetForm(); setIsCreateDialogOpen(true); };
  const openView = (role: Role) => { setSelectedRole(role); setIsViewDialogOpen(true); };
  const openEdit = (role: Role) => {
    setSelectedRole(role);
    setFormData({
      name: role.name,
      description: role.description,
      type: role.type,
      permissions: role.permissions,
      capabilities: role.capabilities,
      isActive: role.isActive,
    });
    setIsEditDialogOpen(true);
  };
  const openDuplicate = (role: Role) => {
    const supportName = role.name.endsWith(' Support')
      ? `${role.name} (Copy)`
      : `${role.name} Support`;
    setSelectedRole(null);
    setFormData({
      name: supportName,
      description: role.description
        ? `${role.description} — support-level access (review pages and capabilities).`
        : 'Support-level access — review pages and capabilities before assigning.',
      type: role.type === 'System' ? 'Custom' : role.type,
      permissions: [...role.permissions],
      capabilities: role.capabilities.filter((cap) => !SENSITIVE_CAPABILITY_IDS.includes(cap as typeof SENSITIVE_CAPABILITY_IDS[number])),
      isActive: true,
    });
    setIsCreateDialogOpen(true);
  };
  const openDelete = (role: Role) => { setSelectedRole(role); setIsDeleteDialogOpen(true); };

  // System role functions
  const loadAllSystemRoles = async () => {
    try {
      const response = await apiFetch<{results: SystemRole[]}>('/accounts/system-roles/');
      if (response.results) {
        setAllSystemRoles(response.results);
      }
    } catch (err: any) {
      console.error('Error loading system roles:', err);
    }
  };

  const handleCreateSystemRole = async () => {
    try {
      await apiFetch('/accounts/system-roles/', {
        method: 'POST',
        body: JSON.stringify(systemRoleForm),
      });
      toast.success('System role created successfully');
      setSystemRoleDialogOpen(false);
      setSystemRoleForm({ name: '', description: '', is_active: true });
      loadAllSystemRoles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create system role');
    }
  };

  const handleUpdateSystemRole = async () => {
    if (!editingSystemRole) return;
    try {
      await apiFetch(`/accounts/system-roles/${editingSystemRole.id}/`, {
        method: 'PUT',
        body: JSON.stringify(systemRoleForm),
      });
      toast.success('System role updated successfully');
      setSystemRoleDialogOpen(false);
      setEditingSystemRole(null);
      setSystemRoleForm({ name: '', description: '', is_active: true });
      loadAllSystemRoles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update system role');
    }
  };

  const handleDeleteSystemRole = async (roleId: number) => {
    if (!confirm('Are you sure you want to delete this system role?')) return;
    try {
      await apiFetch(`/accounts/system-roles/${roleId}/`, {
        method: 'DELETE',
      });
      toast.success('System role deleted successfully');
      loadAllSystemRoles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete system role');
    }
  };

  const openSystemRoleDialog = (role?: SystemRole) => {
    if (role) {
      setEditingSystemRole(role);
      setSystemRoleForm({
        name: role.name,
        description: role.description,
        is_active: role.is_active,
      });
    } else {
      setEditingSystemRole(null);
      setSystemRoleForm({ name: '', description: '', is_active: true });
    }
    setSystemRoleDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!formData.name) {
      toast.error('Please enter a role name');
      return;
    }
    setIsSubmitting(true);
    
    try {
      await adminService.createRole({
        name: formData.name,
        description: formData.description,
        type: mapToBackendType(formData.type),
        permissions: convertPermissionsToBackend(formData.permissions, formData.capabilities),
        is_active: formData.isActive,
      });
      
      toast.success(`Role "${formData.name}" created`);
      setIsCreateDialogOpen(false);
      resetForm();
      await Promise.all([loadRoles(), loadRoleStats()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create role');
      console.error('Error creating role:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedRole) return;
    setIsSubmitting(true);
    
    try {
      const roleId = parseInt(selectedRole.id);
      await adminService.updateRole(roleId, {
        name: formData.name,
        description: formData.description,
        type: mapToBackendType(formData.type),
        permissions: convertPermissionsToBackend(formData.permissions, formData.capabilities),
        is_active: formData.isActive,
      });
      
      toast.success(`Role "${formData.name}" updated`);
      setIsEditDialogOpen(false);
      setSelectedRole(null);
      resetForm();
      await Promise.all([loadRoles(), loadRoleStats()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role');
      console.error('Error updating role:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRole) return;
    setIsSubmitting(true);
    
    try {
      const roleId = parseInt(selectedRole.id);
      await adminService.deleteRole(roleId);
      toast.success(`Role "${selectedRole.name}" deleted`);
      setIsDeleteDialogOpen(false);
      setSelectedRole(null);
      await Promise.all([loadRoles(), loadRoleStats()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete role');
      console.error('Error deleting role:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3"><Shield className="h-8 w-8 text-purple-500" />Roles Management</h1>
            <p className="text-muted-foreground mt-1">Manage access permissions and professional role identities</p>
          </div>
          <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 text-white"><Plus className="h-4 w-4 mr-2" />Create Access Role</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Roles</p><p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">{roleStats.total}</p></div><Shield className="h-8 w-8 text-purple-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Active Roles</p><p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{roleStats.active}</p></div><CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-teal-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Clinical Roles</p><p className="text-2xl sm:text-3xl font-bold text-teal-600 dark:text-teal-400">{roleStats.clinical}</p></div><Stethoscope className="h-8 w-8 text-teal-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Users with Roles</p><p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{roleStats.totalUsers}</p></div><Users className="h-8 w-8 text-blue-500 opacity-50" /></div></CardContent></Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="access-roles" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="access-roles" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Access Roles
            </TabsTrigger>
            <TabsTrigger value="permissions" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Permissions
            </TabsTrigger>
            <TabsTrigger value="system-roles" className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              System Roles
            </TabsTrigger>
          </TabsList>

          {/* Access Roles Tab */}
          <TabsContent value="access-roles" className="space-y-4 mt-6">
            {/* Trap-detector: any active role granting zero pages locks its
                users out of the EMR with the "Access not configured" screen.
                Surface them here with a one-click jump to Edit so admins
                catch the silent misconfiguration immediately. */}
            {(() => {
              const empty = roles.filter(r => r.isActive && r.permissions.length === 0);
              if (empty.length === 0) return null;
              return (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10">
                  <CardContent className="p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                        {empty.length} active role{empty.length === 1 ? '' : 's'} grant no pages
                      </p>
                      <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                        Users assigned to {empty.length === 1 ? 'this role' : 'these roles'} land on "Access not configured" at sign-in. Add pages on the role's Pages tab.
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {empty.map(r => (
                          <Button
                            key={r.id}
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-amber-300 hover:bg-amber-200"
                            onClick={() => openEdit(r)}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            {r.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
            <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search roles..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>{roleTypes.map(t => <SelectItem key={t} value={t === 'All Types' ? 'all' : t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                <p>Loading roles...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" className="mt-4" onClick={loadRoles}>Retry</Button>
              </CardContent>
            </Card>
          ) : roles.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No roles found</p>
              </CardContent>
            </Card>
          ) : (
            roles.map((role) => {
            const permsByModule = getPermissionsByModule(role.permissions);
            const borderColor = role.type === 'Clinical' ? 'border-l-emerald-500' : role.type === 'Administrative' ? 'border-l-blue-500' : role.type === 'System' ? 'border-l-purple-500' : 'border-l-amber-500';
            return (
              <Card key={role.id} className={`border-l-4 hover:shadow-md transition-shadow ${borderColor} ${!role.isActive ? 'opacity-60' : ''}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${getTypeBadgeColor(role.type)}`}>
                      {getRoleIcon(role.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{role.name}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTypeBadgeColor(role.type)}`}>
                            {role.type}
                          </Badge>
                          {!role.isActive && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openView(role)}>
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(role)}>
                            <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Duplicate as support role"
                            onClick={() => openDuplicate(role)}
                          >
                            <Copy className="h-4 w-4 text-muted-foreground hover:text-purple-500" />
                          </Button>
                          {role.type !== 'System' && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700" onClick={() => openDelete(role)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span className="font-medium text-foreground">{role.description}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{role.userCount} users</span>
                        <span>•</span>
                        {role.permissions.length === 0 && role.isActive ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-amber-400 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            No pages — add some
                          </Badge>
                        ) : (
                          <span className="flex items-center gap-1"><Lock className="h-3 w-3" />{role.permissions.length} pages</span>
                        )}
                        {Object.keys(permsByModule).length > 0 && (
                          <>
                            <span>•</span>
                            <span>{Object.keys(permsByModule).length} modules</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            })
          )}
        </div>

        {totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="roles"
            />
          </Card>
        )}
          </TabsContent>

          {/* System Roles Tab */}
          <TabsContent value="system-roles" className="space-y-4 mt-6">
            {/* System Roles Management */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-blue-500" />
              System Roles (Professional Identities)
            </CardTitle>
            <CardDescription>
              Manage professional role identities for staff. These are different from access roles - they define what someone IS (Doctor, Nurse) rather than what they can DO.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  Total System Roles: {allSystemRoles.length}
                </div>
                <Button onClick={() => openSystemRoleDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add System Role
                </Button>
              </div>

              <div className="grid gap-3">
                {allSystemRoles.map(role => (
                  <Card key={role.id} className={`border-l-4 ${role.is_active ? 'border-l-green-500' : 'border-l-gray-400'}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{role.name}</h4>
                            {!role.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">{role.description || 'No description'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openSystemRoleDialog(role)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteSystemRole(role.id)}>
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {allSystemRoles.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCog className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No system roles found</p>
                  <Button onClick={() => openSystemRoleDialog()} className="mt-4" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First System Role
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          {/* Permissions catalog tab */}
          <TabsContent value="permissions" className="space-y-4 mt-6">
            <PermissionsCatalogTab />
          </TabsContent>
        </Tabs>

        <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => { if (!open) { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-purple-500" />{isCreateDialogOpen ? 'Create Role' : 'Edit Role'}</DialogTitle><DialogDescription>{isCreateDialogOpen ? 'Define a new role with specific permissions' : `Update "${selectedRole?.name}" role settings`}</DialogDescription></DialogHeader>
            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Role Details</TabsTrigger>
                <TabsTrigger value="permissions">Pages ({formData.permissions.length})</TabsTrigger>
                <TabsTrigger value="capabilities">Capabilities ({formData.capabilities.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="space-y-2"><Label>Role Name *</Label><Input value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Senior Nurse" /></div>
                <div className="space-y-2"><Label>Description</Label><Input value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Role Type</Label><Select value={formData.type} onValueChange={(v) => setFormData(prev => ({ ...prev, type: v as Role['type'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Clinical">Clinical</SelectItem><SelectItem value="Administrative">Administrative</SelectItem><SelectItem value="Custom">Custom</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Status</Label><Select value={formData.isActive ? 'active' : 'inactive'} onValueChange={(v) => setFormData(prev => ({ ...prev, isActive: v === 'active' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
                </div>
                <EffectiveAccessPreview pages={formData.permissions} capabilities={formData.capabilities} />
              </TabsContent>
              <TabsContent value="permissions" className="mt-4">
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {pageModules.map(module => {
                    const modulePages = ALL_PAGE_PERMISSIONS.filter((p) => p.module === module);
                    const allChecked = modulePages.every(p => formData.permissions.includes(p.id));
                    return (
                      <Card key={module}>
                        <CardHeader className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={allChecked}
                              onCheckedChange={() => toggleModulePermissions(module)}
                            />
                            <CardTitle className="text-base">{module}</CardTitle>
                            <Badge variant="secondary" className="ml-auto">
                              {modulePages.filter(p => formData.permissions.includes(p.id)).length}/{modulePages.length}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="py-2 px-4">
                          <div className="grid grid-cols-2 gap-2">
                            {modulePages.map(page => (
                              <div key={page.id} className="flex items-center gap-2" title={page.description}>
                                <Checkbox
                                  id={page.id}
                                  checked={formData.permissions.includes(page.id)}
                                  onCheckedChange={() => togglePermission(page.id)}
                                />
                                <label htmlFor={page.id} className="text-sm cursor-pointer flex-1 truncate">
                                  {page.name}
                                </label>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
              <TabsContent value="capabilities" className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Sensitive actions beyond page access. Some capabilities are also granted automatically by certain pages.
                </p>
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {PAGE_MODULE_ORDER.filter((m) => ALL_CAPABILITIES.some((c) => c.module === m)).map((module) => {
                    const caps = ALL_CAPABILITIES.filter((c) => c.module === module);
                    return (
                      <Card key={module}>
                        <CardHeader className="py-3 px-4">
                          <CardTitle className="text-base">{module}</CardTitle>
                        </CardHeader>
                        <CardContent className="py-2 px-4 space-y-2">
                          {caps.map((cap) => (
                            <label key={cap.id} className="flex items-start gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={formData.capabilities.includes(cap.id)}
                                onCheckedChange={(checked) => {
                                  setFormData((prev) => {
                                    const cur = new Set(prev.capabilities);
                                    if (checked) cur.add(cap.id);
                                    else cur.delete(cap.id);
                                    return { ...prev, capabilities: Array.from(cur) };
                                  });
                                }}
                              />
                              <span>
                                <span className="font-medium">{cap.name}</span>
                                <span className="block text-xs text-muted-foreground">{cap.description}</span>
                              </span>
                            </label>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="mt-6"><Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); }}>Cancel</Button><Button onClick={isCreateDialogOpen ? handleCreate : handleUpdate} disabled={isSubmitting || !formData.name} className="bg-purple-600 hover:bg-purple-700">{isSubmitting ? 'Saving...' : isCreateDialogOpen ? 'Create Role' : 'Save Changes'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-purple-500" />{selectedRole?.name}</DialogTitle><DialogDescription>{selectedRole?.description}</DialogDescription></DialogHeader>
            {selectedRole && (<div className="space-y-6 mt-4">
              <div className="flex items-center gap-4"><Badge variant="outline" className={getTypeBadgeColor(selectedRole.type)}>{getRoleIcon(selectedRole.type)} {selectedRole.type}</Badge><Badge variant={selectedRole.isActive ? 'default' : 'secondary'}>{selectedRole.isActive ? 'Active' : 'Inactive'}</Badge><span className="text-sm text-muted-foreground">{selectedRole.userCount} users assigned</span></div>
              <div><h4 className="font-medium mb-3">Pages ({selectedRole.permissions.length})</h4><div className="space-y-3">{Object.entries(getPermissionsByModule(selectedRole.permissions)).map(([module, perms]) => (<Card key={module}><CardHeader className="py-2 px-4"><CardTitle className="text-sm">{module}</CardTitle></CardHeader><CardContent className="py-2 px-4"><div className="flex flex-wrap gap-1">{perms.map(p => (<Badge key={p.id} variant="secondary" className="text-xs"><Check className="h-3 w-3 mr-1" />{p.name}</Badge>))}</div></CardContent></Card>))}</div></div>
              <EffectiveAccessPreview roleId={Number(selectedRole.id)} />
              <div className="text-xs text-muted-foreground"><p>Created: {selectedRole.createdAt}</p><p>Last updated: {selectedRole.updatedAt}</p></div>
            </div>)}
            <DialogFooter><Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button><Button onClick={() => { setIsViewDialogOpen(false); if (selectedRole) openEdit(selectedRole); }}><Edit className="h-4 w-4 mr-2" />Edit Role</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2 text-rose-600"><Trash2 className="h-5 w-5" />Delete Role</DialogTitle><DialogDescription>Are you sure you want to delete "{selectedRole?.name}"?{selectedRole && selectedRole.userCount > 0 && (<span className="block mt-2 text-amber-600"><AlertTriangle className="h-4 w-4 inline mr-1" />Warning: {selectedRole.userCount} users are assigned to this role.</span>)}</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>{isSubmitting ? 'Deleting...' : 'Delete Role'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* System Role Create/Edit Dialog */}
        <Dialog open={systemRoleDialogOpen} onOpenChange={setSystemRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-blue-500" />
                {editingSystemRole ? 'Edit System Role' : 'Create System Role'}
              </DialogTitle>
              <DialogDescription>
                {editingSystemRole
                  ? `Update the "${editingSystemRole.name}" professional role`
                  : 'Define a new professional role identity for staff'
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="system-role-name">Role Name *</Label>
                <Input
                  id="system-role-name"
                  value={systemRoleForm.name}
                  onChange={(e) => setSystemRoleForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Cardiologist, Dermatologist"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="system-role-description">Description</Label>
                <Input
                  id="system-role-description"
                  value={systemRoleForm.description}
                  onChange={(e) => setSystemRoleForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this professional role"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="system-role-active"
                  checked={systemRoleForm.is_active}
                  onCheckedChange={(checked) =>
                    setSystemRoleForm(prev => ({ ...prev, is_active: checked as boolean }))
                  }
                />
                <Label htmlFor="system-role-active">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSystemRoleDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={editingSystemRole ? handleUpdateSystemRole : handleCreateSystemRole}
                disabled={!systemRoleForm.name.trim()}
              >
                {editingSystemRole ? 'Update Role' : 'Create Role'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}