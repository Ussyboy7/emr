"use client";

import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
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
import { StandardPagination } from "@/components/StandardPagination";
import { adminService, type Role as ApiRole } from "@/lib/services";
import {
  Shield, Search, Plus, Edit, Trash2, Eye, Users, Copy, Check,
  Stethoscope, Syringe, FlaskConical, Pill, ScanLine, ClipboardList, UserCog,
  Building2, Settings, Lock, Key, AlertTriangle, CheckCircle2, Loader2
} from "lucide-react";

interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  type: 'System' | 'Clinical' | 'Administrative' | 'Custom';
  permissions: string[];
  userCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const allPermissions: Permission[] = [
  { id: 'patient_view', name: 'View Patients', description: 'View patient records', module: 'Medical Records' },
  { id: 'patient_create', name: 'Register Patients', description: 'Register new patients', module: 'Medical Records' },
  { id: 'patient_edit', name: 'Edit Patients', description: 'Edit patient information', module: 'Medical Records' },
  { id: 'patient_delete', name: 'Delete Patients', description: 'Delete patient records', module: 'Medical Records' },
  { id: 'visit_view', name: 'View Visits', description: 'View visit records', module: 'Medical Records' },
  { id: 'visit_create', name: 'Create Visits', description: 'Create new visits', module: 'Medical Records' },
  { id: 'visit_edit', name: 'Edit Visits', description: 'Edit visit information', module: 'Medical Records' },
  { id: 'reports_view', name: 'View Reports', description: 'View medical reports', module: 'Medical Records' },
  { id: 'reports_generate', name: 'Generate Reports', description: 'Generate medical reports', module: 'Medical Records' },
  { id: 'consultation_view', name: 'View Consultations', description: 'View consultation records', module: 'Consultation' },
  { id: 'consultation_start', name: 'Start Consultation', description: 'Start consultation sessions', module: 'Consultation' },
  { id: 'consultation_prescribe', name: 'Prescribe Medications', description: 'Write prescriptions', module: 'Consultation' },
  { id: 'consultation_diagnosis', name: 'Add Diagnosis', description: 'Add diagnosis to patient records', module: 'Consultation' },
  { id: 'consultation_lab_order', name: 'Order Lab Tests', description: 'Order laboratory tests', module: 'Consultation' },
  { id: 'consultation_radiology_order', name: 'Order Imaging', description: 'Order radiology studies', module: 'Consultation' },
  { id: 'consultation_referral', name: 'Make Referrals', description: 'Refer patients to specialists', module: 'Consultation' },
  { id: 'consultation_nursing_order', name: 'Order Nursing Procedures', description: 'Order nursing procedures', module: 'Consultation' },
  { id: 'nursing_vitals', name: 'Record Vitals', description: 'Record patient vital signs', module: 'Nursing' },
  { id: 'nursing_triage', name: 'Triage Patients', description: 'Perform patient triage', module: 'Nursing' },
  { id: 'nursing_administer', name: 'Administer Medications', description: 'Administer medications to patients', module: 'Nursing' },
  { id: 'nursing_procedures', name: 'Perform Procedures', description: 'Perform nursing procedures', module: 'Nursing' },
  { id: 'nursing_notes', name: 'Write Nursing Notes', description: 'Document nursing notes', module: 'Nursing' },
  { id: 'nursing_queue', name: 'Manage Queue', description: 'Manage nursing queue', module: 'Nursing' },
  { id: 'lab_orders_view', name: 'View Lab Orders', description: 'View laboratory orders', module: 'Laboratory' },
  { id: 'lab_collect', name: 'Collect Specimens', description: 'Collect lab specimens', module: 'Laboratory' },
  { id: 'lab_process', name: 'Process Tests', description: 'Process laboratory tests', module: 'Laboratory' },
  { id: 'lab_results', name: 'Enter Results', description: 'Enter lab results', module: 'Laboratory' },
  { id: 'lab_verify', name: 'Verify Results', description: 'Verify lab results', module: 'Laboratory' },
  { id: 'lab_templates', name: 'Manage Templates', description: 'Manage test templates', module: 'Laboratory' },
  { id: 'pharmacy_view', name: 'View Prescriptions', description: 'View prescription queue', module: 'Pharmacy' },
  { id: 'pharmacy_dispense', name: 'Dispense Medications', description: 'Dispense medications', module: 'Pharmacy' },
  { id: 'pharmacy_inventory', name: 'Manage Inventory', description: 'Manage drug inventory', module: 'Pharmacy' },
  { id: 'pharmacy_substitute', name: 'Substitute Drugs', description: 'Substitute medications', module: 'Pharmacy' },
  { id: 'radiology_view', name: 'View Studies', description: 'View radiology studies', module: 'Radiology' },
  { id: 'radiology_perform', name: 'Perform Studies', description: 'Perform imaging studies', module: 'Radiology' },
  { id: 'radiology_report', name: 'Write Reports', description: 'Write radiology reports', module: 'Radiology' },
  { id: 'radiology_verify', name: 'Verify Reports', description: 'Verify radiology reports', module: 'Radiology' },
  { id: 'admin_users', name: 'Manage Users', description: 'Manage user accounts', module: 'Administration' },
  { id: 'admin_roles', name: 'Manage Roles', description: 'Manage roles and permissions', module: 'Administration' },
  { id: 'admin_rooms', name: 'Manage Rooms', description: 'Manage consultation rooms', module: 'Administration' },
  { id: 'admin_clinics', name: 'Manage Clinics', description: 'Manage clinic settings', module: 'Administration' },
  { id: 'admin_settings', name: 'System Settings', description: 'Access system settings', module: 'Administration' },
  { id: 'admin_audit', name: 'View Audit Trail', description: 'View audit logs', module: 'Administration' },
];

