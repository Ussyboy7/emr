"use client";
import { formatDisplayDate, formatDisplayTime, toApiDateFromInstant } from "@/lib/dates";

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { patientService, type Patient as ApiPatient } from '@/lib/services';
import { resolvePatientNumericId, resolvePatientRecord } from '@/lib/utils/patient-id';
import {
  PATIENT_TITLE_OPTIONS,
  normalizePatientTitleValue,
  MARITAL_STATUSES,
  RELIGIONS,
  NIGERIAN_TRIBES,
  NOK_RELATIONSHIPS,
  NPA_DIVISIONS,
  NON_NPA_TYPES,
  DEPENDENT_TYPES,
  NIGERIA_STATES_AND_LGAS,
} from '@/lib/constants/patient';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { useCurrentUser } from '@/hooks/use-current-user';
import { canManagePatientLifecycle, isSystemAdminUser } from '@/lib/patient-permissions';
import { medicalHistoryFormFromRecord } from '@/lib/clinical-overview-utils';
import { 
  Search, Filter, Users, Phone, Eye, 
  UserPlus, Calendar, FileText, Edit, X, Loader2,
  Activity, UserCheck, AlertTriangle, Camera, Upload, Trash2, Plus,
  GitMerge
} from 'lucide-react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { PatientOverviewModal } from '@/components/shared/PatientOverviewModal';
import { PrincipalDependentsModal } from '@/components/shared/PrincipalDependentsModal';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { useWorkLocationOptions } from '@/hooks/use-work-location-options';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { AdvancedFiltersButton } from '@/components/shared/AdvancedFiltersButton';
import { MergePatientDialog } from './merge-patient-dialog';
import { getMediaUrl } from '@/lib/media-url';

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
  photoUrl: string;
  registeredAt: string;
  primaryPatient?: string;
  relationship?: string;
  nonNpaType?: string;
  /** Active dependents for employee/retiree principals (from API count). */
  dependentsCount?: number;
};

