"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { StandardPagination } from "@/components/shared/StandardPagination";
import {
  adminService,
  type Clinic as ApiClinic,
  type Department as ApiDepartment,
  type OutpatientClinicType,
} from "@/lib/services";
import {
  Building2, Search, Plus, Edit, Trash2, Eye, Users, MapPin,
  Stethoscope, CheckCircle2, XCircle, AlertTriangle, Activity, DoorOpen, Loader2
} from "lucide-react";
import {
  ReferralFacilitiesManager,
  type ReferralFacilitiesManagerHandle,
} from "@/components/referrals/ReferralFacilitiesManager";
import {
  WardsAdminManager,
  type WardsAdminManagerHandle,
} from "@/components/admin/WardsAdminManager";
import {
  RoomsAdminManager,
  type RoomsAdminManagerHandle,
} from "@/components/admin/RoomsAdminManager";
import { DepartmentStaffDialog } from "@/components/admin/DepartmentStaffDialog";

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

interface SystemRoleRow {
  id: number;
  name: string;
  is_active: boolean;
}

/**
 * System Roles whose users should NOT be counted as "clinical staff" on the
 * Facilities & Departments KPI. Everything else in the active catalog is
 * treated as clinical (Medical Doctor, Nursing Officer, Cardiologist,
 * Ophthalmologist, …) — including new specialties added later via Roles
 * Management → System Roles. Add to this set if you ever introduce
 * additional non-clinical roles (e.g. "IT Support").
 */
const NON_CLINICAL_SYSTEM_ROLE_NAMES = new Set<string>([
  "System Administrator",
  "Admin Staff",
]);

/** Tolerate either a paginated response or a bare array, never invent data. */
function parseSystemRolesResponse(raw: unknown): SystemRoleRow[] {
  if (Array.isArray(raw)) return raw as SystemRoleRow[];
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { results?: unknown }).results)
  ) {
    return (raw as { results: SystemRoleRow[] }).results;
  }
  return [];
}

