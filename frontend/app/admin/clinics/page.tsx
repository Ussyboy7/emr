"use client";

import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { StandardPagination } from "@/components/StandardPagination";
import { adminService, type Clinic as ApiClinic, type Department as ApiDepartment } from "@/lib/services";
import {
  Building2, Search, Plus, Edit, Trash2, Eye, Users, MapPin,
  Stethoscope, CheckCircle2, XCircle, AlertTriangle, Activity, DoorOpen, Loader2
} from "lucide-react";

interface Clinic {
  id: string;
  code: string;
  name: string;
  description: string;
  location: string;
  phone: string;
  email: string;
  staffCount: number;
  roomCount: number;
  isActive: boolean;
  createdAt: string;
}

interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  head: string;
  staffCount: number;
  clinics: string[];
  clinic: string;
  isActive: boolean;
}

export default function ClinicDepartmentPage() {
  const [activeTab, setActiveTab] = useState('clinics');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deptUsers, setDeptUsers] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);

  // Load clinics and departments from API
  useEffect(() => {
    loadData();
    loadUsers();
  }, [currentPage, itemsPerPage]);

  const loadUsers = async () => {
    try {
      const usersResponse = await adminService.getUsers({ page_size: 1000 });
      setAvailableUsers(usersResponse.results || []);
    } catch (err: any) {
      console.error('Error loading users:', err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [clinicsResponse, deptsResponse] = await Promise.all([
        adminService.getClinics({
          page: currentPage,
          page_size: itemsPerPage,
          search: searchQuery || undefined,
          is_active: statusFilter !== 'all' ? (statusFilter === 'Active') : undefined,
        }),
        adminService.getDepartments({
          page: currentPage,
          page_size: itemsPerPage,
          search: searchQuery || undefined,
          // Note: clinic filter not yet implemented in backend
          is_active: statusFilter !== 'all' ? (statusFilter === 'Active') : undefined,
        }),
      ]);
      setTotalCount(clinicsResponse.count || clinicsResponse.results.length);
      
      // Transform clinics
      const transformedClinics: Clinic[] = clinicsResponse.results.map((clinic: ApiClinic) => ({
        id: clinic.id.toString(),
        code: clinic.code,
        name: clinic.name,
        description: clinic.description || '',
        location: clinic.location || '',
        phone: clinic.phone || '',
        email: clinic.email || '',
        staffCount: clinic.staff_count || 0,
        roomCount: clinic.room_count || 0,
        isActive: clinic.is_active,
        createdAt: clinic.created_at?.split('T')[0] || '',
      }));
      
      // Transform departments
      const transformedDepts: Department[] = deptsResponse.results.map((dept: ApiDepartment) => ({
        id: dept.id.toString(),
        code: dept.code,
        name: dept.name,
        description: dept.description || '',
        head: dept.head_name || '',
        staffCount: dept.staff_count || 0,
        clinics: dept.clinic_name ? [dept.clinic_name] : [],
        clinic: dept.clinic?.toString() || '',
        isActive: dept.is_active,
      }));
      
      setClinics(transformedClinics);
      setDepartments(transformedDepts);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      toast.error('Failed to load clinics/departments. Please try again.');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [clinicForm, setClinicForm] = useState<Partial<Clinic>>({
    code: '', name: '', description: '', location: '', phone: '', email: '', isActive: true
  });
  const [deptForm, setDeptForm] = useState<Partial<Department>>({ code: '', name: '', description: '', clinic: '', head: '', isActive: true });
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);

  const filteredClinics = useMemo(() => {
    return clinics.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'Active' ? c.isActive : !c.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [clinics, searchQuery, statusFilter]);

  const filteredDepartments = useMemo(() => {
    return departments.filter(d => {
      const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) || d.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'Active' ? d.isActive : !d.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [departments, searchQuery, statusFilter]);

  // Use filtered data directly (server-side pagination when no client-side filters)
  const paginatedClinics = filteredClinics;
  const paginatedDepartments = filteredDepartments;

  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, activeTab, itemsPerPage]);

  const stats = useMemo(() => ({
    totalClinics: clinics.length,
    activeClinics: clinics.filter(c => c.isActive).length,
    totalDepartments: departments.length,
    totalStaff: [...clinics, ...departments].reduce((acc, item) => acc + item.staffCount, 0) / 2,
    totalRooms: clinics.reduce((acc, c) => acc + c.roomCount, 0),
  }), [clinics, departments]);

  const resetClinicForm = () => {
    setClinicForm({ code: '', name: '', description: '', location: '', phone: '', email: '', isActive: true });
  };

  const resetDeptForm = () => { setDeptForm({ code: '', name: '', description: '', clinic: '', head: '', isActive: true }); };

  const openCreateClinic = () => { resetClinicForm(); setIsCreateDialogOpen(true); };
  const openViewClinic = async (c: Clinic) => { 
    setSelectedClinic(c); 
    setIsViewDialogOpen(true);
    // Load rooms and users for this clinic
    await loadClinicDetails(parseInt(c.id));
  };
  
  const loadClinicDetails = async (clinicId: number) => {
    setLoadingDetails(true);
    try {
      // Load clinic details (rooms and users) - data fetched but not currently displayed
      // Note: API doesn't support clinic filtering for users
      await Promise.all([
        adminService.getRooms({ page_size: 1000 }), // Get all rooms, filter client-side if needed
        adminService.getUsers({ page_size: 1000 }), // Get all users, filter client-side if needed
      ]);
    } catch (err: any) {
      console.error('Error loading clinic details:', err);
      toast.error('Failed to load clinic details');
    } finally {
      setLoadingDetails(false);
    }
  };
  
  const openEditClinic = (c: Clinic) => { 
    setSelectedClinic(c); 
    setClinicForm({
      code: c.code,
      name: c.name,
      description: c.description,
      location: c.location,
      phone: c.phone,
      email: c.email,
      isActive: c.isActive,
    }); 
    setIsEditDialogOpen(true); 
  };
  const openDeleteClinic = (c: Clinic) => { setSelectedClinic(c); setIsDeleteDialogOpen(true); };

  const openCreateDept = () => { resetDeptForm(); setIsCreateDialogOpen(true); };
  const openViewDept = async (d: Department) => { 
    setSelectedDepartment(d); 
    setIsViewDialogOpen(true);
    // Load users for this department
    await loadDepartmentDetails(parseInt(d.id));
  };
  
  const loadDepartmentDetails = async (deptId: number) => {
    setLoadingDetails(true);
    try {
      // Note: API doesn't support department filtering for users
      const usersResponse = await adminService.getUsers({ page_size: 1000 }); // Get all users, filter client-side if needed
      setDeptUsers(usersResponse.results || []);
    } catch (err: any) {
      console.error('Error loading department details:', err);
      toast.error('Failed to load department details');
    } finally {
      setLoadingDetails(false);
    }
  };
  const openEditDept = (d: Department) => { 
    setSelectedDepartment(d); 
    setDeptForm({
      code: d.code,
      name: d.name,
      description: d.description,
      clinic: d.clinic || '',
      head: d.head || '',
      isActive: d.isActive,
    }); 
    setIsEditDialogOpen(true); 
  };
  const openDeleteDept = (d: Department) => { setSelectedDepartment(d); setIsDeleteDialogOpen(true); };


  const handleCreateClinic = async () => {
    if (!clinicForm.name || !clinicForm.code) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);
    
    try {
      await adminService.createClinic({
        code: clinicForm.code,
        name: clinicForm.name,
        description: clinicForm.description,
        location: clinicForm.location,
        phone: clinicForm.phone,
        email: clinicForm.email,
        is_active: clinicForm.isActive,
      });
      
      toast.success(`Clinic "${clinicForm.name}" created`);
      setIsCreateDialogOpen(false);
      resetClinicForm();
      await loadData(); // Reload data
    } catch (err: any) {
      toast.error(err.message || 'Failed to create clinic');
      console.error('Error creating clinic:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateClinic = async () => {
    if (!selectedClinic) return;
    setIsSubmitting(true);
    
    try {
      const clinicId = parseInt(selectedClinic.id);
      await adminService.updateClinic(clinicId, {
        code: clinicForm.code,
        name: clinicForm.name,
        description: clinicForm.description,
        location: clinicForm.location,
        phone: clinicForm.phone,
        email: clinicForm.email,
        is_active: clinicForm.isActive,
      });
      
      toast.success(`Clinic "${clinicForm.name}" updated`);
      setIsEditDialogOpen(false);
      setSelectedClinic(null);
      resetClinicForm();
      await loadData(); // Reload data
    } catch (err: any) {
      toast.error(err.message || 'Failed to update clinic');
      console.error('Error updating clinic:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClinic = async () => {
    if (!selectedClinic) return;
    setIsSubmitting(true);
    
    try {
      const clinicId = parseInt(selectedClinic.id);
      await adminService.deleteClinic(clinicId);
      toast.success(`Clinic "${selectedClinic.name}" deleted`);
      setIsDeleteDialogOpen(false);
      setSelectedClinic(null);
      await loadData(); // Reload data
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete clinic');
      console.error('Error deleting clinic:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDept = async () => {
    if (!deptForm.name || !deptForm.code) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);
    
    try {
      if (!deptForm.clinic) {
        toast.error('Please select a clinic');
        return;
      }
      await adminService.createDepartment({
        code: deptForm.code,
        name: deptForm.name,
        description: deptForm.description,
        clinic: parseInt(deptForm.clinic as string),
        head: deptForm.head ? parseInt(deptForm.head as string) : undefined,
        is_active: deptForm.isActive,
      });
      
      toast.success(`Department "${deptForm.name}" created`);
      setIsCreateDialogOpen(false);
      resetDeptForm();
      await loadData(); // Reload data
    } catch (err: any) {
      toast.error(err.message || 'Failed to create department');
      console.error('Error creating department:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateDept = async () => {
    if (!selectedDepartment) return;
    setIsSubmitting(true);
    
    try {
      const deptId = parseInt(selectedDepartment.id);
      if (!deptForm.clinic) {
        toast.error('Please select a clinic');
        return;
      }
      await adminService.updateDepartment(deptId, {
        code: deptForm.code,
        name: deptForm.name,
        description: deptForm.description,
        clinic: parseInt(deptForm.clinic as string),
        head: deptForm.head ? parseInt(deptForm.head as string) : undefined,
        is_active: deptForm.isActive,
      });
      
      toast.success(`Department "${deptForm.name}" updated`);
      setIsEditDialogOpen(false);
      setSelectedDepartment(null);
      resetDeptForm();
      await loadData(); // Reload data
    } catch (err: any) {
      toast.error(err.message || 'Failed to update department');
      console.error('Error updating department:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDept = async () => {
    if (!selectedDepartment) return;
    setIsSubmitting(true);
    
    try {
      const deptId = parseInt(selectedDepartment.id);
      await adminService.deleteDepartment(deptId);
      toast.success(`Department "${selectedDepartment.name}" deleted`);
      setIsDeleteDialogOpen(false);
      setSelectedDepartment(null);
      await loadData(); // Reload data
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete department');
      console.error('Error deleting department:', err);
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3"><Building2 className="h-8 w-8 text-teal-500" />Clinics & Departments</h1>
            <p className="text-muted-foreground mt-1">Manage clinics and organizational structure</p>
          </div>
          <Button onClick={activeTab === 'clinics' ? openCreateClinic : openCreateDept} className="bg-teal-600 hover:bg-teal-700 text-white">
            <Plus className="h-4 w-4 mr-2" />Add {activeTab === 'clinics' ? 'Clinic' : 'Department'}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-l-4 border-l-teal-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Clinics</p><p className="text-2xl sm:text-3xl font-bold text-teal-600 dark:text-teal-400">{stats.totalClinics}</p></div><Building2 className="h-8 w-8 text-teal-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Active Clinics</p><p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.activeClinics}</p></div><CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Departments</p><p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.totalDepartments}</p></div><Activity className="h-8 w-8 text-blue-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Staff</p><p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.totalStaff}</p></div><Users className="h-8 w-8 text-purple-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-amber-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Rooms</p><p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.totalRooms}</p></div><DoorOpen className="h-8 w-8 text-amber-500 opacity-50" /></div></CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="clinics">Clinics</TabsTrigger><TabsTrigger value="departments">Departments</TabsTrigger></TabsList>

          <Card className="mt-4"><CardContent className="p-4"><div className="flex flex-col md:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" /></div>
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent></Select>
          </div></CardContent></Card>

          <TabsContent value="clinics">
            {loading ? (
              <Card className="mt-4">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p>Loading clinics...</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 mt-4">
                {paginatedClinics.map(clinic => (
                <Card key={clinic.id} className={`border-l-4 hover:shadow-md transition-shadow ${clinic.isActive ? 'border-l-teal-500' : 'border-l-gray-500'} ${!clinic.isActive ? 'opacity-60' : ''}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${clinic.isActive ? 'bg-teal-100 dark:bg-teal-900/30' : 'bg-gray-100 dark:bg-gray-900/30'}`}>
                        <Building2 className={`h-5 w-5 ${clinic.isActive ? 'text-teal-600' : 'text-gray-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{clinic.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{clinic.code}</Badge>
                            <Badge variant={clinic.isActive ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                              {clinic.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewClinic(clinic)}>
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditClinic(clinic)}>
                              <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700" onClick={() => openDeleteClinic(clinic)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="font-medium text-foreground">{clinic.description}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{clinic.location}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{clinic.staffCount} staff</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><DoorOpen className="h-3 w-3" />{clinic.roomCount} rooms</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                ))}
              </div>
            )}
            {!loading && filteredClinics.length === 0 && (
              <Card className="mt-4"><CardContent className="p-8 text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No clinics found</p>
              </CardContent></Card>
            )}
            {filteredClinics.length > 0 && (
              <div className="mt-4">
                <Card className="p-4">
                  <StandardPagination currentPage={currentPage} totalItems={filteredClinics.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} itemName="clinics" />
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="departments">
            {loading ? (
              <Card className="mt-4">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p>Loading departments...</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 mt-4">
                {paginatedDepartments.map(dept => (
                <Card key={dept.id} className={`border-l-4 hover:shadow-md transition-shadow ${dept.isActive ? 'border-l-blue-500' : 'border-l-gray-500'} ${!dept.isActive ? 'opacity-60' : ''}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${dept.isActive ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-900/30'}`}>
                        <Activity className={`h-5 w-5 ${dept.isActive ? 'text-blue-600' : 'text-gray-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{dept.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{dept.code}</Badge>
                            <Badge variant={dept.isActive ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                              {dept.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDept(dept)}>
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDept(dept)}>
                              <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700" onClick={() => openDeleteDept(dept)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="font-medium text-foreground">{dept.description}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />Head: {dept.head}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{dept.staffCount} staff</span>
                          {dept.clinics.length > 0 && (
                            <>
                              <span>•</span>
                              <span>{dept.clinics.length} clinic{dept.clinics.length > 1 ? 's' : ''}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                ))}
              </div>
            )}
            {!loading && filteredDepartments.length === 0 && (
              <Card className="mt-4"><CardContent className="p-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No departments found</p>
              </CardContent></Card>
            )}
            {filteredDepartments.length > 0 && (
              <div className="mt-4">
                <Card className="p-4">
                  <StandardPagination 
                    currentPage={currentPage} 
                    totalItems={searchQuery || statusFilter !== 'all'
                      ? filteredDepartments.length 
                      : totalCount} 
                    itemsPerPage={itemsPerPage} 
                    onPageChange={setCurrentPage} 
                    onItemsPerPageChange={(newSize) => {
                      setItemsPerPage(newSize);
                      setCurrentPage(1);
                    }} 
                    itemName="departments" 
                  />
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Clinic Create/Edit Dialog */}
        <Dialog open={(isCreateDialogOpen || isEditDialogOpen) && activeTab === 'clinics'} onOpenChange={(open) => { if (!open) { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-teal-500" />{isCreateDialogOpen ? 'Add Clinic' : 'Edit Clinic'}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Code *</Label><Input value={clinicForm.code || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} placeholder="e.g., GEN" /></div><div className="space-y-2"><Label>Name *</Label><Input value={clinicForm.name || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., General Clinic" /></div></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={clinicForm.description || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description" /></div>
              <div className="space-y-2"><Label>Location</Label><Input value={clinicForm.location || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, location: e.target.value }))} placeholder="Building and floor" /></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Phone</Label><Input value={clinicForm.phone || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, phone: e.target.value }))} /></div><div className="space-y-2"><Label>Email</Label><Input value={clinicForm.email || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, email: e.target.value }))} /></div></div>
              <div className="flex items-center gap-2"><Switch checked={clinicForm.isActive} onCheckedChange={(checked) => setClinicForm(prev => ({ ...prev, isActive: checked }))} /><Label>Active</Label></div>
            </div>
            <DialogFooter className="mt-6"><Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); }}>Cancel</Button><Button onClick={isCreateDialogOpen ? handleCreateClinic : handleUpdateClinic} disabled={isSubmitting || !clinicForm.name} className="bg-teal-600 hover:bg-teal-700">{isSubmitting ? 'Saving...' : isCreateDialogOpen ? 'Create Clinic' : 'Save Changes'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Department Create/Edit Dialog */}
        <Dialog open={(isCreateDialogOpen || isEditDialogOpen) && activeTab === 'departments'} onOpenChange={(open) => { if (!open) { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-500" />{isCreateDialogOpen ? 'Add Department' : 'Edit Department'}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2"><Label>Clinic *</Label><Select value={deptForm.clinic || ''} onValueChange={(value) => setDeptForm(prev => ({ ...prev, clinic: value }))}><SelectTrigger><SelectValue placeholder="Select a clinic" /></SelectTrigger><SelectContent>{clinics.filter(c => c.isActive).map(clinic => (<SelectItem key={clinic.id} value={clinic.id.toString()}>{clinic.name}</SelectItem>))}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Code *</Label><Input value={deptForm.code || ''} onChange={(e) => setDeptForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} placeholder="e.g., MED" /></div><div className="space-y-2"><Label>Name *</Label><Input value={deptForm.name || ''} onChange={(e) => setDeptForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Medical Services" /></div></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={deptForm.description || ''} onChange={(e) => setDeptForm(prev => ({ ...prev, description: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Department Head</Label><Select value={deptForm.head || ''} onValueChange={(value) => setDeptForm(prev => ({ ...prev, head: value }))}><SelectTrigger><SelectValue placeholder="Select department head (optional)" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{availableUsers.filter(u => u.is_active).map(user => (<SelectItem key={user.id} value={user.id.toString()}>{user.first_name} {user.last_name} ({user.system_role || 'Staff'})</SelectItem>))}</SelectContent></Select></div>
              <div className="flex items-center gap-2"><Switch checked={deptForm.isActive} onCheckedChange={(checked) => setDeptForm(prev => ({ ...prev, isActive: checked }))} /><Label>Active</Label></div>
            </div>
            <DialogFooter className="mt-6"><Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); }}>Cancel</Button><Button onClick={isCreateDialogOpen ? handleCreateDept : handleUpdateDept} disabled={isSubmitting || !deptForm.name} className="bg-blue-600 hover:bg-blue-700">{isSubmitting ? 'Saving...' : isCreateDialogOpen ? 'Create Department' : 'Save Changes'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Clinic Dialog */}
        <Dialog open={isViewDialogOpen && activeTab === 'clinics'} onOpenChange={(open) => { if (!open) setIsViewDialogOpen(false); }}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-teal-500" />{selectedClinic?.name}</DialogTitle><DialogDescription>{selectedClinic?.code}</DialogDescription></DialogHeader>
            {selectedClinic && (<div className="space-y-6 mt-4">
              <p className="text-muted-foreground">{selectedClinic.description}</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground">Location</p><p className="font-medium flex items-center gap-1"><MapPin className="h-4 w-4" />{selectedClinic.location}</p></div>
                <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{selectedClinic.phone}</p></div>
                <div><p className="text-muted-foreground">Email</p><p className="font-medium">{selectedClinic.email}</p></div>
                <div><p className="text-muted-foreground">Staff</p><p className="font-medium">{selectedClinic.staffCount}</p></div>
                <div><p className="text-muted-foreground">Rooms</p><p className="font-medium">{selectedClinic.roomCount}</p></div>
              </div>
            </div>)}
            <DialogFooter><Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button><Button onClick={() => { setIsViewDialogOpen(false); if (selectedClinic) openEditClinic(selectedClinic); }}><Edit className="h-4 w-4 mr-2" />Edit</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Department Dialog */}
        <Dialog open={isViewDialogOpen && activeTab === 'departments'} onOpenChange={(open) => { if (!open) setIsViewDialogOpen(false); }}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-500" />{selectedDepartment?.name}</DialogTitle><DialogDescription>{selectedDepartment?.code}</DialogDescription></DialogHeader>
            {selectedDepartment && (<div className="space-y-4 mt-4">
              <p className="text-muted-foreground">{selectedDepartment.description}</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground">Clinic</p><p className="font-medium">{selectedDepartment.clinics[0] || 'N/A'}</p></div>
                <div><p className="text-muted-foreground">Head</p><p className="font-medium">{selectedDepartment.head || 'Not assigned'}</p></div>
                <div><p className="text-muted-foreground">Staff Count</p><p className="font-medium">{selectedDepartment.staffCount}</p></div>
              </div>
              
              {/* Staff Section */}
              <div>
                <p className="text-muted-foreground mb-2 font-semibold flex items-center gap-2"><Users className="h-4 w-4" />Staff ({deptUsers.length})</p>
                {loadingDetails ? (
                  <div className="text-center py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />Loading staff...</div>
                ) : deptUsers.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {deptUsers.map((user: any) => (
                      <div key={user.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                        <div>
                          <span className="font-medium">{user.first_name} {user.last_name}</span>
                          <span className="text-muted-foreground ml-2">({user.username})</span>
                          {user.clinic_name && <span className="text-muted-foreground ml-2">• {user.clinic_name}</span>}
                        </div>
                        <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-xs">{user.system_role || 'Staff'}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No staff assigned to this department</p>
                )}
              </div>
            </div>)}
            <DialogFooter><Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button><Button onClick={() => { setIsViewDialogOpen(false); if (selectedDepartment) openEditDept(selectedDepartment); }}><Edit className="h-4 w-4 mr-2" />Edit</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2 text-rose-600"><Trash2 className="h-5 w-5" />Delete {activeTab === 'clinics' ? 'Clinic' : 'Department'}</DialogTitle><DialogDescription>Are you sure you want to delete "{activeTab === 'clinics' ? selectedClinic?.name : selectedDepartment?.name}"?{(selectedClinic?.staffCount || selectedDepartment?.staffCount || 0) > 0 && (<span className="block mt-2 text-amber-600"><AlertTriangle className="h-4 w-4 inline mr-1" />This {activeTab === 'clinics' ? 'clinic' : 'department'} has assigned staff.</span>)}</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={activeTab === 'clinics' ? handleDeleteClinic : handleDeleteDept} disabled={isSubmitting}>{isSubmitting ? 'Deleting...' : 'Delete'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

