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
  formatOrderDiagnoses,
  parseOrderDiagnoses,
  validateOrderDiagnoses,
  type OrderDiagnosisEntry,
} from "@/lib/consultation/order-diagnoses";
import {
  buildInjectionOrderSummary,
  buildLabDraftOrders,
  buildLabOrderPayloadFromDrafts,
  buildRadiologyDraftOrders,
  buildRadiologyOrderPayloadFromDrafts,
  buildPrescriptionDrafts,
  buildPhysioCreateOrderPayloads,
  buildEyeCreateOrderPayloads,
} from "@/lib/consultation/orders-utils";
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
};


export function useConsultationRoomOrders({
  currentPatient,
  sessionId,
  activeTab,
  opdClinicNames,
  onReferralCreated,
  medicalNotesAssessment = "",
  loadPatientOverview,
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
    testId?: number | string;
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
  const [selectedLabTemplateDetails, setSelectedLabTemplateDetails] = useState<Map<number, ServiceLabTemplate>>(new Map());
  const labTemplateSearchRef = useRef(0);
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
    admissionDiagnoses?: OrderDiagnosisEntry[];
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
    admissionDiagnoses: [] as OrderDiagnosisEntry[],
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
  const [selectedRadiologyTemplateDetails, setSelectedRadiologyTemplateDetails] = useState<Map<number, any>>(new Map());
  const radiologyTemplateSearchRef = useRef(0);
  const [otherRadiologyPinnedTemplate, setOtherRadiologyPinnedTemplate] = useState<any | null>(null);

  // Physiotherapy state
  const [physioOrders, setPhysioOrders] = useState<{
    id: string;
    historyClinicalFindings: string;
    diagnoses: OrderDiagnosisEntry[];
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
    diagnoses: [] as OrderDiagnosisEntry[],
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
    diagnoses: OrderDiagnosisEntry[];
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
    diagnoses: [] as OrderDiagnosisEntry[],
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
    const searchTerm = labTemplateSearch.trim();
    if (!searchTerm) {
      setLabTemplates([]);
      return;
    }
    const requestId = ++labTemplateSearchRef.current;
    const timeout = setTimeout(async () => {
      try {
        setLoadingLabTemplates(true);
        const response = await labService.getTemplates({
          search: searchTerm,
          page_size: CATALOG_SEARCH_PAGE_SIZE,
        });
        if (requestId === labTemplateSearchRef.current) {
          setLabTemplates(response.results || []);
        }
      } catch (err) {
        if (requestId === labTemplateSearchRef.current) {
          debugConsultationRoom('Failed to search lab templates:', err);
          toast.error('Failed to load lab templates. Try another search term.');
          setLabTemplates([]);
        }
      } finally {
        if (requestId === labTemplateSearchRef.current) {
          setLoadingLabTemplates(false);
        }
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [showAddLabOrder, showLabTemplateDropdown, labTemplateSearch]);

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
    const searchTerm = radiologyTemplateSearch.trim();
    if (!searchTerm) {
      setRadiologyTemplates([]);
      return;
    }
    const requestId = ++radiologyTemplateSearchRef.current;
    const timeout = setTimeout(async () => {
      try {
        setLoadingRadiologyTemplates(true);
        setRadiologyTemplatesError(null);
        const templates = await radiologyService.getTemplates({
          search: searchTerm,
          page_size: CATALOG_SEARCH_PAGE_SIZE,
        });
        if (requestId === radiologyTemplateSearchRef.current) {
          setRadiologyTemplates(templates.results || []);
        }
      } catch (err: any) {
        if (requestId === radiologyTemplateSearchRef.current) {
          debugConsultationRoom('Failed to search radiology templates:', err);
          if (isAuthenticationError(err) || err.status === 401 || err.status === 403) {
            setRadiologyTemplatesError('You do not have permission to load radiology templates.');
            toast.error('You do not have permission to load radiology templates.');
          } else {
            setRadiologyTemplatesError('Failed to load radiology templates. Try another search term.');
            toast.error('Failed to load radiology templates. Try another search term.');
          }
          setRadiologyTemplates([]);
        }
      } finally {
        if (requestId === radiologyTemplateSearchRef.current) {
          setLoadingRadiologyTemplates(false);
        }
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [showAddRadiology, showRadiologyTemplateDropdown, radiologyTemplateSearch]);

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

    const { drafts: nextPrescriptions, rejectedLabels: rejected } =
      buildPrescriptionDrafts(payload);

    if (rejected.length > 0) {
      toast.error(
        `Skipped ${rejected.length} item(s) without a valid generic: ${rejected.join(', ')}. Re-select them from the generics catalogue.`
      );
    }
    if (nextPrescriptions.length === 0) return;

    setPrescriptions((prev) => {
      const seen = new Set(
        prev
          .map((row) => row.genericId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      );
      const toAdd: typeof nextPrescriptions = [];
      for (const row of nextPrescriptions) {
        const genericId = row.genericId;
        if (genericId && seen.has(genericId)) continue;
        if (genericId) seen.add(genericId);
        toAdd.push(row);
      }
      if (toAdd.length < nextPrescriptions.length) {
        toast.warning('Skipped duplicate generic(s) already on this consultation order.');
      }
      if (toAdd.length === 0) return prev;
      return [...prev, ...toAdd];
    });
    const addedCount = (() => {
      const seen = new Set(
        prescriptions
          .map((row) => row.genericId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      );
      return nextPrescriptions.filter((row) => {
        const genericId = row.genericId;
        if (!genericId || seen.has(genericId)) return false;
        seen.add(genericId);
        return true;
      }).length;
    })();
    if (addedCount === 0) return;
    toast.success(`${addedCount} medication(s) added to consultation`, {
      description: 'Prescriptions will be sent to pharmacy when consultation is completed'
    });
  };

  // Toggle lab template selection
  const toggleLabTemplateSelection = (template: ServiceLabTemplate) => {
    const templateId = template.id;
    setSelectedLabTemplates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(templateId)) {
        newSet.delete(templateId);
        setSelectedLabTemplateDetails((details) => {
          const next = new Map(details);
          next.delete(templateId);
          return next;
        });
      } else {
        newSet.add(templateId);
        setSelectedLabTemplateDetails((details) => new Map(details).set(templateId, template));
      }
      return newSet;
    });
  };

  const toggleRadiologyTemplateSelection = (template: { id: number }) => {
    const templateId = template.id;
    setSelectedRadiologyTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
        setSelectedRadiologyTemplateDetails((details) => {
          const updated = new Map(details);
          updated.delete(templateId);
          return updated;
        });
      } else {
        next.add(templateId);
        setSelectedRadiologyTemplateDetails((details) => new Map(details).set(templateId, template));
      }
      return next;
    });
  };

  const labTemplatesCatalog = useMemo(() => {
    const byId = new Map<number, ServiceLabTemplate>();
    for (const template of selectedLabTemplateDetails.values()) {
      byId.set(template.id, template);
    }
    for (const template of labTemplates) {
      byId.set(template.id, template);
    }
    if (otherLabPinnedTemplate) {
      byId.set(otherLabPinnedTemplate.id, otherLabPinnedTemplate);
    }
    return Array.from(byId.values());
  }, [selectedLabTemplateDetails, labTemplates, otherLabPinnedTemplate]);

  const radiologyTemplatesCatalog = useMemo(() => {
    const byId = new Map<number, any>();
    for (const template of selectedRadiologyTemplateDetails.values()) {
      byId.set(template.id, template);
    }
    for (const template of radiologyTemplates) {
      byId.set(template.id, template);
    }
    if (otherRadiologyPinnedTemplate) {
      byId.set(otherRadiologyPinnedTemplate.id, otherRadiologyPinnedTemplate);
    }
    return Array.from(byId.values());
  }, [selectedRadiologyTemplateDetails, radiologyTemplates, otherRadiologyPinnedTemplate]);

  // Add selected lab templates to draft order (like prescriptions)
  const addLabOrder = () => {
    if (selectedLabTemplates.size === 0) {
      toast.error('Please select at least one test');
      return;
    }

    const { orders: newOrders, error } = buildLabDraftOrders({
      selectedTemplateIds: selectedLabTemplates,
      labTemplates: labTemplatesCatalog,
      otherPinnedTemplate: otherLabPinnedTemplate,
      otherTemplateCode: LAB_OTHER_TEMPLATE_CODE,
      otherClinicalNotes: newLabOrder.notes,
      priority: newLabOrder.priority,
      createdAtMs: Date.now(),
    });

    if (error) {
      toast.error(error);
      return;
    }
    if (newOrders.length === 0) {
      toast.error('Could not resolve selected tests. Search again and re-select.');
      return;
    }

    setLabOrders([...labOrders, ...newOrders as typeof labOrders]);
    setSelectedLabTemplates(new Set());
    setSelectedLabTemplateDetails(new Map());
    setLabTemplateSearch("");
    setNewLabOrder({ test: "", priority: "Routine", notes: "" });
    setShowAddLabOrder(false);
    toast.success(`${newOrders.length} test(s) added to order`);
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
      
      const labPayload = buildLabOrderPayloadFromDrafts(draftOrders);
      
      const clinicFromVisit =
        Array.isArray((currentPatient as any).clinics) && (currentPatient as any).clinics.length > 0
          ? String((currentPatient as any).clinics[0]).trim()
          : '';

      await labService.createOrder({
        patient: numericPatientId as any,
        visit: numericVisitId || undefined,
        consultation_session: sessionId,
        priority: labPayload.priority,
        clinical_notes: labPayload.clinical_notes,
        ...(clinicFromVisit ? { clinic: clinicFromVisit } : {}),
        tests_data: labPayload.tests_data as any,
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
    const template =
      labTemplatesCatalog.find((t) => t.id === orderToEdit.testId) ||
      labTemplatesCatalog.find((t) => t.name === orderToEdit.test);
    if (template) {
      setSelectedLabTemplates(new Set([template.id]));
      setSelectedLabTemplateDetails(new Map([[template.id, template]]));
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

  // Lab template dropdown: server search results, pin "Other" when relevant
  const filteredLabTemplates = useMemo(() => {
    let list = [...labTemplates];
    if (
      otherLabPinnedTemplate &&
      !list.some((t) => t.id === otherLabPinnedTemplate.id)
    ) {
      list = [otherLabPinnedTemplate, ...list];
    }
    return list.slice(0, 50);
  }, [labTemplates, otherLabPinnedTemplate]);

  const roomRadiologyDropdownList = useMemo(() => {
    let list = [...radiologyTemplates];
    if (
      otherRadiologyPinnedTemplate &&
      !list.some((t: any) => t.id === otherRadiologyPinnedTemplate.id)
    ) {
      list = [otherRadiologyPinnedTemplate, ...list];
    }
    return list.slice(0, 50);
  }, [radiologyTemplates, otherRadiologyPinnedTemplate]);

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
      const diagnosisError = validateOrderDiagnoses(newNursingOrder.admissionDiagnoses);
      if (diagnosisError) {
        toast.error(diagnosisError);
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
      const summary = buildInjectionOrderSummary({
        selectedIds: injectionSelectedIds,
        medications: injectionMedicationResults,
        configs: injectionConfigs,
        fallbackRoute: route,
        fallbackInstructions: instructions,
      });
      medication = summary.medication || medication;
      dosage = summary.dosage || dosage;
      route = summary.route || route;
      instructions = summary.instructions;
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
      admissionDiagnoses: newNursingOrder.admissionDiagnoses.length
        ? [...newNursingOrder.admissionDiagnoses]
        : undefined,
      presentingComplaint: newNursingOrder.presentingComplaint || undefined
    }]);
    
    setNewNursingOrder({ type: "", medication: "", dosage: "", route: "Intramuscular (IM)", woundLocation: "", woundType: "", instructions: "", priority: "Routine", ward: "", admissionDiagnoses: [], presentingComplaint: "" });
    setInjectionSelectedIds(new Set());
    setInjectionConfigs(new Map());
    setInjectionMedicationSearch("");
    setShowInjectionMedicationDropdown(false);
    setShowAddNursingOrder(false);
    if (newNursingOrder.type === 'Observation Admission') {
      toast.message('Observation admission queued. End session to transfer to Nursing/Ward.');
    } else {
      toast.success("Nursing order added to draft");
    }
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
      
      const sendOneDraftOrder = async (order: (typeof draftOrders)[number]) => {
        if (order.type === 'Observation Admission') {
          try {
            const existingAdmissions = await wardService.getAdmissions({
              patient: numericPatientId,
              status: 'admitted',
            });

            if (existingAdmissions.results && existingAdmissions.results.length > 0) {
              throw new Error(
                `Patient is already admitted to ${existingAdmissions.results[0].ward_name}. Please discharge first or transfer.`,
              );
            }
          } catch (error: any) {
            if (error.message.includes('already admitted')) {
              throw error;
            }
            console.warn('Could not check existing admissions:', error);
          }

          const selectedWard = wards.find(
            (w) => String(w.id) === String(order.ward) || String(w.ward_code) === String(order.ward),
          );
          if (!selectedWard?.id) {
            throw new Error('Selected observation ward is invalid. Please edit the order and reselect ward.');
          }
          const primaryDx =
            order.admissionDiagnoses?.find((d) => d.type === 'Primary') || order.admissionDiagnoses?.[0];
          if (!primaryDx) {
            throw new Error('Observation admission requires at least one diagnosis.');
          }
          if (!numericVisitId) {
            throw new Error('Patient has no active visit. Cannot create observation admission.');
          }

          await wardService.createAdmission({
            patient: numericPatientId,
            visit: numericVisitId,
            ward: Number(selectedWard.id),
            admission_type: 'observation',
            admission_diagnosis: `${primaryDx.code} - ${primaryDx.description}`,
            presenting_complaint: order.presentingComplaint || '',
            admission_instructions: order.instructions || '',
          });

          return null;
        }

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
            order_type: order.type,
            description,
            frequency: order.type === 'Injection' ? 'As ordered' : '',
            duration: '',
            status: 'pending',
            priority: priorityMap[order.priority] || 'medium',
          }),
        });
      };

      const observationOrders = draftOrders.filter((o) => o.type === 'Observation Admission');
      const procedureOrders = draftOrders.filter((o) => o.type !== 'Observation Admission');

      // Create admissions first so procedure orders auto-link to the active stay.
      for (const order of observationOrders) {
        await sendOneDraftOrder(order);
      }
      await Promise.all(procedureOrders.map((order) => sendOneDraftOrder(order)));
      
      // Update status of sent orders
      setNursingOrders(prev => prev.map(order => 
        draftOrders.some(draft => draft.id === order.id)
          ? { ...order, status: 'Sent to Nursing' as const }
          : order
      ));
      
      const observationCount = draftOrders.filter((o) => o.type === 'Observation Admission').length;
      const procedureCount = draftOrders.length - observationCount;
      if (observationCount > 0 && procedureCount === 0) {
        toast.success(
          observationCount === 1
            ? 'Observation admission created — continue care in Ward Care'
            : `${observationCount} observation admissions created — continue care in Ward Care`,
        );
      } else if (observationCount > 0) {
        toast.success(
          `${procedureCount} procedure order(s) sent to Nursing; ${observationCount} observation admission(s) created in Ward Care`,
        );
      } else {
        toast.success(`${draftOrders.length} nursing order(s) sent to Nursing Procedures queue`);
      }
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
      admissionDiagnoses: [],
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
      admissionDiagnoses: orderToEdit.admissionDiagnoses ? [...orderToEdit.admissionDiagnoses] : [],
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

    const { orders: newOrders, error } = buildRadiologyDraftOrders({
      selectedTemplateIds: selectedRadiologyTemplates,
      radiologyTemplates: radiologyTemplatesCatalog,
      otherPinnedTemplate: otherRadiologyPinnedTemplate,
      otherTemplateCode: RAD_OTHER_TEMPLATE_CODE,
      clinicalIndication: newRadiology.clinicalIndication,
      otherClinicalIndicationMinLen: 8,
      priority: newRadiology.priority as 'Routine' | 'Urgent' | 'STAT',
      provisionalDiagnosis: newRadiology.provisionalDiagnosis || undefined,
      lmp: newRadiology.lmp || undefined,
      createdAtMs: Date.now(),
    });

    if (error) {
      toast.error(error);
      return;
    }
    if (newOrders.length === 0) {
      toast.error('Could not resolve selected studies. Search again and re-select.');
      return;
    }

    setRadiologyOrders([...radiologyOrders, ...newOrders as typeof radiologyOrders]);

    // Reset form
    setSelectedRadiologyTemplates(new Set());
    setSelectedRadiologyTemplateDetails(new Map());
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
      
      const radiologyPayload = buildRadiologyOrderPayloadFromDrafts(
        draftOrders,
        radiologyTemplatesCatalog,
      );

      const orderData: any = {
        patient: numericPatientId,
        priority: radiologyPayload.priority,
        studies_data: radiologyPayload.studies_data as any,
        visit: numericVisitId,
        consultation_session: sessionId,
        clinical_notes: radiologyPayload.clinical_notes,
      };
      if (radiologyPayload.provisional_diagnosis) {
        orderData.provisional_diagnosis = radiologyPayload.provisional_diagnosis;
      }
      if (radiologyPayload.lmp) {
        orderData.lmp = radiologyPayload.lmp;
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
    const diagnosisError = validateOrderDiagnoses(newPhysio.diagnoses);
    if (diagnosisError) {
      toast.error(diagnosisError);
      return;
    }
    const diagnosisText = formatOrderDiagnoses(newPhysio.diagnoses);

    if (editingPhysioIndex !== null) {
      // Editing existing order
      setPhysioOrders(prev => prev.map((order, i) =>
        i === editingPhysioIndex
          ? {
              ...order,
              historyClinicalFindings: newPhysio.historyClinicalFindings.trim(),
              diagnoses: [...newPhysio.diagnoses],
              diagnosis: diagnosisText,
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
        diagnoses: [...newPhysio.diagnoses],
        diagnosis: diagnosisText,
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
      diagnoses: [],
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
      diagnoses: orderToEdit.diagnoses?.length
        ? [...orderToEdit.diagnoses]
        : parseOrderDiagnoses(orderToEdit.diagnosis),
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

      const physioPayloads = buildPhysioCreateOrderPayloads(draftOrders, {
        patientId: numericPatientId,
        visitId: numericVisitId,
        sessionId,
      });
      for (const payload of physioPayloads) {
        await physioService.createOrder(payload as any);
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
    const diagnosisError = validateOrderDiagnoses(newEye.diagnoses);
    if (diagnosisError) {
      toast.error(diagnosisError);
      return;
    }
    const diagnosisText = formatOrderDiagnoses(newEye.diagnoses);

    if (editingEyeIndex !== null) {
      setEyeOrders(prev => prev.map((order, i) =>
        i === editingEyeIndex
          ? {
              ...order,
              chiefComplaint: newEye.chiefComplaint.trim(),
              diagnoses: [...newEye.diagnoses],
              diagnosis: diagnosisText,
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
        diagnoses: [...newEye.diagnoses],
        diagnosis: diagnosisText,
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
      diagnoses: [],
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
    diagnoses: annual
      ? [{ type: 'Primary' as const, code: '', description: 'Annual visual acuity screening' }]
      : ([] as OrderDiagnosisEntry[]),
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
      diagnoses: orderToEdit.diagnoses?.length
        ? [...orderToEdit.diagnoses]
        : parseOrderDiagnoses(orderToEdit.diagnosis),
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

      const eyePayloads = buildEyeCreateOrderPayloads(draftOrders, {
        patientId: numericPatientId,
        visitId: numericVisitId,
        sessionId,
      });
      for (const payload of eyePayloads) {
        await eyeCareService.createOrder(payload as any);
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
      radiologyTemplatesCatalog.find((t) => t.name === orderToEdit.procedure)?.id;
    const template =
      (tid != null ? radiologyTemplatesCatalog.find((t) => t.id === tid) : undefined) ||
      radiologyTemplatesCatalog.find((t) => t.name === orderToEdit.procedure);
    setSelectedRadiologyTemplates(new Set(tid != null ? [tid] : []));
    if (template) {
      setSelectedRadiologyTemplateDetails(new Map([[template.id, template]]));
    } else {
      setSelectedRadiologyTemplateDetails(new Map());
    }

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
      selectedLabTemplateDetails,
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
      selectedRadiologyTemplateDetails,
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
      setSelectedLabTemplateDetails,
      setSelectedRadiologyTemplates,
      setSelectedRadiologyTemplateDetails,
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
      toggleRadiologyTemplateSelection,
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
      selectedLabTemplateDetails,
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
      selectedRadiologyTemplateDetails,
      radiologyTemplatesError,
      roomRadiologyDropdownList,
      searchICD10Codes,
      searchTimeout,
      selectedDiagnosisType,
      selectedLabTemplates,
      selectedRadiologyTemplates,
      sessionId,
      toggleLabTemplateSelection,
      toggleRadiologyTemplateSelection,
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
