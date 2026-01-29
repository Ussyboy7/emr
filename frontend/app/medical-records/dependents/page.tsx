"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
  UserPlus, Link2, Save, User, Phone, Calendar, Heart, Users, Baby, FileText, Loader2, AlertTriangle,
  Camera, Upload
} from 'lucide-react';

// Dependent types
const dependentTypes = ['Employee Dependent', 'Retiree Dependent'];

// Relationship types (matching backend expectations)
const relationshipTypes = ['Spouse', 'Child', 'Parent', 'Sibling', 'Guardian', 'Other'];

// Constants for form fields (matching patient registration)
const titles = ['Mr', 'Mrs', 'Ms', 'Dr', 'Chief', 'Engr', 'Prof', 'Alhaji', 'Hajia'];
const maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];
const religions = ['Christianity', 'Islam', 'Traditional', 'Other', 'None'];
const tribes = [
  'Hausa', 'Fulani', 'Yoruba', 'Igbo',
  'Ijaw', 'Urhobo', 'Isoko', 'Itsekiri', 'Edo (Bini)', 'Esan', 'Anioma',
  'Ibibio', 'Efik', 'Annang', 'Ikwerre', 'Ogoni', 'Kalabari',
  'Tiv', 'Idoma', 'Igala', 'Ebira', 'Nupe', 'Gbagyi (Gwari)',
  'Jukun', 'Tarok', 'Berom', 'Bachama', 'Angas', 'Atyap (Kataf)',
  'Mumuye', 'Kuteb',
  'Kanuri', 'Shuwa Arab', 'Higgi (Kamwe)', 'Margi', 'Bura',
  'Other',
];

const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
  'Yobe', 'Zamfara'
];

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