const permissionModules = [...new Set(allPermissions.map(p => p.module))];
const roleTypes = ['All Types', 'System', 'Clinical', 'Administrative', 'Custom'];

export default function RolesPermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load roles from API
  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminService.getRoles({ page_size: 1000 });
      
      // Transform API roles to frontend format
      const transformedRoles: Role[] = response.results.map((role: ApiRole) => ({
        id: role.id.toString(),
        name: role.name,
        description: role.description || '',
        type: role.type as Role['type'],
        permissions: role.permissions || [],
        userCount: role.user_count || 0,
        isActive: role.is_active,
        createdAt: role.created_at?.split('T')[0] || '',
        updatedAt: role.updated_at?.split('T')[0] || '',
      }));
      
      setRoles(transformedRoles);
    } catch (err: any) {
      setError(err.message || 'Failed to load roles');
      toast.error('Failed to load roles. Please try again.');
      console.error('Error loading roles:', err);
    } finally {
      setLoading(false);
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', type: 'Clinical' as Role['type'], permissions: [] as string[], isActive: true });

  const filteredRoles = useMemo(() => {
    return roles.filter(r => {
      const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || r.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'Active' ? r.isActive : !r.isActive);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [roles, searchQuery, typeFilter, statusFilter]);

  const paginatedRoles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredRoles.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRoles, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, typeFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: roles.length, active: roles.filter(r => r.isActive).length,
    clinical: roles.filter(r => r.type === 'Clinical').length,
    totalUsers: roles.reduce((acc, r) => acc + r.userCount, 0),
  }), [roles]);

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

  const getPermissionsByModule = (permissionIds: string[]) => {
    const grouped: Record<string, Permission[]> = {};
    permissionIds.forEach(id => {
      const perm = allPermissions.find(p => p.id === id);
      if (perm) { if (!grouped[perm.module]) grouped[perm.module] = []; grouped[perm.module].push(perm); }
    });
    return grouped;
  };

  const togglePermission = (permId: string) => {
    setFormData(prev => ({ ...prev, permissions: prev.permissions.includes(permId) ? prev.permissions.filter(p => p !== permId) : [...prev.permissions, permId] }));
  };

  const toggleModulePermissions = (module: string) => {
    const modulePermIds = allPermissions.filter(p => p.module === module).map(p => p.id);
    const allSelected = modulePermIds.every(id => formData.permissions.includes(id));
    setFormData(prev => ({ ...prev, permissions: allSelected ? prev.permissions.filter(p => !modulePermIds.includes(p)) : [...new Set([...prev.permissions, ...modulePermIds])] }));
  };

  const resetForm = () => { setFormData({ name: '', description: '', type: 'Clinical', permissions: [], isActive: true }); };
  const openCreate = () => { resetForm(); setIsCreateDialogOpen(true); };
  const openView = (role: Role) => { setSelectedRole(role); setIsViewDialogOpen(true); };
  const openEdit = (role: Role) => { setSelectedRole(role); setFormData({ name: role.name, description: role.description, type: role.type, permissions: role.permissions, isActive: role.isActive }); setIsEditDialogOpen(true); };
  const openDelete = (role: Role) => { setSelectedRole(role); setIsDeleteDialogOpen(true); };

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
        type: formData.type,
        permissions: formData.permissions,
        is_active: formData.isActive,
      });
      
      toast.success(`Role "${formData.name}" created`);
      setIsCreateDialogOpen(false);
      resetForm();
      await loadRoles(); // Reload roles
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
        type: formData.type,
        permissions: formData.permissions,
        is_active: formData.isActive,
      });
      
      toast.success(`Role "${formData.name}" updated`);
      setIsEditDialogOpen(false);
      setSelectedRole(null);
      resetForm();
      await loadRoles(); // Reload roles
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
      await loadRoles(); // Reload roles
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete role');
      console.error('Error deleting role:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3"><Shield className="h-8 w-8 text-purple-500" />Roles & Permissions</h1>
            <p className="text-muted-foreground mt-1">Define access levels and clinical privileges</p>
          </div>
          <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 text-white"><Plus className="h-4 w-4 mr-2" />Create Role</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Roles</p><p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.total}</p></div><Shield className="h-8 w-8 text-purple-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Active Roles</p><p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p></div><CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-teal-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Clinical Roles</p><p className="text-3xl font-bold text-teal-600 dark:text-teal-400">{stats.clinical}</p></div><Stethoscope className="h-8 w-8 text-teal-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Users with Roles</p><p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.totalUsers}</p></div><Users className="h-8 w-8 text-blue-500 opacity-50" /></div></CardContent></Card>
        </div>

        <Card><CardContent className="p-4"><div className="flex flex-col md:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search roles..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" /></div>
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent>{roleTypes.map(t => <SelectItem key={t} value={t === 'All Types' ? 'all' : t}>{t}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent></Select>
        </div></CardContent></Card>

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
          ) : (
            paginatedRoles.map(role => {
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
                        <span className="flex items-center gap-1"><Lock className="h-3 w-3" />{role.permissions.length} permissions</span>
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

        {filteredRoles.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No roles found</p>
          </CardContent></Card>
        )}
        {filteredRoles.length > 0 && (
          <Card className="p-4">
            <StandardPagination currentPage={currentPage} totalItems={filteredRoles.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} itemName="roles" />
          </Card>
        )}

        <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => { if (!open) { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); } }}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-purple-500" />{isCreateDialogOpen ? 'Create Role' : 'Edit Role'}</DialogTitle><DialogDescription>{isCreateDialogOpen ? 'Define a new role with specific permissions' : `Update "${selectedRole?.name}" role settings`}</DialogDescription></DialogHeader>
            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="details">Role Details</TabsTrigger><TabsTrigger value="permissions">Permissions ({formData.permissions.length})</TabsTrigger></TabsList>
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="space-y-2"><Label>Role Name *</Label><Input value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Senior Nurse" /></div>
                <div className="space-y-2"><Label>Description</Label><Input value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Role Type</Label><Select value={formData.type} onValueChange={(v) => setFormData(prev => ({ ...prev, type: v as Role['type'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Clinical">Clinical</SelectItem><SelectItem value="Administrative">Administrative</SelectItem><SelectItem value="Custom">Custom</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Status</Label><Select value={formData.isActive ? 'active' : 'inactive'} onValueChange={(v) => setFormData(prev => ({ ...prev, isActive: v === 'active' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
                </div>
              </TabsContent>
              <TabsContent value="permissions" className="mt-4">
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {permissionModules.map(module => {
                    const modulePerms = allPermissions.filter(p => p.module === module);
                    const allChecked = modulePerms.every(p => formData.permissions.includes(p.id));
                    return (
                      <Card key={module}><CardHeader className="py-3 px-4"><div className="flex items-center gap-2"><Checkbox checked={allChecked} onCheckedChange={() => toggleModulePermissions(module)} /><CardTitle className="text-base">{module}</CardTitle><Badge variant="secondary" className="ml-auto">{modulePerms.filter(p => formData.permissions.includes(p.id)).length}/{modulePerms.length}</Badge></div></CardHeader>
                        <CardContent className="py-2 px-4"><div className="grid grid-cols-2 gap-2">{modulePerms.map(perm => (<div key={perm.id} className="flex items-center gap-2"><Checkbox id={perm.id} checked={formData.permissions.includes(perm.id)} onCheckedChange={() => togglePermission(perm.id)} /><label htmlFor={perm.id} className="text-sm cursor-pointer">{perm.name}</label></div>))}</div></CardContent>
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
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-purple-500" />{selectedRole?.name}</DialogTitle><DialogDescription>{selectedRole?.description}</DialogDescription></DialogHeader>
            {selectedRole && (<div className="space-y-6 mt-4">
              <div className="flex items-center gap-4"><Badge variant="outline" className={getTypeBadgeColor(selectedRole.type)}>{getRoleIcon(selectedRole.type)} {selectedRole.type}</Badge><Badge variant={selectedRole.isActive ? 'default' : 'secondary'}>{selectedRole.isActive ? 'Active' : 'Inactive'}</Badge><span className="text-sm text-muted-foreground">{selectedRole.userCount} users assigned</span></div>
              <div><h4 className="font-medium mb-3">Permissions ({selectedRole.permissions.length})</h4><div className="space-y-3">{Object.entries(getPermissionsByModule(selectedRole.permissions)).map(([module, perms]) => (<Card key={module}><CardHeader className="py-2 px-4"><CardTitle className="text-sm">{module}</CardTitle></CardHeader><CardContent className="py-2 px-4"><div className="flex flex-wrap gap-1">{perms.map(p => (<Badge key={p.id} variant="secondary" className="text-xs"><Check className="h-3 w-3 mr-1" />{p.name}</Badge>))}</div></CardContent></Card>))}</div></div>
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
      </div>
    </DashboardLayout>
  );
}
