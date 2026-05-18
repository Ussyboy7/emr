"use client";

import { Fragment, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { adminService, labService, patientService, formatPatientGenderLabel, type LabOrder as ApiLabOrder, type LabTest as ApiLabTest, type LabPartner, type LabReferralDispatch, type Clinic, type Patient } from '@/lib/services';
import { Icd10DiagnosesBlock } from '@/components/medical/Icd10DiagnosesBlock';
import { transformLabTestStatus, transformPriority, transformToBackendPriority, transformProcessingMethod, transformToBackendProcessingMethod } from '@/lib/services/transformers';
import { buildDateQuery, formatRejectionReason, LAB_ORDER_STATUS, LAB_TEST_STATUS } from '@/lib/laboratory/constants';
import { useServerToday } from '@/hooks/use-server-today';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useLabUrlSync } from '@/hooks/use-lab-url-sync';
import {
  findLabOrdersTabForOrders,
  isValidLabOrdersTab,
  LAB_ORDERS_TAB_LABELS,
  orderMatchesLabOrdersTab,
  type LabOrdersTab,
} from '@/lib/laboratory/lab-workflow-search';
import {
  buildEntryTemplate,
  classifyValue,
  coerceStoredResultValue,
  orderResultRows,
  type TemplateField,
} from '@/lib/laboratory/template-utils';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import {
  TestTube, Search, Eye, Clock, CheckCircle2, Activity, FlaskConical, Loader2,
  Beaker, AlertTriangle, User, Calendar, FileText, Play, Stethoscope,
  ClipboardList, Upload, Download, Building2, Truck, X, Droplets, Pipette, RotateCcw, XCircle, Plus, Pencil,
  Send, Printer, FileSignature, Mail, History, Hash
} from 'lucide-react';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

// Safe date formatting utility
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

