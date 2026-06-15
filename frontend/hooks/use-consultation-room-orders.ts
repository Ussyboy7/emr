"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import {
  consultationService,
  eyeCareService,
  labService,
  pharmacyService,
  physioService,
  radiologyService,
  referralService,
  visitService,
  wardService,
  type Diagnosis,
  type ICD10Code,
  type LabTemplate as ServiceLabTemplate,
  type Prescription,
} from "@/lib/services";
import type { ConsultationRoomPatient } from "@/lib/consultation/room-types";
import {
  type PrescriptionOrderItemInput,
  type PrescriptionOrderSubmitInput,
} from "@/components/consultation/orders/PrescriptionOrderModal";
import {
  localDraftToOrderInput,
  type PrescriptionModalIntent,
} from "@/lib/consultation/prescription-refill";
import { debugConsultationRoom } from "@/lib/consultation/room-helpers";
import {
  INJECTION_ROUTES,
  REFERRAL_REASONS,
  REFERRAL_SPECIALTIES,
} from "@/lib/constants/medical-data";
import {
  LAB_OTHER_TEMPLATE_CODE,
  RAD_OTHER_TEMPLATE_CODE,
} from "@/lib/constants/order-template-codes";
import {
  CATALOG_SEARCH_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
} from "@/lib/pagination-constants";
import { isAuthenticationError } from "@/lib/auth-errors";
import { resolvePatientNumericId } from "@/lib/utils/patient-id";
import {
  getVisitServiceClinicsList,
  normalizeClinicName,
} from "@/lib/utils/clinic-utils";

const injectionRoutes = INJECTION_ROUTES;
const referralSpecialties = REFERRAL_SPECIALTIES;
const referralReasons = REFERRAL_REASONS;

export type UseConsultationRoomOrdersArgs = {
  currentPatient: ConsultationRoomPatient | null;
  sessionId: number | null;
  activeTab: string;
  opdClinicNames: string[];
  onReferralCreated?: () => void;
  medicalNotesAssessment?: string;
  loadPatientOverview?: (patientId: number) => void;
  orderedByUserId?: number;
};


