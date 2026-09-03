"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { patientService } from '@/lib/services/patient-service';
import { validatePatientPhotoFile } from '@/lib/patient-photo';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { 
  UserPlus, User, Phone, Heart, Users, Send, ArrowLeft, ArrowRight, 
  Briefcase, MapPin, Upload, Camera, FileText, Save, Trash2, 
  CheckCircle2, Clock, Loader2, Plus, X, AlertTriangle, Search
} from 'lucide-react';
import { useWorkLocationOptions } from '@/hooks/use-work-location-options';
import {
  NPA_DIVISIONS,
  NON_NPA_TYPES,
  EMPLOYEE_TYPES,
  DEPENDENT_TYPES,
  PATIENT_TITLE_OPTIONS,
  normalizePatientTitleValue,
  patientTitleLabel,
  RELIGIONS,
  NIGERIAN_TRIBES,
  MARITAL_STATUSES,
  NOK_RELATIONSHIPS,
  NIGERIA_STATES_AND_LGAS
} from '@/lib/constants/patient';
import { useMedicalRecordsPageAuth } from '@/hooks/use-medical-records-page-auth';





type FormStep = 'personal' | 'work' | 'contact' | 'medical';

const STEPS: { id: FormStep; label: string; icon: React.ReactNode }[] = [
  { id: 'personal', label: 'Personal', icon: <User className="h-4 w-4" /> },
  { id: 'work', label: 'Work Info', icon: <Briefcase className="h-4 w-4" /> },
  { id: 'contact', label: 'Contact', icon: <Phone className="h-4 w-4" /> },
  { id: 'medical', label: 'Medical & NOK', icon: <Heart className="h-4 w-4" /> },
];

