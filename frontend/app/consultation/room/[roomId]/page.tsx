"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle, Clock, FileText, History, Loader2, MapPin, Pill, Plus, Save, Stethoscope, Syringe, TestTube, User, Users, X, Send, ScanLine, TrendingUp, TrendingDown, Minus, Building2, UserPlus, Calendar, Phone, Mail, Heart, Download, Eye, Printer, ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Thermometer, Edit, DoorOpen, UserX, Wind, Zap, Scale, Search, Lightbulb, Target } from "lucide-react";
import { toast } from "sonner";
import { roomService, patientService, pharmacyService, labService, radiologyService, physioService, referralService, consultationService, appointmentService, wardService, type ConsultationSession, type ICD10Code, type Diagnosis, type RadiologyReport as ServiceRadiologyReport, type VitalReading, type Prescription, type LabTemplate as ServiceLabTemplate, type Medication, type PhysioSession } from '@/lib/services';
import { sanitizePatientForRendering } from '@/lib/services/patient-service';

// Extended interface for local usage
interface ExtendedConsultationSession extends ConsultationSession {
  date?: string;
  time?: string;
  clinic?: string;
  name?: string;
  patientId?: string;
  age?: number;
  gender?: string;
  doctorSpecialty?: string;
  duration?: number;
  vitals?: any[];
  diagnoses?: any[];
  prescriptions?: any[];
  labOrders?: any[];
  radiologyOrders?: any[];
  physioOrders?: any[];
  nursingOrders?: any[];
  followUp?: any;
  outcome?: string;
}
import { apiFetch } from '@/lib/api-client';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { getPriorityLabel, getPriorityColor } from '@/lib/utils/priority';
import { PatientAvatar } from '@/components/PatientAvatar';
import { VitalsDetailModal } from '@/components/VitalsDetailModal';
import { useCurrentUser } from '@/hooks/use-current-user';
import { NPA_BRAND_NAME } from '@/lib/branding';
import {
  ADMINISTRATION_ROUTES,
  INJECTION_ROUTES,
  WOUND_TYPES,
  DRESSING_SUPPLIES,
  IV_FLUIDS,
  RADIOLOGY_PROCEDURES,
  REFERRAL_SPECIALTIES,
  REFERRAL_FACILITIES,
  REFERRAL_REASONS
} from '@/lib/constants/medical-data';
import { getOrganizationHeader, getOrganizationLabHeader, getOrganizationServicesHeader } from '@/lib/constants/organization';
import { LARGE_PAGE_SIZE } from '@/lib/constants/ui';
import { safeAsync, logError } from '@/lib/utils/error-handling';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

const debugConsultationRoom = (...args: any[]) => {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage?.getItem('debug_consultation_room') === '1') {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  } catch {
    // ignore
  }
};

// Helper to safely access extended session properties
const getSessionProperty = (session: ExtendedConsultationSession | null, property: keyof ExtendedConsultationSession): any[] => {
  if (!session) return [];
  const value = session[property];
  return Array.isArray(value) ? value : [];
};

// Safe date formatting utility
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString();
  } catch {
    return 'Invalid Date';
  }
};

const formatTime = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Time';
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  } catch {
    return 'Invalid Time';
  }
};

const formatPriority = (p: string | undefined): string => {
  if (p == null || p === '') return '';
  const s = String(p).toLowerCase();
  if (s === 'stat') return 'STAT';
  if (s === 'urgent') return 'Urgent';
  if (s === 'routine') return 'Routine';
  return String(p);
};

const formatVitalDisplay = (key: string, value: unknown): string => {
  if (value == null || value === '') return '';
  if (key === 'recordedAt' || key === 'recorded_at' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)))
    return formatDate(String(value)) + ' ' + formatTime(String(value));
  return String(value);
};

