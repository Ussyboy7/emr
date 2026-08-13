"use client";
import { formatDisplayDate, formatDisplayTime, toApiDateFromInstant } from "@/lib/dates";

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { patientService, type Patient as ApiPatient } from '@/lib/services';
import { resolvePatientNumericId, resolvePatientRecord } from '@/lib/utils/patient-id';
import { normalizePatientTitleValue } from '@/lib/constants/patient';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMedicalRecordsPageAuth } from '@/hooks/use-medical-records-page-auth';
import { formatPatientCategoryLabel, getPatientCategoryBorderClass } from '@/lib/medical-records/patient-category';
import { isAuthenticationError } from '@/lib/auth-errors';
import { useCurrentUser } from '@/hooks/use-current-user';
import { canManagePatientLifecycle, isSystemAdminUser, canEditPersonalNumber } from '@/lib/patient-permissions';
import { medicalHistoryFormFromRecord } from '@/lib/clinical-overview-utils';
import { 
  Search, Filter, Users, 
  UserPlus, Calendar, FileText, Edit, Loader2, X,
  Activity, UserCheck, AlertTriangle, Trash2, MoreHorizontal,
  GitMerge, Eye
} from 'lucide-react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { PatientOverviewModal } from '@/components/shared/PatientOverviewModal';
import { PrincipalDependentsModal } from '@/components/shared/PrincipalDependentsModal';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { EditPatientDialog } from '@/components/medical-records/EditPatientDialog';
import { useWorkLocationOptions } from '@/hooks/use-work-location-options';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { AdvancedFiltersButton } from '@/components/shared/AdvancedFiltersButton';
import { MergePatientDialog } from './merge-patient-dialog';
import { validatePatientPhotoFile } from '@/lib/patient-photo';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return '';
  const formatted = formatDisplayDate(dateString);
  return formatted === '—' ? '' : formatted;
};

const formatTime = (dateString: string | undefined): string => {
  if (!dateString) return '';
  const formatted = formatDisplayTime(dateString);
  return formatted === '—' ? '' : formatted;
};



// Patient type
type Patient = {
  id: string;
  numericId?: number; // DB id for API calls (Edit, Update, etc.)
  name: string;
  category: string;
  personalNumber?: string;
  employeeType?: string;
  division?: string;
  age: number;
  gender: string;
  dob: string;
  phone: string;
  email: string;
  bloodGroup: string;
  address: string;
  emergencyContact: string;
  lastVisit: string;
  totalVisits: number;
  location: string;
  photo: string | null;
  registeredAt: string;
  primaryPatient?: string;
  relationship?: string;
  nonNpaType?: string;
  /** Active dependents for employee/retiree principals (from API count). */
  dependentsCount?: number;
};

// Safe property access helper
const getLocation = (patient: any): string => {
  return patient.location || patient.work_location || patient.office_location || '';
};

const getDisplayAge = (age?: number, dob?: string): string => {
  if (typeof dob === 'string' && dob.trim()) {
    const birthDate = new Date(dob);
    if (!Number.isNaN(birthDate.getTime())) {
      const today = new Date();
      let years = today.getFullYear() - birthDate.getFullYear();
      let months = today.getMonth() - birthDate.getMonth();
      const days = today.getDate() - birthDate.getDate();

      if (days < 0) months -= 1;
      if (months < 0) {
        years -= 1;
        months += 12;
      }

      if (years > 0) return `${years}y`;
      if (months > 0) return `${months}mo`;
      return '0mo';
    }
  }

  if (typeof age === 'number' && Number.isFinite(age) && age >= 0) return `${age}y`;
  return 'Age unknown';
};

const normalizeGender = (value?: string): 'male' | 'female' | '' => {
  const g = (value || '').trim().toLowerCase();
  if (g === 'male') return 'male';
  if (g === 'female') return 'female';
  return '';
};

// Transform backend patient to frontend format
const transformPatient = (apiPatient: ApiPatient): Patient => {
  // Use patient_id if available, otherwise fallback to numeric ID as string
  const patientId = apiPatient.patient_id || String(apiPatient.id);
  
  return {
    id: patientId,
    numericId: apiPatient.id,
    name: apiPatient.full_name ?? '',
    category: formatPatientCategoryLabel(apiPatient.category),
    personalNumber: apiPatient.personal_number || '',
    employeeType: apiPatient.employee_type || '',
    division: apiPatient.division || '',
    age: apiPatient.age || 0,
    gender: normalizeGender(apiPatient.gender) === 'female' ? 'Female' : normalizeGender(apiPatient.gender) === 'male' ? 'Male' : '',
    dob: apiPatient.date_of_birth || '',
    phone: apiPatient.phone || '',
    email: apiPatient.email || '',
    bloodGroup: apiPatient.blood_group || '',
    address: apiPatient.residential_address || apiPatient.permanent_address || '',
    emergencyContact: apiPatient.nok_first_name ? `${apiPatient.nok_first_name} ${apiPatient.nok_middle_name || ''} - ${apiPatient.nok_phone || ''}`.trim() : '',
    lastVisit: apiPatient.last_visit_at ? formatDate(apiPatient.last_visit_at) : '',
    totalVisits: Number(apiPatient.total_visits || 0),
    location: getLocation(apiPatient),
    photo: apiPatient.photo ?? null,
    registeredAt: toApiDateFromInstant(apiPatient.created_at),
    primaryPatient: apiPatient.principal_staff_full_name || '',
    relationship: apiPatient.nok_relationship || '',
    nonNpaType: apiPatient.nonnpa_type || '',
  };
};

const categories = ["All Categories", "Employee", "Retiree", "Dependent", "NonNPA"];

function PatientsListPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useCurrentUser();
  const { ready, authError, handleAuthError } = useMedicalRecordsPageAuth();
  const { locations: locationOptions } = useWorkLocationOptions();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [genderFilter, setGenderFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  
  // Modal states
  const [isOverviewModalOpen, setIsOverviewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    title: '',
    personalNumber: '',
    gender: 'male' as 'male' | 'female',
    firstName: '',
    lastName: '',
    middleName: '',
    dateOfBirth: '',
    maritalStatus: '',
    religion: '',
    tribe: '',
    occupation: '',
    phone: '',
    email: '',
    residentialAddress: '',
    permanentAddress: '',
    stateOfResidence: '',
    stateOfOrigin: '',
    lga: '',
    bloodGroup: '',
    genotype: '',
    location: '',
    division: '',
    employeeType: '',
    nonnpaType: '',
    dependentType: '',
    nokSurname: '',
    nokFirstName: '',
    nokMiddleName: '',
    nokRelationship: '',
    nokPhone: '',
    nokAddress: '',
  });
  const [editFormLoading, setEditFormLoading] = useState(false);
  /** Principal (employee/retiree) P.N. when editing a dependent — read-only; link is via API, not edited here */
  const [editPrincipalInfo, setEditPrincipalInfo] = useState<{
    personalNumber: string;
    fullName: string;
  } | null>(null);

  // Retiree conversion state
  const [isRetireeConversionOpen, setIsRetireeConversionOpen] = useState(false);
  const [convertingToRetiree, setConvertingToRetiree] = useState(false);
  const [patientToConvert, setPatientToConvert] = useState<Patient | null>(null);
  // Promote to Officer state
  const [isPromoteOpen, setIsPromoteOpen] = useState(false);
  const [promotingOfficer, setPromotingOfficer] = useState(false);
  const [patientToPromote, setPatientToPromote] = useState<Patient | null>(null);
  const [newPersonalNumber, setNewPersonalNumber] = useState('');
  // Convert to CSR state
  const [isCsrConversionOpen, setIsCsrConversionOpen] = useState(false);
  const [convertingToCsr, setConvertingToCsr] = useState(false);
  const [patientToConvertCsr, setPatientToConvertCsr] = useState<Patient | null>(null);
  const [csrDependentCount, setCsrDependentCount] = useState(0);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
  const [deletingPatient, setDeletingPatient] = useState(false);
  // Merge state — admin-only "fold this record into another"
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [patientToMerge, setPatientToMerge] = useState<Patient | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  const isAdminUser = useMemo(() => isSystemAdminUser(currentUser), [currentUser]);
  const canEditPersonalNumberField = useMemo(
    () => canEditPersonalNumber(currentUser),
    [currentUser],
  );
  const canManagePatientLifecycleActions = useMemo(
    () => canManagePatientLifecycle(currentUser),
    [currentUser],
  );

  // Medical History state
  const [medicalHistory, setMedicalHistory] = useState({
    allergies: [] as string[],
    diagnoses: [] as Array<{ code?: string; name: string; status: string; diagnosedDate?: string; treatingDoctor?: string }>,
    surgicalHistory: [] as Array<{ procedure: string; date: string; hospital: string }>,
    familyHistory: [] as Array<{ relation: string; condition: string }>,
    socialHistory: {
      smoking: '',
      alcohol: '',
      exercise: '',
      occupation: '',
    },
  });
  
  // Advanced filters
  const [ageRange, setAgeRange] = useState({ min: '', max: '' });
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const loadReqId = useRef(0);
  const [counts, setCounts] = useState<{ total: number; employees: number; retirees: number; dependents: number; nonnpa: number } | null>(null);
  const [principalBannerName, setPrincipalBannerName] = useState<string | null>(null);
  const [principalDepsOpen, setPrincipalDepsOpen] = useState<{
    principalNumericId: number;
    principalDisplayName: string;
    principalPatientId: string;
    principalCategory: 'employee' | 'retiree';
  } | null>(null);

  const principalIdFromUrl = useMemo(() => {
    const raw = searchParams.get('principal');
    if (raw && /^\d+$/.test(raw.trim())) return Number(raw.trim());
    return null;
  }, [searchParams]);

  // Principal filter label for banner
  useEffect(() => {
    if (!principalIdFromUrl) {
      setPrincipalBannerName(null);
      return;
    }
    let cancelled = false;
    patientService
      .getPatient(principalIdFromUrl)
      .then((p) => {
        if (!cancelled) setPrincipalBannerName((p.full_name || p.patient_id || '').trim() || null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (handleAuthError(err)) return;
        setPrincipalBannerName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [principalIdFromUrl, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void patientService
      .getPatientCounts()
      .then(setCounts)
      .catch((err) => {
        if (handleAuthError(err)) return;
        console.error("Error loading patient counts:", err);
        toast.error("Failed to load patient category counts");
        setCounts(null);
      });
  }, [ready, handleAuthError]);

  useEffect(() => {
    const cat = (searchParams.get('category') || '').toLowerCase();
    if (['employee', 'retiree', 'dependent', 'nonnpa'].includes(cat)) {
      setCategoryFilter(cat);
    }
  }, [searchParams]);

  // When filtering by principal, list is dependents only
  useEffect(() => {
    if (principalIdFromUrl != null) setCategoryFilter('dependent');
  }, [principalIdFromUrl]);

  // Reset to page 1 when filters or items per page change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearchQuery,
    genderFilter,
    categoryFilter,
    locationFilter,
    ageRange.min,
    ageRange.max,
    dateRange.from,
    dateRange.to,
    itemsPerPage,
    principalIdFromUrl,
  ]);

  const loadPatients = useCallback(async () => {
    const reqId = ++loadReqId.current;
    try {
      setLoading(true);
      setError(null);
      const params: any = {
        page: currentPage,
        page_size: itemsPerPage,
      };
      if (principalIdFromUrl != null) {
        params.category = 'dependent';
        params.principal_staff = principalIdFromUrl;
      } else if (categoryFilter !== 'all') {
        params.category = categoryFilter;
      }
      if (genderFilter !== 'all') params.gender = genderFilter;
      if (locationFilter !== 'all') params.location = locationFilter;
      const searchTerm = debouncedSearchQuery.trim();
      if (searchTerm) params.search = searchTerm;
      if (ageRange.min) {
        const minAge = parseInt(ageRange.min, 10);
        if (Number.isFinite(minAge)) params.age_min = minAge;
      }
      if (ageRange.max) {
        const maxAge = parseInt(ageRange.max, 10);
        if (Number.isFinite(maxAge)) params.age_max = maxAge;
      }
      if (dateRange.from) params.last_visit_after = dateRange.from;
      if (dateRange.to) params.last_visit_before = dateRange.to;

      const response = await patientService.getPatients(params);
      if (reqId !== loadReqId.current) return;
      setTotalCount(Math.max(response.count, response.results.length));
      
      // Transform patients (visit counts, employment, principal come from list serializer)
      const transformedPatients = response.results.map(apiPatient => transformPatient(apiPatient));

      if (principalIdFromUrl == null) {
        const employeeIds = transformedPatients
          .map((patient, index) => {
            const apiPatient = response.results[index];
            if (
              (apiPatient.category === 'employee' || apiPatient.category === 'retiree') &&
              apiPatient.id
            ) {
              return apiPatient.id;
            }
            return null;
          })
          .filter((id): id is number => id != null);

        if (employeeIds.length > 0) {
          try {
            const depCounts = await patientService.getDependentsCounts(employeeIds);
            transformedPatients.forEach((patient, index) => {
              const apiPatient = response.results[index];
              if (
                (apiPatient.category === 'employee' || apiPatient.category === 'retiree') &&
                apiPatient.id
              ) {
                patient.dependentsCount = depCounts[String(apiPatient.id)] ?? 0;
              }
            });
          } catch {
            /* leave dependentsCount undefined */
          }
        }
      }
      
      if (reqId !== loadReqId.current) return;
      setPatients(transformedPatients);
    } catch (err: any) {
      if (handleAuthError(err)) {
        setError('Authentication required. Redirecting to login...');
        return;
      }
      
      setError(err.message || 'Failed to load patients');
      toast.error('Failed to load patients. Please try again.');
      console.error('Error loading patients:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, principalIdFromUrl, categoryFilter, genderFilter, locationFilter, debouncedSearchQuery, ageRange.min, ageRange.max, dateRange.from, dateRange.to, handleAuthError]);

  // Load patients from API when page, page size, or server-side filters change
  useEffect(() => {
    if (!ready) return;
    void loadPatients();
  }, [ready, loadPatients]);

  useReloadOnFocus(() => loadPatients(), { minIntervalMs: 0 });

  const stats = useMemo(() => [
    { label: 'Total Patients', value: counts?.total ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Employees', value: counts?.employees ?? 0, icon: UserCheck, color: 'text-teal-500', bg: 'bg-teal-500/10' },
    { label: 'Retirees', value: counts?.retirees ?? 0, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Dependents', value: counts?.dependents ?? 0, icon: Users, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  ], [counts]);

  const openOverviewModal = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsOverviewModalOpen(true);
  };

  const openRetireeConversion = (patient: Patient) => {
    setPatientToConvert(patient);
    setIsRetireeConversionOpen(true);
  };

  const openDeletePatient = (patient: Patient) => {
    setPatientToDelete(patient);
    setIsDeleteDialogOpen(true);
  };

  const handleRetireeConversion = async () => {
    if (!patientToConvert) return;

    setConvertingToRetiree(true);
    try {
      // Get the full patient data to update
      const fullPatient = await patientService.getPatient(Number(patientToConvert.numericId || patientToConvert.id));

      // Update patient category to retiree
      // Note: The backend will automatically regenerate the patient ID when category changes
      await patientService.updatePatient(fullPatient.id, {
        category: 'retiree'
      });

      toast.success(
        `Patient ${patientToConvert.name} converted to retiree status${
          (patientToConvert.dependentsCount ?? 0) > 0
            ? ` (${patientToConvert.dependentsCount} dependent${
                patientToConvert.dependentsCount === 1 ? '' : 's'
              } updated)`
            : ''
        }`,
      );

      // Close modal and refresh data
      setIsRetireeConversionOpen(false);
      setPatientToConvert(null);

      // Refresh the patient list
      await loadPatients();

    } catch (error: any) {
      toast.error(error?.message || 'Failed to convert patient to retiree');
    } finally {
      setConvertingToRetiree(false);
    }
  };

  // Promote to Officer handlers
  const openPromoteDialog = (patient: Patient) => {
    setPatientToPromote(patient);
    setNewPersonalNumber('');
    setIsPromoteOpen(true);
  };

  const handlePromote = async () => {
    if (!patientToPromote || !newPersonalNumber.trim()) return;
    setPromotingOfficer(true);
    try {
      const numericId = Number(patientToPromote.numericId || patientToPromote.id);
      const result = await patientService.promoteToOfficer(numericId, newPersonalNumber.trim());
      const depNote =
        result.dependents_updated > 0
          ? ` (${result.dependents_updated} dependent ID${result.dependents_updated === 1 ? '' : 's'} updated)`
          : '';
      toast.success(
        `${patientToPromote.name} has been promoted to Officer (PN: ${newPersonalNumber.trim()})${depNote}`,
      );
      setIsPromoteOpen(false);
      setPatientToPromote(null);
      setNewPersonalNumber('');
      await loadPatients();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to promote patient to Officer');
    } finally {
      setPromotingOfficer(false);
    }
  };

  // Convert to CSR handlers
  const openCsrConversion = (patient: Patient) => {
    setPatientToConvertCsr(patient);
    setIsCsrConversionOpen(true);
  };

  // Merge handler — opens the side-by-side merge dialog.
  const openMergeDialog = (patient: Patient) => {
    // The local Patient and the dialog's LocalPatient are structurally
    // compatible; cast at the boundary.
    setPatientToMerge(patient as never);
    setIsMergeDialogOpen(true);
  };

  const onMergeSuccess = async () => {
    // The loser was just tombstoned; refresh the list so it disappears.
    await loadPatients();
  };

  const handleCsrConversion = async () => {
    if (!patientToConvertCsr) return;
    setConvertingToCsr(true);
    try {
      const numericId = Number(patientToConvertCsr.numericId || patientToConvertCsr.id);
      const result = await patientService.convertToCsr(numericId);
      toast.success(
        `${patientToConvertCsr.name} converted to CSR. ${result.dependents_converted} dependent(s) also converted.`
      );
      setIsCsrConversionOpen(false);
      setPatientToConvertCsr(null);
      await loadPatients();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to convert patient to CSR');
    } finally {
      setConvertingToCsr(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!patientToDelete) return;
    const numericId = Number(patientToDelete.numericId || patientToDelete.id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      toast.error('Invalid patient identifier');
      return;
    }

    setDeletingPatient(true);
    try {
      await patientService.deletePatient(numericId);
      toast.success(`Patient ${patientToDelete.name} deleted`);
      setIsDeleteDialogOpen(false);
      setPatientToDelete(null);
      await loadPatients();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete patient');
    } finally {
      setDeletingPatient(false);
    }
  };

  const openEditModal = async (patient: Patient) => {
    // Don't open modal until we have the data - this prevents showing empty form
    setEditFormLoading(true);
    setSelectedPatient(patient);
    
    // Reset form immediately to clear any stale data from previous edits
    setEditForm({
      title: '',
      personalNumber: '',
      gender: 'male',
      firstName: '',
      lastName: '',
      middleName: '',
      dateOfBirth: '',
      maritalStatus: '',
      religion: '',
      tribe: '',
      occupation: '',
      phone: '',
      email: '',
      residentialAddress: '',
      permanentAddress: '',
      stateOfResidence: '',
      stateOfOrigin: '',
      lga: '',
      bloodGroup: '',
      genotype: '',
      location: '',
      division: '',
      employeeType: '',
      nonnpaType: '',
      dependentType: '',
      nokSurname: '',
      nokFirstName: '',
      nokMiddleName: '',
      nokRelationship: '',
      nokPhone: '',
      nokAddress: '',
    });
    setPhotoPreview(null);
    setPhotoFile(null);
    setEditPrincipalInfo(null);

    try {
      const apiPatient = await resolvePatientRecord(patient.id);
      const numericId = apiPatient.id;

      let historyPayload: Record<string, unknown> | null = null;
      try {
        const overview = await patientService.getClinicalOverview(numericId);
        historyPayload = (overview.medical_history as Record<string, unknown>) ?? null;
      } catch (historyErr: any) {
        console.warn('Failed to load patient history:', historyErr);
      }

      if (apiPatient.category === 'dependent' && apiPatient.principal_staff) {
        try {
          const principal = await patientService.getPatient(apiPatient.principal_staff);
          setEditPrincipalInfo({
            personalNumber: (principal.personal_number || '').trim(),
            fullName: principal.full_name || '',
          });
        } catch {
          setEditPrincipalInfo(null);
        }
      } else {
        setEditPrincipalInfo(null);
      }

      // Parse date of birth
      let dobFormatted = '';
      if (apiPatient.date_of_birth) {
        try {
          const date = new Date(apiPatient.date_of_birth);
          if (!isNaN(date.getTime())) {
            dobFormatted = toApiDateFromInstant(date);
          }
        } catch (e) {
          console.warn('Failed to parse date_of_birth:', e);
        }
      }
      
      // Normalize values to match dropdown options
      const normalizedTitle = normalizePatientTitleValue(apiPatient.title);
      const normalizedMaritalStatus = apiPatient.marital_status ? apiPatient.marital_status.toLowerCase() : '';
      const normalizedEmployeeType = apiPatient.employee_type ? apiPatient.employee_type.charAt(0).toUpperCase() + apiPatient.employee_type.slice(1).toLowerCase() : '';
      const normalizedNokRelationship = apiPatient.nok_relationship ? apiPatient.nok_relationship.charAt(0).toUpperCase() + apiPatient.nok_relationship.slice(1).toLowerCase() : '';
      
      const mergedOccupation =
        (apiPatient.occupation || '').trim() ||
        ((historyPayload?.social_history as { occupation?: string } | undefined)?.occupation || '').trim();

      // Use a single setEditForm call to ensure all fields update together
      // Note: API returns snake_case (first_name, surname, etc.)
      const formData = {
        title: normalizedTitle,
        // Dependents: identity for ED-/RD- IDs comes from the principal's P.N. only — no separate P.N. in the UI.
        personalNumber:
          apiPatient.category === 'dependent' ? '' : (apiPatient.personal_number || '').trim(),
        gender: (normalizeGender(apiPatient.gender) || 'male') as 'male' | 'female',
        firstName: apiPatient.first_name || '',
        lastName: apiPatient.surname || '',
        middleName: apiPatient.middle_name || '',
        dateOfBirth: dobFormatted,
        maritalStatus: normalizedMaritalStatus,
        religion: apiPatient.religion || '',
        tribe: apiPatient.tribe || '',
        occupation: mergedOccupation,
        phone: apiPatient.phone || '',
        email: apiPatient.email || '',
        residentialAddress: apiPatient.residential_address || '',
        permanentAddress: apiPatient.permanent_address || '',
        stateOfResidence: apiPatient.state_of_residence || '',
        stateOfOrigin: apiPatient.state_of_origin || '',
        lga: apiPatient.lga || '',
        bloodGroup: apiPatient.blood_group || '',
        genotype: apiPatient.genotype || '',
        location: apiPatient.location || '',
        division: apiPatient.division || '',
        employeeType: normalizedEmployeeType,
        nonnpaType: apiPatient.nonnpa_type || '',
        dependentType: apiPatient.dependent_type || '',
        nokSurname: apiPatient.nok_surname || '',
        nokFirstName: apiPatient.nok_first_name || '',
        nokMiddleName: apiPatient.nok_middle_name || '',
        nokRelationship: normalizedNokRelationship,
        nokPhone: apiPatient.nok_phone || '',
        nokAddress: apiPatient.nok_address || '',
      };
      
      // Set form data - use functional update to ensure we're updating from the latest state
      setEditForm(() => ({ ...formData }));
      
      // Set photo preview if patient has photo
      if (apiPatient.photo) {
        setPhotoPreview(apiPatient.photo);
      } else {
        setPhotoPreview(null);
      }
      setPhotoFile(null);
      setPhotoRemoved(false);
      
      // Medical history (occupation is edited once under Personal Information; synced on save)
      if (historyPayload) {
        setMedicalHistory(medicalHistoryFormFromRecord(historyPayload));
      } else {
        setMedicalHistory(medicalHistoryFormFromRecord(null));
      }
      
      // Only open the modal after data is loaded
      setIsEditModalOpen(true);
    } catch (err: any) {
      console.error('Error loading patient for edit:', err);
      toast.error('Failed to load patient data: ' + (err.message || 'Unknown error'));
      // Don't open modal if there's an error
    } finally {
      setEditFormLoading(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validatePatientPhotoFile(file);
    if (validationError) {
      toast.error(validationError);
      e.target.value = '';
      return;
    }
    
    setPhotoFile(file);
    setPhotoRemoved(false);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoRemoved(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedPatient) return;
    setIsSubmitting(true);

    try {
      const numericId = await resolvePatientNumericId(selectedPatient.id);
      const first = editForm.firstName.trim();
      const last = editForm.lastName.trim();
      const dob = editForm.dateOfBirth?.trim() ?? '';
      if (!first || !last) {
        toast.error('First name and surname are required.');
        setIsSubmitting(false);
        return;
      }
      if (!dob) {
        toast.error('Date of birth is required.');
        setIsSubmitting(false);
        return;
      }
      if (editForm.gender !== 'male' && editForm.gender !== 'female') {
        toast.error('Gender is required.');
        setIsSubmitting(false);
        return;
      }
      const cat = selectedPatient.category;
      if ((cat === 'Employee' || cat === 'Retiree') && !editForm.personalNumber.trim()) {
        toast.error('Personal number is required for employees and retirees.');
        setIsSubmitting(false);
        return;
      }

      // Map frontend form fields to backend API fields (snake_case).
      // Optional fields use '' when cleared so PATCH actually clears the server values
      // (omitting a key leaves the previous value unchanged).
      const updateData: Partial<ApiPatient> = {
        title: normalizePatientTitleValue(editForm.title),
        gender: editForm.gender,
        first_name: first,
        surname: last,
        middle_name: editForm.middleName.trim(),
        date_of_birth: dob,
        marital_status: editForm.maritalStatus.trim()
          ? editForm.maritalStatus.toLowerCase()
          : '',
        religion: editForm.religion.trim(),
        tribe: editForm.tribe.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        residential_address: editForm.residentialAddress.trim(),
        permanent_address: editForm.permanentAddress.trim(),
        state_of_residence: editForm.stateOfResidence.trim(),
        state_of_origin: editForm.stateOfOrigin.trim(),
        lga: editForm.lga.trim(),
        blood_group: editForm.bloodGroup.trim() ? editForm.bloodGroup : '',
        genotype: editForm.genotype.trim() ? editForm.genotype : '',
        location: editForm.location.trim(),
        division: editForm.division.trim(),
        employee_type: editForm.employeeType.trim()
          ? editForm.employeeType.charAt(0).toUpperCase() + editForm.employeeType.slice(1).toLowerCase()
          : '',
        nonnpa_type: editForm.nonnpaType.trim(),
        dependent_type: editForm.dependentType.trim(),
        nok_surname: editForm.nokSurname.trim(),
        nok_first_name: editForm.nokFirstName.trim(),
        nok_middle_name: editForm.nokMiddleName.trim(),
        nok_relationship: editForm.nokRelationship.trim()
          ? editForm.nokRelationship.charAt(0).toUpperCase() + editForm.nokRelationship.slice(1).toLowerCase()
          : '',
        nok_address: editForm.nokAddress.trim(),
        nok_phone: editForm.nokPhone.trim(),
        occupation: editForm.occupation.trim(),
      };

      // Personal number: only system admins may PATCH changes (backend enforces).
      if (canEditPersonalNumberField) {
        updateData.personal_number = editForm.personalNumber.trim();
      }

      if (photoFile) {
        await patientService.updatePatient(numericId, updateData, { photo: photoFile });
      } else if (photoRemoved) {
        await patientService.updatePatient(numericId, updateData, { clearPhoto: true });
      } else {
        await patientService.updatePatient(numericId, updateData);
      }

      // Save medical history
      try {
        await patientService.updatePatientHistory(numericId, {
          allergies: medicalHistory.allergies,
          diagnoses: medicalHistory.diagnoses,
          surgical_history: medicalHistory.surgicalHistory,
          family_history: medicalHistory.familyHistory,
          social_history: {
            ...medicalHistory.socialHistory,
            occupation: editForm.occupation.trim(),
          },
        });
      } catch (historyErr: any) {
        console.warn('Failed to update medical history:', historyErr);
        // Don't fail the entire update if history save fails
      }
      
      toast.success(`Patient ${editForm.firstName} ${editForm.lastName} updated successfully`);
      
      // Reload patients
      await loadPatients();
      
      setIsEditModalOpen(false);
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoRemoved(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update patient');
      console.error('Error updating patient:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearFilters = () => {
    setGenderFilter('all');
    setCategoryFilter('all');
    setLocationFilter('all');
    setAgeRange({ min: '', max: '' });
    setDateRange({ from: '', to: '' });
    setIsFilterDialogOpen(false);
    router.push('/medical-records/patients');
    toast.info('Filters cleared');
  };

  const getCategoryBadge = (category: string) => getPatientCategoryBorderClass(category);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Manage Patients</h1>
            <p className="text-muted-foreground mt-1">Search, view, and manage all patient records in the system</p>
          </div>
          <Button className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white" asChild>
            <Link href="/medical-records/patients/new">
              <UserPlus className="h-4 w-4 mr-2" />Register Patient
            </Link>
          </Button>
        </div>

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
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                  <div className="relative flex-1 min-w-[min(100%,16rem)]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search by name, patient ID, or personal number…"
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      className="pl-10" 
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdvancedFiltersButton onClick={() => setIsFilterDialogOpen(true)} />
                    <Select value={categoryFilter} onValueChange={setCategoryFilter} disabled={principalIdFromUrl != null}>
                      <SelectTrigger className="w-[140px]"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c} value={c === 'All Categories' ? 'all' : c.toLowerCase()}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={genderFilter} onValueChange={setGenderFilter}>
                      <SelectTrigger className="w-[120px]"><SelectValue placeholder="Gender" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Gender</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={locationFilter} onValueChange={setLocationFilter}>
                      <SelectTrigger className="w-[180px]"><SelectValue placeholder="Location" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Locations</SelectItem>
                        {locationOptions.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {principalIdFromUrl != null && (
              <Card className="border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800">
                <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-sm text-foreground">
                    Showing <span className="font-medium">dependents</span> linked to{' '}
                    <span className="font-semibold">{principalBannerName || `record #${principalIdFromUrl}`}</span>.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setCategoryFilter('all');
                      router.push('/medical-records/patients');
                    }}
                  >
                    Clear principal filter
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Patients List */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {totalCount > 0
                  ? `Showing ${Math.min((currentPage - 1) * itemsPerPage + 1, totalCount)}–${Math.min(currentPage * itemsPerPage, totalCount)} of ${totalCount.toLocaleString()} patients`
                  : 'Showing 0 patients'}
              </p>
              
              {loading ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                  <p>Loading patients...</p>
                </CardContent></Card>
              ) : error ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-red-600 dark:text-red-400">{error}</p>
                  {isAuthenticationError(authError) ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm text-muted-foreground">Please log in to continue</p>
                      <Button variant="outline" onClick={() => router.push('/login')}>
                        Go to Login
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="mt-4" onClick={loadPatients}>Retry</Button>
                  )}
                </CardContent></Card>
              ) : patients.length > 0 ? (
                patients.map((patient) => (
                  <Card key={patient.id} className={`border-l-4 ${
                    patient.category === 'Employee' ? 'border-l-teal-500' :
                    patient.category === 'Retiree' ? 'border-l-amber-500' :
                    patient.category === 'Dependent' ? 'border-l-violet-500' :
                    'border-l-blue-500'
                  } hover:shadow-md transition-shadow`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <PatientAvatar name={patient.name} photoUrl={patient.photo} size="md" />
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Name + Category + Actions */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <button
                                onClick={() => openOverviewModal(patient)}
                                className="font-semibold text-foreground hover:text-primary transition-colors truncate text-left"
                              >
                                {patient.name}
                              </button>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getCategoryBadge(patient.category)}`}>
                                {patient.category}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openOverviewModal(patient)} title="View Patient">
                                <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditModal(patient)} title="Edit Patient">
                                <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => router.push(`/medical-records/visits/new?patient=${patient.id}`)}
                                title="Create Visit"
                              >
                                <Calendar className="h-4 w-4 text-muted-foreground hover:text-teal-500" />
                              </Button>
                              {(isAdminUser ||
                                (canManagePatientLifecycleActions &&
                                  (patient.category === 'Employee' || patient.category === 'Retiree'))) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="More actions">
                                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52">
                                    {patient.category === 'Employee' && canManagePatientLifecycleActions && (
                                      <DropdownMenuItem onClick={() => openRetireeConversion(patient)}>
                                        <UserCheck className="h-4 w-4 mr-2" />
                                        Convert to Retiree
                                      </DropdownMenuItem>
                                    )}
                                    {patient.category === 'Employee' &&
                                      canManagePatientLifecycleActions &&
                                      patient.employeeType === 'Staff' && (
                                        <DropdownMenuItem onClick={() => openPromoteDialog(patient)}>
                                          <Activity className="h-4 w-4 mr-2" />
                                          Promote to Officer
                                        </DropdownMenuItem>
                                      )}
                                    {canManagePatientLifecycleActions && patient.category === 'Retiree' && (
                                      <DropdownMenuItem onClick={() => openCsrConversion(patient)}>
                                        <UserPlus className="h-4 w-4 mr-2" />
                                        Convert to CSR
                                      </DropdownMenuItem>
                                    )}
                                    {isAdminUser && (
                                      <>
                                        {(canManagePatientLifecycleActions &&
                                          (patient.category === 'Employee' ||
                                            patient.category === 'Retiree')) && (
                                          <DropdownMenuSeparator />
                                        )}
                                        <DropdownMenuItem onClick={() => openMergeDialog(patient)}>
                                          <GitMerge className="h-4 w-4 mr-2" />
                                          Merge patient
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className="text-red-600 focus:text-red-600"
                                          onClick={() => openDeletePatient(patient)}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Delete patient
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                          
                          {/* Row 2: Details */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>
                              {joinDisplayParts([
                                patient.id,
                                [getDisplayAge(patient.age, patient.dob), patient.gender].filter(Boolean).join(' ').trim(),
                                patient.phone?.trim(),
                                patient.division,
                                patient.lastVisit ? `Last: ${patient.lastVisit}` : '',
                              ])}
                            </span>
                            {typeof patient.totalVisits === 'number' && (
                              <span className="text-teal-600 dark:text-teal-400">({patient.totalVisits} visits)</span>
                            )}
                          </div>
                          {(patient.category === 'Employee' || patient.category === 'Retiree') && patient.numericId ? (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                Dependents{' '}
                                <span className="font-medium text-foreground">
                                  {typeof patient.dependentsCount === 'number' ? patient.dependentsCount : '—'}
                                </span>
                                {patient.category === 'Employee' ? '/5' : '/1'}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1.5 px-2.5"
                                onClick={() =>
                                  setPrincipalDepsOpen({
                                    principalNumericId: patient.numericId!,
                                    principalDisplayName: patient.name,
                                    principalPatientId: patient.id,
                                    principalCategory: patient.category === 'Retiree' ? 'retiree' : 'employee',
                                  })
                                }
                              >
                                <Users className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                Dependents
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No patients found matching your criteria</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Pagination */}
            {totalCount > 0 && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={totalCount}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(newSize) => {
                    setItemsPerPage(newSize);
                    setCurrentPage(1);
                  }}
                  itemName="patients"
                />
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/patients/new')}>
                  <UserPlus className="h-4 w-4 mr-2" />Register New Patient
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/visits/new')}>
                  <Calendar className="h-4 w-4 mr-2" />Create Visit
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/reports')}>
                  <FileText className="h-4 w-4 mr-2" />Reports
                </Button>
              </CardContent>
            </Card>

            {/* Categories Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">By Category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Employee', count: counts?.employees ?? 0 },
                  { label: 'Retiree', count: counts?.retirees ?? 0 },
                  { label: 'Dependent', count: counts?.dependents ?? 0 },
                  { label: 'NonNPA', count: counts?.nonnpa ?? 0 },
                ].map(({ label: cat, count }) => {
                  const total = (counts?.total ?? 0) || 1;
                  const percentage = Math.round((count / total) * 100);
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{cat}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${cat === 'Employee' ? 'bg-teal-500' : cat === 'Retiree' ? 'bg-amber-500' : cat === 'Dependent' ? 'bg-violet-500' : 'bg-blue-500'}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Advanced Filters Dialog */}
        <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Filter className="h-5 w-5 text-primary" />Advanced Filters</DialogTitle>
              <DialogDescription>Apply additional filters to narrow down the patient list.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Age Range</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="Min" value={ageRange.min} onChange={(e) => setAgeRange(prev => ({ ...prev, min: e.target.value }))} />
                  <span className="text-muted-foreground">to</span>
                  <Input type="number" placeholder="Max" value={ageRange.max} onChange={(e) => setAgeRange(prev => ({ ...prev, max: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Last Visit Date Range</Label>
                <div className="flex items-center gap-2">
                  <Input type="date" value={dateRange.from} onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))} />
                  <span className="text-muted-foreground">to</span>
                  <Input type="date" value={dateRange.to} onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={clearFilters}><X className="h-4 w-4 mr-2" />Clear All</Button>
              <Button onClick={() => setIsFilterDialogOpen(false)}>Apply Filters</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Patient Overview Modal */}
        <PatientOverviewModal
          patient={selectedPatient}
          isOpen={isOverviewModalOpen}
          onClose={() => setIsOverviewModalOpen(false)}
          onEdit={(patient) => {
            setIsOverviewModalOpen(false);
            openEditModal(patient);
          }}
        />

        <PrincipalDependentsModal
          open={principalDepsOpen !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setPrincipalDepsOpen(null);
          }}
          principalNumericId={principalDepsOpen?.principalNumericId ?? null}
          principalDisplayName={principalDepsOpen?.principalDisplayName ?? ''}
          principalPatientId={principalDepsOpen?.principalPatientId ?? ''}
          principalCategory={principalDepsOpen?.principalCategory ?? 'employee'}
          onAfterChange={() => void loadPatients()}
          onEditDependent={async (api) => {
            setPrincipalDepsOpen(null);
            await openEditModal(transformPatient(api));
          }}
        />

        <EditPatientDialog
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          selectedPatient={selectedPatient}
          editForm={editForm}
          setEditForm={setEditForm}
          editFormLoading={editFormLoading}
          medicalHistory={medicalHistory}
          setMedicalHistory={setMedicalHistory}
          editPrincipalInfo={editPrincipalInfo}
          photoPreview={photoPreview}
          onPhotoSelect={handlePhotoSelect}
          onRemovePhoto={handleRemovePhoto}
          canEditPersonalNumberField={canEditPersonalNumberField}
          locationOptions={locationOptions}
          isSubmitting={isSubmitting}
          onSave={() => void handleSaveEdit()}
        />

        {/* Retiree Conversion Confirmation Dialog */}
        <AlertDialog open={isRetireeConversionOpen} onOpenChange={setIsRetireeConversionOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-orange-500" />
                Convert to Retiree Status
              </AlertDialogTitle>
              <AlertDialogDescription>
                {patientToConvert
                  ? `Are you sure you want to convert ${patientToConvert.name} from Employee to Retiree status?`
                  : 'Are you sure you want to convert this patient to retiree status?'}
              </AlertDialogDescription>
              {patientToConvert && (
                <div className="space-y-3">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>What happens:</strong>
                    </p>
                    <ul className="text-sm text-amber-700 dark:text-amber-300 mt-2 space-y-1">
                      <li>• Patient category changes from "Employee" to "Retiree"</li>
                      <li>• Patient ID will be updated (E-XXX → R-XXX format)</li>
                      {(patientToConvert.dependentsCount ?? 0) > 0 && (
                        <li>
                          • {patientToConvert.dependentsCount} linked dependent
                          {patientToConvert.dependentsCount === 1 ? '' : 's'} will be re-labelled
                          as retiree dependents and patient IDs updated (ED-… → RD-…)
                        </li>
                      )}
                      <li>• All existing medical records and history are preserved</li>
                    </ul>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This action maintains data integrity and prevents duplicate patient records.
                  </p>
                </div>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsRetireeConversionOpen(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRetireeConversion}
                disabled={convertingToRetiree}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {convertingToRetiree ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Convert to Retiree
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Promote to Officer Dialog */}
        <AlertDialog open={isPromoteOpen} onOpenChange={setIsPromoteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-purple-500" />
                Promote to Officer
              </AlertDialogTitle>
              <AlertDialogDescription>
                {patientToPromote
                  ? `Promote ${patientToPromote.name} from Staff to Officer?`
                  : 'Promote this patient to Officer?'}
              </AlertDialogDescription>
              {patientToPromote && (
                <div className="space-y-3">
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                    <p className="text-sm text-purple-800 dark:text-purple-200">
                      <strong>What happens:</strong>
                    </p>
                    <ul className="text-sm text-purple-700 dark:text-purple-300 mt-2 space-y-1">
                      <li>• Employee type changes from "Staff" to "Officer"</li>
                      <li>• A new personal number will be assigned</li>
                      <li>• Patient ID will update (E-old# → E-new#)</li>
                      <li>• Linked dependents keep the same records; their patient IDs update to match the new personal number</li>
                      {(patientToPromote.dependentsCount ?? 0) > 0 && (
                        <li>
                          • {patientToPromote.dependentsCount} linked dependent
                          {patientToPromote.dependentsCount === 1 ? '' : 's'} will have patient IDs updated
                        </li>
                      )}
                      <li>• All existing medical records and history are preserved</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-personal-number">New Personal Number</Label>
                    <Input
                      id="new-personal-number"
                      placeholder="Enter new personal number (e.g. B1234)"
                      value={newPersonalNumber}
                      onChange={(e) => setNewPersonalNumber(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsPromoteOpen(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handlePromote}
                disabled={promotingOfficer || !newPersonalNumber.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {promotingOfficer ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Promoting...
                  </>
                ) : (
                  <>
                    <Activity className="h-4 w-4 mr-2" />
                    Promote to Officer
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Convert to CSR Dialog */}
        <AlertDialog open={isCsrConversionOpen} onOpenChange={setIsCsrConversionOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-500" />
                Convert to CSR
              </AlertDialogTitle>
              <AlertDialogDescription>
                {patientToConvertCsr
                  ? `Convert ${patientToConvertCsr.name} from Retiree to CSR (Non-NPA)?`
                  : 'Convert this patient to CSR?'}
              </AlertDialogDescription>
              {patientToConvertCsr && (
                <div className="space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>What happens:</strong>
                    </p>
                    <ul className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1">
                      <li>• Patient category changes from "Retiree" to "NonNPA (CSR)"</li>
                      <li>• Patient ID will be updated (R-XXX → NN-CSR-XX format)</li>
                      <li>• Personal number, employee type, division, and location will be cleared</li>
                      <li>• All existing medical records and history are preserved</li>
                      <li>• Linked dependents will also be converted to CSR</li>
                    </ul>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This is useful for retirees who are no longer eligible for retiree benefits but still need care.
                  </p>
                </div>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsCsrConversionOpen(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCsrConversion}
                disabled={convertingToCsr}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {convertingToCsr ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Convert to CSR
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-500" />
                Delete Patient
              </AlertDialogTitle>
              <AlertDialogDescription>
                {patientToDelete
                  ? `Are you sure you want to delete ${patientToDelete.name} (${patientToDelete.id})? This performs a soft delete and will remove the patient from active lists.`
                  : 'Are you sure you want to delete this patient?'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)} disabled={deletingPatient}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePatient}
                disabled={deletingPatient}
                className="bg-red-600 hover:bg-red-700"
              >
                {deletingPatient ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Merge patient dialog — admin only */}
        <MergePatientDialog
          open={isMergeDialogOpen}
          onOpenChange={setIsMergeDialogOpen}
          loser={patientToMerge}
          onSuccess={onMergeSuccess}
        />
      </div>
    </DashboardLayout>
  );
}

export default function PatientsListPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="container mx-auto p-6 flex flex-col items-center justify-center gap-2 min-h-[40vh]">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading patients…</p>
          </div>
        </DashboardLayout>
      }
    >
      <PatientsListPageContent />
    </Suspense>
  );
}
