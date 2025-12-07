"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { patientService, type Patient as ApiPatient } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { 
  Search, Plus, UsersRound, ChevronLeft, ChevronRight, Eye, Edit, Trash2, 
  UserPlus, Link2, Save, User, Phone, Calendar, Heart, Users, Baby, FileText, Loader2, AlertTriangle
} from 'lucide-react';

// Dependent types
const dependentTypes = ['Employee Dependent', 'Retiree Dependent'];

// Entitlement rules
const DEPENDENT_ENTITLEMENTS = {
  'employee': 5,    // Employees can have up to 5 dependents
  'Employee': 5,
  'retiree': 1,     // Retirees can have only 1 dependent
  'Retiree': 1,
  'nonnpa': 0,      // NonNPA cannot have dependents
  'NonNPA': 0,
  'dependent': 0,   // Dependents cannot have dependents
  'Dependent': 0,
};

const relationshipTypes = ['Spouse', 'Child', 'Parent', 'Sibling', 'Guardian', 'Other'];

export default function DependentsPage() {
  const router = useRouter();
  const [dependents, setDependents] = useState<any[]>([]);
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [relationshipFilter, setRelationshipFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDependent, setSelectedDependent] = useState<typeof dependents[0] | null>(null);
  
  const [newDependent, setNewDependent] = useState({ firstName: '', lastName: '', dob: '', gender: '', relationship: '', primaryPatientId: '', phone: '', email: '', dependentType: '' });
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', dob: '', gender: '', relationship: '', primaryPatientId: '', phone: '', email: '', status: '', dependentType: '' });

  // Load dependents and patients from API
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load dependents (patients with category='dependent') and primary patients in parallel
        const [dependentsResult, patientsResult] = await Promise.allSettled([
          patientService.getPatients({ category: 'dependent' } as any),
          patientService.getPatients({} as any), // Get all patients for primary patient selection
        ]);

        // Process dependents
        if (dependentsResult.status === 'fulfilled') {
          const dependentPatients = dependentsResult.value.results;
          const transformedDependents = await Promise.all(
            dependentPatients.map(async (dep) => {
              // Load primary patient if principal_staff exists
              let primaryPatient = null;
              if (dep.principal_staff) {
                try {
                  const primary = await patientService.getPatient(dep.principal_staff);
                  primaryPatient = {
                    id: primary.patient_id || String(primary.id),
                    name: primary.full_name || `${primary.first_name} ${primary.surname}`,
                    category: primary.category,
                  };
                } catch (err) {
                  console.error('Failed to load primary patient:', err);
                }
              }

              return {
                id: dep.patient_id || String(dep.id),
                firstName: dep.first_name || '',
                lastName: dep.surname || '',
                name: dep.full_name || `${dep.first_name} ${dep.surname}`,
                dob: dep.date_of_birth || '',
                age: dep.age || 0,
                gender: dep.gender === 'male' ? 'Male' : 'Female',
                relationship: dep.nok_relationship || 'Other',
                primaryPatient: primaryPatient || { id: '', name: 'Unknown', category: '' },
                status: dep.is_active ? 'Active' : 'Inactive',
                phone: dep.phone || '-',
                email: dep.email || '-',
                dependentType: dep.dependent_type || 'Employee Dependent',
                registeredAt: dep.created_at?.split('T')[0] || '',
              };
            })
          );
          setDependents(transformedDependents);
        } else {
          if (isAuthenticationError(dependentsResult.reason)) {
            setAuthError(dependentsResult.reason);
            return;
          }
          console.error('Failed to load dependents:', dependentsResult.reason);
          setError('Failed to load dependents. Please try again.');
        }

        // Process patients (for primary patient selection)
        if (patientsResult.status === 'fulfilled') {
          setPatients(patientsResult.value.results);
        } else {
          if (isAuthenticationError(patientsResult.reason)) {
            setAuthError(patientsResult.reason);
            return;
          }
          console.debug('Failed to load patients:', patientsResult.reason);
          // Non-critical, continue without patient list
        }

      } catch (err) {
        console.error('Error loading data:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load data. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Get dependent count for a patient
  const getDependentCount = (patientId: string) => {
    return dependents.filter(d => d.primaryPatient.id === patientId && d.status === 'Active').length;
  };

  // Check if patient can add more dependents
  const canAddDependent = (patientId: string) => {
    const patient = patients.find(p => (p.patient_id || String(p.id)) === patientId || String(p.id) === patientId);
    if (!patient) return { allowed: false, reason: 'Patient not found' };
    
    // Map backend category to frontend category
    const categoryMap: Record<string, string> = {
      'employee': 'employee',
      'retiree': 'retiree',
      'nonnpa': 'nonnpa',
      'dependent': 'dependent',
    };
    const normalizedCategory = categoryMap[patient.category] || patient.category.toLowerCase();
    
    const entitlement = DEPENDENT_ENTITLEMENTS[normalizedCategory as keyof typeof DEPENDENT_ENTITLEMENTS] || 0;
    const currentCount = getDependentCount(patientId);
    
    if (entitlement === 0) {
      return { allowed: false, reason: `${patient.category} patients are not entitled to dependents` };
    }
    
    if (currentCount >= entitlement) {
      return { allowed: false, reason: `Maximum ${entitlement} dependent(s) allowed for ${patient.category}. Currently has ${currentCount}.` };
    }
    
    return { allowed: true, remaining: entitlement - currentCount };
  };

  // Get dependent type based on principal's category
  const getDependentType = (patientId: string) => {
    const patient = patients.find(p => (p.patient_id || String(p.id)) === patientId || String(p.id) === patientId);
    if (!patient) return '';
    return (patient.category === 'retiree' || (patient.category as string) === 'Retiree') ? 'Retiree Dependent' : 'Employee Dependent';
  };

  const filteredDependents = useMemo(() => dependents.filter(dep => {
    const matchesSearch = dep.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      dep.primaryPatient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dep.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRelationship = relationshipFilter === 'all' || dep.relationship.toLowerCase() === relationshipFilter.toLowerCase();
    const matchesStatus = statusFilter === 'all' || dep.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesRelationship && matchesStatus;
  }), [dependents, searchQuery, relationshipFilter, statusFilter]);

  // Paginated dependents
  const paginatedDependents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredDependents.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredDependents, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, relationshipFilter, statusFilter]);

  const stats = useMemo(() => [
    { label: 'Total Dependents', value: dependents.length, icon: UsersRound, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { label: 'Employee Deps', value: dependents.filter(d => d.dependentType === 'Employee Dependent').length, icon: Users, color: 'text-teal-500', bg: 'bg-teal-500/10' },
    { label: 'Retiree Deps', value: dependents.filter(d => d.dependentType === 'Retiree Dependent').length, icon: Heart, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Active', value: dependents.filter(d => d.status === 'Active').length, icon: Baby, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ], [dependents]);

  const calculateAge = (dob: string) => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const handleAddDependent = async () => {
    try {
      const primaryPatient = patients.find(p => 
        (p.patient_id || String(p.id)) === newDependent.primaryPatientId || 
        String(p.id) === newDependent.primaryPatientId
      );
      
      if (!primaryPatient) {
        toast.error('Primary patient not found');
        return;
      }

      // Check entitlement
      const entitlementCheck = canAddDependent(newDependent.primaryPatientId);
      if (!entitlementCheck.allowed) {
        toast.error(entitlementCheck.reason);
        return;
      }

      // Find numeric ID of primary patient
      const primaryPatientNumericId = primaryPatient.id;

      // Create dependent patient
      const dependentData = {
        category: 'dependent',
        surname: newDependent.lastName,
        first_name: newDependent.firstName,
        middle_name: '',
        gender: newDependent.gender.toLowerCase(),
        date_of_birth: newDependent.dob,
        phone: newDependent.phone || '',
        email: newDependent.email || '',
        dependent_type: getDependentType(newDependent.primaryPatientId),
        principal_staff: primaryPatientNumericId,
        nok_relationship: newDependent.relationship,
        is_active: true,
      };

      const created = await patientService.createPatient(dependentData as any);
      
      toast.success('Dependent added successfully');
      
      // Reload dependents list
      const dependentsResult = await patientService.getPatients({ category: 'dependent' } as any);
      const dependentPatients = dependentsResult.results;
      
      const transformedDependents = await Promise.all(
        dependentPatients.map(async (dep) => {
          let primaryPatient = null;
          if (dep.principal_staff) {
            try {
              const primary = await patientService.getPatient(dep.principal_staff);
              primaryPatient = {
                id: primary.patient_id || String(primary.id),
                name: primary.full_name || `${primary.first_name} ${primary.surname}`,
                category: primary.category,
              };
            } catch (err) {
              console.error('Failed to load primary patient:', err);
            }
          }

          return {
            id: dep.patient_id || String(dep.id),
            firstName: dep.first_name || '',
            lastName: dep.surname || '',
            name: dep.full_name || `${dep.first_name} ${dep.surname}`,
            dob: dep.date_of_birth || '',
            age: dep.age || 0,
            gender: dep.gender === 'male' ? 'Male' : 'Female',
            relationship: dep.nok_relationship || 'Other',
            primaryPatient: primaryPatient || { id: '', name: 'Unknown', category: '' },
            status: dep.is_active ? 'Active' : 'Inactive',
            phone: dep.phone || '-',
            email: dep.email || '-',
            dependentType: dep.dependent_type || 'Employee Dependent',
            registeredAt: dep.created_at?.split('T')[0] || '',
          };
        })
      );
      
      setDependents(transformedDependents);
      setNewDependent({ firstName: '', lastName: '', dob: '', gender: '', relationship: '', primaryPatientId: '', phone: '', email: '', dependentType: '' });
      setIsAddDialogOpen(false);
      
    } catch (err: any) {
      console.error('Error adding dependent:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to add dependent. Please try again.');
      }
    }
  };

  const handleEditDependent = async () => {
    if (!selectedDependent) return;

    try {
      // Find the dependent in the API data to get numeric ID
      const dependentApiData = await patientService.getPatients({ 
        category: 'dependent', 
        search: selectedDependent.id,
        // page_size: 100 - not in type, using default 
      });
      
      const dependentToUpdate = dependentApiData.results.find(
        d => (d.patient_id || String(d.id)) === selectedDependent.id
      );

      if (!dependentToUpdate) {
        toast.error('Dependent not found');
        return;
      }

      const primaryPatient = patients.find(p => 
        (p.patient_id || String(p.id)) === editForm.primaryPatientId || 
        String(p.id) === editForm.primaryPatientId
      );

      if (!primaryPatient) {
        toast.error('Primary patient not found');
        return;
      }

      // Update dependent
      const updateData: any = {
        surname: editForm.lastName,
        first_name: editForm.firstName,
        gender: editForm.gender.toLowerCase(),
        date_of_birth: editForm.dob,
        phone: editForm.phone || '',
        email: editForm.email || '',
        nok_relationship: editForm.relationship,
        is_active: editForm.status === 'Active',
        principal_staff: primaryPatient.id,
      };

      await patientService.updatePatient(dependentToUpdate.id, updateData);
      
      toast.success('Dependent updated successfully');
      
      // Reload dependents list
      const dependentsResult = await patientService.getPatients({ category: 'dependent' } as any);
      const dependentPatients = dependentsResult.results;
      
      const transformedDependents = await Promise.all(
        dependentPatients.map(async (dep) => {
          let primaryPatient = null;
          if (dep.principal_staff) {
            try {
              const primary = await patientService.getPatient(dep.principal_staff);
              primaryPatient = {
                id: primary.patient_id || String(primary.id),
                name: primary.full_name || `${primary.first_name} ${primary.surname}`,
                category: primary.category,
              };
            } catch (err) {
              console.error('Failed to load primary patient:', err);
            }
          }

          return {
            id: dep.patient_id || String(dep.id),
            firstName: dep.first_name || '',
            lastName: dep.surname || '',
            name: dep.full_name || `${dep.first_name} ${dep.surname}`,
            dob: dep.date_of_birth || '',
            age: dep.age || 0,
            gender: dep.gender === 'male' ? 'Male' : 'Female',
            relationship: dep.nok_relationship || 'Other',
            primaryPatient: primaryPatient || { id: '', name: 'Unknown', category: '' },
            status: dep.is_active ? 'Active' : 'Inactive',
            phone: dep.phone || '-',
            email: dep.email || '-',
            dependentType: dep.dependent_type || 'Employee Dependent',
            registeredAt: dep.created_at?.split('T')[0] || '',
          };
        })
      );
      
      setDependents(transformedDependents);
      setIsEditDialogOpen(false);
      
    } catch (err: any) {
      console.error('Error updating dependent:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to update dependent. Please try again.');
      }
    }
  };

  const handleDeleteDependent = async () => {
    if (!selectedDependent) return;

    try {
      // Find the dependent in the API data to get numeric ID
      const dependentApiData = await patientService.getPatients({ 
        category: 'dependent', 
        search: selectedDependent.id,
        // page_size: 100 - not in type, using default 
      });
      
      const dependentToDelete = dependentApiData.results.find(
        d => (d.patient_id || String(d.id)) === selectedDependent.id
      );

      if (!dependentToDelete) {
        toast.error('Dependent not found');
        return;
      }

      // Soft delete (set is_active to false) instead of hard delete
      await patientService.updatePatient(dependentToDelete.id, { is_active: false });
      
      toast.success('Dependent deleted successfully');
      
      // Reload dependents list
      const dependentsResult = await patientService.getPatients({ category: 'dependent' } as any);
      const dependentPatients = dependentsResult.results;
      
      const transformedDependents = await Promise.all(
        dependentPatients.map(async (dep) => {
          let primaryPatient = null;
          if (dep.principal_staff) {
            try {
              const primary = await patientService.getPatient(dep.principal_staff);
              primaryPatient = {
                id: primary.patient_id || String(primary.id),
                name: primary.full_name || `${primary.first_name} ${primary.surname}`,
                category: primary.category,
              };
            } catch (err) {
              console.error('Failed to load primary patient:', err);
            }
          }

          return {
            id: dep.patient_id || String(dep.id),
            firstName: dep.first_name || '',
            lastName: dep.surname || '',
            name: dep.full_name || `${dep.first_name} ${dep.surname}`,
            dob: dep.date_of_birth || '',
            age: dep.age || 0,
            gender: dep.gender === 'male' ? 'Male' : 'Female',
            relationship: dep.nok_relationship || 'Other',
            primaryPatient: primaryPatient || { id: '', name: 'Unknown', category: '' },
            status: dep.is_active ? 'Active' : 'Inactive',
            phone: dep.phone || '-',
            email: dep.email || '-',
            dependentType: dep.dependent_type || 'Employee Dependent',
            registeredAt: dep.created_at?.split('T')[0] || '',
          };
        })
      );
      
      setDependents(transformedDependents);
      setIsDeleteDialogOpen(false);
      
    } catch (err: any) {
      console.error('Error deleting dependent:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to delete dependent. Please try again.');
      }
    }
  };

  const openEditDialog = (dep: typeof dependents[0]) => {
    setSelectedDependent(dep);
    setEditForm({
      firstName: dep.firstName, lastName: dep.lastName, dob: dep.dob, gender: dep.gender,
      relationship: dep.relationship, primaryPatientId: dep.primaryPatient.id,
      phone: dep.phone === '-' ? '' : dep.phone, email: dep.email === '-' ? '' : dep.email, status: dep.status,
      dependentType: dep.dependentType || 'dependent'
    });
    setIsEditDialogOpen(true);
  };

  const getRelationshipBadge = (rel: string) => {
    const styles: Record<string, string> = {
      'Spouse': 'border-rose-500/50 text-rose-600 dark:text-rose-400',
      'Child': 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
      'Parent': 'border-amber-500/50 text-amber-600 dark:text-amber-400',
      'Sibling': 'border-blue-500/50 text-blue-600 dark:text-blue-400',
    };
    return styles[rel] || 'border-muted-foreground/50 text-muted-foreground';
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Manage Dependents</h1>
            <p className="text-muted-foreground mt-1">Manage family members linked to NPA staff and retirees</p>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)} className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white">
            <Plus className="h-4 w-4 mr-2" />Add Dependent
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading dependents...</p>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-4">
            {/* Search and Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by name or principal..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                  </div>
                  <Select value={relationshipFilter} onValueChange={setRelationshipFilter}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Relationship" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {relationshipTypes.map(r => <SelectItem key={r} value={r.toLowerCase()}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Dependents List */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium">{filteredDependents.length}</span> of{' '}
                <span className="font-medium">{dependents.length}</span> dependents
              </p>

              {paginatedDependents.length > 0 ? (
                paginatedDependents.map((dep) => (
                  <Card key={dep.id} className={`border-l-4 ${
                    dep.relationship === 'Spouse' ? 'border-l-rose-500' :
                    dep.relationship === 'Child' ? 'border-l-emerald-500' :
                    dep.relationship === 'Parent' ? 'border-l-amber-500' :
                    'border-l-blue-500'
                  } hover:shadow-md transition-shadow`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 ${
                          dep.relationship === 'Spouse' ? 'bg-rose-500' :
                          dep.relationship === 'Child' ? 'bg-emerald-500' :
                          dep.relationship === 'Parent' ? 'bg-amber-500' :
                          'bg-blue-500'
                        }`}>
                          {dep.name.split(' ').map((n: string) => n[0]).join('')}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Name + Badges + Actions */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-foreground truncate">{dep.name}</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getRelationshipBadge(dep.relationship)}`}>
                                {dep.relationship}
                              </Badge>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${dep.status === 'Active' ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' : 'border-muted-foreground/50 text-muted-foreground'}`}>
                                {dep.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedDependent(dep); setIsViewDialogOpen(true); }}>
                                <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(dep)}>
                                <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => { setSelectedDependent(dep); setIsDeleteDialogOpen(true); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          
                          {/* Row 2: Details */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>{dep.id}</span>
                            <span>•</span>
                            <span>{dep.age}y {dep.gender}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{dep.phone}</span>
                            <span>•</span>
                            <Link href={`/medical-records/patients/${dep.primaryPatient.id}`} className="flex items-center gap-1 text-primary hover:underline">
                              <Link2 className="h-3 w-3" />
                              <span className="truncate max-w-[100px]">{dep.primaryPatient.name}</span>
                            </Link>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <UsersRound className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No dependents found matching your criteria</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Pagination */}
            {filteredDependents.length > 0 && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={filteredDependents.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={setItemsPerPage}
                  itemName="dependents"
                />
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Quick Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setIsAddDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />Add New Dependent
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/patients')}>
                  <Users className="h-4 w-4 mr-2" />Manage Patients
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/reports')}>
                  <FileText className="h-4 w-4 mr-2" />Reports
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">By Relationship</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {relationshipTypes.slice(0, 4).map((rel) => {
                  const count = dependents.filter(d => d.relationship === rel).length;
                  const pct = Math.round((count / dependents.length) * 100) || 0;
                  return (
                    <div key={rel} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{rel}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${rel === 'Spouse' ? 'bg-rose-500' : rel === 'Child' ? 'bg-emerald-500' : rel === 'Parent' ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-violet-500/20 bg-violet-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <UsersRound className="h-5 w-5 text-violet-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-violet-600 dark:text-violet-400">Dependent Entitlements</p>
                    <div className="text-xs text-muted-foreground mt-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Employees:</span>
                        <Badge variant="outline" className="text-xs">Up to 5 dependents</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Retirees:</span>
                        <Badge variant="outline" className="text-xs">1 dependent only</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Non-NPA:</span>
                        <Badge variant="outline" className="text-xs text-muted-foreground">Not entitled</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Add Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-violet-500" />Add New Dependent</DialogTitle>
              <DialogDescription>Link a family member to a patient record.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>First Name *</Label><Input value={newDependent.firstName} onChange={(e) => setNewDependent(prev => ({ ...prev, firstName: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Last Name *</Label><Input value={newDependent.lastName} onChange={(e) => setNewDependent(prev => ({ ...prev, lastName: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Date of Birth *</Label><Input type="date" value={newDependent.dob} onChange={(e) => setNewDependent(prev => ({ ...prev, dob: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Gender *</Label>
                  <Select value={newDependent.gender} onValueChange={(v) => setNewDependent(prev => ({ ...prev, gender: v }))}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Principal (Staff/Retiree) *</Label>
                <Select value={newDependent.primaryPatientId} onValueChange={(v) => setNewDependent(prev => ({ ...prev, primaryPatientId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {patients
                      .filter(p => p.category === 'employee' || p.category === 'retiree')
                      .map(p => {
                        const patientId = p.patient_id || String(p.id);
                        const check = canAddDependent(patientId);
                        const currentCount = getDependentCount(patientId);
                        const categoryMap: Record<string, string> = {
                          'employee': 'employee',
                          'retiree': 'retiree',
                        };
                        const normalizedCategory = categoryMap[p.category] || p.category.toLowerCase();
                        const entitlement = DEPENDENT_ENTITLEMENTS[normalizedCategory as keyof typeof DEPENDENT_ENTITLEMENTS] || 0;
                        const patientName = p.full_name || `${p.first_name} ${p.surname}`;
                        return (
                          <SelectItem key={p.id} value={patientId} disabled={!check.allowed}>
                            <div className="flex items-center justify-between w-full gap-2">
                              <span>{patientName}</span>
                              <span className="text-xs text-muted-foreground">
                                ({p.category} • {currentCount}/{entitlement})
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
                {newDependent.primaryPatientId && (
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const check = canAddDependent(newDependent.primaryPatientId);
                      if (check.allowed && 'remaining' in check) {
                        return `${check.remaining} dependent slot(s) remaining`;
                      }
                      return check.reason;
                    })()}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Relationship *</Label>
                  <Select value={newDependent.relationship} onValueChange={(v) => setNewDependent(prev => ({ ...prev, relationship: v }))}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{relationshipTypes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-2"><Label>Phone</Label><Input value={newDependent.phone} onChange={(e) => setNewDependent(prev => ({ ...prev, phone: e.target.value }))} /></div>
              </div>
              <div className="space-y-2"><Label>Email</Label><Input value={newDependent.email} onChange={(e) => setNewDependent(prev => ({ ...prev, email: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddDependent} disabled={!newDependent.firstName || !newDependent.lastName || !newDependent.dob || !newDependent.gender || !newDependent.primaryPatientId || !newDependent.relationship} className="bg-violet-500 hover:bg-violet-600 text-white"><Plus className="h-4 w-4 mr-2" />Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><User className="h-5 w-5 text-violet-500" />Dependent Details</DialogTitle></DialogHeader>
            {selectedDependent && (
              <div className="py-4">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl">{selectedDependent.name.split(' ').map((n: string) => n[0]).join('')}</div>
                  <div><h3 className="text-xl font-semibold">{selectedDependent.name}</h3><p className="text-muted-foreground">{selectedDependent.id}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">Date of Birth</p><p>{selectedDependent.dob}</p></div>
                  <div><p className="text-sm text-muted-foreground">Age / Gender</p><p>{selectedDependent.age}y / {selectedDependent.gender}</p></div>
                  <div><p className="text-sm text-muted-foreground">Relationship</p><div className="mt-1"><Badge variant="outline">{selectedDependent.relationship}</Badge></div></div>
                  <div><p className="text-sm text-muted-foreground">Status</p><div className="mt-1"><Badge variant="outline" className={selectedDependent.status === 'Active' ? 'border-emerald-500/50 text-emerald-600' : ''}>{selectedDependent.status}</Badge></div></div>
                  <div><p className="text-sm text-muted-foreground">Phone</p><p>{selectedDependent.phone}</p></div>
                  <div><p className="text-sm text-muted-foreground">Email</p><p>{selectedDependent.email}</p></div>
                </div>
                <div className="mt-4 p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-1">Principal (Staff/Retiree)</p>
                  <Link href={`/medical-records/patients/${selectedDependent.primaryPatient.id}`} className="flex items-center gap-2 text-primary hover:underline font-medium"><Link2 className="h-4 w-4" />{selectedDependent.primaryPatient.name}</Link>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              <Button onClick={() => { setIsViewDialogOpen(false); if (selectedDependent) openEditDialog(selectedDependent); }}><Edit className="h-4 w-4 mr-2" />Edit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5" />Edit Dependent</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>First Name</Label><Input value={editForm.firstName} onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Last Name</Label><Input value={editForm.lastName} onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Date of Birth</Label><Input type="date" value={editForm.dob} onChange={(e) => setEditForm(prev => ({ ...prev, dob: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Gender</Label>
                  <Select value={editForm.gender} onValueChange={(v) => setEditForm(prev => ({ ...prev, gender: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Principal</Label>
                <Select value={editForm.primaryPatientId} onValueChange={(v) => setEditForm(prev => ({ ...prev, primaryPatientId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {patients
                      .filter(p => p.category === 'employee' || p.category === 'retiree')
                      .map(p => {
                        const patientId = p.patient_id || String(p.id);
                        const patientName = p.full_name || `${p.first_name} ${p.surname}`;
                        return (
                          <SelectItem key={p.id} value={patientId}>{patientName}</SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Relationship</Label>
                  <Select value={editForm.relationship} onValueChange={(v) => setEditForm(prev => ({ ...prev, relationship: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{relationshipTypes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm(prev => ({ ...prev, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Phone</Label><Input value={editForm.phone} onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Email</Label><Input value={editForm.email} onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleEditDependent}><Save className="h-4 w-4 mr-2" />Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive">Delete Dependent</DialogTitle>
              <DialogDescription>Are you sure you want to delete <span className="font-medium text-foreground">{selectedDependent?.name}</span>?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteDependent}><Trash2 className="h-4 w-4 mr-2" />Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