const vitalLabel = (key: string): string => {
  if (key === 'recordedAt' || key === 'recorded_at') return 'Recorded at';
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

// ==========================================
// TYPE DEFINITIONS
// ==========================================

interface MedicationConfig {
  id: number;
  name: string;
  strength: string;
  form: string;
  route: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  unit?: string;
  durationDays?: number;
  quantity?: number;
  generic_name?: string;
  genericName?: string;
  category?: string;
  dosageForm?: string;
  priority?: string;
}

interface LabTemplate {
  id: number;
  name: string;
  code?: string;
  sample_type?: string;
  description?: string;
  tests: Array<{
    id: number;
    name: string;
    unit?: string;
    reference_range?: string;
  }>;
}

interface WardAdmission {
  id: number;
  admission_id: string;
  ward_name: string;
  bed_number?: string;
  admission_date: string;
  admission_type: string;
  status: string;
  admission_diagnosis?: string;
  length_of_stay?: number;
}

interface VitalsData {
  id: string;
  date: string;
  time: string;
  systolic: number;
  diastolic: number;
  heartRate: number;
  temperature: number;
  respiratoryRate: number;
  oxygenSaturation: number;
  weight?: number;
  height?: number;
  bmi?: number;
  painScale?: number;
  bloodSugar?: number;
  recordedBy?: string;
  recordedAt?: string;
  bloodPressure?: string;
  notes?: string;
}

interface LabTestResult {
  id: number;
  test_name?: string;
  result?: string;
  unit?: string;
  reference_range?: string;
  status?: string;
  completed_at?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  criticalValue?: boolean;
  date?: string;
  category?: string;
  test?: string;
  specimenType?: string;
  orderedBy?: string;
  collectedAt?: string;
  reportedAt?: string;
  performedBy?: string;
  verifiedBy?: string;
  parameters?: any[];
  interpretation?: string;
  clinicalNotes?: string;
  resultFile?: {
    name: string;
    url: string;
    type: string;
  } | null;
  hasManualResults?: boolean;
  hasUploadedFile?: boolean;
}

interface RadiologyReport {
  id: number;
  study: string;
  result?: string;
  status?: string;
  reported_at?: string;
}

// Types
interface Patient {
  id: string;
  visitId: string;
  patientId: string;
  name: string;
  age: number;
  gender: string;
  mrn: string;
  personalNumber?: string;
  allergies: string[];
  waitTime: number;
  vitalsCompleted: boolean;
  priority: "Emergency" | "High" | "Medium" | "Low";
  visitDate: string;
  visitTime: string;
  queuePosition?: number;
  bloodGroup?: string;
  genotype?: string;
  employeeType?: string;
  division?: string;
  location?: string;
  phone?: string;
  email?: string;
  occupation?: string;
  religion?: string;
  tribe?: string;
  photo?: string | null;
  vitals?: { temperature: string; bloodPressure: string; heartRate: string; respiratoryRate: string; oxygenSaturation: string; weight: string; height: string; recordedAt: string };
}

interface ConsultationRoom {
  id: string;
  name: string;
  status: "available" | "occupied";
  currentPatient?: string;
  startTime?: string;
  doctor?: string;
  specialtyFocus?: string;
  totalConsultationsToday: number;
  averageConsultationTime: number;
  queue: { patient_id: string; position: number }[];
}

// Consultation room, patient, and medication data will be loaded from API

// Medications are loaded from the API - no demo medications needed

const frequencyToDailyDoses: Record<string, number> = {
  'Once daily (OD)': 1,
  'Twice daily (BD)': 2,
  'Three times daily (TDS)': 3,
  'Four times daily (QDS)': 4,
  'Every 6 hours (Q6H)': 4,
  'Every 8 hours (Q8H)': 3,
  'Every 12 hours (Q12H)': 2,
  'At bedtime (Nocte)': 1,
  'As needed (PRN)': 2, // Estimate 2 doses per day
  'Weekly': 0.14, // 1/7
  'STAT (Single dose)': 0, // Special case
};

// Medical constants are now imported from @/lib/constants/medical-data
const injectionRoutes = INJECTION_ROUTES;
const woundTypes = WOUND_TYPES;
const dressingSupplies = DRESSING_SUPPLIES;
const ivFluids = IV_FLUIDS;

// Referral data
const referralSpecialties = REFERRAL_SPECIALTIES;
const referralFacilities = REFERRAL_FACILITIES;
const referralReasons = REFERRAL_REASONS;

// ICD-10 Codes are now loaded from API

// Radiology data
const radiologyProcedures = RADIOLOGY_PROCEDURES;




// Medical timeline for patient

// Priority utility functions are now imported from @/lib/utils/priority

// Helper function to process vitals consistently
const processVitals = (vitalsData: any) => {
  if (!vitalsData) return undefined;

  // Debug: Log raw vitals data
  debugConsultationRoom('🩺 Processing vitals data:', {
    temperature: vitalsData.temperature,
    blood_pressure_systolic: vitalsData.blood_pressure_systolic,
    blood_pressure_diastolic: vitalsData.blood_pressure_diastolic,
    heart_rate: vitalsData.heart_rate,
    respiratory_rate: vitalsData.respiratory_rate,
    oxygen_saturation: vitalsData.oxygen_saturation,
    weight: vitalsData.weight,
    height: vitalsData.height,
  });

  // Simplified blood pressure processing to match other vitals
  const bloodPressure = (() => {
    const systolic = vitalsData.blood_pressure_systolic?.toString() || '';
    const diastolic = vitalsData.blood_pressure_diastolic?.toString() || '';
    return systolic && diastolic ? `${systolic}/${diastolic}` : '';
  })();

  const processedVitals = {
    temperature: vitalsData.temperature?.toString() || '',
    bloodPressure,
    heartRate: vitalsData.heart_rate?.toString() || '',
    respiratoryRate: vitalsData.respiratory_rate?.toString() || '',
    oxygenSaturation: vitalsData.oxygen_saturation?.toString() || '',
    weight: vitalsData.weight?.toString() || '',
    height: vitalsData.height?.toString() || '',
    recordedAt: vitalsData.recorded_at || new Date().toISOString(),
  };

  debugConsultationRoom('✅ Processed vitals result:', processedVitals);
  return processedVitals;
};

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const roomId = resolvedParams.roomId;
  const { currentUser } = useCurrentUser();


  const [room, setRoom] = useState<ConsultationRoom | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [activeTab, setActiveTab] = useState("notes");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showRoomQueueDialog, setShowRoomQueueDialog] = useState(false);
  const [showWardAdmissionDetail, setShowWardAdmissionDetail] = useState(false);
  const [selectedWardAdmission, setSelectedWardAdmission] = useState<WardAdmission | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [medicalNotes, setMedicalNotes] = useState({ presentationComplaint: "", historyOfPresentIllness: "", physicalExamination: "", assessment: "", plan: "" });
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [icd10Codes, setIcd10Codes] = useState<ICD10Code[]>([]);
  const [icd10SearchResults, setIcd10SearchResults] = useState<ICD10Code[]>([]);
  const [isSearchingICD10, setIsSearchingICD10] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
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
  const [showEditMedicalHistory, setShowEditMedicalHistory] = useState(false);
  const [loadingMedicalHistory, setLoadingMedicalHistory] = useState(false);
  const [showAddDiagnosis, setShowAddDiagnosis] = useState(false);
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [showDiagnosisDropdown, setShowDiagnosisDropdown] = useState(false);
  const [selectedDiagnosisType, setSelectedDiagnosisType] = useState<'Primary' | 'Secondary' | 'Differential'>('Primary');
  const [diagnosisNotes, setDiagnosisNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState<{ 
    id: string;
    medication: string; 
    medicationId?: number; // Store the actual medication ID from database
    genericName: string;
    dosage: string; 
    frequency: string; 
    duration: string; 
    quantity: number;
    route: string;
    instructions: string;
    priority: string;
    status: 'Draft' | 'Sent to Pharmacy' | 'Processing' | 'Dispensed';
  }[]>([]);
  const [showAddPrescription, setShowAddPrescription] = useState(false);
  const [newPrescription, setNewPrescription] = useState({ 
    medication: "", 
    medicationId: undefined as number | undefined, // Store medication ID
    genericName: "",
    dosage: "", 
    frequency: "", 
    duration: "", 
    durationDays: 0,
    quantity: 0,
    route: "Oral",
    instructions: "",
    priority: "Routine",
    notes: ""
  });
  const [medicationSearch, setMedicationSearch] = useState("");
  const [showMedicationDropdown, setShowMedicationDropdown] = useState(false);
  const [selectedMedications, setSelectedMedications] = useState<Set<number>>(new Set()); // Track selected medication IDs for multi-select
  const [medicationConfigs, setMedicationConfigs] = useState<Map<number, MedicationConfig>>(new Map()); // Store medication configurations
  const [prescriptionsSentToPharmacy, setPrescriptionsSentToPharmacy] = useState(false);
  const [medications, setMedications] = useState<any[]>([]); // Store medications or generics from API
  const [loadingMedications, setLoadingMedications] = useState(false);
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

  // Radiology templates
  const [selectedRadiologyTemplates, setSelectedRadiologyTemplates] = useState<Set<number>>(new Set());
  const [nursingOrders, setNursingOrders] = useState<{
    id: string;
    type: 'Injection' | 'Dressing' | 'Ward Admission';
    medication?: string;
    dosage?: string;
    route?: string;
    woundLocation?: string;
    woundType?: string;
    supplies?: string;
    instructions: string;
    priority: 'Routine' | 'Urgent' | 'STAT';
    status: 'Draft' | 'Sent to Nursing' | 'In Progress' | 'Completed';
    // Ward admission fields
    ward?: string;
    admissionType?: string;
    admissionDiagnosis?: string;
    presentingComplaint?: string;
  }[]>([]);
  const [wardAdmissions, setWardAdmissions] = useState<WardAdmission[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [wardSearch, setWardSearch] = useState('');
  const [showAddNursingOrder, setShowAddNursingOrder] = useState(false);
  const [showDischargeDialog, setShowDischargeDialog] = useState(false);
  const [dischargeData, setDischargeData] = useState({
    discharge_type: 'regular',
    discharge_diagnosis: '',
    discharge_notes: '',
    discharge_summary: '',
    follow_up_instructions: ''
  });
  const [newNursingOrder, setNewNursingOrder] = useState({
    type: "" as string,
    medication: "",
    dosage: "",
    route: "Intramuscular (IM)",
    woundLocation: "",
    woundType: "",
    supplies: "",
    instructions: "",
    priority: "Routine",
    ward: "",
    admissionType: "",
    admissionDiagnosis: "",
    presentingComplaint: ""
  });
  const [injectionMedications, setInjectionMedications] = useState<Array<{ id: number; name: string; category?: string; strength?: string; generic_name?: string }>>([]);
  const [loadingInjectionMedications, setLoadingInjectionMedications] = useState(false);

  // Function to open physio order dialog and load sessions
  const openPhysioOrderDialog = async (order: any) => {
    setSelectedPhysioOrder(order);
    setIsPhysioOrderDialogOpen(true);
    setLoadingPhysioSessions(true);

    try {
      const sessionsResponse = await physioService.getSessions({ order: order.id });
      setPhysioOrderSessions(sessionsResponse.results || []);
    } catch (err: any) {
      console.error('Failed to load physio sessions:', err);
      toast.error('Failed to load session details');
      setPhysioOrderSessions([]);
    } finally {
      setLoadingPhysioSessions(false);
    }
  };

  // Load injection medications from API
  useEffect(() => {
    const loadInjectionMedications = async () => {
      try {
        setLoadingInjectionMedications(true);
        // Load injection medications more efficiently using server-side search
        let allMedications: Array<{ id: number; name: string; category?: string; strength?: string; generic_name?: string }> = [];

        // Use server-side search for injection-related medications
        const searchTerms = ['injection', 'inj', 'vial', 'ampoule', 'syringe'];

        const results = await Promise.allSettled(
          searchTerms.map((term) =>
            pharmacyService.getMedications({
              search: term,
              page_size: 30,
            })
          )
        );

        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          const meds = r.value?.results || [];
          if (!Array.isArray(meds) || meds.length === 0) continue;
          const newMeds = meds
            .filter((m: any) => !allMedications.some(existing => existing.id === m.id))
            .map((m: any) => ({
              id: m.id,
              name: m.name,
              category: m.category || '',
              strength: m.strength || '',
              generic_name: m.generic_name || '',
            }));
          allMedications = [...allMedications, ...newMeds];
          if (allMedications.length >= 50) break;
        }

        // Fallback: if no results from search, load a small set and filter client-side
        if (allMedications.length === 0) {
          try {
            const fallbackResponse = await pharmacyService.getMedications({ page_size: 50 });
            allMedications = (fallbackResponse.results || [])
              .filter((m: any) => {
                const nameLower = (m.name || '').toLowerCase();
                const formLower = (m.form || '').toLowerCase();
                return nameLower.includes('injection') || nameLower.includes('inj') ||
                       formLower.includes('injection') || formLower.includes('injectable');
              })
              .map((m: any) => ({
                id: m.id,
                name: m.name,
                category: m.category || '',
                strength: m.strength || '',
                generic_name: m.generic_name || '',
              }));
          } catch (fallbackErr) {
            console.warn('Failed to load fallback medications:', fallbackErr);
            allMedications = [];
          }
        }
        
        // Set medications from API (empty array if none found)
        setInjectionMedications(allMedications);
        if (allMedications.length > 0) {
        } else {
          console.warn('[Nursing Orders] No injection medications found in API');
        }
      } catch (err) {
        console.error('Failed to load injection medications:', err);
        toast.error('Failed to load injection medications. Please try again.');
        setInjectionMedications([]);
      } finally {
        setLoadingInjectionMedications(false);
      }
    };

    if (!showAddNursingOrder) return;
    if (newNursingOrder.type !== 'Injection') return;
    if (injectionMedications.length > 0) return;

    loadInjectionMedications();
  }, [showAddNursingOrder, newNursingOrder.type, injectionMedications.length]);

  // Referral state
  const [referrals, setReferrals] = useState<{
    id: string;
    specialty: string;
    facility: string;
    facilityType: string;
    reason: string;
    urgency: 'Routine' | 'Urgent' | 'Emergency';
    clinicalSummary: string;
    contactPerson?: string;
    contactPhone?: string;
    status: 'Draft' | 'Sent' | 'Accepted' | 'Scheduled' | 'Completed';
  }[]>([]);
  const [showAddReferral, setShowAddReferral] = useState(false);
  const [newReferral, setNewReferral] = useState({
    specialty: "",
    facility: "",
    facilityType: "",
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

  // Physiotherapy state
  const [physioOrders, setPhysioOrders] = useState<{
    id: string;
    diagnosis: string;
    chiefComplaint: string;
    treatmentGoal: string;
    specialInstructions?: string;
    priority: 'routine' | 'urgent' | 'stat';
    status: 'Draft' | 'Sent to Physiotherapy' | 'Scheduled' | 'In Progress' | 'Completed';
  }[]>([]);
  const [physioOrdersFromApi, setPhysioOrdersFromApi] = useState<any[]>([]);
  const [showAddPhysio, setShowAddPhysio] = useState(false);
  const [editingPhysioIndex, setEditingPhysioIndex] = useState<number | null>(null);
  const [newPhysio, setNewPhysio] = useState({
    diagnosis: "",
    chiefComplaint: "",
    treatmentGoal: "",
    specialInstructions: "",
    priority: "routine" as 'routine' | 'urgent' | 'stat'
  });
  const [physioTemplates, setPhysioTemplates] = useState<any[]>([]);
  const [loadingPhysioTemplates, setLoadingPhysioTemplates] = useState(false);

  // Consultation session viewer state
  const [selectedSession, setSelectedSession] = useState<ExtendedConsultationSession | null>(null);
  const [showSessionViewer, setShowSessionViewer] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<string[]>([]);

  // Lab result viewer state
  const [selectedLabResult, setSelectedLabResult] = useState<LabTestResult | null>(null);
  const [showLabResultViewer, setShowLabResultViewer] = useState(false);
  const [expandedLabResults, setExpandedLabResults] = useState<string[]>([]);

  const [selectedPrescription, setSelectedPrescription] = useState<any | null>(null);
  const [showPrescriptionViewer, setShowPrescriptionViewer] = useState(false);
  
  // Vitals detail modal state
  const [selectedVital, setSelectedVital] = useState<VitalsData | null>(null);
  const [isVitalsDetailModalOpen, setIsVitalsDetailModalOpen] = useState(false);
  const [vitalsHistory, setVitalsHistory] = useState<VitalsData[]>([]);
  const [loadingVitals, setLoadingVitals] = useState(false);


  // Real patient history data (instead of demo data)
  const [consultationHistory, setConsultationHistory] = useState<any[]>([]);
  const [labHistory, setLabHistory] = useState<LabTestResult[]>([]);
  const [imagingHistory, setImagingHistory] = useState<ServiceRadiologyReport[]>([]);
  const [prescriptionHistory, setPrescriptionHistory] = useState<any[]>([]);
  const [physioHistory, setPhysioHistory] = useState<any[]>([]);
  const [loadingPatientHistory, setLoadingPatientHistory] = useState(false);

  // Raw data storage (before transformation)
  const [rawConsultations, setRawConsultations] = useState<any[]>([]);
  const [rawPrescriptions, setRawPrescriptions] = useState<Prescription[]>([]);
  const [rawVitals, setRawVitals] = useState<VitalReading[]>([]);
  const [rawLabResults, setRawLabResults] = useState<LabTestResult[]>([]);
  const [rawImagingResults, setRawImagingResults] = useState<ServiceRadiologyReport[]>([]);
  const [rawPhysioResults, setRawPhysioResults] = useState<any[]>([]);
  
  // View vitals details
  const viewVitalsDetails = (vital: any) => {
    setSelectedVital(vital);
    setIsVitalsDetailModalOpen(true);
  };

  // Transform consultations with actual user who performed the action
  const transformConsultations = (consultations: any[]) => {
    return consultations.map((session: any) => ({
      id: session.id?.toString() || '',
      date: formatDate(session.started_at),
      doctor: session.doctor_name || currentUser?.name || 'Unknown Doctor',
      clinic: session.clinic_name || (room as any)?.clinic_name || 'GOPD',
      sessionId: session.session_id || '',
      status: session.status || 'completed',
      started_at: session.started_at,
      ended_at: session.ended_at,
      notes: session.notes || '',
      presentation_complaint: session.presentation_complaint || '',
      assessment: session.assessment || '',
      plan: session.plan || ''
    }));
  };

  // Transform prescriptions with actual user who prescribed
  const transformPrescriptions = (prescriptions: any[]) => {
    return prescriptions.map((rx: any) => {
      // Handle date parsing - API might return different formats
      let formattedDate = '';
      const dateField = rx.prescribed_at || rx.created_at;
      if (dateField) {
        try {
          const date = new Date(dateField);
          if (!isNaN(date.getTime())) {
            formattedDate = date.toLocaleDateString();
          }
        } catch (e) {
          formattedDate = dateField.toString();
        }
      }

      return {
        id: rx.id?.toString() || '',
        date: formattedDate,
        prescriptionId: rx.id?.toString() || '',
        doctor: rx.doctor_name || currentUser?.name || '',
        diagnosis: rx.diagnosis || rx.notes || '',
        medications: (rx.medications || []).map((med: any) => ({
          medication_name: med.medication_name || med.medication || 'Unknown',
          dosage: med.dosage || '',
          frequency: med.frequency || '',
          route: med.route || ''
        })),
        status: rx.status || 'pending'
      };
    });
  };

  // Transform vitals with actual user who recorded them
  const transformVitals = (vitals: any[]): VitalsData[] => {
    return vitals.map((v: any) => ({
      id: v.id?.toString() || '',
      date: formatDate(v.recorded_at),
      time: formatTime(v.recorded_at),
      systolic: v.blood_pressure_systolic || 0,
      diastolic: v.blood_pressure_diastolic || 0,
      heartRate: v.heart_rate || 0,
      temperature: parseFloat(v.temperature) || 0,
      respiratoryRate: v.respiratory_rate || 0,
      oxygenSaturation: parseFloat(v.oxygen_saturation) || 0,
      weight: v.weight ? parseFloat(v.weight) : undefined,
      height: v.height ? parseFloat(v.height) : undefined,
      bmi: v.bmi ? parseFloat(v.bmi) : undefined,
      painScale: 0, // Not in backend model
      bloodSugar: 0, // Not in backend model
      recordedBy: v.recorded_by_name || currentUser?.name || '',
      recordedAt: v.recorded_at || '',
      bloodPressure: v.blood_pressure_systolic && v.blood_pressure_diastolic
        ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}`
        : '',
      notes: v.notes || '',
    }));
  };

  // Transform lab results with actual users who processed/verified them
  const transformLabResults = (labResults: any[]) => {
    return labResults.map((test: any) => {
      // Check if this test has manual results or uploaded file
      const hasManualResults = test.results && Object.keys(test.results).length > 0;
      const hasUploadedFile = test.result_file && test.result_file.name;

      return {
        id: test.id || 0,
        test_name: test.name || 'Unknown Test',
        result: test.results ? Object.values(test.results).join(', ') : '',
        unit: '',
        reference_range: '',
        status: test.status === 'verified' ? 'Normal' : test.status || 'pending',
        completed_at: test.verified_at || test.processed_at,
        rejectedBy: test.rejected_by_name || '',
        rejectedAt: test.rejected_at ? formatDate(test.rejected_at) : '',
        criticalValue: false,
        date: formatDate(test.verified_at || test.processed_at),
        category: test.template_category || 'Unknown',
        test: test.name || 'Unknown Test',
        specimenType: test.sample_type || test.template_sample_type || 'Unknown',
        orderedBy: test.order?.doctor_name || 'Unknown',
        collectedAt: test.collected_at ? formatDate(test.collected_at) : 'N/A',
        reportedAt: test.processed_at ? formatDate(test.processed_at) : 'N/A',
        performedBy: test.processed_by_name || 'Unknown',
        verifiedBy: test.verified_by_name || 'Unknown',
        resultFile: test.result_file ? {
          name: test.result_file.name,
          url: test.result_file.url || `/media/${test.result_file.name}`,
          type: test.result_file.type || 'application/pdf'
        } : null,
        hasManualResults,
        hasUploadedFile,
        parameters: test.results ? Object.entries(test.results).map(([key, value]: [string, any]) => ({
          name: key,
          value: value,
          unit: '',
          referenceRange: '',
          status: 'Normal'
        })) : [],
      };
    });
  };

  // Transform imaging results with actual users who reported/verified them
  const transformImagingResults = (imagingResults: any[]) => {
    return imagingResults.map((report: any) => ({
      id: parseInt(report.id) || 0,
      study: parseInt(report.study) || 0,
      order: parseInt(report.order) || 0,
      patient: parseInt(report.patient) || 0,
      created_at: report.created_at || report.reported_at || new Date().toISOString(),
      overall_status: report.overall_status || report.status || 'normal',
      priority: report.priority || 'medium',
      study_details: report.study_details || undefined,
      order_id: report.order_id || '',
      patient_name: report.patient_name || '',
    }));
  };

  // Update transformations when currentUser changes
  useEffect(() => {
    if (rawConsultations.length > 0) {
      setConsultationHistory(transformConsultations(rawConsultations));
    }
    if (rawPrescriptions.length > 0) {
      setPrescriptionHistory(transformPrescriptions(rawPrescriptions));
    }
    if (rawVitals.length > 0) {
      setVitalsHistory(transformVitals(rawVitals));
    }
    if (rawLabResults.length > 0) {
      setLabHistory(transformLabResults(rawLabResults));
    }
    if (rawImagingResults.length > 0) {
      setImagingHistory(transformImagingResults(rawImagingResults));
    }
    // Transform physio results - they come in the right format from API
    setPhysioHistory(rawPhysioResults);
  }, [currentUser, rawConsultations, rawPrescriptions, rawVitals, rawLabResults, rawImagingResults, rawPhysioResults]);

  // Load real patient history data
  const loadPatientHistory = async (patientId: number) => {
    if (!patientId) return;

    setLoadingPatientHistory(true);
    try {
      // Load consultations history
      const consultationsResponse = await consultationService.getSessions({ patient: patientId });
      const consultations = consultationsResponse.results || [];
      setRawConsultations(consultations || []);

      // Load lab results history
      const labResults = await labService.getCompletedTests({ patient: patientId.toString() });
      setRawLabResults(labResults?.results || []);

      // Load imaging history
      const imagingResults = await radiologyService.getVerifiedReports({ patient: patientId.toString() });
      setRawImagingResults(imagingResults?.results || []);

      // Load prescription history
      const prescriptions = await pharmacyService.getPrescriptions({ patient: patientId.toString() });
      setRawPrescriptions(prescriptions?.results || []);

      // Load vitals history for the History tab
      const vitals = await patientService.getPatientVitals(patientId);
      setRawVitals(vitals);

      // Load physiotherapy history for the History tab
      try {
        const physioOrders = await physioService.getOrders({ patient: patientId.toString() });
        setRawPhysioResults(physioOrders?.results || []);
      } catch (physioErr) {
        console.warn('Could not load physio history:', physioErr);
        setRawPhysioResults([]);
      }

      // Load ward admissions history
      const admissions = await wardService.getAdmissions({ patient: patientId });
      setWardAdmissions(admissions?.results || []);

      // Set the most recent vitals on the current patient for display
      if (vitals.length > 0) {
        const latestVitals = vitals[0];
        setCurrentPatient((prevPatient: Patient | null) => {
          if (!prevPatient) return prevPatient;
          return {
            ...prevPatient,
            vitals: processVitals(latestVitals),
          };
        });
      }

    } catch (error) {
      console.error('Error loading patient history:', error);
      // Set empty arrays on error
      setConsultationHistory([]);
      setLabHistory([]);
      setImagingHistory([]);
      setPrescriptionHistory([]);
      setVitalsHistory([]);
      setPhysioHistory([]);
    } finally {
      setLoadingPatientHistory(false);
    }
  };

  // History tab filters
  const [sessionDateFilter, setSessionDateFilter] = useState<string>('all');
  const [labDateFilter, setLabDateFilter] = useState<string>('all');
  const [labStatusFilter, setLabStatusFilter] = useState<string>('all');
  const [imagingDateFilter, setImagingDateFilter] = useState<string>('all');
  const [imagingStatusFilter, setImagingStatusFilter] = useState<string>('all');
  const [vitalsDateFilter, setVitalsDateFilter] = useState<string>('all');
  const [prescriptionsDateFilter, setPrescriptionsDateFilter] = useState<string>('all');
  const [prescriptionsStatusFilter, setPrescriptionsStatusFilter] = useState<string>('all');
  const [physioSearchQuery, setPhysioSearchQuery] = useState<string>('');
  const [physioDateFilter, setPhysioDateFilter] = useState<string>('all');
  const [physioStatusFilter, setPhysioStatusFilter] = useState<string>('all');
  
  // Pagination state
  const [consultationsPage, setConsultationsPage] = useState(1);
  const [labResultsPage, setLabResultsPage] = useState(1);
  const [imagingPage, setImagingPage] = useState(1);
  const [vitalsPage, setVitalsPage] = useState(1);
  const [prescriptionsPage, setPrescriptionsPage] = useState(1);
  const [consultationsPerPage, setConsultationsPerPage] = useState(10);
  const [labResultsPerPage, setLabResultsPerPage] = useState(10);
  const [imagingPerPage, setImagingPerPage] = useState(10);
  const [vitalsPerPage, setVitalsPerPage] = useState(10);
  const [prescriptionsPerPage, setPrescriptionsPerPage] = useState(10);
  const [physioPage, setPhysioPage] = useState(1);
  const [physioPerPage, setPhysioPerPage] = useState(10);

  // Physio dialog state
  const [selectedPhysioOrder, setSelectedPhysioOrder] = useState<any>(null);
  const [isPhysioOrderDialogOpen, setIsPhysioOrderDialogOpen] = useState(false);
  const [physioOrderSessions, setPhysioOrderSessions] = useState<PhysioSession[]>([]);
  const [loadingPhysioSessions, setLoadingPhysioSessions] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);
  
  // Function to load wards for nursing order form
  const loadWards = async () => {
    try {
      const wardsResponse = await wardService.getWards({ status: 'active' });
      setWards(wardsResponse.results || []);
    } catch (error) {
      console.error('Failed to load wards:', error);
      // Fallback to hardcoded wards if API fails
      setWards([
        { id: 8, ward_code: 'FEMALE-MED', name: 'Female Medical Ward', total_beds: 5, available_beds: 3 },
        { id: 9, ward_code: 'MALE-MED', name: 'Male Medical Ward', total_beds: 5, available_beds: 2 },
        { id: 10, ward_code: 'SURGICAL', name: 'Surgical Ward', total_beds: 10, available_beds: 7 },
        { id: 11, ward_code: 'PEDIATRIC', name: 'Pediatric Ward', total_beds: 8, available_beds: 5 },
        { id: 12, ward_code: 'MATERNITY', name: 'Maternity Ward', total_beds: 6, available_beds: 3 },
      ]);
    }
  };
  
  // Function to refresh only the queue data (for modal refresh)
  const refreshQueueData = async () => {
    setIsRefreshingQueue(true);
    try {
      const numericRoomId = parseInt(roomId);
      if (isNaN(numericRoomId)) {
        return;
      }
      
      // Load queue items for this room
      let queueItems: any[] = [];
      try {
        const roomQueueResult = await apiFetch<any[]>(`/consultation/rooms/${numericRoomId}/queue/`);
        queueItems = Array.isArray(roomQueueResult) ? roomQueueResult : [];
      } catch (err) {
        try {
          const queueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?room=${numericRoomId}&is_active=true&page_size=${LARGE_PAGE_SIZE}`);
          queueItems = queueResult.results || [];
        } catch (filterErr) {
          const allQueueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?is_active=true&page_size=${LARGE_PAGE_SIZE}`);
          const allItems = allQueueResult.results || [];
          queueItems = allItems.filter((item: any) => {
            const itemRoomId = typeof item.room === 'number' ? item.room : parseInt(item.room);
            return itemRoomId === numericRoomId;
          });
        }
      }
      
      // Sort queue by priority
      const sortedQueue = queueItems.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
      });
      
      // Transform queue items to Patient objects
      const transformedPatients = await Promise.all(sortedQueue.map(async (item: any, index: number) => {
        try {
          let visitDate = new Date().toISOString().split('T')[0];
          let visitTime = new Date().toTimeString().slice(0, 5);
            if (item.visit) {
              try {
                if (item.visit_date) visitDate = item.visit_date;
                if (item.visit_time) visitTime = String(item.visit_time).slice(0, 5);
                if (!item.visit_date || !item.visit_time) {
                  const visit = await apiFetch(`/visits/${item.visit}/`) as {
                    date?: string;
                    time?: string;
                  };
                  visitDate = visit.date || visitDate;
                  visitTime = visit.time || visitTime;
                }
              } catch (err) {
                console.warn('Could not load visit details:', err);
              }
            }
            
            // Get latest vitals for the patient (not just for this visit)
            const vitalsData = await safeAsync(
              async () => {
                if (item.latest_vitals) return item.latest_vitals;
                const result = await apiFetch<{ results: any[] }>(`/vitals/?patient=${item.patient}&ordering=-recorded_at&page_size=1`);
                return result.results?.[0] || null;
              },
              null,
              { operation: 'refreshPatientVitals', patientId: item.patient, component: 'ConsultationRoom' }
            );
            
            const queuedAt = new Date(item.queued_at);
            const waitTime = Math.floor((Date.now() - queuedAt.getTime()) / (1000 * 60));
            
            const getPriority = (priorityNum: number): Patient['priority'] => {
              return getPriorityLabel(priorityNum);
            };
            
            // Create the patient object with proper typing
            const patientDetails = item.patient_details;
            const patientData = {
              id: String(item.patient),
              visitId: item.visit ? String(item.visit) : '',
              patient_id: patientDetails?.patient_id || '',
              patientId: patientDetails?.patient_id || String(item.patient),
              full_name: patientDetails?.full_name || '',
              first_name: '',
              surname: '',
              name: patientDetails?.full_name || '',
              age: patientDetails?.age || 0,
              gender: patientDetails?.gender || '',
              mrn: patientDetails?.patient_id || '',
              personal_number: '',
              allergies: [],
            waitTime: waitTime > 0 ? waitTime : 0,
            vitalsCompleted: !!vitalsData,
            priority: getPriority(typeof item.priority === 'number' ? item.priority : parseInt(item.priority) || 0),
            visitDate,
            visitTime,
            queuePosition: index + 1,
              blood_group: patientDetails?.blood_group,
              genotype: undefined,
              employee_type: undefined,
              division: undefined,
              location: undefined,
              phone: patientDetails?.phone,
              email: patientDetails?.email,
              occupation: undefined,
              religion: undefined,
              tribe: undefined,
            photo: patientDetails?.photo || null,
              vitals: processVitals(vitalsData),
            };

            // Sanitize to ensure all fields are proper types for React rendering
            return sanitizePatientForRendering(patientData);
        } catch (err) {
          console.error(`Error loading patient ${item.patient}:`, err);
          return null;
        }
      }));
      
      // Filter out any null results
      const validPatients = transformedPatients.filter((p) => p !== null) as Patient[];
      setPatients(validPatients);
    } catch (err: any) {
      console.error('Error refreshing queue:', err);
      toast.error('Failed to refresh queue');
    } finally {
      setIsRefreshingQueue(false);
    }
  };
  
  const loadRoomData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Convert roomId to integer (it might be a string from URL)
      const numericRoomId = parseInt(roomId);
      if (isNaN(numericRoomId)) {
        setError('Invalid room ID');
        setLoading(false);
        return;
      }
      
      // Load room details
      const roomData = await roomService.getRoom(numericRoomId);
      
      // Load queue items for this room
      // Try the room-specific queue endpoint first, then fallback to filtered query
      let queueItems: any[] = [];
      try {
        // Try the room-specific queue endpoint: /consultation/rooms/{id}/queue/
        const roomQueueResult = await apiFetch<any[]>(`/consultation/rooms/${numericRoomId}/queue/`);
        queueItems = Array.isArray(roomQueueResult) ? roomQueueResult : [];
      } catch (err) {
        console.warn('Room-specific queue endpoint failed, trying filtered endpoint:', err);
        // Fallback: Use filtered queue endpoint
        try {
          const queueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?room=${numericRoomId}&is_active=true&page_size=${LARGE_PAGE_SIZE}`);
          queueItems = queueResult.results || [];
        } catch (filterErr) {
          console.warn('Filtered queue endpoint failed, loading all queue items:', filterErr);
          // Last resort: Load all and filter client-side
          const allQueueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?is_active=true&page_size=${LARGE_PAGE_SIZE}`);
          const allItems = allQueueResult.results || [];
          // Filter by room client-side
          queueItems = allItems.filter((item: any) => {
            const itemRoomId = typeof item.room === 'number' ? item.room : parseInt(item.room);
            const matches = itemRoomId === numericRoomId;
            if (!matches && allItems.length > 0) {
            }
            return matches;
          });
        }
      }
      
        
        // Sort queue by priority (lower number = higher priority), then by queued_at
        const sortedQueue = queueItems.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
        });
        
        // Transform queue items to Patient objects
        const transformedPatients = await Promise.all(sortedQueue.map(async (item: any, index: number) => {
          try {
            // Get visit details if available
            let visitDate = new Date().toISOString().split('T')[0];
            let visitTime = new Date().toTimeString().slice(0, 5);
            
            if (item.visit) {
              try {
                if (item.visit_date) visitDate = item.visit_date;
                if (item.visit_time) visitTime = String(item.visit_time).slice(0, 5);
                if (!item.visit_date || !item.visit_time) {
                  const visit = await apiFetch(`/visits/${item.visit}/`) as {
                    date?: string;
                    time?: string;
                  };
                  visitDate = visit.date || visitDate;
                  visitTime = visit.time || visitTime;
                }
              } catch (err) {
                console.warn('Could not load visit details:', err);
              }
            }
            
            // Get latest vitals for the patient (not just for this visit)
            const vitalsData = await safeAsync(
              async () => {
                if (item.latest_vitals) return item.latest_vitals;
                const result = await apiFetch<{ results: any[] }>(`/vitals/?patient=${item.patient}&ordering=-recorded_at&page_size=1`);
                return result.results?.[0] || null;
              },
              null,
              { operation: 'loadPatientVitals', patientId: item.patient, component: 'ConsultationRoom' }
            );
            
            // Calculate wait time with better error handling
            const queuedAt = new Date(item.queued_at);
            const now = Date.now();
            const waitTimeMs = now - queuedAt.getTime();
            // Ensure wait time is not negative and handle invalid dates
            const waitTime = (!isNaN(waitTimeMs) && waitTimeMs >= 0) ? Math.floor(waitTimeMs / (1000 * 60)) : 0;
            
            // Map priority (integer) to string using centralized utility
            // NOTE: Priority comes from ConsultationQueue model and was automatically set based on visit_type
            // when the patient was added to the queue. No manual priority selection is needed.
            const getPriority = (priorityNum: number): Patient['priority'] => {
              return getPriorityLabel(priorityNum);
            };
            
            // Create the patient object with proper typing
            const patientDetails = item.patient_details;
            const patientData = {
              id: String(item.patient), // Use patient ID from queue, not queue item ID
              visitId: item.visit ? String(item.visit) : '',
              patient_id: patientDetails?.patient_id || '',
              patientId: patientDetails?.patient_id || String(item.patient), // Display ID (e.g., "PAT-2024-001")
              full_name: patientDetails?.full_name || '',
              first_name: '',
              surname: '',
              name: patientDetails?.full_name || '',
              age: patientDetails?.age || 0,
              gender: patientDetails?.gender || '',
              mrn: patientDetails?.patient_id || '',
              personal_number: '',
              allergies: [],
              waitTime: waitTime > 0 ? waitTime : 0,
              vitalsCompleted: !!vitalsData,
              priority: getPriority(typeof item.priority === 'number' ? item.priority : parseInt(item.priority) || 0), // Default to 0 (Emergency) to match backend default
              visitDate,
              visitTime,
              queuePosition: index + 1,
              blood_group: patientDetails?.blood_group,
              genotype: undefined,
              employee_type: undefined,
              division: undefined,
              location: undefined,
              phone: patientDetails?.phone,
              email: patientDetails?.email,
              occupation: undefined,
              religion: undefined,
              tribe: undefined,
              vitals: processVitals(vitalsData),
            };

            // Sanitize to ensure all fields are proper types for React rendering
            return sanitizePatientForRendering(patientData);
          } catch (err) {
            console.error(`Error loading patient ${item.patient}:`, err);
            return null;
          }
        }));
        
        // Filter out any null results
        const validPatients = transformedPatients.filter((p) => p !== null) as Patient[];
        
        // Calculate today's statistics from completed sessions
        let totalConsultationsToday = 0;
        let averageConsultationTime = 0;

        const sessionStats = await safeAsync(
          async () => {
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

            const sessionsResult = await apiFetch<{ results: any[] }>(
              `/consultation/sessions/?room=${numericRoomId}&status=completed&started_at__gte=${startOfDay}&started_at__lte=${endOfDay}&page_size=${LARGE_PAGE_SIZE}`
            );

            const todaySessions = sessionsResult.results || [];
            const consultationsCount = todaySessions.length;
            let avgTime = 0;

            if (todaySessions.length > 0) {
              const totalDuration = todaySessions.reduce((sum, session) => {
                if (session.started_at && session.ended_at) {
                  const duration = Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / (1000 * 60));
                  return sum + Math.max(0, duration); // Ensure non-negative duration
                }
                return sum;
              }, 0);
              avgTime = Math.round(totalDuration / todaySessions.length);
            }

            return { consultationsCount, avgTime };
          },
          { consultationsCount: 0, avgTime: 0 },
          { operation: 'loadSessionStatistics', component: 'ConsultationRoom' }
        );

        totalConsultationsToday = sessionStats.consultationsCount;
        averageConsultationTime = sessionStats.avgTime;
        
        // Transform room data
        const transformedRoom: ConsultationRoom = {
          id: String(roomData.id),
          name: roomData.name,
          status: roomData.status?.toLowerCase() === 'active' ? 'available' as const : 'occupied' as const,
          currentPatient: validPatients.length > 0 ? validPatients[0].name : undefined,
          startTime: undefined,
          doctor: (roomData as any).assigned_doctor || undefined,
          specialtyFocus: roomData.specialty || 'General Practice',
          totalConsultationsToday,
          averageConsultationTime,
          queue: sortedQueue.map((item: any, index: number) => ({
            patient_id: String(item.patient),
            position: index + 1,
          })),
        };
        
        setRoom(transformedRoom);
        setPatients(validPatients);

        
        // Check for active session and restore it
        const activeSession = (roomData as any).active_session;
        if (activeSession && activeSession.id) {
          await restoreActiveSession(activeSession.id);
        }
      } catch (err) {
        console.error('Error loading room data:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load consultation room. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };
  
  // Function to restore active session
  const restoreActiveSession = async (sessionId: number) => {
    try {
      // Security: Removed console.log to prevent session ID exposure
      
      // Load full session data
      const session: ConsultationSession = await consultationService.getSession(sessionId);
      // Security: Removed console.log to prevent session data exposure

      // Load patient data
      const patient = await patientService.getPatient(session.patient);
      // Security: Removed console.log to prevent patient ID exposure
      
      // Load visit data if available
      let visitData: any = null;
      let visitId: string | number | null = null;
      if (session.visit) {
        visitId = session.visit;
        try {
          visitData = await apiFetch(`/visits/${visitId}/`);
          // Security: Removed console.log to prevent visit data exposure

          // Populate session medical notes from visit data if not already set
          if (visitData.clinical_notes && !session.presentation_complaint) {
            session.presentation_complaint = visitData.clinical_notes;
          }
        } catch (visitErr) {
          console.warn('Could not load visit data:', visitErr);
        }
      }
      
      // Restore patient state - create sanitized patient object
      const patientData = {
        id: String(patient.id),
        visitId: visitId ? String(visitId) : '',
        patient_id: patient.patient_id,
        patientId: patient.patient_id || String(patient.id),
        full_name: patient.full_name,
        first_name: patient.first_name,
        surname: patient.surname,
        name: patient.full_name || `${patient.first_name || ''} ${patient.surname || ''}`.trim(),
        age: patient.age || 0,
        gender: patient.gender || '',
        mrn: patient.patient_id || '',
        personal_number: (patient as any).personal_number,
        allergies: patient.allergies ? String(patient.allergies).split(/[,\n]/).map(a => a.trim()).filter(a => a) : [],
        waitTime: 0,
        vitalsCompleted: false,
        priority: 'Medium' as const,
        visitDate: visitData?.date || new Date().toISOString().split('T')[0],
        visitTime: visitData?.time || '',
        blood_group: (patient as any).blood_group,
        genotype: (patient as any).genotype,
        employee_type: (patient as any).employee_type,
        division: (patient as any).division,
        location: (patient as any).location,
        phone: (patient as any).phone,
        email: (patient as any).email,
        occupation: (patient as any).occupation,
        religion: (patient as any).religion,
        tribe: (patient as any).tribe,
        photo: (patient as any).photo || null,
      };
      
      const restoredPatient = sanitizePatientForRendering(patientData) as Patient;
      
      // Load vitals if available (use patient-wide vitals like other functions)
      const vitalsData = await safeAsync(
        () => apiFetch<{ results: any[] }>(`/vitals/?patient=${patient.id}&ordering=-recorded_at&page_size=1`).then(result => result.results?.[0] || null),
        null,
        { operation: 'restorePatientVitals', patientId: patient.id.toString(), component: 'ConsultationRoom' }
      );

      if (vitalsData) {
        restoredPatient.vitals = processVitals(vitalsData);
            restoredPatient.vitalsCompleted = true;
      }
      
      // Restore session state
      setCurrentPatient(restoredPatient);
      setSessionActive(true);
      setSessionId(session.id);
      setSessionStartTime(new Date(session.started_at));
      
      // Calculate session duration
      const now = new Date();
      const startTime = new Date(session.started_at);
      const minutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));
      setSessionDuration(minutes);
      
      // Enrich session with related data
      const enrichedSession: any = { ...session };

      // Load prescriptions for this visit
      if (visitId) {
        try {
          const prescriptionsResult = await apiFetch<{ results: any[] }>(`/pharmacy/prescriptions/?visit=${visitId}&page_size=100`);
          enrichedSession.prescriptions = (prescriptionsResult.results || []).flatMap((p: any) => {
            const items = (p.medications && p.medications.length) ? p.medications : (p.medication_name || p.medication ? [p] : []);
            return items.map((m: any) => ({
              id: String(p.id) + (m.id != null ? '-' + m.id : ''),
              medication: m.medication_name || m.medication?.name || p.medication_name || p.medication || 'Unknown',
              dosage: m.dosage || p.dosage || '',
              frequency: m.frequency || p.frequency || '',
              duration: m.duration || p.duration || '',
              quantity: m.quantity ?? p.quantity ?? 0,
            }));
          });
        } catch (err) {
          console.warn('Could not load prescriptions for session:', err);
          enrichedSession.prescriptions = [];
        }

        // Load lab orders for this visit
        try {
          const labOrdersResult = await apiFetch<{ results: any[] }>(`/laboratory/orders/?visit=${visitId}&page_size=100`);
          enrichedSession.labOrders = (labOrdersResult.results || []).flatMap((order: any) => {
            const tests = order.tests || [];
            if (!tests.length) return [];
            return tests.map((test: any) => ({
              id: `LAB-${order.id}-${test.id}`,
              test: (test.name ?? test.test_name ?? test.template_name ?? '').toString().trim(),
              status: test.status ?? order.status ?? '',
              priority: order.priority ?? '',
              orderedBy: order.doctor_name ?? '',
              createdAt: test.created_at ?? order.ordered_at ?? '',
            }));
          });
        } catch (err) {
          console.warn('Could not load lab orders for session:', err);
          enrichedSession.labOrders = [];
        }

        // Load radiology orders for this visit
        try {
          const radiologyOrdersResult = await apiFetch<{ results: any[] }>(`/radiology/orders/?visit=${visitId}&page_size=100`);
          enrichedSession.radiologyOrders = (radiologyOrdersResult.results || []).flatMap((order: any) => {
            const studies = order.studies || [];
            if (studies.length) {
              return studies.map((s: any) => ({
                id: `RAD-${order.id}-${s.id}`,
                procedure: (s.procedure ?? order.procedure_name ?? order.procedure ?? '').toString().trim(),
                priority: order.priority ?? '',
                status: s.status ?? order.status ?? '',
                finding: s.finding ?? order.finding ?? '',
                orderedBy: order.doctor_name ?? '',
                createdAt: s.created_at ?? order.ordered_at ?? '',
              }));
            }
            const proc = (order.procedure_name ?? order.procedure ?? '').toString().trim();
            if (!proc) return [];
            return [{
              id: String(order.id),
              procedure: proc,
              priority: order.priority ?? '',
              status: order.status ?? '',
              finding: order.finding ?? '',
              orderedBy: order.doctor_name ?? '',
              createdAt: order.ordered_at ?? '',
            }];
          });
        } catch (err) {
          console.warn('Could not load radiology orders for session:', err);
          enrichedSession.radiologyOrders = [];
        }

        // Load nursing orders for this visit
        try {
          const nursingOrdersResult = await apiFetch<{ results: any[] }>(`/nursing/orders/?visit=${visitId}&page_size=100`);
          enrichedSession.nursingOrders = (nursingOrdersResult.results || []).map((order: any) => ({
            id: String(order.id),
            type: order.order_type || order.type || 'General',
            instructions: order.instructions || '',
            status: order.status || 'pending',
            priority: order.priority === 'urgent' ? 'Urgent' : order.priority === 'high' ? 'High' : 'Medium',
            orderedBy: order.ordered_by_name || 'Unknown',
            createdAt: order.created_at || new Date().toISOString(),
          }));
        } catch (err) {
          console.warn('Could not load nursing orders for session:', err);
          enrichedSession.nursingOrders = [];
        }
      } else {
        // No visit ID, set empty arrays
        enrichedSession.prescriptions = [];
        enrichedSession.labOrders = [];
        enrichedSession.radiologyOrders = [];
        enrichedSession.nursingOrders = [];
      }

      // Load physio orders for this session (by consultation_session)
      try {
        const physioOrdersResult = await physioService.getOrders({
          consultation_session: session.id,
          patient: session.patient != null ? String(session.patient) : undefined,
          page_size: 100,
        });
        enrichedSession.physioOrders = (physioOrdersResult.results || []).map((o: any) => ({
          diagnosis: (o.diagnosis ?? o.chief_complaint ?? '').toString().trim(),
          priority: o.priority ?? '',
          status: o.status ?? '',
        }));
      } catch (err) {
        console.warn('Could not load physio orders for session:', err);
        enrichedSession.physioOrders = [];
      }

      // Load vitals for the session viewer
      if (visitId) {
        try {
          const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${visitId}&page_size=10`);
          enrichedSession.vitals = (vitalsResult.results || []).reduce((acc: any, v: any) => {
            acc.temperature = v.temperature || '';
            acc.bloodPressure = v.blood_pressure_systolic && v.blood_pressure_diastolic
              ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}`
              : '';
            acc.heartRate = v.heart_rate || '';
            acc.respiratoryRate = v.respiratory_rate || '';
            acc.oxygenSaturation = v.oxygen_saturation || '';
            acc.weight = v.weight || '';
            acc.height = v.height || '';
            acc.recordedAt = v.recorded_at || '';
            return acc;
          }, {});
        } catch (err) {
          console.warn('Could not load vitals for session:', err);
          enrichedSession.vitals = {};
        }
      } else {
        enrichedSession.vitals = {};
      }

      // Load diagnoses for this session
      try {
        const diagnosesResult = await consultationService.getDiagnoses({
          session: session.id,
          page_size: 100
        });
        const list = diagnosesResult.results || [];
        setDiagnoses(list);
        enrichedSession.diagnoses = list.map((d: any) => ({
          id: d.id,
          code: d.icd10_code_details?.code || '',
          name: d.icd10_code_details?.description || d.diagnosis_text || '',
          type: d.certainty === 'confirmed' ? 'Primary' : d.certainty === 'probable' ? 'Secondary' : 'Differential',
          notes: d.notes || ''
        }));
      } catch (err) {
        console.warn('Could not load diagnoses for session:', err);
        setDiagnoses([]);
        enrichedSession.diagnoses = [];
      }

      // Set the enriched session
      setSelectedSession(enrichedSession);

      // Restore medical notes
      setMedicalNotes({
        presentationComplaint: session.presentation_complaint || '',
        historyOfPresentIllness: session.history_of_presenting_illness || '',
        physicalExamination: session.physical_examination || '',
        assessment: session.assessment || '',
        plan: session.plan || '',
      });
      
      // Load medical history
      try {
        const numericPatientId = typeof patient.id === 'number' ? patient.id : parseInt(patient.id, 10);
        const history = await patientService.getPatientHistory(numericPatientId);
        setMedicalHistory({
          allergies: Array.isArray(history.allergies) ? history.allergies : [],
          diagnoses: Array.isArray(history.diagnoses) ? history.diagnoses : [],
          surgicalHistory: Array.isArray(history.surgical_history) ? history.surgical_history : [],
          familyHistory: Array.isArray(history.family_history) ? history.family_history : [],
          socialHistory: {
            smoking: history.social_history?.smoking || '',
            alcohol: history.social_history?.alcohol || '',
            exercise: history.social_history?.exercise || '',
            occupation: history.social_history?.occupation || '',
          },
        });
      } catch (historyErr) {
        console.warn('Could not load medical history:', historyErr);
        setMedicalHistory({
          allergies: [],
          diagnoses: [],
          surgicalHistory: [],
          familyHistory: [],
          socialHistory: { smoking: '', alcohol: '', exercise: '', occupation: '' },
        });
      }
      
      // Load prescriptions if visit exists
      if (visitId) {
        try {
          const prescriptionsResult = await apiFetch<{ results: any[] }>(`/pharmacy/prescriptions/?visit=${visitId}&page_size=100`);
          // Transform prescriptions for the UI
          const transformedPrescriptions = prescriptionsResult.results?.flatMap((rx: any) => 
            (rx.medications || []).map((item: any) => ({
              id: `RX-${rx.id}-${item.id}`,
              medication: item.medication?.name || item.medication_name || 'Unknown',
              medicationId: item.medication?.id || item.medication_id,
              genericName: item.medication?.generic_name || item.generic_name || '',
                  dosage: item.dosage || '',
                  frequency: item.frequency || '',
                  duration: item.duration || '',
                  quantity: item.quantity || 0,
                  route: item.route || 'Oral',
                  instructions: item.instructions || '',
                  priority: item.priority || 'Routine',
              status: rx.status === 'dispensed' ? 'Dispensed' :
                      rx.status === 'partially_dispensed' ? 'Partially Dispensed' :
                      rx.status === 'pending' ? 'Sent to Pharmacy' :
                      'Draft',
            })) || []
          ) || [];
          setPrescriptions(transformedPrescriptions);
        } catch (prescriptionErr) {
          console.warn('Could not load prescriptions:', prescriptionErr);
        }
      }
      
      // Load lab orders if visit exists
      if (visitId) {
        try {
          const labOrdersResult = await apiFetch<{ results: any[] }>(`/laboratory/orders/?visit=${visitId}&page_size=100`);
          // Transform lab orders - each order has multiple tests
          const transformedLabOrders: typeof labOrders = [];
          labOrdersResult.results?.forEach((order: any) => {
            // Each order can have multiple tests
            (order.tests || []).forEach((test: any) => {
              transformedLabOrders.push({
                id: `LAB-${order.id}-${test.id}`,
                test: test.name || 'Unknown Test',
                testId: test.template,
                code: test.code,
                sampleType: test.sample_type,
                priority: order.priority === 'routine' ? 'Routine' : order.priority === 'urgent' ? 'Urgent' : 'STAT',
                notes: test.notes || order.clinical_notes || '',
                status: 'Sent to Lab' as const, // Already sent if loaded from API
              });
            });
          });
          setLabOrders(transformedLabOrders);
        } catch (labErr) {
          console.warn('Could not load lab orders:', labErr);
        }
        }
      
      // Load radiology orders if visit exists
      if (visitId) {
      try {
          const radiologyOrdersResult = await apiFetch<{ results: any[] }>(`/radiology/orders/?visit=${visitId}&page_size=100`);
          // Transform radiology orders - each order has multiple studies
          const transformedRadiologyOrders: typeof radiologyOrders = [];
          radiologyOrdersResult.results?.forEach((order: any) => {
            // Each order can have multiple studies
            (order.studies || []).forEach((study: any) => {
              transformedRadiologyOrders.push({
                id: `RAD-${order.id}-${study.id}`,
                procedure: study.procedure || 'Unknown Procedure',
                category: study.modality || 'X-Ray',
                bodyPart: study.body_part || '',
                clinicalIndication: order.clinical_notes || '',
                priority: order.priority === 'routine' ? 'Routine' : order.priority === 'urgent' ? 'Urgent' : 'STAT',
                provisionalDiagnosis: order.provisional_diagnosis || undefined,
                lmp: order.lmp || undefined,
                status: 'Sent to Radiology' as const, // Already sent if loaded from API
              });
            });
          });
          setRadiologyOrders(transformedRadiologyOrders);
        } catch (radiologyErr) {
          console.warn('Could not load radiology orders:', radiologyErr);
        }
      }

      // Load nursing orders if visit exists
      if (visitId) {
        try {
          const nursingOrdersResult = await apiFetch<{ results: any[] }>(`/nursing/orders/?visit=${visitId}&page_size=100`);
          // Transform nursing orders
          const transformedNursingOrders: typeof nursingOrders = [];
          nursingOrdersResult.results?.forEach((order: any) => {
            transformedNursingOrders.push({
              id: order.id.toString(),
              type: order.order_type || 'Injection',
              medication: order.description?.split(' - ')[1] || '',
              dosage: order.frequency || '',
              route: 'As ordered',
              woundLocation: order.description?.includes('wound') ? order.description : '',
              woundType: order.description?.includes('wound') ? 'Unknown' : '',
              supplies: order.description?.includes('supplies') ? order.description : '',
              instructions: order.description || '',
              priority: order.priority === 'medium' ? 'Routine' : order.priority === 'high' ? 'Urgent' : 'STAT',
              status: 'Sent to Nursing' as const, // Already sent if loaded from API
            });
          });
          setNursingOrders(transformedNursingOrders);
        } catch (nursingErr) {
          console.warn('Could not load nursing orders:', nursingErr);
        }
      }

      // Load patient history data for the History tab
      loadPatientHistory(session.patient);

      toast.success(`Restored active session with ${restoredPatient.name}`);
      debugConsultationRoom('Session restored successfully');
    } catch (err: any) {
      console.error('Error restoring active session:', err);
      toast.error('Failed to restore active session. You may need to start a new session.');
      // Don't throw - allow the page to load normally
    }
  };

  useEffect(() => {
    loadRoomData();
  }, [roomId]);

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
        page_size: 20  // Limit results for performance
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

  useEffect(() => {
    if (!showAddPrescription && !showMedicationDropdown) return;
    if (loadingMedications) return;
    if (medications.length > 0) return;

    const loadGenerics = async () => {
      try {
        setLoadingMedications(true);
        const response = await pharmacyService.getGenericsForPrescription({ page_size: 200 });
        const loadedGenerics = response.results || [];
        setMedications(loadedGenerics as any);
      } catch (err) {
        debugConsultationRoom('Failed to load generics:', err);
        toast.error('Failed to load medication list.');
      } finally {
        setLoadingMedications(false);
      }
    };

    loadGenerics();
  }, [showAddPrescription, showMedicationDropdown, loadingMedications, medications.length]);

  useEffect(() => {
    if (!showAddDiagnosis) return;
    if (icd10Codes.length > 0) return;

    const loadICD10Codes = async () => {
      try {
        const response = await consultationService.getICD10Codes({ page_size: 100 });
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
        const response = await labService.getTemplates({ page_size: 200 });
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
    if (!showAddRadiology && !showRadiologyTemplateDropdown) return;
    if (radiologyTemplates.length > 0) return;
    const loadRadiologyTemplates = async () => {
      try {
        setLoadingRadiologyTemplates(true);
        setRadiologyTemplatesError(null);
        const templates = await radiologyService.getTemplates({ page_size: 1000 });
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
        const r = await physioService.getOrders({ consultation_session: sessionId, page_size: 100 });
        if (!cancelled) setPhysioOrdersFromApi(r?.results ?? []);
      } catch {
        if (!cancelled) setPhysioOrdersFromApi([]);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Close lab template dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showLabTemplateDropdown && !target.closest('[data-lab-template-dropdown]')) {
        setShowLabTemplateDropdown(false);
      }
      if (showRadiologyTemplateDropdown && !target.closest('[data-radiology-template-dropdown]')) {
        setShowRadiologyTemplateDropdown(false);
      }
      if (showMedicationDropdown && !target.closest('[data-medication-dropdown]')) {
        setShowMedicationDropdown(false);
      }
    };
    
    if (showLabTemplateDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showLabTemplateDropdown, showRadiologyTemplateDropdown, showMedicationDropdown]);
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadRoomData();
      toast.success('Queue refreshed');
    } catch (err) {
      console.error('Error refreshing:', err);
      toast.error('Failed to refresh queue');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!sessionActive || !sessionStartTime) return;
    const interval = setInterval(() => {
      const now = new Date();
      const minutes = Math.floor((now.getTime() - sessionStartTime.getTime()) / (1000 * 60));
      setSessionDuration(minutes);
    }, 60000);
    return () => clearInterval(interval);
  }, [sessionActive, sessionStartTime]);

  // Auto-save medical notes every 30 seconds
  useEffect(() => {
    if (!sessionActive || !sessionId) return;
    
    const autoSave = async () => {
      try {
        await consultationService.updateSession(sessionId, {
          history_of_presenting_illness: medicalNotes.historyOfPresentIllness || '',
          physical_examination: medicalNotes.physicalExamination || '',
          assessment: medicalNotes.assessment || '',
          plan: medicalNotes.plan || '',
        });
        debugConsultationRoom('Auto-saved medical notes');
      } catch (err) {
        console.error('Auto-save failed:', err);
        // Don't show error to user - silent fail for auto-save
      }
    };
    
    // Save immediately on mount if there's data
    if (medicalNotes.historyOfPresentIllness || medicalNotes.physicalExamination || 
        medicalNotes.assessment || medicalNotes.plan) {
      autoSave();
    }
    
    // Then save every 30 seconds
    const interval = setInterval(autoSave, 30000);
    return () => clearInterval(interval);
  }, [sessionActive, sessionId, medicalNotes]);

  const handleStartSession = async (patient: Patient) => {
    try {
      // Check if there's already an active session
      if (sessionActive && sessionId) {
        const confirmed = window.confirm(
          `There is already an active session with ${currentPatient?.name || 'a patient'}. ` +
          `Do you want to end that session and start a new one with ${patient.name}?`
        );
        if (!confirmed) {
          return;
        }
        // End the current session first
        try {
          await consultationService.endSession(sessionId);
        } catch (endErr) {
          console.warn('Error ending previous session:', endErr);
          // Continue anyway - backend will handle conflicts
        }
      }
      
      // Create consultation session in backend
      const numericRoomId = parseInt(roomId);
      // patient.id is now the actual patient database ID (from queue item.patient)
      // patient.patientId is the display ID (e.g., "PAT-2024-001")
      const numericPatientId = parseInt(patient.id);
      const numericVisitId = patient.visitId ? parseInt(patient.visitId) : null;
      
      if (isNaN(numericRoomId) || isNaN(numericPatientId)) {
        toast.error('Invalid room or patient ID');
        console.error('Room ID:', numericRoomId, 'Patient ID:', numericPatientId);
        return;
      }
      
      const sessionData = await apiFetch<{ id: number }>('/consultation/sessions/', {
        method: 'POST',
        body: JSON.stringify({
          room: numericRoomId,
          patient: numericPatientId,
          visit: numericVisitId,
          status: 'active', // Valid choices: 'active', 'completed', 'cancelled'
          // Note: priority is for ConsultationQueue, not ConsultationSession
        }),
      });
      
      setCurrentPatient(patient);
      setSessionActive(true);
      setSessionId(sessionData.id);
      setSessionStartTime(new Date());
      setSessionDuration(0);

      // Load real patient history data
      const patientHistoryId = parseInt(patient.id);
      if (!isNaN(patientHistoryId)) {
        loadPatientHistory(patientHistoryId);
      }
      
      // Reset form states for new session
      setMedicalNotes({ presentationComplaint: "", historyOfPresentIllness: "", physicalExamination: "", assessment: "", plan: "" });
      setDiagnoses([]);
      setPrescriptions([]);
      setLabOrders([]); // Reset lab orders when starting new session
      setNursingOrders([]);
      setReferrals([]);
      setRadiologyOrders([]);
      setFollowUpRequired(false);
      setFollowUpDate("");
      setFollowUpReason("");
      
      // Load medical history for the patient
      try {
        const history = await patientService.getPatientHistory(numericPatientId);
        setMedicalHistory({
          allergies: Array.isArray(history.allergies) ? history.allergies : [],
          diagnoses: Array.isArray(history.diagnoses) ? history.diagnoses : [],
          surgicalHistory: Array.isArray(history.surgical_history) ? history.surgical_history : [],
          familyHistory: Array.isArray(history.family_history) ? history.family_history : [],
          socialHistory: {
            smoking: history.social_history?.smoking || '',
            alcohol: history.social_history?.alcohol || '',
            exercise: history.social_history?.exercise || '',
            occupation: history.social_history?.occupation || '',
          },
        });
      } catch (historyErr) {
        console.warn('Could not load medical history:', historyErr);
        setMedicalHistory({
          allergies: [],
          diagnoses: [],
          surgicalHistory: [],
          familyHistory: [],
          socialHistory: { smoking: '', alcohol: '', exercise: '', occupation: '' },
        });
      }
      
      toast.success(`Session started with ${patient.name}`);
    } catch (err: any) {
      console.error('Error starting session:', err);
      toast.error(err.message || 'Failed to start consultation session');
    }
  };

  // Generate consultation session PDF
  const generateSessionPDF = async () => {
    if (!currentPatient || !sessionId) return null;
    
    try {
      // Load fresh session data from database to ensure we have latest info
      const freshSession = await consultationService.getSession(sessionId);

    const sessionData = {
      id: freshSession.session_id || sessionId,
      date: freshSession.started_at ? new Date(freshSession.started_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      time: freshSession.started_at ? `${formatTime(freshSession.started_at)} - ${freshSession.ended_at ? formatTime(freshSession.ended_at) : formatTime(new Date().toISOString())}` : '',
      duration: freshSession.started_at && freshSession.ended_at ? `${Math.round((new Date(freshSession.ended_at).getTime() - new Date(freshSession.started_at).getTime()) / (1000 * 60))} min` : `${sessionDuration} min`,
      clinic: 'GOPD', // This would come from context
      room: freshSession.room_name || room?.name || 'Unknown',
      doctor: freshSession.doctor_name || 'Unknown Doctor',
      doctorSpecialty: room?.specialtyFocus || 'General Practice',
      patient: {
        name: currentPatient.name,
        patientId: currentPatient.patientId,
        age: currentPatient.age,
        gender: currentPatient.gender
      },
      vitals: currentPatient.vitals,
      medicalNotes: medicalNotes,
      prescriptions: prescriptions,
      labOrders: labOrders,
      nursingOrders: nursingOrders,
      referrals: referrals,
      radiologyOrders: radiologyOrders,
      followUp: followUpRequired ? { date: followUpDate, reason: followUpReason } : null,
      pdfGenerated: true,
      pdfUrl: `/documents/consultation-${sessionId}.pdf`
    };
    
    // In a real implementation, this would call an API to generate the PDF
    // For now, we'll simulate PDF generation
    debugConsultationRoom('Generating PDF for session:', sessionData);
    return sessionData;
    } catch (error) {
      console.error('Error generating session PDF:', error);
      // Fallback to basic session data if API call fails
      const fallbackSessionData = {
        id: sessionId,
        date: new Date().toISOString().split('T')[0],
        time: sessionStartTime ? `${formatTime(sessionStartTime.toISOString())} - ${formatTime(new Date().toISOString())}` : '',
        duration: `${sessionDuration} min`,
        clinic: 'GOPD',
        room: room?.name || 'Unknown',
        doctor: currentUser?.name || 'Unknown Doctor',
        doctorSpecialty: room?.specialtyFocus || 'General Practice',
        patient: {
          name: currentPatient.name,
          patientId: currentPatient.patientId,
          age: currentPatient.age,
          gender: currentPatient.gender
        },
        vitals: currentPatient.vitals,
        medicalNotes: medicalNotes,
        prescriptions: prescriptions,
        labOrders: labOrders,
        nursingOrders: nursingOrders,
        referrals: referrals,
        radiologyOrders: radiologyOrders,
        followUp: followUpRequired ? { date: followUpDate, reason: followUpReason } : null,
        pdfGenerated: true,
        pdfUrl: `/documents/consultation-${sessionId}.pdf`
      };
      return fallbackSessionData;
    }
  };

  // View session details
  const viewSessionDetails = async (session: any) => {
    // Load full session data from API first
    const fullSession = await consultationService.getSession(session.id);

    // Enrich session with related data for display
    const enrichedSession: any = { ...fullSession };

    // Ensure patient information is included (session should already have patient_name from serializer)
    if (!enrichedSession.patient_name && currentPatient) {
      enrichedSession.patient_name = currentPatient.name;
    }

    // Load diagnoses for this session
    try {
      const diagnosesResult = await consultationService.getDiagnoses({
        session: fullSession.id,
        page_size: 100
      });
      enrichedSession.diagnoses = (diagnosesResult.results || []).map((d: any) => ({
        id: String(d.id),
        code: d.icd10_code_details?.code || 'Unknown',
        name: d.icd10_code_details?.description || d.diagnosis_text || 'Unknown diagnosis',
        type: d.certainty === 'confirmed' ? 'Primary' : d.certainty === 'probable' ? 'Secondary' : 'Differential',
        notes: d.notes || d.diagnosis_text || '',
        status: d.status,
        certainty: d.certainty,
        diagnosed_at: d.diagnosed_at,
      }));
    } catch (err) {
      console.warn('Could not load diagnoses for session:', err);
      enrichedSession.diagnoses = [];
    }

    // Load related data for this session
    try {
    // Load prescriptions for this session
    const prescriptionsResult = await pharmacyService.getPrescriptions({
      consultation_session: fullSession.id,
      page_size: 100
    });
    // Flatten prescription medications into individual prescription items
    // Support both: p.medications[] and top-level p.medication_name / p.medication (single-med per rx)
    enrichedSession.prescriptions = (prescriptionsResult.results || []).flatMap((p: any) => {
      const items = (p.medications && p.medications.length) ? p.medications : (p.medication_name || p.medication ? [p] : []);
      return items.map((m: any) => ({
        id: String(p.id) + (m.id != null ? '-' + m.id : ''),
        medication: m.medication_name || m.medication?.name || p.medication_name || p.medication || 'Unknown',
        dosage: m.dosage || p.dosage || '',
        frequency: m.frequency || p.frequency || '',
        duration: m.duration || p.duration || '',
        quantity: m.quantity ?? p.quantity ?? 0,
      }));
    });
    } catch (err) {
      console.warn('Could not load prescriptions for session:', err);
      enrichedSession.prescriptions = [];
    }

    // Load lab orders for this session
    try {
      const labOrdersResult = await labService.getOrders({
        consultation_session: fullSession.id,
        page_size: 100
      });
      enrichedSession.labOrders = (labOrdersResult.results || []).flatMap((order: any) => {
        const tests = order.tests || [];
        if (!tests.length) return [];
        return tests.map((test: any) => ({
          id: `LAB-${order.id}-${test.id}`,
          test: (test.name ?? test.test_name ?? test.template_name ?? '').toString().trim(),
          status: test.status ?? order.status ?? '',
          priority: order.priority ?? '',
          orderedBy: order.doctor_name ?? '',
          createdAt: test.created_at ?? order.ordered_at ?? '',
        }));
      });
    } catch (err) {
      console.warn('Could not load lab orders for session:', err);
      enrichedSession.labOrders = [];
    }

    // Load radiology orders for this session
    try {
      const radiologyOrdersResult = await radiologyService.getOrders({
        consultation_session: fullSession.id,
        page_size: 100
      });
      enrichedSession.radiologyOrders = (radiologyOrdersResult.results || []).flatMap((order: any) => {
        const studies = order.studies || [];
        if (studies.length) {
          return studies.map((s: any) => ({
            id: `RAD-${order.id}-${s.id}`,
            procedure: (s.procedure ?? order.procedure_name ?? order.procedure ?? '').toString().trim(),
            priority: order.priority ?? '',
            status: s.status ?? order.status ?? '',
            finding: s.finding ?? order.finding ?? '',
            orderedBy: order.doctor_name ?? '',
            createdAt: s.created_at ?? order.ordered_at ?? '',
          }));
        }
        const proc = (order.procedure_name ?? order.procedure ?? '').toString().trim();
        if (!proc) return [];
        return [{
          id: String(order.id),
          procedure: proc,
          priority: order.priority ?? '',
          status: order.status ?? '',
          finding: order.finding ?? '',
          orderedBy: order.doctor_name ?? '',
          createdAt: order.ordered_at ?? '',
        }];
      });
    } catch (err) {
      console.warn('Could not load radiology orders for session:', err);
      enrichedSession.radiologyOrders = [];
    }

    // Load nursing orders for this session (using direct API call since no service method)
    try {
      const nursingOrdersResult = await apiFetch<{ results: any[] }>(`/nursing/orders/?consultation_session=${fullSession.id}&page_size=100`);
      enrichedSession.nursingOrders = (nursingOrdersResult.results || []).map((order: any) => ({
        id: String(order.id),
        type: order.order_type || order.type || 'General',
        instructions: order.instructions || '',
        status: order.status || 'pending',
        priority: order.priority === 'urgent' ? 'Urgent' : order.priority === 'high' ? 'High' : 'Medium',
        orderedBy: order.ordered_by_name || 'Unknown',
        createdAt: order.created_at || new Date().toISOString(),
      }));
    } catch (err) {
      console.warn('Could not load nursing orders for session:', err);
      enrichedSession.nursingOrders = [];
    }

    // Load physio orders for this session (by consultation_session)
    try {
      const physioOrdersResult = await physioService.getOrders({
        consultation_session: fullSession.id,
        patient: fullSession.patient != null ? String(fullSession.patient) : undefined,
        page_size: 100,
      });
      enrichedSession.physioOrders = (physioOrdersResult.results || []).map((o: any) => ({
        diagnosis: (o.diagnosis ?? o.chief_complaint ?? '').toString().trim(),
        priority: o.priority ?? '',
        status: o.status ?? '',
      }));
    } catch (err) {
      console.warn('Could not load physio orders for session:', err);
      enrichedSession.physioOrders = [];
    }

    // Load vitals for the session (by visit if available, otherwise by patient)
    try {
      const visitId = fullSession.visit; // Now fullSession has the visit ID from API
      const vitalsResult = await patientService.getPatientVitals(fullSession.patient, visitId);

      // Use the most recent complete vitals record
      const sortedVitals = (vitalsResult || []).sort((a, b) =>
        new Date(b.recorded_at || 0).getTime() - new Date(a.recorded_at || 0).getTime()
      );

      // Find the most recent vitals with complete BP data
      const latestCompleteVitals = sortedVitals.find(v =>
        v.blood_pressure_systolic && v.blood_pressure_diastolic
      ) || sortedVitals[0]; // Fallback to most recent even if BP incomplete

      if (latestCompleteVitals) {
        enrichedSession.vitals = {
          temperature: latestCompleteVitals.temperature || '',
          bloodPressure: latestCompleteVitals.blood_pressure_systolic && latestCompleteVitals.blood_pressure_diastolic
            ? `${latestCompleteVitals.blood_pressure_systolic}/${latestCompleteVitals.blood_pressure_diastolic}`
            : '',
          heartRate: latestCompleteVitals.heart_rate || '',
          respiratoryRate: latestCompleteVitals.respiratory_rate || '',
          oxygenSaturation: latestCompleteVitals.oxygen_saturation || '',
          weight: latestCompleteVitals.weight || '',
          height: latestCompleteVitals.height || '',
          recordedAt: latestCompleteVitals.recorded_at || '',
        };
      } else {
        enrichedSession.vitals = {};
      }
    } catch (err) {
      console.warn('Could not load vitals for session:', err);
      enrichedSession.vitals = {};
    }

    setSelectedSession(enrichedSession);
    setShowSessionViewer(true);
  };

  // Toggle session expansion in history
  const toggleSessionExpansion = (sessionId: string) => {
    setExpandedSessions(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  // Download consultation report as PDF
  const downloadConsultationReport = async (session: any) => {
    try {
      toast.loading('Generating PDF report...', { id: 'pdf-generation' });

      // Create a new window with the report for PDF generation
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Unable to open report window. Please allow popups for this site.', { id: 'pdf-generation' });
        return;
      }

      // Generate HTML content with PDF-specific styling
      const reportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Consultation Report - Session ${session.id}</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 20mm;
              }
              body { print-color-adjust: exact; }
            }
            body {
              font-family: 'Times New Roman', serif;
              margin: 0;
              padding: 20px;
              font-size: 12pt;
              line-height: 1.4;
              color: #000;
              background: white;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 15px;
              margin-bottom: 25px;
            }
            .header h1 { margin: 0; font-size: 18pt; font-weight: bold; }
            .header h2 { margin: 5px 0; font-size: 14pt; }
            .header h3 { margin: 5px 0; font-size: 12pt; }
            .section {
              margin-bottom: 20px;
              page-break-inside: avoid;
            }
            .section h3 {
              color: #000;
              border-bottom: 1px solid #000;
              padding-bottom: 5px;
              margin-bottom: 10px;
              font-size: 14pt;
              font-weight: bold;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
              font-size: 11pt;
            }
            th, td {
              border: 1px solid #000;
              padding: 6px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background-color: #f0f0f0;
              font-weight: bold;
            }
            .vitals-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
              gap: 8px;
              margin-bottom: 15px;
            }
            .vital-item {
              padding: 8px;
              border: 1px solid #000;
              text-align: center;
              font-size: 11pt;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              font-size: 10pt;
              color: #666;
              border-top: 1px solid #ccc;
              padding-top: 10px;
            }
            .no-break { page-break-inside: avoid; }
          </style>
        </head>
        <body>
          ${generateConsultationReportHTML(session).replace('<html>', '').replace('</html>', '').replace('<head>', '').replace('</head>', '').replace('<body>', '').replace('</body>', '').replace(/<title>.*?<\/title>/, '')}
        </body>
        </html>
      `;

      printWindow.document.write(reportHTML);
      printWindow.document.close();

      // Wait for content to load, then trigger PDF download
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
          toast.success('PDF report generated and sent to printer', { id: 'pdf-generation' });
        }, 500);
      };

    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF report', { id: 'pdf-generation' });
    }
  };

  // Print consultation report
  const printConsultationReport = (session: any) => {
    // Generate HTML content for the consultation report
    const reportHTML = generateConsultationReportHTML(session);

    // Create a new window with the report
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(reportHTML);
      printWindow.document.close();

      // Wait for content to load, then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };

      toast.success('Consultation report opened for printing');
    } else {
      toast.error('Unable to open report window. Please allow popups for this site.');
    }
  };

  // Generate HTML for consultation report
  const generateConsultationReportHTML = (session: any) => {
    const vitalsObj = Array.isArray(session.vitals) ? (session.vitals[0] || {}) : (session.vitals || {});
    const prescriptions = getSessionProperty(session, 'prescriptions');
    const labOrders = getSessionProperty(session, 'labOrders');
    const radiologyOrders = getSessionProperty(session, 'radiologyOrders');
    const physioOrders = getSessionProperty(session, 'physioOrders') || [];
    const nursingOrders = getSessionProperty(session, 'nursingOrders');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Consultation Report - Session ${session.id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .section { margin-bottom: 20px; }
          .section h3 { color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .vitals-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
          .vital-item { padding: 10px; border: 1px solid #ddd; text-align: center; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Nigerian Ports Authority</h1>
          <h2>Medical Services Department</h2>
          <h3>Consultation Report</h3>
          <p>Session ID: ${session.id}</p>
        </div>

        <div class="section">
          <h3>Patient Information</h3>
          <p><strong>Name:</strong> ${session.patient_name || 'Unknown'}</p>
          <p><strong>Patient ID:</strong> ${session.patient_id || 'N/A'}</p>
          <p><strong>Age:</strong> ${session.patient_age || 'N/A'} years</p>
          <p><strong>Gender:</strong> ${session.patient_gender || 'N/A'}</p>
        </div>

        <div class="section">
          <h3>Consultation Details</h3>
          <p><strong>Doctor:</strong> ${session.doctor_name || 'Unknown'}</p>
          <p><strong>Clinic:</strong> ${session.clinic_name || 'Unknown'}</p>
          <p><strong>Room:</strong> ${session.room_name || 'Unknown'}</p>
          <p><strong>Date & Time:</strong> ${formatDate(session.started_at)} ${formatTime(session.started_at)}</p>
          <p><strong>Duration:</strong> ${session.ended_at ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / (1000 * 60)) + ' minutes' : 'Ongoing'}</p>
        </div>

        ${Object.keys(vitalsObj).length > 0 ? `
        <div class="section">
          <h3>Vital Signs</h3>
          <div class="vitals-grid">
            ${Object.entries(vitalsObj).map(([key, value]: [string, any]) =>
              `<div class="vital-item"><strong>${vitalLabel(key)}</strong><br>${formatVitalDisplay(key, value)}</div>`
            ).join('')}
          </div>
        </div>
        ` : ''}

        <div class="section">
          <h3>Clinical Notes</h3>
          ${session.presentation_complaint ? `<p><strong>Presentation:</strong> ${session.presentation_complaint}</p>` : ''}
          ${session.history_of_presenting_illness ? `<p><strong>History:</strong> ${session.history_of_presenting_illness.replace(/\n/g, '<br>')}</p>` : ''}
          ${session.physical_examination ? `<p><strong>Physical Exam:</strong> ${session.physical_examination.replace(/\n/g, '<br>')}</p>` : ''}
          ${session.assessment ? `<p><strong>Assessment:</strong> ${session.assessment}</p>` : ''}
          ${session.plan ? `<p><strong>Treatment Plan:</strong> ${session.plan}</p>` : ''}
        </div>

        ${session.diagnoses && session.diagnoses.length > 0 ? `
        <div class="section">
          <h3>Diagnoses</h3>
          <table>
            <thead>
              <tr>
                <th>ICD-10 Code</th>
                <th>Diagnosis</th>
                <th>Diagnosis Type</th>
              </tr>
            </thead>
            <tbody>
              ${session.diagnoses.map((dx: any) => `
                <tr>
                  <td>${dx.code || 'N/A'}</td>
                  <td>${dx.name || 'Unknown'}</td>
                  <td>${dx.type || 'Unknown'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${prescriptions.length > 0 ? `
        <div class="section">
          <h3>Prescriptions</h3>
          <table>
            <thead>
              <tr>
                <th>Medication</th>
                <th>Dosage</th>
                <th>Frequency</th>
                <th>Duration</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${prescriptions.map((rx: any) => `
                <tr>
                  <td>${rx.medication || 'Unknown'}</td>
                  <td>${rx.dosage || 'N/A'}</td>
                  <td>${rx.frequency || 'N/A'}</td>
                  <td>${rx.duration || 'N/A'}</td>
                  <td>${rx.quantity || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${labOrders.length > 0 ? `
        <div class="section">
          <h3>Laboratory Orders</h3>
          <table>
            <thead>
              <tr>
                <th>Test</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${labOrders.map((lab: any) => `
                <tr>
                  <td>${lab.test ?? ''}</td>
                  <td>${formatPriority(lab.priority)}</td>
                  <td>${lab.status ?? ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${radiologyOrders.length > 0 ? `
        <div class="section">
          <h3>Radiology Orders</h3>
          <table>
            <thead>
              <tr>
                <th>Procedure</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${radiologyOrders.map((rad: any) => `
                <tr>
                  <td>${rad.procedure ?? ''}</td>
                  <td>${formatPriority(rad.priority)}</td>
                  <td>${rad.status ?? ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${physioOrders.length > 0 ? `
        <div class="section">
          <h3>Physiotherapy Orders</h3>
          <table>
            <thead>
              <tr>
                <th>Diagnosis / Chief Complaint</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${physioOrders.map((p: any) => `
                <tr>
                  <td>${p.diagnosis ?? ''}</td>
                  <td>${formatPriority(p.priority)}</td>
                  <td>${p.status ?? ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${nursingOrders.length > 0 ? `
        <div class="section">
          <h3>Nursing Orders</h3>
          <ul>
            ${nursingOrders.map((order: any) => `<li>${order.type}: ${order.instructions}</li>`).join('')}
          </ul>
        </div>
        ` : ''}

        <div class="section">
          <h3>Session Outcome</h3>
          <p><strong>Status:</strong> ${session.status === 'completed' ? 'Completed' : 'In Progress'}</p>
        </div>

        <div class="footer">
          <p>Generated: ${new Date().toLocaleString()} | Document ID: ${session.id}</p>
        </div>
      </body>
      </html>
    `;
  };

  // Print session
  const printSession = (session: any) => {
    // In a real implementation, this would open print dialog
    toast.info(`Opening print dialog for ${session.id}`);
    window.print();
  };

  // View lab result details
  const viewLabResultDetails = (labResult: any) => {
    setSelectedLabResult(labResult);
    setShowLabResultViewer(true);
  };

  // View prescription details
  const viewPrescriptionDetails = (prescription: any) => {
    setSelectedPrescription(prescription);
    setShowPrescriptionViewer(true);
  };

  // Toggle lab result expansion in history
  const toggleLabResultExpansion = (labId: string) => {
    setExpandedLabResults(prev => 
      prev.includes(labId) 
        ? prev.filter(id => id !== labId)
        : [...prev, labId]
    );
  };

  // Download lab result PDF
  const downloadLabResultPDF = (labResult: any) => {
    toast.success(`Downloading lab report: ${labResult.id}`, {
      description: `${labResult.test} from ${labResult.date}`
    });
  };

  // Print lab result
  const printLabResult = (labResult: any) => {
    toast.info(`Opening print dialog for ${labResult.id}`);
    window.print();
  };

  // Get parameter status color
  const getParameterStatusColor = (status: string) => {
    switch (status) {
      case 'Normal': return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
      case 'Abnormal': return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      case 'Borderline': return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
      case 'Critical': return 'text-red-700 bg-red-100 dark:bg-red-900/30 font-bold';
      default: return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const confirmEndSession = async () => {
    setIsEnding(true);
    
    try {
      if (!sessionId) {
        throw new Error('No active session to end');
      }

      // Step 1: Handle follow-up appointment if needed (separate from session)
      if (followUpRequired && followUpDate && followUpReason && currentPatient && sessionId) {
        try {
          const patientId = typeof currentPatient.id === 'string' ? parseInt(currentPatient.id, 10) : currentPatient.id;
          await appointmentService.createAppointment({
            patient: patientId,
            doctor: undefined,
            clinic: undefined,
            appointment_type: 'follow_up',
            appointment_date: followUpDate,
            appointment_time: '09:00',
            duration_minutes: 30,
            reason: followUpReason,
            notes: `Follow-up from consultation session ${sessionId}. Reason: ${followUpReason}`,
          });
          debugConsultationRoom('Follow-up appointment created');
        } catch (apptError: any) {
          console.warn('Could not create follow-up appointment:', apptError?.message);
        }
      }

      // Step 2: Deactivate queue item if patient was in queue
      // Now safe with the new conditional unique constraint
      if (currentPatient?.id) {
        try {
          debugConsultationRoom('Attempting to deactivate queue item for patient:', currentPatient.id);
          const queueData = await consultationService.getQueue({
            room: parseInt(roomId),
            patient: typeof currentPatient.id === 'string' ? parseInt(currentPatient.id) : currentPatient.id,
            is_active: true,
          });
          
          if (queueData.results && queueData.results.length > 0) {
            const queueItem = queueData.results[0];
            debugConsultationRoom('Found queue item to deactivate:', {
              id: queueItem.id,
              patient: queueItem.patient,
              room: queueItem.room,
              is_active: queueItem.is_active,
            });
            
            try {
              debugConsultationRoom('Sending POST request to call/deactivate queue item:', `/consultation/queue/${queueItem.id}/call/`);
              await apiFetch(`/consultation/queue/${queueItem.id}/call/`, {
                method: 'POST',
              });
              debugConsultationRoom('Queue item deactivated successfully');
            } catch (deactivateErr: any) {
              // Log but don't fail - queue deactivation is not critical
              console.warn('Could not deactivate queue item (non-critical):', {
                queueItemId: queueItem.id,
                error: deactivateErr?.message,
              });
            }
          } else {
            debugConsultationRoom('No active queue items found for patient');
          }
        } catch (err) {
          console.error('Error fetching queue items:', err);
          // Don't fail the entire process if queue lookup fails
        }
      }

      // Step 3: End the session using the dedicated endpoint
      try {
        if (!sessionId) throw new Error('Session ID is required');
        debugConsultationRoom('Ending session with ID:', sessionId);
        await consultationService.endSession(sessionId);
        debugConsultationRoom('Session ended successfully');
      } catch (err: any) {
        console.error('Error ending session:', {
          sessionId,
          error: err,
          message: err?.message,
          response: err?.response,
          status: err?.status,
        });
        // Provide more helpful error message
        let errorMessage = 'Failed to end session';
        if (err?.message?.includes('404')) {
          errorMessage = 'Session not found - it may have already been completed';
        } else if (err?.message?.includes('400')) {
          errorMessage = 'Invalid session state - session may already be completed';
        }
        throw new Error(errorMessage);
      }
      
      // Generate PDF for the session
      const sessionPDF = await generateSessionPDF();
      if (sessionPDF) {
        toast.success("Consultation report generated", {
          description: `Session ${sessionPDF.id} saved to patient history`,
          action: {
            label: "View",
            onClick: () => {
              // Open session details in a new view or download
              // For now, navigate to consultation history where the session can be viewed
              window.open(`/consultation/history?session=${sessionPDF.id}`, '_blank');
            }
          }
        });
      }
      
      toast.success("Consultation session completed successfully");
      setPatients((prev) => prev.filter((p) => p.id !== currentPatient?.id));
      if (room) {
        setRoom({ ...room, totalConsultationsToday: room.totalConsultationsToday + 1, averageConsultationTime: Math.round((room.averageConsultationTime * room.totalConsultationsToday + sessionDuration) / (room.totalConsultationsToday + 1)) });
      }
      setCurrentPatient(null);
      setSessionActive(false);
      setSessionId(null);
      setSessionStartTime(null);
      setSessionDuration(0);
      setMedicalNotes({ presentationComplaint: "", historyOfPresentIllness: "", physicalExamination: "", assessment: "", plan: "" });
      setDiagnoses([]);
      setPrescriptions([]);
      setLabOrders([]); // Reset lab orders when starting new session
      setNursingOrders([]);
      setReferrals([]);
      setRadiologyOrders([]);
      setFollowUpRequired(false);
      setFollowUpDate("");
      setFollowUpReason("");
      setShowEndDialog(false);
    } catch (err: any) {
      console.error('Error ending session:', err);
      toast.error(err.message || 'Failed to end session properly');
    } finally {
      setIsEnding(false);
    }
  };


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
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      // Build items array for ONE prescription with ALL medications
      const prescriptionItems: any[] = [];
      const skippedMedications: string[] = [];
      
      for (const rx of draftPrescriptions) {
        // Use the stored generic ID (now stored in medicationId field)
        let genericId: number | undefined = rx.medicationId;
        
        if (!genericId) {
          // Fallback: try to find generic by name
          const generic = medications.find((g: any) => g.name === rx.medication);
          if (generic) {
            genericId = typeof generic.id === 'string' ? parseInt(generic.id, 10) : generic.id;
          } else {
            skippedMedications.push(rx.medication);
            continue; // Skip this medication
          }
        }
        
        // Ensure genericId is a number
        const numericGenericId = typeof genericId === 'string' ? parseInt(genericId, 10) : genericId;
        
        if (!numericGenericId || isNaN(numericGenericId) || numericGenericId === 0) {
          skippedMedications.push(rx.medication);
          continue; // Skip this medication
        }
        
        // Find generic details for unit
        const generic = medications.find((g: any) => {
          const gId = typeof g.id === 'string' ? parseInt(g.id, 10) : g.id;
          return gId === numericGenericId;
        });
        const unit = (generic as any)?.dosage_form || 'tablet'; // Default to 'tablet' if not found
        
        // Add to items array - now using generic instead of medication
        prescriptionItems.push({
          generic: numericGenericId, // Changed from medication to generic
          quantity: rx.quantity,
          unit: unit,
          dosage: rx.dosage,
          frequency: rx.frequency,
          duration: rx.duration,
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
      
      try {
        await pharmacyService.createPrescription({
          patient: numericPatientId,
          visit: numericVisitId || undefined,
          consultation_session: sessionId,
          doctor: sessionId ? undefined : undefined, // Will be set from request user in backend
          diagnosis: '', // Diagnoses are now saved separately
          notes: medicalNotes.assessment || undefined,
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
      
      setPrescriptions(prev => prev.map(rx => rx.status === 'Draft' ? { ...rx, status: 'Sent to Pharmacy' } : rx));
      setPrescriptionsSentToPharmacy(true);
    } catch (err: any) {
      console.error('Error sending prescriptions:', err);
      toast.error(err.message || 'Failed to send prescriptions to pharmacy');
    }
  };

  const editPrescription = (index: number) => {
    const prescriptionToEdit = prescriptions[index];
    if (!prescriptionToEdit) return;

    // Reset modal state first
    setSelectedMedications(new Set());
    setMedicationConfigs(new Map());
    setMedicationSearch("");
    setShowMedicationDropdown(false);
    setNewPrescription({
      medication: "",
      medicationId: undefined,
      genericName: "",
      dosage: "",
      frequency: "",
      duration: "",
      durationDays: 0,
      quantity: 0,
      route: "Oral",
      instructions: "",
      priority: "Routine",
      notes: ""
    });

    // Pre-populate the modal with existing prescription data
    const medicationId = prescriptionToEdit.medicationId;

    if (!medicationId) {
      toast.error('Cannot edit prescription: medication ID not found');
      return;
    }

    // Select the medication
    setSelectedMedications(new Set([medicationId]));

    // Pre-populate the configuration
    const config: any = {
      dosage: prescriptionToEdit.dosage === 'As directed' ? '' : prescriptionToEdit.dosage,
      frequency: prescriptionToEdit.frequency,
      durationDays: prescriptionToEdit.duration.includes('days')
        ? parseInt(prescriptionToEdit.duration.split(' ')[0]) || 0
        : 0,
      route: prescriptionToEdit.route,
      instructions: prescriptionToEdit.instructions || ''
    };
    setMedicationConfigs(new Map([[medicationId, config]]));

    // Pre-populate clinical indication (use instructions if available, otherwise empty)
    const clinicalIndication = prescriptionToEdit.instructions && prescriptionToEdit.instructions !== prescriptionToEdit.medication ? prescriptionToEdit.instructions : '';
    setNewPrescription(prev => ({
      ...prev,
      notes: clinicalIndication,
      priority: prescriptionToEdit.priority || 'Routine'
    }));

    // Remove the old prescription and open modal
    setPrescriptions(prescriptions.filter((_, i) => i !== index));
    setShowAddPrescription(true);

    toast.info(`Editing prescription for ${prescriptionToEdit.medication}`);
  };

  const toggleMedicationSelection = (med: any) => {
    // CRITICAL: Ensure medication ID is a valid number
    let medicationId: number | undefined;
    if (typeof med.id === 'number') {
      medicationId = med.id;
    } else if (typeof med.id === 'string') {
      const parsed = parseInt(med.id, 10);
      if (!isNaN(parsed) && parsed > 0) {
        medicationId = parsed;
      } else {
        toast.error("Please select a medication from the database. Demo medications cannot be used.");
        return;
      }
    } else {
      toast.error("Invalid medication ID. Please select a valid medication.");
      return;
    }
    
    // Check for allergies when selecting
    const isAllergyRisk = currentPatient?.allergies.some(allergy => 
      med.name.toLowerCase().includes(allergy.toLowerCase()) || 
      (med.generic_name || '').toLowerCase().includes(allergy.toLowerCase())
    );
    
    if (isAllergyRisk && medicationId !== undefined && !selectedMedications.has(medicationId)) {
      const confirmed = window.confirm(`⚠️ Allergy Alert: Patient is allergic to ${currentPatient?.allergies.join(', ')}. This medication may be contraindicated. Do you want to proceed?`);
      if (!confirmed) {
        return;
      }
    }
    
    // Toggle selection
    setSelectedMedications(prev => {
      const newSet = new Set(prev);
      if (newSet.has(medicationId!)) {
        // Remove medication and its config
        newSet.delete(medicationId!);
        setMedicationConfigs(prevConfigs => {
          const newConfigs = new Map(prevConfigs);
          newConfigs.delete(medicationId!);
          return newConfigs;
        });
      } else {
        // Add medication with sensible defaults based on form
        newSet.add(medicationId!);

        // Close dropdown and clear search when medication is selected
        setShowMedicationDropdown(false);
        setMedicationSearch("");

        setMedicationConfigs(prevConfigs => {
          const newConfigs = new Map(prevConfigs);
          const form = med.form || med.dosageForm || 'tablet';
          // Set sensible defaults based on medication form
          const defaultDosage = form.toLowerCase().includes('tablet') || form.toLowerCase().includes('capsule') 
            ? `1 ${form.toLowerCase()}`
            : form.toLowerCase().includes('syrup') || form.toLowerCase().includes('suspension')
            ? '5ml'
            : form.toLowerCase().includes('injection') || form.toLowerCase().includes('vial')
            ? '1 vial'
            : `1 ${form.toLowerCase()}`;
          
          const defaultRoute = form.toLowerCase().includes('injection') || form.toLowerCase().includes('vial')
            ? 'IV'
            : 'Oral';
          
          newConfigs.set(medicationId!, {
            id: med.id || 0,
            name: med.name || '',
            strength: med.strength || '',
            form: med.dosage_form || 'tablet',
            route: defaultRoute,
            dosage: defaultDosage,
            frequency: 'Once daily (OD)',
            duration: '',
            durationDays: 0,
            quantity: 0,
            instructions: '',
            priority: 'Routine',
            unit: med.dosage_form || 'tablet', // Use form as unit for generics
            generic_name: med.name, // For generics, name is the generic name
            genericName: med.name || '',
            category: med.category || '',
            dosageForm: med.dosage_form,
          });
          return newConfigs;
        });
      }
      return newSet;
    });
  };

  const selectMedication = (med: any) => {
    // For single select (backward compatibility) - toggle selection instead
    toggleMedicationSelection(med);
  };

  const updateMedicationConfig = (medicationId: number, field: string, value: any) => {
    setMedicationConfigs(prev => {
      const newConfigs = new Map(prev);
      const currentConfig = newConfigs.get(medicationId);
      if (!currentConfig) {
        // This shouldn't happen in an update operation
        return newConfigs;
      }
      
      const updatedConfig = { ...currentConfig, [field]: value };
      
      // Auto-calculate quantity when frequency or durationDays changes
      if (field === 'frequency' || field === 'durationDays') {
        const dailyDoses = frequencyToDailyDoses[updatedConfig.frequency] || 1;
        updatedConfig.quantity = updatedConfig.frequency === 'STAT (Single dose)' 
          ? 1 
          : Math.ceil(dailyDoses * (updatedConfig.durationDays || 0));
      }
      
      // Auto-update duration string when durationDays changes
      if (field === 'durationDays') {
        updatedConfig.duration = value > 0 ? `${value} days` : '';
      }
      
      newConfigs.set(medicationId, updatedConfig);
      return newConfigs;
    });
  };

  const addPrescription = () => {
    if (selectedMedications.size === 0) {
      toast.error("Please select at least one medication");
      return;
    }

    if (!newPrescription.notes) {
      toast.error("Please provide clinical indication");
      return;
    }

    // Validate medication configurations
    const missingConfigs: string[] = [];
    for (const medId of selectedMedications) {
      const config = medicationConfigs.get(medId);
      if (!config || !config.dosage?.trim()) {
        const med = medications.find((m: any) => {
          const mId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
          return mId === medId;
        });
        missingConfigs.push(`${med?.name || 'Unknown medication'} - dosage required`);
      }
      if (!config || !config.frequency) {
        const med = medications.find((m: any) => {
          const mId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
          return mId === medId;
        });
        if (!missingConfigs.some(msg => msg.includes(med?.name || 'Unknown medication'))) {
          missingConfigs.push(`${med?.name || 'Unknown medication'} - frequency required`);
        }
      }
    }

    if (missingConfigs.length > 0) {
      toast.error("Please complete all required fields (Dosage and Frequency) for each medication before adding to order.");
      return;
    }
    
    const selectedMeds = medications.filter((m: any) => {
      const mId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
      return selectedMedications.has(mId);
    });
    
    // Add all selected medications to prescriptions list with configurations
    const newPrescriptions = selectedMeds.map((med: any) => {
      const medicationId = typeof med.id === 'number' ? med.id : parseInt(med.id, 10);
      const config = medicationConfigs.get(medicationId) || {
        dosage: '',
        frequency: 'Once daily (OD)',
        durationDays: 0,
        route: 'Oral',
        instructions: ''
      };

      const dailyDoses = frequencyToDailyDoses[config.frequency] || 1;
      // Extract numeric dosage value (e.g., "2" or "2 tablets" -> 2)
      const dosageValue = config.dosage ? parseFloat(String(config.dosage).replace(/[^\d.]/g, '')) || 1 : 1;
      const calculatedQty = config.frequency === 'STAT (Single dose)'
        ? dosageValue
        : Math.ceil(dosageValue * dailyDoses * (config.durationDays || 1));

      const rxId = `RX-${Date.now()}-${medicationId}`;
      
      return {
        id: rxId,
        medication: med.name, // Generic name
        medicationId: medicationId, // Generic ID
        genericName: med.name, // Same as medication for generics
        dosage: config.dosage || 'As directed',
        frequency: config.frequency,
        duration: config.durationDays ? `${config.durationDays} days` : 'As directed',
        quantity: calculatedQty,
        route: config.route,
        instructions: config.instructions || newPrescription.notes,
        priority: newPrescription.priority,
        status: 'Draft' as const
      };
    });
    
    setPrescriptions([...prescriptions, ...newPrescriptions]);
    
    // Reset form and selections
    setSelectedMedications(new Set());
    setMedicationConfigs(new Map());
    setNewPrescription({
      medication: "",
      medicationId: undefined,
      genericName: "",
      dosage: "",
      frequency: "",
      duration: "",
      durationDays: 0,
      quantity: 0,
      route: "Oral",
      instructions: "",
      priority: "Routine",
      notes: ""
    });
    setMedicationSearch("");
    setShowAddPrescription(false);
    
    toast.success(`${selectedMeds.length} medication(s) added to prescription order`);
  };

  const calculateQuantity = (frequency: string, durationDays: number, dosage: string | number = 1) => {
    if (frequency === 'STAT (Single dose)') {
      const dosageValue = typeof dosage === 'string' ? (parseFloat(dosage.replace(/[^\d.]/g, '')) || 1) : (dosage || 1);
      return dosageValue;
    }
    const dailyDoses = frequencyToDailyDoses[frequency] || 1;
    const dosageValue = typeof dosage === 'string' ? (parseFloat(dosage.replace(/[^\d.]/g, '')) || 1) : (dosage || 1);
    return Math.ceil(dosageValue * dailyDoses * durationDays);
  };

  // CRITICAL: Only use real generics from API - do NOT use demo medications
  // Demo medications have string IDs which cannot be used for prescriptions
  const availableMedications = medications.length > 0 ? medications : [];
  const filteredMedications = medicationSearch 
    ? availableMedications.filter((generic: any) => {
        const searchTerm = medicationSearch.toLowerCase().trim();
        if (!searchTerm) return true; // Show all if search is empty
        
        const name = (generic.name || '').toLowerCase();
        const activeIngredient = ((generic.active_ingredient || '')).toLowerCase();
        const category = ((generic.category || '')).toLowerCase();
        const strength = ((generic.strength || '')).toLowerCase();
        const form = ((generic.dosage_form || '')).toLowerCase();
        
        return name.includes(searchTerm) ||
               activeIngredient.includes(searchTerm) ||
               category.includes(searchTerm) ||
               strength.includes(searchTerm) ||
               form.includes(searchTerm);
      })
    : availableMedications;
  // Toggle lab template selection
  const toggleLabTemplateSelection = (template: any) => {
    const templateId = template.id;
    setSelectedLabTemplates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(templateId)) {
        newSet.delete(templateId);
      } else {
        newSet.add(templateId);
        // Close dropdown and clear search when template is selected
        setShowLabTemplateDropdown(false);
        setLabTemplateSearch("");
      }
      return newSet;
    });
  };

  // Add selected lab templates to draft order (like prescriptions)
  const addLabOrder = () => {
    if (selectedLabTemplates.size === 0) {
      toast.error('Please select at least one test');
      return;
    }
    
    // Get selected templates
    const selectedTemplates = labTemplates.filter(t => selectedLabTemplates.has(t.id));
    
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
        code: order.code || order.test.substring(0, 10).toUpperCase().replace(/\s/g, '_'),
        sample_type: order.sampleType || 'Blood',
        template: order.testId, // Link to template
        status: 'pending',
        notes: order.notes || '',
      }));
      
      await labService.createOrder({
        patient: numericPatientId as any,
        visit: numericVisitId || undefined,
        consultation_session: sessionId,
        priority: priorityMap[orderPriority] || 'routine',
        clinical_notes: combinedNotes,
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

  // Filter lab templates based on search
  const filteredLabTemplates = labTemplates.filter(template => {
    if (!labTemplateSearch.trim()) return true;
    const search = labTemplateSearch.toLowerCase();
    return (
      template.name?.toLowerCase().includes(search) ||
      template.code?.toLowerCase().includes(search) ||
      template.sample_type?.toLowerCase().includes(search) ||
      (template.description && template.description.toLowerCase().includes(search))
    );
  }).slice(0, 20); // Limit to 20 results for performance
  
  // Add nursing order to draft (like prescriptions, lab orders, and radiology orders)
  const addNursingOrder = () => {
    if (!newNursingOrder.type || !newNursingOrder.instructions) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    // Validate type-specific required fields
    if (newNursingOrder.type === 'Injection' && !newNursingOrder.medication) {
      toast.error('Please select a medication for injection');
      return;
    }
    if (newNursingOrder.type === 'Dressing' && !newNursingOrder.woundLocation) {
      toast.error('Please specify wound location for dressing');
      return;
    }
    if (newNursingOrder.type === 'Ward Admission') {
      if (!newNursingOrder.ward) {
        toast.error('Please select a ward for admission');
        return;
      }
      if (!newNursingOrder.admissionType) {
        toast.error('Please select admission type');
        return;
      }
      if (!newNursingOrder.admissionDiagnosis) {
        toast.error('Please enter admission diagnosis');
      return;
      }

      // Check if there's already a draft ward admission order
      const existingWardAdmission = nursingOrders.find(order =>
        order.type === 'Ward Admission' && order.status === 'Draft'
      );
      if (existingWardAdmission) {
        toast.error('A ward admission order is already in draft. Please send it to nursing first or remove it.');
        return;
      }
    }
    
    const orderId = `NO-${Date.now()}`;
    
    // Add to draft nursing orders (not sent yet)
    setNursingOrders([...nursingOrders, {
      id: orderId,
      type: newNursingOrder.type as 'Injection' | 'Dressing' | 'Ward Admission',
      medication: newNursingOrder.medication || undefined,
      dosage: newNursingOrder.dosage || undefined,
      route: newNursingOrder.route || undefined,
      woundLocation: newNursingOrder.woundLocation || undefined,
      woundType: newNursingOrder.woundType || undefined,
      supplies: newNursingOrder.supplies || undefined,
      instructions: newNursingOrder.instructions,
      priority: newNursingOrder.priority as 'Routine' | 'Urgent' | 'STAT',
      status: 'Draft',
      // Ward admission fields
      ward: newNursingOrder.ward || undefined,
      admissionType: newNursingOrder.admissionType || undefined,
      admissionDiagnosis: newNursingOrder.admissionDiagnosis || undefined,
      presentingComplaint: newNursingOrder.presentingComplaint || undefined
    }]);
    
    setNewNursingOrder({ type: "", medication: "", dosage: "", route: "Intramuscular (IM)", woundLocation: "", woundType: "", supplies: "", instructions: "", priority: "Routine", ward: "", admissionType: "", admissionDiagnosis: "", presentingComplaint: "" });
    setShowAddNursingOrder(false);
    toast.success("Nursing order added to draft");
  };

  // Send all draft nursing orders to nursing (like sendPrescriptionsToPharmacy, sendLabOrdersToLab, sendRadiologyOrders)
  const sendNursingOrdersToNursing = async () => {
    const draftOrders = nursingOrders.filter(order => order.status === 'Draft');
    
    if (draftOrders.length === 0) {
      toast.info("No draft nursing orders to send");
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
      
      const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
        'Routine': 'low',
        'Urgent': 'high',
        'STAT': 'urgent',
      };
      
      // Send each draft order to backend
      const sendPromises = draftOrders.map(async (order) => {
        // Handle ward admission orders differently
        if (order.type === 'Ward Admission') {
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

          // Create nursing order only - nurse will do the actual admission
          return apiFetch('/nursing/orders/', {
            method: 'POST',
            body: JSON.stringify({
              patient: numericPatientId,
              visit: numericVisitId || undefined,
              consultation_session: sessionId,
              ordered_by: currentUser?.id ? Number(currentUser.id) : undefined,
              order_type: 'ward admission',
              description: `Ward admission to ${order.ward}. Diagnosis: ${order.admissionDiagnosis}. ${order.instructions}`,
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
          description = `${order.woundType || 'Wound'} dressing at ${order.woundLocation || 'site'}. Supplies: ${order.supplies || 'Standard'}. ${order.instructions}`;
        }
        
          return apiFetch('/nursing/orders/', {
          method: 'POST',
          body: JSON.stringify({
            patient: numericPatientId,
            visit: numericVisitId || undefined,
              consultation_session: sessionId,
              ordered_by: currentUser?.id ? Number(currentUser.id) : undefined,
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
    } catch (err: any) {
      console.error('Error creating nursing orders:', err);
      toast.error(err.message || 'Failed to send nursing orders');
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
      supplies: "",
      instructions: "",
      priority: "Routine",
      ward: "",
      admissionType: "",
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
      supplies: orderToEdit.supplies || "",
      instructions: orderToEdit.instructions,
      priority: orderToEdit.priority,
      ward: orderToEdit.ward || "",
      admissionType: orderToEdit.admissionType || "",
      admissionDiagnosis: orderToEdit.admissionDiagnosis || "",
      presentingComplaint: orderToEdit.presentingComplaint || ""
    });

    // Remove the old order and open modal
    setNursingOrders(nursingOrders.filter(o => o.id !== orderId));
    setShowAddNursingOrder(true);

    toast.info(`Editing nursing order for ${orderToEdit.type}`);
  };

  const getNursingOrderIcon = (type: string) => {
    switch (type) {
      case 'Injection': return <Syringe className="h-3.5 w-3.5 text-rose-600" />;
      case 'Dressing': return <Activity className="h-3.5 w-3.5 text-amber-600" />;
      default: return <Syringe className="h-3.5 w-3.5 text-cyan-600" />;
    }
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
      
      const urgencyMap: Record<string, 'routine' | 'urgent' | 'emergency'> = {
        'Routine': 'routine',
        'Urgent': 'urgent',
        'Emergency': 'emergency',
      };
      
      const facilityTypeMap: Record<string, 'internal' | 'external' | 'specialist'> = {
        'Internal': 'internal',
        'External': 'external',
        'Specialist': 'specialist',
      };
      
      // Create referral in backend
      const createdReferral = await referralService.createReferral({
        patient: numericPatientId,
        visit: numericVisitId || undefined,
        session: sessionId,
        specialty: newReferral.specialty,
        facility: newReferral.facility,
        facility_type: facilityTypeMap[newReferral.facilityType] || 'internal',
        reason: newReferral.reason,
        clinical_summary: newReferral.clinicalSummary || undefined,
        urgency: newReferral.priority === 'STAT' ? 'emergency' : newReferral.priority.toLowerCase() as 'urgent' | 'routine' | 'emergency',
        contact_person: newReferral.contactPerson || undefined,
        contact_phone: newReferral.contactPhone || undefined,
        status: 'sent',
      });
      
      const referralId = `REF-${Date.now()}`;
      setReferrals([...referrals, {
        id: referralId,
        specialty: newReferral.specialty,
        facility: newReferral.facility,
        facilityType: newReferral.facilityType,
        reason: newReferral.reason,
        urgency: (newReferral.priority === 'STAT' ? 'Emergency' : newReferral.priority) as 'Routine' | 'Urgent' | 'Emergency',
        clinicalSummary: newReferral.clinicalSummary,
        contactPerson: newReferral.contactPerson || undefined,
        contactPhone: newReferral.contactPhone || undefined,
        status: 'Sent'
      }]);
      setNewReferral({ specialty: "", facility: "", facilityType: "", reason: "", priority: "Routine", clinicalSummary: "", contactPerson: "", contactPhone: "" });
      setShowAddReferral(false);
      toast.success("Referral sent successfully");
    } catch (err: any) {
      console.error('Error creating referral:', err);
      toast.error(err.message || 'Failed to create referral');
    }
  };

  const sendReferrals = () => {
    // Note: Referrals are now sent directly when added via addReferral
    // This function is kept for backward compatibility but referrals are sent immediately
    if (referrals.length === 0) {
      toast.error("No referrals to send");
      return;
    }
    const draftReferrals = referrals.filter(r => r.status === 'Draft');
    if (draftReferrals.length === 0) {
      toast.info("All referrals have already been sent");
      return;
    }
    // Referrals are now sent immediately when created, so this is just a status update
    setReferrals(prev => prev.map(r => r.status === 'Draft' ? { ...r, status: 'Sent' } : r));
    toast.success(`${draftReferrals.length} referral(s) already sent successfully`, {
      description: `Patient: ${currentPatient?.name}`
    });
  };

  // Radiology functions
  // Add radiology order to draft (like prescriptions and lab orders)
  const addRadiologyOrder = () => {
    if (selectedRadiologyTemplates.size === 0 || !newRadiology.clinicalIndication) {
      toast.error('Please select at least one imaging study and provide clinical indication');
      return;
    }
    
    // Add each selected template as a separate order
    const newOrders = Array.from(selectedRadiologyTemplates).map(templateId => {
      const template = radiologyTemplates.find(t => t.id === templateId);
      if (!template) return null;

      const orderId = `RAD-${templateId}-${Date.now()}`;
      return {
      id: orderId,
        procedure: template.name,
        category: template.modality || template.category,
        bodyPart: template.body_part || '',
      clinicalIndication: newRadiology.clinicalIndication,
      priority: newRadiology.priority as 'Routine' | 'Urgent' | 'STAT',
      provisionalDiagnosis: newRadiology.provisionalDiagnosis || undefined,
      lmp: newRadiology.lmp || undefined,
        status: 'Draft' as const
      };
    }).filter((order): order is NonNullable<typeof order> => order !== null);
    
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
        // Find the template that matches this order
        const template = radiologyTemplates.find(t => t.name === order.procedure);
        const studyData = {
          procedure: order.procedure,
          body_part: template?.body_part || order.bodyPart || '',
          modality: template?.modality || order.category || 'X-Ray',
          status: 'pending',
        };

        // TODO: Include template if it exists - commented out to debug 500 error
        // if (template?.id) {
        //   studyData.template = template.id;
        // }

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
              diagnosis: newPhysio.diagnosis.trim(),
              chiefComplaint: newPhysio.chiefComplaint.trim(),
              treatmentGoal: newPhysio.treatmentGoal.trim(),
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
        diagnosis: newPhysio.diagnosis.trim(),
        chiefComplaint: newPhysio.chiefComplaint.trim(),
        treatmentGoal: newPhysio.treatmentGoal.trim(),
        specialInstructions: newPhysio.specialInstructions.trim() || undefined,
        priority: newPhysio.priority,
        status: 'Draft' as const
      };
      setPhysioOrders(prev => [...prev, newOrder]);
      toast.success('Physiotherapy order added');
    }

    setNewPhysio({
      diagnosis: "",
      chiefComplaint: "",
      treatmentGoal: "",
      specialInstructions: "",
      priority: "routine"
    });
    setEditingPhysioIndex(null);
    setShowAddPhysio(false);
  };

  const editPhysioOrder = (index: number) => {
    const orderToEdit = physioOrders[index];
    if (!orderToEdit) return;

      setNewPhysio({
        diagnosis: orderToEdit.diagnosis || "",
        chiefComplaint: orderToEdit.chiefComplaint || "",
        treatmentGoal: orderToEdit.treatmentGoal || "",
        specialInstructions: orderToEdit.specialInstructions || "",
        priority: orderToEdit.priority,
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
        `${order.diagnosis}${order.chiefComplaint ? ` - ${order.chiefComplaint}` : ''}${order.specialInstructions ? ` (${order.specialInstructions})` : ''}`
      ).join('; ');

      // Create separate physiotherapy orders for each draft order
      for (const order of draftOrders) {
        await physioService.createOrder({
          patient: numericPatientId,
          diagnosis: order.diagnosis,
          chief_complaint: order.chiefComplaint,
          treatment_goal: order.treatmentGoal,
          special_instructions: order.specialInstructions || undefined,
          priority: order.priority,
          consultation_session: sessionId
        } as any);
      }

      // Remove sent drafts from local state and refetch from API so doctor sees real status (pending, scheduled, etc.)
      setPhysioOrders(prev => prev.filter(o => !draftOrders.some(d => d.id === o.id)));
      try {
        const updated = await physioService.getOrders({ consultation_session: sessionId, page_size: 100 });
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

  const editRadiologyOrder = (orderId: string) => {
    const orderToEdit = radiologyOrders.find(o => o.id === orderId);
    if (!orderToEdit) return;

    // Reset modal state first
    setNewRadiology({
      procedure: "",
      category: "",
      bodyPart: "",
      clinicalIndication: "",
      priority: "Routine",
      provisionalDiagnosis: "",
      lmp: ""
    });

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

  // Vitals trend helper
  const getVitalTrend = (currentValue: string, previousValue: string, type: 'temp' | 'bp' | 'hr' | 'rr' | 'spo2') => {
    const current = parseFloat(currentValue);
    const previous = parseFloat(previousValue);
    if (isNaN(current) || isNaN(previous)) return null;
    
    const diff = current - previous;
    if (Math.abs(diff) < 0.5) return { icon: <Minus className="h-3 w-3 text-gray-400" />, trend: 'stable' };
    if (diff > 0) return { icon: <TrendingUp className="h-3 w-3 text-red-500" />, trend: 'up' };
    return { icon: <TrendingDown className="h-3 w-3 text-blue-500" />, trend: 'down' };
  };

  if (loading) { 
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading consultation room...</p>
          </div>
        </div>
      </DashboardLayout>
    ); 
  }
  
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-600 mb-2">Error Loading Room</h2>
            <p className="text-muted-foreground mb-4">{error || 'Unknown error'}</p>
            <Button onClick={() => router.push("/consultation/start")}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back to Room Selection
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  if (!room) { 
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Room Not Found</h2>
            <p className="text-muted-foreground mb-4">The consultation room could not be found.</p>
            <Button onClick={() => router.push("/consultation/start")}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back to Room Selection
            </Button>
          </div>
        </div>
      </DashboardLayout>
    ); 
  }

  if (!sessionActive || !currentPatient) {
    const emergencyPatients = patients.filter((p) => p.priority === "Emergency");
    const highPriorityPatients = patients.filter((p) => p.priority === "High");
    const mediumPriorityPatients = patients.filter((p) => p.priority === "Medium");
    const lowPriorityPatients = patients.filter((p) => p.priority === "Low");
    const avgWaitTime = patients.length > 0 ? Math.round(patients.reduce((sum, p) => sum + p.waitTime, 0) / patients.length) : 0;

    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-lg">
                  {room.name.charAt(0)}
                </div>
                {room.name}
              </h1>
              <p className="text-muted-foreground mt-1">
                Consultation Room • {room.specialtyFocus || "General Practice"} • {room.doctor || "No doctor assigned"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button variant="outline" onClick={() => router.push("/consultation/start")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Exit Room
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Patients in Queue</p><p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{patients.length}</p></div><Users className="h-8 w-8 text-blue-500" /></div></CardContent></Card>
            <Card className="border-l-4 border-l-red-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Emergency</p><p className="text-2xl font-bold text-red-600 dark:text-red-400">{emergencyPatients.length}</p></div><AlertTriangle className="h-8 w-8 text-red-500" /></div></CardContent></Card>
            <Card className="border-l-4 border-l-orange-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">High Priority</p><p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{highPriorityPatients.length}</p></div><Clock className="h-8 w-8 text-orange-500" /></div></CardContent></Card>
            <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Avg Wait Time</p><p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{avgWaitTime} min</p></div><Activity className="h-8 w-8 text-purple-500" /></div></CardContent></Card>
          </div>

          {patients.length > 0 && (
            <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center"><Stethoscope className="h-5 w-5 text-white" /></div>
                    <div><div className="font-medium text-gray-900 dark:text-white">Ready to consult?</div><div className="text-sm text-gray-600 dark:text-gray-400">{patients.length} patient{patients.length !== 1 ? "s" : ""} waiting for consultation</div></div>
                  </div>
                  <Button size="lg" onClick={() => handleStartSession(patients[0])} className="bg-emerald-600 hover:bg-emerald-700 shadow-lg">Start with Next Patient</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Patient Queue</CardTitle><Badge variant="secondary">{patients.length} waiting</Badge></div></CardHeader>
            <CardContent>
              {patients.length > 0 ? (
                <div className="space-y-3">
                  {patients.map((patient, index) => (
                    <Card key={patient.id} className={`hover:shadow-lg transition-all cursor-pointer ${patient.priority === "Emergency" ? "border-l-4 border-l-red-500 bg-red-50 dark:bg-red-900/10" : patient.priority === "High" ? "border-l-4 border-l-orange-500" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-200 font-bold">{index + 1}</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="font-semibold text-lg">{patient.name}</div>
                                <Badge className={getPriorityColor(patient.priority)}>{patient.priority}</Badge>
                                {patient.vitalsCompleted && <Badge className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400" variant="outline">✓ Vitals Done</Badge>}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><User className="h-3 w-3" />{patient.age}y, {patient.gender}</span>
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Waiting {patient.waitTime} min</span>
                                <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{patient.mrn}</span>
                              </div>
                              {patient.allergies.length > 0 && <div className="mt-2 flex items-center gap-1 text-xs"><AlertTriangle className="h-3 w-3 text-red-500" /><span className="text-red-600 dark:text-red-400 font-medium">Allergies: {patient.allergies.join(", ")}</span></div>}
                            </div>
                          </div>
                          <Button onClick={() => handleStartSession(patient)} className="bg-emerald-600 hover:bg-emerald-700 shadow-md"><Stethoscope className="mr-2 h-4 w-4" />Start Session</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                  <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4"><Users className="h-10 w-10 text-muted-foreground" /></div>
                  <div className="text-xl font-medium mb-2">No Patients Waiting</div>
                  <div className="text-sm text-muted-foreground mb-4">Your queue is empty. Patients will appear here when sent from nursing.</div>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><CheckCircle className="h-4 w-4" /><span>Room ready for new patients</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600" />Today's Activity</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"><span className="text-sm text-muted-foreground">Consultations Completed</span><span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{room.totalConsultationsToday}</span></div><div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg"><span className="text-sm text-muted-foreground">Average Consultation Time</span><span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{room.averageConsultationTime} min</span></div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-600" />Room Info</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg"><span className="text-sm text-muted-foreground">Doctor</span><span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{room.doctor}</span></div><div className="flex items-center justify-between p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg"><span className="text-sm text-muted-foreground">Specialty</span><span className="text-sm font-bold text-teal-600 dark:text-teal-400">{room.specialtyFocus || "General"}</span></div></CardContent></Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Active Session View
  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Consultation Session</h1>
            <p className="text-muted-foreground mt-1">Room: {room.name} • {room.doctor}</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Session Duration: {sessionDuration} min</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowRoomQueueDialog(true)}>
              <Users className="mr-2 h-4 w-4" />
              Room Queue ({patients.length})
            </Button>
            <Button variant="destructive" onClick={() => setShowEndDialog(true)}>
              End Session
            </Button>
          </div>
        </div>

        {/* Patient Info Card */}
        {currentPatient && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start gap-6">
              <PatientAvatar 
                name={currentPatient.name} 
                photoUrl={currentPatient.photo || null}
                size="lg"
              />
              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <CardTitle className="text-2xl mb-1">{currentPatient.name}</CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span><strong>Patient ID:</strong> {currentPatient.patientId}</span>
                      <span><strong>Age:</strong> {currentPatient.age} years</span>
                      <span><strong>Gender:</strong> {currentPatient.gender}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400">
                    Session Active
                  </Badge>
                    {wardAdmissions.some(admission => admission.status === 'admitted') && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400">
                          <Building2 className="h-3 w-3 mr-1" />
                          Admitted
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                          onClick={() => setShowDischargeDialog(true)}
                        >
                          <UserX className="h-3 w-3 mr-1" />
                          Discharge
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  {/* Medical Information */}
                  {(currentPatient.bloodGroup || currentPatient.genotype) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {currentPatient.bloodGroup && (
                        <div>
                          <span className="text-muted-foreground">Blood Group:</span>
                          <span className="ml-2 font-semibold text-red-600">{currentPatient.bloodGroup}</span>
                        </div>
                      )}
                      {currentPatient.genotype && (
                        <div>
                          <span className="text-muted-foreground">Genotype:</span>
                          <span className="ml-2 font-semibold text-green-600">{currentPatient.genotype}</span>
                        </div>
                      )}
                      {currentPatient.religion && (
                        <div>
                          <span className="text-muted-foreground">Religion:</span>
                          <span className="ml-2 font-semibold">{currentPatient.religion}</span>
                        </div>
                      )}
                      {currentPatient.tribe && (
                        <div>
                          <span className="text-muted-foreground">Tribe:</span>
                          <span className="ml-2 font-semibold">{currentPatient.tribe}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Employment/Organization Information */}
                  {(currentPatient.division || currentPatient.location || currentPatient.employeeType || currentPatient.occupation) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {currentPatient.division && (
                        <div>
                          <span className="text-muted-foreground">Division:</span>
                          <span className="ml-2 font-semibold">{currentPatient.division}</span>
                        </div>
                      )}
                      {currentPatient.location && (
                        <div>
                          <span className="text-muted-foreground">Location:</span>
                          <span className="ml-2 font-semibold">{currentPatient.location}</span>
                        </div>
                      )}
                      {currentPatient.employeeType && (
                        <div>
                          <span className="text-muted-foreground">Employee Type:</span>
                          <span className="ml-2 font-semibold">{currentPatient.employeeType}</span>
                        </div>
                      )}
                      {currentPatient.occupation && (
                        <div>
                          <span className="text-muted-foreground">Occupation:</span>
                          <span className="ml-2 font-semibold">{currentPatient.occupation}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Contact Information */}
                  {(currentPatient.phone || currentPatient.email) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {currentPatient.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Phone:</span>
                          <span className="font-semibold">{currentPatient.phone}</span>
                        </div>
                      )}
                      {currentPatient.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Email:</span>
                          <span className="font-semibold">{currentPatient.email}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {currentPatient.allergies.length > 0 && (
                  <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Allergies: {currentPatient.allergies.join(", ")}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>
        )}

        {/* Vitals Card */}
        {currentPatient.vitals && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Current Vitals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Temperature</div>
                  <div className="text-lg font-bold text-blue-600">{currentPatient.vitals.temperature}°C</div>
                </div>
                <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Blood Pressure</div>
                  <div className="text-lg font-bold text-red-600">{currentPatient.vitals.bloodPressure}</div>
                </div>
                <div className="text-center p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Heart Rate</div>
                  <div className="text-lg font-bold text-pink-600">{currentPatient.vitals.heartRate} bpm</div>
                </div>
                <div className="text-center p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Resp. Rate</div>
                  <div className="text-lg font-bold text-cyan-600">{currentPatient.vitals.respiratoryRate}/min</div>
                </div>
                <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">SpO2</div>
                  <div className="text-lg font-bold text-emerald-600">{currentPatient.vitals.oxygenSaturation}%</div>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Weight</div>
                  <div className="text-lg font-bold text-purple-600">{currentPatient.vitals.weight} kg</div>
                </div>
                <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Height</div>
                  <div className="text-lg font-bold text-orange-600">{currentPatient.vitals.height} cm</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="notes" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              <span className="hidden lg:inline">Notes</span>
            </TabsTrigger>
            <TabsTrigger value="prescriptions" className="flex items-center gap-1">
              <Pill className="h-4 w-4" />
              <span className="hidden lg:inline">Prescriptions</span>
            </TabsTrigger>
            <TabsTrigger value="lab" className="flex items-center gap-1">
              <TestTube className="h-4 w-4" />
              <span className="hidden lg:inline">Lab</span>
            </TabsTrigger>
            <TabsTrigger value="radiology" className="flex items-center gap-1">
              <ScanLine className="h-4 w-4" />
              <span className="hidden lg:inline">Radiology</span>
            </TabsTrigger>
            <TabsTrigger value="physiotherapy" className="flex items-center gap-1">
              <Activity className="h-4 w-4" />
              <span className="hidden lg:inline">Physio</span>
            </TabsTrigger>
            <TabsTrigger value="nursing" className="flex items-center gap-1">
              <Syringe className="h-4 w-4" />
              <span className="hidden lg:inline">Nursing</span>
            </TabsTrigger>
            <TabsTrigger value="referral" className="flex items-center gap-1">
              <Send className="h-4 w-4" />
              <span className="hidden lg:inline">Referral</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1">
              <History className="h-4 w-4" />
              <span className="hidden lg:inline">History</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notes">
            <Card>
              <CardHeader><CardTitle>Medical Notes</CardTitle><CardDescription>Document the consultation findings and plan</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Presentation Complaint</Label><Textarea value={medicalNotes.presentationComplaint} onChange={(e) => setMedicalNotes({ ...medicalNotes, presentationComplaint: e.target.value })} placeholder="Chief complaint or presenting symptoms..." rows={3} /></div>
                <div className="space-y-2"><Label>History of Present Illness</Label><Textarea value={medicalNotes.historyOfPresentIllness} onChange={(e) => setMedicalNotes({ ...medicalNotes, historyOfPresentIllness: e.target.value })} placeholder="Detailed history..." rows={4} /></div>
                <div className="space-y-2"><Label>Physical Examination</Label><Textarea value={medicalNotes.physicalExamination} onChange={(e) => setMedicalNotes({ ...medicalNotes, physicalExamination: e.target.value })} placeholder="Examination findings..." rows={4} /></div>
                
                {/* ICD-10 Diagnosis Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Diagnosis (ICD-10)</Label>
                    <Button variant="outline" size="sm" onClick={() => setShowAddDiagnosis(true)}>
                      <Plus className="h-4 w-4 mr-1" />Add Diagnosis
                    </Button>
                  </div>
                  
                  {diagnoses.length === 0 ? (
                    <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground">
                      <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No diagnoses added yet</p>
                      <p className="text-xs">Click "Add Diagnosis" to search and add ICD-10 codes</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {diagnoses.map((dx, index) => (
                        <div key={dx.id} className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${
                          dx.certainty === 'confirmed' ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800' :
                          dx.certainty === 'probable' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' :
                          'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                        }`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className={`text-xs ${
                                dx.status === 'confirmed' ? 'bg-green-500/10 text-green-600 border-green-500/30' :
                                dx.status === 'suspected' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                                'bg-red-500/10 text-red-600 border-red-500/30'
                              }`}>{dx.status}</Badge>
                              <span className="font-mono text-sm font-medium">{dx.icd10_code_details?.code || 'Unknown'}</span>
                            </div>
                            <p className="text-sm font-medium">{dx.icd10_code_details?.description || dx.diagnosis_text || 'Unknown diagnosis'}</p>
                            {dx.notes && <p className="text-xs text-muted-foreground mt-1">{dx.notes}</p>}
                            {dx.diagnosis_text && <p className="text-xs text-muted-foreground mt-1">{dx.diagnosis_text}</p>}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={async () => {
                              try {
                                await consultationService.deleteDiagnosis(dx.id);
                                setDiagnoses(diagnoses.filter(d => d.id !== dx.id));
                                toast.success('Diagnosis removed');
                              } catch (err: any) {
                                console.error('Error deleting diagnosis:', err);
                                toast.error('Failed to remove diagnosis');
                              }
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2"><Label>Assessment</Label><Textarea value={medicalNotes.assessment} onChange={(e) => setMedicalNotes({ ...medicalNotes, assessment: e.target.value })} placeholder="Clinical assessment and reasoning..." rows={3} /></div>
                <div className="space-y-2"><Label>Plan</Label><Textarea value={medicalNotes.plan} onChange={(e) => setMedicalNotes({ ...medicalNotes, plan: e.target.value })} placeholder="Treatment plan, follow-up instructions..." rows={4} /></div>
                <Button 
                  className="w-full" 
                  onClick={async () => {
                    if (!sessionId) {
                      toast.error('No active session. Please start a consultation session first.');
                      return;
                    }
                    
                    try {
                      // Update the consultation session with medical notes
                      const sessionData = {
                        presentation_complaint: medicalNotes.presentationComplaint || '',
                        history_of_presenting_illness: medicalNotes.historyOfPresentIllness || '',
                        physical_examination: medicalNotes.physicalExamination || '',
                        assessment: medicalNotes.assessment || '',
                        plan: medicalNotes.plan || '',
                        notes: '',
                      };
                      
                      await consultationService.updateSession(sessionId, sessionData);

                      // Reload the session data to update the selectedSession state
                      try {
                        const updatedSession = await consultationService.getSession(sessionId);
                        setSelectedSession(updatedSession);
                      } catch (reloadErr) {
                        console.warn('Could not reload session data:', reloadErr);
                      }

                      toast.success('Medical notes saved successfully');
                    } catch (err: any) {
                      console.error('Error saving medical notes:', err);
                      toast.error(err.message || 'Failed to save medical notes');
                    }
                  }}
                >
                  <Save className="mr-2 h-4 w-4" />Save Medical Notes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prescriptions">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-violet-500" />
                      Prescriptions
                    </CardTitle>
                    <CardDescription>Prescribe medications - will be sent to Pharmacy queue</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddPrescription(true)}>
                      <Plus className="mr-2 h-4 w-4" />Add Medication
                    </Button>
                    {prescriptions.length > 0 && prescriptions.some(rx => rx.status === 'Draft') && (
                      <Button onClick={sendPrescriptionsToPharmacy} className="bg-violet-600 hover:bg-violet-700">
                        <Pill className="mr-2 h-4 w-4" />
                        Send to Pharmacy ({prescriptions.filter(rx => rx.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Allergy Warning */}
                {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Patient Allergies: {currentPatient.allergies.join(', ')}</span>
                    </div>
                  </div>
                )}

                {prescriptions.length > 0 ? (
                  <div className="space-y-3">
                    {prescriptions.map((rx, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Pharmacy': return 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400';
                          case 'Processing': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Dispensed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      const getPriorityBadge = (priority: string) => {
                        switch (priority) {
                          case 'Emergency': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
                          case 'Urgent': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                        }
                      };
                      
                      return (
                        <Card key={rx.id} className={`border-l-4 ${rx.status === 'Draft' ? 'border-l-gray-400' : rx.status === 'Sent to Pharmacy' ? 'border-l-violet-500' : 'border-l-emerald-500'}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className={`p-1.5 rounded-full ${rx.status === 'Draft' ? 'bg-gray-100 dark:bg-gray-800' : 'bg-violet-100 dark:bg-violet-900/30'}`}>
                                  <Pill className={`h-3.5 w-3.5 ${rx.status === 'Draft' ? 'text-gray-600' : 'text-violet-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-semibold text-sm">{rx.medication}</span>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getStatusBadge(rx.status)}`}>{rx.status}</Badge>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getPriorityBadge(rx.priority)}`}>{rx.priority}</Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground mb-0.5">
                                    <span className="font-medium">{rx.dosage}</span> • {rx.route} • {rx.frequency} • {rx.duration}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span><strong>Qty:</strong> {rx.quantity}</span>
                                    {rx.genericName && <span><strong>Generic:</strong> {rx.genericName}</span>}
                                  </div>
                                  {rx.instructions && (
                                    <div className="text-xs text-muted-foreground mt-1 p-1.5 bg-muted/50 rounded">
                                      <strong>Instructions:</strong> {rx.instructions}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {rx.status === 'Draft' && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => editPrescription(index)}
                                    className="text-blue-500 hover:text-blue-600"
                                    title="Edit prescription"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => setPrescriptions(prescriptions.filter((_, i) => i !== index))}
                                  className="text-red-500 hover:text-red-600"
                                    title="Remove prescription"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                                </div>
                              )}
                              {rx.status === 'Sent to Pharmacy' && (
                                <Badge className="bg-violet-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-violet-50 to-violet-100/50 dark:from-violet-900/10 dark:to-violet-900/5 rounded-lg border-2 border-dashed border-violet-200 dark:border-violet-800">
                    <Pill className="h-12 w-12 mx-auto mb-3 text-violet-500 opacity-60" />
                    <p className="font-medium text-violet-900 dark:text-violet-100 mb-1">No prescriptions yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Add medications to be sent to the Pharmacy</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddPrescription(true)} className="border-violet-300 text-violet-700 hover:bg-violet-100">
                      <Plus className="h-4 w-4 mr-1" />Add First Medication
                    </Button>
                  </div>
                )}

                {/* Pharmacy Workflow Info */}
                <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                  <h4 className="font-medium text-violet-900 dark:text-violet-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Prescription Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-violet-100 dark:bg-violet-900/30">Sent to Pharmacy</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Processing</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Dispensed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Click "Send to Pharmacy" to queue prescriptions for dispensing</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lab">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Lab Orders</CardTitle>
                    <CardDescription>Request laboratory tests - Orders are sent to Lab Tech queue</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setShowAddLabOrder(true)} className="bg-amber-500 hover:bg-amber-600">
                      <Plus className="mr-2 h-4 w-4" />Add Test
                    </Button>
                    {labOrders.length > 0 && labOrders.some(order => order.status === 'Draft') && (
                      <Button onClick={sendLabOrdersToLab} className="bg-amber-600 hover:bg-amber-700">
                        <TestTube className="mr-2 h-4 w-4" />
                        Send to Lab ({labOrders.filter(order => order.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {labOrders.length > 0 ? (
                  <div className="space-y-3">
                    {labOrders.map((order, index) => {
                      const getLabStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Lab': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      return (
                        <Card key={order.id} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Lab' ? 'border-l-amber-500' : 'border-l-blue-500'} ${order.priority === 'STAT' ? 'bg-rose-50 dark:bg-rose-900/10' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className={`p-1.5 rounded-full ${order.priority === 'STAT' ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                                  <TestTube className={`h-3.5 w-3.5 ${order.priority === 'STAT' ? 'text-rose-600' : 'text-amber-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-semibold text-sm">{order.test}</span>
                                    <Badge variant={order.priority === "STAT" ? "destructive" : order.priority === "Urgent" ? "default" : "secondary"} className={`text-xs px-1.5 py-0.5 ${order.priority === 'STAT' ? 'bg-rose-500' : order.priority === 'Urgent' ? 'bg-amber-500' : ''}`}>
                                      {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {order.priority}
                                    </Badge>
                                    <Badge className={`text-xs px-1.5 py-0.5 ${getLabStatusBadge(order.status)}`}>{order.status}</Badge>
                                  </div>
                                  {order.notes && <p className="text-xs text-muted-foreground mb-0.5">{order.notes}</p>}
                                  {order.status === 'Sent to Lab' && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      <span>Sent to Lab Tech queue • Est. TAT: {order.priority === 'STAT' ? '30 min - 1 hour' : order.priority === 'Urgent' ? '1 - 2 hours' : '2 - 4 hours'}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {order.status === 'Draft' && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => editLabOrder(index)}
                                    className="text-blue-500 hover:text-blue-600"
                                    title="Edit lab order"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setLabOrders(labOrders.filter((_, i) => i !== index))}
                                    className="text-rose-500 hover:text-rose-600"
                                    title="Remove lab order"
                                  >
                                  <X className="h-4 w-4" />
                                </Button>
                                </div>
                              )}
                              {order.status === 'Sent to Lab' && (
                                <Badge className="bg-amber-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-amber-50 to-amber-100/50 dark:from-amber-900/10 dark:to-amber-900/5 rounded-lg border-2 border-dashed border-amber-200 dark:border-amber-800">
                    <TestTube className="h-12 w-12 mx-auto mb-3 text-amber-500 opacity-60" />
                    <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">No lab orders yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Order tests to be processed by the lab</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddLabOrder(true)} className="border-amber-300 text-amber-700 hover:bg-amber-100">
                      <Plus className="h-4 w-4 mr-1" />Order First Test
                    </Button>
                  </div>
                )}
                
                {/* Lab Workflow Info */}
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Lab Order Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Ordered</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-violet-100 dark:bg-violet-900/30">Collected</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Processing</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">Results Ready</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Verified ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Results will appear here and in patient record once verified by Sr. Admin</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="physiotherapy">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-emerald-500" />
                      Physiotherapy Orders
                    </CardTitle>
                    <CardDescription>
                      Order physiotherapy treatment sessions — will be sent to Physiotherapy pool queue.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddPhysio(true)}>
                      <Plus className="mr-2 h-4 w-4" />Add Physio Order
                    </Button>
                    {physioOrders.some(p => p.status === 'Draft') && (
                      <Button onClick={sendPhysioOrders} className="bg-emerald-600 hover:bg-emerald-700">
                        <Activity className="mr-2 h-4 w-4" />
                        Send to Physio ({physioOrders.filter(p => p.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {(() => {
                  const apiDisplay = (physioOrdersFromApi || []).map((o: any) => ({
                    id: o.id, diagnosis: o.diagnosis, chiefComplaint: o.chief_complaint, treatmentGoal: o.treatment_goal, specialInstructions: o.special_instructions, priority: o.priority || 'routine',
                    status: (o.status === 'pending' ? 'Sent to Physiotherapy' : o.status === 'scheduled' ? 'Scheduled' : o.status === 'in_progress' ? 'In Progress' : o.status === 'completed' ? 'Completed' : String(o.status || '')) as any,
                    fromApi: true
                  }));
                  const draftsWithIndex = physioOrders.map((o, i) => ({ ...o, draftIndex: i }));
                  const allOrders = [...apiDisplay, ...draftsWithIndex];
                  const getStatusBadge = (status: string) => {
                    switch (status) {
                      case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                      case 'Sent to Physiotherapy': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                      case 'Scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                      case 'In Progress': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                      case 'Completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
                      default: return 'bg-gray-100 text-gray-800';
                    }
                  };
                  const getPriorityBadge = (priority: string) => {
                    switch (priority) {
                      case 'stat': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
                      case 'urgent': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
                      case 'routine': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                      default: return 'bg-gray-100 text-gray-800';
                    }
                  };
                  return allOrders.length > 0 ? (
                    <div className="space-y-3">
                      {allOrders.map((order: any, index: number) => (
                        <Card key={order.fromApi ? `api-${order.id}` : order.id || index} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Physiotherapy' ? 'border-l-emerald-500' : order.status === 'Completed' ? 'border-l-green-500' : 'border-l-emerald-500'} ${order.priority === 'stat' ? 'bg-rose-50 dark:bg-rose-900/10' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className={`p-1.5 rounded-full ${order.priority === 'stat' ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                                  <Activity className={`h-3.5 w-3.5 ${order.priority === 'stat' ? 'text-rose-600' : 'text-emerald-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-semibold text-sm">{order.diagnosis || 'Physiotherapy Treatment'}</span>
                                    <Badge variant={order.priority === "stat" ? "destructive" : order.priority === "urgent" ? "default" : "secondary"} className={`text-xs px-1.5 py-0.5 ${order.priority === 'stat' ? 'bg-rose-500' : order.priority === 'urgent' ? 'bg-amber-500' : ''}`}>
                                      {order.priority === 'stat' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {order.priority}
                                    </Badge>
                                    <Badge className={`text-xs px-1.5 py-0.5 ${getStatusBadge(order.status)}`}>{order.status}</Badge>
                                  </div>
                                  {(order.chiefComplaint || order.chief_complaint) && <p className="text-xs text-muted-foreground mb-0.5">{order.chiefComplaint || order.chief_complaint}</p>}
                                  {(order.treatmentGoal || order.treatment_goal) && <p className="text-xs text-muted-foreground">{order.treatmentGoal || order.treatment_goal}</p>}
                                  {order.status === 'Sent to Physiotherapy' && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                      <Clock className="h-3 w-3" />
                                      <span>Sent to Physio queue • Ready for scheduling</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {order.status === 'Draft' && typeof order.draftIndex === 'number' && (
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => editPhysioOrder(order.draftIndex)} className="text-blue-500 hover:text-blue-600" title="Edit physio order">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setPhysioOrders(prev => prev.filter((_, i) => i !== order.draftIndex))} className="text-rose-500 hover:text-rose-600" title="Remove physio order">
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                              {order.status === 'Sent to Physiotherapy' && (
                                <Badge className="bg-emerald-500 text-white"><CheckCircle className="h-3 w-3 mr-1" />Queued</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gradient-to-b from-emerald-50 to-emerald-100/50 dark:from-emerald-900/10 dark:to-emerald-900/5 rounded-lg border-2 border-dashed border-emerald-200 dark:border-emerald-800">
                      <Activity className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-60" />
                      <p className="font-medium text-emerald-900 dark:text-emerald-100 mb-1">No physiotherapy orders yet</p>
                      <p className="text-sm text-muted-foreground mb-4">Order treatments to be processed by physiotherapy</p>
                      <Button variant="outline" size="sm" onClick={() => setShowAddPhysio(true)} className="border-emerald-300 text-emerald-700 hover:bg-emerald-100">
                        <Plus className="h-4 w-4 mr-1" />Order First Treatment
                      </Button>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nursing">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Syringe className="h-5 w-5 text-cyan-500" />
                      Nursing Orders
                    </CardTitle>
                    <CardDescription>Request nursing procedures - will be sent to Nursing queue</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                      loadWards(); // Load wards when opening modal
                      setShowAddNursingOrder(true);
                    }}>
                      <Plus className="mr-2 h-4 w-4" />Add Procedure
                    </Button>
                    {nursingOrders.length > 0 && nursingOrders.some(order => order.status === 'Draft') && (
                      <Button onClick={sendNursingOrdersToNursing} className="bg-cyan-600 hover:bg-cyan-700">
                        <Syringe className="mr-2 h-4 w-4" />
                        Send to Nursing ({nursingOrders.filter(order => order.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Allergy Warning for Injections */}
                {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Patient Allergies: {currentPatient.allergies.join(', ')}</span>
                    </div>
                  </div>
                )}

                {nursingOrders.length > 0 ? (
                  <div className="space-y-3">
                    {nursingOrders.map((order, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Nursing': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
                          case 'In Progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      const getPriorityBadge = (priority: string) => {
                        switch (priority) {
                          case 'STAT': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
                          case 'Urgent': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                        }
                      };
                      const getTypeBadge = (type: string) => {
                        switch (type) {
                          case 'Injection': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
                          case 'Dressing': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
                        }
                      };
                      
                      return (
                        <Card key={order.id} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Nursing' ? 'border-l-cyan-500' : 'border-l-emerald-500'} ${order.priority === 'STAT' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className={`p-1.5 rounded-full ${order.type === 'Injection' ? 'bg-rose-100 dark:bg-rose-900/30' : order.type === 'Dressing' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-cyan-100 dark:bg-cyan-900/30'}`}>
                                  {getNursingOrderIcon(order.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getTypeBadge(order.type)}`}>{order.type}</Badge>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getStatusBadge(order.status)}`}>{order.status}</Badge>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getPriorityBadge(order.priority)}`}>
                                      {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {order.priority}
                                    </Badge>
                                  </div>
                                  
                                  {/* Type-specific details */}
                                  {order.type === 'Injection' && order.medication && (
                                    <div className="text-xs font-medium mb-0.5">
                                      {order.medication} • {order.dosage} • {order.route}
                                    </div>
                                  )}
                                  {order.type === 'Dressing' && order.woundLocation && (
                                    <div className="text-xs font-medium mb-0.5">
                                      {order.woundType} - {order.woundLocation}
                                      {order.supplies && <span className="text-muted-foreground"> • Supplies: {order.supplies}</span>}
                                    </div>
                                  )}
                                  
                                  <div className="text-xs text-muted-foreground">
                                    <strong>Instructions:</strong> {order.instructions}
                                  </div>
                                </div>
                              </div>
                              {order.status === 'Draft' && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => editNursingOrder(order.id)}
                                    className="text-blue-500 hover:text-blue-600"
                                    title="Edit nursing order"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => setNursingOrders(nursingOrders.filter(o => o.id !== order.id))}
                                  className="text-red-500 hover:text-red-600"
                                    title="Remove nursing order"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                                </div>
                              )}
                              {order.status === 'Sent to Nursing' && (
                                <Badge className="bg-cyan-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-cyan-50 to-cyan-100/50 dark:from-cyan-900/10 dark:to-cyan-900/5 rounded-lg border-2 border-dashed border-cyan-200 dark:border-cyan-800">
                    <Syringe className="h-12 w-12 mx-auto mb-3 text-cyan-500 opacity-60" />
                    <p className="font-medium text-cyan-900 dark:text-cyan-100 mb-1">No nursing orders yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Add procedures to be sent to Nursing</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddNursingOrder(true)} className="border-cyan-300 text-cyan-700 hover:bg-cyan-100">
                      <Plus className="h-4 w-4 mr-1" />Add First Procedure
                    </Button>
                  </div>
                )}

                {/* Nursing Workflow Info */}
                <div className="p-4 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
                  <h4 className="font-medium text-cyan-900 dark:text-cyan-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Nursing Order Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-cyan-100 dark:bg-cyan-900/30">Sent to Nursing</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">In Progress</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Click "Send to Nursing" to queue procedures for the nursing team</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="radiology">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ScanLine className="h-5 w-5 text-indigo-500" />
                      Radiology Orders
                    </CardTitle>
                    <CardDescription>Order imaging studies - X-rays, CT, MRI, Ultrasound</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddRadiology(true)}>
                      <Plus className="mr-2 h-4 w-4" />Add Imaging
                    </Button>
                    {radiologyOrders.length > 0 && radiologyOrders.some(r => r.status === 'Draft') && (
                      <Button onClick={sendRadiologyOrders} className="bg-indigo-600 hover:bg-indigo-700">
                        <ScanLine className="mr-2 h-4 w-4" />
                        Send to Radiology ({radiologyOrders.filter(r => r.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {radiologyOrders.length > 0 ? (
                  <div className="space-y-3">
                    {radiologyOrders.map((order, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Radiology': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
                          case 'Scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'In Progress': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          case 'Completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      const getCategoryBadge = (category: string) => {
                        switch (category) {
                          case 'X-Ray': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Ultrasound': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
                          case 'CT Scan': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
                          case 'MRI': return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400';
                          default: return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
                        }
                      };
                      
                      return (
                        <Card key={order.id} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Radiology' ? 'border-l-indigo-500' : 'border-l-emerald-500'} ${order.priority === 'STAT' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className="p-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                                  <ScanLine className="h-3.5 w-3.5 text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-semibold text-sm">{order.procedure}</span>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getCategoryBadge(order.category)}`}>{order.category}</Badge>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getStatusBadge(order.status)}`}>{order.status}</Badge>
                                    {order.priority !== 'Routine' && (
                                      <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${order.priority === 'STAT' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                                        {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                        {order.priority}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    <strong>Body Part:</strong> {order.bodyPart}
                                  </div>
                                  {order.lmp && (
                                    <div className="text-sm text-muted-foreground mt-1">
                                      <strong>LMP:</strong> {order.lmp}
                                    </div>
                                  )}
                                  <div className="text-sm text-muted-foreground mt-1">
                                    <strong>Indication:</strong> {order.clinicalIndication}
                                  </div>
                                  {order.provisionalDiagnosis && (
                                    <div className="text-sm text-muted-foreground mt-1 p-2 bg-muted/50 rounded">
                                      <strong>Provisional Diagnosis:</strong> {order.provisionalDiagnosis}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {order.status === 'Draft' && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => editRadiologyOrder(order.id)}
                                    className="text-blue-500 hover:text-blue-600"
                                    title="Edit radiology order"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRadiologyOrders(radiologyOrders.filter(o => o.id !== order.id))}
                                    className="text-red-500 hover:text-red-600"
                                    title="Remove radiology order"
                                  >
                                  <X className="h-4 w-4" />
                                </Button>
                                </div>
                              )}
                              {order.status === 'Sent to Radiology' && (
                                <Badge className="bg-indigo-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-indigo-50 to-indigo-100/50 dark:from-indigo-900/10 dark:to-indigo-900/5 rounded-lg border-2 border-dashed border-indigo-200 dark:border-indigo-800">
                    <ScanLine className="h-12 w-12 mx-auto mb-3 text-indigo-500 opacity-60" />
                    <p className="font-medium text-indigo-900 dark:text-indigo-100 mb-1">No radiology orders yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Order imaging studies for diagnosis</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddRadiology(true)} className="border-indigo-300 text-indigo-700 hover:bg-indigo-100">
                      <Plus className="h-4 w-4 mr-1" />Add First Order
                    </Button>
                  </div>
                )}

                {/* Radiology Workflow Info */}
                <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                  <h4 className="font-medium text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Radiology Order Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-indigo-100 dark:bg-indigo-900/30">Sent to Radiology</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Scheduled</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">In Progress</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Results will be available in patient record once completed</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="referral">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Send className="h-5 w-5 text-teal-500" />
                      Referrals
                    </CardTitle>
                    <CardDescription>Refer patient to specialists or other facilities</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddReferral(true)}>
                      <Plus className="mr-2 h-4 w-4" />Add Referral
                    </Button>
                    {referrals.length > 0 && referrals.some(r => r.status === 'Draft') && (
                      <Button onClick={sendReferrals} className="bg-teal-600 hover:bg-teal-700">
                        <Send className="mr-2 h-4 w-4" />
                        Send Referrals ({referrals.filter(r => r.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {referrals.length > 0 ? (
                  <div className="space-y-3">
                    {referrals.map((referral, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400';
                          case 'Accepted': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Scheduled': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
                          case 'Completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      
                      return (
                        <Card key={referral.id} className={`border-l-4 ${referral.status === 'Draft' ? 'border-l-gray-400' : referral.status === 'Sent' ? 'border-l-teal-500' : 'border-l-emerald-500'} ${referral.urgency === 'Emergency' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 flex-1">
                                <div className={`p-2 rounded-full ${referral.facilityType === 'External' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-teal-100 dark:bg-teal-900/30'}`}>
                                  {referral.facilityType === 'External' ? <Building2 className="h-4 w-4 text-orange-600" /> : <UserPlus className="h-4 w-4 text-teal-600" />}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-semibold">{referral.specialty}</span>
                                    <Badge variant="outline" className={getStatusBadge(referral.status)}>{referral.status}</Badge>
                                    <Badge variant="outline" className={referral.facilityType === 'External' ? 'bg-orange-100 text-orange-800' : 'bg-teal-100 text-teal-800'}>
                                      {referral.facilityType}
                                    </Badge>
                                    {referral.urgency !== 'Routine' && (
                                      <Badge variant="outline" className={referral.urgency === 'Emergency' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>
                                        {referral.urgency === 'Emergency' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                        {referral.urgency}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    <strong>Facility:</strong> {referral.facility}
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-1">
                                    <strong>Reason:</strong> {referral.reason}
                                  </div>
                                  {referral.clinicalSummary && (
                                    <div className="text-sm text-muted-foreground mt-2 p-2 bg-muted/50 rounded">
                                      <strong>Clinical Summary:</strong> {referral.clinicalSummary}
                                    </div>
                                  )}
                                  {(referral.contactPerson || referral.contactPhone) && (
                                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                      {referral.contactPerson && <span className="flex items-center gap-1"><User className="h-3 w-3" />{referral.contactPerson}</span>}
                                      {referral.contactPhone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{referral.contactPhone}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {referral.status === 'Draft' && (
                                <Button variant="ghost" size="sm" onClick={() => setReferrals(referrals.filter((_, i) => i !== index))} className="text-red-500 hover:text-red-600">
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              {referral.status === 'Sent' && (
                                <Badge className="bg-teal-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />Sent
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-teal-50 to-teal-100/50 dark:from-teal-900/10 dark:to-teal-900/5 rounded-lg border-2 border-dashed border-teal-200 dark:border-teal-800">
                    <Send className="h-12 w-12 mx-auto mb-3 text-teal-500 opacity-60" />
                    <p className="font-medium text-teal-900 dark:text-teal-100 mb-1">No referrals yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Refer patient to specialists or other facilities</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddReferral(true)} className="border-teal-300 text-teal-700 hover:bg-teal-100">
                      <Plus className="h-4 w-4 mr-1" />Add Referral
                    </Button>
                  </div>
                )}

                {/* Referral Workflow Info */}
                <div className="p-4 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                  <h4 className="font-medium text-teal-900 dark:text-teal-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Referral Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-teal-700 dark:text-teal-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-teal-100 dark:bg-teal-900/30">Sent</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Accepted</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-purple-100 dark:bg-purple-900/30">Scheduled</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Referral letter will be generated and sent to the facility</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <div className="space-y-4">
              {/* Top Row: Allergies + Chronic Conditions Side by Side */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Allergies Card */}
                <Card className={`${medicalHistory.allergies && medicalHistory.allergies.length > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : 'border-muted'}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className={`h-4 w-4 ${medicalHistory.allergies && medicalHistory.allergies.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                      Allergies
                      {medicalHistory.allergies && medicalHistory.allergies.length > 0 && (
                        <Badge variant="outline" className="ml-auto bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          {medicalHistory.allergies.length}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {medicalHistory.allergies && medicalHistory.allergies.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {medicalHistory.allergies.map((allergy: string, index: number) => (
                          <Badge key={index} className="bg-red-600 text-white hover:bg-red-700">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {allergy}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                        <p>No known allergies</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Chronic Conditions Card */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-amber-500" />
                      Chronic Conditions
                      {medicalHistory.diagnoses && medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').length > 0 && (
                        <Badge variant="outline" className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          {medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').length}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {medicalHistory.diagnoses && medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').map((diagnosis: { name: string; code?: string; diagnosedDate?: string }, index: number) => (
                          <div key={index} className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                                {diagnosis.code || 'N/A'}
                              </Badge>
                              <span className="font-medium text-sm">{diagnosis.name}</span>
                            </div>
                            {diagnosis.diagnosedDate && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Diagnosed: {diagnosis.diagnosedDate}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        <Stethoscope className="h-6 w-6 mx-auto mb-2 opacity-50" />
                        <p>No chronic conditions</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* History Tables in Tabs */}
              <Card>
                <CardHeader className="pb-0">
                  <Tabs defaultValue="consultations" className="w-full">
                    <TabsList className="grid w-full grid-cols-7">
                      <TabsTrigger value="consultations" className="text-xs">
                        <ClipboardList className="h-3 w-3 mr-1" />
                        Consultations ({consultationHistory.length})
                      </TabsTrigger>
                      <TabsTrigger value="labs" className="text-xs">
                        <TestTube className="h-3 w-3 mr-1" />
                        Lab Results ({labHistory.length})
                      </TabsTrigger>
                      <TabsTrigger value="imaging" className="text-xs">
                        <ScanLine className="h-3 w-3 mr-1" />
                        Imaging ({imagingHistory.length})
                      </TabsTrigger>
                      <TabsTrigger value="prescriptions" className="text-xs">
                        <Pill className="h-3 w-3 mr-1" />
                        Prescriptions ({prescriptionHistory.length})
                      </TabsTrigger>
                      <TabsTrigger value="vitals" className="text-xs">
                        <Heart className="h-3 w-3 mr-1" />
                        Vitals ({vitalsHistory.length})
                      </TabsTrigger>
                      <TabsTrigger value="physio" className="text-xs">
                        <Activity className="h-3 w-3 mr-1" />
                        Physio ({physioHistory.length})
                      </TabsTrigger>
                      <TabsTrigger value="wards" className="text-xs">
                        <Building2 className="h-3 w-3 mr-1" />
                        Ward Admissions ({wardAdmissions.length})
                      </TabsTrigger>
                      <TabsTrigger value="background" className="text-xs">
                        <User className="h-3 w-3 mr-1" />
                        Background
                      </TabsTrigger>
                    </TabsList>

                    {/* Consultations Tab */}
                    <TabsContent value="consultations" className="mt-4">
                      {(() => {
                        const totalConsultations = consultationHistory.length;
                        const totalConsultationPages = Math.ceil(totalConsultations / consultationsPerPage);
                        const paginatedConsultations = consultationHistory.slice(
                          (consultationsPage - 1) * consultationsPerPage, 
                          consultationsPage * consultationsPerPage
                        );
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <select
                                value={sessionDateFilter}
                                onChange={(e) => { setSessionDateFilter(e.target.value); setConsultationsPage(1); }}
                                className="text-sm border rounded-md px-3 py-1.5 bg-background"
                              >
                                <option value="all">All Time</option>
                                <option value="30">Last 30 Days</option>
                                <option value="90">Last 3 Months</option>
                                <option value="365">Last Year</option>
                              </select>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">Date</th>
                                    <th className="px-4 py-2 text-left font-medium">Doctor</th>
                                    <th className="px-4 py-2 text-left font-medium">Clinic</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {paginatedConsultations.map((session) => (
                                    <tr key={session.id} className="hover:bg-muted/30">
                                      <td className="px-4 py-3 text-muted-foreground">{session.date}</td>
                                      <td className="px-4 py-3">{session.doctor}</td>
                                      <td className="px-4 py-3">
                                        <Badge variant="outline">{session.clinic}</Badge>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => viewSessionDetails(session)}>
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalConsultations === 0 ? 0 : `${(consultationsPage - 1) * consultationsPerPage + 1}-${Math.min(totalConsultations, consultationsPage * consultationsPerPage)}`} of {totalConsultations}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(consultationsPerPage)} onValueChange={(value) => { setConsultationsPerPage(Number(value)); setConsultationsPage(1); }}>
                                    <SelectTrigger className="w-16 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="5">5</SelectItem>
                                      <SelectItem value="10">10</SelectItem>
                                      <SelectItem value="25">25</SelectItem>
                                      <SelectItem value="50">50</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={consultationsPage === 1} onClick={() => setConsultationsPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalConsultationPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalConsultationPages <= 5) pageNum = i + 1;
                                    else if (consultationsPage <= 3) pageNum = i + 1;
                                    else if (consultationsPage >= totalConsultationPages - 2) pageNum = totalConsultationPages - 4 + i;
                                    else pageNum = consultationsPage - 2 + i;
                                    if (pageNum > totalConsultationPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={consultationsPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setConsultationsPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={consultationsPage >= totalConsultationPages} onClick={() => setConsultationsPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Lab Results Tab */}
                    <TabsContent value="labs" className="mt-4">
                      {(() => {
                        const filteredLabs = labHistory.filter((lab: LabTestResult) => labStatusFilter === 'all' || lab.status === labStatusFilter);
                        const totalLabs = filteredLabs.length;
                        const totalLabPages = Math.ceil(totalLabs / labResultsPerPage);
                        const paginatedLabs = filteredLabs.slice((labResultsPage - 1) * labResultsPerPage, labResultsPage * labResultsPerPage);
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <select
                                  value={labDateFilter}
                                  onChange={(e) => { setLabDateFilter(e.target.value); setLabResultsPage(1); }}
                                  className="text-sm border rounded-md px-3 py-1.5 bg-background"
                                >
                                  <option value="all">All Time</option>
                                  <option value="30">Last 30 Days</option>
                                  <option value="90">Last 3 Months</option>
                                  <option value="365">Last Year</option>
                                </select>
                                <select
                                  value={labStatusFilter}
                                  onChange={(e) => { setLabStatusFilter(e.target.value); setLabResultsPage(1); }}
                                  className="text-sm border rounded-md px-3 py-1.5 bg-background"
                                >
                                  <option value="all">All Status</option>
                                  <option value="Normal">Normal</option>
                                  <option value="Abnormal">Abnormal</option>
                                </select>
                              </div>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">Date</th>
                                    <th className="px-4 py-2 text-left font-medium">Test</th>
                                    <th className="px-4 py-2 text-left font-medium">Processed By</th>
                                    <th className="px-4 py-2 text-left font-medium">Verified By</th>
                                    <th className="px-4 py-2 text-center font-medium">Status</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {paginatedLabs.map((lab: LabTestResult) => (
                                    <tr key={lab.id} className="hover:bg-muted/30">
                                      <td className="px-4 py-3 text-muted-foreground">{lab.date || lab.completed_at || '—'}</td>
                                      <td className="px-4 py-3 font-medium">{lab.test_name || 'Unknown Test'}</td>
                                      <td className="px-4 py-3 text-muted-foreground">{lab.performedBy || '—'}</td>
                                      <td className="px-4 py-3 text-muted-foreground">{lab.verifiedBy || '—'}</td>
                                      <td className="px-4 py-3 text-center">
                                        <Badge className={lab.status === 'Normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                                          {lab.status}
                                        </Badge>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => viewLabResultDetails(lab)}>
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalLabs === 0 ? 0 : `${(labResultsPage - 1) * labResultsPerPage + 1}-${Math.min(totalLabs, labResultsPage * labResultsPerPage)}`} of {totalLabs}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(labResultsPerPage)} onValueChange={(value) => { setLabResultsPerPage(Number(value)); setLabResultsPage(1); }}>
                                    <SelectTrigger className="w-16 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="5">5</SelectItem>
                                      <SelectItem value="10">10</SelectItem>
                                      <SelectItem value="25">25</SelectItem>
                                      <SelectItem value="50">50</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={labResultsPage === 1} onClick={() => setLabResultsPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalLabPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalLabPages <= 5) pageNum = i + 1;
                                    else if (labResultsPage <= 3) pageNum = i + 1;
                                    else if (labResultsPage >= totalLabPages - 2) pageNum = totalLabPages - 4 + i;
                                    else pageNum = labResultsPage - 2 + i;
                                    if (pageNum > totalLabPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={labResultsPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setLabResultsPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={labResultsPage >= totalLabPages || totalLabPages === 0} onClick={() => setLabResultsPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Imaging Tab */}
                    <TabsContent value="imaging" className="mt-4">
                      {(() => {
                        const filteredImaging = imagingHistory.filter((img: ServiceRadiologyReport) => imagingStatusFilter === 'all' || img.overall_status === imagingStatusFilter);
                        const totalImaging = filteredImaging.length;
                        const totalImagingPages = Math.ceil(totalImaging / imagingPerPage);
                        const paginatedImaging = filteredImaging.slice((imagingPage - 1) * imagingPerPage, imagingPage * imagingPerPage);
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <select
                                  value={imagingDateFilter}
                                  onChange={(e) => { setImagingDateFilter(e.target.value); setImagingPage(1); }}
                                  className="text-sm border rounded-md px-3 py-1.5 bg-background"
                                >
                                  <option value="all">All Time</option>
                                  <option value="30">Last 30 Days</option>
                                  <option value="90">Last 3 Months</option>
                                  <option value="365">Last Year</option>
                                </select>
                                <select
                                  value={imagingStatusFilter}
                                  onChange={(e) => { setImagingStatusFilter(e.target.value); setImagingPage(1); }}
                                  className="text-sm border rounded-md px-3 py-1.5 bg-background"
                                >
                                  <option value="all">All Status</option>
                                  <option value="Normal">Normal</option>
                                  <option value="Abnormal">Abnormal</option>
                                </select>
                              </div>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">Date</th>
                                    <th className="px-4 py-2 text-left font-medium">Procedure</th>
                                    <th className="px-4 py-2 text-left font-medium">Reported By</th>
                                    <th className="px-4 py-2 text-left font-medium">Verified By</th>
                                    <th className="px-4 py-2 text-center font-medium">Status</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {paginatedImaging.map((img: ServiceRadiologyReport, index: number) => (
                                    <tr key={index} className="hover:bg-muted/30">
                                      <td className="px-4 py-3 text-muted-foreground">{formatDate(img.created_at)}</td>
                                      <td className="px-4 py-3 font-medium">{img.study_details?.procedure || `Study ${img.study}`}</td>
                                      <td className="px-4 py-3 text-muted-foreground">{'—'}</td>
                                      <td className="px-4 py-3 text-muted-foreground">{'—'}</td>
                                      <td className="px-4 py-3 text-center">
                                        <Badge className={img.overall_status === 'normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                                          {img.overall_status || 'pending'}
                                        </Badge>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing ${img.study_details?.procedure || `Study ${img.study}`}`)}>
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalImaging === 0 ? 0 : `${(imagingPage - 1) * imagingPerPage + 1}-${Math.min(totalImaging, imagingPage * imagingPerPage)}`} of {totalImaging}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(imagingPerPage)} onValueChange={(value) => { setImagingPerPage(Number(value)); setImagingPage(1); }}>
                                    <SelectTrigger className="w-16 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="5">5</SelectItem>
                                      <SelectItem value="10">10</SelectItem>
                                      <SelectItem value="25">25</SelectItem>
                                      <SelectItem value="50">50</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={imagingPage === 1} onClick={() => setImagingPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalImagingPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalImagingPages <= 5) pageNum = i + 1;
                                    else if (imagingPage <= 3) pageNum = i + 1;
                                    else if (imagingPage >= totalImagingPages - 2) pageNum = totalImagingPages - 4 + i;
                                    else pageNum = imagingPage - 2 + i;
                                    if (pageNum > totalImagingPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={imagingPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setImagingPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={imagingPage >= totalImagingPages || totalImagingPages === 0} onClick={() => setImagingPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Prescriptions Tab */}
                    <TabsContent value="prescriptions" className="mt-4">
                      {(() => {
                        // Filter prescriptions based on date and status filters
                        let filteredPrescriptions = [...prescriptionHistory];
                        
                        // Apply date filter
                        if (prescriptionsDateFilter !== 'all') {
                          const days = parseInt(prescriptionsDateFilter);
                          const cutoffDate = new Date();
                          cutoffDate.setDate(cutoffDate.getDate() - days);
                          filteredPrescriptions = filteredPrescriptions.filter(p => {
                            const prescriptionDate = new Date(p.date);
                            return prescriptionDate >= cutoffDate;
                          });
                        }
                        
                        // Apply status filter
                        if (prescriptionsStatusFilter !== 'all') {
                          filteredPrescriptions = filteredPrescriptions.filter(p => p.status === prescriptionsStatusFilter);
                        }
                        
                        const totalPrescriptions = filteredPrescriptions.length;
                        const totalPrescriptionsPages = Math.ceil(totalPrescriptions / prescriptionsPerPage);
                        const paginatedPrescriptions = filteredPrescriptions.slice(
                          (prescriptionsPage - 1) * prescriptionsPerPage, 
                          prescriptionsPage * prescriptionsPerPage
                        );
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3 gap-2">
                              <select
                                value={prescriptionsDateFilter}
                                onChange={(e) => { setPrescriptionsDateFilter(e.target.value); setPrescriptionsPage(1); }}
                                className="text-sm border rounded-md px-3 py-1.5 bg-background"
                              >
                                <option value="all">All Time</option>
                                <option value="30">Last 30 Days</option>
                                <option value="90">Last 3 Months</option>
                                <option value="365">Last Year</option>
                              </select>
                              <select
                                value={prescriptionsStatusFilter}
                                onChange={(e) => { setPrescriptionsStatusFilter(e.target.value); setPrescriptionsPage(1); }}
                                className="text-sm border rounded-md px-3 py-1.5 bg-background"
                              >
                                <option value="all">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="partially_dispensed">Partially Dispensed</option>
                                <option value="dispensed">Dispensed</option>
                              </select>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">Date</th>
                                    <th className="px-4 py-2 text-left font-medium">Prescription ID</th>
                                    <th className="px-4 py-2 text-left font-medium">Doctor</th>
                                    <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
                                    <th className="px-4 py-2 text-left font-medium">Medications</th>
                                    <th className="px-4 py-2 text-center font-medium">Status</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {paginatedPrescriptions.map((prescription) => (
                                    <tr key={prescription.id} className="hover:bg-muted/30">
                                      <td className="px-4 py-3 text-muted-foreground">{prescription.date}</td>
                                      <td className="px-4 py-3">
                                        <Badge variant="outline">{prescription.prescriptionId}</Badge>
                                      </td>
                                      <td className="px-4 py-3">{prescription.doctor}</td>
                                      <td className="px-4 py-3">{prescription.diagnosis}</td>
                                      <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                          {prescription.medications.map((med: any, idx: number) => (
                                            <Badge key={idx} variant="outline" className="text-xs">
                                              {med.medication_name || med.medication?.name || med.name || 'Unknown'}
                                            </Badge>
                                          ))}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Badge 
                                          variant="outline" 
                                          className={
                                            prescription.status === 'dispensed' 
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                              : prescription.status === 'partially_dispensed'
                                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                                          }
                                        >
                                          {prescription.status === 'dispensed' ? 'Dispensed' : 
                                           prescription.status === 'partially_dispensed' ? 'Partially Dispensed' : 
                                           'Pending'}
                                        </Badge>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => viewPrescriptionDetails(prescription)}>
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalPrescriptions === 0 ? 0 : `${(prescriptionsPage - 1) * prescriptionsPerPage + 1}-${Math.min(totalPrescriptions, prescriptionsPage * prescriptionsPerPage)}`} of {totalPrescriptions}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(prescriptionsPerPage)} onValueChange={(value) => { setPrescriptionsPerPage(Number(value)); setPrescriptionsPage(1); }}>
                                    <SelectTrigger className="w-16 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="5">5</SelectItem>
                                      <SelectItem value="10">10</SelectItem>
                                      <SelectItem value="25">25</SelectItem>
                                      <SelectItem value="50">50</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={prescriptionsPage === 1} onClick={() => setPrescriptionsPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalPrescriptionsPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalPrescriptionsPages <= 5) pageNum = i + 1;
                                    else if (prescriptionsPage <= 3) pageNum = i + 1;
                                    else if (prescriptionsPage >= totalPrescriptionsPages - 2) pageNum = totalPrescriptionsPages - 4 + i;
                                    else pageNum = prescriptionsPage - 2 + i;
                                    if (pageNum > totalPrescriptionsPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={prescriptionsPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setPrescriptionsPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={prescriptionsPage >= totalPrescriptionsPages || totalPrescriptionsPages === 0} onClick={() => setPrescriptionsPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Vitals Tab */}
                    <TabsContent value="vitals" className="mt-4">
                      {(() => {
                        // Filter vitals based on date filter
                        let filteredVitals = [...vitalsHistory];
                        if (vitalsDateFilter !== 'all') {
                          const days = parseInt(vitalsDateFilter);
                          const cutoffDate = new Date();
                          cutoffDate.setDate(cutoffDate.getDate() - days);
                          filteredVitals = filteredVitals.filter(v => {
                            if (!v.recordedAt) return false;
                            const vitalDate = new Date(v.recordedAt);
                            return vitalDate >= cutoffDate;
                          });
                        }

                        const totalVitals = filteredVitals.length;
                        const totalVitalsPages = Math.ceil(totalVitals / vitalsPerPage);
                        const paginatedVitals = filteredVitals.slice(
                          (vitalsPage - 1) * vitalsPerPage, 
                          vitalsPage * vitalsPerPage
                        );
                        
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <select
                                value={vitalsDateFilter}
                                onChange={(e) => { setVitalsDateFilter(e.target.value); setVitalsPage(1); }}
                                className="text-sm border rounded-md px-3 py-1.5 bg-background"
                              >
                                <option value="all">All Time</option>
                                <option value="30">Last 30 Days</option>
                                <option value="90">Last 3 Months</option>
                                <option value="365">Last Year</option>
                              </select>
                            </div>
                            {loadingVitals ? (
                              <div className="text-center py-12">
                                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Loading vitals...</p>
                              </div>
                            ) : paginatedVitals.length === 0 ? (
                              <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                                <Heart className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                                <p className="font-medium text-muted-foreground mb-1">No vitals records found</p>
                                <p className="text-sm text-muted-foreground">Vitals will appear here once recorded</p>
                              </div>
                            ) : (
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="px-4 py-2 text-left font-medium">Date</th>
                                      <th className="px-4 py-2 text-left font-medium">Summary</th>
                                      <th className="px-4 py-2 text-left font-medium">Recorded By</th>
                                      <th className="px-4 py-2 text-center font-medium">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {paginatedVitals.map((vital) => (
                                      <tr key={vital.id} className="hover:bg-muted/30">
                                        <td className="px-4 py-3 text-muted-foreground">
                                          <div className="font-medium">{vital.date}</div>
                                          <div className="text-xs text-muted-foreground">{vital.time}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="flex flex-wrap gap-2 text-xs">
                                            {vital.temperature && (
                                              <Badge variant="outline" className="text-xs">
                                                T: {vital.temperature}°C
                                              </Badge>
                                            )}
                                            {vital.bloodPressure && (
                                              <Badge variant="outline" className="text-xs">
                                                BP: {vital.bloodPressure}
                                              </Badge>
                                            )}
                                            {vital.heartRate && (
                                              <Badge variant="outline" className="text-xs">
                                                HR: {vital.heartRate} bpm
                                              </Badge>
                                            )}
                                            {vital.oxygenSaturation && (
                                              <Badge variant="outline" className="text-xs">
                                                SpO2: {vital.oxygenSaturation}%
                                              </Badge>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-sm">{vital.recordedBy}</td>
                                        <td className="px-4 py-3 text-center">
                                          <Button variant="ghost" size="sm" onClick={() => viewVitalsDetails(vital)}>
                                            <Eye className="h-4 w-4 mr-1" /> View
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {/* Pagination */}
                            {totalVitals > 0 && (
                              <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalVitals === 0 ? 0 : `${(vitalsPage - 1) * vitalsPerPage + 1}-${Math.min(totalVitals, vitalsPage * vitalsPerPage)}`} of {totalVitals}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(vitalsPerPage)} onValueChange={(value) => { setVitalsPerPage(Number(value)); setVitalsPage(1); }}>
                                    <SelectTrigger className="w-16 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="5">5</SelectItem>
                                      <SelectItem value="10">10</SelectItem>
                                      <SelectItem value="25">25</SelectItem>
                                      <SelectItem value="50">50</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={vitalsPage === 1} onClick={() => setVitalsPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalVitalsPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalVitalsPages <= 5) pageNum = i + 1;
                                    else if (vitalsPage <= 3) pageNum = i + 1;
                                    else if (vitalsPage >= totalVitalsPages - 2) pageNum = totalVitalsPages - 4 + i;
                                    else pageNum = vitalsPage - 2 + i;
                                    if (pageNum > totalVitalsPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={vitalsPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setVitalsPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={vitalsPage >= totalVitalsPages || totalVitalsPages === 0} onClick={() => setVitalsPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            )}
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Ward Admissions Tab */}
                    <TabsContent value="physio" className="mt-4">
                      {(() => {
                        const filteredPhysio = physioHistory.filter(order => {
                          const matchesSearch =
                            order.patient_name?.toLowerCase().includes(physioSearchQuery.toLowerCase()) ||
                            order.diagnosis?.toLowerCase().includes(physioSearchQuery.toLowerCase()) ||
                            order.id?.toString().includes(physioSearchQuery);

                          const matchesStatus = physioStatusFilter === 'all' || order.status === physioStatusFilter;

                          let matchesDate = true;
                          if (physioDateFilter !== 'all') {
                            const orderDate = new Date(order.ordered_at);
                            const now = new Date();
                            const diffTime = now.getTime() - orderDate.getTime();
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                            const daysFilter = parseInt(physioDateFilter);
                            matchesDate = diffDays <= daysFilter;
                          }

                          return matchesSearch && matchesStatus && matchesDate;
                        });

                        const totalPhysio = filteredPhysio.length;
                        const totalPhysioPages = Math.ceil(totalPhysio / physioPerPage);
                        const paginatedPhysio = filteredPhysio.slice(
                          (physioPage - 1) * physioPerPage,
                          physioPage * physioPerPage
                        );

                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <select
                                value={physioDateFilter}
                                onChange={(e) => { setPhysioDateFilter(e.target.value); setPhysioPage(1); }}
                                className="text-sm border rounded-md px-3 py-1.5 bg-background"
                              >
                                <option value="all">All Time</option>
                                <option value="30">Last 30 Days</option>
                                <option value="90">Last 3 Months</option>
                                <option value="365">Last Year</option>
                              </select>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">Date</th>
                                    <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
                                    <th className="px-4 py-2 text-left font-medium">Status</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {paginatedPhysio.map((order) => (
                                    <tr key={order.id} className="hover:bg-muted/30">
                                      <td className="px-4 py-3 text-muted-foreground">
                                        {new Date(order.ordered_at).toLocaleDateString()}
                                      </td>
                                      <td className="px-4 py-3">
                                        <div>
                                          <div className="font-medium">{order.patient_name}</div>
                                          <div className="text-sm text-muted-foreground">{order.diagnosis || 'N/A'}</div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className={`text-xs ${
                                            order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                                            order.status === 'in_progress' ? 'bg-orange-500/10 text-orange-600' :
                                            order.status === 'scheduled' ? 'bg-blue-500/10 text-blue-600' :
                                            'bg-gray-500/10 text-gray-600'
                                          }`}>
                                            {order.status.replace('_', ' ')}
                                          </Badge>
                                          <span className="text-xs text-muted-foreground">
                                            {order.sessions_completed}/{order.total_sessions}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => openPhysioOrderDialog(order)}>
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalPhysio === 0 ? 0 : `${(physioPage - 1) * physioPerPage + 1}-${Math.min(totalPhysio, physioPage * physioPerPage)}`} of {totalPhysio}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(physioPerPage)} onValueChange={(value) => { setPhysioPerPage(Number(value)); setPhysioPage(1); }}>
                                    <SelectTrigger className="w-16 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="5">5</SelectItem>
                                      <SelectItem value="10">10</SelectItem>
                                      <SelectItem value="25">25</SelectItem>
                                      <SelectItem value="50">50</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={physioPage === 1} onClick={() => setPhysioPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalPhysioPages) }, (_, i) => {
                                    let pageNum: number;
                                    const halfVisible = Math.floor(5 / 2);
                                    if (totalPhysioPages <= 5) {
                                      pageNum = i + 1;
                                    } else if (physioPage <= halfVisible) {
                                      pageNum = i + 1;
                                    } else if (physioPage >= totalPhysioPages - halfVisible) {
                                      pageNum = totalPhysioPages - 4 + i;
                                    } else {
                                      pageNum = physioPage - halfVisible + i;
                                    }
                                    return (
                                      <Button
                                        key={pageNum}
                                        variant={physioPage === pageNum ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setPhysioPage(pageNum)}
                                        className="w-8 h-8 p-0"
                                      >
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={physioPage === totalPhysioPages} onClick={() => setPhysioPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </TabsContent>

                    <TabsContent value="wards" className="mt-4">
                      {(() => {
                        const totalAdmissions = wardAdmissions.length;
                        const totalPages = Math.ceil(totalAdmissions / 10);
                        const paginatedAdmissions = wardAdmissions.slice(0, 10); // Simple pagination

                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-sm font-medium">Ward Admission History</h3>
                            </div>
                            {totalAdmissions === 0 ? (
                              <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                                <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                                <p className="font-medium text-muted-foreground mb-1">No ward admissions found</p>
                                <p className="text-sm text-muted-foreground">Ward admission history will appear here</p>
                              </div>
                            ) : (
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="px-4 py-2 text-left font-medium">Admission Date</th>
                                      <th className="px-4 py-2 text-left font-medium">Ward</th>
                                      <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
                                      <th className="px-4 py-2 text-left font-medium">Days</th>
                                      <th className="px-4 py-2 text-left font-medium">Status</th>
                                      <th className="px-4 py-2 text-center font-medium">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {paginatedAdmissions.map((admission) => (
                                      <tr key={admission.id} className="hover:bg-muted/30">
                                        <td className="px-4 py-3 text-muted-foreground">
                                          <div className="font-medium">{formatDate(admission.admission_date)}</div>
                                          <div className="text-xs text-muted-foreground">{formatTime(admission.admission_date)}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="font-medium">{admission.ward_name}</div>
                                          <div className="text-xs text-muted-foreground">{admission.admission_type}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                          <p className="text-sm max-w-[200px] truncate" title={admission.admission_diagnosis}>
                                            {admission.admission_diagnosis}
                                          </p>
                                        </td>
                                        <td className="px-4 py-3">{admission.length_of_stay} days</td>
                                        <td className="px-4 py-3">
                                          <Badge className={`${
                                            admission.status === 'admitted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                            admission.status === 'discharged' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                            'bg-gray-100 text-gray-800'
                                          }`}>
                                            {admission.status}
                                          </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={async () => {
                                              try {
                                                const admissionDetail = await wardService.getAdmission(admission.id);
                                                setSelectedWardAdmission(admissionDetail);
                                                setShowWardAdmissionDetail(true);
                                              } catch (error) {
                                                console.error('Failed to load ward admission details:', error);
                                                toast.error('Failed to load admission details');
                                              }
                                            }}
                                          >
                                            <Eye className="h-4 w-4 mr-1" /> View
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                            </div>
                            )}
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Background Tab */}
                    <TabsContent value="background" className="mt-4">
                      <div className="flex justify-end mb-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowEditMedicalHistory(true)}
                          disabled={!currentPatient}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Medical History
                        </Button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Surgical History */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Activity className="h-4 w-4 text-rose-500" />
                              Surgical History
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {medicalHistory.surgicalHistory && medicalHistory.surgicalHistory.length > 0 ? (
                              <div className="space-y-3">
                                {medicalHistory.surgicalHistory.map((surgery: { procedure: string; date: string; hospital?: string }, index: number) => (
                                  <div key={index} className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
                                    <div className="flex items-start justify-between mb-1">
                                      <span className="font-medium text-sm">{surgery.procedure}</span>
                                      <Badge variant="outline" className="text-xs">{surgery.date}</Badge>
                                    </div>
                                    {surgery.hospital && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        <MapPin className="h-3 w-3 inline mr-1" />
                                        {surgery.hospital}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-sm text-muted-foreground">
                                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No surgical history recorded</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Family History */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Users className="h-4 w-4 text-blue-500" />
                              Family History
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {medicalHistory.familyHistory && medicalHistory.familyHistory.length > 0 ? (
                              <div className="space-y-3">
                                {medicalHistory.familyHistory.map((fh: { relation: string; condition: string }, index: number) => (
                                  <div key={index} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="font-medium text-sm mb-1">{fh.relation}</div>
                                        <div className="text-xs text-muted-foreground">{fh.condition}</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-sm text-muted-foreground">
                                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No family history recorded</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Social History */}
                        <Card className="md:col-span-2">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <User className="h-4 w-4 text-emerald-500" />
                              Social History
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                                <div className="text-xs text-muted-foreground mb-2">Smoking</div>
                                <div className="font-semibold text-emerald-700 dark:text-emerald-300">{medicalHistory.socialHistory?.smoking || 'Not recorded'}</div>
                              </div>
                              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center">
                                <div className="text-xs text-muted-foreground mb-2">Alcohol</div>
                                <div className="font-semibold text-blue-700 dark:text-blue-300">{medicalHistory.socialHistory?.alcohol || 'Not recorded'}</div>
                              </div>
                              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 text-center">
                                <div className="text-xs text-muted-foreground mb-2">Exercise</div>
                                <div className="font-semibold text-purple-700 dark:text-purple-300">{medicalHistory.socialHistory?.exercise || 'Not recorded'}</div>
                              </div>
                              {medicalHistory.socialHistory?.occupation && (
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-center">
                                  <div className="text-xs text-muted-foreground mb-2">Occupation</div>
                                  <div className="font-semibold text-amber-700 dark:text-amber-300">{medicalHistory.socialHistory.occupation}</div>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardHeader>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Add Diagnosis Dialog */}
        <Dialog open={showAddDiagnosis} onOpenChange={(open) => { setShowAddDiagnosis(open); if (!open) { setDiagnosisSearch(""); setShowDiagnosisDropdown(false); setDiagnosisNotes(""); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-rose-500" />
                Add Diagnosis
              </DialogTitle>
              <DialogDescription>
                Search and add ICD-10 diagnosis codes for {currentPatient?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
              {/* Diagnosis Type */}
              <div className="space-y-2">
                <Label>Diagnosis Type *</Label>
                <Select value={selectedDiagnosisType} onValueChange={(v: 'Primary' | 'Secondary' | 'Differential') => setSelectedDiagnosisType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Primary">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                        Primary - Main diagnosis
                      </div>
                    </SelectItem>
                    <SelectItem value="Secondary">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        Secondary - Contributing condition
                      </div>
                    </SelectItem>
                    <SelectItem value="Differential">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        Differential - Possible diagnosis
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* ICD-10 Search */}
              <div className="space-y-2">
                <Label>Search ICD-10 Code *</Label>
                <div className="relative">
                  <Input 
                    value={diagnosisSearch} 
                    onChange={(e) => {
                      const value = e.target.value;
                      setDiagnosisSearch(value);
                      setShowDiagnosisDropdown(true);

                      // Clear previous timeout
                      if (searchTimeout) {
                        clearTimeout(searchTimeout);
                      }

                      // Set new timeout for debounced search
                      const timeout = setTimeout(() => {
                        if (value.trim()) {
                          searchICD10Codes(value);
                        } else {
                          setIcd10SearchResults([]);
                        }
                      }, 300); // 300ms debounce

                      setSearchTimeout(timeout);
                    }}
                    onFocus={() => setShowDiagnosisDropdown(true)}
                    placeholder="Search by code or condition name (e.g., I10 or Hypertension)..." 
                  />
                  {showDiagnosisDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[250px] overflow-y-auto">
                      {/* Debug info */}
                      <div className="p-2 text-xs text-muted-foreground border-b">
                        Loaded: {icd10Codes.length} | Searching: {diagnosisSearch} | Results: {icd10SearchResults.length} {isSearchingICD10 && '(Searching...)'}
                      </div>
                      {(() => {
                        let displayCodes;
                        if (diagnosisSearch.trim()) {
                          // Use API search results
                          displayCodes = icd10SearchResults;
                          debugConsultationRoom(`[ICD-10 Search] "${diagnosisSearch}" returned ${displayCodes.length} results from API`);
                        } else {
                          // Show first 20 codes when no search
                          displayCodes = icd10Codes.slice(0, 20);
                        }

                        if (displayCodes.length === 0) {
                          if (isSearchingICD10) {
                            return (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                Searching...
                              </div>
                            );
                          } else if (diagnosisSearch.trim()) {
                            return (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                No matching ICD-10 codes found
                              </div>
                            );
                          } else {
                            return (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                Start typing to search ICD-10 codes
                              </div>
                            );
                          }
                        }

                        return displayCodes.map((dx, index) => (
                          <div 
                            key={`${dx.code}-${index}`}
                            onClick={async () => {
                              try {
                                if (!currentPatient) {
                                  toast.error('No patient selected');
                                  return;
                                }

                                // Create diagnosis in database
                                const diagnosisData: Partial<Diagnosis> = {
                                  patient: Number(currentPatient.id),
                                  visit: currentPatient.visitId ? Number(currentPatient.visitId) : undefined,
                                  session: sessionId || undefined,
                                  icd10_code: dx.id,
                                  diagnosis_text: diagnosisNotes || '',
                                  status: 'confirmed',
                                  certainty: selectedDiagnosisType === 'Primary' ? 'confirmed' :
                                            selectedDiagnosisType === 'Secondary' ? 'probable' : 'possible',
                                  notes: diagnosisNotes || ''
                                };

                                // Security: Removed console.log to prevent diagnosis data exposure
                                const newDiagnosis = await consultationService.createDiagnosis(diagnosisData);
                                setDiagnoses([...diagnoses, newDiagnosis]);

                              setDiagnosisSearch("");
                              setShowDiagnosisDropdown(false);
                              setDiagnosisNotes("");
                              setShowAddDiagnosis(false);
                                toast.success(`Added diagnosis: ${dx.code} - ${dx.description}`);
                              } catch (err: any) {
                                console.error('Error creating diagnosis:', err);
                                toast.error('Failed to add diagnosis. Please try again.');
                              }
                            }}
                            className="p-2 hover:bg-muted cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm flex items-center gap-2">
                                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{dx.code}</span>
                                  {dx.description}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">{dx.category}</Badge>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Additional Notes */}
              <div className="space-y-2">
                <Label>Additional Notes (Optional)</Label>
                <Textarea 
                  value={diagnosisNotes} 
                  onChange={(e) => setDiagnosisNotes(e.target.value)} 
                  placeholder="Add any specific notes about this diagnosis..."
                  rows={2}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDiagnosis(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddPrescription} onOpenChange={(open) => { 
          setShowAddPrescription(open); 
          if (!open) { 
            setMedicationSearch("");
            setSelectedMedications(new Set()); // Clear selections when closing
            setMedicationConfigs(new Map()); // Clear configs when closing
            setShowMedicationDropdown(false); 
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5 text-violet-500" />
                Add Prescription
              </DialogTitle>
              <DialogDescription>
                Search and select medications, then configure dosage details for each. All medications will be sent as one prescription order to Pharmacy queue.
              </DialogDescription>
            </DialogHeader>
            
            {/* Allergy Warning in Dialog */}
            {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span><strong>Allergies:</strong> {currentPatient.allergies.join(', ')}</span>
                </div>
              </div>
            )}
            
            <div className="space-y-4 py-2">
              {/* Medication Search */}
              <div className="space-y-2">
                <Label>Search and Select Medications *</Label>
                <div className="relative">
                  <Input 
                    placeholder="Search medications by name, generic name, or category..."
                    value={medicationSearch} 
                    onChange={(e) => {
                      const searchValue = e.target.value;
                      setMedicationSearch(searchValue);
                      // Only show dropdown if user has typed something
                      if (searchValue.trim()) {
                        setShowMedicationDropdown(true);
                      } else {
                        setShowMedicationDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      // Only show dropdown if there's search text
                      if (medicationSearch.trim()) {
                        setShowMedicationDropdown(true);
                      }
                    }}
                  />
                  {showMedicationDropdown && medicationSearch.trim() && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-[300px] overflow-y-auto" data-medication-dropdown>
                      {loadingMedications ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                      Loading medications...
                    </div>
                      ) : filteredMedications.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No medications found. Try a different search term.
                        </div>
                      ) : (
                        filteredMedications.map((med) => {
                          const isSelected = selectedMedications.has(typeof med.id === 'number' ? med.id : parseInt(med.id, 10));
                        const isAllergyRisk = currentPatient?.allergies.some(allergy => 
                          med.name?.toLowerCase().includes(allergy.toLowerCase()) || 
                            (med.generic_name || '').toLowerCase().includes(allergy.toLowerCase())
                        );
                        return (
                          <div 
                            key={med.id}
                            onClick={() => toggleMedicationSelection(med)}
                              className={`p-3 hover:bg-muted cursor-pointer border-b last:border-b-0 flex items-start gap-3 ${
                                isSelected ? 'bg-violet-50 dark:bg-violet-900/20' : ''
                              }`}
                            >
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleMedicationSelection(med)} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm flex items-center gap-2">
                                  {med.name}
                                  {isAllergyRisk && <AlertTriangle className="h-3 w-3 text-red-500" />}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {(med.generic_name || '')} • {(med.form || 'N/A')}
                                </div>
                                {isAllergyRisk && (
                                  <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                    ⚠️ Patient allergy risk
                              </div>
                            )}
                          </div>
                    </div>
                          );
                        })
                  )}
                    </div>
                  )}
                    </div>
            {selectedMedications.size > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="text-sm font-medium">Selected Medications ({selectedMedications.size}):</div>
                    <div className="flex flex-wrap gap-2">
                      {medications
                        .filter(m => selectedMedications.has(typeof m.id === 'number' ? m.id : parseInt(m.id, 10)))
                        .map(med => (
                          <Badge key={med.id} variant="secondary" className="flex items-center gap-1">
                            {med.name}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => toggleMedicationSelection(med)}
                            />
                          </Badge>
                        ))}
                  </div>
                  <Button
                      variant="ghost"
                    size="sm"
                      onClick={() => setSelectedMedications(new Set())}
                      className="text-xs"
                  >
                    Clear All
                  </Button>
                </div>
                )}
              </div>

              {/* Medication Configuration */}
              {selectedMedications.size > 0 && (
                <div className="space-y-4 border-t pt-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-semibold">Configure Prescriptions</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Set dosage, frequency, and duration for each selected medication
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {selectedMedications.size} medication{selectedMedications.size > 1 ? 's' : ''} selected
                    </Badge>
                  </div>

                  <div className="space-y-3">
                  {Array.from(selectedMedications).map((medId) => {
                    const med = medications.find((m: any) => {
                      const mId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
                      return mId === medId;
                    });
                    if (!med) return null;
                    const config = medicationConfigs.get(medId) || {
                      dosage: '',
                      frequency: 'Once daily (OD)',
                      durationDays: '',
                      route: 'Oral',
                      instructions: ''
                    };

                    return (
                        <Card key={medId} className="border-l-4 border-l-violet-500">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="font-medium text-sm">{med.name}</div>
                            <div className="text-xs text-muted-foreground">
                                  {med.generic_name || ''} • {med.form || 'N/A'}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                                onClick={() => toggleMedicationSelection(med)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        
                            <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                                <Label className="text-xs">Dosage <span className="text-red-500">*</span></Label>
                            <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="e.g., 1 tablet, 5ml, 10mg"
                                  className="h-8 text-xs"
                                  value={config.dosage || ''}
                              onChange={(e) => updateMedicationConfig(medId, 'dosage', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                                <Label className="text-xs">Frequency <span className="text-red-500">*</span></Label>
                            <Select
                                  value={config.frequency || 'Once daily (OD)'}
                              onValueChange={(v) => updateMedicationConfig(medId, 'frequency', v)}
                            >
                                  <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                    <SelectItem value="Once daily (OD)">Once daily (OD)</SelectItem>
                                    <SelectItem value="Twice daily (BD)">Twice daily (BD)</SelectItem>
                                    <SelectItem value="Three times daily (TDS)">Three times daily (TDS)</SelectItem>
                                    <SelectItem value="Four times daily (QDS)">Four times daily (QDS)</SelectItem>
                                    <SelectItem value="Every 6 hours">Every 6 hours</SelectItem>
                                    <SelectItem value="Every 8 hours">Every 8 hours</SelectItem>
                                    <SelectItem value="Every 12 hours">Every 12 hours</SelectItem>
                                    <SelectItem value="As needed (PRN)">As needed (PRN)</SelectItem>
                                    <SelectItem value="STAT (Single dose)">STAT (Single dose)</SelectItem>
                                    <SelectItem value="Weekly">Weekly</SelectItem>
                                    <SelectItem value="Monthly">Monthly</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                                <Label className="text-xs">Duration (days)</Label>
                            <Input
                              type="number"
                              min="1"
                                  placeholder="e.g., 7, 14, 30"
                                  className="h-8 text-xs"
                              value={config.durationDays || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                const days = value === '' ? '' : parseInt(value) || '';
                                updateMedicationConfig(medId, 'durationDays', days);
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                                <Label className="text-xs">Route</Label>
                            <Select
                                  value={config.route || 'Oral'}
                                  onValueChange={(v) => updateMedicationConfig(medId, 'route', v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                    <SelectItem value="Oral">Oral</SelectItem>
                                    <SelectItem value="IV">Intravenous (IV)</SelectItem>
                                    <SelectItem value="IM">Intramuscular (IM)</SelectItem>
                                    <SelectItem value="SC">Subcutaneous (SC)</SelectItem>
                                    <SelectItem value="Topical">Topical</SelectItem>
                                    <SelectItem value="Inhalation">Inhalation</SelectItem>
                                    <SelectItem value="Rectal">Rectal</SelectItem>
                                    <SelectItem value="Ophthalmic">Ophthalmic</SelectItem>
                                    <SelectItem value="Otic">Otic</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                            <div className="mt-3 space-y-1">
                              <Label className="text-xs">Instructions</Label>
                          <Textarea
                                placeholder="Special instructions (optional)"
                            rows={2}
                            className="text-xs"
                                value={config.instructions || ''}
                                onChange={(e) => updateMedicationConfig(medId, 'instructions', e.target.value)}
                          />
                        </div>
                          </CardContent>
                        </Card>
                    );
                  })}
                </div>
              </div>
            )}

              {/* Prescription Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newPrescription.priority} onValueChange={(v) => setNewPrescription({ ...newPrescription, priority: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine"><Badge className="bg-blue-100 text-blue-800">Routine</Badge></SelectItem>
                      <SelectItem value="Urgent"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge></SelectItem>
                      <SelectItem value="STAT"><Badge className="bg-red-100 text-red-800">STAT</Badge></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Clinical Indication */}
              <div className="space-y-2">
                <Label>Clinical Indication *</Label>
                <Textarea
                  value={newPrescription.notes}
                  onChange={(e) => setNewPrescription({ ...newPrescription, notes: e.target.value })}
                  placeholder="Reason for prescription, clinical context, and special instructions..."
                  rows={3}
                />
              </div>

              {newPrescription.priority === 'STAT' && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    STAT prescriptions require immediate attention from pharmacy.
                  </p>
                </div>
              )}
            </div>


            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => { 
                  setShowAddPrescription(false); 
                  setMedicationSearch("");
                  setSelectedMedications(new Set());
                }}
              >
                Cancel
              </Button>
                <Button 
                onClick={addPrescription}
                disabled={selectedMedications.size === 0 || !newPrescription.notes}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  <Pill className="h-4 w-4 mr-2" />
                  Add Prescription{selectedMedications.size > 1 ? 's' : ''} to Order
                </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog 
          open={showAddLabOrder} 
          onOpenChange={(open) => {
            setShowAddLabOrder(open);
            if (!open) {
              setSelectedLabTemplates(new Set());
              setLabTemplateSearch("");
              setShowLabTemplateDropdown(false);
            }
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><TestTube className="h-5 w-5 text-amber-500" />Order Lab Test(s)</DialogTitle>
              <DialogDescription>Select one or more laboratory tests to order - will be sent to Lab Tech queue</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Search and Select Tests *</Label>
                <div className="relative" data-lab-template-dropdown>
                  <Input
                    placeholder="Search tests by name, code, or sample type..."
                    value={labTemplateSearch}
                    onChange={(e) => {
                      const searchValue = e.target.value;
                      setLabTemplateSearch(searchValue);
                      // Only show dropdown if user has typed something
                      if (searchValue.trim()) {
                        setShowLabTemplateDropdown(true);
                      } else {
                        setShowLabTemplateDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      // Only show dropdown if there's search text
                      if (labTemplateSearch.trim()) {
                        setShowLabTemplateDropdown(true);
                      }
                    }}
                  />
                  {showLabTemplateDropdown && labTemplateSearch.trim() && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-[300px] overflow-y-auto" data-lab-template-dropdown>
                      {loadingLabTemplates ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                          Loading tests...
                        </div>
                      ) : filteredLabTemplates.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No tests found. Try a different search term.
                        </div>
                      ) : (
                        filteredLabTemplates.map((template) => {
                          const isSelected = selectedLabTemplates.has(template.id);
                          return (
                            <div
                              key={template.id}
                              onClick={() => toggleLabTemplateSelection(template)}
                              className={`p-3 hover:bg-muted cursor-pointer border-b last:border-b-0 flex items-start gap-3 ${
                                isSelected ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                              }`}
                            >
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleLabTemplateSelection(template)} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{template.name}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {template.code} • {template.sample_type}
                                </div>
                                {template.description && (
                                  <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                    {template.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                {selectedLabTemplates.size > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="text-sm font-medium">Selected Tests ({selectedLabTemplates.size}):</div>
                    <div className="flex flex-wrap gap-2">
                      {labTemplates
                        .filter(t => selectedLabTemplates.has(t.id))
                        .map(template => (
                          <Badge key={template.id} variant="secondary" className="flex items-center gap-1">
                            {template.name}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => toggleLabTemplateSelection(template)}
                            />
                          </Badge>
                        ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLabTemplates(new Set())}
                      className="text-xs"
                    >
                      Clear All
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newLabOrder.priority} onValueChange={(v) => setNewLabOrder({ ...newLabOrder, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine"><div className="flex items-center gap-2"><Badge className="bg-blue-100 text-blue-800">Routine</Badge><span className="text-xs text-muted-foreground">Standard TAT</span></div></SelectItem>
                      <SelectItem value="Urgent"><div className="flex items-center gap-2"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge><span className="text-xs text-muted-foreground">Priority processing</span></div></SelectItem>
                      <SelectItem value="STAT"><div className="flex items-center gap-2"><Badge className="bg-rose-100 text-rose-800">STAT</Badge><span className="text-xs text-muted-foreground">Immediate - Emergency</span></div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Est. TAT</Label>
                  <div className="h-10 px-3 py-2 border rounded-md text-sm text-muted-foreground bg-muted/50 flex items-center">
                    {newLabOrder.priority === 'STAT' ? '30 min - 1 hour' : newLabOrder.priority === 'Urgent' ? '1 - 2 hours' : '2 - 4 hours'}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Clinical Indication *</Label>
                <Textarea value={newLabOrder.notes} onChange={(e) => setNewLabOrder({ ...newLabOrder, notes: e.target.value })} placeholder="Reason for test, clinical context, specific instructions for lab..." rows={3} />
              </div>
              {newLabOrder.priority === 'STAT' && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                  <p className="text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    STAT orders are for emergencies only. Lab will prioritize immediately.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAddLabOrder(false);
                setSelectedLabTemplates(new Set());
                setLabTemplateSearch("");
                setShowLabTemplateDropdown(false);
              }}>
                Cancel
              </Button>
              <Button 
                onClick={addLabOrder} 
                disabled={selectedLabTemplates.size === 0} 
                className="bg-amber-500 hover:bg-amber-600"
              >
                <TestTube className="h-4 w-4 mr-2" />
                Add to Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddNursingOrder} onOpenChange={setShowAddNursingOrder}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Syringe className="h-5 w-5 text-cyan-500" />
                Add Nursing Order
              </DialogTitle>
              <DialogDescription>
                Add nursing procedure to order - will be sent to Nursing queue
              </DialogDescription>
            </DialogHeader>
            
            {/* Allergy Warning in Dialog */}
            {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span><strong>Allergies:</strong> {currentPatient.allergies.join(', ')}</span>
                </div>
              </div>
            )}
            
            <div className="space-y-4 py-2">
              {/* Procedure Type */}
              <div className="space-y-2">
                <Label>Procedure Type *</Label>
                <Select 
                  value={newNursingOrder.type} 
                  onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, type: v, medication: "", dosage: "", woundLocation: "", woundType: "", supplies: "", ward: "", admissionType: "", admissionDiagnosis: "", presentingComplaint: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Select procedure type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Injection">
                      <div className="flex items-center gap-2">
                        <Syringe className="h-4 w-4 text-rose-500" />
                        Injection
                      </div>
                    </SelectItem>
                    <SelectItem value="Dressing">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-amber-500" />
                        Wound Dressing
                      </div>
                    </SelectItem>
                    <SelectItem value="Ward Admission">
                      <div className="flex items-center gap-2">
                        <DoorOpen className="h-4 w-4 text-blue-500" />
                        Ward Admission
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Ward Admission-specific fields */}
              {newNursingOrder.type === 'Ward Admission' && (
                <>
                  <div className="space-y-2">
                    <Label>Ward *</Label>
                    {/* Ward Search */}
                    <Input
                      placeholder="Search wards..."
                      value={wardSearch}
                      onChange={(e) => setWardSearch(e.target.value)}
                      className="mb-2"
                    />
                    <Select
                      value={newNursingOrder.ward || ''}
                      onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, ward: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select ward for admission" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Ward options - dynamically loaded from API */}
                        {wards
                          .filter(ward =>
                            ward.available_beds > 0 && // Only show wards with available beds
                            (ward.name.toLowerCase().includes(wardSearch.toLowerCase()) ||
                             ward.ward_code.toLowerCase().includes(wardSearch.toLowerCase()))
                          )
                          .sort((a, b) => b.available_beds - a.available_beds) // Sort by availability
                          .map((ward) => (
                            <SelectItem key={ward.id} value={ward.ward_code}>
                              <div className="flex items-center justify-between w-full">
                                <span className="font-medium">{ward.name}</span>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  ward.available_beds > ward.total_beds * 0.5 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                  ward.available_beds > ward.total_beds * 0.2 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {ward.available_beds}/{ward.total_beds} beds
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        {wards.filter(ward =>
                          ward.available_beds > 0 &&
                          (ward.name.toLowerCase().includes(wardSearch.toLowerCase()) ||
                           ward.ward_code.toLowerCase().includes(wardSearch.toLowerCase()))
                        ).length === 0 && wardSearch && (
                          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                            No wards found matching "{wardSearch}"
                          </div>
                        )}
                        {wards.length === 0 && (
                          <>
                            <SelectItem value="FEMALE-MED">Female Medical Ward (5 beds available)</SelectItem>
                            <SelectItem value="MALE-MED">Male Medical Ward (5 beds available)</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Admission Type *</Label>
                    <Select
                      value={newNursingOrder.admissionType || ''}
                      onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, admissionType: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select admission type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="elective">Elective</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Admission Diagnosis *</Label>
                    <Textarea
                      value={newNursingOrder.admissionDiagnosis || ''}
                      onChange={(e) => setNewNursingOrder({ ...newNursingOrder, admissionDiagnosis: e.target.value })}
                      placeholder="Primary diagnosis for admission"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Presenting Complaint</Label>
                    <Textarea
                      value={newNursingOrder.presentingComplaint || ''}
                      onChange={(e) => setNewNursingOrder({ ...newNursingOrder, presentingComplaint: e.target.value })}
                      placeholder="Patient's presenting complaint"
                      rows={2}
                    />
                  </div>
                </>
              )}

              {/* Injection-specific fields */}
              {newNursingOrder.type === 'Injection' && (
                <>
                  <div className="space-y-2">
                    <Label>Medication *</Label>
                    <Select 
                      value={newNursingOrder.medication} 
                      onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, medication: v })}
                      disabled={loadingInjectionMedications}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingInjectionMedications ? "Loading medications..." : "Select medication"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[250px]">
                        {injectionMedications.map(med => {
                          // Format display name: "Name Strength" (e.g., "Diclofenac 75mg")
                          const displayName = med.strength 
                            ? `${med.name} ${med.strength}`.trim()
                            : med.name;
                          return (
                            <SelectItem key={med.id || med.name} value={displayName}>
                              <div className="flex items-center justify-between w-full">
                                <span>{displayName}</span>
                                {/* Category not available in Medication interface */}
                              </div>
                            </SelectItem>
                          );
                        })}
                        {injectionMedications.length === 0 && !loadingInjectionMedications && (
                          <SelectItem value="__none__" disabled>No medications available</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {loadingInjectionMedications && (
                      <p className="text-xs text-muted-foreground">Loading medications from database...</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Dosage</Label>
                      <Input 
                        value={newNursingOrder.dosage} 
                        onChange={(e) => setNewNursingOrder({ ...newNursingOrder, dosage: e.target.value })}
                        placeholder="e.g., 1 amp, 2ml"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Route</Label>
                      <Select value={newNursingOrder.route} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, route: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {injectionRoutes.map(route => (
                            <SelectItem key={route} value={route}>{route}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* Dressing-specific fields */}
              {newNursingOrder.type === 'Dressing' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Wound Type</Label>
                      <Select value={newNursingOrder.woundType} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, woundType: v })}>
                        <SelectTrigger><SelectValue placeholder="Select wound type" /></SelectTrigger>
                        <SelectContent>
                          {woundTypes.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Input 
                        value={newNursingOrder.woundLocation} 
                        onChange={(e) => setNewNursingOrder({ ...newNursingOrder, woundLocation: e.target.value })}
                        placeholder="e.g., Left forearm, Right knee"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Supplies Needed</Label>
                    <Input 
                      value={newNursingOrder.supplies} 
                      onChange={(e) => setNewNursingOrder({ ...newNursingOrder, supplies: e.target.value })}
                      placeholder="e.g., Gauze, Normal Saline, Antibiotic ointment"
                    />
                    <p className="text-xs text-muted-foreground">
                      Common supplies: {dressingSupplies.slice(0, 5).join(', ')}...
                    </p>
                  </div>
                </>
              )}

              {/* IV Infusion-specific fields */}
              {newNursingOrder.type === 'IV Infusion' && (
                <>
                  <div className="space-y-2">
                    <Label>IV Fluid *</Label>
                    <Select value={newNursingOrder.medication} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, medication: v })}>
                      <SelectTrigger><SelectValue placeholder="Select IV fluid" /></SelectTrigger>
                      <SelectContent>
                        {ivFluids.map(fluid => (
                          <SelectItem key={fluid.name} value={fluid.name}>
                            <div className="flex items-center justify-between w-full">
                              <span>{fluid.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{fluid.category}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Volume/Rate</Label>
                    <Input 
                      value={newNursingOrder.dosage} 
                      onChange={(e) => setNewNursingOrder({ ...newNursingOrder, dosage: e.target.value })}
                      placeholder="e.g., 500ml over 4 hours, 1L at 20 drops/min"
                    />
                  </div>
                </>
              )}

              {/* Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newNursingOrder.priority} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-800">Routine</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="Urgent">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-amber-100 text-amber-800">Urgent</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="STAT">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-red-100 text-red-800">STAT</Badge>
                          <span className="text-xs text-muted-foreground">Immediate</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Instructions */}
              <div className="space-y-2">
                <Label>Instructions *</Label>
                <Textarea 
                  value={newNursingOrder.instructions} 
                  onChange={(e) => setNewNursingOrder({ ...newNursingOrder, instructions: e.target.value })} 
                  placeholder="Detailed instructions for the nursing team..."
                  rows={3}
                />
              </div>

              {/* STAT Warning */}
              {newNursingOrder.priority === 'STAT' && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    STAT orders require immediate attention from the nursing team.
                  </p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddNursingOrder(false)}>Cancel</Button>
              <Button 
                onClick={addNursingOrder}
                disabled={
                  !newNursingOrder.type ||
                  !newNursingOrder.instructions ||
                  (newNursingOrder.type === 'Injection' && !newNursingOrder.medication) ||
                  (newNursingOrder.type === 'Dressing' && !newNursingOrder.woundLocation) ||
                  (newNursingOrder.type === 'Ward Admission' && (!newNursingOrder.ward || !newNursingOrder.admissionType || !newNursingOrder.admissionDiagnosis))
                }
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                <Syringe className="h-4 w-4 mr-2" />
                Add to Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Radiology Order Dialog */}
        <Dialog open={showAddRadiology} onOpenChange={setShowAddRadiology}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-indigo-500" />
                Order Imaging Study
              </DialogTitle>
              <DialogDescription>
                Search and select from radiology templates - orders will be sent to Radiology queue
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
              {/* Radiology Template Selection */}
              <div className="space-y-2">
                <Label>Search and Select Imaging Studies *</Label>
                <div className="relative" data-radiology-template-dropdown>
                  <Input
                    placeholder="Search imaging studies by name, code, or modality..."
                    value={radiologyTemplateSearch}
                    onChange={(e) => {
                      setRadiologyTemplateSearch(e.target.value);
                      setShowRadiologyTemplateDropdown(true);
                    }}
                    onFocus={() => setShowRadiologyTemplateDropdown(true)}
                  />
                  {showRadiologyTemplateDropdown && radiologyTemplateSearch.trim() && (
                    <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {loadingRadiologyTemplates ? (
                        <div className="p-4 text-center text-muted-foreground">
                          <Loader2 className="h-4 w-4 mx-auto mb-2 animate-spin" />
                          <p className="text-xs">Loading templates...</p>
                        </div>
                      ) : radiologyTemplates.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          <p className="text-xs">{radiologyTemplatesError || 'No templates found'}</p>
                        </div>
                      ) : (
                        <div className="p-2">
                          {/* Selected templates */}
                          {selectedRadiologyTemplates.size > 0 && (
                            <div className="mb-3 pb-2 border-b">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Selected ({selectedRadiologyTemplates.size})</p>
                              <div className="flex flex-wrap gap-1">
                                {Array.from(selectedRadiologyTemplates).map(templateId => {
                                  const template = radiologyTemplates.find(t => t.id === templateId);
                                  return template ? (
                                    <Badge
                                      key={templateId}
                                      variant="default"
                                      className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                                      onClick={() => {
                                        setSelectedRadiologyTemplates(prev => {
                                          const newSet = new Set(prev);
                                          newSet.delete(templateId);
                                          return newSet;
                    });
                  }}
                >
                                      {template.code} - {template.name}
                                      <X className="h-3 w-3 ml-1" />
                                    </Badge>
                                  ) : null;
                                })}
                              </div>
                            </div>
                          )}

                          {/* Available templates */}
                          <div className="space-y-1">
                            {radiologyTemplates
                              .filter(template =>
                                !selectedRadiologyTemplates.has(template.id) &&
                                (radiologyTemplateSearch === '' ||
                                 template.name.toLowerCase().includes(radiologyTemplateSearch.toLowerCase()) ||
                                 template.code.toLowerCase().includes(radiologyTemplateSearch.toLowerCase()) ||
                                 (template.body_part && template.body_part.toLowerCase().includes(radiologyTemplateSearch.toLowerCase())) ||
                                 (template.modality && template.modality.toLowerCase().includes(radiologyTemplateSearch.toLowerCase())))
                              )
                              .slice(0, 20) // Limit for performance
                              .map(template => (
                                <div
                                  key={template.id}
                                  className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                                  onClick={() => {
                                    setSelectedRadiologyTemplates(prev => new Set([...prev, template.id]));
                                    setRadiologyTemplateSearch('');
                                    setShowRadiologyTemplateDropdown(false);
                                  }}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm truncate">{template.name}</span>
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{template.code}</Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                      <span>{template.category}</span>
                                      <span>•</span>
                                      <span>{template.body_part || 'N/A'}</span>
                                      {template.radiation_exposure === 'high' && (
                                        <>
                                          <span>•</span>
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600">High Rad</Badge>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Radiology Templates */}
                {selectedRadiologyTemplates.size > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Selected Studies ({selectedRadiologyTemplates.size})</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {Array.from(selectedRadiologyTemplates).map(templateId => {
                        const template = radiologyTemplates.find(t => t.id === templateId);
                        return template ? (
                          <div key={templateId} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{template.name}</div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-[10px]">{template.code}</Badge>
                                <span>{template.category}</span>
                                <span>•</span>
                                <span>{template.body_part}</span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => {
                                setSelectedRadiologyTemplates(prev => {
                                  const newSet = new Set(prev);
                                  newSet.delete(templateId);
                                  return newSet;
                                });
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Priority and LMP */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newRadiology.priority} onValueChange={(v) => setNewRadiology({ ...newRadiology, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine"><Badge className="bg-blue-100 text-blue-800">Routine</Badge></SelectItem>
                      <SelectItem value="Urgent"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge></SelectItem>
                      <SelectItem value="STAT"><Badge className="bg-red-100 text-red-800">STAT</Badge></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>LMP</Label>
                  <Input
                    type="date"
                    value={newRadiology.lmp}
                    onChange={(e) => setNewRadiology({ ...newRadiology, lmp: e.target.value })}
                  />
                </div>
              </div>

              {/* Clinical Indication */}
              <div className="space-y-2">
                <Label>Clinical Indication *</Label>
                <Textarea 
                  value={newRadiology.clinicalIndication}
                  onChange={(e) => setNewRadiology({ ...newRadiology, clinicalIndication: e.target.value })}
                  placeholder="Reason for imaging, clinical findings, suspected diagnosis..."
                  rows={3}
                />
              </div>

              {/* Provisional Diagnosis */}
              <div className="space-y-2">
                <Label>Provisional Diagnosis</Label>
                <Textarea 
                  value={newRadiology.provisionalDiagnosis}
                  onChange={(e) => setNewRadiology({ ...newRadiology, provisionalDiagnosis: e.target.value })}
                  placeholder="Provisional diagnosis..."
                  rows={2}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddRadiology(false)}>Cancel</Button>
              <Button 
                onClick={addRadiologyOrder}
                disabled={selectedRadiologyTemplates.size === 0 || !newRadiology.clinicalIndication}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add {selectedRadiologyTemplates.size > 0 ? `(${selectedRadiologyTemplates.size}) ` : ''}to Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add/Edit Physiotherapy Order Dialog */}
        <Dialog open={showAddPhysio} onOpenChange={(open) => {
          setShowAddPhysio(open);
          if (!open) {
            setEditingPhysioIndex(null);
            setNewPhysio({ diagnosis: "", chiefComplaint: "", treatmentGoal: "", specialInstructions: "", priority: "routine" });
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-500" />
                {editingPhysioIndex !== null ? 'Edit Physiotherapy Order' : 'Order Physiotherapy'}
              </DialogTitle>
              <DialogDescription>
                {editingPhysioIndex !== null 
                  ? 'Update the physiotherapy treatment order details'
                  : 'Create a physiotherapy treatment order - will be sent to Physiotherapy pool queue'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Diagnosis */}
              <div className="space-y-2">
                <Label>Diagnosis *</Label>
                <Input
                  value={newPhysio.diagnosis}
                  onChange={(e) => setNewPhysio({ ...newPhysio, diagnosis: e.target.value })}
                  placeholder="Primary diagnosis requiring physiotherapy"
                />
              </div>

              {/* Chief Complaint */}
              <div className="space-y-2">
                <Label>Chief Complaint</Label>
                <Textarea
                  value={newPhysio.chiefComplaint}
                  onChange={(e) => setNewPhysio({ ...newPhysio, chiefComplaint: e.target.value })}
                  placeholder="Patient's main complaint and symptoms..."
                  rows={2}
                />
              </div>

              {/* Treatment Goal */}
              <div className="space-y-2">
                <Label>Treatment Goal</Label>
                <Textarea
                  value={newPhysio.treatmentGoal}
                  onChange={(e) => setNewPhysio({ ...newPhysio, treatmentGoal: e.target.value })}
                  placeholder="Expected outcomes and treatment objectives..."
                  rows={2}
                />
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newPhysio.priority} onValueChange={(v) => setNewPhysio({ ...newPhysio, priority: v as 'routine' | 'urgent' | 'stat' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="stat">STAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Special Instructions */}
              <div className="space-y-2">
                <Label>Special Instructions</Label>
                <Textarea
                  value={newPhysio.specialInstructions}
                  onChange={(e) => setNewPhysio({ ...newPhysio, specialInstructions: e.target.value })}
                  placeholder="Any special requirements, contraindications, or notes for physiotherapist..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddPhysio(false)}>Cancel</Button>
              <Button
                onClick={addPhysioOrder}
                disabled={!newPhysio.diagnosis.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {editingPhysioIndex !== null ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Update Order
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Physiotherapy Order
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Referral Dialog */}
        <Dialog open={showAddReferral} onOpenChange={setShowAddReferral}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-teal-500" />
                Create Referral
              </DialogTitle>
              <DialogDescription>
                Refer {currentPatient?.name} to a specialist or facility
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
              {/* Specialty and Facility */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Specialty *</Label>
                  <Select value={newReferral.specialty} onValueChange={(v) => setNewReferral({ ...newReferral, specialty: v })}>
                    <SelectTrigger><SelectValue placeholder="Select specialty" /></SelectTrigger>
                    <SelectContent className="max-h-[250px]">
                      {referralSpecialties.map(spec => (
                        <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newReferral.priority} onValueChange={(v) => setNewReferral({ ...newReferral, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine"><Badge className="bg-blue-100 text-blue-800">Routine</Badge></SelectItem>
                      <SelectItem value="Urgent"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge></SelectItem>
                      <SelectItem value="STAT"><Badge className="bg-red-100 text-red-800">STAT</Badge></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Facility Selection */}
              <div className="space-y-2">
                <Label>Referral Facility *</Label>
                <Select 
                  value={newReferral.facility} 
                  onValueChange={(v) => {
                    const fac = referralFacilities.find(f => f.name === v);
                    setNewReferral({ ...newReferral, facility: v, facilityType: fac?.type || "" });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    <SelectItem disabled value="internal-header" className="font-bold text-xs text-muted-foreground">── INTERNAL (NPA) ──</SelectItem>
                    {referralFacilities.filter(f => f.type === 'Internal').map(fac => (
                      <SelectItem key={fac.name} value={fac.name}>{fac.name}</SelectItem>
                    ))}
                    <SelectItem disabled value="external-header" className="font-bold text-xs text-muted-foreground">── EXTERNAL ──</SelectItem>
                    {referralFacilities.filter(f => f.type === 'External').map(fac => (
                      <SelectItem key={fac.name} value={fac.name}>{fac.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newReferral.facilityType && (
                  <Badge variant="outline" className={newReferral.facilityType === 'External' ? 'bg-orange-100 text-orange-800' : 'bg-teal-100 text-teal-800'}>
                    {newReferral.facilityType} Referral
                  </Badge>
                )}
              </div>

              {/* Reason for Referral */}
              <div className="space-y-2">
                <Label>Reason for Referral *</Label>
                <Select value={newReferral.reason} onValueChange={(v) => setNewReferral({ ...newReferral, reason: v })}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {referralReasons.map(reason => (
                      <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Clinical Indication */}
              <div className="space-y-2">
                <Label>Clinical Indication *</Label>
                <Textarea 
                  value={newReferral.clinicalSummary}
                  onChange={(e) => setNewReferral({ ...newReferral, clinicalSummary: e.target.value })}
                  placeholder="Brief summary of patient's condition, relevant history, and reason for referral..."
                  rows={3}
                />
              </div>

              {/* Contact Information (Optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Person (Optional)</Label>
                  <Input 
                    value={newReferral.contactPerson}
                    onChange={(e) => setNewReferral({ ...newReferral, contactPerson: e.target.value })}
                    placeholder="Dr. / Nurse name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone (Optional)</Label>
                  <Input 
                    value={newReferral.contactPhone}
                    onChange={(e) => setNewReferral({ ...newReferral, contactPhone: e.target.value })}
                    placeholder="e.g., 08012345678"
                  />
                </div>
              </div>

              {newReferral.priority === 'STAT' && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Emergency referrals require immediate coordination with the receiving facility
                  </p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddReferral(false)}>Cancel</Button>
              <Button 
                onClick={addReferral}
                disabled={!newReferral.specialty || !newReferral.facility || !newReferral.reason}
                className="bg-teal-600 hover:bg-teal-700"
              >
                <Send className="h-4 w-4 mr-2" />
                Add to Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
          <AlertDialogContent className="w-[95vw] sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-500" />
                End Consultation Session?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to end the consultation session with <strong>{currentPatient?.name}</strong>?
                The session data will be saved and you will return to the room queue.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-6 my-6">
              {/* Follow-up Section */}
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <input
                    type="checkbox"
                    id="followUp"
                    checked={followUpRequired}
                    onChange={(e) => setFollowUpRequired(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="followUp" className="text-sm font-medium text-blue-900 dark:text-blue-100 cursor-pointer">
                    Schedule follow-up appointment
                  </label>
              </div>

                {followUpRequired && (
                  <div className="ml-6 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Follow-up Date</label>
                        <Input
                          type="date"
                          value={followUpDate}
                          onChange={(e) => setFollowUpDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          className="w-full"
                        />
            </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Reason</label>
                        <Input
                          value={followUpReason}
                          onChange={(e) => setFollowUpReason(e.target.value)}
                          placeholder="e.g., Review lab results, follow-up consultation"
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-800">
                      <strong>Note:</strong> Follow-up appointments will be created and can be managed through the Appointments section under Medical Records. They will also be saved in the consultation notes as a backup.
                    </div>
                  </div>
                )}
              </div>

              {/* Session Summary */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 p-4 rounded-lg border">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-600" />
                  Session Summary
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Patient:</span>
                      <span className="text-sm font-medium">{currentPatient?.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Duration:</span>
                      <span className={`text-sm font-medium ${sessionDuration > 480 ? 'text-orange-600' : sessionDuration > 120 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {(() => {
                          const hours = Math.floor(sessionDuration / 60);
                          const mins = sessionDuration % 60;
                          if (hours > 0) {
                            return `${hours}h ${mins}m`;
                          }
                          return `${mins}m`;
                        })()}
                        {sessionDuration > 480 && <span className="ml-1 text-xs">(Long session)</span>}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Room:</span>
                      <span className="text-sm">{room?.name || 'Unknown'}</span>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Prescriptions:</span>
                      <Badge variant={prescriptions.length > 0 ? "default" : "secondary"} className="text-xs">
                        {prescriptions.length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Lab Orders:</span>
                      <Badge variant={labOrders.length > 0 ? "default" : "secondary"} className="text-xs">
                        {labOrders.length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Radiology:</span>
                      <Badge variant={radiologyOrders.length > 0 ? "default" : "secondary"} className="text-xs">
                        {radiologyOrders.length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Nursing:</span>
                      <Badge variant={nursingOrders.length > 0 ? "default" : "secondary"} className="text-xs">
                        {nursingOrders.length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Referrals:</span>
                      <Badge variant={referrals.length > 0 ? "default" : "secondary"} className="text-xs">
                        {referrals.length}
                      </Badge>
                    </div>
                  </div>
                </div>

                {followUpRequired && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                    <div className="text-xs text-muted-foreground">
                      <strong>Follow-up:</strong> {followUpDate} - {followUpReason}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <AlertDialogFooter className="gap-3">
              <AlertDialogCancel disabled={isEnding} className="min-w-[100px]">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmEndSession}
                disabled={isEnding}
                className="min-w-[180px] bg-orange-600 hover:bg-orange-700 focus:ring-orange-500"
              >
                {isEnding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ending Session...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    End Session & Return to Queue
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Room Queue Dialog */}
        <Dialog open={showRoomQueueDialog} onOpenChange={setShowRoomQueueDialog}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-500" />
                Room Queue - {room?.name || 'Consultation Room'}
              </DialogTitle>
              <DialogDescription>
                Patients waiting in queue for this room ({patients.length} {patients.length === 1 ? 'patient' : 'patients'})
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              {patients.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Queue is empty</p>
                  <p className="text-sm">No patients are currently waiting for this consultation room.</p>
                  <p className="text-xs mt-2 opacity-75">Patients will appear here when added to the queue.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {patients.map((patient, index) => {
                    const priorityColor = 
                      patient.priority === 'Emergency' ? 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20' :
                      patient.priority === 'High' ? 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20' :
                      patient.priority === 'Medium' ? 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' :
                      'border-gray-500/50 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
                    
                    const isCurrentPatient = currentPatient?.id === patient.id;
                    
                    return (
                      <div
                        key={patient.id}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          isCurrentPatient
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : 'border-border hover:border-emerald-300 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                              isCurrentPatient
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                                : 'bg-gradient-to-br from-blue-500 to-cyan-500'
                            }`}>
                              {patient.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-lg">{patient.name}</h4>
                                {isCurrentPatient && (
                                  <Badge variant="outline" className="bg-emerald-500 text-white border-emerald-600">
                                    In Consultation
                                  </Badge>
                                )}
                                <Badge variant="outline" className={priorityColor}>
                                  {patient.priority}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground mb-2">
                                <div>
                                  <span className="font-medium">Patient ID:</span> {patient.patientId}
                                </div>
                                <div>
                                  <span className="font-medium">Age:</span> {patient.age} years
                                </div>
                                <div>
                                  <span className="font-medium">Gender:</span> {patient.gender}
                                </div>
                                <div>
                                  <span className="font-medium">Wait Time:</span>{' '}
                                  <span className={`font-medium ${
                                    patient.waitTime > 120 ? 'text-red-600 dark:text-red-400' :
                                    patient.waitTime > 60 ? 'text-amber-600 dark:text-amber-400' :
                                    'text-green-600 dark:text-green-400'
                                  }`}>
                                    {patient.waitTime >= 60
                                      ? `${Math.floor(patient.waitTime / 60)}h ${patient.waitTime % 60}m`
                                      : `${patient.waitTime} min`
                                    }
                                  </span>
                                </div>
                              </div>
                              {patient.vitals && (
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                  <div className="flex items-center gap-2">
                                  {patient.vitals.temperature && (
                                      <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                      <Thermometer className="h-3 w-3" />
                                        {patient.vitals.temperature}°C
                                    </span>
                                  )}
                                  {patient.vitals.bloodPressure && (
                                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                      <Heart className="h-3 w-3" />
                                        {patient.vitals.bloodPressure}
                                    </span>
                                  )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                  {patient.vitals.heartRate && (
                                      <span className="flex items-center gap-1 text-pink-600 dark:text-pink-400">
                                      <Activity className="h-3 w-3" />
                                        {patient.vitals.heartRate} bpm
                                      </span>
                                    )}
                                    {patient.vitals.respiratoryRate && (
                                      <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
                                        <Wind className="h-3 w-3" />
                                        {patient.vitals.respiratoryRate}/min
                                    </span>
                                  )}
                                </div>
                                  {(patient.vitals.oxygenSaturation || patient.vitals.weight) && (
                                    <div className="flex items-center gap-2 col-span-2">
                                      {patient.vitals.oxygenSaturation && (
                                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                          <Zap className="h-3 w-3" />
                                          SpO2: {patient.vitals.oxygenSaturation}%
                                        </span>
                                      )}
                                      {patient.vitals.weight && (
                                        <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                                          <Scale className="h-3 w-3" />
                                          {patient.vitals.weight} kg
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground mb-1">Position</div>
                              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                #{index + 1}
                              </div>
                            </div>
                            {!isCurrentPatient && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setShowRoomQueueDialog(false);
                                  handleStartSession(patient);
                                }}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                              >
                                <Stethoscope className="h-4 w-4 mr-1" />
                                Start
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowRoomQueueDialog(false)}>
                Close
              </Button>
              <Button
                type="button"
                disabled={isRefreshingQueue}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Refresh only queue data, not the entire page
                  setIsRefreshingQueue(true);
                  try {
                    await refreshQueueData();
                    toast.success(`Queue refreshed - ${patients.length} patient${patients.length !== 1 ? 's' : ''} in queue`);
                  } catch (error) {
                    console.error('Failed to refresh queue:', error);
                    toast.error('Failed to refresh queue. Please try again.');
                  } finally {
                    setIsRefreshingQueue(false);
                  }
                }}
                variant="default"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshingQueue ? 'animate-spin' : ''}`} />
                {isRefreshingQueue ? 'Refreshing...' : 'Refresh Queue'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ward Admission Detail Dialog */}
        <Dialog open={showWardAdmissionDetail} onOpenChange={setShowWardAdmissionDetail}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-500" />
                Ward Admission Details
              </DialogTitle>
              <DialogDescription>
                Detailed information about the patient's ward admission
              </DialogDescription>
            </DialogHeader>

            {selectedWardAdmission && (
              <div className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Admission Information</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Admission ID:</span>
                        <span className="text-sm">{selectedWardAdmission.admission_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Admission Type:</span>
                        <Badge variant="outline">{selectedWardAdmission.admission_type}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Status:</span>
                        <Badge className={
                          selectedWardAdmission.status === 'admitted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                          selectedWardAdmission.status === 'discharged' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          'bg-gray-100 text-gray-800'
                        }>
                          {selectedWardAdmission.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Timing Information</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Admission Date:</span>
                        <span className="text-sm">{formatDate(selectedWardAdmission.admission_date)} {formatTime(selectedWardAdmission.admission_date)}</span>
                      </div>
                      {selectedWardAdmission.status === 'discharged' && (
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">Status:</span>
                          <span className="text-sm font-medium text-green-600">Discharged</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Length of Stay:</span>
                        <span className="text-sm font-medium text-blue-600">{selectedWardAdmission.length_of_stay} days</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ward and Bed Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Ward Information</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Ward:</span>
                        <span className="text-sm">{selectedWardAdmission.ward_name}</span>
                      </div>
                      {selectedWardAdmission.bed_number && (
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">Bed:</span>
                          <span className="text-sm">{selectedWardAdmission.bed_number}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Medical Information</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium">Ward Assignment:</span>
                        <p className="text-sm mt-1 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-blue-700 dark:text-blue-300 font-medium">
                          {selectedWardAdmission.admission_diagnosis?.includes('Admitted to ')
                            ? selectedWardAdmission.admission_diagnosis.split('Admitted to ')[1]
                            : selectedWardAdmission.ward_name}
                        </p>
                      </div>
                      {/* Show medical diagnosis separately if it exists beyond ward assignment */}
                      {selectedWardAdmission.admission_diagnosis && !selectedWardAdmission.admission_diagnosis.includes('Admitted to ') && (
                        <div>
                          <span className="text-sm font-medium">Medical Diagnosis:</span>
                          <p className="text-sm mt-1 p-2 bg-muted rounded text-muted-foreground">
                            {selectedWardAdmission.admission_diagnosis}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Discharge Information */}
                {selectedWardAdmission.status === 'discharged' && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800 dark:text-green-200">Patient has been discharged</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Session Viewer Dialog */}
        <Dialog open={showSessionViewer} onOpenChange={setShowSessionViewer}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
            {selectedSession && (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-emerald-500" />
                        Consultation Report
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                          {selectedSession.id}
                        </Badge>
                      </DialogTitle>
                      <DialogDescription>
                        {formatDate(selectedSession.started_at)} • {formatTime(selectedSession.started_at)} • {selectedSession.room_name || 'Consulting Room'}
                      </DialogDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => downloadConsultationReport(selectedSession)}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => printConsultationReport(selectedSession)}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                      </Button>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  {/* Header Info */}
                  <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">PATIENT INFORMATION</h4>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{selectedSession.patient_name || 'Unknown Patient'}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Patient ID: {selectedSession.patient_id || 'N/A'} • Age: {selectedSession.patient_age || 'N/A'} • Gender: {selectedSession.patient_gender || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">CONSULTATION DETAILS</h4>
                      <div className="space-y-1 text-sm">
                        <div><strong>Doctor:</strong> {selectedSession.doctor_name || 'Unknown'}</div>
                        <div><strong>Clinic:</strong> {selectedSession.clinic_name || 'Unknown Clinic'}</div>
                        <div><strong>Duration:</strong> {selectedSession.ended_at ? Math.round((new Date(selectedSession.ended_at).getTime() - new Date(selectedSession.started_at).getTime()) / (1000 * 60)) + ' min' : 'Ongoing'}</div>
                        <div><strong>Room:</strong> {selectedSession.room_name || 'Unknown Room'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Vitals */}
                  <div>
                    <h4 className="text-sm font-semibold text-blue-600 mb-2">VITAL SIGNS</h4>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      {Object.entries((selectedSession as ExtendedConsultationSession).vitals || {}).map(([key, value]: [string, unknown]) => (
                        <div key={key} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center border border-blue-200 dark:border-blue-800">
                          <div className="text-xs text-muted-foreground">{vitalLabel(key)}</div>
                          <div className="font-medium">{formatVitalDisplay(key, value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Medical Notes */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-amber-600">CLINICAL NOTES</h4>
                    
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Presentation Complaint</label>
                      <p className="mt-1 p-3 bg-muted/30 rounded-lg text-sm">{selectedSession.presentation_complaint}</p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">History of Present Illness</label>
                      <p className="mt-1 p-3 bg-muted/30 rounded-lg text-sm">{selectedSession.history_of_presenting_illness}</p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Physical Examination</label>
                      <p className="mt-1 p-3 bg-muted/30 rounded-lg text-sm">{selectedSession.physical_examination}</p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Assessment</label>
                      <p className="mt-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm border border-blue-200 dark:border-blue-800">
                        {selectedSession.assessment}
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Treatment Plan</label>
                      <p className="mt-1 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm border border-emerald-200 dark:border-emerald-800 whitespace-pre-line">
                        {selectedSession.plan}
                      </p>
                    </div>
                  </div>

                  {/* Diagnoses */}
                  {selectedSession.diagnoses && selectedSession.diagnoses.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
                        <Stethoscope className="h-4 w-4" />
                        DIAGNOSES
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-red-50 dark:bg-red-900/20">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">ICD-10 Code</th>
                              <th className="px-3 py-2 text-left font-medium">Diagnosis</th>
                              <th className="px-3 py-2 text-center font-medium">Diagnosis Type</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {((selectedSession as ExtendedConsultationSession).diagnoses || []).map((diagnosis: any, index: number) => (
                              <tr key={diagnosis.id || index} className="hover:bg-muted/50">
                                <td className="px-3 py-2 font-mono text-xs">{diagnosis.code}</td>
                                <td className="px-3 py-2">
                                  <div>
                                    <div className="font-medium text-sm">{diagnosis.name}</div>
                                    {diagnosis.notes && (
                                      <div className="text-xs text-muted-foreground mt-1">{diagnosis.notes}</div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <Badge variant="outline" className={`text-xs ${
                                    diagnosis.type === 'Primary' ? 'bg-red-500/10 text-red-600 border-red-500/30' :
                                    diagnosis.type === 'Secondary' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                                    'bg-blue-500/10 text-blue-600 border-blue-500/30'
                                  }`}>
                                    {diagnosis.type}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Prescriptions */}
                  {getSessionProperty(selectedSession as ExtendedConsultationSession, 'prescriptions').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-violet-600 mb-2 flex items-center gap-2">
                        <Pill className="h-4 w-4" />
                        PRESCRIPTIONS
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-violet-50 dark:bg-violet-900/20">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Medication</th>
                              <th className="px-3 py-2 text-left font-medium">Dosage</th>
                              <th className="px-3 py-2 text-left font-medium">Frequency</th>
                              <th className="px-3 py-2 text-left font-medium">Duration</th>
                              <th className="px-3 py-2 text-center font-medium">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {getSessionProperty(selectedSession as ExtendedConsultationSession, 'prescriptions').map((rx: { medication: string; dosage: string; frequency: string; duration: string; quantity: number }, index: number) => (
                              <tr key={index}>
                                <td className="px-3 py-2 font-medium">{rx.medication}</td>
                                <td className="px-3 py-2">{rx.dosage}</td>
                                <td className="px-3 py-2">{rx.frequency}</td>
                                <td className="px-3 py-2">{rx.duration}</td>
                                <td className="px-3 py-2 text-center">{rx.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Lab Orders */}
                  {getSessionProperty(selectedSession as ExtendedConsultationSession, 'labOrders').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-2">
                        <TestTube className="h-4 w-4" />
                        LABORATORY ORDERS
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-amber-50 dark:bg-amber-900/20">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Test</th>
                              <th className="px-3 py-2 text-left font-medium">Priority</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                              <th className="px-3 py-2 text-left font-medium">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {getSessionProperty(selectedSession as ExtendedConsultationSession, 'labOrders').map((lab: { test?: string; status?: string; priority?: string; result?: string }, index: number) => (
                              <tr key={index}>
                                <td className="px-3 py-2 font-medium">{lab.test ?? ''}</td>
                                <td className="px-3 py-2">{formatPriority(lab.priority)}</td>
                                <td className="px-3 py-2">
                                  <Badge className="bg-emerald-100 text-emerald-800">{lab.status ?? ''}</Badge>
                                </td>
                                <td className="px-3 py-2 text-sm">{lab.result ?? ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Radiology Orders */}
                  {getSessionProperty(selectedSession as ExtendedConsultationSession, 'radiologyOrders').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-indigo-600 mb-2 flex items-center gap-2">
                        <ScanLine className="h-4 w-4" />
                        RADIOLOGY ORDERS
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-indigo-50 dark:bg-indigo-900/20">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Procedure</th>
                              <th className="px-3 py-2 text-left font-medium">Priority</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                              <th className="px-3 py-2 text-left font-medium">Finding</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {getSessionProperty(selectedSession as ExtendedConsultationSession, 'radiologyOrders').map((img: { procedure?: string; priority?: string; status?: string; finding?: string }, index: number) => (
                              <tr key={index}>
                                <td className="px-3 py-2 font-medium">{img.procedure ?? ''}</td>
                                <td className="px-3 py-2">{formatPriority(img.priority)}</td>
                                <td className="px-3 py-2">
                                  <Badge className="bg-emerald-100 text-emerald-800">{img.status ?? ''}</Badge>
                                </td>
                                <td className="px-3 py-2 text-sm">{img.finding ?? ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Physiotherapy Orders */}
                  {getSessionProperty(selectedSession as ExtendedConsultationSession, 'physioOrders').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-600 mb-2 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        PHYSIOTHERAPY ORDERS
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-emerald-50 dark:bg-emerald-900/20">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Diagnosis / Chief Complaint</th>
                              <th className="px-3 py-2 text-left font-medium">Priority</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {getSessionProperty(selectedSession as ExtendedConsultationSession, 'physioOrders').map((p: { diagnosis?: string; priority?: string; status?: string }, index: number) => (
                              <tr key={index}>
                                <td className="px-3 py-2 font-medium">{p.diagnosis ?? ''}</td>
                                <td className="px-3 py-2">{formatPriority(p.priority)}</td>
                                <td className="px-3 py-2">
                                  <Badge className="bg-emerald-100 text-emerald-800">{p.status ?? ''}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Nursing Orders */}
                  {getSessionProperty(selectedSession as ExtendedConsultationSession, 'nursingOrders').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-cyan-600 mb-2 flex items-center gap-2">
                        <Syringe className="h-4 w-4" />
                        NURSING ORDERS
                      </h4>
                      <div className="space-y-2">
                        {getSessionProperty(selectedSession as ExtendedConsultationSession, 'nursingOrders').map((no: { type: string; instructions: string; status?: string }, index: number) => (
                          <div key={index} className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                            <div className="font-medium">{no.type}</div>
                            <div className="text-sm text-muted-foreground">{no.instructions}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up */}
                  {((selectedSession as ExtendedConsultationSession).followUp) && (
                    <div>
                      <h4 className="text-sm font-semibold text-blue-600 mb-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        FOLLOW-UP APPOINTMENT
                      </h4>
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="font-medium">{(selectedSession as ExtendedConsultationSession).followUp!.date}</div>
                        <div className="text-sm text-muted-foreground">{(selectedSession as ExtendedConsultationSession).followUp!.reason}</div>
                      </div>
                    </div>
                  )}

                  {/* Outcome */}
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <h4 className="text-sm font-semibold text-emerald-600 mb-1">SESSION OUTCOME</h4>
                    <p className="text-sm">{(selectedSession as ExtendedConsultationSession).outcome || selectedSession.status}</p>
                  </div>

                  {/* Footer */}
                  <div className="border-t pt-4 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
                      <span>Document ID: {selectedSession.id}</span>
                    </div>
                    <div className="mt-2 text-center">
{getOrganizationHeader()}
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Lab Result Viewer Dialog */}
        <Dialog open={showLabResultViewer} onOpenChange={setShowLabResultViewer}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
            {selectedLabResult && (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="flex items-center gap-3">
                        <TestTube className="h-5 w-5 text-amber-500" />
                        Laboratory Report
                        <Badge variant="outline" className="bg-amber-50 text-amber-700">
                          {selectedLabResult.id}
                        </Badge>
                        {selectedLabResult.criticalValue && (
                          <Badge className="bg-red-600 text-white">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Critical Value
                          </Badge>
                        )}
                      </DialogTitle>
                      <DialogDescription>
                        {selectedLabResult.date} • {selectedLabResult.category} • {selectedLabResult.test}
                      </DialogDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => downloadLabResultPDF(selectedLabResult)}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => printLabResult(selectedLabResult)}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                      </Button>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  {/* Header - Test Info */}
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">TEST INFORMATION</h4>
                        <div className="space-y-1 text-sm">
                          <div><strong>Test Name:</strong> {selectedLabResult.test}</div>
                          <div><strong>Category:</strong> {selectedLabResult.category}</div>
                          <div><strong>Specimen Type:</strong> {selectedLabResult.specimenType}</div>
                          <div className="flex items-center gap-2">
                            <strong>Overall Status:</strong>
                            <Badge className={selectedLabResult.status === 'Normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                              {selectedLabResult.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">PROCESSING DETAILS</h4>
                        <div className="space-y-1 text-sm">
                          <div><strong>Ordered By:</strong> {selectedLabResult.orderedBy}</div>
                          <div><strong>Collected:</strong> {selectedLabResult.collectedAt}</div>
                          <div><strong>Reported:</strong> {selectedLabResult.reportedAt}</div>
                          <div><strong>Performed By:</strong> {selectedLabResult.performedBy}</div>
                          <div><strong>Verified By:</strong> {selectedLabResult.verifiedBy}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Test Results */}
                  {selectedLabResult.hasManualResults ? (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      TEST RESULTS
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">Parameter</th>
                            <th className="px-4 py-3 text-center font-semibold">Result</th>
                            <th className="px-4 py-3 text-center font-semibold">Unit</th>
                            <th className="px-4 py-3 text-center font-semibold">Reference Range</th>
                            <th className="px-4 py-3 text-center font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                            {(selectedLabResult.parameters || []).map((param: { name: string; value: string; unit: string; status: string; referenceRange?: string; normalRange?: string }, index: number) => (
                            <tr key={index} className={param.status !== 'Normal' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                              <td className="px-4 py-3 font-medium">{param.name}</td>
                              <td className={`px-4 py-3 text-center font-bold ${param.status === 'Abnormal' ? 'text-red-600' : param.status === 'Borderline' ? 'text-amber-600' : ''}`}>
                                {param.value}
                              </td>
                              <td className="px-4 py-3 text-center text-muted-foreground">{param.unit}</td>
                              <td className="px-4 py-3 text-center text-muted-foreground">{param.normalRange || param.referenceRange || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <Badge className={getParameterStatusColor(param.status)}>
                                  {param.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  ) : selectedLabResult.hasUploadedFile ? (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        UPLOADED RESULT FILE
                      </h4>
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-blue-500" />
                          <div className="flex-1">
                            <p className="font-medium text-blue-900 dark:text-blue-100">
                              {selectedLabResult.resultFile?.name || 'Lab Result File'}
                            </p>
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              {selectedLabResult.resultFile?.type === 'application/pdf' ? 'PDF Document' : 'Lab Result File'}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (selectedLabResult.resultFile?.url) {
                                window.open(selectedLabResult.resultFile.url, '_blank');
                              }
                            }}
                            className="bg-blue-100 hover:bg-blue-200 text-blue-800 border-blue-300"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            View File
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        TEST RESULTS
                      </h4>
                      <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg border border-gray-200 dark:border-gray-800">
                        <p className="text-center text-muted-foreground">
                          No test results available
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Summary Result */}
                  {selectedLabResult.hasManualResults && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">SUMMARY</h4>
                    <p className="p-3 bg-muted/30 rounded-lg border text-sm font-medium">
                        {selectedLabResult.result || 'Results entered manually'}
                    </p>
                  </div>
                  )}

                  {selectedLabResult.hasUploadedFile && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">NOTES</h4>
                      <p className="p-3 bg-muted/30 rounded-lg border text-sm">
                        Results uploaded as file. Please view the uploaded document for detailed findings.
                      </p>
                    </div>
                  )}

                  {/* Interpretation */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">INTERPRETATION</h4>
                    <p className={`p-4 rounded-lg border text-sm ${selectedLabResult.status === 'Abnormal' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'}`}>
                      {selectedLabResult.hasUploadedFile
                        ? 'Please refer to the uploaded result file for interpretation and clinical correlation.'
                        : selectedLabResult.interpretation || 'No interpretation available'
                      }
                    </p>
                  </div>

                  {/* Clinical Notes */}
                  {selectedLabResult.clinicalNotes && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">CLINICAL NOTES</h4>
                      <p className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
                        {selectedLabResult.clinicalNotes}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="border-t pt-4">
                    <div className="grid md:grid-cols-3 gap-4 text-xs text-muted-foreground">
                      <div>
                        <strong>Performed By:</strong><br />
                        {selectedLabResult.performedBy}
                      </div>
                      <div>
                        <strong>Verified By:</strong><br />
                        {selectedLabResult.verifiedBy}
                      </div>
                      <div className="text-right">
                        <strong>Report Generated:</strong><br />
                        {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="mt-4 text-center text-xs text-muted-foreground">
{getOrganizationLabHeader()}<br />
                      Document ID: {selectedLabResult.id}
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Prescription Viewer Modal */}
        <Dialog open={showPrescriptionViewer} onOpenChange={setShowPrescriptionViewer}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
            {selectedPrescription && (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-violet-500" />
                      Prescription Details
                      <Badge variant="outline" className="ml-2">
                        {selectedPrescription.prescriptionId}
                      </Badge>
                    </DialogTitle>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => {}}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {}}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                      </Button>
                    </div>
                  </div>
                  <DialogDescription>
                    {selectedPrescription.date} • {selectedPrescription.doctor} • {selectedPrescription.diagnosis}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                  {/* Prescription Information */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">PRESCRIPTION INFORMATION</h4>
                    <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
                      <div>
                        <div><strong>Prescription ID:</strong> {selectedPrescription.prescriptionId}</div>
                        <div><strong>Date:</strong> {selectedPrescription.date}</div>
                        <div><strong>Doctor:</strong> {selectedPrescription.doctor}</div>
                      </div>
                      <div>
                        <div><strong>Diagnosis:</strong> {selectedPrescription.diagnosis}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <strong>Status:</strong>
                          <Badge 
                            variant="outline" 
                            className={
                              selectedPrescription.status === 'dispensed' 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : selectedPrescription.status === 'partially_dispensed'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                            }
                          >
                            {selectedPrescription.status === 'dispensed' ? 'Dispensed' : 
                             selectedPrescription.status === 'partially_dispensed' ? 'Partially Dispensed' : 
                             'Pending'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Medications */}
                  <div>
                    <h4 className="text-sm font-semibold text-violet-600 mb-3 flex items-center gap-2">
                      <Pill className="h-4 w-4" />
                      PRESCRIBED MEDICATIONS
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium">Medication</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedPrescription.medications.map((med: any, index: number) => (
                            <tr key={index} className="hover:bg-muted/30">
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-sm">
                                  {med.medication_name || med.medication?.name || med.name || 'Unknown'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Notes */}
                  {selectedPrescription.notes && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">NOTES</h4>
                      <p className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
                        {selectedPrescription.notes}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="border-t pt-4">
                    <div className="text-center text-xs text-muted-foreground">
{getOrganizationServicesHeader()}<br />
                      Document ID: {selectedPrescription.id}
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Medical History Dialog */}
        <Dialog open={showEditMedicalHistory} onOpenChange={setShowEditMedicalHistory}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Edit Medical History
              </DialogTitle>
              <DialogDescription>
                Update surgical history, family history, and social history for {currentPatient?.name}
              </DialogDescription>
            </DialogHeader>
            
            {loadingMedicalHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Loading medical history...</span>
              </div>
            ) : (
              <div className="space-y-6 py-4">
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

                <Separator />

                {/* Chronic Conditions (Diagnoses) */}
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

                <Separator />

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

                <Separator />

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
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditMedicalHistory(false)}>
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  if (!currentPatient) return;
                  setLoadingMedicalHistory(true);
                  try {
                    // Get numeric patient ID
                    const patientIdStr = currentPatient.patientId || currentPatient.id;
                    let numericPatientId: number;
                    const parsedId = parseInt(patientIdStr, 10);
                    if (!isNaN(parsedId) && parsedId > 0) {
                      numericPatientId = parsedId;
                    } else {
                      const searchResult = await patientService.getPatients({ search: patientIdStr });
                      const matchedPatient = searchResult.results.find(
                        p => p.patient_id === patientIdStr || p.patient_id.toUpperCase() === patientIdStr.toUpperCase()
                      );
                      if (!matchedPatient) {
                        throw new Error(`Patient with ID "${patientIdStr}" not found`);
                      }
                      numericPatientId = matchedPatient.id;
                    }
                    
                    await patientService.updatePatientHistory(numericPatientId, {
                      allergies: medicalHistory.allergies,
                      diagnoses: medicalHistory.diagnoses,
                      surgical_history: medicalHistory.surgicalHistory,
                      family_history: medicalHistory.familyHistory,
                      social_history: medicalHistory.socialHistory,
                    });
                    
                    toast.success('Medical history updated successfully');
                    setShowEditMedicalHistory(false);
                  } catch (err: any) {
                    console.error('Error updating medical history:', err);
                    toast.error(err.message || 'Failed to update medical history');
                  } finally {
                    setLoadingMedicalHistory(false);
                  }
                }}
                disabled={loadingMedicalHistory}
              >
                {loadingMedicalHistory ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Vitals Detail Modal */}
        <VitalsDetailModal
          isOpen={isVitalsDetailModalOpen}
          onClose={() => setIsVitalsDetailModalOpen(false)}
          vitals={selectedVital ? {
            ...selectedVital,
            temperature: selectedVital.temperature?.toString(),
            bloodPressureSystolic: selectedVital.systolic?.toString(),
            bloodPressureDiastolic: selectedVital.diastolic?.toString(),
            pulse: selectedVital.heartRate?.toString(),
            respiratoryRate: selectedVital.respiratoryRate?.toString(),
            oxygenSaturation: selectedVital.oxygenSaturation?.toString(),
            weight: selectedVital.weight?.toString(),
            height: selectedVital.height?.toString(),
            bmi: selectedVital.bmi?.toString(),
            painScale: selectedVital.painScale?.toString(),
            bloodSugar: selectedVital.bloodSugar?.toString(),
          } : null}
          patientName={currentPatient?.name || 'Patient'}
        />
      </div>

      {/* Discharge Dialog */}
      <Dialog open={showDischargeDialog} onOpenChange={setShowDischargeDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Discharge Patient: {currentPatient?.name}</DialogTitle>
            <DialogDescription>
              Complete patient discharge from ward. This will end their hospital admission.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Discharge Type</Label>
                <Select
                  value={dischargeData.discharge_type}
                  onValueChange={(value) => setDischargeData({...dischargeData, discharge_type: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular Discharge</SelectItem>
                    <SelectItem value="against_medical_advice">Against Medical Advice</SelectItem>
                    <SelectItem value="transfer">Transfer to Another Facility</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Discharge Diagnosis</Label>
                <Input
                  value={dischargeData.discharge_diagnosis}
                  onChange={(e) => setDischargeData({...dischargeData, discharge_diagnosis: e.target.value})}
                  placeholder="Final diagnosis"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Discharge Notes</Label>
              <Textarea
                value={dischargeData.discharge_notes}
                onChange={(e) => setDischargeData({...dischargeData, discharge_notes: e.target.value})}
                placeholder="Clinical notes for discharge"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Discharge Summary</Label>
              <Textarea
                value={dischargeData.discharge_summary}
                onChange={(e) => setDischargeData({...dischargeData, discharge_summary: e.target.value})}
                placeholder="Comprehensive discharge summary"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Follow-up Instructions</Label>
              <Textarea
                value={dischargeData.follow_up_instructions}
                onChange={(e) => setDischargeData({...dischargeData, follow_up_instructions: e.target.value})}
                placeholder="Instructions for follow-up care"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDischargeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!currentPatient) return;

                try {
                  // Find the active admission
                  const activeAdmission = wardAdmissions.find(admission => admission.status === 'admitted');
                  if (!activeAdmission) {
                    toast.error('No active admission found');
                    return;
                  }

                  // Discharge the patient
                  await apiFetch(`/admissions/${activeAdmission.id}/discharge/`, {
                    method: 'POST',
                    body: JSON.stringify({
                      discharge_type: dischargeData.discharge_type,
                      discharge_doctor: currentUser?.id ? Number(currentUser.id) : undefined,
                      discharge_diagnosis: dischargeData.discharge_diagnosis,
                      discharge_notes: dischargeData.discharge_notes,
                      discharge_summary: dischargeData.discharge_summary,
                      follow_up_instructions: dischargeData.follow_up_instructions,
                    }),
                  });

                  toast.success('Patient discharged successfully');
                  setShowDischargeDialog(false);
                  setDischargeData({
                    discharge_type: 'regular',
                    discharge_diagnosis: '',
                    discharge_notes: '',
                    discharge_summary: '',
                    follow_up_instructions: ''
                  });

                  // Refresh ward admissions data
                  const updatedAdmissions = await wardService.getAdmissions({ patient: Number(currentPatient.id) });
                  setWardAdmissions(updatedAdmissions?.results || []);

                } catch (error: any) {
                  console.error('Error discharging patient:', error);
                  toast.error(error.message || 'Failed to discharge patient');
                }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Discharge Patient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Physio Order View Dialog */}
      <Dialog open={isPhysioOrderDialogOpen} onOpenChange={setIsPhysioOrderDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-teal-500" />
              Physiotherapy Order Details
            </DialogTitle>
            <DialogDescription>
              PHY-{selectedPhysioOrder?.id?.toString().padStart(6, '0')} • Ordered {selectedPhysioOrder?.ordered_at ? new Date(selectedPhysioOrder.ordered_at).toLocaleString() : 'N/A'}
            </DialogDescription>
          </DialogHeader>

          {selectedPhysioOrder && (
            <div className="space-y-4">
              {/* Patient & Order Info */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Patient</p>
                  <p className="font-medium">{selectedPhysioOrder.patient_name}</p>
                  <p className="text-sm text-muted-foreground font-mono">{selectedPhysioOrder.patient_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Order Status</p>
                  <Badge variant="outline" className={`text-xs ${
                    selectedPhysioOrder.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                    selectedPhysioOrder.status === 'in_progress' ? 'bg-orange-500/10 text-orange-600' :
                    selectedPhysioOrder.status === 'scheduled' ? 'bg-blue-500/10 text-blue-600' :
                    'bg-gray-500/10 text-gray-600'
                  }`}>
                    {selectedPhysioOrder.status.replace('_', ' ')}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedPhysioOrder.sessions_completed}/{selectedPhysioOrder.total_sessions} sessions
                  </p>
                </div>
              </div>

              {/* Clinical Information */}
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-muted-foreground mb-1">Diagnosis</p>
                  <p className="text-sm font-medium">{selectedPhysioOrder.diagnosis || 'N/A'}</p>
                </div>

                {selectedPhysioOrder.chief_complaint && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-muted-foreground mb-1">Chief Complaint</p>
                    <p className="text-sm">{selectedPhysioOrder.chief_complaint}</p>
                  </div>
                )}

                {selectedPhysioOrder.treatment_goal && (
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-xs text-muted-foreground mb-1">Treatment Goal</p>
                    <p className="text-sm">{selectedPhysioOrder.treatment_goal}</p>
                  </div>
                )}

                {selectedPhysioOrder.special_instructions && (
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                    <p className="text-xs text-muted-foreground mb-1">Special Instructions</p>
                    <p className="text-sm">{selectedPhysioOrder.special_instructions}</p>
                  </div>
                )}
              </div>

              {/* Order Timeline */}
              <div className="p-3 rounded-lg border bg-card">
                <p className="text-xs text-muted-foreground mb-2">Order Timeline</p>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    <span>Ordered: {selectedPhysioOrder.ordered_at ? new Date(selectedPhysioOrder.ordered_at).toLocaleString() : 'N/A'}</span>
                  </div>
                  {selectedPhysioOrder.scheduled_at && (
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                      <span>Scheduled: {new Date(selectedPhysioOrder.scheduled_at).toLocaleString()}</span>
                    </div>
                  )}
                  {selectedPhysioOrder.completed_at && (
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      <span>Completed: {new Date(selectedPhysioOrder.completed_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Session Reports */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Session Reports ({physioOrderSessions.length})
                </h3>

                {loadingPhysioSessions ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading session reports...</span>
                  </div>
                ) : physioOrderSessions.length === 0 ? (
                  <div className="p-6 rounded-lg border border-dashed text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No sessions completed yet</p>
                    <p className="text-xs">Session reports will appear here once physiotherapy sessions are completed</p>
                  </div>
                ) : (
                  physioOrderSessions.map((session, index) => (
                    <Card key={session.id} className="border-l-4 border-l-teal-500">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Activity className="h-4 w-4 text-teal-500" />
                            Session {session.session_number} - {session.physiotherapist_name}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${
                              session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                              session.status === 'in_progress' ? 'bg-orange-500/10 text-orange-600 border-orange-500/30' :
                              'bg-blue-500/10 text-blue-600 border-blue-500/30'
                            }`}>
                              {session.status.replace('_', ' ')}
                            </Badge>
                            {session.completed_at && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(session.completed_at).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        {session.duration_minutes && (
                          <CardDescription>
                            Duration: {session.duration_minutes} minutes
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* A. Patient Assessment */}
                        {(session.presenting_complaint || session.pain_level_before !== undefined || session.pain_level_after !== undefined) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
                              <User className="h-4 w-4" />
                              A. Patient Assessment
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.presenting_complaint && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Presenting Complaint</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.presenting_complaint}</p>
                                </div>
                              )}
                              {(session.pain_level_before !== undefined || session.pain_level_after !== undefined) && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Pain Level (0-10)</Label>
                                  <div className="flex gap-2">
                                    {session.pain_level_before !== undefined && (
                                      <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-600 border-red-200">
                                        Before: {session.pain_level_before}
                                      </Badge>
                                    )}
                                    {session.pain_level_after !== undefined && (
                                      <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-600 border-green-200">
                                        After: {session.pain_level_after}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* B. Medical & Social Background */}
                        {(session.medical_history || session.surgical_history || session.medications || session.allergies || session.social_history || session.previous_treatments) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2">
                              <Heart className="h-4 w-4" />
                              B. Medical & Social Background
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.medical_history && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Medical History</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.medical_history}</p>
                                </div>
                              )}
                              {session.surgical_history && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Surgical History</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.surgical_history}</p>
                                </div>
                              )}
                              {session.medications && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Medications</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.medications}</p>
                                </div>
                              )}
                              {session.allergies && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Allergies</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.allergies}</p>
                                </div>
                              )}
                              {session.social_history && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Social History</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.social_history}</p>
                                </div>
                              )}
                              {session.previous_treatments && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Previous Treatments</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.previous_treatments}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* C. Physical Examination */}
                        {(session.posture_gait || session.range_of_motion || session.muscle_strength || session.sensation || session.reflexes || session.special_tests || session.balance_coordination || session.assessment_findings) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                              <Scale className="h-4 w-4" />
                              C. Physical Examination
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.posture_gait && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Posture & Gait</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.posture_gait}</p>
                                </div>
                              )}
                              {session.range_of_motion && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Range of Motion</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.range_of_motion}</p>
                                </div>
                              )}
                              {session.muscle_strength && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Muscle Strength</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.muscle_strength}</p>
                                </div>
                              )}
                              {session.sensation && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Sensation</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.sensation}</p>
                                </div>
                              )}
                              {session.reflexes && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Reflexes</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.reflexes}</p>
                                </div>
                              )}
                              {session.special_tests && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Special Tests</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.special_tests}</p>
                                </div>
                              )}
                              {session.balance_coordination && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Balance & Coordination</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.balance_coordination}</p>
                                </div>
                              )}
                              {session.assessment_findings && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Assessment Findings</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.assessment_findings}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* D. Functional Evaluation */}
                        {(session.functional_assessment || session.functional_limitations || session.functional_goals || session.assistive_devices) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                              <Target className="h-4 w-4" />
                              D. Functional Evaluation
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.functional_assessment && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Functional Assessment</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.functional_assessment}</p>
                                </div>
                              )}
                              {session.functional_limitations && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Functional Limitations</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.functional_limitations}</p>
                                </div>
                              )}
                              {session.functional_goals && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Functional Goals</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.functional_goals}</p>
                                </div>
                              )}
                              {session.assistive_devices && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Assistive Devices</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.assistive_devices}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* E. Clinical Reasoning */}
                        {(session.diagnosis_impression || session.prognosis || session.clinical_reasoning) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                              <Lightbulb className="h-4 w-4" />
                              E. Clinical Reasoning
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.diagnosis_impression && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Diagnosis/Impression</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.diagnosis_impression}</p>
                                </div>
                              )}
                              {session.prognosis && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Prognosis</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.prognosis}</p>
                                </div>
                              )}
                              {session.clinical_reasoning && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Clinical Reasoning</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.clinical_reasoning}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* F. Treatment Plan */}
                        {(session.treatment_performed || session.exercises_prescribed?.length || session.equipment_used?.length || session.patient_education) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                              <ClipboardList className="h-4 w-4" />
                              F. Treatment Plan
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.treatment_performed && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Treatment Performed</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.treatment_performed}</p>
                                </div>
                              )}
                              {session.exercises_prescribed && session.exercises_prescribed.length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Exercises Prescribed</Label>
                                  <ul className="text-sm bg-muted/50 p-2 rounded list-disc pl-5">
                                    {session.exercises_prescribed.map((ex: any, idx: number) => (
                                      <li key={idx}>{typeof ex === 'string' ? ex : ex.name || ex}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {session.equipment_used && session.equipment_used.length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Equipment Used</Label>
                                  <ul className="text-sm bg-muted/50 p-2 rounded list-disc pl-5">
                                    {session.equipment_used.map((eq: any, idx: number) => (
                                      <li key={idx}>{typeof eq === 'string' ? eq : eq.name || eq}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {session.patient_education && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Patient Education</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.patient_education}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* G. Session & Continuity */}
                        {(session.session_notes || session.progress_notes || session.recommendations?.length || session.follow_up_instructions || session.next_session_plan) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              G. Session & Continuity
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.session_notes && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Session Notes</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.session_notes}</p>
                                </div>
                              )}
                              {session.progress_notes && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Progress Notes</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.progress_notes}</p>
                                </div>
                              )}
                              {session.recommendations && session.recommendations.length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Recommendations</Label>
                                  <ul className="text-sm bg-muted/50 p-2 rounded list-disc pl-5">
                                    {session.recommendations.map((rec: any, idx: number) => (
                                      <li key={idx}>{typeof rec === 'string' ? rec : rec.text || rec}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {session.follow_up_instructions && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Follow-up Instructions</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.follow_up_instructions}</p>
                                </div>
                              )}
                              {session.next_session_plan && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Next Session Plan</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.next_session_plan}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPhysioOrderDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