// Helper function to construct full photo URL from relative path
const getPhotoUrl = (photoPath: string | null | undefined): string => {
  if (!photoPath) return '';

  // If it's already a full URL, return as is
  if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
    return photoPath;
  }

  // If it starts with /media/, construct full URL from API base URL
  if (photoPath.startsWith('/media/')) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
    // Remove /api from the end to get base URL, then append the media path
    const baseUrl = apiUrl.replace(/\/api\/?$/, '');
    return `${baseUrl}${photoPath}`;
  }

  // If it's a relative path without /media/, assume it's already relative to media
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
  const baseUrl = apiUrl.replace(/\/api\/?$/, '');
  return `${baseUrl}/media/${photoPath.startsWith('/') ? photoPath.slice(1) : photoPath}`;
};

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

  // Photo upload states for edit modal
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [editFormLoading, setEditFormLoading] = useState(false);
  
  const [newDependent, setNewDependent] = useState({ firstName: '', lastName: '', dob: '', gender: '', relationship: '', primaryPatientId: '', phone: '', email: '', dependentType: '' });
  const [editForm, setEditForm] = useState({
    // Basic info
    firstName: '', lastName: '', dob: '', gender: '', relationship: '',
    primaryPatientId: '', phone: '', email: '', status: '', dependentType: '',
    // Additional fields to match patient registration
    title: '', middleName: '', maritalStatus: '', religion: '', tribe: '',
    residentialAddress: '', permanentAddress: '', lga: '',
    stateOfResidence: '', stateOfOrigin: '', occupation: ''
  });

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
                primaryPatient: primaryPatient || { id: '', name: 'Unknown Principal', category: '' },
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

    // No entitlement restrictions - all patients can have dependents
    return { allowed: true };
  };

  // Get dependent type based on principal's category
  const getDependentType = (patientId: string) => {
    const patient = patients.find(p => (p.patient_id || String(p.id)) === patientId || String(p.id) === patientId);
    if (!patient) return '';
    return (patient.category === 'retiree' || (patient.category as string) === 'Retiree') ? 'Retiree Dependent' : 'Employee Dependent';
  };

  // Validate Principal Staff ID
  const validatePrincipalStaffId = (staffId: string) => {
    if (!staffId || !staffId.trim()) {
      return { valid: false, message: 'Principal Staff ID is required' };
    }

    const trimmedId = staffId.trim();
    // First, try to find by patient_id (like E-A2000 or R-A2000)
    let patient = patients.find(p => p.patient_id === trimmedId);

    // If not found by patient_id, try by personal_number (like A2000)
    if (!patient) {
      patient = patients.find(p => p.personal_number === trimmedId);
    }

    // If still not found, try by employee_id
    if (!patient) {
      patient = patients.find(p => p.employee_id === trimmedId);
    }

    // Finally, try by database ID as fallback
    if (!patient) {
      patient = patients.find(p => String(p.id) === trimmedId);
    }

    if (!patient) {
      return { valid: false, message: `Staff ID "${trimmedId}" not found in the system` };
    }

    // Validate category
    if (patient.category !== 'employee' && patient.category !== 'retiree') {
      return { valid: false, message: `ID "${trimmedId}" belongs to a ${patient.category}, not a staff member or retiree` };
    }

    // No entitlement restrictions

    return {
      valid: true,
      message: `Valid: ${patient.full_name || `${patient.first_name} ${patient.surname}`} (${patient.category})`,
      patient
    };
  };

  const filteredDependents = useMemo(() => dependents.filter(dep => {
    const matchesSearch = dep.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dep.primaryPatient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dep.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRelationship = relationshipFilter === 'all' || dep.relationship === relationshipFilter;
    const matchesStatus = statusFilter === 'all' || dep.status === statusFilter;
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

  // Photo handling functions
  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('Photo size must be less than 5MB');
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleAddDependent = async () => {
    try {
      const trimmedId = newDependent.primaryPatientId.trim();

      // First, try to find by patient_id (like E-A2000 or R-A2000)
      let primaryPatient = patients.find(p => p.patient_id === trimmedId);

      // If not found by patient_id, try by personal_number (like A2000)
      if (!primaryPatient) {
        primaryPatient = patients.find(p => p.personal_number === trimmedId);
      }

      // If still not found, try by employee_id
      if (!primaryPatient) {
        primaryPatient = patients.find(p => p.employee_id === trimmedId);
      }

      // Finally, try by database ID as fallback
      if (!primaryPatient) {
        primaryPatient = patients.find(p => String(p.id) === trimmedId);
      }

      if (!primaryPatient) {
        toast.error(`Principal Staff ID "${trimmedId}" not found. Please enter a valid NPA staff or retiree ID.`);
        return;
      }

      // Validate that the principal is actually an employee or retiree
      if (primaryPatient.category !== 'employee' && primaryPatient.category !== 'retiree') {
        toast.error(`Principal must be an NPA staff member or retiree. Selected patient is categorized as: ${primaryPatient.category}`);
        return;
      }

      // Check entitlement
      const entitlementCheck = canAddDependent(primaryPatient.patient_id || String(primaryPatient.id));
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

      const trimmedId = editForm.primaryPatientId.trim();

      // First, try to find by patient_id (like E-A2000 or R-A2000)
      let primaryPatient = patients.find(p => p.patient_id === trimmedId);

      // If not found by patient_id, try by personal_number (like A2000)
      if (!primaryPatient) {
        primaryPatient = patients.find(p => p.personal_number === trimmedId);
      }

      // If still not found, try by employee_id
      if (!primaryPatient) {
        primaryPatient = patients.find(p => p.employee_id === trimmedId);
      }

      // Finally, try by database ID as fallback
      if (!primaryPatient) {
        primaryPatient = patients.find(p => String(p.id) === trimmedId);
      }

      if (!primaryPatient) {
        toast.error(`Principal Staff ID "${trimmedId}" not found. Please enter a valid NPA staff or retiree ID.`);
        return;
      }

      // Validate that the principal is actually an employee or retiree
      if (primaryPatient.category !== 'employee' && primaryPatient.category !== 'retiree') {
        toast.error(`Principal must be an NPA staff member or retiree. Selected patient is categorized as: ${primaryPatient.category}`);
        return;
      }

      // Prepare update data with all fields
      const updateData: any = {
        // Basic fields
        surname: editForm.lastName,
        first_name: editForm.firstName,
        gender: editForm.gender.toLowerCase(),
        date_of_birth: editForm.dob,
        phone: editForm.phone || '',
        email: editForm.email || '',
        nok_relationship: editForm.relationship,
        is_active: editForm.status === 'Active',
        principal_staff: primaryPatient.id,

        // Additional fields matching patient registration
        title: editForm.title || '',
        middle_name: editForm.middleName || '',
        marital_status: editForm.maritalStatus || '',
        religion: editForm.religion || '',
        tribe: editForm.tribe || '',
        residential_address: editForm.residentialAddress || '',
        permanent_address: editForm.permanentAddress || '',
        lga: editForm.lga || '',
        state_of_residence: editForm.stateOfResidence || '',
        state_of_origin: editForm.stateOfOrigin || '',
        occupation: editForm.occupation || '',
      };

      // Handle photo upload if a new photo was selected
      if (photoFile) {
        try {
          const formData = new FormData();
          formData.append('photo', photoFile);
          await patientService.uploadPatientPhoto(dependentToUpdate.id, formData);
        } catch (photoError) {
          console.error('Failed to upload photo:', photoError);
          toast.error('Patient updated but photo upload failed');
        }
      }

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

  const openEditDialog = async (dep: typeof dependents[0]) => {
    setSelectedDependent(dep);
    setEditFormLoading(true);
    setPhotoPreview(null);
    setPhotoFile(null);

    try {
      // Load full dependent data from API to get additional fields
      const dependentApiData = await patientService.getPatients({
        category: 'dependent',
        search: dep.id,
      });

      const dependentToEdit = dependentApiData.results.find(
        (d: any) => (d.patient_id || String(d.id)) === dep.id
      );

      if (dependentToEdit) {
        // Set photo preview if exists
        if (dependentToEdit.photo) {
          setPhotoPreview(getPhotoUrl(dependentToEdit.photo));
        }

    setEditForm({
          // Basic info
          firstName: dependentToEdit.first_name || '',
          lastName: dependentToEdit.surname || '',
          dob: dependentToEdit.date_of_birth || '',
          gender: dependentToEdit.gender === 'male' ? 'Male' : 'Female',
          relationship: dependentToEdit.nok_relationship || '',
          primaryPatientId: dep.primaryPatient.id,
          phone: dependentToEdit.phone || '',
          email: dependentToEdit.email || '',
          status: dependentToEdit.is_active ? 'Active' : 'Inactive',
          dependentType: dep.dependentType || 'dependent',
          // Additional fields
          title: dependentToEdit.title || '',
          middleName: dependentToEdit.middle_name || '',
          maritalStatus: dependentToEdit.marital_status || '',
          religion: dependentToEdit.religion || '',
          tribe: dependentToEdit.tribe || '',
          residentialAddress: dependentToEdit.residential_address || '',
          permanentAddress: dependentToEdit.permanent_address || '',
          lga: dependentToEdit.lga || '',
          stateOfResidence: dependentToEdit.state_of_residence || '',
          stateOfOrigin: dependentToEdit.state_of_origin || '',
          occupation: dependentToEdit.occupation || '',
        });
      }
    } catch (error) {
      console.error('Error loading dependent data:', error);
      toast.error('Failed to load dependent data');
    } finally {
      setEditFormLoading(false);
    }

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
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Manage Dependents</h1>
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
                    <p className={`text-2xl sm:text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
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
                      {relationshipTypes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
                            <Link href="/medical-records/patients" className="flex items-center gap-1 text-primary hover:underline">
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

          </div>
        </div>

        {/* Add Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                <Label>Principal Staff ID *</Label>
                <Input
                  value={newDependent.primaryPatientId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setNewDependent(prev => ({
                      ...prev,
                      primaryPatientId: newId,
                      dependentType: newId ? getDependentType(newId) : ''
                    }));
                  }}
                  placeholder="Enter NPA Staff ID (e.g., A2000)"
                  className={(() => {
                    if (!newDependent.primaryPatientId) return '';
                    const validation = validatePrincipalStaffId(newDependent.primaryPatientId);
                    return validation.valid ? 'border-green-500 focus:border-green-500' : 'border-red-500 focus:border-red-500';
                  })()}
                />
                <p className="text-xs text-muted-foreground">Enter the NPA Staff ID of the employee or retiree this dependent belongs to</p>
                {newDependent.primaryPatientId && (
                  <div className={`text-xs p-2 rounded-md border ${
                    (() => {
                      const validation = validatePrincipalStaffId(newDependent.primaryPatientId);
                      return validation.valid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700';
                    })()
                  }`}>
                    {(() => {
                      const validation = validatePrincipalStaffId(newDependent.primaryPatientId);
                      if (validation.valid) {
                        const check = canAddDependent(newDependent.primaryPatientId);
                        if (check.allowed && 'remaining' in check) {
                          return `✅ ${validation.message} • ${check.remaining} dependent slot(s) remaining`;
                        }
                        return `✅ ${validation.message}`;
                      }
                      return `❌ ${validation.message}`;
                    })()}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dependent Type *</Label>
                  <Input value={newDependent.dependentType} readOnly className="bg-muted" placeholder="Auto-filled based on principal" />
                  <p className="text-xs text-muted-foreground">Automatically determined by principal staff type</p>
                </div>
                <div className="space-y-2"><Label>Relationship *</Label>
                  <Select value={newDependent.relationship} onValueChange={(v) => setNewDependent(prev => ({ ...prev, relationship: v }))}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{relationshipTypes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Phone</Label><Input value={newDependent.phone} onChange={(e) => setNewDependent(prev => ({ ...prev, phone: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Email</Label><Input value={newDependent.email} onChange={(e) => setNewDependent(prev => ({ ...prev, email: e.target.value }))} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddDependent} disabled={!newDependent.firstName || !newDependent.lastName || !newDependent.dob || !newDependent.gender || !newDependent.primaryPatientId || !newDependent.relationship} className="bg-violet-500 hover:bg-violet-600 text-white"><Plus className="h-4 w-4 mr-2" />Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                  <Link href="/medical-records/patients" className="flex items-center gap-2 text-primary hover:underline font-medium"><Link2 className="h-4 w-4" />{selectedDependent.primaryPatient.name}</Link>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              <Button onClick={() => { setIsViewDialogOpen(false); if (selectedDependent) openEditDialog(selectedDependent); }}><Edit className="h-4 w-4 mr-2" />Edit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog - Updated to match patient registration modal */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-500" />
                Edit Dependent
              </DialogTitle>
              <DialogDescription>Update dependent registration information</DialogDescription>
            </DialogHeader>
            {selectedDependent && (
              <div className="space-y-4 py-4" key={`edit-${selectedDependent.id}`}>
                {editFormLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-3 text-muted-foreground">Loading dependent data...</span>
                  </div>
                ) : (
                  <>
                    {/* Patient ID (Read-only) */}
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Dependent ID (Cannot be changed)</p>
                      <p className="font-medium">{selectedDependent.id}</p>
                    </div>

                    {/* Photo Upload */}
                    <div className="space-y-2">
                      <Label>Dependent Photo</Label>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                          {photoPreview ? (
                            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <Camera className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="file"
                              id="edit-photo-upload"
                              accept="image/*"
                              onChange={handlePhotoSelect}
                              className="hidden"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => document.getElementById('edit-photo-upload')?.click()}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              {photoPreview ? 'Change Photo' : 'Upload Photo'}
                            </Button>
                            {photoPreview && (
                              <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                onClick={handleRemovePhoto}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">JPG, PNG. Max 5MB</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Personal Information */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Personal Information</h3>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label>Title</Label>
                          <Select value={editForm.title || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, title: v === 'none' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {titles.map(title => <SelectItem key={title} value={title.toLowerCase()}>{title}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>First Name *</Label>
                          <Input value={editForm.firstName} onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Middle Name</Label>
                          <Input value={editForm.middleName} onChange={(e) => setEditForm(prev => ({ ...prev, middleName: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Surname *</Label>
                          <Input value={editForm.lastName} onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))} />
                        </div>
                      </div>
              <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Date of Birth</Label>
                          <Input type="date" value={editForm.dob} onChange={(e) => setEditForm(prev => ({ ...prev, dob: e.target.value }))} />
              </div>
                        <div className="space-y-2">
                          <Label>Marital Status</Label>
                          <Select value={editForm.maritalStatus || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, maritalStatus: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Not specified</SelectItem>
                              {maritalStatuses.map(status => <SelectItem key={status} value={status.toLowerCase()}>{status}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Religion</Label>
                          <Select value={editForm.religion || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, religion: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Not specified</SelectItem>
                              {religions.map(religion => <SelectItem key={religion} value={religion}>{religion}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Tribe</Label>
                          <Select value={editForm.tribe || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, tribe: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Not specified</SelectItem>
                              {tribes.map(tribe => <SelectItem key={tribe} value={tribe}>{tribe}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Occupation</Label>
                          <Input
                            value={editForm.occupation}
                            onChange={(e) => setEditForm(prev => ({ ...prev, occupation: e.target.value }))}
                            placeholder="Enter occupation"
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Contact Information */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Contact Information</h3>
              <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Phone *</Label>
                          <Input value={editForm.phone} onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="+234..." />
                </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input type="email" value={editForm.email} onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))} placeholder="email@example.com" />
              </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Residential Address</Label>
                        <Input value={editForm.residentialAddress} onChange={(e) => setEditForm(prev => ({ ...prev, residentialAddress: e.target.value }))} placeholder="Street address" />
                      </div>
                      <div className="space-y-2">
                        <Label>Permanent Address</Label>
                        <Input value={editForm.permanentAddress} onChange={(e) => setEditForm(prev => ({ ...prev, permanentAddress: e.target.value }))} placeholder="Permanent address (if different)" />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>LGA</Label>
                          <Input value={editForm.lga} onChange={(e) => setEditForm(prev => ({ ...prev, lga: e.target.value }))} placeholder="Local Government Area" />
                        </div>
                        <div className="space-y-2">
                          <Label>State of Residence</Label>
                          <Select value={editForm.stateOfResidence || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, stateOfResidence: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Not specified</SelectItem>
                              {NIGERIA_STATES.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>State of Origin</Label>
                          <Select value={editForm.stateOfOrigin || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, stateOfOrigin: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Not specified</SelectItem>
                              {NIGERIA_STATES.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Dependent-specific fields */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Dependent Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Gender *</Label>
                          <Select value={editForm.gender} onValueChange={(v) => setEditForm(prev => ({ ...prev, gender: v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Relationship to Principal *</Label>
                          <Select value={editForm.relationship} onValueChange={(v) => setEditForm(prev => ({ ...prev, relationship: v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {relationshipTypes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Principal Staff ID *</Label>
                          <Input
                            value={editForm.primaryPatientId}
                            onChange={(e) => {
                              const newId = e.target.value;
                              setEditForm(prev => ({
                                ...prev,
                                primaryPatientId: newId,
                                dependentType: newId ? getDependentType(newId) : prev.dependentType
                              }));
                            }}
                            placeholder="Enter NPA Staff ID (e.g., A2000)"
                            className={(() => {
                              if (!editForm.primaryPatientId) return '';
                              const validation = validatePrincipalStaffId(editForm.primaryPatientId);
                              return validation.valid ? 'border-green-500 focus:border-green-500' : 'border-red-500 focus:border-red-500';
                            })()}
                          />
                          <p className="text-xs text-muted-foreground">Enter the NPA Staff ID of the employee or retiree this dependent belongs to</p>
                          {editForm.primaryPatientId && (
                            <div className={`text-xs p-2 rounded-md border mt-1 ${
                              (() => {
                                const validation = validatePrincipalStaffId(editForm.primaryPatientId);
                                return validation.valid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700';
                              })()
                            }`}>
                              {(() => {
                                const validation = validatePrincipalStaffId(editForm.primaryPatientId);
                                if (validation.valid) {
                                  const check = canAddDependent(editForm.primaryPatientId);
                                  if (check.allowed && 'remaining' in check) {
                                    return `✅ ${validation.message} • ${check.remaining} dependent slot(s) remaining`;
                                  }
                                  return `✅ ${validation.message}`;
                                }
                                return `❌ ${validation.message}`;
                              })()}
                            </div>
                          )}
              </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select value={editForm.status} onValueChange={(v) => setEditForm(prev => ({ ...prev, status: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="Inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                </div>
                </div>
              </div>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleEditDependent} disabled={editFormLoading}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
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
