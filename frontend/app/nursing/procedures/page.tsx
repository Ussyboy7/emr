"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatDisplayDate, formatDisplayDateMedium, formatDisplayTime } from "@/lib/dates";
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiFetch } from '@/lib/api-client';
import { wardService, nursingService, visitService } from '@/lib/services';
import { useNursingPageAuth } from '@/hooks/use-nursing-page-auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import {
  formatCompletedProcedureDescription,
  parseProcedureDetails,
} from '@/lib/nursing/procedure-description';
import {
  Syringe, Bandage, Pill, Search, Users, Clock, CheckCircle2, AlertTriangle,
  Eye, Calendar, Loader2, Save, Activity, ArrowRight, User, Stethoscope, DoorOpen, Plus, Building2
} from 'lucide-react';
import { NURSING_DRESSING_PROCEDURE_TYPES } from '@/lib/constants/medical-data';
import {
  AddNursingProcedureDialog,
  type AddNursingProcedureResult,
} from '@/components/nursing/AddNursingProcedureDialog';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { completeNursingProcedureVisit } from '@/lib/nursing/nursing-repeat-procedure';

const DRESSING_INTERVENTION_MAP: Record<string, string> = {
  Dressing: 'dressing',
  Suturing: 'sutures',
  'Suture removal': 'suture_removal',
  'Incision and drainage': 'i_and_d',
};

// ==================== TYPES ====================
interface Procedure {
  id: string;
  patientDbId?: number;
  visitId?: number;
  consultationSessionId?: number;
  /** True when a new nursing_procedure visit was created for this queue item. */
  createdNursingVisit?: boolean;
  type: 'injection' | 'dressing' | 'medication' | 'ward_admission';
  status: 'pending' | 'completed';
  patientName: string;
  patientId: string;
  personalNumber: string;
  age: number;
  gender: string;
  ward: string;
  orderedAt: string;
  completedAt?: string;
  orderedBy: string;
  priority: 'Emergency' | 'High' | 'Medium' | 'Low';
  allergies: string[];
  description?: string;
  // Type-specific details
  details: {
    // Injection
    medication?: string;
    dosage?: string;
    route?: string;
    frequency?: string;
    // Dressing
    woundType?: string;
    woundLocation?: string;
    instructions?: string;
    // Medication
    scheduledTime?: string;
    // Observation Admission (from order description)
    admissionDiagnosis?: string;
    presentingComplaint?: string;
  };
}

// Procedures data will be loaded from API

// ==================== HELPERS ====================
const getPriorityBadge = (priority: string) => {
  const styles: Record<string, string> = {
    Emergency: 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10',
    High: 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10',
    Medium: 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10',
    Low: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  };
  return styles[priority] || 'border-gray-500/50 text-gray-600 bg-gray-500/10';
};

const getTypeBorderColor = (type: Procedure['type']) => {
  switch (type) {
    case 'injection':
      return 'border-l-emerald-500';
    case 'dressing':
      return 'border-l-violet-500';
    case 'ward_admission':
      return 'border-l-amber-500';
    default:
      return 'border-l-blue-500';
  }
};