/** Lab order placed-at (ordered_at) — date + time of order sent */
const formatOrderedAtDisplay = (isoString: string | undefined): string => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const datePart = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const timePart = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${datePart}, ${timePart}`;
  } catch {
    return '';
  }
};

const getLabResultFileUrl = (filePath?: string | null) => {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  const apiRoot = process.env.NEXT_PUBLIC_API_URL || '';
  const mediaBase = apiRoot.endsWith('/api') ? apiRoot.slice(0, -4) : apiRoot.endsWith('/api/v1') ? apiRoot.slice(0, -7) : apiRoot;
  if (filePath.startsWith('/media/')) return `${mediaBase}${filePath}`;
  return `${mediaBase}/media/${filePath.replace(/^\/+/, '')}`;
};

// Enhanced Test interface - each test is independent
interface LabTest {
  id: string;
  name: string;
  code: string;
  sampleType: 'Blood' | 'Urine' | 'Stool' | 'Sputum' | 'Swab' | 'CSF' | 'Serum' | 'Other';
  status: 'Pending' | 'Sample Collected' | 'Processing' | 'Results Ready' | 'Rejected' | 'Verified';
  processingMethod?: 'In-house' | 'Outsourced';
  outsourcedLab?: string;
  lab_number?: string;
  collectedBy?: string;
  collectedAt?: string;
  processedBy?: string;
  processedAt?: string;
  results?: Record<string, any>;
  resultAttachments?: Array<{ id: number; row_id: string; row_name: string; file: string; uploaded_at: string }>;
  templateNormalRange?: Record<string, any> | null;
  resultFile?: { name: string; type: string; uploadedAt: string };
  template?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  verificationNotes?: string;
  notes?: string;
}

interface LabOrder {
  id: string;
  orderId: string;
  lab_number?: string;  // One Lab ID per order (BT-YY-NNNN)
  patient: {
    id: string;
    name: string;
    age: number;
    gender: string;
    personal_number?: string;
    division?: string;
    photoUrl?: string;
    category?: string;
    employee_type?: string;
    nonnpa_type?: string;
    dependent_type?: string;
    phone?: string;
  };
  doctor: { id: string; name: string; specialty: string; };
  tests: LabTest[];
  priority: 'Routine' | 'Urgent' | 'STAT';
  orderedAt: string;
  clinic: string;
  clinicalNotes?: string;
  sourceType?: 'internal_emr' | 'external_manual';
  externalClinic?: { id: number; name: string; code?: string } | null;
  externalRequestingDoctorName?: string;
  manualRequestReference?: string;
  manualRequestFile?: string | null;
  icd10_diagnoses?: Array<{ code: string; name: string; type: string; notes?: string }>;
}

interface PrincipalInfo {
  personalNumber?: string;
}

type CustomResultRow = {
  id: string;
  name: string;
  value: string;
  unit: string;
  reference_range: string;
  notes: string;
};

const isOtherLabTest = (test?: Pick<LabTest, 'code' | 'name'> | null) => {
  const code = String(test?.code || '').trim().toUpperCase();
  const name = String(test?.name || '').toLowerCase();
  return code === 'OTHER' || code === 'OTHERS' || name.includes('others');
};

const makeCustomRowId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createCustomResultRow = (name = ''): CustomResultRow => ({
  id: makeCustomRowId(),
  name,
  value: '',
  unit: '',
  reference_range: '',
  notes: '',
});

const customResultNameTrimClass = `${'['}\\-:${String.fromCharCode(8226)}.\\s${']'}`;
const customResultNameTrimPattern = new RegExp(
  `^${customResultNameTrimClass}+|${customResultNameTrimClass}+$`,
  'g'
);

const parseCustomResultNames = (test?: Pick<LabTest, 'notes'> | null, order?: Pick<LabOrder, 'clinicalNotes'> | null) => {
  const source = order?.clinicalNotes || test?.notes || '';
  return source
    .replace(/\b(and|&)\b/gi, ',')
    .split(/[,;\n]+/)
    .map((part) => part.trim().replace(customResultNameTrimPattern, ''))
    .filter(Boolean);
};

// Helper function to transform backend order to frontend format
const transformOrder = (apiOrder: ApiLabOrder): LabOrder => {
  return {
    id: apiOrder.id.toString(),
    orderId: apiOrder.order_id,
    lab_number: (apiOrder as any).lab_number,
    patient: {
      id: apiOrder.patient.id?.toString() || '',
      name: apiOrder.patient.name || 'Unknown',
      age: apiOrder.patient.age || 0,
      gender: formatPatientGenderLabel(apiOrder.patient?.gender) || apiOrder.patient?.gender || 'Unknown',
      personal_number: (apiOrder.patient as any).personal_number || undefined,
      division: (apiOrder.patient as any).division || undefined,
      photoUrl: (apiOrder.patient as any).photo || undefined,
      category: (apiOrder.patient as any).category || undefined,
      employee_type: (apiOrder.patient as any).employee_type || undefined,
      nonnpa_type: (apiOrder.patient as any).nonnpa_type || undefined,
      dependent_type: (apiOrder.patient as any).dependent_type || undefined,
      phone: (apiOrder.patient as any).phone || undefined,
    },
    doctor: {
      id: apiOrder.doctor?.id?.toString() || '',
      name: apiOrder.doctor?.name || 'Unknown',
      specialty: apiOrder.doctor?.specialty || '',
    },
    tests: (apiOrder.tests || []).map((test: ApiLabTest) => transformTest(test)),
    priority: transformPriority(apiOrder.priority) as 'Routine' | 'Urgent' | 'STAT',
    orderedAt: apiOrder.ordered_at,
    clinic: apiOrder.clinic || '',
    sourceType: ((apiOrder as any).source_type || 'internal_emr') as 'internal_emr' | 'external_manual',
    externalClinic: (apiOrder as any).external_clinic_details || null,
    externalRequestingDoctorName: (apiOrder as any).external_requesting_doctor_name || '',
    manualRequestReference: (apiOrder as any).manual_request_reference || '',
    manualRequestFile: (apiOrder as any).manual_request_file || null,
    icd10_diagnoses: Array.isArray((apiOrder as any).icd10_diagnoses)
      ? (apiOrder as any).icd10_diagnoses
      : [],
    clinicalNotes: (() => {
      // Get clinical notes, avoiding duplication
      const notes = apiOrder.clinical_notes || '';
      // If notes contain repeated content, clean it up
      if (notes.includes('; ')) {
        const parts = notes.split('; ')
          .map(part => part.trim()) // Trim whitespace
          .filter(part => part.length > 0) // Remove empty parts
          .filter((part, index, arr) => arr.indexOf(part) === index); // Remove duplicates
        return parts.join('; ');
      }
      return notes;
    })(),
  };
};

// Helper function to transform backend test to frontend format
const transformTest = (apiTest: ApiLabTest): LabTest => {
  return {
    id: apiTest.id.toString(),
    name: apiTest.name,
    code: apiTest.code,
    sampleType: apiTest.sample_type as LabTest['sampleType'],
    status: transformLabTestStatus(apiTest.status) as LabTest['status'],
    processingMethod: apiTest.processing_method ? transformProcessingMethod(apiTest.processing_method) as 'In-house' | 'Outsourced' : undefined,
    outsourcedLab: apiTest.outsourced_lab,
    lab_number: apiTest.lab_number,
    collectedBy: apiTest.collected_by_name || apiTest.collected_by?.toString(),
    collectedAt: apiTest.collected_at,
    processedBy: apiTest.processed_by_name || apiTest.processed_by?.toString(),
    processedAt: apiTest.processed_at,
    results: apiTest.results as Record<string, string>,
    resultAttachments: (apiTest as any).result_attachments || [],
    templateNormalRange: (apiTest as any).template_normal_range || null,
    resultFile: apiTest.result_file ? {
      name: typeof apiTest.result_file === 'string' ? apiTest.result_file : apiTest.result_file.name || '',
      type: typeof apiTest.result_file === 'string' ? 'application/pdf' : apiTest.result_file.type || 'application/pdf',
      uploadedAt: typeof apiTest.result_file === 'string' ? '' : apiTest.result_file.uploaded_at || '',
    } : undefined,
    template: apiTest.template?.toString(),
    rejectedBy: apiTest.rejected_by_name || apiTest.rejected_by?.toString(),
    rejectedAt: apiTest.rejected_at,
    verificationNotes: apiTest.verification_notes,
    notes: apiTest.notes,
  };
};

// Collection methods by sample type
const collectionMethods: Record<string, { name: string; icon: string; description: string }[]> = {
  'Blood': [
    { name: 'Venipuncture', icon: '💉', description: 'Standard blood draw from vein' },
    { name: 'Finger Prick', icon: '👆', description: 'Capillary blood from fingertip' },
    { name: 'Heel Prick', icon: '🦶', description: 'For infants - capillary from heel' },
    { name: 'Arterial', icon: '🔴', description: 'Arterial blood gas collection' },
  ],
  'Serum': [
    { name: 'Venipuncture', icon: '💉', description: 'Standard blood draw from vein' },
    { name: 'Finger Prick', icon: '👆', description: 'Capillary blood from fingertip' },
    { name: 'Heel Prick', icon: '🦶', description: 'For infants - capillary from heel' },
  ],
  'Urine': [
    { name: 'Mid-stream Clean Catch', icon: '🧪', description: 'Standard urine collection' },
    { name: 'Catheter Collection', icon: '🏥', description: 'From urinary catheter' },
    { name: '24-hour Collection', icon: '⏰', description: 'Collect all urine over 24 hours' },
    { name: 'First Morning Void', icon: '🌅', description: 'First urine of the day' },
  ],
  'Stool': [
    { name: 'Fresh Sample', icon: '📦', description: 'Collect fresh stool sample' },
    { name: 'Preservative Container', icon: '🧴', description: 'With preservative medium' },
  ],
  'Sputum': [
    { name: 'Deep Cough', icon: '💨', description: 'Cough deeply to produce sample' },
    { name: 'Induced Sputum', icon: '💧', description: 'Using nebulized saline' },
  ],
  'Swab': [
    { name: 'Nasal Swab', icon: '👃', description: 'From nasal cavity' },
    { name: 'Throat Swab', icon: '👅', description: 'From back of throat' },
    { name: 'Wound Swab', icon: '🩹', description: 'From wound site' },
    { name: 'Ear Swab', icon: '👂', description: 'From ear canal' },
    { name: 'Vaginal Swab', icon: '🧫', description: 'From vaginal canal' },
    { name: 'Urinary Swab', icon: '🧫', description: 'From urinary tract' },
  ],
  'CSF': [
    { name: 'Lumbar Puncture', icon: '🔬', description: 'Spinal tap procedure' },
  ],
  'Other': [
    { name: 'Standard Collection', icon: '🧪', description: 'Use the standard protocol for this sample type' },
    { name: 'Per Clinical Notes', icon: '📝', description: 'Follow collection method specified in clinical notes' },
  ],
};

/** Select value for "type a different lab name" (not in catalog). */
const OUTSOURCED_LAB_OTHER = '__other__';

  const getCategoryDisplay = (patient: LabOrder['patient']) => {
    if (!patient?.category) return null;
    switch (patient.category) {
      case 'employee': return patient.employee_type ? 'Employee (' + patient.employee_type + ')' : 'Employee';
      case 'retiree': return 'Retiree';
      case 'nonnpa': return patient.nonnpa_type ? patient.nonnpa_type : 'Non-NPA';
      case 'dependent': return patient.dependent_type ? patient.dependent_type : 'Dependent';
      default: return patient.category;
    }
  };

export default function LabOrdersPage() {
  const serverToday = useServerToday();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  const [processingFilter, setProcessingFilter] = useState<'all' | 'in_house' | 'outsourced'>('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<'all' | 'internal_emr' | 'external_manual'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'lab_id' | 'date'>('priority');
  const [activeTab, setActiveTab] = useState<LabOrdersTab>('pending');
  const autoTabRef = useRef<string | null>(null);

  useLabUrlSync({
    search: searchQuery,
    tab: activeTab,
    defaultTab: 'pending',
    onSearchFromUrl: setSearchQuery,
    onTabFromUrl: (tab) => setActiveTab(tab as LabOrdersTab),
    isValidTab: isValidLabOrdersTab,
  });
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    pendingSamples: 0,
    processing: 0,
    resultsReady: 0,
    reworkOrders: 0,
  });

  // Dialog states
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null);
  const [selectedPrincipalInfo, setSelectedPrincipalInfo] = useState<PrincipalInfo | null>(null);
  const [selectedTest, setSelectedTest] = useState<LabTest | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCollectDialogOpen, setIsCollectDialogOpen] = useState(false);
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExternalOrderDialogOpen, setIsExternalOrderDialogOpen] = useState(false);

  // Form states
  const [selectedTestsForCollection, setSelectedTestsForCollection] = useState<string[]>([]);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [collectionNotes, setCollectionNotes] = useState('');
  const [processingMethod, setProcessingMethod] = useState<'In-house' | 'Outsourced'>('In-house');
  const [selectedOutsourcedLab, setSelectedOutsourcedLab] = useState('');
  const [customOutsourcedLab, setCustomOutsourcedLab] = useState('');
  const [labPartners, setLabPartners] = useState<LabPartner[]>([]);
  const [loadingLabPartners, setLoadingLabPartners] = useState(false);
  
  // Add Lab Partner dialog states
  const [isAddPartnerDialogOpen, setIsAddPartnerDialogOpen] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerCode, setNewPartnerCode] = useState('');
  const [newPartnerEmail, setNewPartnerEmail] = useState('');
  const [newPartnerPhone, setNewPartnerPhone] = useState('');
  const [newPartnerAddress, setNewPartnerAddress] = useState('');
  const [newPartnerContactTitle, setNewPartnerContactTitle] = useState('The Medical Director');
  const [isSubmittingPartner, setIsSubmittingPartner] = useState(false);

  // Manage Lab Partners dialog states
  const [isManagePartnersDialogOpen, setIsManagePartnersDialogOpen] = useState(false);
  const [deletingPartnerId, setDeletingPartnerId] = useState<number | null>(null);
  const [deleteConfirmPartnerId, setDeleteConfirmPartnerId] = useState<number | null>(null);
  const [deleteConfirmPartnerName, setDeleteConfirmPartnerName] = useState<string>('');

  // ----------------------------------------------------------------------
  // Send to External Lab — order-level outsourced dispatch
  // ----------------------------------------------------------------------
  // Two-stage dialog: stage 1 picks tests + partner + notes; stage 2 swaps
  // to a confirmation panel that prints the standardised Referral Letter
  // and Responsibility Form before the user clicks Done.
  const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false);
  const [dispatchSelectedTestIds, setDispatchSelectedTestIds] = useState<string[]>([]);
  const [dispatchPartnerId, setDispatchPartnerId] = useState<string>(''); // Select needs string
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isCreatingDispatch, setIsCreatingDispatch] = useState(false);

  // Stage 2 — confirmation panel for the dispatch we just issued (or are reprinting)
  const [confirmedDispatch, setConfirmedDispatch] = useState<LabReferralDispatch | null>(null);
  const [referralLetterPrinted, setReferralLetterPrinted] = useState(false);
  const [responsibilityFormPrinted, setResponsibilityFormPrinted] = useState(false);
  const [isPrintingReferral, setIsPrintingReferral] = useState(false);
  const [isPrintingResponsibility, setIsPrintingResponsibility] = useState(false);

  // Dispatch history shown inside the order detail dialog
  const [orderDispatches, setOrderDispatches] = useState<LabReferralDispatch[]>([]);
  const [loadingOrderDispatches, setLoadingOrderDispatches] = useState(false);
  const [cancellingDispatchId, setCancellingDispatchId] = useState<number | null>(null);

  // Done-without-printing nudge — shown when the user clicks Done in the
  // post-dispatch confirmation panel without opening either PDF.
  const [skipPrintConfirmOpen, setSkipPrintConfirmOpen] = useState(false);

  // Cancel-dispatch flow: which dispatch is being cancelled + the reason
  // typed into the AlertDialog. Replaces the old `window.prompt` so the user
  // gets a real Textarea and a clear explanation of side effects.
  const [cancelDispatchTarget, setCancelDispatchTarget] = useState<LabReferralDispatch | null>(null);
  const [cancelDispatchReason, setCancelDispatchReason] = useState('');
  
  const [resultEntryMode, setResultEntryMode] = useState<'values' | 'upload'>('values');
  const [resultValues, setResultValues] = useState<Record<string, string>>({});
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [customResultRows, setCustomResultRows] = useState<CustomResultRow[]>([]);
  const [customResultFiles, setCustomResultFiles] = useState<Record<string, File | null>>({});

  // Templates from API for result entry (params from Test Templates / normal_range)
  const [apiTemplatesByCode, setApiTemplatesByCode] = useState<Record<string, { name: string; fields: TemplateField[] }>>({});
  const [externalPatientSearch, setExternalPatientSearch] = useState('');
  const [externalPatientResults, setExternalPatientResults] = useState<Patient[]>([]);
  const [searchingExternalPatients, setSearchingExternalPatients] = useState(false);
  const [selectedExternalPatient, setSelectedExternalPatient] = useState<Patient | null>(null);
  const [externalClinics, setExternalClinics] = useState<Clinic[]>([]);
  const [externalClinicId, setExternalClinicId] = useState('');
  const [externalRequestingDoctorName, setExternalRequestingDoctorName] = useState('');
  const [externalManualReference, setExternalManualReference] = useState('');
  const [externalManualFile, setExternalManualFile] = useState<File | null>(null);
  const [externalClinicalNotes, setExternalClinicalNotes] = useState('');
  const [externalPriority, setExternalPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [externalTemplateSearch, setExternalTemplateSearch] = useState('');
  const [selectedExternalTemplateIds, setSelectedExternalTemplateIds] = useState<Set<number>>(new Set());
  const [isSubmittingExternalOrder, setIsSubmittingExternalOrder] = useState(false);
  const [loadingExternalTemplates, setLoadingExternalTemplates] = useState(false);
  const [labTemplates, setLabTemplates] = useState<Array<{ id: number; name: string; code: string; sample_type?: string }>>([]);

  const normalizeSampleTypeForCollection = (sampleType: string | undefined): string => {
    if (!sampleType) return 'Other';
    return collectionMethods[sampleType] ? sampleType : 'Other';
  };

  useEffect(() => {
    let cancelled = false;

    const loadPrincipalInfo = async () => {
      if (!selectedOrder || selectedOrder.patient.category !== 'dependent') {
        setSelectedPrincipalInfo(null);
        return;
      }

      try {
        const patientId = Number(selectedOrder.patient.id);
        if (!Number.isFinite(patientId)) {
          setSelectedPrincipalInfo(null);
          return;
        }

        const dependent = await patientService.getPatient(patientId);
        if (!dependent.principal_staff) {
          if (!cancelled) setSelectedPrincipalInfo(null);
          return;
        }

        const principal = await patientService.getPatient(dependent.principal_staff);
        if (!cancelled) {
          setSelectedPrincipalInfo({
            personalNumber: principal.personal_number?.trim() || undefined,
          });
        }
      } catch {
        if (!cancelled) setSelectedPrincipalInfo(null);
      }
    };

    void loadPrincipalInfo();

    return () => {
      cancelled = true;
    };
  }, [selectedOrder]);

  // Resolve a Test Template for result entry. The DB is the single source
  // of truth — there is no in-code catalog to fall back to. Sources, in
  // order of trust:
  //   1) `snapshot` — `template_normal_range` pinned on the test row at
  //                   order time. Audit-stable; always matches what the
  //                   doctor saw.
  //   2) `api`      — current `LabTemplate` rows from the DB
  //                   (`/laboratory/templates/`), edited under
  //                   Laboratory → Test Templates.
  //   3) `none`     — no template configured. The UI shows an explicit
  //                   "Add this template" warning and falls back to a
  //                   single free-text "Result Value" field so techs can
  //                   record something rather than be blocked.
  type TemplateSource = 'snapshot' | 'api' | 'none';
  type TemplateLookup = {
    template: { name: string; fields: TemplateField[] } | undefined;
    source: TemplateSource;
  };
  const resolveTemplateForTest = (test: LabTest): TemplateLookup => {
    const fromTest = buildEntryTemplate(test.code, test.templateNormalRange);
    if (fromTest) return { template: fromTest, source: 'snapshot' };
    const fromApi = apiTemplatesByCode[test.code];
    if (fromApi) return { template: fromApi, source: 'api' };
    return { template: undefined, source: 'none' };
  };
  // Backwards-compatible: callers that only need the template stay unchanged.
  const getTemplateForTest = (test: LabTest): { name: string; fields: TemplateField[] } | undefined =>
    resolveTemplateForTest(test).template;

  // Calculate order progress percentage
  const getOrderProgress = (tests: LabTest[]) => {
    if (!tests || tests.length === 0) return 0;

    const statusWeights: Record<string, number> = {
      [LAB_TEST_STATUS.PENDING]: 0,
      [LAB_TEST_STATUS.SAMPLE_COLLECTED]: 25,
      [LAB_TEST_STATUS.PROCESSING]: 50,
      [LAB_TEST_STATUS.RESULTS_READY]: 90,
      [LAB_TEST_STATUS.VERIFIED]: 100,
      // Rejected requires correction/resubmission, so it is not terminal completion.
      [LAB_TEST_STATUS.REJECTED]: 70
    };

    const total = tests.reduce((sum, t) => {
      const weight = statusWeights[t.status] || 0;
      return sum + weight;
    }, 0);

    return Math.round(total / tests.length);
  };

  // Get progress display text and value
  const getOrderProgressDisplay = (tests: LabTest[]) => {
    if (!tests || tests.length === 0) return { text: 'No tests', value: 0 };

    const allPending = tests.every(test => test.status === LAB_TEST_STATUS.PENDING);
    const allRejected = tests.every(test => test.status === LAB_TEST_STATUS.REJECTED);
    const allVerified = tests.every(test => test.status === LAB_TEST_STATUS.VERIFIED);

    if (allPending) {
      return { text: 'Not Started', value: 0 };
    } else if (allRejected) {
      return { text: LAB_ORDER_STATUS.REWORK_REQUIRED, value: getOrderProgress(tests) };
    } else if (allVerified) {
      return { text: LAB_ORDER_STATUS.COMPLETED, value: 100 };
    } else {
      const progress = getOrderProgress(tests);
      return { text: `${progress}%`, value: progress };
    }
  };

  // Get status explanations and tooltips
  const getStatusExplanation = (status: string) => {
    const explanations = {
      [LAB_TEST_STATUS.PENDING]: 'Test order created, waiting for sample collection',
      [LAB_TEST_STATUS.SAMPLE_COLLECTED]: 'Sample has been collected and is ready for processing',
      [LAB_TEST_STATUS.PROCESSING]: 'Test is being processed in the laboratory',
      [LAB_TEST_STATUS.RESULTS_READY]: 'Test results are available and ready for verification',
      [LAB_TEST_STATUS.VERIFIED]: 'Results have been verified by a pathologist and are final',
      [LAB_TEST_STATUS.REJECTED]: 'Test was rejected and requires correction and resubmission'
    };
    return explanations[status as keyof typeof explanations] || 'Unknown status';
  };

  const getOrderStatusExplanation = (tests: LabTest[]) => {
    if (!tests || tests.length === 0) return 'No tests in this order';

    const statusCounts = tests.reduce((acc, test) => {
      acc[test.status] = (acc[test.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const statusOrder = [
      LAB_TEST_STATUS.PENDING,
      LAB_TEST_STATUS.SAMPLE_COLLECTED,
      LAB_TEST_STATUS.PROCESSING,
      LAB_TEST_STATUS.RESULTS_READY,
      LAB_TEST_STATUS.VERIFIED,
      LAB_TEST_STATUS.REJECTED,
    ];
    const currentStatus = statusOrder.find(status => statusCounts[status]) || 'Unknown';

    if (tests.length === 1) {
      return getStatusExplanation(currentStatus);
    }

    const explanations = Object.entries(statusCounts)
      .map(([status, count]) => `${count} ${status.toLowerCase()}`)
      .join(', ');

    return `Order contains ${explanations}`;
  };

  // Get overall order status
  const getOrderStatus = (tests: LabTest[]) => {
    // Completed = all tests verified (final)
    if (tests.length > 0 && tests.every(t => t.status === LAB_TEST_STATUS.VERIFIED)) return LAB_ORDER_STATUS.COMPLETED;
    if (tests.some(t => t.status === LAB_TEST_STATUS.REJECTED)) return LAB_ORDER_STATUS.REWORK_REQUIRED;
    if (tests.every(t => t.status === LAB_TEST_STATUS.RESULTS_READY || t.status === LAB_TEST_STATUS.VERIFIED)) return LAB_ORDER_STATUS.RESULTS_READY;
    if (tests.some(t => t.status === LAB_TEST_STATUS.PROCESSING)) return LAB_ORDER_STATUS.PROCESSING;
    if (tests.some(t => t.status === LAB_TEST_STATUS.SAMPLE_COLLECTED)) return LAB_ORDER_STATUS.IN_PROGRESS;
    return LAB_ORDER_STATUS.PENDING;
  };

  // Helper functions for filtering
  const normalizeGender = (value: unknown): string => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'm') return 'male';
    if (v === 'f') return 'female';
    return v;
  };

  const matchesDateFilter = (isoDate: string | undefined, filter: string): boolean => {
    if (filter === 'all') return true;
    if (!isoDate) return false;
    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return false;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    if (filter === 'today') {
      return dt >= todayStart && dt < tomorrowStart;
    }

    if (filter === 'week') {
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - 6);
      return dt >= weekStart && dt < tomorrowStart;
    }

    if (filter === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return dt >= monthStart && dt < tomorrowStart;
    }

    return true;
  };

  const matchesCustomDateRange = (isoDate: string | undefined): boolean => {
    if (!dateRange.from && !dateRange.to) return true;
    if (!isoDate) return false;

    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return false;

    if (dateRange.from) {
      const from = new Date(`${dateRange.from}T00:00:00`);
      if (dt < from) return false;
    }

    if (dateRange.to) {
      const to = new Date(`${dateRange.to}T23:59:59.999`);
      if (dt > to) return false;
    }

    return true;
  };

  // Base scope filtering (date / gender / processing), shared by stats and tab counts.
  const scopedOrders = useMemo(() => {
    return orders.filter(order => {
      // Date filter
      if (!matchesDateFilter(order.orderedAt, dateFilter) || !matchesCustomDateRange(order.orderedAt)) {
        return false;
      }

      // Gender filter
      if (genderFilter !== 'all') {
        const orderGender = normalizeGender(order.patient?.gender);
        if (orderGender !== genderFilter) {
          return false;
        }
      }

      // Processing (in-house / outsourced) — also applied server-side; narrow current page if needed
      if (processingFilter !== 'all') {
        const hasMatch = order.tests.some((t) => {
          const m = t.processingMethod === 'In-house' ? 'in_house' : t.processingMethod === 'Outsourced' ? 'outsourced' : '';
          return m === processingFilter;
        });
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [orders, dateFilter, genderFilter, processingFilter, dateRange.from, dateRange.to]);

  // Client-side tab filtering for scoped current page data.
  const filteredOrders = useMemo(() => {
    if (activeTab === 'pending') return scopedOrders.filter(order => order.tests.some(t => t.status === LAB_TEST_STATUS.PENDING));
    if (activeTab === 'processing') return scopedOrders.filter(order => order.tests.some(t => t.status === LAB_TEST_STATUS.SAMPLE_COLLECTED || t.status === LAB_TEST_STATUS.PROCESSING));
    if (activeTab === 'results') return scopedOrders.filter(order => order.tests.some(t => t.status === LAB_TEST_STATUS.RESULTS_READY));
    if (activeTab === 'rejected') return scopedOrders.filter(order => order.tests.some(t => t.status === LAB_TEST_STATUS.REJECTED));
    return scopedOrders;
  }, [scopedOrders, activeTab]);

  // With server-side pagination, orders array contains only current page results
  const paginatedOrders = filteredOrders;

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, priorityFilter, dateFilter, genderFilter, processingFilter, sourceTypeFilter, activeTab, itemsPerPage, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // Load orders function - memoized to prevent infinite loops
  const loadOrders = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const params: any = {
        page: currentPage,
        page_size: itemsPerPage,
      };
      if (priorityFilter !== 'all') {
        params.priority = transformToBackendPriority(priorityFilter);
      }
      const searching = Boolean(debouncedSearchQuery.trim());
      if (searching) {
        params.search = debouncedSearchQuery.trim();
      }
      if (processingFilter !== 'all') {
        params.processing_method = processingFilter;
      }
      if (sourceTypeFilter !== 'all') {
        (params as any).source_type = sourceTypeFilter;
      }
      if (!searching) {
        Object.assign(params, buildDateQuery(dateFilter, serverToday));
        if (dateRange.from || dateRange.to) {
          delete params.date;
          if (dateRange.from) params.start_date = dateRange.from;
          if (dateRange.to) params.end_date = dateRange.to;
        }
      }

      // On the Rework Required tab, filter the list by rejection date rather
      // than order date — users expect "Today" on this tab to mean items
      // rejected today, not items originally ordered today.
      if (activeTab === 'rejected') {
        params.date_field = 'rejected_at';
      }

      if (genderFilter !== 'all') {
        params.gender = genderFilter;
      }

      const [response, statsResponse] = await Promise.all([
        labService.getOrders(params),
        labService.getOrderStats({
          priority: priorityFilter !== 'all' ? transformToBackendPriority(priorityFilter) : undefined,
          search: searching ? debouncedSearchQuery.trim() : undefined,
          processing_method: processingFilter !== 'all' ? processingFilter : undefined,
          source_type: sourceTypeFilter !== 'all' ? sourceTypeFilter : undefined,
          gender: genderFilter !== 'all' ? genderFilter : undefined,
          ...(searching
            ? {}
            : {
                ...buildDateQuery(dateFilter, serverToday),
                ...(dateRange.from || dateRange.to
                  ? { start_date: dateRange.from || undefined, end_date: dateRange.to || undefined }
                  : {}),
              }),
        }),
      ]);

      setTotalCount(response.count || response.results.length);
      const transformedOrders = response.results.map(transformOrder);
      setOrders(transformedOrders);
      setStats({
        pendingSamples: statsResponse.pending || 0,
        processing: statsResponse.processing || 0,
        resultsReady: statsResponse.results_ready || 0,
        reworkOrders: statsResponse.rework_required || 0,
      });
    } catch (err: any) {
      let errorMessage = 'Unable to load lab orders. Please check your connection and try again.';
      let toastMessage = errorMessage;

      if (err.name === 'NetworkError') {
        errorMessage = 'Cannot connect to the laboratory system. Please ensure the server is running and try again.';
        toastMessage = 'Connection failed. Please check your internet connection.';
      } else if (err.message) {
        if (err.message.includes('401') || err.message.includes('Authentication')) {
          errorMessage = 'Your session has expired. Please log in again.';
          toastMessage = 'Session expired. Please refresh the page.';
        } else if (err.message.includes('403') || err.message.includes('permission')) {
          errorMessage = 'You do not have permission to view lab orders.';
          toastMessage = 'Access denied. Please contact your administrator.';
        } else if (err.message.includes('500') || err.message.includes('server')) {
          errorMessage = 'The laboratory system encountered an error. Please try again later.';
          toastMessage = 'Server error. Please try again in a few moments.';
        } else if (err.message.includes('timeout')) {
          errorMessage = 'The request timed out. Please check your connection and try again.';
          toastMessage = 'Request timed out. Please try again.';
        } else {
          errorMessage = `Failed to load lab orders: ${err.message}`;
          toastMessage = 'Failed to load orders. Please try again.';
        }
      }

      if (!silent) {
        setError(errorMessage);
        toast.error(toastMessage);
      }
      console.error('Error loading orders:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentPage, itemsPerPage, priorityFilter, debouncedSearchQuery, processingFilter, sourceTypeFilter, genderFilter, dateFilter, dateRange.from, dateRange.to, serverToday, activeTab]);

  // Load orders from API when page or filters change
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // When searching, switch to the tab that actually contains matches.
  useEffect(() => {
    const q = debouncedSearchQuery.trim();
    if (!q || loading || orders.length === 0) {
      autoTabRef.current = null;
      return;
    }
    if (orders.some((o) => orderMatchesLabOrdersTab(o, activeTab))) return;
    const next = findLabOrdersTabForOrders(orders);
    if (next && next !== activeTab) {
      const key = `${q}:${next}`;
      if (autoTabRef.current !== key) {
        autoTabRef.current = key;
        setActiveTab(next);
        toast.info(`Found in ${LAB_ORDERS_TAB_LABELS[next]} — switched tab.`);
      }
    }
  }, [debouncedSearchQuery, orders, activeTab, loading]);

  const pollingPaused = useMemo(
    () =>
      isDateFilterDialogOpen ||
      isViewDialogOpen ||
      isCollectDialogOpen ||
      isProcessDialogOpen ||
      isResultsDialogOpen ||
      isExternalOrderDialogOpen,
    [
      isDateFilterDialogOpen,
      isViewDialogOpen,
      isCollectDialogOpen,
      isProcessDialogOpen,
      isResultsDialogOpen,
      isExternalOrderDialogOpen,
    ]
  );

  useEffect(() => {
    if (pollingPaused) return;
    const id = setInterval(() => {
      void loadOrders({ silent: true });
    }, 15000);
    return () => clearInterval(id);
  }, [loadOrders, pollingPaused]);

  // Load Test Templates from API for result entry (so FBC, etc. use template parameters)
  const loadTemplatesForResults = useCallback(async () => {
    try {
      const { results } = await labService.getTemplates({ page_size: 200 });
      const next: Record<string, { name: string; fields: TemplateField[] }> = {};
      for (const t of results) {
        const tpl = buildEntryTemplate(t.code, (t as any).normal_range);
        if (tpl) next[t.code] = { name: t.name, fields: tpl.fields };
      }
      setApiTemplatesByCode(prev => ({ ...prev, ...next }));
    } catch (e) {
      // Templates from /laboratory/templates are the canonical source for
      // result-entry parameters. If this load fails, the result-entry UI
      // still renders using `template_normal_range` snapshots pinned on the
      // test rows at order time. Tests without a snapshot fall back to a
      // free-text Result Value field with a "no template configured" warning.
      console.warn('Could not load lab templates for result entry:', e);
    }
  }, []);

  const loadTemplatesForExternalOrders = useCallback(async () => {
    try {
      const response = await labService.getTemplates({ page_size: 200, is_active: true });
      setLabTemplates((response.results || []).map((t) => ({
        id: Number(t.id),
        name: t.name,
        code: t.code,
        sample_type: t.sample_type,
      })));
    } catch {
      setLabTemplates([]);
    }
  }, []);
  useEffect(() => { loadTemplatesForResults(); }, [loadTemplatesForResults]);

  useEffect(() => {
    if (!isExternalOrderDialogOpen) return;
    void (async () => {
      if (labTemplates.length === 0) setLoadingExternalTemplates(true);
      try {
        await Promise.all([
          labTemplates.length === 0 ? loadTemplatesForExternalOrders() : Promise.resolve(),
          (async () => {
            try {
              const res = await adminService.getClinics({ is_active: true, page_size: 200 });
              setExternalClinics(res.results || []);
            } catch {
              setExternalClinics([]);
            }
          })(),
        ]);
      } finally {
        setLoadingExternalTemplates(false);
      }
    })();
  }, [isExternalOrderDialogOpen, labTemplates.length, loadTemplatesForExternalOrders]);

  useEffect(() => {
    if (!isExternalOrderDialogOpen) return;
    const q = externalPatientSearch.trim();
    if (q.length < 2) {
      setExternalPatientResults([]);
      setSearchingExternalPatients(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearchingExternalPatients(true);
      try {
        const res = await patientService.getPatients({ search: q, page_size: 10 });
        if (!cancelled) setExternalPatientResults(res.results || []);
      } catch {
        if (!cancelled) setExternalPatientResults([]);
      } finally {
        if (!cancelled) setSearchingExternalPatients(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isExternalOrderDialogOpen, externalPatientSearch]);

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'STAT': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Urgent': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
    }
  };

  const getTestStatusBadge = (status: string) => {
    switch (status) {
      case LAB_TEST_STATUS.PENDING: return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/50';
      case LAB_TEST_STATUS.SAMPLE_COLLECTED: return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/50';
      case LAB_TEST_STATUS.PROCESSING: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
      case LAB_TEST_STATUS.RESULTS_READY: return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      case LAB_TEST_STATUS.REJECTED: return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case LAB_TEST_STATUS.VERIFIED: return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
      default: return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/50';
    }
  };

  const getSampleTypeBadge = (sampleType: string) => {
    switch (sampleType) {
      case 'Blood': return 'bg-rose-500/10 text-rose-600 border-rose-500/30';
      case 'Urine': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      case 'Stool': return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'Sputum': return 'bg-teal-500/10 text-teal-600 border-teal-500/30';
      case 'Swab': return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/30';
    }
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case LAB_ORDER_STATUS.PENDING: return 'bg-gray-500/10 text-gray-600 border-gray-500/50';
      case LAB_ORDER_STATUS.IN_PROGRESS: return 'bg-blue-500/10 text-blue-600 border-blue-500/50';
      case LAB_ORDER_STATUS.PROCESSING: return 'bg-violet-500/10 text-violet-600 border-violet-500/50';
      case LAB_ORDER_STATUS.RESULTS_READY: return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/50';
      case LAB_ORDER_STATUS.REWORK_REQUIRED: return 'bg-rose-500/10 text-rose-600 border-rose-500/50';
      case LAB_ORDER_STATUS.COMPLETED: return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/50';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/50';
    }
  };

  // Collect samples for selected tests (single or multiple)
  const handleCollectSample = async () => {
    if (!selectedOrder || selectedTestsForCollection.length === 0) {
      toast.error('Please select at least one test');
      return;
    }
    if (!selectedMethod) {
      toast.error('Please select a collection method');
      return;
    }
    setIsSubmitting(true);

    try {
      // Collect all samples at once (assigns sequential lab numbers)
      await labService.collectSamples(
          parseInt(selectedOrder.id),
        selectedTestsForCollection.map(id => parseInt(id)),
          selectedMethod,
          collectionNotes
        );

      const count = selectedTestsForCollection.length;
      toast.success(`${count} sample${count > 1 ? 's' : ''} collected via ${selectedMethod} with shared Lab ID`);
      
      await Promise.all([
        loadOrders(),
        (async () => {
          if (isViewDialogOpen) {
            const updatedOrder = await labService.getOrder(parseInt(selectedOrder.id));
            setSelectedOrder(transformOrder(updatedOrder));
          }
        })(),
      ]);

      setIsCollectDialogOpen(false);
      setSelectedTestsForCollection([]);
      setSelectedMethod('');
      setCollectionNotes('');
    } catch (err: any) {
      let errorMessage = 'Failed to collect samples. Please try again.';
      if (err.message) {
        if (err.message.includes('already collected')) {
          errorMessage = 'Sample has already been collected.';
        } else if (err.message.includes('permission') || err.message.includes('403')) {
          errorMessage = 'You do not have permission to collect samples.';
        } else if (err.message.includes('not found')) {
          errorMessage = 'Sample not found. Please refresh and try again.';
        } else {
          errorMessage = `Failed to collect samples: ${err.message}`;
        }
      }
      toast.error(errorMessage);
      console.error('Error collecting samples:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Start in-house processing for a single test. Outsourcing is handled
   * separately by the order-level "Send to External Lab" dispatch flow,
   * so this handler always sends `in_house` to the backend.
   */
  const handleStartProcessing = async () => {
    if (!selectedOrder || !selectedTest) return;
    setIsSubmitting(true);

    try {
      await labService.processTest(
        parseInt(selectedOrder.id),
        parseInt(selectedTest.id),
        'in_house'
      );

      toast.success(`${selectedTest.name} sent for in-house processing`);

      await Promise.all([
        loadOrders(),
        (async () => {
          if (isViewDialogOpen) {
            const updatedOrder = await labService.getOrder(parseInt(selectedOrder.id));
            setSelectedOrder(transformOrder(updatedOrder));
          }
        })(),
      ]);

      setIsProcessDialogOpen(false);
    } catch (err: any) {
      let errorMessage = 'Failed to start processing. Please try again.';
      if (err.message) {
        if (err.message.includes('already processing')) {
          errorMessage = 'Sample is already being processed.';
        } else if (err.message.includes('not collected')) {
          errorMessage = 'Sample must be collected before processing can begin.';
        } else if (err.message.includes('permission') || err.message.includes('403')) {
          errorMessage = 'You do not have permission to process samples.';
        } else {
          errorMessage = `Failed to start processing: ${err.message}`;
        }
      }
      toast.error(errorMessage);
      console.error('Error starting processing:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------------------------
  // Send to External Lab — dispatch flow
  // ----------------------------------------------------------------------

  /** Tests that are eligible to be sent out to a partner: collected but not
   *  yet processed/rejected/verified, and not already on an issued dispatch. */
  const dispatchEligibleTests = useMemo(() => {
    if (!selectedOrder) return [] as LabTest[];
    const onActiveDispatch = new Set<number>();
    for (const d of orderDispatches) {
      if (d.status !== 'issued') continue;
      for (const t of d.tests) onActiveDispatch.add(t.id);
    }
    return selectedOrder.tests.filter(
      (t) =>
        t.status === LAB_TEST_STATUS.SAMPLE_COLLECTED &&
        !onActiveDispatch.has(parseInt(t.id))
    );
  }, [selectedOrder, orderDispatches]);

  const loadOrderDispatches = useCallback(async (orderId: number) => {
    setLoadingOrderDispatches(true);
    try {
      const dispatches = await labService.getOrderDispatches(orderId);
      setOrderDispatches(dispatches);
    } catch (e: any) {
      console.error('getOrderDispatches failed', e);
      // 404 likely means migrations haven't run yet — keep the rest of the page usable.
      if (e?.status !== 404) {
        toast.error(e?.message || 'Could not load dispatch history');
      }
      setOrderDispatches([]);
    } finally {
      setLoadingOrderDispatches(false);
    }
  }, []);

  /**
   * Open the order-level dispatch dialog. By default every eligible test is
   * pre-selected (typical "send the whole batch" flow). Pass a `prefocusTestId`
   * when arriving from the per-test Process dialog so we only pre-select that
   * one test — the user can still tick others to batch them in.
   */
  const openDispatchDialog = async (prefocusTestId?: string) => {
    if (!selectedOrder) return;
    setIsDispatchDialogOpen(true);
    setConfirmedDispatch(null);
    setReferralLetterPrinted(false);
    setResponsibilityFormPrinted(false);
    setDispatchSelectedTestIds(
      prefocusTestId
        ? [prefocusTestId]
        : dispatchEligibleTests.map((t) => t.id)
    );
    setDispatchPartnerId('');
    setDispatchNotes('');
    if (labPartners.length === 0) await loadLabPartners();
  };

  /**
   * Bridge from the per-test Process dialog when the user picks "Outsourced".
   * Closes the per-test dialog and opens the order-level dispatch dialog with
   * the clicked test pre-selected.
   */
  const handleContinueToDispatch = () => {
    if (!selectedTest) return;
    const testId = selectedTest.id;
    setIsProcessDialogOpen(false);
    // Defer so the close animation completes before the next dialog mounts.
    setTimeout(() => openDispatchDialog(testId), 50);
  };

  const toggleDispatchTest = (testId: string) => {
    setDispatchSelectedTestIds((prev) =>
      prev.includes(testId) ? prev.filter((x) => x !== testId) : [...prev, testId]
    );
  };

  const handleCreateDispatch = async () => {
    if (!selectedOrder) return;
    if (dispatchSelectedTestIds.length === 0) {
      toast.error('Pick at least one test to send out');
      return;
    }
    if (!dispatchPartnerId) {
      toast.error('Choose the lab partner this batch is going to');
      return;
    }

    setIsCreatingDispatch(true);
    try {
      const dispatch = await labService.dispatchOutsourced(parseInt(selectedOrder.id), {
        partner_id: parseInt(dispatchPartnerId),
        test_ids: dispatchSelectedTestIds.map((id) => parseInt(id)),
        notes: dispatchNotes.trim() || undefined,
      });

      toast.success(`Dispatch ${dispatch.dispatch_id} issued to ${dispatch.partner_name}`);

      setConfirmedDispatch(dispatch);
      setReferralLetterPrinted(false);
      setResponsibilityFormPrinted(false);

      // Refresh order + dispatch history so the order detail UI mirrors the new state.
      await Promise.all([
        loadOrders(),
        (async () => {
          const updatedOrder = await labService.getOrder(parseInt(selectedOrder.id));
          setSelectedOrder(transformOrder(updatedOrder));
        })(),
        loadOrderDispatches(parseInt(selectedOrder.id)),
      ]);
    } catch (err: any) {
      console.error('dispatchOutsourced failed', err);
      const msg = err?.apiMessage || err?.message || 'Failed to create dispatch';
      toast.error(msg);
    } finally {
      setIsCreatingDispatch(false);
    }
  };

  /**
   * Open a dispatch PDF in a new tab (same blob → object URL pattern used
   * for the Lab Report download). The backend stamps the printed-at field
   * each time the URL is hit, so reprinting just refreshes that timestamp.
   */
  const openDispatchPdf = async (
    kind: 'referral' | 'responsibility',
    dispatch: LabReferralDispatch
  ) => {
    if (!selectedOrder) return;

    const setBusy = kind === 'referral' ? setIsPrintingReferral : setIsPrintingResponsibility;
    setBusy(true);
    let objectUrl: string | null = null;
    try {
      const blob =
        kind === 'referral'
          ? await labService.fetchReferralLetterPdf(parseInt(selectedOrder.id), dispatch.id)
          : await labService.fetchResponsibilityFormPdf(parseInt(selectedOrder.id), dispatch.id);
      objectUrl = URL.createObjectURL(blob);

      const win = window.open(objectUrl, '_blank');
      if (!win) {
        toast.error('Pop-ups blocked. Allow pop-ups to view the PDF.');
        return;
      }

      if (kind === 'referral') setReferralLetterPrinted(true);
      else setResponsibilityFormPrinted(true);

      // Refresh history so the printed-at timestamp shows up in the table.
      await loadOrderDispatches(parseInt(selectedOrder.id));
    } catch (err: any) {
      console.error('openDispatchPdf failed', err);
      toast.error(err?.apiMessage || err?.message || 'Failed to open PDF');
    } finally {
      setBusy(false);
      // Keep the object URL alive for ~1 minute so the new tab can render
      // it before we revoke. Browsers usually cache the blob anyway.
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
    }
  };

  /** Close the dispatch dialog. If neither doc was opened, route through the
   *  AlertDialog nudge instead of dismissing immediately. */
  const handleDoneDispatch = () => {
    if (!confirmedDispatch) {
      setIsDispatchDialogOpen(false);
      return;
    }
    if (!referralLetterPrinted && !responsibilityFormPrinted) {
      setSkipPrintConfirmOpen(true);
      return;
    }
    setIsDispatchDialogOpen(false);
    setConfirmedDispatch(null);
  };

  /** Confirmed close from the "Done without printing" AlertDialog. */
  const confirmDoneSkipPrint = () => {
    setSkipPrintConfirmOpen(false);
    setIsDispatchDialogOpen(false);
    setConfirmedDispatch(null);
  };

  /** Open the AlertDialog that confirms cancellation of a dispatch and
   *  collects an optional reason. The actual cancel call lives in
   *  `confirmCancelDispatch` so the AlertDialog can remain a pure UI shell. */
  const handleCancelDispatch = (dispatch: LabReferralDispatch) => {
    setCancelDispatchTarget(dispatch);
    setCancelDispatchReason('');
  };

  const confirmCancelDispatch = async () => {
    if (!selectedOrder || !cancelDispatchTarget) return;
    const dispatch = cancelDispatchTarget;
    setCancellingDispatchId(dispatch.id);
    try {
      await labService.cancelDispatch(
        parseInt(selectedOrder.id),
        dispatch.id,
        cancelDispatchReason.trim() || undefined,
      );
      toast.success(`Dispatch ${dispatch.dispatch_id} cancelled`);
      await Promise.all([
        loadOrders(),
        (async () => {
          const updatedOrder = await labService.getOrder(parseInt(selectedOrder.id));
          setSelectedOrder(transformOrder(updatedOrder));
        })(),
        loadOrderDispatches(parseInt(selectedOrder.id)),
      ]);
      setCancelDispatchTarget(null);
      setCancelDispatchReason('');
    } catch (err: any) {
      console.error('cancelDispatch failed', err);
      toast.error(err?.apiMessage || err?.message || 'Failed to cancel dispatch');
    } finally {
      setCancellingDispatchId(null);
    }
  };

  /** Reopen the post-dispatch print panel for an existing dispatch (used by
   *  the Dispatches history). Lets the user reprint paperwork without
   *  creating a new dispatch. */
  const openExistingDispatchPanel = (dispatch: LabReferralDispatch) => {
    setConfirmedDispatch(dispatch);
    setReferralLetterPrinted(!!dispatch.referral_letter_printed_at);
    setResponsibilityFormPrinted(!!dispatch.responsibility_form_printed_at);
    setIsDispatchDialogOpen(true);
  };

  // Submit results for a single test
  const handleSubmitResults = async () => {
    if (!selectedOrder || !selectedTest) return;
    
    if (resultEntryMode === 'values') {
      if (isOtherLabTest(selectedTest)) {
        const validRows = customResultRows.filter((row) =>
          [row.name, row.value, row.unit, row.reference_range, row.notes].some((value) => String(value || '').trim())
        );
        if (validRows.length === 0) {
          toast.error('Add at least one custom result row or upload a result file');
          return;
        }
        const missingNames = validRows.filter((row) => !row.name.trim());
        if (missingNames.length > 0) {
          toast.error('Each custom result row needs an investigation name');
          return;
        }
      } else {
        const template = getTemplateForTest(selectedTest);
        if (template) {
          const allFieldsFilled = template.fields.every(f => resultValues[f.name]);
          if (!allFieldsFilled) {
            toast.error('Please fill in all result fields');
            return;
          }

          // Critical values come from the template (critical_min/critical_max seeded in
          // seed_lab_templates.py). Any analyte whose typed value trips that tier warrants
          // an explicit confirmation before submission.
          const criticalValues = template.fields.filter(
            (field) => classifyValue(resultValues[field.name], field) === 'Critical'
          );

          if (criticalValues.length > 0) {
            const confirmed = window.confirm(
              `Warning: This result contains ${criticalValues.length} critical ${criticalValues.length === 1 ? 'value' : 'values'} that may indicate a life-threatening condition.\n\n` +
              criticalValues.map(field => `${field.name}: ${resultValues[field.name]} ${field.unit}`).join('\n') +
              '\n\nAre you sure you want to submit these results?'
            );
            if (!confirmed) return;
          }
        } else {
          const hasValue = Object.values(resultValues).some((v) => String(v ?? "").trim() !== "");
          if (!hasValue) {
            toast.error("Enter a result value or switch to file upload");
            return;
          }
        }
      }
    } else if (uploadedFiles.length === 0) {
      toast.error('Please upload at least one result file');
      return;
    }

    setIsSubmitting(true);

    try {
      await labService.submitResults(
        parseInt(selectedOrder.id),
        parseInt(selectedTest.id),
        resultEntryMode === 'values'
          ? isOtherLabTest(selectedTest)
            ? {
                custom_results: customResultRows.filter((row) =>
                  [row.name, row.value, row.unit, row.reference_range, row.notes].some((value) => String(value || '').trim())
                ),
              }
            : resultValues
          : {},
        resultEntryMode === 'upload' ? uploadedFiles : (uploadedFiles.length > 0 ? uploadedFiles : undefined),
        undefined,
        isOtherLabTest(selectedTest) && resultEntryMode === 'values' ? customResultFiles : undefined
      );

      toast.success(`Results submitted for ${selectedTest.name}. Awaiting verification.`);
      
      await Promise.all([
        loadOrders(),
        (async () => {
          if (isViewDialogOpen) {
            const updatedOrder = await labService.getOrder(parseInt(selectedOrder.id));
            setSelectedOrder(transformOrder(updatedOrder));
          }
        })(),
      ]);

      setIsResultsDialogOpen(false);
      setResultValues({});
      setUploadedFiles([]);
      setCustomResultRows([]);
      setCustomResultFiles({});
      setResultEntryMode('values');
    } catch (err: any) {
      let errorMessage = 'Failed to submit results. Please try again.';
      if (err.message) {
        if (err.message.includes('validation') || err.message.includes('invalid')) {
          errorMessage = 'Please check your results and ensure all required fields are filled correctly.';
        } else if (err.message.includes('already submitted')) {
          errorMessage = 'Results have already been submitted for this test.';
        } else if (err.message.includes('permission') || err.message.includes('403')) {
          errorMessage = 'You do not have permission to submit results.';
        } else if (err.message.includes('critical') || err.message.includes('abnormal')) {
          errorMessage = 'Critical values detected. Please confirm before submitting.';
        } else {
          errorMessage = `Failed to submit results: ${err.message}`;
        }
      }
      toast.error(errorMessage);
      console.error('Error submitting results:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openViewDialog = (order: LabOrder) => {
    setSelectedOrder(order);
    setIsViewDialogOpen(true);
    setOrderDispatches([]);
    // Fire-and-forget — failures are toasted by loadOrderDispatches itself.
    void loadOrderDispatches(parseInt(order.id));
  };
  
  const openCollectDialog = (test: LabTest) => {
    setSelectedTest(test);
    // Pre-select the clicked test
    setSelectedTestsForCollection([test.id]);
    // Pre-select Venipuncture for blood samples
    setSelectedMethod(test.sampleType === 'Blood' ? 'Venipuncture' : '');
    setCollectionNotes('');
    // Lab ID is assigned only on Collect (one per order); reuse if order already has one
    setIsCollectDialogOpen(true);
  };
  
  /** Fetch the active lab-partner list. Used by the per-test process dialog,
   *  the order-level dispatch dialog, and the manage-partners modal. */
  const loadLabPartners = useCallback(async (): Promise<LabPartner[]> => {
    setLoadingLabPartners(true);
    try {
      const res = await labService.getLabPartners({ page_size: 200 });
      const partners = res.results || [];
      setLabPartners(partners);
      return partners;
    } catch (e: any) {
      console.error('getLabPartners failed', e?.status, e?.body, e);
      const hint =
        e?.status === 404
          ? 'Lab partners API not found. Restart the backend after deploy, then run migrations.'
          : e?.apiMessage || e?.message || 'Request failed';
      toast.error(`Could not load lab partners (${hint}). Use “Other” to type a name.`);
      setLabPartners([]);
      return [];
    } finally {
      setLoadingLabPartners(false);
    }
  }, []);

  const openProcessDialog = async (test: LabTest) => {
    setSelectedTest(test);
    // Per-test "Start Processing" is in-house only now. Outsourced batches
    // go through the order-level Send to External Lab dialog.
    setProcessingMethod('In-house');
    setSelectedOutsourcedLab('');
    setCustomOutsourcedLab('');
    setIsProcessDialogOpen(true);
  };

  const resetPartnerForm = () => {
    setEditingPartnerId(null);
    setNewPartnerName('');
    setNewPartnerCode('');
    setNewPartnerEmail('');
    setNewPartnerPhone('');
    setNewPartnerAddress('');
    setNewPartnerContactTitle('The Medical Director');
  };

  const openEditPartnerDialog = (partner: LabPartner) => {
    setEditingPartnerId(partner.id);
    setNewPartnerName(partner.name || '');
    setNewPartnerCode(partner.code || '');
    setNewPartnerEmail(partner.email || '');
    setNewPartnerPhone(partner.phone || '');
    setNewPartnerAddress(partner.address || '');
    setNewPartnerContactTitle(partner.contact_person_title || 'The Medical Director');
    setIsAddPartnerDialogOpen(true);
  };

  const handleSubmitPartner = async () => {
    if (!newPartnerName.trim()) {
      toast.error('Partner name is required');
      return;
    }

    const isEdit = editingPartnerId !== null;
    const payload = {
      name: newPartnerName.trim(),
      code: newPartnerCode.trim(),
      email: newPartnerEmail.trim(),
      phone: newPartnerPhone.trim(),
      address: newPartnerAddress.trim(),
      contact_person_title: newPartnerContactTitle.trim(),
    };

    setIsSubmittingPartner(true);
    try {
      const saved = isEdit
        ? await labService.updateLabPartner(editingPartnerId!, payload)
        : await labService.createLabPartner({ ...payload, is_active: true });

      setLabPartners((prev) =>
        isEdit
          ? prev.map((p) => (p.id === saved.id ? saved : p))
          : [...prev, saved]
      );

      // If the renamed partner was the currently selected outsourced lab, sync the label.
      if (isEdit && selectedOutsourcedLab && selectedOutsourcedLab !== saved.name) {
        const editedPartner = labPartners.find((p) => p.id === saved.id);
        if (editedPartner && editedPartner.name === selectedOutsourcedLab) {
          setSelectedOutsourcedLab(saved.name);
        }
      }

      resetPartnerForm();
      setIsAddPartnerDialogOpen(false);

      if (!isEdit) {
        // Per-test dialog (legacy state — kept for compatibility) and the new
        // order-level dispatch dialog both auto-select the brand-new partner.
        setSelectedOutsourcedLab(saved.name);
        setCustomOutsourcedLab('');
        if (isDispatchDialogOpen) setDispatchPartnerId(String(saved.id));
      }

      toast.success(
        isEdit
          ? `Lab partner "${saved.name}" updated`
          : `Lab partner "${saved.name}" added successfully`
      );
    } catch (err: any) {
      console.error('Failed to save lab partner:', err);
      const msg = err?.message || 'Failed to save lab partner. Please try again.';
      toast.error(msg);
    } finally {
      setIsSubmittingPartner(false);
    }
  };

  const handleDeletePartner = (partnerId: number, partnerName: string) => {
    setDeleteConfirmPartnerId(partnerId);
    setDeleteConfirmPartnerName(partnerName);
  };

  const confirmDeletePartner = async () => {
    if (deleteConfirmPartnerId === null) return;

    setDeletingPartnerId(deleteConfirmPartnerId);
    try {
      await labService.deleteLabPartner(deleteConfirmPartnerId);

      // Remove from the list
      setLabPartners((prev) => prev.filter((p) => p.id !== deleteConfirmPartnerId));

      // Clear selection if it was the deleted partner
      if (selectedOutsourcedLab === deleteConfirmPartnerName) {
        setSelectedOutsourcedLab('');
        setCustomOutsourcedLab('');
      }

      toast.success(`Lab partner "${deleteConfirmPartnerName}" deleted successfully`);
    } catch (err: any) {
      console.error('Failed to delete lab partner:', err);
      const msg = err?.message || 'Failed to delete lab partner. Please try again.';
      toast.error(msg);
    } finally {
      setDeletingPartnerId(null);
      setDeleteConfirmPartnerId(null);
      setDeleteConfirmPartnerName('');
    }
  };
  
  const openResultsDialog = (test: LabTest, isRework = false) => {
    setSelectedTest(test);
    
    // Initialize result values - pre-fill existing results if reworking a rejected test
    const initial: Record<string, string> = {};
    const template = getTemplateForTest(test);
    
    if (template) {
      // Start with template fields (ensures multi-parameter tests like FBC never fall back to single "Result")
      template.fields.forEach(field => { initial[field.name] = ''; });
    }
    if (isRework && test.results) {
      // Overlay existing results for rework (only matching keys; preserves full template shape)
      Object.entries(test.results).forEach(([key, value]) => {
        if (key === 'custom_results') return;
        initial[key] = coerceStoredResultValue(value);
      });
    }

    if (isOtherLabTest(test)) {
      const existingRows = Array.isArray((test.results as any)?.custom_results)
        ? ((test.results as any).custom_results as CustomResultRow[])
        : [];
      const rows = existingRows.length > 0
        ? existingRows.map((row) => ({ ...createCustomResultRow(), ...row, id: row.id || makeCustomRowId() }))
        : parseCustomResultNames(test, selectedOrder).map((name) => createCustomResultRow(name));
      setCustomResultRows(rows.length > 0 ? rows : [createCustomResultRow()]);
    } else {
      setCustomResultRows([]);
    }

    setResultValues(initial);
    setResultEntryMode(test.processingMethod === 'Outsourced' ? 'upload' : 'values');
    setUploadedFiles([]);
    setCustomResultFiles({});
    setIsResultsDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length) {
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
    e.target.value = '';
  };

  const removeUploadedFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const selectedExternalTemplates = useMemo(
    () => labTemplates.filter((template) => selectedExternalTemplateIds.has(Number(template.id))),
    [labTemplates, selectedExternalTemplateIds],
  );

  const filteredExternalTemplates = useMemo(() => {
    const q = externalTemplateSearch.trim().toLowerCase();
    if (!q) return labTemplates.slice(0, 25);
    return labTemplates
      .filter((template) => {
        const name = String(template?.name ?? '').toLowerCase();
        const code = String(template?.code ?? '').toLowerCase();
        const sampleType = String(template?.sample_type ?? '').toLowerCase();
        return name.includes(q) || code.includes(q) || sampleType.includes(q);
      })
      .slice(0, 25);
  }, [externalTemplateSearch, labTemplates]);

  const resetExternalOrderForm = () => {
    setExternalPatientSearch('');
    setExternalPatientResults([]);
    setSelectedExternalPatient(null);
    setExternalClinicId('');
    setExternalRequestingDoctorName('');
    setExternalManualReference('');
    setExternalManualFile(null);
    setExternalClinicalNotes('');
    setExternalPriority('routine');
    setExternalTemplateSearch('');
    setSelectedExternalTemplateIds(new Set());
  };

  const handleCreateExternalOrder = async () => {
    if (!selectedExternalPatient) return toast.error('Select a patient from Medical Records');
    if (!externalClinicId) return toast.error('Select the originating clinic');
    if (!externalRequestingDoctorName.trim()) return toast.error('Enter the requesting doctor from the manual form');
    if (selectedExternalTemplates.length === 0) return toast.error('Select at least one requested test');

    setIsSubmittingExternalOrder(true);
    try {
      const clinicId = Number(externalClinicId);
      const selectedClinic = externalClinics.find((clinic) => clinic.id === clinicId);
      if (!selectedClinic?.name) {
        toast.error('Select a configured originating clinic. Ask admin to add this clinic if it is missing.');
        return;
      }
      await labService.createExternalOrder({
        patient: selectedExternalPatient.id,
        priority: externalPriority,
        external_clinic: clinicId,
        external_requesting_doctor_name: externalRequestingDoctorName.trim(),
        manual_request_reference: externalManualReference.trim() || undefined,
        clinical_notes: externalClinicalNotes.trim(),
        manual_request_file: externalManualFile || undefined,
        tests_data: selectedExternalTemplates.map((template) => ({
          template: template.id,
          name: template.name,
          code: template.code,
          sample_type: template.sample_type || 'Other',
          status: 'pending',
          notes: externalClinicalNotes.trim(),
        })),
      });
      toast.success('External lab request created');
      setIsExternalOrderDialogOpen(false);
      resetExternalOrderForm();
      setSourceTypeFilter('external_manual');
      setActiveTab('pending');
      setCurrentPage(1);
      await loadOrders();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create external lab request');
    } finally {
      setIsSubmittingExternalOrder(false);
    }
  };

  // Simple Order Card - just basic info, click to view/manage
  const OrderCard = ({ order }: { order: LabOrder }) => {
    const orderProgressDisplay = getOrderProgressDisplay(order.tests);
    const orderStatus = getOrderStatus(order.tests);
    const isCompleted = orderStatus === LAB_ORDER_STATUS.COMPLETED;
    
    return (
      <Card 
        className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer ${order.priority === 'STAT' ? 'border-l-rose-500' : order.priority === 'Urgent' ? 'border-l-amber-500' : 'border-l-blue-500'}`}
        onClick={() => openViewDialog(order)}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <PatientAvatar name={order.patient.name} photoUrl={order.patient.photoUrl} size="sm" />
            
            {/* Info */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Name + Badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground truncate">{order.patient.name}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityBadge(order.priority)}`}>
                    {order.priority === 'STAT' && <AlertTriangle className="h-2 w-2 mr-0.5" />}{order.priority}
                  </Badge>
                  {order.sourceType === 'external_manual' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 border-amber-200">
                      External Request
                    </Badge>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getOrderStatusBadge(orderStatus)} cursor-help`}>{orderStatus}</Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{getOrderStatusExplanation(order.tests)}</p>
                    </TooltipContent>
                  </Tooltip>
                  {order.tests.map(test => (
                    <Badge key={test.id} variant="secondary" className="text-[10px] px-1.5 py-0">{test.code}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isCompleted && (
                    <div className="h-7 w-7 flex items-center justify-center rounded border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openViewDialog(order); }}>
                    <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                  </Button>
                </div>
              </div>
              
              {/* Row 2: Details */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                {getCategoryDisplay(order.patient) && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-blue-50 text-blue-700 border-blue-200">
                    {getCategoryDisplay(order.patient)}
                  </Badge>
                )}
                {order.lab_number && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-green-50 text-green-700 border-green-200 font-mono">
                    {order.lab_number}
                  </Badge>
                )}
                <span>{order.patient.age}y {order.patient.gender}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Stethoscope className="h-3 w-3" />
                  {order.sourceType === 'external_manual'
                    ? order.externalRequestingDoctorName?.trim() || 'External doctor'
                    : order.doctor.name}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1" title="When the order was placed">
                  <Clock className="h-3 w-3 shrink-0" />
                  {formatOrderedAtDisplay(order.orderedAt) || '—'}
                </span>
                <span>•</span>
                <span>{order.tests.length} test{order.tests.length > 1 ? 's' : ''}</span>
                <span>•</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-medium text-foreground cursor-help">{orderProgressDisplay.text}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Order progress: {orderProgressDisplay.value}% complete</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <TooltipProvider>
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <TestTube className="h-8 w-8 text-amber-500" />
              Lab Orders
            </h1>
            <p className="text-muted-foreground mt-1">Process tests individually - collect, process & enter results per test</p>
          </div>
          <Button onClick={() => setIsExternalOrderDialogOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-white">
            <Plus className="h-4 w-4 mr-2" />
            New External Lab Request
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-gray-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('pending')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-600 dark:text-gray-400">{stats.pendingSamples}</p>
                </div>
                <Beaker className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Test orders waiting for sample collection</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('processing')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Processing</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.processing}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Samples currently being processed in the lab</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-amber-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('results')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Results</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.resultsReady}</p>
                </div>
                <FileText className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Test results ready for verification</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-rose-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('rejected')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rework Required</p>
                  <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.reworkOrders}</p>
                </div>
                <XCircle className="h-8 w-8 text-rose-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Orders with one or more rejected tests that need correction and resubmission</p>
              </TooltipContent>
            </Tooltip>
        </div>

        {/* Filters & Tabs */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LabOrdersTab)} className="w-full">
                <TabsList>
                  <TabsTrigger value="pending">Pending ({stats.pendingSamples})</TabsTrigger>
                  <TabsTrigger value="processing">Processing ({stats.processing})</TabsTrigger>
                  <TabsTrigger value="results">Results ({stats.resultsReady})</TabsTrigger>
                  <TabsTrigger value="rejected">Rework Required ({stats.reworkOrders})</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                <div className="relative flex-1 min-w-[min(100%,16rem)]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Patient, order ID, Lab ID (e.g. BT-26-0007)…" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    className="pl-10" 
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
                  <Select value={dateFilter} onValueChange={setDateFilter} >
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                   <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                     <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">All Priority</SelectItem>
                       <SelectItem value="STAT">STAT</SelectItem>
                       <SelectItem value="Urgent">Urgent</SelectItem>
                       <SelectItem value="Routine">Routine</SelectItem>
                     </SelectContent>
                   </Select>
                   <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'priority' | 'lab_id' | 'date')}>
                     <SelectTrigger className="w-[120px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="priority">Priority</SelectItem>
                       <SelectItem value="lab_id">Lab ID</SelectItem>
                       <SelectItem value="date">Date</SelectItem>
                     </SelectContent>
                   </Select>
                  <Select value={genderFilter} onValueChange={setGenderFilter} >
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Gender</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={processingFilter}
                    onValueChange={(v) => setProcessingFilter(v as 'all' | 'in_house' | 'outsourced')}
                  >
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Processing" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All processing</SelectItem>
                      <SelectItem value="in_house">In-house</SelectItem>
                      <SelectItem value="outsourced">Outsourced</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sourceTypeFilter} onValueChange={(v) => setSourceTypeFilter(v as 'all' | 'internal_emr' | 'external_manual')}>
                    <SelectTrigger className="w-[170px]"><SelectValue placeholder="Source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      <SelectItem value="internal_emr">EMR Orders</SelectItem>
                      <SelectItem value="external_manual">External Requests</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom order date range to narrow down laboratory orders."
          label="Order Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {/* Orders List */}
        <div className="space-y-3">
          {loading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading orders...</p>
            </CardContent></Card>
          ) : error ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" className="mt-4" onClick={() => void loadOrders()}>Retry</Button>
            </CardContent></Card>
          ) : filteredOrders.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <TestTube className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No orders found</p>
            </CardContent></Card>
          ) : (
            paginatedOrders
              .sort((a, b) => {
                if (sortBy === 'priority') {
                  const priorityOrder = { STAT: 0, Urgent: 1, Routine: 2 };
                  return priorityOrder[a.priority] - priorityOrder[b.priority];
                } else if (sortBy === 'lab_id') {
                  // Sort by Lab ID - orders without Lab ID go to the end
                  if (!a.lab_number && !b.lab_number) return 0;
                  if (!a.lab_number) return 1;
                  if (!b.lab_number) return -1;
                  return a.lab_number.localeCompare(b.lab_number);
                } else if (sortBy === 'date') {
                  // Sort by order date (most recent first)
                  return new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime();
                }
                return 0;
              })
              .map(order => <OrderCard key={order.id} order={order} />)
          )}
        </div>

        {/* Pagination */}
        {filteredOrders.length > 0 && (
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
              itemName="orders"
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Showing {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} (page {currentPage} of {Math.ceil(totalCount / itemsPerPage)})
            </p>
          </Card>
        )}

        <Dialog open={isExternalOrderDialogOpen} onOpenChange={setIsExternalOrderDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-amber-500" />
                New External Lab Request
              </DialogTitle>
              <DialogDescription>
                Create a lab order from a manual request form. Patient is selected from Medical Records.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label>Patient from Medical Records *</Label>
                {selectedExternalPatient ? (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      <PatientAvatar
                        name={selectedExternalPatient.full_name || `${selectedExternalPatient.first_name} ${selectedExternalPatient.surname}`}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-medium">
                          {selectedExternalPatient.full_name || `${selectedExternalPatient.first_name} ${selectedExternalPatient.surname}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            selectedExternalPatient.patient_id,
                            selectedExternalPatient.personal_number,
                            formatPatientGenderLabel(selectedExternalPatient.gender),
                            selectedExternalPatient.age != null ? `${selectedExternalPatient.age}y` : '',
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedExternalPatient(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={externalPatientSearch}
                        onChange={(event) => setExternalPatientSearch(event.target.value)}
                        placeholder="Search patient name, MRN, or personal number"
                        className="pl-10"
                      />
                    </div>
                    <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                      {searchingExternalPatients ? (
                        <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching patients...
                        </div>
                      ) : externalPatientResults.length > 0 ? (
                        externalPatientResults.map((patient) => (
                          <button
                            key={patient.id}
                            type="button"
                            className="w-full p-3 text-left hover:bg-muted flex items-center gap-3"
                            onClick={() => setSelectedExternalPatient(patient)}
                          >
                            <PatientAvatar
                              name={patient.full_name || `${patient.first_name} ${patient.surname}`}
                              size="sm"
                            />
                            <span>
                              <span className="block text-sm font-medium">
                                {patient.full_name || `${patient.first_name} ${patient.surname}`}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {[patient.patient_id, patient.personal_number, formatPatientGenderLabel(patient.gender)]
                                  .filter(Boolean)
                                  .join(' • ')}
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-sm text-muted-foreground">
                          Type at least 2 characters to search Medical Records.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Originating Clinic *</Label>
                  <Select value={externalClinicId} onValueChange={setExternalClinicId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select clinic/facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {externalClinics.map((clinic) => (
                        <SelectItem key={clinic.id} value={String(clinic.id)}>
                          {clinic.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Requesting Doctor on Form *</Label>
                  <Input
                    value={externalRequestingDoctorName}
                    onChange={(event) => setExternalRequestingDoctorName(event.target.value)}
                    placeholder="e.g. Dr. Musa"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={externalPriority} onValueChange={(value) => setExternalPriority(value as 'routine' | 'urgent' | 'stat')}>
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

                <div className="space-y-2">
                  <Label>Manual Form Reference</Label>
                  <Input
                    value={externalManualReference}
                    onChange={(event) => setExternalManualReference(event.target.value)}
                    placeholder="Optional form/reference number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Attach Manual Request Form</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => setExternalManualFile(event.target.files?.[0] || null)}
                />
                {externalManualFile && (
                  <p className="text-xs text-muted-foreground">Selected: {externalManualFile.name}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Files are saved on the server with this order. After you create the request, open the order and use{' '}
                  <span className="font-medium text-foreground">View attached manual request</span> to open or download it.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Requested Tests from Templates *</Label>
                <Input
                  value={externalTemplateSearch}
                  onChange={(event) => setExternalTemplateSearch(event.target.value)}
                  placeholder="Search test name, code, or sample type"
                />
                <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                  {loadingExternalTemplates ? (
                    <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading templates...
                    </div>
                  ) : filteredExternalTemplates.length > 0 ? (
                    filteredExternalTemplates.map((template) => {
                      const checked = selectedExternalTemplateIds.has(Number(template.id));
                      return (
                        <label key={template.id} className="flex items-start gap-3 p-3 hover:bg-muted cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setSelectedExternalTemplateIds((prev) => {
                                const next = new Set(prev);
                                if (value) next.add(Number(template.id));
                                else next.delete(Number(template.id));
                                return next;
                              });
                            }}
                          />
                          <span>
                            <span className="block text-sm font-medium">{template.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[template.code, template.sample_type].filter(Boolean).join(' • ')}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground">No matching templates found.</div>
                  )}
                </div>
                {selectedExternalTemplates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedExternalTemplates.map((template) => (
                      <Badge key={template.id} variant="secondary">
                        {template.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Clinical Notes / Indication from Form</Label>
                <Textarea
                  value={externalClinicalNotes}
                  onChange={(event) => setExternalClinicalNotes(event.target.value)}
                  rows={3}
                  placeholder="Copy indication, clinical notes, or special instructions from the manual form..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsExternalOrderDialogOpen(false)} disabled={isSubmittingExternalOrder}>
                Cancel
              </Button>
              <Button onClick={handleCreateExternalOrder} disabled={isSubmittingExternalOrder}>
                {isSubmittingExternalOrder ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create External Request'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View & Manage Order Dialog - All actions happen here */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-amber-500" />Manage Order</DialogTitle>
              <DialogDescription>{selectedOrder?.orderId} • Process individual tests</DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4 py-4">
                {/* Order Header */}
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getPriorityBadge(selectedOrder.priority)}>{selectedOrder.priority}</Badge>
                  <span className="text-sm text-muted-foreground">{getOrderProgressDisplay(selectedOrder.tests).text} complete</span>
                  <Progress value={getOrderProgressDisplay(selectedOrder.tests).value} className="flex-1 h-2" />
                </div>
                
                {/* Patient & Doctor Info */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient</p>
                    <p className="font-medium">{selectedOrder.patient.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedOrder.patient.age}y {selectedOrder.patient.gender}</p>
                    {selectedOrder.patient?.category && (
                      <p className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">Category:</span>
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">
                          {getCategoryDisplay(selectedOrder.patient)}
                        </span>
                      </p>
                    )}
                    {selectedOrder.patient.category === 'dependent' && selectedPrincipalInfo?.personalNumber && (
                      <p className="text-xs text-muted-foreground">
                        Principal P.N.: <span className="font-mono">{selectedPrincipalInfo.personalNumber}</span>
                      </p>
                    )}
                    {selectedOrder.patient?.phone && (
                      <p className="text-xs text-muted-foreground">Phone: <span className="font-mono">{selectedOrder.patient.phone}</span></p>
                    )}
                    {(selectedOrder.patient as any).personal_number && (
                      <p className="text-xs text-muted-foreground">Personal #: {(selectedOrder.patient as any).personal_number}</p>
                    )}
                    {(selectedOrder.patient as any).division && (
                      <p className="text-xs text-muted-foreground">Division: {(selectedOrder.patient as any).division}</p>
                    )}
                  </div>
                  <div>
                    {selectedOrder.sourceType === 'external_manual' ? (
                      <>
                        <p className="text-xs text-muted-foreground">Requesting Doctor on Form</p>
                        <p className="font-medium">{selectedOrder.externalRequestingDoctorName?.trim() || '—'}</p>
                        {selectedOrder.externalClinic?.name && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Originating clinic: {selectedOrder.externalClinic.name}
                          </p>
                        )}
                        {selectedOrder.manualRequestReference?.trim() && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Reference: {selectedOrder.manualRequestReference}
                          </p>
                        )}
                        {selectedOrder.manualRequestFile && (
                          <a
                            className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                            href={getLabResultFileUrl(selectedOrder.manualRequestFile)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View attached manual request
                          </a>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">Ordering Doctor</p>
                        <p className="font-medium">{selectedOrder.doctor.name}</p>
                        <p className="text-xs text-muted-foreground">{selectedOrder.doctor.specialty}</p>
                      </>
                    )}
                  </div>
                </div>

                <Icd10DiagnosesBlock diagnoses={selectedOrder.icd10_diagnoses} compact />

                {selectedOrder.clinicalNotes && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-muted-foreground mb-1">Clinical Notes</p>
                    <p className="text-sm">{selectedOrder.clinicalNotes}</p>
                  </div>
                )}
                
                {/* Individual Tests - With Actions */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Tests ({selectedOrder.tests.length})</p>
                    {/* Only surface the order-level batch button when there's
                        a real batch opportunity (>= 2 eligible tests). For a
                        single test, the per-test "Start Processing" → Outsourced
                        flow already routes to the same dispatch dialog. */}
                    {dispatchEligibleTests.length >= 2 && (
                      <Button
                        size="sm"
                        onClick={() => openDispatchDialog()}
                        className="h-8 px-3 bg-indigo-500 hover:bg-indigo-600 text-white text-xs"
                        title="Batch-send collected samples to an external lab partner"
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Send to External Lab
                        <Badge variant="outline" className="ml-2 bg-white/20 text-white border-white/30 text-[10px] px-1.5">
                          {dispatchEligibleTests.length} ready
                        </Badge>
                      </Button>
                    )}
                  </div>
                  {selectedOrder.tests.map(test => (
                    <div key={test.id} className="p-3 rounded-lg border space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={getSampleTypeBadge(test.sampleType)}>{test.sampleType}</Badge>
                          <span className="font-medium">{test.name}</span>
                          <span className="text-xs text-muted-foreground">({test.code})</span>
                          {test.processingMethod && (
                            <Badge variant="outline" className={`text-[10px] ${test.processingMethod === 'In-house' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-indigo-500/10 text-indigo-600'}`}>
                              {test.processingMethod === 'In-house' ? <Building2 className="h-2.5 w-2.5 mr-0.5" /> : <Truck className="h-2.5 w-2.5 mr-0.5" />}
                              {test.processingMethod}
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className={getTestStatusBadge(test.status)}>{test.status}</Badge>
                      </div>
                      
                      {/* Test Details & Actions */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          {test.lab_number && <span className="font-mono text-blue-600 dark:text-blue-400">Lab ID: {test.lab_number}</span>}
                          {test.collectedBy && <span className={test.lab_number ? " ml-2" : ""}>Collected by {test.collectedBy} {test.collectedAt && `on ${formatDate(test.collectedAt)} at ${formatTime(test.collectedAt)}`}</span>}
                          {/* Extract collection method from notes if available */}
                          {(() => {
                            const notes = test.notes || '';
                            const methodMatch = notes.match(/Method: ([^\n]+)/);
                            return methodMatch ? <span className="ml-2">• {methodMatch[1]}</span> : null;
                          })()}
                          {test.outsourcedLab && <span className="ml-2">• {test.outsourcedLab}</span>}
                          {test.status === LAB_TEST_STATUS.REJECTED && test.rejectedBy && (
                            <span className="ml-2">• Rejected by {test.rejectedBy} {test.rejectedAt && `at ${formatTime(test.rejectedAt)}`}</span>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          {test.status === LAB_TEST_STATUS.PENDING && (
                            <Button size="sm" onClick={() => openCollectDialog(test)} className="h-7 px-3 bg-violet-500 hover:bg-violet-600 text-white text-xs">
                              <Beaker className="h-3 w-3 mr-1" />Collect Sample
                            </Button>
                          )}
                          {test.status === LAB_TEST_STATUS.SAMPLE_COLLECTED && (
                            <Button size="sm" onClick={() => openProcessDialog(test)} className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-white text-xs">
                              <Play className="h-3 w-3 mr-1" />Start Processing
                            </Button>
                          )}
                          {test.status === LAB_TEST_STATUS.PROCESSING && (
                            <Button size="sm" onClick={() => openResultsDialog(test)} className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs">
                              <FileText className="h-3 w-3 mr-1" />Enter Results
                            </Button>
                          )}
                          {test.status === LAB_TEST_STATUS.RESULTS_READY && (
                            <Button variant="outline" size="sm" className="h-7 px-3 text-xs text-emerald-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Complete
                            </Button>
                          )}
                          {test.status === LAB_TEST_STATUS.REJECTED && (
                            <Button 
                              size="sm" 
                              onClick={() => openResultsDialog(test, true)} 
                              className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />Rework & Resubmit
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Show Rejection Reason if rejected */}
                      {test.status === LAB_TEST_STATUS.REJECTED && test.verificationNotes && (
                        <div className="mt-2 p-2 rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs">
                          <p className="font-medium text-rose-700 dark:text-rose-400 mb-1 flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            Rejection Reason:
                          </p>
                          <p className="text-rose-600 dark:text-rose-300">
                            {formatRejectionReason(test.verificationNotes)}
                          </p>
                          {test.rejectedBy && test.rejectedAt && (
                            <p className="text-rose-500 dark:text-rose-400 mt-1 text-[10px]">
                              Rejected by {test.rejectedBy} on {formatDate(test.rejectedAt)} at {formatTime(test.rejectedAt)}
                            </p>
                          )}
                        </div>
                      )}
                      
                      {/* Show Results if available */}
                      {test.results && (
                        <div className="mt-2 p-2 rounded bg-emerald-50 dark:bg-emerald-900/20 text-xs">
                          <p className="font-medium text-emerald-700 dark:text-emerald-400 mb-1">Results:</p>
                          {Array.isArray((test.results as any).custom_results) &&
                          (test.results as any).custom_results.length > 0 ? (
                            <div className="space-y-2">
                              {((test.results as any).custom_results as CustomResultRow[]).map((row, rowIdx) => {
                                const attachment = (test.resultAttachments || []).find((file) =>
                                  file.row_id === row.id || file.row_name?.trim().toLowerCase() === row.name.trim().toLowerCase()
                                );
                                const attachmentUrl = getLabResultFileUrl(attachment?.file);
                                return (
                                  <div key={row.id || rowIdx} className="rounded border bg-background/70 p-2 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="font-medium">{row.name || `Custom result ${rowIdx + 1}`}</div>
                                      {attachmentUrl && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-6 px-2 text-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(attachmentUrl, '_blank', 'noopener,noreferrer');
                                          }}
                                        >
                                          <Eye className="h-3 w-3 mr-1" />View file
                                        </Button>
                                      )}
                                    </div>
                                    {row.value && (
                                      <div>
                                        <span className="text-muted-foreground">Result:</span>{' '}
                                        <span className="font-medium">
                                          {row.value}{row.unit ? ` ${row.unit}` : ''}
                                        </span>
                                      </div>
                                    )}
                                    {row.reference_range && (
                                      <div><span className="text-muted-foreground">Reference:</span> {row.reference_range}</div>
                                    )}
                                    {row.notes && (
                                      <div><span className="text-muted-foreground">Notes:</span> {row.notes}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                              {orderResultRows(
                                Object.entries(test.results as Record<string, unknown>)
                                  .filter(([key]) => key !== 'custom_results')
                                  .map(([key, value]) => ({
                                    parameter: key,
                                    value: coerceStoredResultValue(value),
                                  })),
                                test.templateNormalRange ?? undefined
                              ).map(({ parameter, value }) => (
                                <div key={parameter}>
                                  <span className="text-muted-foreground">{parameter}:</span>{' '}
                                  <span className="font-medium">{value}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {test.resultFile && (
                        <div className="mt-2 p-2 rounded bg-indigo-50 dark:bg-indigo-900/20 text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-indigo-600" />
                            <span>{test.resultFile.name}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-indigo-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (test.resultFile) {
                                // Construct download URL
                                const fileUrl = test.resultFile.name.startsWith('http') 
                                  ? test.resultFile.name 
                                  : `/api${test.resultFile.name}`;
                                window.open(fileUrl, '_blank');
                              }
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />Download
                          </Button>
                        </div>
                      )}
                      {(() => {
                        const extraAttachments = (test.resultAttachments || []).filter((att) => {
                          if (!att.row_id) return true;
                          const customRows = (test.results as any)?.custom_results;
                          if (!Array.isArray(customRows)) return true;
                          return !customRows.some((row: any) =>
                            String(att.row_id) === String(row.id) ||
                            att.row_name?.trim().toLowerCase() === String(row.name || '').trim().toLowerCase()
                          );
                        });
                        return extraAttachments.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {extraAttachments.map((att, i) => {
                              const attUrl = getLabResultFileUrl(att.file);
                              return attUrl ? (
                                <div key={att.id || i} className="p-2 rounded bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-200/50 dark:border-indigo-800/50 text-xs flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                                    <span className="truncate">{att.row_name || att.file?.split('/').filter(Boolean).pop() || 'Additional file'}</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-indigo-600 shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(attUrl, '_blank', 'noopener,noreferrer');
                                    }}
                                  >
                                    <Eye className="h-3 w-3 mr-1" />View
                                  </Button>
                                </div>
                              ) : null;
                            })}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ))}
                </div>

                {/* Dispatches History — every batch send-out for this order */}
                {(orderDispatches.length > 0 || loadingOrderDispatches) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-indigo-500" />
                      <p className="text-sm font-medium">Dispatches</p>
                      {loadingOrderDispatches && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                    <div className="space-y-2">
                      {orderDispatches.map((d) => {
                        const issuedDate = d.issued_at ? new Date(d.issued_at) : null;
                        const isActive = d.status === 'issued';
                        return (
                          <div
                            key={d.id}
                            className={`p-3 rounded-lg border space-y-2 ${
                              isActive
                                ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-900/10'
                                : 'border-muted bg-muted/30'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap text-xs">
                                <span className="inline-flex items-center gap-1 font-mono font-medium text-indigo-700 dark:text-indigo-400">
                                  <Hash className="h-3 w-3" />{d.dispatch_id}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    d.status === 'issued'
                                      ? 'bg-indigo-500/10 text-indigo-600 text-[10px]'
                                      : d.status === 'cancelled'
                                      ? 'bg-rose-500/10 text-rose-600 text-[10px]'
                                      : 'bg-amber-500/10 text-amber-600 text-[10px]'
                                  }
                                >
                                  {d.status}
                                </Badge>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-medium">{d.partner_name}</span>
                                <span className="text-muted-foreground">
                                  • {d.tests.length} test{d.tests.length === 1 ? '' : 's'}
                                </span>
                                {issuedDate && (
                                  <span className="text-muted-foreground">
                                    • {issuedDate.toLocaleDateString()} {formatTime(d.issued_at)}
                                    {d.issued_by_name ? ` by ${d.issued_by_name}` : ''}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => openExistingDispatchPanel(d)}
                                  title="Reprint referral letter / responsibility form"
                                >
                                  <Printer className="h-3 w-3 mr-1" />
                                  Reprint
                                </Button>
                                {isActive && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                    onClick={() => handleCancelDispatch(d)}
                                    disabled={cancellingDispatchId === d.id}
                                    title="Cancel this dispatch and revert tests to Sample Collected"
                                  >
                                    {cancellingDispatchId === d.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3 mr-1" />
                                    )}
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {d.tests.map((t) => (
                                <Badge
                                  key={t.id}
                                  variant="outline"
                                  className="text-[10px] bg-background"
                                  title={`Code ${t.code} • Status: ${t.status}`}
                                >
                                  {t.name}
                                </Badge>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                Referral letter:{' '}
                                {d.referral_letter_printed_at
                                  ? `printed ${formatTime(d.referral_letter_printed_at)}`
                                  : 'not printed'}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <FileSignature className="h-3 w-3" />
                                Responsibility form:{' '}
                                {d.responsibility_form_printed_at
                                  ? `printed ${formatTime(d.responsibility_form_printed_at)}`
                                  : 'not printed'}
                              </span>
                              {d.cancellation_reason && (
                                <span className="text-rose-600">Reason: {d.cancellation_reason}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Collect Sample Dialog */}
        <Dialog open={isCollectDialogOpen} onOpenChange={setIsCollectDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Beaker className="h-5 w-5 text-violet-500" />Collect {selectedTest?.sampleType || 'Sample'}</DialogTitle>
              <DialogDescription>Collect sample for laboratory testing</DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedTest && (
              <div className="space-y-4 py-4">
                {/* Sample Type Header */}
                <div className={`p-4 rounded-lg flex items-center gap-4 ${
                  (selectedTest.sampleType === 'Blood' || selectedTest.sampleType === 'Serum') ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800' :
                  selectedTest.sampleType === 'Urine' ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' :
                  'bg-muted/50 border'
                }`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    (selectedTest.sampleType === 'Blood' || selectedTest.sampleType === 'Serum') ? 'bg-rose-100 dark:bg-rose-800' :
                    selectedTest.sampleType === 'Urine' ? 'bg-amber-100 dark:bg-amber-800' :
                    'bg-muted'
                  }`}>
                    {(selectedTest.sampleType === 'Blood' || selectedTest.sampleType === 'Serum') ? (
                      <Droplets className="h-6 w-6 text-rose-600" />
                    ) : selectedTest.sampleType === 'Urine' ? (
                      <Beaker className="h-6 w-6 text-amber-600" />
                    ) : (
                      <Pipette className="h-6 w-6 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold text-lg ${
                      (selectedTest.sampleType === 'Blood' || selectedTest.sampleType === 'Serum') ? 'text-rose-700 dark:text-rose-400' :
                      selectedTest.sampleType === 'Urine' ? 'text-amber-700 dark:text-amber-400' :
                      'text-foreground'
                    }`}>{selectedTest.sampleType} Sample</h3>

                    {/* Enhanced Patient Bio Data */}
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium text-sm">{selectedOrder.patient.name}</span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Age: {selectedOrder.patient.age}</span>
                        <span>Gender: {selectedOrder.patient.gender}</span>
                        {getCategoryDisplay(selectedOrder.patient) && (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">
                            {getCategoryDisplay(selectedOrder.patient)}
                          </span>
                        )}
                        {selectedOrder.patient?.phone && (
                          <span>Phone: <span className="font-mono">{selectedOrder.patient.phone}</span></span>
                        )}
                      </div>

                      {(selectedOrder.patient.personal_number || selectedOrder.patient.division || selectedPrincipalInfo?.personalNumber) && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {selectedOrder.patient.personal_number && (
                            <span>Personal #: {selectedOrder.patient.personal_number}</span>
                          )}
                          {selectedOrder.patient.category === 'dependent' && selectedPrincipalInfo?.personalNumber && (
                            <span>Principal P.N.: {selectedPrincipalInfo.personalNumber}</span>
                          )}
                          {selectedOrder.patient.division && (
                            <span>Division: {selectedOrder.patient.division}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-2 text-sm">
                      {(() => {
                        const existingLabId = selectedOrder.lab_number || selectedOrder.tests.find(t => t.lab_number)?.lab_number;
                        return existingLabId ? (
                          <>
                            <p className="font-mono text-blue-600 dark:text-blue-400">Lab ID: {existingLabId}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              One per order. New tests will use this same Lab ID.
                            </p>
                          </>
                        ) : (
                          <p className="text-muted-foreground">Lab ID will be assigned when you collect (one per order)</p>
                        );
                      })()}
                      {selectedTestsForCollection.length > 1 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          All {selectedTestsForCollection.length} tests will share the same Lab ID
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Collection Date/Time */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-700 dark:text-blue-400">
                    Collection Time: {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Tests to Collect - Multi-select */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tests to Collect ({selectedTest.sampleType})</Label>
                  <div className="space-y-2 p-3 rounded-lg border max-h-[150px] overflow-y-auto">
                    {selectedOrder.tests
                      .filter(
                        t =>
                          normalizeSampleTypeForCollection(t.sampleType) === normalizeSampleTypeForCollection(selectedTest.sampleType) &&
                          t.status === LAB_TEST_STATUS.PENDING
                      )
                      .map(test => (
                        <div key={test.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                          <Checkbox
                            id={test.id}
                            checked={selectedTestsForCollection.includes(test.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedTestsForCollection(prev => [...prev, test.id]);
                              } else {
                                setSelectedTestsForCollection(prev => prev.filter(id => id !== test.id));
                              }
                            }}
                          />
                          <label htmlFor={test.id} className="flex-1 cursor-pointer">
                            <span className="font-medium text-sm">{test.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">({test.code})</span>
                          </label>
                        </div>
                      ))
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedTestsForCollection.length} test(s) selected</p>
                </div>

                {/* Collection Method Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Collection Method *</Label>
                  <div className="text-xs text-muted-foreground mb-1">
                    Sample Type: {selectedTest.sampleType}
                  </div>
                  <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select collection method" />
                    </SelectTrigger>
                    <SelectContent>
                    {(collectionMethods[normalizeSampleTypeForCollection(selectedTest.sampleType)] || collectionMethods['Other']).map((method) => (
                        <SelectItem key={method.name} value={method.name}>
                        <div className="flex items-center gap-2">
                            <span>{method.icon}</span>
                            <span>{method.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">- {method.description}</span>
                        </div>
                        </SelectItem>
                    ))}
                    {(collectionMethods[selectedTest?.sampleType] || collectionMethods['Blood'] || []).length === 0 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        No collection methods available for {selectedTest?.sampleType || 'this sample type'}
                      </div>
                    )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Additional Notes */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Additional Notes (Optional)</Label>
                  <Input 
                    value={collectionNotes} 
                    onChange={(e) => setCollectionNotes(e.target.value)} 
                    placeholder="Any special notes about the collection..." 
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCollectDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleCollectSample} 
                disabled={isSubmitting || selectedTestsForCollection.length === 0 || !selectedMethod} 
                className="bg-violet-500 hover:bg-violet-600"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Beaker className="h-4 w-4 mr-2" />}
                Collect {selectedTestsForCollection.length} Sample{selectedTestsForCollection.length > 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Start Processing Dialog.
            Two-card chooser: In-house finishes inline; Outsourced bridges to
            the order-level Send to External Lab dialog (where the user picks
            a partner and prints the standardised paperwork). */}
        <Dialog
          open={isProcessDialogOpen}
          onOpenChange={setIsProcessDialogOpen}
        >
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Play className="h-5 w-5 text-blue-500" />Process Test
              </DialogTitle>
              <DialogDescription>
                Choose processing method for {selectedTest?.name}
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedTest && (
              <div className="space-y-4 py-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient:</span><span className="font-medium">{selectedOrder.patient.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Test:</span><span className="font-medium">{selectedTest.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Sample:</span><span className="font-medium">{selectedTest.sampleType}</span></div>
                  {selectedTest.collectedBy && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Collected by:</span><span className="font-medium">{selectedTest.collectedBy}</span></div>
                  )}
                </div>

                <div className="space-y-3">
                  <Label>Processing Method *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setProcessingMethod('In-house')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        processingMethod === 'In-house'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-muted hover:border-emerald-300'
                      }`}
                    >
                      <Building2 className={`h-6 w-6 mb-2 ${processingMethod === 'In-house' ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      <p className="font-medium">In-house</p>
                      <p className="text-xs text-muted-foreground">Process in our lab</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProcessingMethod('Outsourced')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        processingMethod === 'Outsourced'
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-muted hover:border-indigo-300'
                      }`}
                    >
                      <Truck className={`h-6 w-6 mb-2 ${processingMethod === 'Outsourced' ? 'text-indigo-600' : 'text-muted-foreground'}`} />
                      <p className="font-medium">Outsourced</p>
                      <p className="text-xs text-muted-foreground">Send to external lab</p>
                    </button>
                  </div>

                  {processingMethod === 'Outsourced' && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/40 dark:bg-indigo-900/10 p-3 text-xs text-indigo-800 dark:text-indigo-300 flex gap-2">
                      <Send className="h-4 w-4 mt-0.5 shrink-0" />
                      <p>
                        Next step: pick the lab partner, batch with any other
                        outsourced tests on this order, and print the
                        Referral Letter and Responsibility Form. We'll generate
                        a serial (LBR-YYYY-NNNNNN) for the dispatch.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsProcessDialogOpen(false)}>Cancel</Button>
              {processingMethod === 'Outsourced' ? (
                <Button
                  onClick={handleContinueToDispatch}
                  className="bg-indigo-500 hover:bg-indigo-600"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Continue to dispatch
                </Button>
              ) : (
                <Button
                  onClick={handleStartProcessing}
                  disabled={isSubmitting}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Start Processing
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send to External Lab — order-level batch dispatch.
            Two stages: stage 1 picks tests + partner + notes; once the
            dispatch is created we swap to stage 2 — a confirmation panel
            with Print Referral Letter / Print Responsibility Form. */}
        <Dialog
          open={isDispatchDialogOpen}
          onOpenChange={(open) => {
            setIsDispatchDialogOpen(open);
            if (!open) {
              setConfirmedDispatch(null);
              setReferralLetterPrinted(false);
              setResponsibilityFormPrinted(false);
            }
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
            {confirmedDispatch ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    Dispatch Issued
                  </DialogTitle>
                  <DialogDescription>
                    Print the paperwork that travels with the samples. Both
                    documents are stamped with dispatch{' '}
                    <span className="font-mono font-medium">{confirmedDispatch.dispatch_id}</span>.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="p-4 rounded-lg border border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-900/10 space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Hash className="h-4 w-4 text-indigo-600" />
                      <span className="font-mono font-medium text-indigo-700 dark:text-indigo-400">
                        {confirmedDispatch.dispatch_id}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{confirmedDispatch.partner_name}</span>
                      <Badge variant="outline" className="bg-background text-[10px]">
                        {confirmedDispatch.tests.length} test{confirmedDispatch.tests.length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {confirmedDispatch.tests.map((t) => (
                        <Badge key={t.id} variant="outline" className="text-[10px] bg-background">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                    {confirmedDispatch.notes && (
                      <p className="text-xs text-muted-foreground">Notes: {confirmedDispatch.notes}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => openDispatchPdf('referral', confirmedDispatch)}
                      disabled={isPrintingReferral}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        referralLetterPrinted
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10'
                      } ${isPrintingReferral ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {isPrintingReferral ? (
                          <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                        ) : (
                          <Mail className={`h-5 w-5 ${referralLetterPrinted ? 'text-emerald-600' : 'text-indigo-600'}`} />
                        )}
                        <p className="font-medium">Referral Letter</p>
                        {referralLetterPrinted && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 ml-auto" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Letter to <span className="font-medium">{confirmedDispatch.partner_name}</span>{' '}
                        listing the requested tests.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => openDispatchPdf('responsibility', confirmedDispatch)}
                      disabled={isPrintingResponsibility}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        responsibilityFormPrinted
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10'
                      } ${isPrintingResponsibility ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {isPrintingResponsibility ? (
                          <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                        ) : (
                          <FileSignature className={`h-5 w-5 ${responsibilityFormPrinted ? 'text-emerald-600' : 'text-indigo-600'}`} />
                        )}
                        <p className="font-medium">Responsibility Form</p>
                        {responsibilityFormPrinted && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 ml-auto" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Patient acknowledgement & financial responsibility for the outsourced workup.
                      </p>
                    </button>
                  </div>

                  {!referralLetterPrinted && !responsibilityFormPrinted && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <p>
                        You can reprint these later from the Dispatches list on the order detail. The
                        dispatch is already saved with serial{' '}
                        <span className="font-mono font-medium">{confirmedDispatch.dispatch_id}</span>.
                      </p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button onClick={handleDoneDispatch} className="bg-emerald-500 hover:bg-emerald-600">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Done
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-indigo-500" />
                    Send to External Lab
                  </DialogTitle>
                  <DialogDescription>
                    Issue a referral dispatch for one or more collected samples. We'll
                    generate a serial (LBR-YYYY-NNNNNN) and the standardised paperwork.
                  </DialogDescription>
                </DialogHeader>

                {selectedOrder && (
                  <div className="space-y-4 py-2">
                    <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span><span className="text-muted-foreground">Patient:</span> <span className="font-medium">{selectedOrder.patient.name}</span></span>
                        <span><span className="text-muted-foreground">Order:</span> <span className="font-mono font-medium">{selectedOrder.orderId}</span></span>
                      </div>
                      {selectedOrder.lab_number && (
                        <div className="text-xs text-muted-foreground">Lab ID: <span className="font-mono text-blue-600">{selectedOrder.lab_number}</span></div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Tests to send out *</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDispatchSelectedTestIds(dispatchEligibleTests.map((t) => t.id))}
                            className="text-xs h-auto p-1"
                            disabled={dispatchEligibleTests.length === 0 || dispatchSelectedTestIds.length === dispatchEligibleTests.length}
                          >
                            Select all
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDispatchSelectedTestIds([])}
                            className="text-xs h-auto p-1"
                            disabled={dispatchSelectedTestIds.length === 0}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      {dispatchEligibleTests.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
                          No collected samples are waiting for processing. Collect samples first
                          (or cancel an existing dispatch) to send out a new batch.
                        </div>
                      ) : (
                        <div className="rounded-lg border max-h-56 overflow-y-auto divide-y">
                          {dispatchEligibleTests.map((t) => {
                            const checked = dispatchSelectedTestIds.includes(t.id);
                            return (
                              <label
                                key={t.id}
                                className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/50 ${
                                  checked ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleDispatchTest(t.id)}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium">{t.name}</span>
                                    <Badge variant="outline" className="text-[10px]">{t.code}</Badge>
                                    <Badge variant="outline" className={`text-[10px] ${getSampleTypeBadge(t.sampleType)}`}>
                                      {t.sampleType}
                                    </Badge>
                                  </div>
                                  {t.lab_number && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      Lab ID: <span className="font-mono">{t.lab_number}</span>
                                    </p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {dispatchSelectedTestIds.length} of {dispatchEligibleTests.length} selected
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Lab partner *</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsManagePartnersDialogOpen(true)}
                            className="text-xs h-auto p-1"
                          >
                            ⚙️ Manage
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsAddPartnerDialogOpen(true)}
                            className="text-xs h-auto p-1"
                          >
                            <Plus className="h-3 w-3 mr-0.5" />Add
                          </Button>
                        </div>
                      </div>
                      <Select
                        value={dispatchPartnerId}
                        onValueChange={setDispatchPartnerId}
                        disabled={loadingLabPartners}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loadingLabPartners ? 'Loading partners…' : 'Choose a lab partner…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {labPartners.length === 0 && !loadingLabPartners && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              No partners yet — click <span className="font-medium">+ Add</span> to create one.
                            </div>
                          )}
                          {labPartners.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              <div className="flex flex-col">
                                <span className="font-medium">{p.name}</span>
                                {p.address && (
                                  <span className="text-[11px] text-muted-foreground line-clamp-1">
                                    {p.address.split('\n')[0]}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {dispatchPartnerId && (() => {
                        const partner = labPartners.find((p) => String(p.id) === dispatchPartnerId);
                        if (!partner) return null;
                        const hasAddress = !!(partner.address || '').trim();
                        // Address present → show preview block. Empty → amber
                        // warning with a one-click shortcut into the partner edit
                        // dialog so the postal lines actually print on the
                        // referral letter / responsibility form.
                        if (hasAddress) {
                          return (
                            <div className="rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground whitespace-pre-line">
                              <span className="font-medium text-foreground block mb-0.5">
                                {partner.contact_person_title || 'The Medical Director'}
                              </span>
                              {partner.address}
                            </div>
                          );
                        }
                        return (
                          <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div className="flex-1 space-y-1">
                              <p>
                                <span className="font-medium">{partner.name}</span> has no postal
                                address saved. Letters will print without it — the partner won't
                                see the addressee block.
                              </p>
                              <button
                                type="button"
                                className="font-medium underline hover:text-amber-900 dark:hover:text-amber-200"
                                onClick={() => openEditPartnerDialog(partner)}
                              >
                                Edit partner →
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="dispatch-notes">Notes (optional)</Label>
                      <Textarea
                        id="dispatch-notes"
                        value={dispatchNotes}
                        onChange={(e) => setDispatchNotes(e.target.value)}
                        placeholder="Anything the receiving lab should know — special handling, urgency, contact, etc."
                        className="min-h-[4.5rem] text-sm"
                      />
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDispatchDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateDispatch}
                    disabled={
                      isCreatingDispatch ||
                      dispatchSelectedTestIds.length === 0 ||
                      !dispatchPartnerId
                    }
                    className="bg-indigo-500 hover:bg-indigo-600"
                  >
                    {isCreatingDispatch ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Issue Dispatch
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Done-without-printing nudge — shown when the user closes the
            confirmation panel without opening either PDF. We use a regular
            Dialog (not AlertDialog) to match the existing delete-partner
            pattern, which avoids Radix body-pointer-events races when the
            modal stacks on top of the parent Dispatch Dialog. */}
        <Dialog
          open={skipPrintConfirmOpen}
          onOpenChange={(open) => {
            if (!open) setSkipPrintConfirmOpen(false);
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Close without printing the paperwork?
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">
                  You haven't opened the <span className="font-medium">Referral Letter</span>{' '}
                  or the <span className="font-medium">Responsibility Form</span> yet
                  {confirmedDispatch && (
                    <>
                      {' '}for{' '}
                      <span className="font-mono font-medium">{confirmedDispatch.dispatch_id}</span>
                    </>
                  )}
                  .
                </span>
                <span className="block">
                  The dispatch is already saved on the server — you can reprint either document
                  any time from the <span className="font-medium">Dispatches</span> list on this
                  order. The samples won't move forward without that paperwork though, so don't
                  forget to print before sending them out.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSkipPrintConfirmOpen(false)}>
                Stay & Print
              </Button>
              <Button
                onClick={confirmDoneSkipPrint}
                className="bg-amber-500 hover:bg-amber-600 focus:ring-amber-500"
              >
                Close anyway
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel-dispatch confirmation — collects an optional reason and
            spells out the side-effect (tests revert to Sample Collected so
            a fresh dispatch can be issued). Same Dialog (not AlertDialog)
            choice as above — see comment on the print nudge for context. */}
        <Dialog
          open={cancelDispatchTarget !== null}
          onOpenChange={(open) => {
            // Block dismiss while the API call is in flight so the spinner
            // stays visible. Otherwise reset target + reason on close.
            if (!open && cancellingDispatchId === null) {
              setCancelDispatchTarget(null);
              setCancelDispatchReason('');
            }
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <X className="h-5 w-5 text-rose-500" />
                Cancel dispatch{cancelDispatchTarget ? ` ${cancelDispatchTarget.dispatch_id}` : ''}?
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">
                  This dispatch was issued to{' '}
                  <span className="font-medium">
                    {cancelDispatchTarget?.partner_name || 'the external lab'}
                  </span>{' '}
                  with {cancelDispatchTarget?.tests.length ?? 0}{' '}
                  test{(cancelDispatchTarget?.tests.length ?? 0) === 1 ? '' : 's'}.
                </span>
                <span className="block">
                  Each test still in <span className="font-medium">processing</span> will be
                  reverted to <span className="font-medium">Sample Collected</span>. You can then
                  issue a fresh dispatch (to the same or a different partner) without any
                  manual reset. Tests with results already entered are left as-is.
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1 pt-1">
              <Label htmlFor="cancel-dispatch-reason" className="text-xs text-muted-foreground">
                Reason (optional, recorded on audit log)
              </Label>
              <Textarea
                id="cancel-dispatch-reason"
                value={cancelDispatchReason}
                onChange={(e) => setCancelDispatchReason(e.target.value)}
                placeholder="e.g. Wrong partner selected; sample to be re-routed."
                className="min-h-[4rem] text-sm"
                disabled={cancellingDispatchId !== null}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCancelDispatchTarget(null);
                  setCancelDispatchReason('');
                }}
                disabled={cancellingDispatchId !== null}
              >
                Keep dispatch
              </Button>
              <Button
                onClick={() => void confirmCancelDispatch()}
                disabled={cancellingDispatchId !== null}
                className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-500"
              >
                {cancellingDispatchId !== null ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cancelling…
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Cancel dispatch
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add / Edit Lab Partner Dialog */}
        <Dialog
          open={isAddPartnerDialogOpen}
          onOpenChange={(open) => {
            setIsAddPartnerDialogOpen(open);
            if (!open) resetPartnerForm();
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingPartnerId !== null ? (
                  <Pencil className="h-5 w-5 text-blue-500" />
                ) : (
                  <Plus className="h-5 w-5 text-emerald-500" />
                )}
                {editingPartnerId !== null ? 'Edit Lab Partner' : 'Add Lab Partner'}
              </DialogTitle>
              <DialogDescription>
                {editingPartnerId !== null
                  ? 'Update partner details. The address and addressee role are printed on referral letters and responsibility forms.'
                  : 'Add a new external laboratory as an outsourced partner for test processing. The address and addressee role are printed on referral letters and responsibility forms.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="partner-name">Partner Name *</Label>
                  <Input
                    id="partner-name"
                    value={newPartnerName}
                    onChange={(e) => setNewPartnerName(e.target.value)}
                    placeholder="e.g. Clinix Healthcare"
                    disabled={isSubmittingPartner}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="partner-code">Code (optional)</Label>
                  <Input
                    id="partner-code"
                    value={newPartnerCode}
                    onChange={(e) => setNewPartnerCode(e.target.value)}
                    placeholder="e.g. CLINIX"
                    disabled={isSubmittingPartner}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="partner-contact-title">Addressee Role</Label>
                  <Input
                    id="partner-contact-title"
                    value={newPartnerContactTitle}
                    onChange={(e) => setNewPartnerContactTitle(e.target.value)}
                    placeholder="e.g. The Chief Executive Officer"
                    disabled={isSubmittingPartner}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="partner-email">Email (optional)</Label>
                  <Input
                    id="partner-email"
                    type="email"
                    value={newPartnerEmail}
                    onChange={(e) => setNewPartnerEmail(e.target.value)}
                    placeholder="e.g. contact@clinix.healthcare"
                    disabled={isSubmittingPartner}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="partner-phone">Phone (optional)</Label>
                  <Input
                    id="partner-phone"
                    value={newPartnerPhone}
                    onChange={(e) => setNewPartnerPhone(e.target.value)}
                    placeholder="e.g. +234-1-234-5678"
                    disabled={isSubmittingPartner}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="partner-address">Postal Address</Label>
                <Textarea
                  id="partner-address"
                  value={newPartnerAddress}
                  onChange={(e) => setNewPartnerAddress(e.target.value)}
                  placeholder={'e.g.\nPlot B, Block XII, Alhaji Adejumo Avenue,\n(beside Total Filling Station),\nOff Oshodi Gbagada Expressway,\nAnthony, Lagos.'}
                  className="min-h-[6rem] text-sm"
                  disabled={isSubmittingPartner}
                />
                <p className="text-xs text-muted-foreground">
                  One line per row. Used on referral letters and responsibility forms.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddPartnerDialogOpen(false)}
                disabled={isSubmittingPartner}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitPartner}
                disabled={isSubmittingPartner || !newPartnerName.trim()}
                className={
                  editingPartnerId !== null
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }
              >
                {isSubmittingPartner ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {editingPartnerId !== null ? 'Saving...' : 'Adding...'}
                  </>
                ) : editingPartnerId !== null ? (
                  <>
                    <Pencil className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Partner
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manage Lab Partners Dialog */}
        <Dialog
          open={isManagePartnersDialogOpen}
          onOpenChange={(open) => {
            setIsManagePartnersDialogOpen(open);
            // Lazily load partners the first time it's opened so the list
            // works even if the user never went through the dispatch flow.
            if (open && labPartners.length === 0 && !loadingLabPartners) {
              void loadLabPartners();
            }
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-500" />
                Manage Lab Partners
              </DialogTitle>
              <DialogDescription>
                View and manage all lab partners for outsourced test processing.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {labPartners.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <p>No lab partners added yet.</p>
                  <p className="text-xs mt-1">Click "Add Partner" to create one.</p>
                </div>
              ) : (
                labPartners.map((partner) => (
                  <div key={partner.id} className="flex items-start justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-medium text-sm">{partner.name}</p>
                      {partner.code && (
                        <p className="text-xs text-muted-foreground">Code: {partner.code}</p>
                      )}
                      {partner.contact_person_title && (
                        <p className="text-xs text-muted-foreground">
                          Addressee: {partner.contact_person_title}
                        </p>
                      )}
                      {partner.address && (
                        <p className="text-xs text-muted-foreground whitespace-pre-line">
                          {partner.address}
                        </p>
                      )}
                      {partner.email && (
                        <p className="text-xs text-muted-foreground">📧 {partner.email}</p>
                      )}
                      {partner.phone && (
                        <p className="text-xs text-muted-foreground">📞 {partner.phone}</p>
                      )}
                    </div>
                    <div className="ml-2 flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditPartnerDialog(partner)}
                        disabled={deletingPartnerId === partner.id}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-2"
                        title={`Edit ${partner.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePartner(partner.id, partner.name)}
                        disabled={deletingPartnerId === partner.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                        title={`Delete ${partner.name}`}
                      >
                        {deletingPartnerId === partner.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsManagePartnersDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Partner Confirmation Dialog */}
        <Dialog open={deleteConfirmPartnerId !== null} onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmPartnerId(null);
            setDeleteConfirmPartnerName('');
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Delete Lab Partner?
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <p className="text-sm">
                Are you sure you want to delete <strong>"{deleteConfirmPartnerName}"</strong>?
              </p>
              <p className="text-xs text-muted-foreground">
                This action cannot be undone. The lab partner will be permanently removed from the system.
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteConfirmPartnerId(null);
                  setDeleteConfirmPartnerName('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDeletePartner}
                disabled={deletingPartnerId === deleteConfirmPartnerId}
                className="bg-red-600 hover:bg-red-700"
              >
                {deletingPartnerId === deleteConfirmPartnerId ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Delete Partner
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enter Results Dialog */}
        <Dialog open={isResultsDialogOpen} onOpenChange={setIsResultsDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-500" />
                {selectedTest?.status === LAB_TEST_STATUS.REJECTED ? 'Rework & Resubmit Results' : 'Enter Results'}
              </DialogTitle>
              <DialogDescription>
                {selectedTest?.status === LAB_TEST_STATUS.REJECTED
                  ? `Edit and resubmit corrected results for ${selectedTest?.name}` 
                  : `Enter results for ${selectedTest?.name}`}
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedTest && (
              <div className="space-y-4 py-4">
                {selectedTest.status === LAB_TEST_STATUS.REJECTED && (
                  <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                    <div className="flex items-start gap-3">
                      <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-rose-800 dark:text-rose-200">
                          Test Rejected - Requires Correction
                        </p>
                        <p className="text-sm text-rose-700 dark:text-rose-300 mt-1">
                          The test result was rejected. Please review and correct the values below before resubmitting.
                        </p>
                      {selectedTest.verificationNotes && (
                          <div className="mt-3 p-2 rounded bg-rose-100 dark:bg-rose-900/40 border border-rose-300 dark:border-rose-700">
                            <p className="text-xs font-medium text-rose-800 dark:text-rose-200 mb-1">Rejection Reason:</p>
                            <p className="text-xs text-rose-700 dark:text-rose-300">
                              {formatRejectionReason(selectedTest.verificationNotes)}
                            </p>
                          </div>
                        )}
                        {selectedTest.rejectedBy && (
                          <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">
                            Rejected by {selectedTest.rejectedBy}
                            {selectedTest.rejectedAt && ` on ${formatDate(selectedTest.rejectedAt)} at ${formatTime(selectedTest.rejectedAt)}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient:</span><span className="font-medium">{selectedOrder.patient.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Test:</span><span className="font-medium">{selectedTest.name} ({selectedTest.code})</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Processing:</span>
                    <Badge variant="outline" className={selectedTest.processingMethod === 'In-house' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-indigo-500/10 text-indigo-600'}>
                      {selectedTest.processingMethod}
                      {selectedTest.outsourcedLab && ` - ${selectedTest.outsourcedLab}`}
                    </Badge>
                  </div>
                </div>

                {/* Entry Mode Toggle - Hidden for Outsourced tests */}
                {selectedTest.processingMethod !== 'Outsourced' && (
                <div className="space-y-2">
                  <Label>Result Entry Method</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setResultEntryMode('values')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        resultEntryMode === 'values' 
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' 
                          : 'border-muted hover:border-amber-300'
                      }`}
                    >
                      <p className="font-medium text-sm">Enter Values</p>
                      <p className="text-xs text-muted-foreground">Type in result values manually</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultEntryMode('upload')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        resultEntryMode === 'upload' 
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
                          : 'border-muted hover:border-indigo-300'
                      }`}
                    >
                      <p className="font-medium text-sm">Upload File</p>
                      <p className="text-xs text-muted-foreground">Upload PDF, image, or document</p>
                    </button>
                  </div>
                </div>
                )}

                {/* Outsourced Notice */}
                {selectedTest.processingMethod === 'Outsourced' && (
                  <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                    <div className="flex items-center gap-3">
                      <Truck className="h-5 w-5 text-indigo-600" />
                      <div>
                        <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
                          Outsourced Test Results
                        </p>
                        <p className="text-sm text-indigo-700 dark:text-indigo-300">
                          Results for outsourced tests must be uploaded as files. Manual value entry is not available.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {resultEntryMode === 'values' ? (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 text-amber-500" />
                        {selectedTest.name} ({selectedTest.code})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        if (isOtherLabTest(selectedTest)) {
                          const updateRow = (rowId: string, field: keyof CustomResultRow, value: string) => {
                            setCustomResultRows((prev) => prev.map((row) => row.id === rowId ? { ...row, [field]: value } : row));
                          };
                          return (
                            <div className="space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">Custom / Other Results</p>
                                  <p className="text-xs text-muted-foreground">
                                    Add one row for each custom investigation. Known template tests should be ordered separately.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCustomResultRows((prev) => [...prev, createCustomResultRow()])}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" />
                                  Add Result Row
                                </Button>
                              </div>
                              <div className="space-y-3">
                                {customResultRows.map((row, index) => (
                                  <div key={row.id} className="rounded-lg border p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-medium">Result {index + 1}</span>
                                      {customResultRows.length > 1 && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setCustomResultRows((prev) => prev.filter((item) => item.id !== row.id));
                                            setCustomResultFiles((prev) => {
                                              const next = { ...prev };
                                              delete next[row.id];
                                              return next;
                                            });
                                          }}
                                          className="h-7 text-destructive"
                                        >
                                          <X className="h-3.5 w-3.5 mr-1" />
                                          Remove
                                        </Button>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <Label className="text-xs">Investigation *</Label>
                                        <Input value={row.name} onChange={(e) => updateRow(row.id, 'name', e.target.value)} placeholder="e.g. ANA" />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Result</Label>
                                        <Input value={row.value} onChange={(e) => updateRow(row.id, 'value', e.target.value)} placeholder="e.g. Positive or 12" />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Unit</Label>
                                        <Input value={row.unit} onChange={(e) => updateRow(row.id, 'unit', e.target.value)} placeholder="e.g. mg/L" />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Reference Range</Label>
                                        <Input value={row.reference_range} onChange={(e) => updateRow(row.id, 'reference_range', e.target.value)} placeholder="e.g. 0-10" />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <Label className="text-xs">Row File</Label>
                                        <Input
                                          type="file"
                                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                          onChange={(e) => setCustomResultFiles((prev) => ({ ...prev, [row.id]: e.target.files?.[0] || null }))}
                                        />
                                        {customResultFiles[row.id] && (
                                          <p className="text-xs text-muted-foreground">{customResultFiles[row.id]?.name}</p>
                                        )}
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Notes</Label>
                                        <Input value={row.notes} onChange={(e) => updateRow(row.id, 'notes', e.target.value)} placeholder="Optional comments" />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }

                        const tpl = getTemplateForTest(selectedTest);
                        if (!tpl) {
                          return (
                            <div className="space-y-2">
                              <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-medium">No Test Template configured for </span>
                                  <code className="font-mono">{selectedTest.code}</code>
                                  <span>. Reference ranges and abnormal-flagging are unavailable. Ask the lab admin to add this template under <span className="font-medium">Laboratory → Test Templates</span>.</span>
                                </div>
                              </div>
                              <Label>Result Value</Label>
                              <Input
                                value={resultValues['Result'] || ''}
                                onChange={(e) => setResultValues({ Result: e.target.value })}
                                placeholder="Enter result..."
                              />
                            </div>
                          );
                        }

                        // Stable 4-column grid (parameter | result | unit | reference range)
                        // matches the Lab Report dialog so users see the same column structure
                        // when entering results and when reviewing them later.
                        // The warning row spans all 4 columns so neighbouring rows don't shift
                        // when a value trips Abnormal/Critical.
                        return (
                          <div>
                            <div className="grid grid-cols-[minmax(10rem,14rem)_7rem_5rem_1fr] gap-x-3 border-b pb-2 mb-3 text-sm font-medium text-muted-foreground">
                              <span>Parameter</span>
                              <span>Result</span>
                              <span>Unit</span>
                              <span>Reference Range</span>
                            </div>
                            <div className="grid grid-cols-[minmax(10rem,14rem)_7rem_5rem_1fr] gap-x-3 gap-y-2 items-center">
                              {tpl.fields.map((field) => {
                                const value = resultValues[field.name] || '';
                                const status = classifyValue(value, field);
                                return (
                                  <Fragment key={field.name}>
                                    <Label className="text-sm">{field.name}</Label>
                                    <Input
                                      value={value}
                                      onChange={(e) =>
                                        setResultValues((prev) => ({
                                          ...prev,
                                          [field.name]: e.target.value,
                                        }))
                                      }
                                      placeholder="Value"
                                      className={
                                        status === 'Critical'
                                          ? 'border-red-500 focus:border-red-500'
                                          : status === 'Abnormal'
                                            ? 'border-amber-500 focus:border-amber-500'
                                            : ''
                                      }
                                    />
                                    <span className="text-sm text-muted-foreground truncate">
                                      {field.unit}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate">
                                      {field.normalRange ? `Normal: ${field.normalRange}` : ''}
                                    </span>
                                    {status !== 'Normal' && (
                                      <div
                                        className={`col-span-4 text-xs flex items-center gap-1 -mt-1 ${
                                          status === 'Critical'
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-amber-600 dark:text-amber-400'
                                        }`}
                                      >
                                        <AlertTriangle className="h-3 w-3" />
                                        {status === 'Critical'
                                          ? 'Critical value! Please verify and confirm.'
                                          : 'Abnormal value — outside normal range.'}
                                      </div>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <Label>Upload Result Files</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground mb-2">Drag and drop or click to upload</p>
                      <p className="text-xs text-muted-foreground">Supports PDF, Word, Images (JPG, PNG)</p>
                      <Input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        onChange={handleFileChange}
                        className="mt-3"
                      />
                    </div>
                    {uploadedFiles.length > 0 && (
                      <div className="text-sm space-y-1">
                        {uploadedFiles.map((f, i) => (
                          <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-green-600">
                            <span className="flex-1 truncate">Selected: {f.name}</span>
                            <button
                              type="button"
                              onClick={() => removeUploadedFile(i)}
                              className="text-red-500 hover:text-red-700 text-xs font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsResultsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitResults} disabled={isSubmitting} className="bg-amber-500 hover:bg-amber-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {selectedTest?.status === LAB_TEST_STATUS.REJECTED ? 'Resubmit Corrected Results' : 'Submit Results'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
    </TooltipProvider>
  );
}