const photoUrlFromPath = (photoPath: string | null | undefined): string =>
  getMediaUrl(photoPath) ?? '';

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
  const categoryMap: Record<string, string> = {
    'employee': 'Employee',
    'retiree': 'Retiree',
    'dependent': 'Dependent',
    'nonnpa': 'NonNPA',
  };
  
  // Use patient_id if available, otherwise fallback to numeric ID as string
  // patient_id should always be generated by backend, but handle edge cases
  const patientId = apiPatient.patient_id || String(apiPatient.id);
  
  return {
    id: patientId,
    numericId: apiPatient.id,
    name: apiPatient.full_name ?? '',
    category: categoryMap[apiPatient.category] || apiPatient.category,
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
    photoUrl: photoUrlFromPath(apiPatient.photo),
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
  const { locations: locationOptions } = useWorkLocationOptions();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  
  // Handle authentication redirects
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  const isAdminUser = useMemo(() => isSystemAdminUser(currentUser), [currentUser]);
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
    defaultTab: 'list' | 'add';
  } | null>(null);

  const principalIdFromUrl = useMemo(() => {
    const raw = searchParams.get('principal');
    if (raw && /^\d+$/.test(raw.trim())) return Number(raw.trim());
    return null;
  }, [searchParams]);

  // Client-side: only filter by age (search, category, gender, location are applied by the API)
  const filteredPatients = useMemo(() => {
    if (!ageRange.min && !ageRange.max) return patients;
    return patients.filter(p => 
      (!ageRange.min || p.age >= parseInt(ageRange.min, 10)) && 
      (!ageRange.max || p.age <= parseInt(ageRange.max, 10))
    );
  }, [patients, ageRange.min, ageRange.max]);

  // Use filtered patients directly (server-side pagination when no client-side filters)
  const paginatedPatients = filteredPatients;

  // Load counts on mount (global stats, not filtered)
  useEffect(() => {
    patientService.getPatientCounts().then(setCounts).catch(() => setCounts(null));
  }, []);

  // Deep links: ?category=employee|retiree|dependent|nonnpa
  useEffect(() => {
    const cat = (searchParams.get('category') || '').toLowerCase();
    if (['employee', 'retiree', 'dependent', 'nonnpa'].includes(cat)) {
      setCategoryFilter(cat);
    }
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
      .catch(() => {
        if (!cancelled) setPrincipalBannerName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [principalIdFromUrl]);

  // When filtering by principal, list is dependents only
  useEffect(() => {
    if (principalIdFromUrl != null) setCategoryFilter('dependent');
  }, [principalIdFromUrl]);

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms delay

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Load patients from API when page, page size, or server-side filters change
  useEffect(() => {
    loadPatients();
  }, [currentPage, itemsPerPage, debouncedSearchQuery, genderFilter, categoryFilter, locationFilter, principalIdFromUrl]);

  // Reset to page 1 when filters or items per page change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, genderFilter, categoryFilter, locationFilter, ageRange, itemsPerPage, principalIdFromUrl]);

  const loadPatients = async () => {
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
      setAuthError(null); // Clear any previous auth errors
    } catch (err: any) {
      // Handle authentication errors separately
      if (isAuthenticationError(err)) {
        setAuthError(err);
        setError('Authentication required. Redirecting to login...');
        // Don't show toast for auth errors as we're redirecting
        return;
      }
      
      setError(err.message || 'Failed to load patients');
      toast.error('Failed to load patients. Please try again.');
      console.error('Error loading patients:', err);
      setAuthError(null);
    } finally {
      setLoading(false);
    }
  };

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

      toast.success(`Patient ${patientToConvert.name} has been converted to retiree status`);

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
      await patientService.promoteToOfficer(numericId, newPersonalNumber.trim());
      toast.success(`${patientToPromote.name} has been promoted to Officer (PN: ${newPersonalNumber.trim()})`);
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
        setPhotoPreview(photoUrlFromPath(apiPatient.photo));
      } else {
        setPhotoPreview(null);
      }
      setPhotoFile(null);
      
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
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo must be less than 5MB');
      return;
    }
    
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
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

      // Send personal_number: always for admin users, otherwise only for Employee/Retiree.
      if (isAdminUser || (cat !== 'Dependent' && cat !== 'NonNPA')) {
        updateData.personal_number = editForm.personalNumber.trim();
      }

      // Handle photo upload if a new photo was selected
      if (photoFile) {
        // Get valid access token using the same method as apiFetch
        const { getStoredAccessToken, getStoredRefreshToken, storeTokens } = await import('@/lib/api-client');
        let token = getStoredAccessToken();
        
        // If token is expired or missing, try to refresh it
        if (!token) {
          // Try to get refresh token and refresh
          const refreshToken = getStoredRefreshToken();
          if (refreshToken) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            if (!apiUrl) return;
            const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
            const refreshResponse = await fetch(`${baseUrl}/accounts/auth/token/refresh/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh: refreshToken }),
            });
            
            if (refreshResponse.ok) {
              const data = await refreshResponse.json();
              token = data.access;
              storeTokens(data.access, data.refresh ?? refreshToken, data.expires_in);
            }
          }
        }

        if (!token) {
          throw new Error('Authentication required. Please log in again.');
        }

        const formData = new FormData();
        // Add all update data to FormData for multipart/form-data request
        Object.keys(updateData).forEach(key => {
          const value = updateData[key as keyof typeof updateData];
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });
        formData.append('photo', photoFile);
        
        // Update patient with photo via FormData
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          if (!apiUrl) return;
          const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
          const photoUrl = `${baseUrl}/patients/${numericId}/`;
          
          const response = await fetch(photoUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              // Don't set Content-Type - browser will set it with boundary for FormData
            },
            body: formData,
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.photo?.[0] || errorData.detail || 'Failed to update patient with photo');
          }
        } catch (photoError: any) {
          console.warn('Photo upload failed, trying without photo:', photoError);
          // Fallback to regular update without photo
          await patientService.updatePatient(numericId, updateData);
        }
      } else {
        // Update without photo
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

  const getCategoryBadge = (category: string) => {
    const styles: Record<string, string> = {
      'Employee': 'border-teal-500/50 text-teal-600 dark:text-teal-400',
      'Retiree': 'border-amber-500/50 text-amber-600 dark:text-amber-400',
      'Dependent': 'border-violet-500/50 text-violet-600 dark:text-violet-400',
      'NonNPA': 'border-blue-500/50 text-blue-600 dark:text-blue-400',
    };
    return styles[category] || 'border-muted-foreground/50 text-muted-foreground';
  };

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
                {(ageRange.min || ageRange.max)
                  ? `Showing ${filteredPatients.length} patients on this page`
                  : totalCount > 0
                    ? `Showing ${Math.min((currentPage - 1) * itemsPerPage + 1, totalCount)}–${Math.min(currentPage * itemsPerPage, totalCount)} of ${totalCount} patients`
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
              ) : paginatedPatients.length > 0 ? (
                paginatedPatients.map((patient) => (
                  <Card key={patient.id} className={`border-l-4 ${
                    patient.category === 'Employee' ? 'border-l-teal-500' :
                    patient.category === 'Retiree' ? 'border-l-amber-500' :
                    patient.category === 'Dependent' ? 'border-l-violet-500' :
                    'border-l-blue-500'
                  } hover:shadow-md transition-shadow`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <PatientAvatar name={patient.name} photoUrl={patient.photoUrl} size="md" />
                        
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
                              {isAdminUser && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => openDeletePatient(patient)}
                                  title="Delete Patient"
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                                </Button>
                              )}
                              {isAdminUser && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => openMergeDialog(patient)}
                                  title="Merge with another patient (admin)"
                                >
                                  <GitMerge className="h-4 w-4 text-muted-foreground hover:text-amber-500" />
                                </Button>
                              )}
                              {patient.category === 'Employee' && (
                                <>
                                  {canManagePatientLifecycleActions && (
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openRetireeConversion(patient)} title="Convert to Retiree">
                                      <UserCheck className="h-4 w-4 text-muted-foreground hover:text-orange-500" />
                                    </Button>
                                  )}
                                  {canManagePatientLifecycleActions && patient.employeeType === 'Staff' && (
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openPromoteDialog(patient)} title="Promote to Officer">
                                      <Activity className="h-4 w-4 text-muted-foreground hover:text-purple-500" />
                                    </Button>
                                  )}
                                </>
                              )}
                              {canManagePatientLifecycleActions && patient.category === 'Retiree' && (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openCsrConversion(patient)} title="Convert to CSR">
                                  <UserPlus className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => router.push(`/medical-records/visits/new?patient=${patient.id}`)} title="Create Visit">
                                <Calendar className="h-4 w-4 text-muted-foreground hover:text-teal-500" />
                              </Button>
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
                                    defaultTab: 'list',
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
            {filteredPatients.length > 0 && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={ageRange.min || ageRange.max ? filteredPatients.length : totalCount}
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
          defaultTab={principalDepsOpen?.defaultTab ?? 'list'}
          onAfterChange={() => void loadPatients()}
          onEditDependent={async (api) => {
            setPrincipalDepsOpen(null);
            await openEditModal(transformPatient(api));
          }}
        />

        {/* Edit Patient Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-500" />
                Edit Patient
              </DialogTitle>
              <DialogDescription>Update patient registration information</DialogDescription>
            </DialogHeader>
            {selectedPatient && (
              <div className="space-y-4 py-4" key={`edit-${selectedPatient.id}`}>
                {editFormLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-3 text-muted-foreground">Loading patient data...</span>
                  </div>
                ) : (
                  <>
                    {/* Patient ID (Read-only) */}
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Patient ID (Cannot be changed)</p>
                      <p className="font-medium">{selectedPatient.id}</p>
                    </div>

                    {/* Photo Upload */}
                    <div className="space-y-2">
                      <Label>Patient Photo</Label>
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

                    {/* Personal Information — same core fields as Register Patient */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Personal Information</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Gender *</Label>
                          <Select
                            value={editForm.gender}
                            onValueChange={(v) => setEditForm((prev) => ({ ...prev, gender: v as "male" | "female" }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {((selectedPatient.category !== "NonNPA" && selectedPatient.category !== "Dependent") || isAdminUser) && (
                            <div className="space-y-2">
                              <Label>Personal number {selectedPatient.category !== "NonNPA" && selectedPatient.category !== "Dependent" ? '*' : ''}</Label>
                              <Input
                                value={editForm.personalNumber}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, personalNumber: e.target.value }))}
                                placeholder="e.g. A2962 (NPA personal number)"
                              />
                            </div>
                          )}
                        {selectedPatient.category === "Dependent" && (
                          <>
                            <div className="space-y-2">
                              <Label>Dependent Type</Label>
                              <Select value={editForm.dependentType || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, dependentType: v === 'not-specified' ? '' : v }))}>
                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not-specified">Unspecified</SelectItem>
                                  {DEPENDENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Principal personal number</Label>
                              <Input
                                value={editPrincipalInfo?.personalNumber || ""}
                                readOnly
                                className="bg-muted"
                                placeholder=""
                              />
                              <p className="text-xs text-muted-foreground">
                                {editPrincipalInfo?.fullName
                                  ? `Linked to ${editPrincipalInfo.fullName}. Dependent IDs (ED-/RD-) follow the principal; changing the link is not supported in this form—register a new dependent under the correct principal if needed.`
                                  : "Principal record not loaded or not linked."}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label>Title</Label>
                          <Select value={editForm.title || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, title: v === 'none' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {PATIENT_TITLE_OPTIONS.map(({ value, label }) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
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
                          <Input type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm(prev => ({ ...prev, dateOfBirth: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Marital Status</Label>
                          <Select value={editForm.maritalStatus || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, maritalStatus: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Unspecified</SelectItem>
                              {MARITAL_STATUSES.map(status => <SelectItem key={status} value={status.toLowerCase()}>{status}</SelectItem>)}
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
                              <SelectItem value="not-specified">Unspecified</SelectItem>
                              {RELIGIONS.map(religion => <SelectItem key={religion} value={religion}>{religion}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Tribe</Label>
                          <Select value={editForm.tribe || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, tribe: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Unspecified</SelectItem>
                              {NIGERIAN_TRIBES.map(tribe => <SelectItem key={tribe} value={tribe}>{tribe}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Occupation</Label>
                          <Input
                            value={editForm.occupation}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, occupation: e.target.value }))}
                            placeholder="e.g. Senior Engineer - NPA"
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
                          <Select value={editForm.lga || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, lga: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select LGA" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Unspecified</SelectItem>
                              {NIGERIA_STATES_AND_LGAS
                                .find(s => s.name === (editForm.stateOfOrigin || editForm.stateOfResidence))
                                ?.lgas.map(lga => <SelectItem key={lga} value={lga}>{lga}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>State of Residence</Label>
                          <Select value={editForm.stateOfResidence || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, stateOfResidence: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Unspecified</SelectItem>
                              {NIGERIA_STATES_AND_LGAS.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>State of Origin</Label>
                          <Select value={editForm.stateOfOrigin || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, stateOfOrigin: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Unspecified</SelectItem>
                              {NIGERIA_STATES_AND_LGAS.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Medical Information */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Medical Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Blood Group</Label>
                          <Select value={editForm.bloodGroup || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, bloodGroup: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Unspecified</SelectItem>
                              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Genotype</Label>
                          <Select value={editForm.genotype || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, genotype: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Unspecified</SelectItem>
                              {['AA', 'AS', 'SS', 'AC', 'SC'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Medical History */}
                    <div className="space-y-6">
                      <h3 className="text-sm font-semibold text-foreground">Medical History</h3>
                      
                      {/* Allergies */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Allergies</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newAllergy = prompt('Enter allergy name:');
                              if (newAllergy && newAllergy.trim()) {
                                setMedicalHistory(prev => ({
                                  ...prev,
                                  allergies: [...prev.allergies, newAllergy.trim()],
                                }));
                              }
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Allergy
                          </Button>
                        </div>
                        {medicalHistory.allergies.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No allergies recorded</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {medicalHistory.allergies.map((allergy, index) => (
                              <Badge key={index} className="bg-red-600 text-white hover:bg-red-700 pr-1">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {allergy}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setMedicalHistory(prev => ({
                                      ...prev,
                                      allergies: prev.allergies.filter((_, i) => i !== index),
                                    }));
                                  }}
                                  className="h-4 w-4 p-0 ml-1 hover:bg-red-800"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Chronic Conditions */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Chronic Conditions</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMedicalHistory(prev => ({
                                ...prev,
                                diagnoses: [...prev.diagnoses, { name: '', code: '', status: 'Active', diagnosedDate: '' }],
                              }));
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Condition
                          </Button>
                        </div>
                        {medicalHistory.diagnoses.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No chronic conditions recorded</p>
                        ) : (
                          <div className="space-y-2">
                            {medicalHistory.diagnoses.map((diagnosis, index) => (
                              <div key={index} className="p-3 border rounded-lg space-y-2">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium text-muted-foreground">Condition #{index + 1}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setMedicalHistory(prev => ({
                                        ...prev,
                                        diagnoses: prev.diagnoses.filter((_, i) => i !== index),
                                      }));
                                    }}
                                    className="h-6 w-6 p-0"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">ICD-10 Code</Label>
                                    <Input
                                      value={diagnosis.code || ''}
                                      onChange={(e) => {
                                        const updated = [...medicalHistory.diagnoses];
                                        updated[index].code = e.target.value;
                                        setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                                      }}
                                      placeholder="e.g., I10"
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Status</Label>
                                    <Select
                                      value={diagnosis.status}
                                      onValueChange={(value) => {
                                        const updated = [...medicalHistory.diagnoses];
                                        updated[index].status = value;
                                        setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                                      }}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Active">Active</SelectItem>
                                        <SelectItem value="Resolved">Resolved</SelectItem>
                                        <SelectItem value="Controlled">Controlled</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Condition Name</Label>
                                  <Input
                                    value={diagnosis.name}
                                    onChange={(e) => {
                                      const updated = [...medicalHistory.diagnoses];
                                      updated[index].name = e.target.value;
                                      setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                                    }}
                                    placeholder="e.g., Essential Hypertension"
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Diagnosed Date</Label>
                                  <Input
                                    type="date"
                                    value={diagnosis.diagnosedDate || ''}
                                    onChange={(e) => {
                                      const updated = [...medicalHistory.diagnoses];
                                      updated[index].diagnosedDate = e.target.value;
                                      setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                                    }}
                                    className="h-8 text-xs"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Surgical History */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Surgical History</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMedicalHistory(prev => ({
                                ...prev,
                                surgicalHistory: [...prev.surgicalHistory, { procedure: '', date: '', hospital: '' }],
                              }));
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Surgery
                          </Button>
                        </div>
                        {medicalHistory.surgicalHistory.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No surgical history recorded</p>
                        ) : (
                          <div className="space-y-2">
                            {medicalHistory.surgicalHistory.map((surgery, index) => (
                              <div key={index} className="p-3 border rounded-lg space-y-2">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium text-muted-foreground">Surgery #{index + 1}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setMedicalHistory(prev => ({
                                        ...prev,
                                        surgicalHistory: prev.surgicalHistory.filter((_, i) => i !== index),
                                      }));
                                    }}
                                    className="h-6 w-6 p-0"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Procedure</Label>
                                    <Input
                                      value={surgery.procedure}
                                      onChange={(e) => {
                                        const updated = [...medicalHistory.surgicalHistory];
                                        updated[index].procedure = e.target.value;
                                        setMedicalHistory(prev => ({ ...prev, surgicalHistory: updated }));
                                      }}
                                      placeholder="e.g., Appendectomy"
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Date</Label>
                                    <Input
                                      type="date"
                                      value={surgery.date}
                                      onChange={(e) => {
                                        const updated = [...medicalHistory.surgicalHistory];
                                        updated[index].date = e.target.value;
                                        setMedicalHistory(prev => ({ ...prev, surgicalHistory: updated }));
                                      }}
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Hospital</Label>
                                    <Input
                                      value={surgery.hospital}
                                      onChange={(e) => {
                                        const updated = [...medicalHistory.surgicalHistory];
                                        updated[index].hospital = e.target.value;
                                        setMedicalHistory(prev => ({ ...prev, surgicalHistory: updated }));
                                      }}
                                      placeholder="Hospital name"
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Family History */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Family History</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMedicalHistory(prev => ({
                                ...prev,
                                familyHistory: [...prev.familyHistory, { relation: '', condition: '' }],
                              }));
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Family Member
                          </Button>
                        </div>
                        {medicalHistory.familyHistory.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No family history recorded</p>
                        ) : (
                          <div className="space-y-2">
                            {medicalHistory.familyHistory.map((family, index) => (
                              <div key={index} className="p-3 border rounded-lg space-y-2">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium text-muted-foreground">Family Member #{index + 1}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setMedicalHistory(prev => ({
                                        ...prev,
                                        familyHistory: prev.familyHistory.filter((_, i) => i !== index),
                                      }));
                                    }}
                                    className="h-6 w-6 p-0"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Relation</Label>
                                    <Select
                                      value={family.relation}
                                      onValueChange={(value) => {
                                        const updated = [...medicalHistory.familyHistory];
                                        updated[index].relation = value;
                                        setMedicalHistory(prev => ({ ...prev, familyHistory: updated }));
                                      }}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Select relation" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Father">Father</SelectItem>
                                        <SelectItem value="Mother">Mother</SelectItem>
                                        <SelectItem value="Sibling">Sibling</SelectItem>
                                        <SelectItem value="Grandfather">Grandfather</SelectItem>
                                        <SelectItem value="Grandmother">Grandmother</SelectItem>
                                        <SelectItem value="Uncle">Uncle</SelectItem>
                                        <SelectItem value="Aunt">Aunt</SelectItem>
                                        <SelectItem value="Other">Other</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Condition</Label>
                                    <Input
                                      value={family.condition}
                                      onChange={(e) => {
                                        const updated = [...medicalHistory.familyHistory];
                                        updated[index].condition = e.target.value;
                                        setMedicalHistory(prev => ({ ...prev, familyHistory: updated }));
                                      }}
                                      placeholder="e.g., Hypertension, Type 2 Diabetes"
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Social History */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Social History</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs">Smoking</Label>
                            <Select
                              value={medicalHistory.socialHistory.smoking}
                              onValueChange={(value) => {
                                setMedicalHistory(prev => ({
                                  ...prev,
                                  socialHistory: { ...prev.socialHistory, smoking: value },
                                }));
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Never">Never</SelectItem>
                                <SelectItem value="Former">Former</SelectItem>
                                <SelectItem value="Current">Current</SelectItem>
                                <SelectItem value="Occasional">Occasional</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Alcohol</Label>
                            <Select
                              value={medicalHistory.socialHistory.alcohol}
                              onValueChange={(value) => {
                                setMedicalHistory(prev => ({
                                  ...prev,
                                  socialHistory: { ...prev.socialHistory, alcohol: value },
                                }));
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Never">Never</SelectItem>
                                <SelectItem value="Occasional">Occasional (social)</SelectItem>
                                <SelectItem value="Regular">Regular</SelectItem>
                                <SelectItem value="Heavy">Heavy</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs">Exercise</Label>
                            <Input
                              value={medicalHistory.socialHistory.exercise}
                              onChange={(e) => {
                                setMedicalHistory(prev => ({
                                  ...prev,
                                  socialHistory: { ...prev.socialHistory, exercise: e.target.value },
                                }));
                              }}
                              placeholder="e.g., 2-3 times per week"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Occupation is set under Personal Information above (same as registration).
                        </p>
                      </div>
                    </div>

                    {/* Work Info — same as registration (employee only, not retiree) */}
                    {selectedPatient.category === 'Employee' && (
                      <>
                        <Separator />
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-foreground">Work Information</h3>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Employee Type</Label>
                              <Select value={editForm.employeeType || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, employeeType: v === 'not-specified' ? '' : v }))}>
                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not-specified">Unspecified</SelectItem>
                                  <SelectItem value="Officer">Officer</SelectItem>
                                  <SelectItem value="Staff">Staff</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Division</Label>
                              <Select value={editForm.division || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, division: v === 'not-specified' ? '' : v }))}>
                                <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not-specified">Unspecified</SelectItem>
                                  {NPA_DIVISIONS.map(div => <SelectItem key={div} value={div}>{div}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Location</Label>
                              <Select value={editForm.location || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, location: v === 'not-specified' ? '' : v }))}>
                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not-specified">Unspecified</SelectItem>
                                  {locationOptions.filter((l) => l.value !== "all").map((l) => (
                                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Non-NPA: type + location */}
                    {selectedPatient.category === 'NonNPA' && (
                      <>
                        <Separator />
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-foreground">Non-NPA Details</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Type</Label>
                              <Select value={editForm.nonnpaType || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, nonnpaType: v === 'not-specified' ? '' : v }))}>
                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not-specified">Unspecified</SelectItem>
                                  {NON_NPA_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Location</Label>
                              <Select value={editForm.location || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, location: v === 'not-specified' ? '' : v }))}>
                                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not-specified">Unspecified</SelectItem>
                                  {locationOptions.filter((l) => l.value !== "all").map((l) => (
                                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <Separator />

                    {/* Next of Kin */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Next of Kin</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Surname</Label>
                          <Input value={editForm.nokSurname} onChange={(e) => setEditForm(prev => ({ ...prev, nokSurname: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>First Name</Label>
                          <Input value={editForm.nokFirstName} onChange={(e) => setEditForm(prev => ({ ...prev, nokFirstName: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Middle Name</Label>
                          <Input value={editForm.nokMiddleName} onChange={(e) => setEditForm(prev => ({ ...prev, nokMiddleName: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Relationship</Label>
                          <Select value={editForm.nokRelationship || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, nokRelationship: v === 'not-specified' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not-specified">Unspecified</SelectItem>
                              {NOK_RELATIONSHIPS.map(rel => <SelectItem key={rel} value={rel}>{rel}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={editForm.nokPhone} onChange={(e) => setEditForm(prev => ({ ...prev, nokPhone: e.target.value }))} placeholder="+234..." />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Address</Label>
                        <Input value={editForm.nokAddress} onChange={(e) => setEditForm(prev => ({ ...prev, nokAddress: e.target.value }))} placeholder="Next of kin address" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={isSubmitting || editFormLoading}>
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Edit className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                      <li>• All existing medical records and history are preserved</li>
                      <li>• Employee dependents become retiree dependents</li>
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