export default function NewPatientPage() {
  const router = useRouter();
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const searchParams = useSearchParams();
  const { locations: locationOptions } = useWorkLocationOptions();
  const [patientCategory, setPatientCategory] = useState<'employee' | 'retiree' | 'nonnpa' | 'dependent'>('employee');
  const [currentStep, setCurrentStep] = useState<FormStep>('personal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [showCategorySwitchDialog, setShowCategorySwitchDialog] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<'employee' | 'retiree' | 'nonnpa' | 'dependent' | null>(null);

  // Principal personal number validation (employee/retiree P.N.)
  const [principalValidation, setPrincipalValidation] = useState<{
    isValidating: boolean;
    isValid: boolean | null;
    message: string;
    patient?: any;
  }>({ isValidating: false, isValid: null, message: '' });

  // Track if NOK auto-population has occurred to prevent it being overwritten
  const [nokAutoPopulated, setNokAutoPopulated] = useState(false);
  const [allergyDraft, setAllergyDraft] = useState('');
  const [recordsNote, setRecordsNote] = useState('');

  const [formData, setFormData] = useState({
    // Personal Details
    personalNumber: '', title: '', surname: '', firstName: '', middleName: '',
    gender: '', dateOfBirth: '', maritalStatus: '', religion: '', tribe: '', occupation: '',
    isFirstTimePatient: false,
    // Work Information (Employee/Retiree)
    employeeType: '', division: '', location: '',
    // NonNPA Information
    nonNPAType: '',
    // Dependent Information
    dependentType: '', principalStaffId: '',
    // Contact Information
    email: '', phone: '', stateOfResidence: '', residentialAddress: '', 
    stateOfOrigin: '', lga: '', permanentAddress: '',
    // Medical Details
    bloodGroup: '', genotype: '',
    // Next of Kin
    nokSurname: '', nokFirstName: '', nokMiddleName: '', nokRelationship: '', nokAddress: '', nokPhone: '',
  });
  
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

  // Clear work fields when switching to retiree
  useEffect(() => {
    if (patientCategory === 'retiree') {
      setFormData(prev => ({ ...prev, employeeType: '', division: '', location: '' }));
    }
  }, [patientCategory]);

  useEffect(() => {
    if (!ready) return;
    const prefilledCategory = searchParams.get('category');
    const principalPk = searchParams.get('principal');
    const principalStaffId = searchParams.get('principal_staff_id');
    const dependentType = searchParams.get('dependent_type');

    if (prefilledCategory === 'dependent') {
      setPatientCategory('dependent');
    }

    if (dependentType) {
      setFormData((prev) => ({
        ...prev,
        dependentType: dependentType.trim() || prev.dependentType,
      }));
    }

    const resolvePrincipalByNumericId = async (pk: string) => {
      if (!/^\d+$/.test(pk.trim())) return;
      try {
        const p = await patientService.getPatient(Number(pk.trim()));
        if (p.category !== 'employee' && p.category !== 'retiree') return;
        const pn = (p.personal_number || '').trim();
        setFormData((prev) => ({
          ...prev,
          principalStaffId: pn || prev.principalStaffId,
          dependentType:
            p.category === 'retiree' ? 'Retiree Dependent' : 'Employee Dependent',
        }));
        setPrincipalValidation({
          isValidating: false,
          isValid: true,
          message: `Linked principal: ${p.full_name ?? ''} (${p.category})`,
          patient: p,
        });
        setNokAutoPopulated(false);
      } catch {
        /* ignore */
      }
    };

    if (principalPk?.trim()) {
      void resolvePrincipalByNumericId(principalPk);
    } else if (principalStaffId?.trim()) {
      setFormData((prev) => ({
        ...prev,
        principalStaffId: principalStaffId.trim() || prev.principalStaffId,
      }));
    }
  }, [ready, searchParams]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };

      if (field === 'stateOfOrigin') {
        next.lga = '';
      }

      // If principal personal number is being changed, reset auto-population
      if (field === 'principalStaffId') {
        if (!value || value !== prev.principalStaffId) {
          setNokAutoPopulated(false);
          setPrincipalValidation({ isValidating: false, isValid: null, message: '' });
          // Clear NOK fields if principal is being cleared
          if (!value) {
            next.nokSurname = '';
            next.nokFirstName = '';
            next.nokMiddleName = '';
            next.nokRelationship = '';
            next.nokPhone = '';
            next.nokAddress = '';
          }
        }
      }

      // Convenience: infer gender from title when possible
      if (field === 'title') {
        const normalized = (value || '').toLowerCase().trim();
        const inferredGender =
          normalized === 'mr' || normalized === 'master' || normalized === 'alhaji' || normalized === 'mallam'
            ? 'male'
            : normalized === 'mrs' || normalized === 'ms' || normalized === 'miss' || normalized === 'hajia' || normalized === 'lady'
              ? 'female'
              : '';

        if (inferredGender) {
          next.gender = inferredGender;
        }
      }

      return next;
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validationError = validatePatientPhotoFile(file);
      if (validationError) {
        toast.error(validationError);
        e.target.value = '';
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const calculateAge = useMemo(() => {
    if (!formData.dateOfBirth) return '';
    const today = new Date();
    const birthDate = new Date(formData.dateOfBirth);

    if (Number.isNaN(birthDate.getTime()) || birthDate > today) {
      return '';
    }

    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();

    if (today.getDate() < birthDate.getDate()) {
      months -= 1;
    }

    if (months < 0) {
      years -= 1;
      months += 12;
    }

    if (years <= 0) {
      return `${months} month${months === 1 ? '' : 's'}`;
    }

    if (months <= 0) {
      return `${years} year${years === 1 ? '' : 's'}`;
    }

    return `${years} year${years === 1 ? '' : 's'} ${months} month${months === 1 ? '' : 's'}`;
  }, [formData.dateOfBirth]);

  const availableLGAs = NIGERIA_STATES_AND_LGAS.find(s => s.name === formData.stateOfOrigin)?.lgas || [];
  const showWorkInfo = patientCategory === 'employee' || patientCategory === 'retiree';
  const showEmployeeWorkFields = patientCategory === 'employee'; // Only employees need Type, Division, Location
  const showNonNPAType = patientCategory === 'nonnpa';
  const showDependentType = patientCategory === 'dependent';

  // Calculate form completion percentage
  const completionPercentage = useMemo(() => {
    let completed = 0;
    let total = 0;

    // Required personal fields
    total += 4; // surname, firstName, gender, dateOfBirth
    if (formData.surname) completed++;
    if (formData.firstName) completed++;
    if (formData.gender) completed++;
    if (formData.dateOfBirth) completed++;

    // Work info (only for employees - retirees don't need these fields)
    if (showEmployeeWorkFields) {
      total += 3; // employeeType, division, location
      if (formData.employeeType) completed++;
      if (formData.division) completed++;
      if (formData.location) completed++;
    }

    // Contact info
    total += 1; // phone
    if (formData.phone) completed++;

    // Photo
    total += 1;
    if (photoPreview) completed++;

    return Math.round((completed / total) * 100);
  }, [formData, showEmployeeWorkFields, photoPreview]);

  // Validation functions
  const validateEmail = (email: string): boolean => {
    if (!email) return true; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    if (!phone) return true; // Phone is optional but should be validated if provided
    // Nigerian phone format: 11 digits starting with 0, or 13 digits starting with +234
    const phoneRegex = /^(\+234|0)[789][01]\d{8}$/;
    const cleaned = phone.replace(/\s|-/g, '');
    return phoneRegex.test(cleaned) || /^0\d{10}$/.test(cleaned);
  };
  
  
  // Validate principal personal number (links to employee/retiree patient)
  const validatePrincipalStaffId = async (staffId: string) => {
    if (!staffId || !staffId.trim()) {
      setPrincipalValidation({ isValidating: false, isValid: null, message: '' });
      return;
    }

    const trimmedId = staffId.trim();
    setPrincipalValidation({ isValidating: true, isValid: null, message: 'Validating...' });

    try {
      // Value must match the principal’s personal_number (e.g. A2962), not patient_id.
      let foundPatient: any = null;
      let numericId: number | null = null;

      const searchResult = await patientService.getPatients({
        search: trimmedId,
        page_size: DEFAULT_LIST_PAGE_SIZE,
      });
      const results = searchResult.results || [];

      const matchPrincipal = (p: any) =>
        p.personal_number === trimmedId;

      // Look for employee or retiree first
      foundPatient = results.find((p: any) => matchPrincipal(p) && (p.category === 'employee' || p.category === 'retiree'));
      if (foundPatient) {
        numericId = foundPatient.id;
      }

      // Fallback: any matching principal
      if (!foundPatient) {
        foundPatient = results.find((p: any) => matchPrincipal(p));
        if (foundPatient) {
          numericId = foundPatient.id;
        }
      }

      // Now get the full patient details using the matched numeric ID
      let patient = null;
      if (numericId) {
        try {
          patient = await patientService.getPatient(numericId);
        } catch (err) {
          if (handleAuthError(err)) return;
          console.error('Failed to get full patient details:', err);
        }
      }

      if (!patient) {
        setPrincipalValidation({
          isValidating: false,
          isValid: false,
          message: `Personal number "${trimmedId}" not found in the system`
        });
        return;
      }

      // Validate that the principal is actually an employee or retiree
      if (patient.category !== 'employee' && patient.category !== 'retiree') {
        setPrincipalValidation({
          isValidating: false,
          isValid: false,
          message: `Personal number "${trimmedId}" belongs to a ${patient.category}, not a staff member or retiree`
        });
        return;
      }

      setPrincipalValidation({
        isValidating: false,
        isValid: true,
        message: `Valid: ${patient.full_name ?? ''} (${patient.category})`,
        patient
      });

      // Keep the field aligned to the principal's personal number once resolved.
      const resolvedPersonalNumber = patient.personal_number?.trim() || '';
      if (resolvedPersonalNumber && resolvedPersonalNumber !== trimmedId) {
        setFormData(prev => ({ ...prev, principalStaffId: resolvedPersonalNumber }));
      }

      // Auto-populate next of kin fields for dependents (only once to prevent overwrites)
      if (patientCategory === 'dependent' && !nokAutoPopulated) {

        setFormData(prev => {
          const updated = {
            ...prev,
            nokSurname: patient.surname || patient.first_name?.split(' ')[1] || prev.nokSurname || '',
            nokFirstName: patient.first_name || patient.surname?.split(' ')[0] || prev.nokFirstName || '',
            nokMiddleName: patient.middle_name || prev.nokMiddleName || '',
            nokRelationship: patient.category === 'employee' ? 'Employee' : 'Retiree',
            nokPhone: patient.phone || prev.nokPhone || '',
            nokAddress: patient.residential_address || prev.nokAddress || '',
          };

          return updated;
        });
        setNokAutoPopulated(true);
      }

    } catch (error) {
      if (handleAuthError(error)) return;
      setPrincipalValidation({
        isValidating: false,
        isValid: false,
        message: 'Could not verify principal. Please try again.',
      });
    }
  };

  const validateName = (name: string): boolean => {
    if (!name) return false;
    // Name should be at least 2 characters and contain only letters, spaces, hyphens, and apostrophes
    const nameRegex = /^[a-zA-Z\s'-]{2,}$/;
    return nameRegex.test(name.trim());
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      // Validate required fields
      if (!formData.surname || !formData.firstName || !formData.gender || !formData.dateOfBirth) {
        toast.error('Please fill in all required fields (Surname, First Name, Gender, Date of Birth)');
        setIsSubmitting(false);
        return;
      }

      // Validate name fields
      if (!validateName(formData.surname)) {
        toast.error('Please enter a valid surname (at least 2 characters, letters only)');
        setIsSubmitting(false);
        return;
      }

      if (!validateName(formData.firstName)) {
        toast.error('Please enter a valid first name (at least 2 characters, letters only)');
        setIsSubmitting(false);
        return;
      }

      if (formData.middleName && !validateName(formData.middleName)) {
        toast.error('Please enter a valid middle name (at least 2 characters, letters only)');
        setIsSubmitting(false);
        return;
      }

      // Validate email if provided
      if (formData.email && !validateEmail(formData.email)) {
        toast.error('Please enter a valid email address');
        setIsSubmitting(false);
        return;
      }

      // Validate personal number for Employee/Retiree
      if ((patientCategory === 'employee' || patientCategory === 'retiree') && !formData.personalNumber) {
        toast.error('Personal number is required for Employee and Retiree patients');
        setIsSubmitting(false);
        return;
      }



      // Validate phone if provided
      if (formData.phone && !validatePhone(formData.phone)) {
        toast.error('Please enter a valid phone number (e.g., 08012345678 or +2348012345678)');
        setIsSubmitting(false);
        return;
      }

      // Validate Next of Kin phone if provided
      if (formData.nokPhone && !validatePhone(formData.nokPhone)) {
        toast.error('Please enter a valid Next of Kin phone number');
        setIsSubmitting(false);
        return;
      }

      // Validate category-specific required fields
      if ((patientCategory === 'employee' || patientCategory === 'retiree') && !formData.personalNumber) {
        toast.error('Personal number is required for Employee and Retiree patients');
        setIsSubmitting(false);
        return;
      }

      if (patientCategory === 'nonnpa' && !formData.nonNPAType) {
        toast.error('Non-NPA type is required');
        setIsSubmitting(false);
        return;
      }

      if (patientCategory === 'dependent' && !formData.principalStaffId) {
        toast.error('Principal personal number is required for dependents');
        setIsSubmitting(false);
        return;
      }

      // Prepare API payload - map frontend field names to backend field names
      const payload: any = {
        category: patientCategory,
        surname: formData.surname.trim(),
        first_name: formData.firstName.trim(),
        middle_name: (formData.middleName || '').trim(),
        gender: formData.gender.toLowerCase(), // Backend expects lowercase: 'male', 'female'
        is_first_time_patient: formData.isFirstTimePatient,
        date_of_birth: formData.dateOfBirth,
        marital_status: (formData.maritalStatus || '').toLowerCase(), // Backend expects lowercase: 'single', 'married', etc.
        religion: (formData.religion || '').trim(),
        tribe: (formData.tribe || '').trim(),
        email: (formData.email || '').trim(),
        phone: (formData.phone || '').trim(),
        state_of_residence: (formData.stateOfResidence || '').trim(),
        residential_address: (formData.residentialAddress || '').trim(),
        state_of_origin: (formData.stateOfOrigin || '').trim(),
        lga: (formData.lga || '').trim(), // Keep as-is (don't lowercase - preserve original format)
        permanent_address: (formData.permanentAddress || '').trim(),
        blood_group: (formData.bloodGroup || '').trim(),
        genotype: (formData.genotype || '').trim(),
        nok_surname: (formData.nokSurname || '').trim(),
        nok_first_name: (formData.nokFirstName || '').trim(),
        nok_middle_name: (formData.nokMiddleName || '').trim(),
        nok_relationship: (formData.nokRelationship || '').trim(), // Free text - capitalize first letter for consistency
        nok_address: (formData.nokAddress || '').trim(),
        nok_phone: (formData.nokPhone || '').trim(),
      };

      // Add occupation for Dependent and Retiree only
      if ((patientCategory === 'dependent' || patientCategory === 'retiree') && formData.occupation) {
        payload.occupation = formData.occupation.trim();
      }

      // Add optional title field (values must match backend Patient.TITLE_CHOICES)
      if (formData.title) {
        const t = normalizePatientTitleValue(formData.title);
        if (t) payload.title = t;
      }

      // Category-specific fields
      if (patientCategory === 'employee' || patientCategory === 'retiree') {
        payload.personal_number = formData.personalNumber.trim();
        if (patientCategory === 'employee' && formData.employeeType) {
          // Employee type is already capitalized in form: 'Officer', 'Staff'
          payload.employee_type = formData.employeeType.trim();
        }
        if (formData.division) payload.division = formData.division.trim();
        if (formData.location) payload.location = formData.location.trim();
      }
      
      if (patientCategory === 'nonnpa') {
        if (formData.nonNPAType) {
          payload.nonnpa_type = formData.nonNPAType.trim(); // Already capitalized in frontend
        }
        if (formData.location) payload.location = formData.location.trim();
      }
      
      if (patientCategory === 'dependent') {
        // Resolve principal via personal_number on an employee or retiree record.
        const principalIdStr = formData.principalStaffId.trim();
        let searchResult;
        try {
          searchResult = await patientService.getPatients({
            search: principalIdStr,
            page_size: DEFAULT_LIST_PAGE_SIZE,
          });
        } catch (err) {
          if (handleAuthError(err)) {
            setIsSubmitting(false);
            return;
          }
          toast.error("Could not verify principal. Please try again.");
          setIsSubmitting(false);
          return;
        }
        const principalMatches = searchResult.results || [];
        let matchedPrincipal = principalMatches.find(
          p => p.personal_number === principalIdStr
        ) || null;

        if (!matchedPrincipal) {
          toast.error(`Principal personal number "${principalIdStr}" not found. Use the employee or retiree's personal number from their registration (not their patient ID).`);
          setIsSubmitting(false);
          return;
        }

        // Validate that the principal is actually an employee or retiree
        if (matchedPrincipal.category !== 'employee' && matchedPrincipal.category !== 'retiree') {
          toast.error(`Principal must be an NPA staff member or retiree. Personal number "${principalIdStr}" belongs to a ${matchedPrincipal.category}.`);
          setIsSubmitting(false);
          return;
        }

        const principalStaffNumericId = matchedPrincipal.id;

        payload.principal_staff = principalStaffNumericId;
        if (formData.dependentType) {
          payload.dependent_type = formData.dependentType.trim(); // Exact match: 'Employee Dependent', 'Retiree Dependent'
        }
        // Location removed for dependents - not needed
      }

      const trimmedRecordsNote = recordsNote.trim();
      if (trimmedRecordsNote) {
        payload.records_note = trimmedRecordsNote.slice(0, 800);
      }

      // Handle photo upload if provided
      let createdPatient: any;
      if (photoFile) {
        createdPatient = await patientService.createPatient(
          { ...payload, is_active: true },
          photoFile,
        );
        if (!createdPatient || !createdPatient.patient_id) {
          throw new Error('Patient created but patient_id not found in response');
        }
      } else {
        createdPatient = await patientService.createPatient(payload);
      }
      
      // Save medical history if any data was entered
      if (medicalHistory.allergies.length > 0 || 
          medicalHistory.diagnoses.length > 0 ||
          medicalHistory.surgicalHistory.length > 0 || 
          medicalHistory.familyHistory.length > 0 || 
          medicalHistory.socialHistory.smoking || 
          medicalHistory.socialHistory.alcohol || 
          medicalHistory.socialHistory.exercise || 
          medicalHistory.socialHistory.occupation) {
        try {
          // Get numeric ID from created patient
          const patientId = typeof createdPatient.id === 'number' ? createdPatient.id : parseInt(createdPatient.id, 10);
          await patientService.updatePatientHistory(patientId, {
            allergies: medicalHistory.allergies,
            diagnoses: medicalHistory.diagnoses,
            surgical_history: medicalHistory.surgicalHistory,
            family_history: medicalHistory.familyHistory,
            social_history: medicalHistory.socialHistory,
          });
        } catch (historyErr: any) {
          console.warn('Failed to save medical history:', historyErr);
          // Don't fail the entire registration if history save fails
        }
      }
      
      // Clear draft
      localStorage.removeItem('patient_register_draft');
      setHasDraft(false);
      
      toast.success('Patient registered successfully', {
        description: `Patient ID: ${createdPatient.patient_id}`,
      });
      
      // Redirect to patients list page (patient detail page was replaced with modal)
      router.push('/medical-records/patients');
    } catch (error: any) {
      console.error('Error registering patient:', error);
      if (handleAuthError(error)) {
        setIsSubmitting(false);
        return;
      }
      
      // Extract detailed error message
      let errorMessage = 'Failed to register patient';
      let errorDetails = '';
      
      if (error) {
        // Handle API validation errors
        if (error.message && typeof error.message === 'string') {
          try {
            // Try to parse JSON error message
            const parsed = JSON.parse(error.message);
            if (parsed.personal_number) {
              errorMessage = parsed.personal_number[0];
            } else if (parsed.patient_id) {
              errorMessage = parsed.patient_id[0];
            } else if (parsed.non_field_errors) {
              errorMessage = parsed.non_field_errors[0];
            } else {
              // Try to find any field error
              const firstField = Object.keys(parsed)[0];
              if (firstField && parsed[firstField] && Array.isArray(parsed[firstField])) {
                errorMessage = parsed[firstField][0];
              }
            }
          } catch (parseError) {
            // If not JSON, use the message directly if it's meaningful
            if (error.message !== 'Request failed. Please try again') {
              errorMessage = error.message;
            }
          }
        }
        
        // Check for apiMessage property
        if (error.apiMessage) {
          errorMessage = error.apiMessage;
        }
        
        // Add technical details for debugging
        errorDetails = error.message || 'Unknown error';
      }
      
      toast.error(errorMessage, {
        description: errorDetails && errorDetails !== errorMessage ? errorDetails : undefined,
      });
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    const draft = { patientCategory, formData, photoPreview, savedAt: new Date().toISOString() };
    localStorage.setItem('patient_register_draft', JSON.stringify(draft));
    setHasDraft(true);
    toast.success('Draft saved');
  };

  const handleClearDraft = () => {
    localStorage.removeItem('patient_register_draft');
    setHasDraft(false);
    setFormData({
      personalNumber: '', title: '', surname: '', firstName: '', middleName: '',
      gender: '', dateOfBirth: '', maritalStatus: '', religion: '', tribe: '', occupation: '',
      isFirstTimePatient: false,
      employeeType: '', division: '', location: '',
      nonNPAType: '',
      dependentType: '', principalStaffId: '',
      email: '', phone: '', stateOfResidence: '', residentialAddress: '',
      stateOfOrigin: '', lga: '', permanentAddress: '',
      bloodGroup: '', genotype: '',
      nokSurname: '', nokFirstName: '', nokMiddleName: '', nokRelationship: '', nokAddress: '', nokPhone: '',
    });
    setPhotoPreview(null);
    setNokAutoPopulated(false); // Reset auto-population flag
    setPrincipalValidation({ isValidating: false, isValid: null, message: '' }); // Reset validation
    toast.info('Draft cleared');
  };

  const goToNextStep = () => {
    const currentIndex = STEPS.findIndex(s => s.id === currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].id);
    }
  };

  const goToPrevStep = () => {
    const currentIndex = STEPS.findIndex(s => s.id === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id);
    }
  };

  const categories = [
    { id: 'employee', label: 'Employee' },
    { id: 'retiree', label: 'Retiree' },
    { id: 'nonnpa', label: 'NonNPA' },
    { id: 'dependent', label: 'Dependent' },
  ];

  const handleCategoryClick = (categoryId: 'employee' | 'retiree' | 'nonnpa' | 'dependent') => {
    if (categoryId === patientCategory) {
      return; // Already selected, do nothing
    }
    // Show confirmation dialog
    setPendingCategory(categoryId);
    setShowCategorySwitchDialog(true);
  };

  const handleConfirmCategorySwitch = () => {
    if (pendingCategory) {
      // Clear all category-specific fields when switching
      setFormData(prev => {
        const updated = {
          ...prev,
          // Employee/Retiree fields
          employeeType: '',
          division: '',
          location: '',
          // NonNPA fields
          nonNPAType: '',
          // Dependent fields
          dependentType: '',
          principalStaffId: '',
        };
        
        // Clear personalNumber if switching away from employee/retiree
        if (pendingCategory !== 'employee' && pendingCategory !== 'retiree') {
          updated.personalNumber = '';
        }
        
        // Clear occupation if switching away from dependent/retiree
        if (pendingCategory !== 'dependent' && pendingCategory !== 'retiree') {
          updated.occupation = '';
        }
        
        return updated;
      });
      
      // Set the new category
      setPatientCategory(pendingCategory);
    }
    setShowCategorySwitchDialog(false);
    setPendingCategory(null);
  };

  const handleCancelCategorySwitch = () => {
    setShowCategorySwitchDialog(false);
    setPendingCategory(null);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Register Patient</h1>
          <p className="text-muted-foreground mt-1">
            Create a new patient record for NPA staff, retirees, dependents, or non-NPA visitors
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Patient Category Selection */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Patient Category</CardTitle>
                <CardDescription>Select the category of patient being registered</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <Button
                      key={cat.id}
                      type="button"
                      variant={patientCategory === cat.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleCategoryClick(cat.id as typeof patientCategory)}
                      className={patientCategory === cat.id ? 'bg-teal-600 hover:bg-teal-700' : ''}
                    >
                      <User className="h-4 w-4 mr-2" />
                      {cat.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {patientCategory === 'employee' && 'Active NPA employee with staff ID and benefits.'}
                  {patientCategory === 'retiree' && 'Former NPA staff receiving retirement benefits.'}
                  {patientCategory === 'nonnpa' && 'External visitor or contractor without NPA affiliation.'}
                  {patientCategory === 'dependent' && 'Family member of an NPA employee or retiree.'}
                </p>
              </CardContent>
            </Card>

            {/* Registration Details Card with Tabs */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Registration Details</CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{completionPercentage}% complete</span>
                  </div>
                </div>
                <Progress value={completionPercentage} className="h-1" />
              </CardHeader>
              <CardContent className="space-y-6">
                <Tabs value={currentStep} onValueChange={(v) => setCurrentStep(v as FormStep)}>
                  <TabsList className="grid w-full grid-cols-4">
                    {STEPS.map((step) => (
                      <TabsTrigger key={step.id} value={step.id} className="gap-2">
                        {step.icon}
                        <span className="hidden sm:inline">{step.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {/* Personal Details Tab */}
                  <TabsContent value="personal" className="space-y-4 pt-4">
                    <label className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50/50 p-3 cursor-pointer dark:border-teal-800 dark:bg-teal-950/20">
                      <Checkbox
                        checked={formData.isFirstTimePatient}
                        onCheckedChange={(v) =>
                          setFormData((prev) => ({ ...prev, isFirstTimePatient: v === true }))
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          First-time patient
                        </span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          Tick if this patient is coming to the clinic for the first time (no prior
                          paper/manual records). Leave unticked when onboarding an existing patient
                          from manual records.
                        </span>
                      </span>
                    </label>
                    {/* Personal Number - only for Employee/Retiree */}
                    {showWorkInfo && (
                      <div className="space-y-2">
                        <Label>Personal Number *</Label>
                        <Input 
                          value={formData.personalNumber} 
                          onChange={(e) => handleInputChange('personalNumber', e.target.value)}
                          placeholder="NPA Staff ID" 
                        />
                      </div>
                    )}

                    {/* Photo Upload */}
                    <div className="space-y-2">
                      <Label>Upload Photo</Label>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                          {photoPreview ? (
                            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <Camera className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <input type="file" id="photo-upload" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={handlePhotoUpload} className="hidden" />
                          <Button variant="outline" size="sm" onClick={() => document.getElementById('photo-upload')?.click()}>
                            <Upload className="h-4 w-4 mr-2" />
                            Choose File
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1">JPG, PNG, or WebP. Max 5MB</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Select value={formData.title || undefined} onValueChange={(v) => handleInputChange('title', v)}>
                          <SelectTrigger><SelectValue placeholder="Select title" /></SelectTrigger>
                          <SelectContent>
                            {PATIENT_TITLE_OPTIONS.map(({ value, label }) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Gender *</Label>
                        <Select value={formData.gender} onValueChange={(v) => handleInputChange('gender', v)}>
                          <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Surname *</Label>
                      <Input value={formData.surname} onChange={(e) => handleInputChange('surname', e.target.value)} placeholder="Surname" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>First Name *</Label>
                        <Input value={formData.firstName} onChange={(e) => handleInputChange('firstName', e.target.value)} placeholder="First name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Middle Name</Label>
                        <Input value={formData.middleName} onChange={(e) => handleInputChange('middleName', e.target.value)} placeholder="Middle name" />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Date of Birth *</Label>
                        <Input type="date" value={formData.dateOfBirth} onChange={(e) => handleInputChange('dateOfBirth', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Age</Label>
                        <Input value={calculateAge} readOnly placeholder="Auto-calculated" className="bg-muted/50" />
                      </div>
                      <div className="space-y-2">
                        <Label>Marital Status</Label>
                        <Select value={formData.maritalStatus || undefined} onValueChange={(v) => handleInputChange('maritalStatus', v)}>
                          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                          <SelectContent>
                            {MARITAL_STATUSES.map((status) => (
                              <SelectItem key={status} value={status.toLowerCase()}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Religion</Label>
                        <Select value={formData.religion || undefined} onValueChange={(v) => handleInputChange('religion', v)}>
                          <SelectTrigger><SelectValue placeholder="Select religion" /></SelectTrigger>
                          <SelectContent>
                            {RELIGIONS.map(religion => <SelectItem key={religion} value={religion}>{religion}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Occupation</Label>
                        <Input
                          value={formData.occupation}
                          onChange={(e) => handleInputChange('occupation', e.target.value)}
                          placeholder="e.g. Senior Engineer - NPA"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-4">
                      <Button type="button" onClick={goToNextStep}>
                        Next
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Work Information Tab */}
                  <TabsContent value="work" className="space-y-4 pt-4">
                    {showEmployeeWorkFields && (
                      <>
                        <div className="space-y-2">
                          <Label>Type *</Label>
                          <Select value={formData.employeeType} onValueChange={(v) => handleInputChange('employeeType', v)}>
                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                              {EMPLOYEE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Division *</Label>
                          <Select value={formData.division} onValueChange={(v) => handleInputChange('division', v)}>
                            <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                            <SelectContent className="max-h-[250px]">
                              {NPA_DIVISIONS.map(div => <SelectItem key={div} value={div}>{div}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Location *</Label>
                          <Select value={formData.location} onValueChange={(v) => handleInputChange('location', v)} disabled={locationOptions.length === 0}>
                            <SelectTrigger><SelectValue placeholder={locationOptions.length === 0 ? "No locations—add clinics in Admin" : "Select location"} /></SelectTrigger>
                            <SelectContent>
                              {locationOptions.map((loc) => <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {patientCategory === 'retiree' && (
                      <div className="p-4 rounded-lg bg-muted/50 border border-muted">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Retiree Status:</span> This patient is registered as a retiree. 
                          Work-related fields (Type, Division, Location) are not required for retirees.
                        </p>
                      </div>
                    )}

                    {showNonNPAType && (
                      <>
                        <div className="space-y-2">
                          <Label>Non-NPA Type *</Label>
                          <Select value={formData.nonNPAType} onValueChange={(v) => handleInputChange('nonNPAType', v)}>
                            <SelectTrigger><SelectValue placeholder="Select non-NPA type" /></SelectTrigger>
                            <SelectContent>
                              {NON_NPA_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Location</Label>
                          <Select value={formData.location} onValueChange={(v) => handleInputChange('location', v)} disabled={locationOptions.length === 0}>
                            <SelectTrigger><SelectValue placeholder={locationOptions.length === 0 ? "No locations—add clinics in Admin" : "Select location"} /></SelectTrigger>
                            <SelectContent>
                              {locationOptions.map((loc) => <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {showDependentType && (
                      <>
                        <div className="space-y-2">
                          <Label>Dependent Type *</Label>
                          <Select value={formData.dependentType} onValueChange={(v) => handleInputChange('dependentType', v)}>
                            <SelectTrigger><SelectValue placeholder="Select dependent type" /></SelectTrigger>
                            <SelectContent>
                              {DEPENDENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Principal personal number *</Label>
                          <div className="flex gap-2">
                            <Input
                              value={formData.principalStaffId}
                              onChange={(e) => handleInputChange('principalStaffId', e.target.value)}
                              placeholder="Enter principal personal number (e.g., A2962)"
                              className={`flex-1 ${(() => {
                                if (!formData.principalStaffId) return '';
                                if (principalValidation.isValidating) return 'border-blue-500';
                                return principalValidation.isValid ? 'border-green-500 focus:border-green-500' : 'border-red-500 focus:border-red-500';
                              })()}`}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => validatePrincipalStaffId(formData.principalStaffId)}
                              disabled={!formData.principalStaffId?.trim() || principalValidation.isValidating}
                            >
                              {principalValidation.isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                              Search
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Enter the principal&apos;s <strong>personal number</strong> (employee or retiree)—the same value as P.N. on their registration and forms. Do not use patient IDs such as E-A2962 or R-… here.
                          </p>
                          {formData.principalStaffId && (
                            <div className={`text-xs p-2 rounded-md border ${
                              principalValidation.isValidating ? 'bg-blue-50 border-blue-200 text-blue-700' :
                              principalValidation.isValid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                              {principalValidation.message || "Enter the principal's personal number, then Search"}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goToPrevStep}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="button" onClick={goToNextStep}>
                        Next
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Contact Information Tab */}
                  <TabsContent value="contact" className="space-y-4 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input type="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} placeholder="email@example.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone *</Label>
                        <Input value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} placeholder="e.g., 08012345678" />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>State of Origin</Label>
                        <Select value={formData.stateOfOrigin} onValueChange={(v) => handleInputChange('stateOfOrigin', v)}>
                          <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {NIGERIA_STATES_AND_LGAS.map(state => <SelectItem key={state.name} value={state.name}>{state.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Local Government Area</Label>
                        <Select value={formData.lga} onValueChange={(v) => handleInputChange('lga', v)} disabled={!formData.stateOfOrigin || availableLGAs.length === 0}>
                          <SelectTrigger><SelectValue placeholder={formData.stateOfOrigin ? "Select LGA" : "Select state first"} /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {availableLGAs.map(lga => <SelectItem key={lga} value={lga}>{lga}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Permanent Address</Label>
                      <Textarea value={formData.permanentAddress} onChange={(e) => handleInputChange('permanentAddress', e.target.value)} placeholder="Permanent home address" rows={2} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Tribe</Label>
                        <Select value={formData.tribe || undefined} onValueChange={(v) => handleInputChange('tribe', v)}>
                          <SelectTrigger><SelectValue placeholder="Select tribe" /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {NIGERIAN_TRIBES.map((tribe) => (
                              <SelectItem key={tribe} value={tribe}>{tribe}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>State of Residence</Label>
                        <Select value={formData.stateOfResidence} onValueChange={(v) => handleInputChange('stateOfResidence', v)}>
                          <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {NIGERIA_STATES_AND_LGAS.map(state => <SelectItem key={state.name} value={state.name}>{state.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Residential Address</Label>
                      <Textarea value={formData.residentialAddress} onChange={(e) => handleInputChange('residentialAddress', e.target.value)} placeholder="Current residential address" rows={2} />
                    </div>

                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goToPrevStep}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="button" onClick={goToNextStep}>
                        Next
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Medical Details & Next of Kin Tab */}
                  <TabsContent value="medical" className="space-y-4 pt-4">
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Heart className="h-4 w-4 text-rose-500" />
                        Medical Details
                      </h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Blood Group</Label>
                          <Select value={formData.bloodGroup} onValueChange={(v) => handleInputChange('bloodGroup', v)}>
                            <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A+">A+</SelectItem>
                              <SelectItem value="A-">A-</SelectItem>
                              <SelectItem value="B+">B+</SelectItem>
                              <SelectItem value="B-">B-</SelectItem>
                              <SelectItem value="AB+">AB+</SelectItem>
                              <SelectItem value="AB-">AB-</SelectItem>
                              <SelectItem value="O+">O+</SelectItem>
                              <SelectItem value="O-">O-</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Genotype</Label>
                          <Select value={formData.genotype} onValueChange={(v) => handleInputChange('genotype', v)}>
                            <SelectTrigger><SelectValue placeholder="Select genotype" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AA">AA</SelectItem>
                              <SelectItem value="AS">AS</SelectItem>
                              <SelectItem value="SS">SS</SelectItem>
                              <SelectItem value="AC">AC</SelectItem>
                              <SelectItem value="SC">SC</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Medical History */}
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        Medical History
                      </h4>
                      
                      {/* Allergies */}
                      <div className="space-y-3 mb-4">
                        <Label className="text-sm">Allergies</Label>
                        <div className="flex gap-2">
                          <Input
                            value={allergyDraft}
                            onChange={(e) => setAllergyDraft(e.target.value)}
                            placeholder="e.g. Penicillin"
                            className="h-8 text-sm"
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              const value = allergyDraft.trim();
                              if (!value) return;
                              setMedicalHistory((prev) => ({
                                ...prev,
                                allergies: prev.allergies.includes(value)
                                  ? prev.allergies
                                  : [...prev.allergies, value],
                              }));
                              setAllergyDraft('');
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => {
                              const value = allergyDraft.trim();
                              if (!value) return;
                              setMedicalHistory((prev) => ({
                                ...prev,
                                allergies: prev.allergies.includes(value)
                                  ? prev.allergies
                                  : [...prev.allergies, value],
                              }));
                              setAllergyDraft('');
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                        {medicalHistory.allergies.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No allergies</p>
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
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Chronic Conditions</Label>
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
                          <p className="text-xs text-muted-foreground">No chronic conditions</p>
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

                      {/* Surgical History */}
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Surgical History</Label>
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
                          <p className="text-xs text-muted-foreground">No surgical history</p>
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
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Family History</Label>
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
                          <p className="text-xs text-muted-foreground">No family history</p>
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
                      <div className="space-y-3 mb-4">
                        <Label className="text-sm">Social History</Label>
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
                          <div className="space-y-1">
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
                          <div className="space-y-1">
                            <Label className="text-xs">Occupation</Label>
                            <Input
                              value={medicalHistory.socialHistory.occupation}
                              onChange={(e) => {
                                setMedicalHistory(prev => ({
                                  ...prev,
                                  socialHistory: { ...prev.socialHistory, occupation: e.target.value },
                                }));
                              }}
                              placeholder="e.g., Senior Engineer - NPA"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4 text-cyan-500" />
                        Next of Kin
                      </h4>

                      {patientCategory === 'dependent' && principalValidation.patient && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                          <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Next of kin fields have been auto-populated from the principal (employee/retiree) record.
                            All fields can still be edited if needed.
                          </p>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Surname</Label>
                          <Input value={formData.nokSurname} onChange={(e) => handleInputChange('nokSurname', e.target.value)} placeholder="Surname" />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>First Name</Label>
                            <Input value={formData.nokFirstName} onChange={(e) => handleInputChange('nokFirstName', e.target.value)} placeholder="First name" />
                          </div>
                          <div className="space-y-2">
                            <Label>Middle Name</Label>
                            <Input value={formData.nokMiddleName} onChange={(e) => handleInputChange('nokMiddleName', e.target.value)} placeholder="Middle name" />
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Relationship</Label>
                            <Select value={formData.nokRelationship} onValueChange={(v) => handleInputChange('nokRelationship', v)}>
                              <SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Spouse">Spouse</SelectItem>
                                <SelectItem value="Parent">Parent</SelectItem>
                                <SelectItem value="Sibling">Sibling</SelectItem>
                                <SelectItem value="Child">Child</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input value={formData.nokPhone} onChange={(e) => handleInputChange('nokPhone', e.target.value)} placeholder="e.g., 08012345678" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Address</Label>
                          <Textarea value={formData.nokAddress} onChange={(e) => handleInputChange('nokAddress', e.target.value)} placeholder="Address" rows={2} />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-500" />
                        Records note
                        <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        For Medical Records officers — folder refs, ID discrepancies, principal link notes.
                        Saved with your name and today&apos;s date; viewable on the patient profile.
                      </p>
                      <Textarea
                        value={recordsNote}
                        onChange={(e) => setRecordsNote(e.target.value.slice(0, 800))}
                        placeholder="e.g. Marriage certificate sighted; copy filed in BT-2026-441."
                        rows={3}
                        maxLength={800}
                      />
                      <p className="text-[11px] text-muted-foreground text-right">
                        {recordsNote.length}/800
                      </p>
                    </div>

                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goToPrevStep}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Registering...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Register Patient
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Category</span>
                    <Badge variant="secondary" className="capitalize">{patientCategory}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium text-right max-w-[150px] truncate">
                      {(() => {
                        const titlePrefix = formData.title?.trim()
                          ? `${patientTitleLabel(formData.title)} `
                          : '';
                        const parts = [formData.surname, formData.firstName, formData.middleName]
                          .map((s) => (s || '').trim())
                          .filter(Boolean);
                        const core = parts.join(' ');
                        if (!core && !titlePrefix) return '';
                        return `${titlePrefix}${core}`.trim();
                      })()}
                    </span>
                  </div>
                  {formData.gender && (
                    <div className="flex items-start justify-between">
                      <span className="text-muted-foreground">Gender</span>
                      <span className="font-medium capitalize">{formData.gender}</span>
                    </div>
                  )}
                  {calculateAge && (
                    <div className="flex items-start justify-between">
                      <span className="text-muted-foreground">Age</span>
                      <span className="font-medium">{calculateAge}</span>
                    </div>
                  )}
                  {showEmployeeWorkFields && (
                    <>
                      <Separator />
                      {formData.employeeType && (
                        <div className="flex items-start justify-between">
                          <span className="text-muted-foreground">Type</span>
                          <span className="font-medium capitalize">{formData.employeeType}</span>
                        </div>
                      )}
                      {formData.division?.trim() && (
                        <div className="flex items-start justify-between">
                          <span className="text-muted-foreground">Division</span>
                          <span className="font-medium text-right max-w-[150px] truncate capitalize">
                            {formData.division.replace(/-/g, ' ')}
                          </span>
                        </div>
                      )}
                      {formData.location?.trim() && (
                        <div className="flex items-start justify-between">
                          <span className="text-muted-foreground">Location</span>
                          <span className="font-medium capitalize">{formData.location}</span>
                        </div>
                      )}
                    </>
                  )}
                  {patientCategory === 'retiree' && (
                    <>
                      <Separator />
                      <div className="flex items-start justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant="secondary">Retiree</Badge>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Photo</span>
                    <div className="flex items-center gap-1">
                      {photoPreview ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span>Uploaded</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">None</span>
                        </>
                      )}
                    </div>
                  </div>
                  {formData.bloodGroup && (
                    <div className="flex items-start justify-between">
                      <span className="text-muted-foreground">Blood Group</span>
                      <span className="font-medium">{formData.bloodGroup}</span>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleSaveDraft}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Draft
                  </Button>
                  {hasDraft && (
                    <Button type="button" variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive" onClick={handleClearDraft}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear Draft
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Links Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/patients')}>
                  <Users className="h-4 w-4 mr-2" />
                  Manage Patients
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/visits/new')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Create Visit
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Category Switch Confirmation Dialog */}
      <AlertDialog open={showCategorySwitchDialog} onOpenChange={setShowCategorySwitchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Patient Category?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to switch from <strong>{categories.find(c => c.id === patientCategory)?.label}</strong> to <strong>{categories.find(c => c.id === pendingCategory)?.label}</strong>?
              <br /><br />
              This will clear any category-specific information you've already entered. You'll need to fill in the new category's required fields.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelCategorySwitch}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCategorySwitch} className="bg-teal-600 hover:bg-teal-700">
              Yes, Switch Category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