const getTypeConfig = (type: string) => {
  const configs: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
    'injection': { icon: Syringe, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10 border-emerald-500/30', label: 'Injection' },
    'dressing': { icon: Bandage, color: 'text-violet-500', bgColor: 'bg-violet-500/10 border-violet-500/30', label: 'Dressing' },
    'medication': { icon: Pill, color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', label: 'Medication' },
    'ward_admission': { icon: DoorOpen, color: 'text-amber-500', bgColor: 'bg-amber-500/10 border-amber-500/30', label: 'Observation Admission' },
  };
  return configs[type] || configs['medication'];
};

const WOUND_INTERVENTION_LABELS: Record<string, string> = {
  dressing: 'Dressing',
  sutures: 'Suturing',
  suture_removal: 'Suture removal',
  i_and_d: 'Incision and drainage',
};

const formatOrderDateTime = (dateString?: string) => {
  if (!dateString) return { date: '—', time: '' };
  return {
    date: formatDisplayDateMedium(dateString),
    time: formatDisplayTime(dateString),
  };
};

const getTimeSince = (dateString: string) => {
  const now = new Date();
  const ordered = new Date(dateString);
  const diffMs = now.getTime() - ordered.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  return `${diffHrs}h ${diffMins % 60}m ago`;
};

/** Anatomical sites where left/right must be recorded */
const INJECTION_SITES_NEEDING_LATERALITY = new Set([
  'Deltoid',
  'Vastus Lateralis',
  'Dorsogluteal',
  'Ventrogluteal',
  'Forearm vein',
  'Hand vein',
]);

function injectionSiteNeedsLaterality(site: string): boolean {
  return INJECTION_SITES_NEEDING_LATERALITY.has(site);
}

function getInjectionSiteOptions(route?: string): { value: string; label: string }[] {
  const r = (route || '').toLowerCase();
  const hasSc = r.includes('subcutaneous') || /\bsc\b/.test(r);
  const hasIm = r.includes('intramuscular') || /\bim\b/.test(r);
  const hasIv = r.includes('intravenous') || /\biv\b/.test(r) || r.includes('infusion');

  if (hasIv && !hasIm && !hasSc) {
    return [
      { value: 'Forearm vein', label: 'Forearm (peripheral IV)' },
      { value: 'Hand vein', label: 'Hand (peripheral IV)' },
      { value: 'Other IV site', label: 'Other (specify in notes)' },
    ];
  }
  if (hasSc && !hasIm) {
    return [
      { value: 'Abdomen', label: 'Abdomen (SC)' },
      { value: 'Deltoid', label: 'Outer upper arm / Deltoid (SC)' },
      { value: 'Vastus Lateralis', label: 'Anterolateral thigh (SC)' },
      { value: 'Other SC site', label: 'Other (specify in notes)' },
    ];
  }
  return [
    { value: 'Deltoid', label: 'Deltoid (Upper arm)' },
    { value: 'Vastus Lateralis', label: 'Vastus Lateralis (Thigh)' },
    { value: 'Dorsogluteal', label: 'Dorsogluteal (Buttock)' },
    { value: 'Ventrogluteal', label: 'Ventrogluteal (Hip)' },
    { value: 'Abdomen', label: 'Abdomen' },
    { value: 'Other', label: 'Other (specify in notes)' },
  ];
}

const emptyInjectionForm = () => ({
  site: '',
  administeredTime: '',
  notes: '',
  laterality: '' as '' | 'Left' | 'Right',
  immediateReaction: 'none' as 'none' | 'yes',
  reactionDetail: '',
});

function formatAdministrationNote(timeHm: string): string {
  const t = (timeHm || '').trim();
  if (!t) return '';
  return `Time of administration: ${t} on ${formatDisplayDate(new Date())}`;
}

function procedureSummaryLine(procedure: Procedure): string {
  const desc = (procedure.description || '').trim();
  if (procedure.type === 'injection' || procedure.type === 'medication') {
    const parts = [procedure.details.medication, procedure.details.dosage, procedure.details.route]
      .filter((x) => x && String(x).trim() !== '');
    if (parts.length) return parts.join(' · ');
    return desc.length > 90 ? `${desc.slice(0, 90)}…` : desc;
  }
  if (procedure.type === 'dressing') {
    const wt = procedure.details.woundType;
    const wl = procedure.details.woundLocation;
    if (wt && wl) return `${wt} · ${wl}`;
    if (wt || wl) return [wt, wl].filter(Boolean).join(' · ');
    return desc.length > 90 ? `${desc.slice(0, 90)}…` : desc;
  }
  if (procedure.type === 'ward_admission') {
    const bits = [procedure.details.admissionDiagnosis, procedure.details.presentingComplaint].filter(Boolean);
    if (bits.length) return bits.join(' · ');
    return desc.length > 90 ? `${desc.slice(0, 90)}…` : desc;
  }
  return desc.length > 90 ? `${desc.slice(0, 90)}…` : desc;
}

function nursingOrderToProcedure(order: any): Procedure {
  const typeMap: Record<string, Procedure['type']> = {
    injection: 'injection',
    dressing: 'dressing',
    wound_care: 'dressing',
    medication: 'medication',
    'iv infusion': 'injection',
    'ward admission': 'ward_admission',
    'observation admission': 'ward_admission',
    ward_admission: 'ward_admission',
    observation_admission: 'ward_admission',
  };
  const procedureType = typeMap[String(order.order_type || '').toLowerCase()] || 'medication';

  const priorityMap: Record<string, Procedure['priority']> = {
    urgent: 'Emergency',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  const priority = priorityMap[String(order.priority || '').toLowerCase()] || 'Medium';

  const allergies = Array.isArray(order.patient_allergies)
    ? order.patient_allergies.map((a: unknown) => String(a))
    : [];

  const description = order.description || '';
  let parsedWard = '';
  let details: Procedure['details'] = {};

  if (procedureType === 'ward_admission') {
    const wardMatch = description.match(/to\s+([^.,;]+)/i);
    if (wardMatch?.[1]) {
      parsedWard = wardMatch[1].trim();
    }
    const diagPcMatch = description.match(/Diagnosis:\s*(.+?)\.\s*Presenting complaint:\s*(.+?)(?:\s*\.|$)/i);
    if (diagPcMatch) {
      const diag = diagPcMatch[1].trim();
      const pc = diagPcMatch[2].trim();
      details.admissionDiagnosis = diag && diag.toLowerCase() !== 'n/a' ? diag : undefined;
      details.presentingComplaint = pc && pc.toLowerCase() !== 'n/a' ? pc : undefined;
    }
  } else {
    details = parseProcedureDetails(procedureType, description, order.frequency || '');
  }

  const visitRaw = order.visit;
  const visitId =
    typeof visitRaw === 'number'
      ? visitRaw
      : visitRaw && typeof visitRaw === 'object' && visitRaw.id != null
        ? Number(visitRaw.id)
        : undefined;
  const patientRaw = order.patient;
  const patientDbId =
    typeof patientRaw === 'number'
      ? patientRaw
      : patientRaw && typeof patientRaw === 'object' && patientRaw.id != null
        ? Number(patientRaw.id)
        : undefined;
  const sessionRaw = order.consultation_session;
  const consultationSessionId =
    typeof sessionRaw === 'number'
      ? sessionRaw
      : sessionRaw && typeof sessionRaw === 'object' && sessionRaw.id != null
        ? Number(sessionRaw.id)
        : undefined;

  return {
    id: String(order.id),
    patientDbId: patientDbId != null && Number.isFinite(patientDbId) ? patientDbId : undefined,
    visitId: visitId != null && Number.isFinite(visitId) ? visitId : undefined,
    consultationSessionId:
      consultationSessionId != null && Number.isFinite(consultationSessionId)
        ? consultationSessionId
        : undefined,
    type: procedureType,
    status: order.status === 'completed' ? 'completed' : 'pending',
    patientName: order.patient_name ?? '',
    patientId: order.patient_patient_id ?? '',
    personalNumber: order.patient_personal_number ?? '',
    age: order.patient_age ?? 0,
    gender: order.patient_gender ?? '',
    ward: parsedWard,
    orderedAt: order.ordered_at,
    completedAt: order.completed_at || order.updated_at || undefined,
    orderedBy: order.ordered_by_name || 'Unknown',
    priority,
    allergies,
    details,
    description,
  };
}

// ==================== MAIN COMPONENT ====================
export default function ProceduresQueuePage() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [queueStats, setQueueStats] = useState({
    total: 0,
    pending: 0,
    completed: 0,
    injections: 0,
  });
  const [wards, setWards] = useState<any[]>([]);
  const [wardSearch, setWardSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { ready, handleAuthError } = useNursingPageAuth();
  const { currentUser } = useCurrentUser();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const hasActiveFilters =
    debouncedSearch.trim() !== '' ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    genderFilter !== 'all' ||
    Boolean(dateRange.from) ||
    Boolean(dateRange.to) ||
    dateFilter !== 'all';

  const totalOrdersLabel = useMemo(() => {
    if (dateFilter === 'today') return "Today's Orders";
    if (dateFilter === 'week') return 'This Week';
    if (dateFilter === 'month') return 'This Month';
    return 'All Orders';
  }, [dateFilter]);

  // Dialog states
  const [isPerformDialogOpen, setIsPerformDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAddProcedureOpen, setIsAddProcedureOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [viewProcedure, setViewProcedure] = useState<Procedure | null>(null);
  const [viewRecord, setViewRecord] = useState<{
    site?: string;
    notes?: string;
    wound_intervention?: string;
    performed_by_name?: string;
    performed_at?: string;
  } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [injectionForm, setInjectionForm] = useState(() => emptyInjectionForm());
  const [dressingForm, setDressingForm] = useState({ dressingType: '', woundCondition: '', observations: '' });
  const [medicationForm, setMedicationForm] = useState({ site: '', administeredTime: '', notes: '' });
  const [wardAdmissionForm, setWardAdmissionForm] = useState({ notes: '' });

  const resetForms = () => {
    setInjectionForm(emptyInjectionForm());
    setDressingForm({ dressingType: '', woundCondition: '', observations: '' });
    setMedicationForm({ site: '', administeredTime: '', notes: '' });
    setWardAdmissionForm({ notes: '' });
  };

  const injectionSiteOptionsForDialog = useMemo(() => {
    if (!selectedProcedure || selectedProcedure.type !== 'injection') return [];
    return getInjectionSiteOptions(selectedProcedure.details.route);
  }, [selectedProcedure]);

  const injectionCanComplete = useMemo(() => {
    if (!selectedProcedure || selectedProcedure.type !== 'injection') return true;
    const opts = injectionSiteOptionsForDialog;
    const validSite = !!injectionForm.site && opts.some((o) => o.value === injectionForm.site);
    if (!validSite) return false;
    if (!injectionForm.administeredTime.trim()) return false;
    if (injectionSiteNeedsLaterality(injectionForm.site) && !injectionForm.laterality) return false;
    if (injectionForm.immediateReaction === 'yes' && !injectionForm.reactionDetail.trim()) return false;
    return true;
  }, [selectedProcedure, injectionForm, injectionSiteOptionsForDialog]);

  const dressingCanComplete = useMemo(() => {
    if (!selectedProcedure || selectedProcedure.type !== 'dressing') return true;
    return Boolean(dressingForm.dressingType && dressingForm.woundCondition);
  }, [selectedProcedure, dressingForm.dressingType, dressingForm.woundCondition]);

  const medicationCanComplete = useMemo(() => {
    if (!selectedProcedure || selectedProcedure.type !== 'medication') return true;
    if (!medicationForm.administeredTime.trim()) return false;
    return true;
  }, [selectedProcedure, medicationForm.administeredTime]);
  
  useEffect(() => {
    if (!ready) return;
    wardService
      .getWards({ status: 'active' })
      .then((wardsResponse) => {
        setWards(wardsResponse.results || []);
      })
      .catch((wardError) => {
        console.error('Failed to load wards:', wardError);
        if (handleAuthError(wardError)) return;
        toast.error('Could not load wards. The ward picker will be empty until the wards API is reachable.');
        setWards([]);
      });
  }, [ready, handleAuthError]);

  const appendQueueDateFilters = useCallback(
    (qs: URLSearchParams) => {
      if (dateRange.from || dateRange.to) {
        if (dateRange.from) qs.set('ordered_at_after', dateRange.from);
        if (dateRange.to) qs.set('ordered_at_before', dateRange.to);
      } else if (dateFilter !== 'all') {
        qs.set('date_filter', dateFilter);
      }
    },
    [dateFilter, dateRange.from, dateRange.to]
  );

  const loadQueueStats = useCallback(async () => {
    try {
      const params: Record<string, string | undefined> = {};
      if (dateRange.from || dateRange.to) {
        if (dateRange.from) params.ordered_at_after = dateRange.from;
        if (dateRange.to) params.ordered_at_before = dateRange.to;
      } else if (dateFilter !== 'all') {
        params.date_filter = dateFilter;
      }
      const stats = await nursingService.getProceduresQueueStats(params);
      setQueueStats({
        total: stats.total ?? 0,
        pending: stats.pending ?? 0,
        completed: stats.completed ?? 0,
        injections: stats.injections ?? 0,
      });
    } catch (e) {
      console.error('Failed to load procedure queue stats:', e);
      if (handleAuthError(e)) return;
      toast.error('Failed to load procedure queue statistics');
    }
  }, [dateFilter, dateRange.from, dateRange.to, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadQueueStats();
  }, [ready, loadQueueStats]);

  const getCompletedIconStyle = (type: Procedure['type']) => {
    // Use module/type colors (same as typeConfig palettes)
    switch (type) {
      case 'injection':
        return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'dressing':
        return 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10';
      case 'ward_admission':
        return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'medication':
      default:
        return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
    }
  };

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      qs.set('procedures_queue', '1');
      qs.set('page', String(currentPage));
      if (statusFilter !== 'all') {
        qs.set('status', statusFilter);
      }
      qs.set('page_size', String(itemsPerPage));
      const q = debouncedSearch.trim();
      if (q) qs.set('search', q);
      if (typeFilter !== 'all') qs.set('queue_type', typeFilter);
      if (priorityFilter !== 'all') {
        const pm: Record<string, string> = {
          Emergency: 'urgent',
          High: 'high',
          Medium: 'medium',
          Low: 'low',
        };
        const apiPri = pm[priorityFilter];
        if (apiPri) qs.set('priority', apiPri);
      }
      if (genderFilter !== 'all') {
        qs.set('patient_gender', genderFilter.toLowerCase());
      }
      appendQueueDateFilters(qs);
      const ordersResult = await apiFetch<{ results: any[]; count?: number }>(
        `/nursing/orders/?${qs.toString()}`
      );
      const rows = (ordersResult.results || []).map(nursingOrderToProcedure);
      setProcedures(rows);
      setTotalCount(typeof ordersResult.count === 'number' ? ordersResult.count : rows.length);
    } catch (err) {
      console.error('Error loading orders:', err);
      if (handleAuthError(err)) return;
      setError('Failed to load procedures queue. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    itemsPerPage,
    debouncedSearch,
    typeFilter,
    statusFilter,
    priorityFilter,
    genderFilter,
    appendQueueDateFilters,
    handleAuthError,
  ]);

  useEffect(() => {
    if (!ready) return;
    void loadOrders();
  }, [ready, loadOrders]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    typeFilter,
    statusFilter,
    priorityFilter,
    dateFilter,
    genderFilter,
    dateRange.from,
    dateRange.to,
    itemsPerPage,
  ]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // ==================== HANDLERS ====================
  const openViewDialog = async (procedure: Procedure) => {
    setViewProcedure(procedure);
    setViewRecord(null);
    setIsViewDialogOpen(true);
    if (procedure.status !== 'completed') return;
    try {
      setViewLoading(true);
      const orderId = Number(procedure.id);
      if (!Number.isFinite(orderId)) return;
      const row = await nursingService.resolveProcedureForOrder(orderId);
      if (row) {
        setViewRecord({
          site: typeof row.site === 'string' ? row.site : undefined,
          notes: typeof row.notes === 'string' ? row.notes : undefined,
          wound_intervention: typeof row.wound_intervention === 'string' ? row.wound_intervention : undefined,
          performed_by_name: typeof row.performed_by_name === 'string' ? row.performed_by_name : undefined,
          performed_at: typeof row.performed_at === 'string' ? row.performed_at : undefined,
        });
      }
    } catch (err) {
      console.error('Failed to load procedure record:', err);
      if (handleAuthError(err)) return;
      toast.error('Failed to load procedure details');
    } finally {
      setViewLoading(false);
    }
  };

  const openPerformDialog = (procedure: Procedure) => {
    resetForms();
    setSelectedProcedure(procedure);
    setIsPerformDialogOpen(true);
    if (procedure.type === 'injection') {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setInjectionForm({ ...emptyInjectionForm(), administeredTime: `${hh}:${mm}` });
    }
    if (procedure.type === 'medication') {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setMedicationForm((prev) => ({ ...prev, administeredTime: `${hh}:${mm}` }));
    }
  };

  const handleComplete = async () => {
    if (!selectedProcedure) return;
    setIsSubmitting(true);
    
    try {
      const orderId = parseInt(selectedProcedure.id);
      if (isNaN(orderId)) {
        toast.error('Invalid order ID');
        return;
      }

      if (selectedProcedure.type === 'injection') {
        const opts = getInjectionSiteOptions(selectedProcedure.details.route);
        if (!injectionForm.site || !opts.some((o) => o.value === injectionForm.site)) {
          toast.error('Select a valid injection site for the ordered route.');
          return;
        }
        if (!injectionForm.administeredTime.trim()) {
          toast.error('Enter the time of administration.');
          return;
        }
        if (injectionSiteNeedsLaterality(injectionForm.site) && !injectionForm.laterality) {
          toast.error('Select left or right for this injection site.');
          return;
        }
        if (injectionForm.immediateReaction === 'yes' && !injectionForm.reactionDetail.trim()) {
          toast.error('Describe the immediate reaction, or set immediate reaction to None.');
          return;
        }
      }

      if (selectedProcedure.type === 'medication') {
        if (!medicationForm.administeredTime.trim()) {
          toast.error('Enter the time of administration.');
          return;
        }
      }

      // Map frontend type to backend procedure_type
      const typeMap: Record<string, string> = {
        'injection': 'injection',
        'dressing': 'dressing',
        'medication': 'medication',
        'ward_admission': 'ward_admission',
      };
      
      // Use the nursing order's patient FK — do not re-resolve via ?patient_id= (not a backend filter).
      let patientDbId = selectedProcedure.patientDbId;
      if (!patientDbId) {
        const patientsResponse = await apiFetch<{ results: any[] }>(
          `/patients/?search=${encodeURIComponent(selectedProcedure.patientId)}`,
        );
        const patients = patientsResponse.results || [];
        const exact = patients.find((p) => p.patient_id === selectedProcedure.patientId);
        if (!exact) {
          throw new Error('Patient not found. Cannot complete procedure.');
        }
        patientDbId = exact.id;
      }
      if (!patientDbId) {
        throw new Error('Patient not found. Cannot complete procedure.');
      }
      
      // Create procedure record with all form data
      let description = '';
      let notes = '';
      
      if (selectedProcedure.type === 'injection') {
        description = formatCompletedProcedureDescription('injection', selectedProcedure.details, selectedProcedure.description);
        
        const injectionNotes = [
          formatAdministrationNote(injectionForm.administeredTime),
          injectionSiteNeedsLaterality(injectionForm.site) && injectionForm.laterality && `Laterality: ${injectionForm.laterality}`,
          injectionForm.site && `Site: ${injectionForm.site}`,
          injectionForm.immediateReaction === 'yes'
            ? `Immediate reaction: ${injectionForm.reactionDetail.trim()}`
            : 'Immediate reaction: none',
          injectionForm.notes && `Notes: ${injectionForm.notes}`,
        ].filter(Boolean).join(' | ');
        
        notes = injectionNotes || injectionForm.notes || '';
      } else if (selectedProcedure.type === 'dressing') {
        description = formatCompletedProcedureDescription('dressing', selectedProcedure.details, selectedProcedure.description);
        
        const dressingNotes = [
          dressingForm.dressingType && `Type: ${dressingForm.dressingType}`,
          dressingForm.woundCondition && `Condition: ${dressingForm.woundCondition}`,
          dressingForm.observations && `Observations: ${dressingForm.observations}`,
        ].filter(Boolean).join(' | ');
        
        notes = dressingNotes || dressingForm.observations || '';
      } else if (selectedProcedure.type === 'ward_admission') {
        // For ward admissions, create both procedure record and admission record
        const wardName = selectedProcedure.ward || 'Female Medical Ward';
        description = `Observation Admission: Admitted to ${wardName}`;
        notes = wardAdmissionForm.notes || 'Patient admitted to ward';

        // Resolve ward ID from available wards (no hardcoded PK fallback).
        const byCode = wards.find(
          (w) => String(w.ward_code || '').toLowerCase() === String(wardName || '').toLowerCase()
        );
        const byName = wards.find(
          (w) => String(w.name || '').toLowerCase() === String(wardName || '').toLowerCase()
        );
        const fallbackWard = wards[0];
        const wardId = byCode?.id ?? byName?.id ?? fallbackWard?.id;
        if (!wardId) {
          throw new Error('No active ward found for admission. Please configure wards first.');
        }

        // Resolve visit for admission:
        // 1) use visit attached to nursing order
        // 2) use consultation session's visit if available
        // 3) fallback to in-progress visit
        // 4) fallback to latest visit (session may already be ended/completed)
        let visitId: number | undefined = selectedProcedure.visitId;
        if (!visitId && selectedProcedure.consultationSessionId) {
          try {
            const session = await apiFetch<any>(`/consultation/sessions/${selectedProcedure.consultationSessionId}/`);
            if (typeof session?.visit === 'number' && Number.isFinite(session.visit)) {
              visitId = session.visit;
            }
          } catch (sessionErr) {
            console.warn('Could not resolve visit from consultation session:', sessionErr);
          }
        }
        if (!visitId) {
          const activeVisit = await visitService.resolveVisit({
            patient: patientDbId,
            status: 'in_progress',
          });
          if (activeVisit?.id) {
            visitId = activeVisit.id;
          }
        }
        if (!visitId) {
          const latestVisit = await visitService.resolveVisit({
            patient: patientDbId,
            ordering: '-date,-time',
          });
          if (latestVisit?.id) {
            visitId = latestVisit.id;
          }
        }
        if (!visitId) {
          throw new Error('Patient has no visit record. Cannot create observation admission.');
        }

        // Check if patient is already admitted before creating admission
        try {
          const existingAdmissions = await apiFetch<{ results: any[] }>(`/admissions/?patient=${patientDbId}&status=admitted`);
          const admissions = existingAdmissions.results || [];
          if (admissions.length > 0) {
            throw new Error(`Patient is already admitted to ward. Please discharge first.`);
          }
        } catch (error: any) {
          if (error.message.includes('already admitted')) {
            throw error;
          }
          console.warn('Could not check existing admissions:', error);
        }

        const admissionDiagnosis =
          selectedProcedure.details.admissionDiagnosis ||
          wardAdmissionForm.notes ||
          `Observation admission ordered by ${selectedProcedure.orderedBy}`;
        const presentingComplaint =
          selectedProcedure.details.presentingComplaint ||
          selectedProcedure.details.admissionDiagnosis ||
          wardAdmissionForm.notes ||
          `Observation admission ordered by ${selectedProcedure.orderedBy}`;

        const admissionData = {
          patient: patientDbId,
          visit: visitId,
          ward: wardId,
          admission_type: 'observation',
          admitting_doctor: null,
          admission_diagnosis: admissionDiagnosis,
          presenting_complaint: presentingComplaint,
          admission_notes: `Admitted to ${wardName}. ${wardAdmissionForm.notes || ''}`.trim(),
          created_by: currentUser?.id,
        };
        await apiFetch('/admissions/', {
          method: 'POST',
          body: JSON.stringify(admissionData),
        });
      } else {
        description = formatCompletedProcedureDescription('medication', selectedProcedure.details, selectedProcedure.description);

        const medicationNotes = [
          medicationForm.administeredTime && `Administered at: ${medicationForm.administeredTime}`,
          medicationForm.site && `Site: ${medicationForm.site}`,
          medicationForm.notes && `Notes: ${medicationForm.notes}`,
        ].filter(Boolean).join(' | ');

        notes = medicationNotes || medicationForm.notes || '';
      }
      
      const performedSite =
        selectedProcedure.type === 'ward_admission'
          ? ''
          : selectedProcedure.type === 'injection'
            ? injectionSiteNeedsLaterality(injectionForm.site) && injectionForm.laterality
              ? `${injectionForm.laterality} — ${injectionForm.site}`
              : injectionForm.site
            : selectedProcedure.type === 'dressing'
              ? (selectedProcedure.details.woundLocation || '')
              : medicationForm.site || '';

      const procedureData: any = {
        patient: patientDbId,  // Use correct patient database ID
        nursing_order: orderId,  // Link to the original nursing order
        visit: selectedProcedure.visitId ?? null,
        procedure_type: typeMap[selectedProcedure.type] || 'other',
        description,
        site: performedSite,
        notes,
        performed_by: currentUser?.id ? Number(currentUser.id) : null,
        medication_name:
          selectedProcedure.type === 'injection'
            ? (selectedProcedure.details.medication || '').slice(0, 200)
            : selectedProcedure.type === 'dressing'
              ? (selectedProcedure.details.woundType || '').slice(0, 200)
              : selectedProcedure.type === 'medication'
                ? (selectedProcedure.details.medication || '').slice(0, 200)
                : '',
        dosage:
          selectedProcedure.type === 'injection' || selectedProcedure.type === 'medication'
            ? (selectedProcedure.details.dosage || '').slice(0, 200)
            : '',
        route:
          selectedProcedure.type === 'injection' || selectedProcedure.type === 'medication'
            ? (selectedProcedure.details.route || '').slice(0, 100)
            : '',
        wound_intervention:
          selectedProcedure.type === 'dressing'
            ? DRESSING_INTERVENTION_MAP[dressingForm.dressingType] || ''
            : '',
      };
      
      // Create procedure
      try {
        await apiFetch('/nursing/procedures/', {
          method: 'POST',
          body: JSON.stringify(procedureData),
        });
      } catch (procedureError: unknown) {
        console.error('Procedure creation failed:', procedureError);
        throw procedureError;
      }

      // Update order status to completed
      await apiFetch(`/nursing/orders/${orderId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });

      if (selectedProcedure.createdNursingVisit && selectedProcedure.visitId) {
        try {
          await completeNursingProcedureVisit(selectedProcedure.visitId);
        } catch (visitErr) {
          console.warn('Failed to mark nursing procedure visit completed:', visitErr);
        }
      }

      void loadOrders();
      void loadQueueStats();
      
      const typeLabel = getTypeConfig(selectedProcedure.type).label;
      toast.success(`${typeLabel} completed for ${selectedProcedure.patientName}`, {
        description: 'Procedure recorded successfully'
      });

      setIsPerformDialogOpen(false);
      resetForms();
    } catch (err: any) {
      const userMsg = err?.apiMessage || err?.message;
      if (userMsg) {
        toast.error(userMsg);
      } else {
        toast.error('Failed to complete procedure. Please try again.');
      }
      // Only log unexpected errors (not user-facing validation messages)
      const isExpectedError =
        userMsg?.includes('already admitted') ||
        userMsg?.includes('Patient not found') ||
        userMsg?.includes('No active ward') ||
        userMsg?.includes('no visit record') ||
        userMsg?.includes('Invalid order ID');
      if (!isExpectedError) {
        console.error('Error completing procedure:', err);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==================== RENDER ====================
  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500">
                <Activity className="h-6 w-6 text-white" />
              </div>
              Procedures Queue
            </h1>
            <p className="text-muted-foreground mt-1">View and manage nursing procedure orders</p>
          </div>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => setIsAddProcedureOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add procedure
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: totalOrdersLabel, value: queueStats.total, icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Pending', value: queueStats.pending, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Completed', value: queueStats.completed, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Injections (pending)', value: queueStats.injections, icon: Syringe, color: 'text-violet-500', bg: 'bg-violet-500/10' },
          ].map((stat, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
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

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name, patient ID, or personal number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Procedure Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="injection">💉 Injections</SelectItem>
                    <SelectItem value="dressing">🩹 Dressings</SelectItem>
                    <SelectItem value="medication">💊 Medications</SelectItem>
                    <SelectItem value="ward_admission">🏥 Observation admission</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="Emergency">🔴 Emergency</SelectItem>
                    <SelectItem value="High">🟠 High</SelectItem>
                    <SelectItem value="Medium">🔵 Medium</SelectItem>
                    <SelectItem value="Low">🟢 Low</SelectItem>
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
                <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{procedures.length}</span> of{' '}
            <span className="font-medium text-foreground">{totalCount}</span> procedures
          </p>
        </div>

        {/* Queue List */}
        {!loading && totalCount === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {statusFilter === 'pending'
                  ? 'All caught up!'
                  : hasActiveFilters
                    ? 'No matching procedures'
                    : 'No procedures found'}
              </h3>
              <p className="text-muted-foreground text-center max-w-md">
                {statusFilter === 'pending'
                  ? 'No pending nursing orders in this date range.'
                  : hasActiveFilters
                    ? 'No procedures match your current filters. Try a wider date range or clear filters.'
                    : 'No nursing procedure orders in this date range.'}
              </p>
              {statusFilter === 'pending' ? (
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href="/nursing/procedures/history">View Procedures History</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {loading && procedures.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                  <p>Loading procedures queue…</p>
                </CardContent>
              </Card>
            ) : null}
            {procedures.map((procedure) => {
              const typeConfig = getTypeConfig(procedure.type);
              const TypeIcon = typeConfig.icon;
              const summary = procedureSummaryLine(procedure);

              return (
                <Card
                  key={procedure.id}
                  className={`border-l-4 ${getTypeBorderColor(procedure.type)} hover:shadow-md transition-shadow`}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <PatientAvatar name={procedure.patientName} photoUrl={undefined} size="sm" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                            <span className="font-semibold text-foreground truncate">{procedure.patientName}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${typeConfig.bgColor} ${typeConfig.color}`}>
                              {typeConfig.label}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getPriorityBadge(procedure.priority)}`}>
                              {procedure.priority}
                            </Badge>
                            {procedure.status === 'completed' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                                Completed
                              </Badge>
                            )}
                            {procedure.allergies.length > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10">
                                Allergy
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {procedure.status === 'completed' ? (
                              <div className={`h-7 w-7 flex items-center justify-center rounded border ${getCompletedIconStyle(procedure.type)}`}>
                                <CheckCircle2 className="h-4 w-4" />
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => openPerformDialog(procedure)}
                                className={`h-7 px-2 text-xs ${
                                  procedure.type === 'injection' ? 'bg-emerald-500 hover:bg-emerald-600' :
                                  procedure.type === 'dressing' ? 'bg-violet-500 hover:bg-violet-600' :
                                  procedure.type === 'ward_admission' ? 'bg-amber-500 hover:bg-amber-600' :
                                  'bg-blue-500 hover:bg-blue-600'
                                }`}
                              >
                                <TypeIcon className="h-3 w-3 mr-1" />
                                {procedure.type === 'injection' ? 'Administer' :
                                 procedure.type === 'dressing' ? 'Perform' :
                                 procedure.type === 'ward_admission' ? 'Admit' : 'Perform'}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => void openViewDialog(procedure)}
                              title="View order"
                            >
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{procedure.patientId}</span>
                          <span>•</span>
                          <span>{procedure.age}y {procedure.gender}</span>
                          {procedure.ward ? (
                            <>
                              <span>•</span>
                              <span>{procedure.ward}</span>
                            </>
                          ) : null}
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Stethoscope className="h-3 w-3 shrink-0" />
                            {procedure.orderedBy}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {getTimeSince(procedure.orderedAt)}
                          </span>
                        </div>

                        {summary ? (
                          <p className="text-xs text-muted-foreground mt-1 truncate" title={procedure.description}>
                            {summary}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="procedures"
            />
            </Card>
          )}

          <AdvancedDateRangeDialog
            open={isDateFilterDialogOpen}
            onOpenChange={setIsDateFilterDialogOpen}
            description="Apply a custom procedure date range to narrow down nursing procedures."
            label="Procedure Date Range"
            value={dateRange}
            onChange={setDateRange}
            onClear={clearDateRangeFilters}
          />

        {/* View order dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className={MODAL_SIZES.md}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {viewProcedure && (() => {
                  const config = getTypeConfig(viewProcedure.type);
                  const Icon = config.icon;
                  return (
                    <>
                      <Icon className={`h-5 w-5 ${config.color}`} />
                      {config.label}
                      {viewProcedure.status === 'completed' ? (
                        <Badge variant="outline" className="text-[10px] ml-1 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={`text-[10px] ml-1 ${getPriorityBadge(viewProcedure.priority)}`}>
                          {viewProcedure.priority}
                        </Badge>
                      )}
                    </>
                  );
                })()}
              </DialogTitle>
              <DialogDescription>
                {viewProcedure?.patientName} · {viewProcedure?.patientId}
              </DialogDescription>
            </DialogHeader>
            {viewProcedure && (
              <div className="py-2 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {viewProcedure.age > 0 ? `${viewProcedure.age}y` : 'Age unknown'} · {viewProcedure.gender}
                </p>
                {viewProcedure.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <p className="text-sm font-medium text-rose-600 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Allergy: {viewProcedure.allergies.join(', ')}
                    </p>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                  <p className="text-xs text-muted-foreground">Ordered by {viewProcedure.orderedBy}</p>
                  {viewProcedure.type === 'injection' && (
                    <>
                      <p className="font-medium text-foreground">
                        {viewProcedure.details.medication} — {viewProcedure.details.dosage}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[viewProcedure.details.route, viewProcedure.details.frequency].filter(Boolean).join(' · ')}
                      </p>
                    </>
                  )}
                  {viewProcedure.type === 'dressing' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Wound type</p>
                        <p className="font-medium">{viewProcedure.details.woundType || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="font-medium">{viewProcedure.details.woundLocation || '—'}</p>
                      </div>
                      {viewProcedure.details.instructions ? (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Instructions</p>
                          <p className="text-sm">{viewProcedure.details.instructions}</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {viewProcedure.type === 'medication' && (
                    <>
                      <p className="font-medium text-foreground">{viewProcedure.details.medication}</p>
                      <p className="text-sm text-muted-foreground">{viewProcedure.details.route}</p>
                    </>
                  )}
                  {viewProcedure.type === 'ward_admission' && (
                    <>
                      <p className="font-medium text-foreground">Observation admission</p>
                      <p className="text-sm text-muted-foreground">{viewProcedure.ward || 'Ward not specified'}</p>
                      {viewProcedure.details.admissionDiagnosis ? (
                        <p className="text-sm text-muted-foreground">{viewProcedure.details.admissionDiagnosis}</p>
                      ) : null}
                    </>
                  )}
                  {viewProcedure.description && !viewProcedure.details.medication && !viewProcedure.details.woundType ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewProcedure.description}</p>
                  ) : null}
                </div>
                {viewProcedure.status === 'completed' && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium text-foreground">Completion record</p>
                    {viewLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading record…
                      </div>
                    ) : viewRecord ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {viewRecord.site ? (
                          <div>
                            <p className="text-xs text-muted-foreground">Site</p>
                            <p className="font-medium">{viewRecord.site}</p>
                          </div>
                        ) : null}
                        {viewRecord.wound_intervention ? (
                          <div>
                            <p className="text-xs text-muted-foreground">Procedure performed</p>
                            <p className="font-medium">
                              {WOUND_INTERVENTION_LABELS[viewRecord.wound_intervention] || viewRecord.wound_intervention}
                            </p>
                          </div>
                        ) : null}
                        {viewRecord.notes ? (
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">Notes</p>
                            <p className="text-muted-foreground whitespace-pre-wrap">{viewRecord.notes}</p>
                          </div>
                        ) : null}
                        {viewRecord.performed_by_name ? (
                          <div className="col-span-2 flex items-center justify-between text-xs text-muted-foreground pt-1">
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {viewRecord.performed_by_name}
                            </span>
                            {viewRecord.performed_at ? (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatOrderDateTime(viewRecord.performed_at).date}{' '}
                                {formatOrderDateTime(viewRecord.performed_at).time}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No completion record found for this order.</p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
                  <Clock className="h-3 w-3 shrink-0" />
                  Ordered {formatOrderDateTime(viewProcedure.orderedAt).date}{' '}
                  {formatOrderDateTime(viewProcedure.orderedAt).time}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                Close
              </Button>
              {viewProcedure?.status === 'pending' ? (
                <Button
                  onClick={() => {
                    setIsViewDialogOpen(false);
                    openPerformDialog(viewProcedure);
                  }}
                >
                  {viewProcedure.type === 'injection' ? 'Administer' :
                   viewProcedure.type === 'dressing' ? 'Perform' :
                   viewProcedure.type === 'ward_admission' ? 'Admit' : 'Perform'}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AddNursingProcedureDialog
          open={isAddProcedureOpen}
          onOpenChange={setIsAddProcedureOpen}
          currentUserId={currentUser?.id ? Number(currentUser.id) : undefined}
          onCreated={async (result: AddNursingProcedureResult) => {
            await loadOrders();
            void loadQueueStats();
            if (result.completeNow) {
              const proc = nursingOrderToProcedure(result.order);
              if (result.visitId) proc.visitId = result.visitId;
              proc.createdNursingVisit = result.createdNursingVisit;
              openPerformDialog(proc);
            }
          }}
        />

        {/* Perform Dialog */}
        <Dialog
          open={isPerformDialogOpen}
          onOpenChange={(open) => {
            setIsPerformDialogOpen(open);
            if (!open) {
              resetForms();
              setSelectedProcedure(null);
            }
          }}
        >
          <DialogContent className={MODAL_SIZES.md}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedProcedure && (() => {
                  const config = getTypeConfig(selectedProcedure.type);
                  const Icon = config.icon;
                  return <><Icon className={`h-5 w-5 ${config.color}`} />{config.label}</>;
                })()}
              </DialogTitle>
              <DialogDescription>{selectedProcedure?.patientName} - {selectedProcedure?.patientId}</DialogDescription>
            </DialogHeader>

            {selectedProcedure && (
              <div className="py-4 space-y-4">
                {/* Allergy Warning */}
                {selectedProcedure.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <p className="text-sm font-medium text-rose-600 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />Allergy Alert: {selectedProcedure.allergies.join(', ')}
                    </p>
                  </div>
                )}

                {/* Order Info */}
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Ordered by {selectedProcedure.orderedBy}</p>
                  {selectedProcedure.type === 'injection' && (
                    <>
                      <p className="font-medium text-foreground">{selectedProcedure.details.medication} - {selectedProcedure.details.dosage}</p>
                      <p className="text-sm text-muted-foreground">{selectedProcedure.details.route} • {selectedProcedure.details.frequency}</p>
                    </>
                  )}
                  {selectedProcedure.type === 'dressing' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Wound type</p>
                        <p className="font-medium">{selectedProcedure.details.woundType || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="font-medium">{selectedProcedure.details.woundLocation || '—'}</p>
                      </div>
                      {selectedProcedure.details.instructions ? (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Instructions</p>
                          <p className="text-sm">{selectedProcedure.details.instructions}</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {selectedProcedure.type === 'medication' && (
                    <>
                      <p className="font-medium text-foreground">{selectedProcedure.details.medication}</p>
                      <p className="text-sm text-muted-foreground">{selectedProcedure.details.route}{selectedProcedure.details.scheduledTime ? ` • Scheduled: ${selectedProcedure.details.scheduledTime}` : ''}</p>
                    </>
                  )}
                  {selectedProcedure.type === 'ward_admission' && (
                    <>
                      <p className="font-medium text-foreground">Observation Admission</p>
                      <p className="text-sm text-muted-foreground">{selectedProcedure.description}</p>
                    </>
                  )}
                </div>

                {/* Type-specific forms */}
                {selectedProcedure.type === 'injection' && (
                  <div className="grid grid-cols-2 gap-4">
                    <p className="col-span-2 text-xs text-muted-foreground">
                      Sites match the ordered route when possible (IM / SC / IV). Confirm the vial or syringe matches the order before administering.
                    </p>
                    <div className="space-y-2">
                      <Label>Injection Site *</Label>
                      <Select
                        value={injectionForm.site}
                        onValueChange={(v) =>
                          setInjectionForm((p) => ({
                            ...p,
                            site: v,
                            laterality: injectionSiteNeedsLaterality(v) ? p.laterality : '',
                          }))
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                        <SelectContent>
                          {injectionSiteOptionsForDialog.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {injectionSiteNeedsLaterality(injectionForm.site) && (
                      <div className="space-y-2">
                        <Label>Laterality *</Label>
                        <Select
                          value={injectionForm.laterality}
                          onValueChange={(v) => setInjectionForm((p) => ({ ...p, laterality: v as 'Left' | 'Right' }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Left or right" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Left">Left</SelectItem>
                            <SelectItem value="Right">Right</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="col-span-2 space-y-2">
                      <Label>Time of administration *</Label>
                      <Input
                        type="time"
                        value={injectionForm.administeredTime ?? ''}
                        onChange={(e) => setInjectionForm((p) => ({ ...p, administeredTime: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">Defaults to current time; adjust if the dose was given earlier.</p>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Immediate reaction after dose</Label>
                      <Select
                        value={injectionForm.immediateReaction}
                        onValueChange={(v) =>
                          setInjectionForm((p) => ({
                            ...p,
                            immediateReaction: v as 'none' | 'yes',
                            reactionDetail: v === 'none' ? '' : p.reactionDetail,
                          }))
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None observed</SelectItem>
                          <SelectItem value="yes">Yes — describe below</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {injectionForm.immediateReaction === 'yes' && (
                      <div className="col-span-2 space-y-2">
                        <Label>Reaction details *</Label>
                        <Textarea
                          value={injectionForm.reactionDetail ?? ''}
                          onChange={(e) => setInjectionForm((p) => ({ ...p, reactionDetail: e.target.value }))}
                          placeholder="e.g., urticaria at site, nausea, dizziness..."
                          rows={2}
                        />
                      </div>
                    )}
                    <div className="col-span-2 space-y-2">
                      <Label>Notes</Label>
                      <Textarea value={injectionForm.notes ?? ''} onChange={(e) => setInjectionForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observations..." rows={2} />
                    </div>
                  </div>
                )}

                {selectedProcedure.type === 'dressing' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Dressing Type *</Label>
                      <Select value={dressingForm.dressingType} onValueChange={(v) => setDressingForm(p => ({ ...p, dressingType: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {NURSING_DRESSING_PROCEDURE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Wound Condition *</Label>
                      <Select value={dressingForm.woundCondition} onValueChange={(v) => setDressingForm(p => ({ ...p, woundCondition: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Healing">Healing</SelectItem>
                          <SelectItem value="Infected">Infected</SelectItem>
                          <SelectItem value="Stagnant">Stagnant</SelectItem>
                          <SelectItem value="Deteriorating">Deteriorating</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Observations</Label>
                      <Textarea value={dressingForm.observations} onChange={(e) => setDressingForm(p => ({ ...p, observations: e.target.value }))} placeholder="Detailed observations..." rows={3} />
                    </div>
                  </div>
                )}

                {selectedProcedure.type === 'medication' && (
                  <div className="space-y-4">
                    {['IV', 'IM', 'SC'].includes(selectedProcedure.details.route || '') && (
                      <div className="space-y-2">
                        <Label>Administration Site</Label>
                        <Select value={medicationForm.site} onValueChange={(v) => setMedicationForm(p => ({ ...p, site: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left-arm">Left Arm</SelectItem>
                            <SelectItem value="right-arm">Right Arm</SelectItem>
                            <SelectItem value="left-thigh">Left Thigh</SelectItem>
                            <SelectItem value="right-thigh">Right Thigh</SelectItem>
                            <SelectItem value="abdomen">Abdomen</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Time of administration <span className="text-red-500">*</span></Label>
                      <Input type="time" value={medicationForm.administeredTime} onChange={(e) => setMedicationForm(p => ({ ...p, administeredTime: e.target.value }))} />
                      <p className="text-xs text-muted-foreground">Record when the medication was administered</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea value={medicationForm.notes} onChange={(e) => setMedicationForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any observations..." rows={2} />
                    </div>
                  </div>
                )}

                {selectedProcedure.type === 'ward_admission' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Admit patient to ward as ordered by doctor. This will create the admission record and assign a bed.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Admission Notes</Label>
                      <Textarea value={wardAdmissionForm.notes} onChange={(e) => setWardAdmissionForm(p => ({ ...p, notes: e.target.value }))} placeholder="Admission notes (vitals, observations, bed assignment)..." rows={3} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPerformDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleComplete}
                disabled={
                  isSubmitting ||
                  (selectedProcedure?.type === 'injection' && !injectionCanComplete) ||
                  (selectedProcedure?.type === 'dressing' && !dressingCanComplete) ||
                  (selectedProcedure?.type === 'medication' && !medicationCanComplete)
                }
                className={`text-white ${
                selectedProcedure?.type === 'injection' ? 'bg-emerald-500 hover:bg-emerald-600' :
                selectedProcedure?.type === 'dressing' ? 'bg-violet-500 hover:bg-violet-600' :
                selectedProcedure?.type === 'medication' ? 'bg-blue-500 hover:bg-blue-600' :
                'bg-amber-500 hover:bg-amber-600'
              }`}>
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording...</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" />{
                  selectedProcedure?.type === 'injection' ? 'Administer' :
                  selectedProcedure?.type === 'dressing' ? 'Complete Dressing' :
                  selectedProcedure?.type === 'medication' ? 'Administer' :
                  selectedProcedure?.type === 'ward_admission' ? 'Admit Patient' :
                  'Complete'
                }</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