export default function ClinicDepartmentPage() {
  const [activeTab, setActiveTab] = useState<'facilities' | 'departments' | 'visit_types' | 'referral_facilities' | 'wards' | 'rooms'>('facilities');
  const referralFacilitiesRef = useRef<ReferralFacilitiesManagerHandle>(null);
  const wardsAdminRef = useRef<WardsAdminManagerHandle>(null);
  const roomsAdminRef = useRef<RoomsAdminManagerHandle>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deptUsers, setDeptUsers] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [clinicsTotalCount, setClinicsTotalCount] = useState(0);
  const [departmentsTotalCount, setDepartmentsTotalCount] = useState(0);
  const [kpiStats, setKpiStats] = useState<{
    total_clinics: number;
    active_clinics: number;
    total_departments: number;
    total_staff_links: number;
    total_rooms: number;
  } | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeptStaffDialogOpen, setIsDeptStaffDialogOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clinicForm, setClinicForm] = useState<Partial<Clinic>>({
    code: '', name: '', description: '', location: '', phone: '', email: '', isActive: true
  });
  const [deptForm, setDeptForm] = useState<Partial<Department>>({ code: '', name: '', description: '', clinic: '', head: '', isActive: true });
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [userRoleCounts, setUserRoleCounts] = useState<Record<string, number>>({});

  // Live "clinical" system-role catalog. Sourced from /accounts/system-roles/
  // so adding a new specialty (e.g. Cardiologist, Ophthalmologist) under
  // Roles Management → System Roles automatically participates in the
  // "Staff (sum)" KPI and per-facility staff counts. Any future is_clinical
  // flag on the SystemRole model can drop in here without touching callers.
  const [clinicalSystemRoleNames, setClinicalSystemRoleNames] = useState<Set<string>>(new Set());

  const [visitTypesList, setVisitTypesList] = useState<OutpatientClinicType[]>([]);
  const [loadingVisitTypes, setLoadingVisitTypes] = useState(false);
  const [allOutpatientTypes, setAllOutpatientTypes] = useState<OutpatientClinicType[]>([]);
  const [editFacilityVisitTypeIds, setEditFacilityVisitTypeIds] = useState<number[]>([]);
  const [isVisitTypeDialogOpen, setIsVisitTypeDialogOpen] = useState(false);
  const [isEditVisitType, setIsEditVisitType] = useState(false);
  const [selectedVisitType, setSelectedVisitType] = useState<OutpatientClinicType | null>(null);
  const [visitTypeForm, setVisitTypeForm] = useState({
    name: '',
    code: '',
    description: '',
    sort_order: 0,
    is_active: true,
  });

  const loadData = async (
    roleCounts: Record<string, number> = {},
    clinicalRoles: Set<string> = clinicalSystemRoleNames,
  ) => {
    try {
      setLoading(true);
      setError(null);
      const [clinicsResponse, deptsResponse] = await Promise.all([
        adminService.getClinics({
          page: currentPage,
          page_size: itemsPerPage,
          search: debouncedSearch.trim() || undefined,
          is_active: statusFilter === 'Active' ? true : statusFilter === 'Inactive' ? false : undefined,
        }),
        adminService.getDepartments({
          page: currentPage,
          page_size: itemsPerPage,
          search: debouncedSearch.trim() || undefined,
          is_active: statusFilter === 'Active' ? true : statusFilter === 'Inactive' ? false : undefined,
        }),
      ]);
      setClinicsTotalCount(typeof clinicsResponse.count === "number" ? clinicsResponse.count : (clinicsResponse.results || []).length);
      setDepartmentsTotalCount(typeof deptsResponse.count === "number" ? deptsResponse.count : (deptsResponse.results || []).length);

      // Transform clinics — use the API's staff_count per clinic
      const transformedClinics: Clinic[] = clinicsResponse.results.map((clinic: ApiClinic) => ({
        id: clinic.id.toString(),
        code: clinic.code,
        name: clinic.name,
        description: clinic.description || '',
        location: clinic.location || '',
        phone: clinic.phone || '',
        email: clinic.email || '',
        staffCount: clinic.staff_count ?? 0,
        roomCount: clinic.room_count || 0,
        isActive: clinic.is_active,
        createdAt: clinic.created_at?.split('T')[0] || '',
      }));

      // Transform departments — use the API's staff_count which counts all
      // active users assigned to the department regardless of system_role.
      const transformedDepts: Department[] = deptsResponse.results.map((dept: ApiDepartment) => ({
        id: dept.id.toString(),
        code: dept.code,
        name: dept.name,
        description: dept.description || '',
        head: dept.head_name || '',
        staffCount: dept.staff_count ?? 0,
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

  const loadKpiStats = useCallback(async () => {
    try {
      const s = await adminService.getClinicAdminStats();
      setKpiStats(s);
    } catch (err) {
      console.error("Failed to load admin KPI stats:", err);
    }
  }, []);

  useEffect(() => {
    const loadAllData = async () => {
      let counts: Record<string, number> = {};
      let clinical: Set<string> = clinicalSystemRoleNames;
      try {
        const [userStats, systemRolesRaw] = await Promise.all([
          adminService.getUserStats().catch((err) => {
            console.error('Error loading user stats:', err);
            return null;
          }),
          adminService.getSystemRoles().catch((err) => {
            console.error('Error loading system roles:', err);
            return null;
          }),
        ]);
        counts = userStats?.by_system_role || {};
        setUserRoleCounts(counts);

        if (systemRolesRaw) {
          const rows = parseSystemRolesResponse(systemRolesRaw);
          clinical = new Set(
            rows
              .filter((r) => r.is_active && !NON_CLINICAL_SYSTEM_ROLE_NAMES.has(r.name))
              .map((r) => r.name),
          );
          setClinicalSystemRoleNames(clinical);
        }
      } catch (err: any) {
        console.error('Error loading bootstrap stats:', err);
      }

      await loadData(counts, clinical);
    };
    loadAllData();
    // clinicalSystemRoleNames intentionally omitted: we read & set it inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, debouncedSearch, statusFilter]);

  useEffect(() => {
    void loadKpiStats();
  }, [loadKpiStats]);

  const departmentsWithStaffCounts = departments;

  const filteredVisitTypes = useMemo(() => {
    let list = visitTypesList;
    if (statusFilter === 'Active') {
      list = list.filter((t) => t.is_active);
    } else if (statusFilter === 'Inactive') {
      list = list.filter((t) => !t.is_active);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q)
    );
  }, [visitTypesList, searchQuery, statusFilter]);

  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, statusFilter, activeTab, itemsPerPage]);

  const stats = useMemo(() => {
    if (!kpiStats) {
      return {
        totalClinics: 0,
        activeClinics: 0,
        totalDepartments: 0,
        totalStaff: 0,
        totalRooms: 0,
      };
    }

    // Total clinical staff = sum of role counts for every active system role
    // that isn't flagged as non-clinical. New System Roles (e.g. Cardiologist,
    // Ophthalmologist) auto-roll into this count without a full user fetch.
    const totalStaffCalculated = Array.from(clinicalSystemRoleNames).reduce(
      (acc, roleName) => acc + (userRoleCounts[roleName] || 0),
      0,
    );

    return {
      totalClinics: kpiStats.total_clinics,
      activeClinics: kpiStats.active_clinics,
      totalDepartments: kpiStats.total_departments,
      totalStaff: totalStaffCalculated,
      totalRooms: kpiStats.total_rooms,
    };
  }, [kpiStats, userRoleCounts, clinicalSystemRoleNames]);

  const resetClinicForm = () => {
    setClinicForm({ code: '', name: '', description: '', location: '', phone: '', email: '', isActive: true });
  };

  const resetDeptForm = () => { setDeptForm({ code: '', name: '', description: '', clinic: '', head: '', isActive: true }); };

  const openCreateClinic = () => {
    resetClinicForm();
    setAllOutpatientTypes([]);
    setEditFacilityVisitTypeIds([]);
    setIsCreateDialogOpen(true);
  };
  const openViewClinic = async (c: Clinic) => { 
    setSelectedClinic(c); 
    setIsViewDialogOpen(true);
    // Load rooms and users for this clinic
    await loadClinicDetails(parseInt(c.id));
  };
  
  const loadClinicDetails = async (clinicId: number) => {
    setLoadingDetails(true);
    try {
      // Nothing to fetch yet: clinic details dialog currently doesn't render rooms/users,
      // and the APIs don't support clinic filtering for users anyway.
      void clinicId;
    } catch (err: any) {
      console.error('Error loading clinic details:', err);
      toast.error('Failed to load clinic details');
    } finally {
      setLoadingDetails(false);
    }
  };
  
  const openEditClinic = async (c: Clinic) => {
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
    try {
      const [all, offered] = await Promise.all([
        adminService.getOutpatientClinicTypes({ is_active: true, page_size: 500 }),
        adminService.getFacilityVisitClinics(parseInt(c.id, 10)),
      ]);
      setAllOutpatientTypes(all.results || []);
      setEditFacilityVisitTypeIds((offered || []).map((x) => x.id));
    } catch {
      toast.error('Could not load visit clinics for this facility');
      setAllOutpatientTypes([]);
      setEditFacilityVisitTypeIds([]);
    }
  };
  const openDeleteClinic = (c: Clinic) => {
    setSelectedClinic(c);
    setSelectedVisitType(null);
    setIsDeleteDialogOpen(true);
  };

  const ensureAvailableUsersLoaded = async () => {
    if (availableUsers.length > 0) return;
    try {
      const res = await adminService.getUsers({ is_active: true, page: 1, page_size: 200 });
      setAvailableUsers(res.results || []);
    } catch (e) {
      console.error('Failed to load users for head picker:', e);
      setAvailableUsers([]);
    }
  };

  const openCreateDept = () => {
    void ensureAvailableUsersLoaded();
    resetDeptForm();
    setIsCreateDialogOpen(true);
  };
  const openViewDept = async (d: Department) => { 
    setSelectedDepartment(d); 
    setIsViewDialogOpen(true);
    // Load users for this department
    await loadDepartmentDetails(parseInt(d.id));
  };
  
  const loadDepartmentDetails = async (deptId: number) => {
    setLoadingDetails(true);
    try {
      // Find the department to get its code/name for role matching
      const department = departments.find(d => parseInt(d.id) === deptId);
      if (!department) {
        console.error('Department not found:', deptId);
        setDeptUsers([]);
        return;
      }

      // Filter users based on department's matching roles
      const roleMappings: Record<string, string[]> = {
        'CONSULT': ['Medical Doctor'],
        'LAB': ['Laboratory Scientist'],
        'MED-REC': ['Medical Records Officer'],
        'NURSING': ['Nursing Officer'],
        'PHARM': ['Pharmacist'],
        'PHYSIO': ['Physiotherapist'],
        'RAD': ['Radiologist'],
        // Also check by name for flexibility
        'Consultation': ['Medical Doctor'],
        'Laboratory': ['Laboratory Scientist'],
        'Medical Records': ['Medical Records Officer'],
        'Nursing': ['Nursing Officer'],
        'Pharmacy': ['Pharmacist'],
        'Physiotherapy': ['Physiotherapist'],
        'Radiology': ['Radiologist'],
      };

      const deptCode = String(department.code || '');
      const deptName = String(department.name || '');
      const matchingRoles = (roleMappings[deptCode] || roleMappings[deptName] || []) as string[];
      const perRole = await Promise.all(
        matchingRoles.map((roleName) =>
          adminService
            .getUsers({
              system_role: roleName,
              is_active: true,
              page: 1,
              page_size: 200,
            })
            .catch(() => ({ results: [] as any[] })),
        ),
      );
      const rows = perRole.flatMap((r) => r.results || []);
      const uniq = new Map<number, any>();
      rows.forEach((u) => {
        if (u && typeof u.id === 'number') uniq.set(u.id, u);
      });
      setDeptUsers(Array.from(uniq.values()));
    } catch (err: any) {
      console.error('Error loading department details:', err);
      toast.error('Failed to load department details');
    } finally {
      setLoadingDetails(false);
    }
  };
  const openEditDept = (d: Department) => { 
    void ensureAvailableUsersLoaded();
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
  const openDeleteDept = (d: Department) => {
    setSelectedDepartment(d);
    setSelectedVisitType(null);
    setIsDeleteDialogOpen(true);
  };


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
      
      toast.success(`Facility "${clinicForm.name}" created`);
      setIsCreateDialogOpen(false);
      resetClinicForm();
      await Promise.all([loadData(userRoleCounts), loadKpiStats()]);
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
      await adminService.setFacilityVisitClinics(clinicId, editFacilityVisitTypeIds);

      toast.success(`Facility "${clinicForm.name}" updated`);
      setIsEditDialogOpen(false);
      setSelectedClinic(null);
      resetClinicForm();
      await Promise.all([loadData(userRoleCounts), loadKpiStats()]);
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
      await Promise.all([loadData(userRoleCounts), loadKpiStats()]);
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
        toast.error('Please select a facility');
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
      await Promise.all([loadData(userRoleCounts), loadKpiStats()]);
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
        toast.error('Please select a facility');
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
      await Promise.all([loadData(userRoleCounts), loadKpiStats()]);
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
      await Promise.all([loadData(userRoleCounts), loadKpiStats()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete department');
      console.error('Error deleting department:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadVisitTypes = async () => {
    try {
      setLoadingVisitTypes(true);
      const res = await adminService.getOutpatientClinicTypes({
        page_size: 500,
        is_active: statusFilter !== 'all' ? statusFilter === 'Active' : undefined,
      });
      setVisitTypesList(res.results || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load visit clinics');
      setVisitTypesList([]);
    } finally {
      setLoadingVisitTypes(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'visit_types') {
      loadVisitTypes();
    }
  }, [activeTab, statusFilter]);

  const resetVisitTypeForm = () => {
    setVisitTypeForm({ name: '', code: '', description: '', sort_order: 0, is_active: true });
    setSelectedVisitType(null);
    setIsEditVisitType(false);
  };

  const openCreateVisitType = () => {
    resetVisitTypeForm();
    setIsEditVisitType(false);
    setIsVisitTypeDialogOpen(true);
  };

  const openEditVisitType = (t: OutpatientClinicType) => {
    setSelectedVisitType(t);
    setVisitTypeForm({
      name: t.name,
      code: t.code,
      description: t.description || '',
      sort_order: t.sort_order ?? 0,
      is_active: t.is_active,
    });
    setIsEditVisitType(true);
    setIsVisitTypeDialogOpen(true);
  };

  const openDeleteVisitType = (t: OutpatientClinicType) => {
    setSelectedVisitType(t);
    setSelectedClinic(null);
    setSelectedDepartment(null);
    setIsDeleteDialogOpen(true);
  };

  const handleCreateVisitType = async () => {
    if (!visitTypeForm.name?.trim() || !visitTypeForm.code?.trim()) {
      toast.error('Name and code are required');
      return;
    }
    setIsSubmitting(true);
    try {
      await adminService.createOutpatientClinicType({
        name: visitTypeForm.name.trim(),
        code: visitTypeForm.code.trim().toLowerCase().replace(/\s+/g, '-'),
        description: visitTypeForm.description,
        sort_order: visitTypeForm.sort_order,
        is_active: visitTypeForm.is_active,
      });
      toast.success('Visit clinic created');
      setIsVisitTypeDialogOpen(false);
      resetVisitTypeForm();
      await loadVisitTypes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateVisitType = async () => {
    if (!selectedVisitType) return;
    setIsSubmitting(true);
    try {
      await adminService.updateOutpatientClinicType(selectedVisitType.id, {
        name: visitTypeForm.name.trim(),
        code: visitTypeForm.code.trim().toLowerCase().replace(/\s+/g, '-'),
        description: visitTypeForm.description,
        sort_order: visitTypeForm.sort_order,
        is_active: visitTypeForm.is_active,
      });
      toast.success('Visit clinic updated');
      setIsVisitTypeDialogOpen(false);
      resetVisitTypeForm();
      await loadVisitTypes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteVisitType = async () => {
    if (!selectedVisitType) return;
    setIsSubmitting(true);
    try {
      await adminService.deleteOutpatientClinicType(selectedVisitType.id);
      toast.success(`Deleted "${selectedVisitType.name}"`);
      setIsDeleteDialogOpen(false);
      setSelectedVisitType(null);
      await loadVisitTypes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleFacilityVisitType = (id: number) => {
    setEditFacilityVisitTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3"><Building2 className="h-8 w-8 text-teal-500" />Facilities &amp; Departments</h1>
            <p className="text-muted-foreground mt-1">
              Facilities are physical sites; visit clinics (OPD) are service lines such as GOPD or Eye Clinic (managed on this page).
            </p>
          </div>
          <Button
            onClick={() => {
              if (activeTab === 'facilities') openCreateClinic();
              else if (activeTab === 'departments') openCreateDept();
              else if (activeTab === 'visit_types') openCreateVisitType();
              else if (activeTab === 'wards') wardsAdminRef.current?.openCreate();
              else if (activeTab === 'rooms') roomsAdminRef.current?.openCreate();
              else referralFacilitiesRef.current?.openCreate();
            }}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add {activeTab === 'facilities'
              ? 'Facility'
              : activeTab === 'departments'
                ? 'Department'
                : activeTab === 'visit_types'
                  ? 'Visit clinic'
                  : activeTab === 'wards'
                    ? 'Ward'
                    : activeTab === 'rooms'
                      ? 'Room'
                      : 'Referral facility'}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-l-4 border-l-teal-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total facilities</p><p className="text-2xl sm:text-3xl font-bold text-teal-600 dark:text-teal-400">{stats.totalClinics}</p></div><Building2 className="h-8 w-8 text-teal-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Active facilities</p><p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.activeClinics}</p></div><CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Departments</p><p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.totalDepartments}</p></div><Activity className="h-8 w-8 text-blue-500 opacity-50" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-purple-500" title="Total count of active users with clinical roles (doctors, nurses, lab techs, etc.).">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Staff (sum)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.totalStaff}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight max-w-[10rem]">Active clinical staff</p>
                </div>
                <Users className="h-8 w-8 text-purple-500 opacity-50 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Rooms</p><p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.totalRooms}</p></div><DoorOpen className="h-8 w-8 text-amber-500 opacity-50" /></div></CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'facilities' | 'departments' | 'visit_types' | 'referral_facilities' | 'wards' | 'rooms')}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="facilities">Facilities</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="visit_types">Visit clinics (OPD)</TabsTrigger>
            <TabsTrigger value="wards">Wards (inpatient)</TabsTrigger>
            <TabsTrigger value="referral_facilities">Referral facilities</TabsTrigger>
          </TabsList>

          {activeTab !== 'referral_facilities' && activeTab !== 'wards' && activeTab !== 'rooms' && (
            <Card className="mt-4">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                  <div className="relative flex-1 min-w-[min(100%,16rem)]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All status</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <TabsContent value="facilities">
            {loading ? (
              <Card className="mt-4">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p>Loading facilities...</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 mt-4">
                {clinics.map((clinic) => (
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
            {!loading && clinicsTotalCount === 0 && (
              <Card className="mt-4"><CardContent className="p-8 text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No facilities found</p>
              </CardContent></Card>
            )}
            {clinicsTotalCount > 0 && (
              <div className="mt-4">
                <Card className="p-4">
                  <StandardPagination currentPage={currentPage} totalItems={clinicsTotalCount} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} itemName="clinics" />
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
                {departments.map((dept) => (
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
                            <Button variant="ghost" size="sm" className="h-7 p-0 px-1.5 text-xs" onClick={() => { setSelectedDepartment(dept as any); setIsDeptStaffDialogOpen(true); }}>
                              <Users className="h-3.5 w-3.5 mr-1" />Staff
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDept(dept)}>
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
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
            {!loading && departmentsTotalCount === 0 && (
              <Card className="mt-4"><CardContent className="p-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No departments found</p>
              </CardContent></Card>
            )}
            {departmentsTotalCount > 0 && (
              <div className="mt-4">
                <Card className="p-4">
                  <StandardPagination
                    currentPage={currentPage}
                    totalItems={departmentsTotalCount}
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

          <TabsContent value="visit_types">
            {loadingVisitTypes ? (
              <Card className="mt-4">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p>Loading visit clinics…</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 mt-4">
                {filteredVisitTypes.map((t) => (
                  <Card key={t.id} className={`border-l-4 ${t.is_active ? 'border-l-violet-500' : 'border-l-gray-500'} ${!t.is_active ? 'opacity-60' : ''}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{t.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {t.code} · sort order {t.sort_order}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditVisitType(t)}>
                            <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600" onClick={() => openDeleteVisitType(t)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {!loadingVisitTypes && filteredVisitTypes.length === 0 && (
              <Card className="mt-4">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <p>No visit clinics match your filters.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="rooms" className="mt-4">
            <RoomsAdminManager ref={roomsAdminRef} showHeader={false} />
          </TabsContent>

          <TabsContent value="wards" className="mt-4">
            <WardsAdminManager ref={wardsAdminRef} showHeader={false} />
          </TabsContent>

          <TabsContent value="referral_facilities">
            <ReferralFacilitiesManager
              ref={referralFacilitiesRef}
              showHeader={false}
            />
          </TabsContent>
        </Tabs>

        {/* Facility Create/Edit Dialog */}
        <Dialog open={(isCreateDialogOpen || isEditDialogOpen) && activeTab === 'facilities'} onOpenChange={(open) => { if (!open) { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-teal-500" />{isCreateDialogOpen ? 'Add facility' : 'Edit facility'}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Code *</Label><Input value={clinicForm.code || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} placeholder="e.g., BODE-THOMAS" /></div><div className="space-y-2"><Label>Name *</Label><Input value={clinicForm.name || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Bode Thomas Clinic" /></div></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={clinicForm.description || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description" /></div>
              <div className="space-y-2"><Label>Address / area</Label><Input value={clinicForm.location || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, location: e.target.value }))} placeholder="City, building, floor" /></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Phone</Label><Input value={clinicForm.phone || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, phone: e.target.value }))} /></div><div className="space-y-2"><Label>Email</Label><Input value={clinicForm.email || ''} onChange={(e) => setClinicForm(prev => ({ ...prev, email: e.target.value }))} /></div></div>
              <div className="flex items-center gap-2"><Switch checked={clinicForm.isActive} onCheckedChange={(checked) => setClinicForm(prev => ({ ...prev, isActive: checked }))} /><Label>Active</Label></div>
              {isCreateDialogOpen ? (
                <p className="text-sm text-muted-foreground border rounded-lg p-3">
                  All active visit clinics (OPD) are assigned to this facility by default. Edit the facility afterward to change which service lines are offered.
                </p>
              ) : (
                <div className="space-y-2 border rounded-lg p-3">
                  <Label className="text-base">Visit clinics (OPD) at this facility</Label>
                  <p className="text-xs text-muted-foreground mb-2">Checked types appear when creating visits at this facility.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {allOutpatientTypes.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={editFacilityVisitTypeIds.includes(t.id)}
                          onCheckedChange={() => toggleFacilityVisitType(t.id)}
                        />
                        <span>{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="mt-6"><Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); }}>Cancel</Button><Button onClick={isCreateDialogOpen ? handleCreateClinic : handleUpdateClinic} disabled={isSubmitting || !clinicForm.name} className="bg-teal-600 hover:bg-teal-700">{isSubmitting ? 'Saving...' : isCreateDialogOpen ? 'Create facility' : 'Save changes'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isVisitTypeDialogOpen} onOpenChange={(open) => { if (!open) { setIsVisitTypeDialogOpen(false); resetVisitTypeForm(); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{isEditVisitType ? 'Edit visit clinic' : 'Add visit clinic'}</DialogTitle>
              <DialogDescription>Stable code is used in URLs and integrations (lowercase, hyphens).</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-2"><Label>Name *</Label><Input value={visitTypeForm.name} onChange={(e) => setVisitTypeForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g., Orthopaedics" /></div>
              <div className="space-y-2"><Label>Code *</Label><Input value={visitTypeForm.code} onChange={(e) => setVisitTypeForm((p) => ({ ...p, code: e.target.value }))} placeholder="e.g., ortho" disabled={isEditVisitType} /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={visitTypeForm.description} onChange={(e) => setVisitTypeForm((p) => ({ ...p, description: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Sort order</Label><Input type="number" value={visitTypeForm.sort_order} onChange={(e) => setVisitTypeForm((p) => ({ ...p, sort_order: parseInt(e.target.value, 10) || 0 }))} /></div>
              <div className="flex items-center gap-2"><Switch checked={visitTypeForm.is_active} onCheckedChange={(c) => setVisitTypeForm((p) => ({ ...p, is_active: c }))} /><Label>Active</Label></div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => { setIsVisitTypeDialogOpen(false); resetVisitTypeForm(); }}>Cancel</Button>
              <Button onClick={isEditVisitType ? handleUpdateVisitType : handleCreateVisitType} disabled={isSubmitting} className="bg-violet-600 hover:bg-violet-700">
                {isSubmitting ? 'Saving…' : isEditVisitType ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Department Create/Edit Dialog */}
        <Dialog open={(isCreateDialogOpen || isEditDialogOpen) && activeTab === 'departments'} onOpenChange={(open) => { if (!open) { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-500" />{isCreateDialogOpen ? 'Add Department' : 'Edit Department'}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2"><Label>Facility *</Label><Select value={deptForm.clinic || ''} onValueChange={(value) => setDeptForm(prev => ({ ...prev, clinic: value }))}><SelectTrigger><SelectValue placeholder="Select a facility" /></SelectTrigger><SelectContent>{clinics.filter(c => c.isActive).map(clinic => (<SelectItem key={clinic.id} value={clinic.id.toString()}>{clinic.name}</SelectItem>))}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Code *</Label><Input value={deptForm.code || ''} onChange={(e) => setDeptForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} placeholder="e.g., MED" /></div><div className="space-y-2"><Label>Name *</Label><Input value={deptForm.name || ''} onChange={(e) => setDeptForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Medical Services" /></div></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={deptForm.description || ''} onChange={(e) => setDeptForm(prev => ({ ...prev, description: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Department Head</Label><Select value={deptForm.head || ''} onValueChange={(value) => setDeptForm(prev => ({ ...prev, head: value }))}><SelectTrigger><SelectValue placeholder="Select department head (optional)" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{availableUsers.filter(u => u.is_active).map(user => (<SelectItem key={user.id} value={user.id.toString()}>{user.first_name} {user.last_name} ({user.system_role || 'Staff'})</SelectItem>))}</SelectContent></Select></div>
              <div className="flex items-center gap-2"><Switch checked={deptForm.isActive} onCheckedChange={(checked) => setDeptForm(prev => ({ ...prev, isActive: checked }))} /><Label>Active</Label></div>
            </div>
            <DialogFooter className="mt-6"><Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); }}>Cancel</Button><Button onClick={isCreateDialogOpen ? handleCreateDept : handleUpdateDept} disabled={isSubmitting || !deptForm.name} className="bg-blue-600 hover:bg-blue-700">{isSubmitting ? 'Saving...' : isCreateDialogOpen ? 'Create Department' : 'Save Changes'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Clinic Dialog */}
        <Dialog open={isViewDialogOpen && activeTab === 'facilities'} onOpenChange={(open) => { if (!open) setIsViewDialogOpen(false); }}>
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
                <div><p className="text-muted-foreground">Facility</p><p className="font-medium">{selectedDepartment.clinics[0] || 'N/A'}</p></div>
                <div><p className="text-muted-foreground">Head</p><p className="font-medium">{selectedDepartment.head || 'Not assigned'}</p></div>
                <div><p className="text-muted-foreground">Staff Count</p><p className="font-medium">{selectedDepartment.staffCount}</p></div>
              </div>
            </div>)}
            <DialogFooter><Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button><Button onClick={() => { setIsViewDialogOpen(false); if (selectedDepartment) openEditDept(selectedDepartment); }}><Edit className="h-4 w-4 mr-2" />Edit</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Department Staff Dialog */}
        <DepartmentStaffDialog
          department={isDeptStaffDialogOpen && selectedDepartment ? { id: Number(selectedDepartment.id), name: selectedDepartment.name, clinicName: selectedDepartment.clinic || null, headName: selectedDepartment.head || null } : null}
          open={isDeptStaffDialogOpen}
          onOpenChange={setIsDeptStaffDialogOpen}
          onStaffChanged={() => {
            loadData();
            loadKpiStats();
          }}
        />

        {/* Delete Confirmation */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600">
                <Trash2 className="h-5 w-5" />
                Delete{' '}
                {activeTab === 'visit_types'
                  ? 'visit clinic'
                  : activeTab === 'facilities'
                    ? 'facility'
                    : 'department'}
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;
                {activeTab === 'visit_types'
                  ? selectedVisitType?.name
                  : activeTab === 'facilities'
                    ? selectedClinic?.name
                    : selectedDepartment?.name}
                &quot;?
                {activeTab !== 'visit_types' &&
                  (selectedClinic?.staffCount || selectedDepartment?.staffCount || 0) > 0 && (
                    <span className="block mt-2 text-amber-600">
                      <AlertTriangle className="h-4 w-4 inline mr-1" />
                      This {activeTab === 'facilities' ? 'facility' : 'department'} has assigned staff.
                    </span>
                  )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (activeTab === 'visit_types') handleDeleteVisitType();
                  else if (activeTab === 'facilities') handleDeleteClinic();
                  else handleDeleteDept();
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