export function useConsultationRoomOrders({
  currentPatient,
  sessionId,
  activeTab,
  opdClinicNames,
  onReferralCreated,
  medicalNotesAssessment = "",
  loadPatientOverview,
  orderedByUserId,
}: UseConsultationRoomOrdersArgs) {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [icd10Codes, setIcd10Codes] = useState<ICD10Code[]>([]);
  const [icd10SearchResults, setIcd10SearchResults] = useState<ICD10Code[]>([]);
  const [isSearchingICD10, setIsSearchingICD10] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [showAddDiagnosis, setShowAddDiagnosis] = useState(false);
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [showDiagnosisDropdown, setShowDiagnosisDropdown] = useState(false);
  const [selectedDiagnosisType, setSelectedDiagnosisType] = useState<'Primary' | 'Secondary' | 'Differential'>('Primary');
  const [diagnosisNotes, setDiagnosisNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState<{ 
    id: string;
    prescriptionId?: number;
    medication: string; 
    /** GenericMedication PK (required for pharmacy API `items[].generic`). */
    genericId?: number;
    /** Brand Medication PK when added from brand search (optional on prescription item). */
    brandMedicationId?: number;
    medicationId?: number; // Legacy: generic id when added from generic search; do not use alone for API if genericId is set
    genericName: string;
    unit?: string;
    strength?: string;
    form?: string;
    dose?: string; 
    dosage: string; 
    frequency: string; 
    duration: string; 
    quantity: number;
    route: string;
    instructions: string;
    priority: string;
    status: 'Draft' | 'Sent to Pharmacy' | 'Processing' | 'Partially Dispensed' | 'Dispensed' | 'Cancelled';
  }[]>([]);
  const [showAddPrescription, setShowAddPrescription] = useState(false);
  const [showPrescriptionRefill, setShowPrescriptionRefill] = useState(false);
  const [prescriptionModalInitialItems, setPrescriptionModalInitialItems] = useState<
    PrescriptionOrderItemInput[] | undefined
  >(undefined);
  const [prescriptionModalInitialPriority, setPrescriptionModalInitialPriority] = useState<
    'Routine' | 'Urgent' | 'STAT' | undefined
  >(undefined);
  const [prescriptionModalIntent, setPrescriptionModalIntent] = useState<PrescriptionModalIntent | null>(
    null
  );
  const [prescriptionsSentToPharmacy, setPrescriptionsSentToPharmacy] = useState(false);

  const diagnosisDropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const labTemplateDropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const radiologyTemplateDropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const [labOrders, setLabOrders] = useState<{ 
    id: string;
    test: string; 
    testId?: number; // Template ID
    code?: string;
    sampleType?: string;
    priority: string; 
    notes: string;
    status: 'Draft' | 'Sent to Lab';
  }[]>([]);
  const [showAddLabOrder, setShowAddLabOrder] = useState(false);
  const [newLabOrder, setNewLabOrder] = useState({ test: "", priority: "Routine", notes: "" });
  const [labTemplates, setLabTemplates] = useState<ServiceLabTemplate[]>([]);
  const [loadingLabTemplates, setLoadingLabTemplates] = useState(false);
  const [labTemplateSearch, setLabTemplateSearch] = useState("");
  const [showLabTemplateDropdown, setShowLabTemplateDropdown] = useState(false);
  const [selectedLabTemplates, setSelectedLabTemplates] = useState<Set<number>>(new Set());
  const [otherLabPinnedTemplate, setOtherLabPinnedTemplate] = useState<ServiceLabTemplate | null>(null);

  // Radiology templates
  const [selectedRadiologyTemplates, setSelectedRadiologyTemplates] = useState<Set<number>>(new Set());
  const [nursingOrders, setNursingOrders] = useState<{
    id: string;
    type: 'Injection' | 'Dressing' | 'IV Infusion' | 'Observation Admission';
    medication?: string;
    dosage?: string;
    route?: string;
    woundLocation?: string;
    woundType?: string;
    instructions: string;
    priority: 'Routine' | 'Urgent' | 'STAT';
    status: 'Draft' | 'Sent to Nursing' | 'In Progress' | 'Completed';
    // Observation admission fields
    ward?: string;
    admissionDiagnosis?: string;
    presentingComplaint?: string;
  }[]>([]);

  const [wards, setWards] = useState<any[]>([]);
  const [showAddNursingOrder, setShowAddNursingOrder] = useState(false);
  const [newNursingOrder, setNewNursingOrder] = useState({
    type: "" as string,
    medication: "",
    dosage: "",
    route: "Intramuscular (IM)",
    woundLocation: "",
    woundType: "",
    instructions: "",
    priority: "Routine",
    ward: "",
    admissionDiagnosis: "",
    presentingComplaint: ""
  });
  const draftObservationCount = nursingOrders.filter(
    (order) => order.status === 'Draft' && order.type === 'Observation Admission'
  ).length;
  const [injectionMedicationSearch, setInjectionMedicationSearch] = useState("");
  const [injectionMedicationResults, setInjectionMedicationResults] = useState<Array<{ id: number | string; name?: string; active_ingredient?: string; category?: string; dosage_form?: string; strength?: string }>>([]);
  const [loadingInjectionMedications, setLoadingInjectionMedications] = useState(false);
  const [showInjectionMedicationDropdown, setShowInjectionMedicationDropdown] = useState(false);
  const [injectionSelectedIds, setInjectionSelectedIds] = useState<Set<string>>(new Set());
  const [injectionConfigs, setInjectionConfigs] = useState<Map<string, {
    dose: string;
    doseUnit: string;
    frequency: string;
    durationDays: number | "";
    route: string;
    instructions: string;
  }>>(new Map());
  const injectionMedicationSearchRef = useRef(0);
  const injectionMedicationDropdownRef = useRef<HTMLDivElement>(null);

  // Load injection medications from API
  useEffect(() => {
    if (!showAddNursingOrder || newNursingOrder.type !== 'Injection' || !showInjectionMedicationDropdown) {
      setShowInjectionMedicationDropdown(false);
      return;
    }
    const searchTerm = injectionMedicationSearch.trim();
    if (!searchTerm) {
      setInjectionMedicationResults([]);
      return;
    }
    const requestId = ++injectionMedicationSearchRef.current;
    const timeout = setTimeout(async () => {
      try {
        setLoadingInjectionMedications(true);
        const res = await pharmacyService.getGenericsForPrescription({ search: searchTerm, page_size: 50 });
        if (requestId === injectionMedicationSearchRef.current) {
          setInjectionMedicationResults((res as any)?.results || []);
        }
      } catch (err: any) {
        if (requestId === injectionMedicationSearchRef.current) {
          console.error("Failed to search injection medications:", err);
          toast.error(err?.message || "Failed to load medication search results");
          setInjectionMedicationResults([]);
        }
      } finally {
        if (requestId === injectionMedicationSearchRef.current) {
          setLoadingInjectionMedications(false);
        }
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [showAddNursingOrder, newNursingOrder.type, showInjectionMedicationDropdown, injectionMedicationSearch]);

  useEffect(() => {
    if (!showAddNursingOrder || newNursingOrder.type !== 'Injection' || !showInjectionMedicationDropdown) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const el = injectionMedicationDropdownRef.current;
      if (el && !el.contains(target)) setShowInjectionMedicationDropdown(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [showAddNursingOrder, newNursingOrder.type, showInjectionMedicationDropdown]);

  const [showAddReferral, setShowAddReferral] = useState(false);
  const [newReferral, setNewReferral] = useState({
    specialty: "",
    facility: "",
    facilityType: "" as "" | "internal" | "external" | "specialist",
    facility_partner: null as number | null,
    reason: "",
    priority: "Routine",
    clinicalSummary: "",
    contactPerson: "",
    contactPhone: ""
  });

  // Radiology state
  const [radiologyOrders, setRadiologyOrders] = useState<{
    id: string;
    procedure: string;
    templateId?: number;
    category: string;
    bodyPart: string;
    clinicalIndication: string;
    priority: 'Routine' | 'Urgent' | 'STAT';
    provisionalDiagnosis?: string;
    lmp?: string;
    status: 'Draft' | 'Sent to Radiology' | 'Scheduled' | 'In Progress' | 'Completed';
  }[]>([]);
  const [showAddRadiology, setShowAddRadiology] = useState(false);
  const [newRadiology, setNewRadiology] = useState({
    procedure: "",
    category: "",
    bodyPart: "",
    clinicalIndication: "",
    priority: "Routine",
    provisionalDiagnosis: "",
    lmp: ""
  });
  const [radiologyTemplates, setRadiologyTemplates] = useState<any[]>([]);
  const [loadingRadiologyTemplates, setLoadingRadiologyTemplates] = useState(false);
  const [radiologyTemplatesError, setRadiologyTemplatesError] = useState<string | null>(null);
  const [radiologyTemplateSearch, setRadiologyTemplateSearch] = useState("");
  const [showRadiologyTemplateDropdown, setShowRadiologyTemplateDropdown] = useState(false);
  const [otherRadiologyPinnedTemplate, setOtherRadiologyPinnedTemplate] = useState<any | null>(null);

  // Physiotherapy state
  const [physioOrders, setPhysioOrders] = useState<{
    id: string;
    historyClinicalFindings: string;
    diagnosis: string;
    drugHistory: string;
    specialInstructions?: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: 'Draft' | 'Sent to Physiotherapy' | 'Scheduled' | 'In Progress' | 'Completed';
  }[]>([]);
  const [physioOrdersFromApi, setPhysioOrdersFromApi] = useState<any[]>([]);
  const [showAddPhysio, setShowAddPhysio] = useState(false);
  const [editingPhysioIndex, setEditingPhysioIndex] = useState<number | null>(null);
  const [newPhysio, setNewPhysio] = useState({
    historyClinicalFindings: "",
    diagnosis: "",
    drugHistory: "",
    specialInstructions: "",
    priority: "normal" as 'low' | 'normal' | 'high' | 'urgent'
  });
  const [physioTemplates, setPhysioTemplates] = useState<any[]>([]);
  const [loadingPhysioTemplates, setLoadingPhysioTemplates] = useState(false);

  // Eye Care state
  const [eyeOrders, setEyeOrders] = useState<{
    id: string;
    chiefComplaint: string;
    diagnosis: string;
    treatmentPlan: string;
    specialInstructions?: string;
    visualAcuityOd?: string;
    visualAcuityOs?: string;
    visualAcuityOu?: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: 'Draft' | 'Sent to Eye Care' | 'Scheduled' | 'In Progress' | 'Completed';
  }[]>([]);
  const [eyeOrdersFromApi, setEyeOrdersFromApi] = useState<any[]>([]);
  const [showAddEye, setShowAddEye] = useState(false);
  const [editingEyeIndex, setEditingEyeIndex] = useState<number | null>(null);
  const [newEye, setNewEye] = useState({
    chiefComplaint: "",
    diagnosis: "",
    treatmentPlan: "",
    specialInstructions: "",
    visualAcuityOd: "",
    visualAcuityOs: "",
    visualAcuityOu: "",
    priority: "normal" as 'low' | 'normal' | 'high' | 'urgent'
  });

  const resolveCurrentVisitId = useCallback(async (): Promise<number | undefined> => {
    if (!currentPatient) return undefined;

    const directVisitId = Number(currentPatient.visitId);
    if (Number.isFinite(directVisitId) && directVisitId > 0) {
      return directVisitId;
    }

    if (sessionId) {
      try {
        const session = await consultationService.getSession(sessionId);
        if (typeof session.visit === 'number' && Number.isFinite(session.visit) && session.visit > 0) {
          return session.visit;
        }
      } catch (err) {
        console.warn('Could not resolve visit from session:', err);
      }
    }

    const numericPatientId = parseInt(currentPatient.id, 10);
    if (!Number.isFinite(numericPatientId)) return undefined;
    try {
      const latestVisit = await visitService.resolveVisit({
        patient: numericPatientId,
        ordering: '-date,-time',
      });
      const latestVisitId = latestVisit?.id;
      if (typeof latestVisitId === 'number' && Number.isFinite(latestVisitId) && latestVisitId > 0) {
        return latestVisitId;
      }
    } catch (err) {
      console.warn('Could not resolve latest visit for patient:', err);
    }
    return undefined;
  }, [currentPatient, sessionId]);

  const loadWards = async () => {
    try {
      const wardsResponse = await wardService.getWards({ status: 'active' });
      setWards(wardsResponse.results || []);
    } catch (error) {
      console.error('Failed to load wards:', error);
      setWards([]);
      toast.error('Could not load wards. Try again or contact admin.');
    }
  };

  // Search ICD-10 codes from API
  const searchICD10Codes = async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setIcd10SearchResults([]);
      return;
    }

    try {
      setIsSearchingICD10(true);
      const response = await consultationService.getICD10Codes({
        search: searchTerm,
        page_size: CATALOG_SEARCH_PAGE_SIZE,
      });
      setIcd10SearchResults(response.results || []);
      debugConsultationRoom(`[ICD-10 API Search] "${searchTerm}" found ${response.results?.length || 0} matches`);
    } catch (err: any) {
      debugConsultationRoom('Failed to search ICD-10 codes:', err);
      setIcd10SearchResults([]);
    } finally {
      setIsSearchingICD10(false);
    }
  };

  // (Legacy in-page medication search removed — all prescribing goes through
  // <PrescriptionOrderModal /> which does its own generics lookup.)

  useEffect(() => {
    if (!showAddDiagnosis) return;
    if (icd10Codes.length > 0) return;

    const loadICD10Codes = async () => {
      try {
        const response = await consultationService.getICD10Codes({ page_size: MAX_LIST_PAGE_SIZE });
        setIcd10Codes(response.results || []);
      } catch (err: any) {
        debugConsultationRoom('Failed to load ICD-10 codes:', err);
      }
    };

    loadICD10Codes();
  }, [showAddDiagnosis, icd10Codes.length]);

  useEffect(() => {
    if (!showAddLabOrder && !showLabTemplateDropdown) return;
    if (labTemplates.length > 0) return;
    const loadLabTemplates = async () => {
      try {
        setLoadingLabTemplates(true);
        const response = await labService.getTemplates();
        setLabTemplates(response.results || []);
        debugConsultationRoom(`[Consultation] Loaded ${response.results?.length || 0} lab templates from API`);
      } catch (err) {
        debugConsultationRoom('Failed to load lab templates:', err);
          toast.error('Failed to load lab templates. Some tests may not be available.');
      } finally {
        setLoadingLabTemplates(false);
      }
    };
    
    loadLabTemplates();
  }, [showAddLabOrder, showLabTemplateDropdown, labTemplates.length]);

  useEffect(() => {
    if (!showAddLabOrder) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await labService.resolveTemplateByCode(LAB_OTHER_TEMPLATE_CODE);
        if (!cancelled) setOtherLabPinnedTemplate(row ?? null);
      } catch {
        if (!cancelled) setOtherLabPinnedTemplate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAddLabOrder]);

  useEffect(() => {
    if (!showAddRadiology) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await radiologyService.resolveTemplateByCode(RAD_OTHER_TEMPLATE_CODE);
        if (!cancelled) setOtherRadiologyPinnedTemplate(row ?? null);
      } catch {
        if (!cancelled) setOtherRadiologyPinnedTemplate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAddRadiology]);

  useEffect(() => {
    if (!showAddRadiology && !showRadiologyTemplateDropdown) return;
    if (radiologyTemplates.length > 0) return;
    const loadRadiologyTemplates = async () => {
      try {
        setLoadingRadiologyTemplates(true);
        setRadiologyTemplatesError(null);
        const templates = await radiologyService.getTemplates();
        setRadiologyTemplates(templates.results || []);
      } catch (err: any) {
        debugConsultationRoom('Failed to load radiology templates:', err);

        // Check for authentication errors
        if (isAuthenticationError(err) || err.status === 401 || err.status === 403) {
          debugConsultationRoom('[Consultation] Authentication error loading radiology templates');
          toast.error('Authentication required. Please log in again.');
          setRadiologyTemplatesError('Authentication required. Please log in again.');
        } else if (err.status === 500) {
          debugConsultationRoom('[Consultation] Server error loading radiology templates');
          toast.error('Server error. Please try again later.');
          setRadiologyTemplatesError('Server error. Please try again later.');
        } else {
          // Show error toast to inform user
          toast.error('Failed to load radiology templates. Some imaging studies may not be available.');
          setRadiologyTemplatesError('Failed to load radiology templates.');
        }
        // Fall back to empty array
        setRadiologyTemplates([]);
      } finally {
        setLoadingRadiologyTemplates(false);
      }
    };

    // Only load if radiologyService.getTemplates is available
    if (typeof radiologyService.getTemplates === 'function') {
      loadRadiologyTemplates();
    } else {
      setLoadingRadiologyTemplates(false);
    }
  }, [showAddRadiology, showRadiologyTemplateDropdown, radiologyTemplates.length]);

  // Load physio orders from API for this consultation session so doctor sees real status (pending/scheduled/in_progress/completed)
  useEffect(() => {
    if (!sessionId) {
      setPhysioOrdersFromApi([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await physioService.getOrders({ consultation_session: sessionId, page_size: MAX_LIST_PAGE_SIZE });
        if (!cancelled) setPhysioOrdersFromApi(r?.results ?? []);
      } catch {
        if (!cancelled) setPhysioOrdersFromApi([]);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Load eye orders from API for this consultation session
  useEffect(() => {
    if (!sessionId) {
      setEyeOrdersFromApi([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await eyeCareService.getOrders({ consultation_session: sessionId, page_size: MAX_LIST_PAGE_SIZE });
        if (!cancelled) setEyeOrdersFromApi(r?.results ?? []);
      } catch {
        if (!cancelled) setEyeOrdersFromApi([]);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Close custom search dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];

      const isEventInside = (container: HTMLElement | null) =>
        !!container && (path.includes(container) || container.contains(target));

      if (showDiagnosisDropdown && !isEventInside(diagnosisDropdownContainerRef.current)) {
        setShowDiagnosisDropdown(false);
      }
      if (showLabTemplateDropdown && !isEventInside(labTemplateDropdownContainerRef.current)) {
        setShowLabTemplateDropdown(false);
      }
      if (showRadiologyTemplateDropdown && !isEventInside(radiologyTemplateDropdownContainerRef.current)) {
        setShowRadiologyTemplateDropdown(false);
      }

    };

    if (!showDiagnosisDropdown && !showLabTemplateDropdown && !showRadiologyTemplateDropdown) return;
    document.addEventListener('pointerdown', handleClickOutside, true);
    return () => document.removeEventListener('pointerdown', handleClickOutside, true);
  }, [showDiagnosisDropdown, showLabTemplateDropdown, showRadiologyTemplateDropdown]);

  // Ensure dropdowns don't persist when moving across tabs.
  useEffect(() => {
    setShowDiagnosisDropdown(false);
    setShowLabTemplateDropdown(false);
    setShowRadiologyTemplateDropdown(false);
  }, [activeTab]);

  const sendPrescriptionsToPharmacy = async () => {
    if (prescriptions.length === 0) {
      toast.error("No prescriptions to send");
      return;
    }
    const draftPrescriptions = prescriptions.filter(rx => rx.status === 'Draft');
    if (draftPrescriptions.length === 0) {
      toast.info("All prescriptions have already been sent to pharmacy");
      return;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = await resolveCurrentVisitId();
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      // Build items array for ONE prescription with ALL medications
      const prescriptionItems: any[] = [];
      const skippedMedications: string[] = [];
      
      for (const rx of draftPrescriptions) {
        // Strict generic-only: the prescribing flow always sets `genericId` from
        // the generics catalogue. No fallback to medicationId, no fuzzy lookup
        // by display name — either the draft is valid, or it is rejected.
        const genericId =
          typeof rx.genericId === 'number' && Number.isFinite(rx.genericId) && rx.genericId > 0
            ? rx.genericId
            : undefined;

        if (!genericId) {
          skippedMedications.push(rx.medication);
          continue;
        }

        const qtyNum = Math.max(Number(rx.quantity) || 0, 0.01);
        // The backend serializer auto-fills unit/form/strength/route from the
        // generic when these come in blank, so we only send what the user set.
        prescriptionItems.push({
          generic: genericId,
          medication: null,
          quantity: qtyNum,
          unit: rx.unit,
          dosage_form: rx.form,
          strength: rx.strength,
          dose: rx.dose || rx.dosage,
          frequency: rx.frequency,
          duration: rx.duration,
          route: rx.route,
          instructions: rx.instructions,
        });
      }
      
      // Show warning if some medications were skipped
      if (skippedMedications.length > 0) {
        toast.warning(`Skipped ${skippedMedications.length} invalid medication(s): ${skippedMedications.join(', ')}`);
      }
      
      // Create ONE prescription with ALL items
      if (prescriptionItems.length === 0) {
        toast.error('No valid medications to send. Please check your prescription items.');
        return;
      }
      
      let createdPrescription: Prescription;
      try {
        createdPrescription = await pharmacyService.createPrescription({
          patient: numericPatientId,
          visit: numericVisitId || undefined,
          consultation_session: sessionId,
          doctor: sessionId ? undefined : undefined, // Will be set from request user in backend
          diagnosis: '', // Diagnoses are now saved separately
          notes: medicalNotesAssessment || undefined,
          items: prescriptionItems, // Send ALL items in ONE prescription
        } as any);
        
        toast.success(`Prescription with ${prescriptionItems.length} medication(s) sent to Pharmacy queue`, {
          description: `Patient: ${currentPatient?.name}`
        });
      } catch (err: any) {
        console.error('Error creating prescription:', err);
        toast.error(`Failed to send prescription to pharmacy: ${err.message || 'Unknown error'}`);
        return; // Don't update status if creation failed
      }
      
      setPrescriptions(prev => prev.map(rx => rx.status === 'Draft' ? { ...rx, prescriptionId: createdPrescription.id, status: 'Sent to Pharmacy' } : rx));
      setPrescriptionsSentToPharmacy(true);

      if (Number.isFinite(numericPatientId) && loadPatientOverview) {
        void loadPatientOverview(numericPatientId);
      }
    } catch (err: any) {
      console.error('Error sending prescriptions:', err);
      toast.error(err.message || 'Failed to send prescriptions to pharmacy');
    }
  };

  const cancelSentPrescription = async (prescriptionId?: number | string) => {
    if (!prescriptionId) {
      toast.error('Prescription reference is not available. Refresh and try again.');
      return;
    }

    const confirmed = window.confirm('Cancel this prescription in the pharmacy queue? This is only allowed before any medication is dispensed.');
    if (!confirmed) return;

    try {
      await pharmacyService.cancelPrescription(prescriptionId, 'Cancelled from consultation');
      setPrescriptions((prev) =>
        prev.map((rx) =>
          String(rx.prescriptionId) === String(prescriptionId)
            ? { ...rx, status: 'Cancelled' }
            : rx
        )
      );
      toast.success('Prescription cancelled');
    } catch (err: any) {
      toast.error(err?.message || 'Could not cancel prescription');
    }
  };

  const openAddPrescriptionModal = (initialItems?: PrescriptionOrderItemInput[]) => {
    setPrescriptionModalInitialItems(initialItems);
    setPrescriptionModalInitialPriority(undefined);
    setPrescriptionModalIntent(initialItems?.length ? null : 'add');
    setShowAddPrescription(true);
  };

  const handlePrescriptionModalOpenChange = (open: boolean) => {
    setShowAddPrescription(open);
    if (!open) {
      setPrescriptionModalInitialItems(undefined);
      setPrescriptionModalInitialPriority(undefined);
      setPrescriptionModalIntent(null);
    }
  };

  const handleRefillContinue = (items: PrescriptionOrderItemInput[]) => {
    setPrescriptionModalInitialItems(items);
    setPrescriptionModalInitialPriority('Routine');
    setPrescriptionModalIntent('refill');
    setShowAddPrescription(true);
  };

  const editPrescription = (index: number) => {
    const rx = prescriptions[index];
    if (!rx || rx.status !== 'Draft') return;

    const initial = localDraftToOrderInput(rx);
    if (!initial) {
      toast.error('Cannot edit this draft — missing generic. Remove and add again.');
      return;
    }

    setPrescriptionModalInitialItems([initial]);
    const priority =
      rx.priority === 'Urgent' || rx.priority === 'STAT' ? rx.priority : 'Routine';
    setPrescriptionModalInitialPriority(priority);
    setPrescriptionModalIntent('edit');
    setPrescriptions(prescriptions.filter((_, i) => i !== index));
    setShowAddPrescription(true);
  };

  const handleAddPrescriptionToOrder = async (payload: PrescriptionOrderSubmitInput) => {
    if (payload.items.length === 0) {
      toast.error('Please select at least one medication');
      return;
    }

    const createdAt = Date.now();
    // Strict generic-only: every item from PrescriptionOrderModal carries a
    // GenericMedication PK in `item.generic`. No brand is selected at prescribing
    // time — the pharmacist chooses the brand from dispensary inventory later.
    const nextPrescriptions: Array<ReturnType<typeof buildDraft>> = [];
    const rejected: string[] = [];

    function buildDraft(item: PrescriptionOrderSubmitInput['items'][number], index: number, genericPk: number) {
      const unit = (item.unit || 'tablet').trim();
      const doseValue = (item.dosage || '').trim();
      const normalizedDose = doseValue ? `${doseValue} ${unit}`.trim() : `1 ${unit}`.trim();
      return {
        id: `RX-${createdAt}-${genericPk}-${index}`,
        medication: item.medication_name || 'Medication',
        genericId: genericPk,
        brandMedicationId: undefined as number | undefined,
        medicationId: genericPk,
        genericName: item.medication_name || 'Medication',
        unit,
        strength: item.strength || '',
        form: item.dosage_form || '',
        dose: normalizedDose,
        dosage: normalizedDose,
        frequency: item.frequency || 'Once daily (OD)',
        duration: item.duration || 'As directed',
        quantity: item.quantity || 1,
        route: item.route || 'Oral',
        instructions: (item.instructions || payload.clinicalIndication || '').trim(),
        priority: payload.priority,
        status: 'Draft' as const,
      };
    }

    payload.items.forEach((item, index) => {
      const genericPk =
        typeof item.generic === 'number' && Number.isFinite(item.generic) && item.generic > 0
          ? item.generic
          : null;
      if (!genericPk) {
        rejected.push(item.medication_name || `item #${index + 1}`);
        return;
      }
      nextPrescriptions.push(buildDraft(item, index, genericPk));
    });

    if (rejected.length > 0) {
      toast.error(
        `Skipped ${rejected.length} item(s) without a valid generic: ${rejected.join(', ')}. Re-select them from the generics catalogue.`
      );
    }
    if (nextPrescriptions.length === 0) return;

    setPrescriptions((prev) => [...prev, ...nextPrescriptions]);
    toast.success(`${nextPrescriptions.length} medication(s) added to consultation`, {
      description: 'Prescriptions will be sent to pharmacy when consultation is completed'
    });
  };

  // Toggle lab template selection
  const toggleLabTemplateSelection = (template: any) => {
    const templateId = template.id;
    setSelectedLabTemplates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(templateId)) {
        newSet.delete(templateId);
      } else {
        newSet.add(templateId);
        // Keep dropdown open and search so user can multi-select
      }
      return newSet;
    });
  };

  const slugLabCodeFromName = (name: string) =>
    name
      .trim()
      .substring(0, 24)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "LAB";

  // Add selected lab templates to draft order (like prescriptions)
  const addLabOrder = () => {
    if (selectedLabTemplates.size === 0) {
      toast.error('Please select at least one test');
      return;
    }
    
    // Resolve selected rows from full list or pinned "Other" template
    const selectedTemplates = Array.from(selectedLabTemplates)
      .map((id) =>
        labTemplates.find((t) => t.id === id) ||
        (otherLabPinnedTemplate?.id === id ? otherLabPinnedTemplate : null)
      )
      .filter((t): t is ServiceLabTemplate => !!t);
    const hasOther = selectedTemplates.some(
      (t) => (t.code || "").toUpperCase() === LAB_OTHER_TEMPLATE_CODE
    );
    if (hasOther && !newLabOrder.notes?.trim()) {
      toast.error('Clinical indication is required when you select "Other". Describe the exact test for the laboratory.');
      return;
    }
    
    // Add to draft lab orders (not sent yet)
    const newOrders = selectedTemplates.map(template => ({
      id: `LAB-${Date.now()}-${template.id}`,
      test: template.name,
      testId: template.id,
      code: template.code,
      sampleType: template.sample_type || 'Blood',
      priority: newLabOrder.priority,
      notes: newLabOrder.notes,
      status: 'Draft' as const,
    }));
    
    setLabOrders([...labOrders, ...newOrders]);
    setSelectedLabTemplates(new Set());
    setLabTemplateSearch("");
    setNewLabOrder({ test: "", priority: "Routine", notes: "" });
    setShowAddLabOrder(false);
    toast.success(`${selectedTemplates.length} test(s) added to order`);
  };

  // Send all draft lab orders to lab (like sendPrescriptionsToPharmacy)
  const sendLabOrdersToLab = async () => {
    const draftOrders = labOrders.filter(order => order.status === 'Draft');
    
    if (draftOrders.length === 0) {
      toast.info("No draft lab orders to send");
      return;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      // Group tests by priority (use the most urgent priority for the order)
      const priorityOrder: Record<string, number> = { 'STAT': 0, 'Urgent': 1, 'Routine': 2 };
      const orderPriority = draftOrders.reduce((highest, order) => {
        const currentPriority = priorityOrder[order.priority] ?? 2;
        const highestPriority = priorityOrder[highest] ?? 2;
        return currentPriority < highestPriority ? order.priority : highest;
      }, 'Routine');
      
      // Combine all notes (or use the first one)
      const combinedNotes = draftOrders.map(o => o.notes).filter(n => n).join('; ') || undefined;
      
      // Create lab order in backend with all selected tests
      const priorityMap: Record<string, 'routine' | 'urgent' | 'stat'> = {
        'Routine': 'routine',
        'Urgent': 'urgent',
        'STAT': 'stat',
      };
      
      const testsData = draftOrders.map(order => ({
        name: order.test,
        code: order.code || slugLabCodeFromName(order.test),
        sample_type: order.sampleType || 'Blood',
        template: order.testId != null ? order.testId : null,
        status: 'pending',
        notes: order.notes || '',
      }));
      
      const clinicFromVisit =
        Array.isArray((currentPatient as any).clinics) && (currentPatient as any).clinics.length > 0
          ? String((currentPatient as any).clinics[0]).trim()
          : '';

      await labService.createOrder({
        patient: numericPatientId as any,
        visit: numericVisitId || undefined,
        consultation_session: sessionId,
        priority: priorityMap[orderPriority] || 'routine',
        clinical_notes: combinedNotes,
        ...(clinicFromVisit ? { clinic: clinicFromVisit } : {}),
        tests_data: testsData as any,
      } as any);
      
      // Update status of sent orders
      setLabOrders(prev => prev.map(order => 
        draftOrders.some(draft => draft.id === order.id)
          ? { ...order, status: 'Sent to Lab' as const }
          : order
      ));
      
      toast.success(`${draftOrders.length} test(s) sent to laboratory`);
    } catch (err: any) {
      console.error('Error creating lab order:', err);
      toast.error(err.message || 'Failed to send lab order');
    }
  };

  const editLabOrder = (index: number) => {
    const orderToEdit = labOrders[index];
    if (!orderToEdit) return;

    if (orderToEdit.testId == null) {
      toast.info("This line has no template link. Remove it and add again from the catalog (use Other + clinical notes if needed).");
      return;
    }

    // Reset modal state first
    setSelectedLabTemplates(new Set());
    setLabTemplateSearch("");
    setShowLabTemplateDropdown(false);
    setNewLabOrder({ test: "", priority: "Routine", notes: "" });

    // Pre-populate the modal with existing order data
    // For lab orders, we need to find the template ID from the test name
    const template = labTemplates.find(t => t.name === orderToEdit.test);
    if (template) {
      setSelectedLabTemplates(new Set([template.id]));
    }

    // Pre-populate clinical indication and priority
    setNewLabOrder({
      test: "",
      priority: orderToEdit.priority || "Routine",
      notes: orderToEdit.notes || ""
    });

    // Remove the old order and open modal
    setLabOrders(labOrders.filter((_, i) => i !== index));
    setShowAddLabOrder(true);

    toast.info(`Editing lab order for ${orderToEdit.test}`);
  };

  // Filter lab templates; pin "Other" (OTHER) at top when not already in matches
  const filteredLabTemplates = useMemo(() => {
    const q = labTemplateSearch.trim().toLowerCase();
    let list = labTemplates.filter((template) => {
      if (!q) return true;
      return (
        template.name?.toLowerCase().includes(q) ||
        template.code?.toLowerCase().includes(q) ||
        template.sample_type?.toLowerCase().includes(q) ||
        (template.description && template.description.toLowerCase().includes(q))
      );
    });
    if (
      otherLabPinnedTemplate &&
      !list.some((t) => t.id === otherLabPinnedTemplate.id)
    ) {
      list = [otherLabPinnedTemplate, ...list];
    }
    return list.slice(0, 20);
  }, [labTemplates, labTemplateSearch, otherLabPinnedTemplate]);

  const roomRadiologyDropdownList = useMemo(() => {
    const q = radiologyTemplateSearch.trim().toLowerCase();
    let list = radiologyTemplates.filter((template: any) => {
      if (!q) return true;
      return (
        (template.name && template.name.toLowerCase().includes(q)) ||
        (template.code && template.code.toLowerCase().includes(q)) ||
        (template.body_part && template.body_part.toLowerCase().includes(q)) ||
        (template.modality && template.modality.toLowerCase().includes(q))
      );
    });
    if (
      otherRadiologyPinnedTemplate &&
      !list.some((t: any) => t.id === otherRadiologyPinnedTemplate.id)
    ) {
      list = [otherRadiologyPinnedTemplate, ...list];
    }
    return list.slice(0, 20);
  }, [radiologyTemplates, radiologyTemplateSearch, otherRadiologyPinnedTemplate]);

  // Add nursing order to draft (like prescriptions, lab orders, and radiology orders)
  const addNursingOrder = () => {
    if (!newNursingOrder.type || !newNursingOrder.instructions) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (newNursingOrder.type === 'Injection' && !newNursingOrder.medication && injectionSelectedIds.size === 0) {
      toast.error('Please select at least one medication for injection');
      return;
    }
    if (newNursingOrder.type === 'Dressing') {
      if (!newNursingOrder.woundLocation) {
        toast.error('Please specify wound location for dressing');
        return;
      }
      if (!newNursingOrder.woundType) {
        toast.error('Please select wound type for dressing');
        return;
      }
    }
    if (newNursingOrder.type === 'Observation Admission') {
      if (!newNursingOrder.ward) {
        toast.error('Please select an observation ward');
        return;
      }
      if (!newNursingOrder.admissionDiagnosis) {
        toast.error('Please enter observation diagnosis');
        return;
      }
      if (!newNursingOrder.presentingComplaint) {
        toast.error('Please enter presenting complaint');
        return;
      }

      // Check if there's already a draft observation admission order
      const existingObservationAdmission = nursingOrders.find(order =>
        order.type === 'Observation Admission' && order.status === 'Draft'
      );
      if (existingObservationAdmission) {
        toast.error('An observation admission order is already in draft. Please send it to nursing first or remove it.');
        return;
      }
    }
    
    const orderId = `NO-${Date.now()}`;

    let medication: string | undefined = newNursingOrder.medication;
    let dosage: string | undefined = newNursingOrder.dosage;
    let route: string | undefined = newNursingOrder.route;
    let instructions: string = newNursingOrder.instructions;

    if (newNursingOrder.type === 'Injection' && injectionSelectedIds.size > 0) {
      const selectedMeds = injectionMedicationResults.filter((m) => injectionSelectedIds.has(m.id.toString()));
      medication = selectedMeds.map((m) => {
        const name = m.name || "";
        const strength = (m.strength || "").toString().trim();
        const dosageForm = (m.dosage_form || "").toString().trim();
        const label = strength && dosageForm
          ? `${name} (${strength}, ${dosageForm})`
          : strength
            ? `${name} (${strength})`
            : dosageForm
              ? `${name} (${dosageForm})`
              : name;
        return label;
      }).join(" + ");
      const doses: string[] = [];
      const freqParts: string[] = [];
      const durParts: string[] = [];
      const instrParts: string[] = [];
      injectionSelectedIds.forEach((id) => {
        const cfg = injectionConfigs.get(id);
        if (!cfg) return;
        const doseText = cfg.dose ? `${cfg.dose} ${cfg.doseUnit}` : "";
        if (doseText) doses.push(doseText);
        if (cfg.frequency) freqParts.push(cfg.frequency);
        if (cfg.durationDays !== "") durParts.push(`${cfg.durationDays} days`);
        if (cfg.instructions?.trim()) instrParts.push(cfg.instructions.trim());
      });
      dosage = doses.join(" + ") || undefined;
      const lastRoute = injectionConfigs.get(Array.from(injectionSelectedIds).pop()!)?.route;
      route = lastRoute || route;
      const combinedInstr = [...instrParts, ...(durParts.length ? [`Duration: ${durParts.join(", ")}`] : []), ...(freqParts.length ? [`Frequency: ${freqParts.join(", ")}`] : [])].filter(Boolean).join(". ");
      instructions = combinedInstr || instructions;
    }

    // Add to draft nursing orders (not sent yet)
    setNursingOrders([...nursingOrders, {
      id: orderId,
      type: newNursingOrder.type as 'Injection' | 'Dressing' | 'IV Infusion' | 'Observation Admission',
      medication: medication || undefined,
      dosage: dosage || undefined,
      route: route || undefined,
      woundLocation: newNursingOrder.woundLocation || undefined,
      woundType: newNursingOrder.woundType || undefined,
      instructions,
      priority: newNursingOrder.priority as 'Routine' | 'Urgent' | 'STAT',
      status: 'Draft',
      // Observation admission fields
      ward: newNursingOrder.ward || undefined,
      admissionDiagnosis: newNursingOrder.admissionDiagnosis || undefined,
      presentingComplaint: newNursingOrder.presentingComplaint || undefined
    }]);
    
    setNewNursingOrder({ type: "", medication: "", dosage: "", route: "Intramuscular (IM)", woundLocation: "", woundType: "", instructions: "", priority: "Routine", ward: "", admissionDiagnosis: "", presentingComplaint: "" });
    setInjectionSelectedIds(new Set());
    setInjectionConfigs(new Map());
    setInjectionMedicationSearch("");
    setShowInjectionMedicationDropdown(false);
    setShowAddNursingOrder(false);
    toast.success("Nursing order added to draft");
  };

  // Send all draft nursing orders to nursing (like sendPrescriptionsToPharmacy, sendLabOrdersToLab, sendRadiologyOrders)
  const sendNursingOrdersToNursing = async (options?: { silentIfNoDraft?: boolean }): Promise<number> => {
    const draftOrders = nursingOrders.filter(order => order.status === 'Draft');
    
    if (draftOrders.length === 0) {
      if (!options?.silentIfNoDraft) toast.info("No draft nursing orders to send");
      return 0;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      throw new Error('No active session. Please start a consultation session first.');
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        throw new Error('Invalid patient ID');
      }
      
      const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
        'Routine': 'low',
        'Urgent': 'high',
        'STAT': 'urgent',
      };
      
      // Send each draft order to backend
      const sendPromises = draftOrders.map(async (order) => {
        // Handle observation admission orders differently
        if (order.type === 'Observation Admission') {
          // Check if patient is already admitted
          try {
            const existingAdmissions = await wardService.getAdmissions({
              patient: numericPatientId,
              status: 'admitted'
            });

            if (existingAdmissions.results && existingAdmissions.results.length > 0) {
              throw new Error(`Patient is already admitted to ${existingAdmissions.results[0].ward_name}. Please discharge first or transfer.`);
            }
          } catch (error: any) {
            if (error.message.includes('already admitted')) {
              throw error;
            }
            // If it's a different error (like network), continue
            console.warn('Could not check existing admissions:', error);
          }

          // Create nursing order only - nurse will do the actual observation admission
          return apiFetch('/nursing/orders/', {
            method: 'POST',
            body: JSON.stringify({
              patient: numericPatientId,
              visit: numericVisitId,
              consultation_session: sessionId,
              ordered_by: orderedByUserId,
              order_type: 'observation admission',
              description: `Observation admission (Day Care) to ${order.ward}. Diagnosis: ${order.admissionDiagnosis}. Presenting complaint: ${order.presentingComplaint || 'N/A'}. ${order.instructions}`,
              frequency: '',
              duration: '',
              status: 'pending',
              priority: priorityMap[order.priority] || 'medium',
            }),
          });
        } else {
          // Regular nursing orders (Injection, Dressing, etc.)
        // Build description from order details
        let description = order.instructions;
        if (order.type === 'Injection' && order.medication) {
          description = `${order.medication} - ${order.dosage || ''} via ${order.route || ''}. ${order.instructions}`;
        } else if (order.type === 'Dressing') {
          description = `${order.woundType || 'Wound'} dressing at ${order.woundLocation || 'site'}. ${order.instructions}`;
        } else if (order.type === 'IV Infusion' && order.medication) {
          description = `IV Infusion: ${order.medication}${order.dosage ? ` — ${order.dosage}` : ''}. ${order.instructions}`;
        }
        
          return apiFetch('/nursing/orders/', {
          method: 'POST',
          body: JSON.stringify({
            patient: numericPatientId,
            visit: numericVisitId,
              consultation_session: sessionId,
              ordered_by: orderedByUserId,
            order_type: order.type,
            description: description,
            frequency: order.type === 'Injection' ? 'As ordered' : '',
            duration: '',
            status: 'pending',
            priority: priorityMap[order.priority] || 'medium',
          }),
        });
        }
      });
      
      await Promise.all(sendPromises);
      
      // Update status of sent orders
      setNursingOrders(prev => prev.map(order => 
        draftOrders.some(draft => draft.id === order.id)
          ? { ...order, status: 'Sent to Nursing' as const }
          : order
      ));
      
      toast.success(`${draftOrders.length} nursing order(s) sent to Nursing Procedures queue`);
      return draftOrders.length;
    } catch (err: any) {
      console.error('Error creating nursing orders:', err);
      toast.error(err.message || 'Failed to send nursing orders');
      throw err;
    }
  };

  const editNursingOrder = (orderId: string) => {
    const orderToEdit = nursingOrders.find(o => o.id === orderId);
    if (!orderToEdit) return;

    // Reset modal state first
    setNewNursingOrder({
      type: "",
      medication: "",
      dosage: "",
      route: "Intramuscular (IM)",
      woundLocation: "",
      woundType: "",
      instructions: "",
      priority: "Routine",
      ward: "",
      admissionDiagnosis: "",
      presentingComplaint: ""
    });

    // Pre-populate the modal with existing order data
    setNewNursingOrder({
      type: orderToEdit.type,
      medication: orderToEdit.medication || "",
      dosage: orderToEdit.dosage || "",
      route: orderToEdit.route || "Intramuscular (IM)",
      woundLocation: orderToEdit.woundLocation || "",
      woundType: orderToEdit.woundType || "",
      instructions: orderToEdit.instructions,
      priority: orderToEdit.priority,
      ward: orderToEdit.ward || "",
      admissionDiagnosis: orderToEdit.admissionDiagnosis || "",
      presentingComplaint: orderToEdit.presentingComplaint || ""
    });

    // Remove the old order and open modal
    setNursingOrders(nursingOrders.filter(o => o.id !== orderId));
    setShowAddNursingOrder(true);

    toast.info(`Editing nursing order for ${orderToEdit.type}`);
  };


  // Referral functions
  const addReferral = async () => {
    if (!newReferral.specialty || !newReferral.facility || !newReferral.reason) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      const apiFacilityType: 'internal' | 'external' | 'specialist' =
        newReferral.facilityType || 'internal';

      await referralService.createReferral({
        patient: numericPatientId,
        visit: numericVisitId || undefined,
        session: sessionId,
        specialty: newReferral.specialty,
        facility: newReferral.facility,
        facility_partner: newReferral.facility_partner,
        facility_type: apiFacilityType,
        reason: newReferral.reason,
        clinical_summary: newReferral.clinicalSummary || undefined,
        urgency: newReferral.priority === 'STAT' ? 'emergency' : newReferral.priority.toLowerCase() as 'urgent' | 'routine' | 'emergency',
        contact_person: newReferral.contactPerson || undefined,
        contact_phone: newReferral.contactPhone || undefined,
      });
      setNewReferral({ specialty: "", facility: "", facilityType: "", facility_partner: null, reason: "", priority: "Routine", clinicalSummary: "", contactPerson: "", contactPhone: "" });
      setShowAddReferral(false);
      onReferralCreated?.();
      toast.success(
        "Referral created as draft."
      );
    } catch (err: any) {
      console.error('Error creating referral:', err);
      toast.error(err.message || 'Failed to create referral');
    }
  };

  // Radiology functions
  // Add radiology order to draft (like prescriptions and lab orders)
  const addRadiologyOrder = () => {
    if (selectedRadiologyTemplates.size === 0 || !newRadiology.clinicalIndication) {
      toast.error('Please select at least one imaging study and provide clinical indication');
      return;
    }

    const selectedTemplates = Array.from(selectedRadiologyTemplates)
      .map((templateId) =>
        radiologyTemplates.find((t) => t.id === templateId) ||
        (otherRadiologyPinnedTemplate?.id === templateId ? otherRadiologyPinnedTemplate : null)
      )
      .filter((t): t is NonNullable<typeof t> => !!t);

    const hasOther = selectedTemplates.some(
      (t) => (t.code || '').toUpperCase() === RAD_OTHER_TEMPLATE_CODE
    );
    if (hasOther && newRadiology.clinicalIndication.trim().length < 8) {
      toast.error(
        'You selected "Other". Add more detail in clinical indication (exact study, region, modality, clinical question).'
      );
      return;
    }
    
    // Add each selected template as a separate order
    const newOrders = selectedTemplates.map((template) => {
      const orderId = `RAD-${template.id}-${Date.now()}`;
      return {
      id: orderId,
        procedure: template.name,
        templateId: template.id,
        category: template.modality || template.category,
        bodyPart: template.body_part || '',
      clinicalIndication: newRadiology.clinicalIndication,
      priority: newRadiology.priority as 'Routine' | 'Urgent' | 'STAT',
      provisionalDiagnosis: newRadiology.provisionalDiagnosis || undefined,
      lmp: newRadiology.lmp || undefined,
        status: 'Draft' as const
      };
    });
    
    setRadiologyOrders([...radiologyOrders, ...newOrders]);

    // Reset form
    setSelectedRadiologyTemplates(new Set());
    setRadiologyTemplateSearch('');
    setNewRadiology({ procedure: "", category: "", bodyPart: "", clinicalIndication: "", priority: "Routine", provisionalDiagnosis: "", lmp: "" });
    setShowAddRadiology(false);
    toast.success(`${newOrders.length} imaging study/studies added to draft`);
  };

  // Send all draft radiology orders to radiology (like sendPrescriptionsToPharmacy and sendLabOrdersToLab)
  const sendRadiologyOrders = async () => {
    const draftOrders = radiologyOrders.filter(r => r.status === 'Draft');
    
    if (draftOrders.length === 0) {
      toast.info("No draft radiology orders to send");
      return;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      // Group studies by priority (use the most urgent priority for the order)
      const priorityOrder: Record<string, number> = { 'STAT': 0, 'Urgent': 1, 'Routine': 2 };
      const orderPriority = draftOrders.reduce((highest, order) => {
        const currentPriority = priorityOrder[order.priority] ?? 2;
        const highestPriority = priorityOrder[highest] ?? 2;
        return currentPriority < highestPriority ? order.priority : highest;
      }, 'Routine');
      
      // Use the first clinical indication only (simplified)
      const combinedClinicalNotes = draftOrders.find(o => o.clinicalIndication)?.clinicalIndication || '';
      const combinedProvisionalDiagnosis = draftOrders.find(o => o.provisionalDiagnosis)?.provisionalDiagnosis || '';
      const combinedLmp = draftOrders.find(o => o.lmp)?.lmp || '';
      
      const priorityMap: Record<string, 'routine' | 'urgent' | 'stat'> = {
        'Routine': 'routine',
        'Urgent': 'urgent',
        'STAT': 'stat',
      };
      
      // Create all studies for the order
      const studiesData = draftOrders.map(order => {
        const template =
          order.templateId != null
            ? radiologyTemplates.find((t) => t.id === order.templateId)
            : radiologyTemplates.find((t) => t.name === order.procedure);
        const studyData: Record<string, unknown> = {
          procedure: order.procedure,
          body_part: template?.body_part || order.bodyPart || '',
          modality: template?.modality || order.category || 'X-Ray',
          status: 'pending',
        };
        const tid = order.templateId ?? template?.id;
        if (tid != null) {
          studyData.template = tid;
        }
        return studyData;
      });
      
      // Create radiology order in backend with all selected studies
      const orderData: any = {
        patient: numericPatientId,
        priority: priorityMap[orderPriority] || 'routine',
        studies_data: studiesData as any,
        visit: numericVisitId,
        consultation_session: sessionId,
        clinical_notes: combinedClinicalNotes,
      };
      if (combinedProvisionalDiagnosis) {
        orderData.provisional_diagnosis = combinedProvisionalDiagnosis;
      }
      if (combinedLmp) {
        orderData.lmp = combinedLmp;
      }

      // Security: Removed console.log to prevent data leakage in production
      // console.log('[Radiology Order] Sending data:', orderData);
      await radiologyService.createOrder(orderData);
      
      // Update status of sent orders
      setRadiologyOrders(prev => prev.map(order => 
        draftOrders.some(draft => draft.id === order.id)
          ? { ...order, status: 'Sent to Radiology' as const }
          : order
      ));
      
      toast.success(`${draftOrders.length} study/studies sent to Radiology department`);
    } catch (err: any) {
      console.error('Error creating radiology order:', err);
      toast.error(err.message || 'Failed to send radiology order');
    }
  };

  // Physiotherapy order functions
  const addPhysioOrder = () => {
    if (!newPhysio.diagnosis.trim()) {
      toast.error('Diagnosis is required');
      return;
    }

    if (editingPhysioIndex !== null) {
      // Editing existing order
      setPhysioOrders(prev => prev.map((order, i) =>
        i === editingPhysioIndex
          ? {
              ...order,
              historyClinicalFindings: newPhysio.historyClinicalFindings.trim(),
              diagnosis: newPhysio.diagnosis.trim(),
              drugHistory: newPhysio.drugHistory.trim(),
              specialInstructions: newPhysio.specialInstructions.trim() || undefined,
              priority: newPhysio.priority,
            }
          : order
      ));
      toast.success('Physiotherapy order updated');
    } else {
      // Adding new order
      const newOrder = {
        id: `physio-${Date.now()}`,
        historyClinicalFindings: newPhysio.historyClinicalFindings?.trim() || '',
        diagnosis: newPhysio.diagnosis.trim(),
        drugHistory: newPhysio.drugHistory?.trim() || '',
        specialInstructions: newPhysio.specialInstructions?.trim() || undefined,
        priority: newPhysio.priority,
        status: 'Draft' as const
      };
      setPhysioOrders(prev => [...prev, newOrder]);
      toast.success('Physiotherapy order added');
    }

    setNewPhysio({
      historyClinicalFindings: "",
      diagnosis: "",
      drugHistory: "",
      specialInstructions: "",
      priority: "normal"
    });
    setEditingPhysioIndex(null);
    setShowAddPhysio(false);
  };

  const editPhysioOrder = (index: number) => {
    const orderToEdit = physioOrders[index];
    setNewPhysio({
      historyClinicalFindings: orderToEdit.historyClinicalFindings || "",
      diagnosis: orderToEdit.diagnosis,
      drugHistory: orderToEdit.drugHistory || "",
      specialInstructions: orderToEdit.specialInstructions || "",
      priority: orderToEdit.priority
    });
    setEditingPhysioIndex(index);
    setShowAddPhysio(true);
  };

  const sendPhysioOrders = async () => {
    const draftOrders = physioOrders.filter(p => p.status === 'Draft');

    if (draftOrders.length === 0) {
      toast.info("No draft physiotherapy orders to send");
      return;
    }

    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }

    try {
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;

      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }

      // Get the highest priority from draft orders
      const priorityOrder: Record<string, number> = { 'stat': 0, 'urgent': 1, 'routine': 2 };
      const orderPriority = draftOrders.reduce((highest, order) => {
        const currentPriority = priorityOrder[order.priority] ?? 2;
        const highestPriority = priorityOrder[highest] ?? 2;
        return currentPriority < highestPriority ? order.priority : highest;
      }, 'routine');

      // Combine all clinical notes
      const combinedClinicalNotes = draftOrders.map(order =>
        `${order.diagnosis}${order.historyClinicalFindings ? ` - ${order.historyClinicalFindings}` : ''}${order.specialInstructions ? ` (${order.specialInstructions})` : ''}`
      ).join('; ');

      // Create separate physiotherapy orders for each draft order
      for (const order of draftOrders) {
        await physioService.createOrder({
          patient: numericPatientId,
          visit: numericVisitId && !isNaN(numericVisitId) ? numericVisitId : undefined,
          history_clinical_findings: order.historyClinicalFindings,
          diagnosis: order.diagnosis,
          drug_history: order.drugHistory,
          special_instructions: order.specialInstructions || undefined,
          priority: order.priority,
          consultation_session: sessionId,
          referral_source: 'doctor',
        } as any);
      }

      // Remove sent drafts from local state and refetch from API so doctor sees real status (pending, scheduled, etc.)
      setPhysioOrders(prev => prev.filter(o => !draftOrders.some(d => d.id === o.id)));
      try {
        const updated = await physioService.getOrders({ consultation_session: sessionId, page_size: MAX_LIST_PAGE_SIZE });
        setPhysioOrdersFromApi(updated?.results ?? []);
      } catch {
        // non-fatal: orders were created
      }

      toast.success(`${draftOrders.length} physiotherapy order(s) sent to Physiotherapy department`);
    } catch (err: any) {
      console.error('Error creating physiotherapy order:', err);
      toast.error(err.message || 'Failed to send physiotherapy order');
    }
  };

  // Eye Care order functions
  const addEyeOrder = () => {
    if (!newEye.diagnosis.trim()) {
      toast.error('Diagnosis is required');
      return;
    }

    if (editingEyeIndex !== null) {
      setEyeOrders(prev => prev.map((order, i) =>
        i === editingEyeIndex
          ? {
              ...order,
              chiefComplaint: newEye.chiefComplaint.trim(),
              diagnosis: newEye.diagnosis.trim(),
              treatmentPlan: newEye.treatmentPlan.trim(),
              specialInstructions: newEye.specialInstructions.trim() || undefined,
              visualAcuityOd: newEye.visualAcuityOd.trim(),
              visualAcuityOs: newEye.visualAcuityOs.trim(),
              visualAcuityOu: newEye.visualAcuityOu.trim(),
              priority: newEye.priority,
            }
          : order
      ));
      toast.success('Eye care order updated');
    } else {
      const newOrder = {
        id: `eye-${Date.now()}`,
        chiefComplaint: newEye.chiefComplaint?.trim() || '',
        diagnosis: newEye.diagnosis.trim(),
        treatmentPlan: newEye.treatmentPlan?.trim() || '',
        specialInstructions: newEye.specialInstructions?.trim() || undefined,
        visualAcuityOd: newEye.visualAcuityOd?.trim() || '',
        visualAcuityOs: newEye.visualAcuityOs?.trim() || '',
        visualAcuityOu: newEye.visualAcuityOu?.trim() || '',
        priority: newEye.priority,
        status: 'Draft' as const
      };
      setEyeOrders(prev => [...prev, newOrder]);
      toast.success('Eye care order added');
    }

    setNewEye({
      chiefComplaint: "",
      diagnosis: "",
      treatmentPlan: "",
      specialInstructions: "",
      visualAcuityOd: "",
      visualAcuityOs: "",
      visualAcuityOu: "",
      priority: "normal"
    });
    setEditingEyeIndex(null);
    setShowAddEye(false);
  };

  const defaultEyeOrderForm = (annual = false) => ({
    chiefComplaint: annual ? "Annual vision screening" : "",
    diagnosis: annual ? "Annual visual acuity screening" : "",
    treatmentPlan: "",
    specialInstructions: "",
    visualAcuityOd: "",
    visualAcuityOs: "",
    visualAcuityOu: "",
    priority: "normal" as const,
  });

  const openAddEyeOrder = () => {
    setEditingEyeIndex(null);
    setNewEye(defaultEyeOrderForm(currentPatient?.visitType === "annual_checkup"));
    setShowAddEye(true);
  };

  const editEyeOrder = (index: number) => {
    const orderToEdit = eyeOrders[index];
    setNewEye({
      chiefComplaint: orderToEdit.chiefComplaint || "",
      diagnosis: orderToEdit.diagnosis,
      treatmentPlan: orderToEdit.treatmentPlan || "",
      specialInstructions: orderToEdit.specialInstructions || "",
      visualAcuityOd: orderToEdit.visualAcuityOd || "",
      visualAcuityOs: orderToEdit.visualAcuityOs || "",
      visualAcuityOu: orderToEdit.visualAcuityOu || "",
      priority: orderToEdit.priority
    });
    setEditingEyeIndex(index);
    setShowAddEye(true);
  };

  const sendEyeOrders = async () => {
    const draftOrders = eyeOrders.filter(p => p.status === 'Draft');

    if (draftOrders.length === 0) {
      toast.info("No draft eye care orders to send");
      return;
    }

    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }

    try {
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;

      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }

      const priorityOrder: Record<string, number> = { 'stat': 0, 'urgent': 1, 'routine': 2 };
      const orderPriority = draftOrders.reduce((highest, order) => {
        const currentPriority = priorityOrder[order.priority] ?? 2;
        const highestPriority = priorityOrder[highest] ?? 2;
        return currentPriority < highestPriority ? order.priority : highest;
      }, 'routine');

      for (const order of draftOrders) {
        await eyeCareService.createOrder({
          patient: numericPatientId,
          visit: numericVisitId && !isNaN(numericVisitId) ? numericVisitId : undefined,
          chief_complaint: order.chiefComplaint,
          diagnosis: order.diagnosis,
          treatment_plan: order.treatmentPlan,
          special_instructions: order.specialInstructions || undefined,
          visual_acuity_od: order.visualAcuityOd || undefined,
          visual_acuity_os: order.visualAcuityOs || undefined,
          visual_acuity_ou: order.visualAcuityOu || undefined,
          priority: orderPriority,
          consultation_session: sessionId,
        } as any);
      }

      setEyeOrders(prev => prev.filter(o => !draftOrders.some(d => d.id === o.id)));
      try {
        const updated = await eyeCareService.getOrders({ consultation_session: sessionId, page_size: MAX_LIST_PAGE_SIZE });
        setEyeOrdersFromApi(updated?.results ?? []);
      } catch {
        // non-fatal: orders were created
      }

      toast.success(`${draftOrders.length} eye care order(s) sent to Eye Care department`);
    } catch (err: any) {
      console.error('Error creating eye care order:', err);
      toast.error(err.message || 'Failed to send eye care order');
    }
  };

  const editRadiologyOrder = (orderId: string) => {
    const orderToEdit = radiologyOrders.find(o => o.id === orderId);
    if (!orderToEdit) return;

    const tid =
      orderToEdit.templateId ??
      radiologyTemplates.find((t) => t.name === orderToEdit.procedure)?.id;
    setSelectedRadiologyTemplates(new Set(tid != null ? [tid] : []));

    // Pre-populate the modal with existing order data
    setNewRadiology({
      procedure: orderToEdit.procedure,
      category: orderToEdit.category,
      bodyPart: orderToEdit.bodyPart,
      clinicalIndication: orderToEdit.clinicalIndication,
      priority: orderToEdit.priority,
      provisionalDiagnosis: orderToEdit.provisionalDiagnosis || "",
      lmp: orderToEdit.lmp || ""
    });

    // Remove the old order and open modal
    setRadiologyOrders(radiologyOrders.filter(o => o.id !== orderId));
    setShowAddRadiology(true);

    toast.info(`Editing radiology order for ${orderToEdit.procedure}`);
  };

  const resetOrderWorkspace = useCallback(() => {
    setDiagnoses([]);
    setPrescriptions([]);
    setLabOrders([]);
    setNursingOrders([]);
    setRadiologyOrders([]);
    setPhysioOrders([]);
    setEyeOrders([]);
    setPhysioOrdersFromApi([]);
    setEyeOrdersFromApi([]);
  }, []);

  const orderDialogsWorkspace = useMemo(
    () => ({
      addEyeOrder,
      addLabOrder,
      addNursingOrder,
      addPhysioOrder,
      addRadiologyOrder,
      addReferral,
      currentPatient,
      diagnoses,
      diagnosisDropdownContainerRef,
      diagnosisNotes,
      diagnosisSearch,
      editingEyeIndex,
      editingPhysioIndex,
      filteredLabTemplates,
      handleAddPrescriptionToOrder,
      handlePrescriptionModalOpenChange,
      handleRefillContinue,
      icd10Codes,
      icd10SearchResults,
      injectionConfigs,
      injectionMedicationDropdownRef,
      injectionMedicationResults,
      injectionMedicationSearch,
      injectionRoutes,
      injectionSelectedIds,
      isSearchingICD10,
      labTemplateDropdownContainerRef,
      labTemplateSearch,
      labTemplates,
      loadingInjectionMedications,
      loadingLabTemplates,
      loadingRadiologyTemplates,
      newEye,
      newLabOrder,
      newNursingOrder,
      newPhysio,
      newRadiology,
      newReferral,
      otherLabPinnedTemplate,
      otherRadiologyPinnedTemplate,
      prescriptionModalInitialItems,
      prescriptionModalInitialPriority,
      prescriptionModalIntent,
      prescriptions,
      radiologyTemplateDropdownContainerRef,
      radiologyTemplateSearch,
      radiologyTemplates,
      radiologyTemplatesError,
      referralReasons,
      referralSpecialties,
      roomRadiologyDropdownList,
      searchICD10Codes,
      searchTimeout,
      selectedDiagnosisType,
      selectedLabTemplates,
      selectedRadiologyTemplates,
      sessionId,
      setDiagnoses,
      setDiagnosisNotes,
      setDiagnosisSearch,
      setEditingEyeIndex,
      setEditingPhysioIndex,
      setIcd10SearchResults,
      setInjectionConfigs,
      setInjectionMedicationResults,
      setInjectionMedicationSearch,
      setInjectionSelectedIds,
      setLabTemplateSearch,
      setNewEye,
      setNewLabOrder,
      setNewNursingOrder,
      setNewPhysio,
      setNewRadiology,
      setNewReferral,
      setRadiologyTemplateSearch,
      setSearchTimeout,
      setSelectedDiagnosisType,
      setSelectedLabTemplates,
      setSelectedRadiologyTemplates,
      setShowAddDiagnosis,
      setShowAddEye,
      setShowAddLabOrder,
      setShowAddNursingOrder,
      setShowAddPhysio,
      setShowAddRadiology,
      setShowAddReferral,
      setShowDiagnosisDropdown,
      setShowInjectionMedicationDropdown,
      setShowLabTemplateDropdown,
      setShowPrescriptionRefill,
      setShowRadiologyTemplateDropdown,
      showAddDiagnosis,
      showAddEye,
      showAddLabOrder,
      showAddNursingOrder,
      showAddPhysio,
      showAddPrescription,
      showAddRadiology,
      showAddReferral,
      showDiagnosisDropdown,
      showInjectionMedicationDropdown,
      showLabTemplateDropdown,
      showPrescriptionRefill,
      showRadiologyTemplateDropdown,
      toggleLabTemplateSelection,
      wards,
    }),
    [
      addEyeOrder,
      addLabOrder,
      addNursingOrder,
      addPhysioOrder,
      addRadiologyOrder,
      addReferral,
      currentPatient,
      diagnoses,
      diagnosisNotes,
      diagnosisSearch,
      editingEyeIndex,
      editingPhysioIndex,
      filteredLabTemplates,
      handleAddPrescriptionToOrder,
      handlePrescriptionModalOpenChange,
      handleRefillContinue,
      icd10Codes,
      icd10SearchResults,
      injectionConfigs,
      injectionMedicationResults,
      injectionMedicationSearch,
      injectionSelectedIds,
      isSearchingICD10,
      labTemplateSearch,
      labTemplates,
      loadingInjectionMedications,
      loadingLabTemplates,
      loadingRadiologyTemplates,
      newEye,
      newLabOrder,
      newNursingOrder,
      newPhysio,
      newRadiology,
      newReferral,
      otherLabPinnedTemplate,
      otherRadiologyPinnedTemplate,
      prescriptionModalInitialItems,
      prescriptionModalInitialPriority,
      prescriptionModalIntent,
      prescriptions,
      radiologyTemplateSearch,
      radiologyTemplates,
      radiologyTemplatesError,
      roomRadiologyDropdownList,
      searchICD10Codes,
      searchTimeout,
      selectedDiagnosisType,
      selectedLabTemplates,
      selectedRadiologyTemplates,
      sessionId,
      wards,
    ],
  );

  return {
    diagnoses,
    setDiagnoses,
    prescriptions,
    setPrescriptions,
    labOrders,
    setLabOrders,
    nursingOrders,
    setNursingOrders,
    radiologyOrders,
    setRadiologyOrders,
    physioOrders,
    setPhysioOrders,
    physioOrdersFromApi,
    eyeOrders,
    setEyeOrders,
    eyeOrdersFromApi,
    draftObservationCount,
    orderDialogsWorkspace,
    loadWards,
    openAddPrescriptionModal,
    sendPrescriptionsToPharmacy,
    cancelSentPrescription,
    sendLabOrdersToLab,
    editLabOrder,
    sendNursingOrdersToNursing,
    editNursingOrder,
    sendRadiologyOrders,
    editRadiologyOrder,
    sendPhysioOrders,
    editPhysioOrder,
    sendEyeOrders,
    editEyeOrder,
    resetOrderWorkspace,
    setShowAddDiagnosis,
    setShowPrescriptionRefill,
    setShowAddLabOrder,
    setShowAddPhysio,
    setShowAddEye,
    setShowAddNursingOrder,
    setShowAddRadiology,
    setShowAddReferral,
    editPrescription,
  };
}

export type ConsultationRoomOrderDialogsWorkspace = ReturnType<
  typeof useConsultationRoomOrders
>["orderDialogsWorkspace"];
