'use client';

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { OrderDiagnosesBlock } from '@/components/medical/OrderDiagnosesBlock';
import { countOrderDiagnoses } from '@/lib/consultation/order-diagnoses';
import { useEyecarePageAuth } from '@/hooks/use-eyecare-page-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useEyecareUrlSync } from '@/hooks/use-eyecare-url-sync';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import {
  findEyecareOrdersTabForOrders,
  isValidEyecareOrdersTab,
  orderMatchesEyecareOrdersTab,
  EYECARE_ORDERS_TAB_LABELS,
  type EyecareOrdersTab,
} from '@/lib/eyecare/eyecare-workflow-search';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { EyeSessionReportDialog } from '@/components/eyecare/EyeSessionReportDialog';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { PrescriptionOrderModal, type PrescriptionOrderSubmitInput } from '@/components/consultation/orders/PrescriptionOrderModal';
import { eyeCareService, type EyeOrder, type EyeSession, type EyeSoapNote } from '@/lib/services/eye-care-service';
import { pharmacyService } from '@/lib/services/pharmacy-service';
import { patientService } from '@/lib/services';
import {
  type DiagnosticCategory,
  examinationRows,
  visualAcuityRows,
  diagnosticAttachmentsForCategory,
} from '@/lib/eyecare/eye-session-helpers';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/dates';

import {
  Search, Clock, CheckCircle, CheckCircle2, Eye, Play, AlertTriangle, Loader2, Activity, RefreshCw, XCircle, FileText, Stethoscope, Upload, X, Pill,
} from 'lucide-react';

const emptyPendingDiagnostics = (): Record<DiagnosticCategory, File[]> => ({
  pachymetry: [],
  oct: [],
  visual_field: [],
});

function fileLabelFromAttachmentUrl(url: string, index: number) {
  try {
    const path = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').pathname;
    const seg = path.split('/').filter(Boolean).pop();
    if (seg) return decodeURIComponent(seg);
  } catch {
    /* ignore */
  }
  return `File ${index + 1}`;
}

const formatRelativeTime = (dateString: string | null | undefined) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDisplayDate(date) === '—' ? '' : formatDisplayDate(date);
  } catch {
    return '';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
    case 'scheduled':
      return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
    case 'in_progress':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30';
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'cancelled':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
    default:
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
  }
};

const getQueueStatusLabel = (status: string) => {
  if (status === 'scheduled') return 'pending';
  return status.replace('_', ' ');
};

const createRefractionEntry = () => ({ sphere: '', cylinder: '', axis: '', va: '' });

const createEmptySoapNote = (): EyeSoapNote => ({
  subjective: {
    chiefComplaint: '',
    ocularHistory: '',
    medicalHistory: '',
    drugHistory: '',
    allergyHistory: '',
    familyOcularHistory: '',
    familyMedicalHistory: '',
    socialHistory: '',
  },
  objective: {
    visualAcuity: Object.fromEntries(visualAcuityRows.map((row) => [row.key, { od: '', os: '', ou: '' }])),
    examination: Object.fromEntries(examinationRows.map((row) => [row.key, { od: '', os: '' }])),
    diagnostics: {
      iopOd: '',
      iopOs: '',
      method: '',
      time: '',
      pachymetry: '',
      oct: '',
      visualField: '',
    },
    refraction: {
      lensometry: { od: createRefractionEntry(), os: createRefractionEntry(), add: '', prism: '' },
      autorefraction: { od: createRefractionEntry(), os: createRefractionEntry() },
      retinoscopy: { od: createRefractionEntry(), os: createRefractionEntry() },
      subjective: { od: createRefractionEntry(), os: createRefractionEntry() },
      nearAddition: { add: '', nearVa: '' },
    },
  },
  assessment: {
    diagnosis: '',
  },
  plan: {
    opticalCorrection: '',
    medications: '',
    managementPlan: '',
    followUpDate: '',
  },
});

const createSoapNoteFromLegacy = (order: EyeOrder, session: EyeSession): EyeSoapNote => {
  const soapNote = createEmptySoapNote();
  soapNote.subjective.chiefComplaint = order.chief_complaint || '';
  soapNote.objective.visualAcuity.distanceUnaided = {
    od: order.visual_acuity_od || '',
    os: order.visual_acuity_os || '',
    ou: order.visual_acuity_ou || '',
  };
  soapNote.objective.diagnostics.iopOd = order.iop_od != null ? String(order.iop_od) : '';
  soapNote.objective.diagnostics.iopOs = order.iop_os != null ? String(order.iop_os) : '';
  soapNote.objective.refraction.subjective.od.sphere = order.refraction_od || '';
  soapNote.objective.refraction.subjective.os.sphere = order.refraction_os || '';
  soapNote.assessment.diagnosis = order.diagnosis || '';
  soapNote.plan.managementPlan = order.treatment_plan || '';
  soapNote.plan.opticalCorrection =
    (session.soap_note as EyeSoapNote | undefined)?.plan?.opticalCorrection
    || session.procedures_performed
    || '';
  soapNote.plan.managementPlan = order.treatment_plan || soapNote.plan.managementPlan || '';
  return soapNote;
};

type EyeSessionFormState = {
  special_instructions: string;
  soap_note: EyeSoapNote;
};

const emptySessionForm = (): EyeSessionFormState => ({
  special_instructions: '',
  soap_note: createEmptySoapNote(),
});

export default function EyeClinicOrdersPage() {
  const { ready, handleAuthError } = useEyecarePageAuth();

  const [orders, setOrders] = useState<EyeOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [activeTab, setActiveTab] = useState<EyecareOrdersTab>('pending');
  const autoTabRef = useRef<string | null>(null);

  useEyecareUrlSync({
    search: searchQuery,
    tab: activeTab,
    defaultTab: 'pending',
    onSearchFromUrl: setSearchQuery,
    onTabFromUrl: (tab) => setActiveTab(tab as EyecareOrdersTab),
    isValidTab: isValidEyecareOrdersTab,
  });
  const [dateFilter, setDateFilter] = useState('today');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [selectedOrder, setSelectedOrder] = useState<EyeOrder | null>(null);
  const [selectedOrderSessions, setSelectedOrderSessions] = useState<EyeSession[]>([]);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isSessionReportOpen, setIsSessionReportOpen] = useState(false);
  const [isPrescriptionDialogOpen, setIsPrescriptionDialogOpen] = useState(false);
  const [currentSession, setCurrentSession] = useState<EyeSession | null>(null);
  const [reportOrderId, setReportOrderId] = useState<number | undefined>();
  const [reportSessionId, setReportSessionId] = useState<number | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [patientVitals, setPatientVitals] = useState<Record<string, string> | null>(null);
  const [pendingDiagnosticFiles, setPendingDiagnosticFiles] = useState<Record<DiagnosticCategory, File[]>>(
    () => emptyPendingDiagnostics()
  );
  const [sessionForm, setSessionForm] = useState<EyeSessionFormState>(emptySessionForm);

  const [stats, setStats] = useState({
    pending: 0,
    inProgress: 0,
    cancelled: 0,
    completed: 0,
  });

  const buildOrdersListParams = useCallback((): Parameters<typeof eyeCareService.getOrders>[0] => {
    const searching = Boolean(debouncedSearchQuery.trim());
    const params: Parameters<typeof eyeCareService.getOrders>[0] = {
      page: currentPage,
      page_size: itemsPerPage,
      search: searching ? debouncedSearchQuery.trim() : undefined,
    };
    if (activeTab !== 'all') {
      params.status_tab = activeTab as 'pending' | 'in_progress' | 'cancelled' | 'completed';
    }
    if (searching) {
      params.date_filter = 'all';
    } else if (dateRange.from || dateRange.to) {
      params.date_filter = 'all';
      if (dateRange.from) params.ordered_at_after = dateRange.from;
      if (dateRange.to) params.ordered_at_before = dateRange.to;
    } else {
      params.date_filter = dateFilter;
    }
    return params;
  }, [
    currentPage,
    itemsPerPage,
    debouncedSearchQuery,
    activeTab,
    dateFilter,
    dateRange.from,
    dateRange.to,
  ]);

  const buildOrdersStatsBase = useCallback((): Parameters<typeof eyeCareService.getOrders>[0] => {
    const searching = Boolean(debouncedSearchQuery.trim());
    const params: Parameters<typeof eyeCareService.getOrders>[0] = {
      search: searching ? debouncedSearchQuery.trim() : undefined,
    };
    if (searching) {
      params.date_filter = 'all';
    } else if (dateRange.from || dateRange.to) {
      params.date_filter = 'all';
      if (dateRange.from) params.ordered_at_after = dateRange.from;
      if (dateRange.to) params.ordered_at_before = dateRange.to;
    } else {
      params.date_filter = dateFilter;
    }
    return params;
  }, [debouncedSearchQuery, dateFilter, dateRange.from, dateRange.to]);

  const pollingPaused = useMemo(
    () =>
      isViewDialogOpen ||
      isSessionDialogOpen ||
      isSessionReportOpen ||
      isPrescriptionDialogOpen,
    [isViewDialogOpen, isSessionDialogOpen, isSessionReportOpen, isPrescriptionDialogOpen]
  );

  useEffect(() => {
    const q = debouncedSearchQuery.trim();
    if (!q || loading || orders.length === 0) {
      autoTabRef.current = null;
      return;
    }
    if (orders.some((o) => orderMatchesEyecareOrdersTab(o, activeTab))) return;
    const next = findEyecareOrdersTabForOrders(orders);
    if (next && next !== activeTab) {
      const key = `${q}:${next}`;
      if (autoTabRef.current !== key) {
        autoTabRef.current = key;
        setActiveTab(next);
        toast.info(`Found in ${EYECARE_ORDERS_TAB_LABELS[next]} — switched tab.`);
      }
    }
  }, [debouncedSearchQuery, orders, activeTab, loading]);

  const loadOrders = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent;
      try {
        if (!silent) {
          setLoading(true);
          setError(null);
        }
        const [res, orderStats] = await Promise.all([
          eyeCareService.getOrders(buildOrdersListParams()),
          eyeCareService.getOrderStats(buildOrdersStatsBase()),
        ]);
        setOrders(res.results || []);
        setTotalCount(typeof res.count === 'number' ? res.count : (res.results || []).length);
        setStats({
          pending: orderStats.pending ?? 0,
          inProgress: orderStats.in_progress ?? 0,
          cancelled: orderStats.cancelled ?? 0,
          completed: orderStats.completed ?? 0,
        });
      } catch (err) {
        console.error('Error loading eye clinic orders:', err);
        if (handleAuthError(err)) return;
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Failed to load eye clinic orders');
          toast.error('Failed to load eye clinic orders');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [buildOrdersListParams, buildOrdersStatsBase, handleAuthError]
  );

  useEffect(() => {
    if (!ready) return;
    void loadOrders();
  }, [ready, loadOrders]);

  useEffect(() => {
    if (!ready || pollingPaused) return;
    const id = setInterval(() => {
      void loadOrders({ silent: true });
    }, 15000);
    return () => clearInterval(id);
  }, [ready, loadOrders, pollingPaused]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, activeTab, dateFilter, itemsPerPage, dateRange.from, dateRange.to]);

  useEffect(() => {
    if ((!isViewDialogOpen && !isSessionDialogOpen) || !selectedOrder?.id) {
      setSelectedOrderSessions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await eyeCareService.getSessions({ order: selectedOrder.id, page_size: MAX_LIST_PAGE_SIZE });
        if (!cancelled) {
          setSelectedOrderSessions(response.results || []);
        }
      } catch {
        if (!cancelled) setSelectedOrderSessions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isViewDialogOpen, isSessionDialogOpen, selectedOrder?.id]);

  const openViewDialog = (order: EyeOrder) => {
    setSelectedOrder(order);
    setIsViewDialogOpen(true);
  };

  const openSessionDialog = async (session: EyeSession, order: EyeOrder) => {
    let hydrated: EyeSession = session;
    try {
      hydrated = await eyeCareService.getSession(session.id);
    } catch {
      /* use list payload if detail fetch fails */
    }
    const soapNote = hydrated.soap_note && Object.keys(hydrated.soap_note).length > 0
      ? hydrated.soap_note
      : createSoapNoteFromLegacy(order, hydrated);
    setCurrentSession(hydrated);
    setSelectedOrder(order);
    setPendingDiagnosticFiles(emptyPendingDiagnostics());
    setSessionForm({
      special_instructions: order.special_instructions || '',
      soap_note: soapNote,
    });
    setIsSessionDialogOpen(true);
    setIsViewDialogOpen(false);
    void loadPatientVitals(order.patient);
  };

  const openSessionReport = (session: EyeSession) => {
    const orderId = typeof session.order === 'number' ? session.order : session.order_details?.id;
    if (!orderId) {
      toast.error('No order linked to this session');
      return;
    }
    setReportOrderId(orderId);
    setReportSessionId(session.id);
    setIsSessionReportOpen(true);
  };

  const loadPatientVitals = async (patientId: number) => {
    try {
      const latestVitals = await patientService.resolveVital({ patient: patientId });
      if (latestVitals) {
        setPatientVitals({
          Temperature: latestVitals.temperature ? `${latestVitals.temperature}°C` : '—',
          'Blood Pressure': latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic
            ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}`
            : '—',
          'Heart Rate': latestVitals.heart_rate ? `${latestVitals.heart_rate} bpm` : '—',
          'Resp. Rate': latestVitals.respiratory_rate ? `${latestVitals.respiratory_rate}/min` : '—',
          SpO2: latestVitals.oxygen_saturation ? `${latestVitals.oxygen_saturation}%` : '—',
          Weight: latestVitals.weight ? `${latestVitals.weight} kg` : '—',
          Height: latestVitals.height ? `${latestVitals.height} cm` : '—',
        });
      } else {
        setPatientVitals(null);
      }
    } catch {
      setPatientVitals(null);
    }
  };

  const resolveCreatedSession = async (orderId: number, sessionNumber: number) => {
    const response = await eyeCareService.getSessions({ order: orderId, page_size: MAX_LIST_PAGE_SIZE });
    const sessions = response.results || [];
    return sessions.find((session) => session.session_number === sessionNumber) || null;
  };

  const startProcessing = async (order: EyeOrder) => {
    if (!order?.id) {
      toast.error('Cannot start processing: invalid order');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(true);
    try {
      const sessionsResponse = await eyeCareService.getSessions({ order: order.id, page_size: MAX_LIST_PAGE_SIZE });
      const existingSessions = sessionsResponse.results || [];
      let activeSession =
        existingSessions.find((session) => session.status === 'in_progress') ||
        existingSessions.find((session) => session.status === 'scheduled') ||
        null;

      if (!activeSession) {
        const nextSessionNumber = existingSessions.length > 0
          ? Math.max(...existingSessions.map((session) => session.session_number || 0)) + 1
          : 1;

        const createdSession = await eyeCareService.createSession({
          order: order.id,
          session_number: nextSessionNumber,
          scheduled_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          findings: order.diagnosis || order.chief_complaint || '',
          procedures_performed: order.treatment_plan || '',
        });

        const sessionToActivate = createdSession?.id
          ? createdSession
          : await resolveCreatedSession(order.id, nextSessionNumber);

        if (!sessionToActivate?.id) {
          throw new Error('Created eye session could not be found');
        }

        activeSession = await eyeCareService.updateSession(sessionToActivate.id, {
          status: 'in_progress',
          started_at: sessionToActivate.started_at || new Date().toISOString(),
        });
      } else if (activeSession.status === 'scheduled') {
        activeSession = await eyeCareService.updateSession(activeSession.id, {
          status: 'in_progress',
          started_at: activeSession.started_at || new Date().toISOString(),
        });
      }


      await eyeCareService.updateOrder(order.id, {
        status: 'in_progress',
        scheduled_at: order.scheduled_at || new Date().toISOString(),
      });

      toast.success('Processing started successfully');
      await loadOrders();
      const refreshedOrder = { ...order, status: 'in_progress' as const, scheduled_at: order.scheduled_at || new Date().toISOString() };
      await openSessionDialog(activeSession, refreshedOrder);
    } catch (err) {
      console.error('Error starting eye clinic processing:', err);
      const apiStatus = (err as any)?.status;
      if (apiStatus === 404) {
        toast.error('Order no longer exists in the system. Refresh the page.');
      } else {
        toast.error('Failed to start processing');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const endTreatment = async (order: EyeOrder) => {
    setIsSubmitting(true);
    try {
      const sessionsResponse = await eyeCareService.getSessions({ order: order.id, page_size: MAX_LIST_PAGE_SIZE });
      const sessions = sessionsResponse.results || [];

      for (const session of sessions) {
        if (session.status !== 'completed' && session.status !== 'cancelled') {
          await eyeCareService.updateSession(session.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
          });
        }
      }

      if (sessions.length === 0) {
        await eyeCareService.createSession({
          order: order.id,
          session_number: 1,
          scheduled_at: order.scheduled_at || order.ordered_at,
          started_at: order.scheduled_at || order.ordered_at,
          completed_at: new Date().toISOString(),
          status: 'completed',
          findings: order.diagnosis || order.chief_complaint || '',
          procedures_performed: order.treatment_plan || '',
        });
      }

      await eyeCareService.completeOrder(order.id);
      toast.success('Treatment ended successfully');
      setIsViewDialogOpen(false);
      setSelectedOrder(null);
      await loadOrders();
    } catch (err) {
      console.error('Error ending eye clinic treatment:', err);
      toast.error('Failed to end treatment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addSessionForOrder = async (order: EyeOrder) => {
    if (!order?.id) {
      toast.error('Cannot add session: invalid order');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(true);
    try {
      const sessionsResponse = await eyeCareService.getSessions({ order: order.id, page_size: MAX_LIST_PAGE_SIZE });
      const sessions = sessionsResponse.results || [];
      const nextSessionNumber = sessions.length > 0
        ? Math.max(...sessions.map((session) => session.session_number || 0)) + 1
        : 1;

      const createdSession = await eyeCareService.createSession({
        order: order.id,
        session_number: nextSessionNumber,
        scheduled_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        findings: order.diagnosis || order.chief_complaint || '',
        procedures_performed: order.treatment_plan || '',
      });

      const sessionToActivate = createdSession?.id
        ? createdSession
        : await resolveCreatedSession(order.id, nextSessionNumber);

      if (!sessionToActivate?.id) {
        throw new Error('Created eye session could not be found');
      }

      const activeSession = await eyeCareService.updateSession(sessionToActivate.id, {
        status: 'in_progress',
        started_at: sessionToActivate.started_at || new Date().toISOString(),
      });

      await eyeCareService.updateOrder(order.id, {
        status: 'in_progress',
        scheduled_at: new Date().toISOString(),
      });

      await loadOrders();
      const refreshedOrder = { ...order, status: 'in_progress' as const, scheduled_at: new Date().toISOString() };
      await openSessionDialog(activeSession, refreshedOrder);
      toast.success(`Session ${nextSessionNumber} started`);
    } catch (err) {
      console.error('Error adding eye session:', err);
      toast.error('Failed to add session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveSessionDocumentation = async (opts?: { complete?: boolean }) => {
    if (!currentSession || !selectedOrder) return;

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const soapNote = sessionForm.soap_note;
      await eyeCareService.updateOrder(selectedOrder.id, {
        chief_complaint: soapNote.subjective.chiefComplaint,
        visual_acuity_od: soapNote.objective.visualAcuity.distanceUnaided?.od || '',
        visual_acuity_os: soapNote.objective.visualAcuity.distanceUnaided?.os || '',
        visual_acuity_ou: soapNote.objective.visualAcuity.distanceUnaided?.ou || '',
        refraction_od: soapNote.objective.refraction.subjective.od.sphere,
        refraction_os: soapNote.objective.refraction.subjective.os.sphere,
        iop_od: soapNote.objective.diagnostics.iopOd ? Number(soapNote.objective.diagnostics.iopOd) : null,
        iop_os: soapNote.objective.diagnostics.iopOs ? Number(soapNote.objective.diagnostics.iopOs) : null,
        diagnosis: soapNote.assessment.diagnosis,
        treatment_plan: soapNote.plan.managementPlan,
        special_instructions: sessionForm.special_instructions,
      });
      const sessionPayload: Partial<EyeSession> = {
        notes: [
          soapNote.plan.managementPlan && `Management: ${soapNote.plan.managementPlan}`,
          soapNote.plan.medications && `Medications: ${soapNote.plan.medications}`,
          soapNote.plan.followUpDate && `Follow-up Date: ${soapNote.plan.followUpDate}`,
        ].filter(Boolean).join('\n'),
        procedures_performed: soapNote.plan.opticalCorrection,
        findings: soapNote.assessment.diagnosis,
        soap_note: soapNote,
        status: opts?.complete ? 'completed' : (currentSession.status === 'completed' ? 'completed' : 'in_progress'),
        started_at: currentSession.started_at || now,
        completed_at: opts?.complete ? now : currentSession.completed_at,
      };
      const hasPendingDiagnosticFiles =
        pendingDiagnosticFiles.pachymetry.length > 0 ||
        pendingDiagnosticFiles.oct.length > 0 ||
        pendingDiagnosticFiles.visual_field.length > 0;

      const updatedSession = hasPendingDiagnosticFiles
        ? await eyeCareService.updateSessionWithFiles(currentSession.id, sessionPayload,
          {
            pachymetry_files: pendingDiagnosticFiles.pachymetry,
            oct_files: pendingDiagnosticFiles.oct,
            visual_field_files: pendingDiagnosticFiles.visual_field,
          })
        : await eyeCareService.updateSession(currentSession.id, sessionPayload);

      let mergedSession = updatedSession;
      try {
        mergedSession = await eyeCareService.getSession(currentSession.id);
      } catch {
        /* keep PATCH response */
      }
      setCurrentSession(mergedSession);

      if (opts?.complete) {
        await eyeCareService.completeOrder(selectedOrder.id);
        toast.success('Eye session completed successfully');
        setIsSessionDialogOpen(false);
        setCurrentSession(null);
        setSelectedOrder(null);
      } else {
        toast.success(currentSession.status === 'completed' ? 'Session updated' : 'Eye notes saved');
      }
      setPendingDiagnosticFiles(emptyPendingDiagnostics());

      await loadOrders();
    } catch (err) {
      console.error('Error saving eye session documentation:', err);
      toast.error(opts?.complete ? 'Failed to complete eye session' : 'Failed to save eye notes');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateSoapNote = (updater: (soapNote: EyeSoapNote) => EyeSoapNote) => {
    setSessionForm((prev) => ({
      ...prev,
      soap_note: updater(prev.soap_note),
    }));
  };

  const updateSoapPath = (
    section: keyof EyeSoapNote,
    group: string,
    field: string,
    value: string,
    nestedField?: string
  ) => {
    updateSoapNote((soapNote) => {
      const next = structuredClone(soapNote);
      if (nestedField) {
        const target = ((next as any)[section][group][field] as any);
        const [firstKey, secondKey] = nestedField.split('.');
        if (secondKey) {
          target[firstKey][secondKey] = value;
        } else {
          target[firstKey] = value;
        }
      } else {
        ((next as any)[section][group] as any)[field] = value;
      }
      return next;
    });
  };

  const updateSubjective = (field: keyof EyeSoapNote['subjective'], value: string) => {
    updateSoapNote((soapNote) => ({
      ...soapNote,
      subjective: { ...soapNote.subjective, [field]: value },
    }));
  };

  const updateAssessment = (field: keyof EyeSoapNote['assessment'], value: string) => {
    updateSoapNote((soapNote) => ({
      ...soapNote,
      assessment: { ...soapNote.assessment, [field]: value },
    }));
  };

  const updatePlan = (field: keyof EyeSoapNote['plan'], value: string) => {
    updateSoapNote((soapNote) => ({
      ...soapNote,
      plan: { ...soapNote.plan, [field]: value },
    }));
  };

  const appendPendingDiagnostics = (category: DiagnosticCategory, files: FileList | null) => {
    if (!files?.length) return;
    setPendingDiagnosticFiles((prev) => ({
      ...prev,
      [category]: [...prev[category], ...Array.from(files)],
    }));
  };

  const removePendingDiagnosticAt = (category: DiagnosticCategory, index: number) => {
    setPendingDiagnosticFiles((prev) => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index),
    }));
  };

  const removeServerDiagnosticFile = async (fileId: number) => {
    if (!currentSession) return;
    setIsSubmitting(true);
    try {
      await eyeCareService.deleteSessionDiagnosticFile(fileId);
      const fresh = await eyeCareService.getSession(currentSession.id);
      setCurrentSession(fresh);
      toast.success('File removed');
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove file');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEyePrescriptionSubmit = async (payload: PrescriptionOrderSubmitInput) => {
    if (!selectedOrder || !currentSession) {
      toast.error('Open an eye session before sending prescriptions');
      return;
    }

    const items = payload.items.map((item) => ({
      generic: item.generic,
      medication: null,
      medication_name: item.medication_name,
      quantity: item.quantity,
      unit: item.unit,
      dosage_form: item.dosage_form,
      strength: item.strength,
      dose: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      route: item.route,
      instructions: item.instructions || payload.clinicalIndication,
    }));

    const prescription = await pharmacyService.createPrescription({
      patient: selectedOrder.patient,
      visit: selectedOrder.visit || undefined,
      diagnosis: sessionForm.soap_note.assessment.diagnosis,
      notes: [
        `Eye clinic session ${currentSession.session_number}`,
        payload.clinicalIndication,
      ].filter(Boolean).join('\n'),
      items,
    } as any);

    const summary = `Prescription ${prescription.prescription_id || prescription.id} sent to Pharmacy (${items.length} item${items.length === 1 ? '' : 's'}).`;
    const nextSoapNote = structuredClone(sessionForm.soap_note);
    nextSoapNote.plan.medications = [nextSoapNote.plan.medications, summary].filter(Boolean).join('\n');
    updateSoapNote(() => nextSoapNote);
    await eyeCareService.updateSession(currentSession.id, {
      soap_note: nextSoapNote,
      notes: [
        nextSoapNote.plan.opticalCorrection && `Optical Correction: ${nextSoapNote.plan.opticalCorrection}`,
        nextSoapNote.plan.medications && `Medications: ${nextSoapNote.plan.medications}`,
        nextSoapNote.plan.followUpDate && `Follow-up Date: ${nextSoapNote.plan.followUpDate}`,
      ].filter(Boolean).join('\n'),
    });
    toast.success('Prescription sent to Pharmacy queue');
  };

  const OrderCard = ({ order }: { order: EyeOrder }) => {
    const completedSessions = order.completed_sessions_count ?? 0;
    const diagnosisCount = countOrderDiagnoses({ diagnosisText: order.diagnosis });

    return (
      <Card
        className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer ${
          order.status === 'in_progress' ? 'border-l-orange-500' :
          order.status === 'cancelled' ? 'border-l-red-500' :
          order.status === 'completed' ? 'border-l-emerald-500' :
          'border-l-yellow-500'
        }`}
        onClick={() => openViewDialog(order)}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <PatientAvatar name={order.patient_name ?? ''} size="sm" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground truncate">{order.patient_name ?? ''}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(order.status)}`}>
                    {order.status === 'in_progress' && <Activity className="h-2 w-2 mr-0.5" />}
                    {getQueueStatusLabel(order.status)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 border-blue-500/30">
                    {completedSessions} sessions completed
                  </Badge>
                  {diagnosisCount > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      {diagnosisCount} diagnosis{diagnosisCount === 1 ? '' : 'es'}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {order.status === 'completed' && (
                    <div className="h-8 w-8 flex items-center justify-center rounded border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted" onClick={(e) => { e.stopPropagation(); openViewDialog(order); }}>
                        <Eye className="h-4 w-4 text-muted-foreground hover:text-blue-600" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Manage Order</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span>{order.patient_id}</span>
                {order.ordered_by_name && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{order.ordered_by_name}</span>
                  </>
                )}
                <span>•</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRelativeTime(order.ordered_at)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!ready) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <TooltipProvider>
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
                <Activity className="h-8 w-8 text-blue-500" />
                Eye Orders
              </h1>
              <p className="text-muted-foreground mt-1">Process orders, document sessions, and manage ongoing eye clinic treatment flow.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border-l-4 border-l-yellow-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('pending')}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pending</p>
                        <p className="text-2xl sm:text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</p>
                      </div>
                      <Clock className="h-8 w-8 text-yellow-400" />
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">New eye clinic referrals awaiting processing</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border-l-4 border-l-orange-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('in_progress')}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">In Progress</p>
                        <p className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.inProgress}</p>
                      </div>
                      <Activity className="h-8 w-8 text-orange-400" />
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Active eye clinic treatment sessions</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border-l-4 border-l-red-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('cancelled')}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Cancelled</p>
                        <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400">{stats.cancelled}</p>
                      </div>
                      <XCircle className="h-8 w-8 text-red-400" />
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Cancelled eye clinic orders</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border-l-4 border-l-emerald-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('completed')}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Completed</p>
                        <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-emerald-400" />
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Finished eye clinic treatment plans</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EyecareOrdersTab)} className="w-full">
                  <TabsList>
                    <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
                    <TabsTrigger value="in_progress">In Progress ({stats.inProgress})</TabsTrigger>
                    <TabsTrigger value="cancelled">Cancelled ({stats.cancelled})</TabsTrigger>
                    <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Patient, order ID, Eye ID (e.g. EYE-000002)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-none">
                    <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger className="w-full sm:w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">This Week</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
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
            description="Apply a custom order date range to narrow down eye clinic orders."
            label="Order Date Range"
            value={dateRange}
            onChange={setDateRange}
            onClear={() => setDateRange({ from: '', to: '' })}
          />

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
            ) : orders.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders found</p>
              </CardContent></Card>
            ) : (
              orders.map((order) => <OrderCard key={order.id} order={order} />)
            )}
          </div>

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
                itemName="orders"
              />
            </Card>
          )}

          <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
            <DialogContent className={MODAL_SIZES.xl}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-teal-500" />
                  Manage Eye Order
                </DialogTitle>
                <DialogDescription>
                  EYE-{selectedOrder?.id?.toString().padStart(6, '0')} • {selectedOrder?.ordered_at ? formatDisplayDateTime(selectedOrder.ordered_at) : 'N/A'}
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && (
                <div className="space-y-4 py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className={getStatusColor(selectedOrder.status)}>
                      {getQueueStatusLabel(selectedOrder.status).toUpperCase()}
                    </Badge>
                    {(() => {
                      const rel = formatRelativeTime(selectedOrder.ordered_at);
                      return rel ? (
                        <span className="text-sm text-muted-foreground">Ordered {rel}</span>
                      ) : null;
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Patient</p>
                      <p className="font-medium text-base">{selectedOrder.patient_name ?? ''}</p>
                      <p className="text-sm text-muted-foreground font-mono">{selectedOrder.patient_id}</p>
                      <p className="text-xs text-muted-foreground mt-1">Location: {(selectedOrder as any).location_clinic_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Ordering Doctor</p>
                      {selectedOrder.ordered_by_name?.trim() && (
                        <p className="font-medium text-base">{selectedOrder.ordered_by_name}</p>
                      )}
                      <p className="text-sm text-muted-foreground">Eye Clinic Referral</p>
                    </div>
                  </div>

                  {selectedOrder.diagnosis ? (
                    <OrderDiagnosesBlock diagnosisText={selectedOrder.diagnosis} />
                  ) : null}

                  {selectedOrder.chief_complaint && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-muted-foreground mb-1">Chief Complaint</p>
                      <p className="text-sm">{selectedOrder.chief_complaint}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <p className="text-xs text-muted-foreground mb-1">Visual Acuity</p>
                      <p className="text-sm">OD: {selectedOrder.visual_acuity_od || '—'} | OS: {selectedOrder.visual_acuity_os || '—'} | OU: {selectedOrder.visual_acuity_ou || '—'}</p>
                    </div>

                    <div className="p-3 rounded-lg border bg-card">
                      <p className="text-xs text-muted-foreground mb-1">IOP</p>
                      <p className="text-sm">OD: {selectedOrder.iop_od ?? '—'} | OS: {selectedOrder.iop_os ?? '—'}</p>
                    </div>

                    {selectedOrder.treatment_plan && (
                      <div className="p-3 rounded-lg border bg-card">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <FileText className="h-3 w-3" /> Treatment Plan
                        </p>
                        <p className="text-sm">{selectedOrder.treatment_plan}</p>
                      </div>
                    )}

                    {selectedOrder.special_instructions && (
                      <div className="p-3 rounded-lg border bg-card">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Eye className="h-3 w-3" /> Special Instructions
                        </p>
                        <p className="text-sm">{selectedOrder.special_instructions}</p>
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg border bg-card">
                    <p className="text-xs text-muted-foreground mb-2">Order Timeline</p>
                    <div className="flex items-center gap-4 text-xs flex-wrap">
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                        <span>Ordered: {selectedOrder.ordered_at ? formatDisplayDateTime(selectedOrder.ordered_at) : 'N/A'}</span>
                      </div>
                      {selectedOrder.scheduled_at && (
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                          <span>Started: {formatDisplayDateTime(selectedOrder.scheduled_at)}</span>
                        </div>
                      )}
                      {selectedOrder.completed_at && (
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          <span>Completed: {formatDisplayDateTime(selectedOrder.completed_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedOrderSessions.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-muted-foreground flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          Sessions ({selectedOrderSessions.length})
                        </Label>
                        {selectedOrder.status !== 'cancelled' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => void addSessionForOrder(selectedOrder)}
                            disabled={isSubmitting}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Add Session
                          </Button>
                        )}
                      </div>
                      <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                        {[...selectedOrderSessions]
                          .sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0))
                          .map((session) => (
                            <div key={session.id} className="flex items-center justify-between px-3 py-2 text-sm">
                              <span>
                                Session {session.session_number} • {session.status.replace('_', ' ')}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8"
                                  onClick={() => void openSessionReport(session)}
                                >
                                  <FileText className="h-4 w-4 mr-1" />
                                  Report
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8"
                                  onClick={() => void openSessionDialog(session, selectedOrder)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                  {session.completed_at ? formatDisplayDateTime(session.completed_at) : formatRelativeTime(session.started_at || session.scheduled_at)}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    <div className="flex gap-2">
                      {(selectedOrder.status === 'pending' || selectedOrder.status === 'scheduled') && (
                        <Button
                          onClick={() => void startProcessing(selectedOrder)}
                          className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                          Start Processing
                        </Button>
                      )}
                      {selectedOrder.status === 'in_progress' && (
                        <>
                          <Button
                            onClick={() => {
                              const activeSession = [...selectedOrderSessions]
                                .filter((session) => session.status === 'in_progress' || session.status === 'scheduled')
                                .sort((a, b) => (b.session_number ?? 0) - (a.session_number ?? 0))[0];
                              if (!activeSession) {
                                toast.error('No active eye session found');
                                return;
                              }
                              void openSessionDialog(activeSession, selectedOrder);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                            disabled={isSubmitting}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Edit Session
                          </Button>
                          <Button
                            onClick={() => void endTreatment(selectedOrder)}
                            className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                            End Treatment
                          </Button>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2 ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsViewDialogOpen(false)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
            <DialogContent className={MODAL_SIZES.xl}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  Continue Comprehensive Eye Session
                </DialogTitle>
                <DialogDescription>
                  Continue assessment and treatment documentation
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && currentSession ? (
                <div className="space-y-6 py-4">
                  {patientVitals ? (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Current Vitals
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                        {Object.entries(patientVitals).map(([label, value]) => {
                          const toneClass =
                            label === 'Temperature' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' :
                            label === 'Blood Pressure' ? 'bg-red-50 dark:bg-red-900/20 text-red-600' :
                            label === 'Heart Rate' ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600' :
                            label === 'Resp. Rate' ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600' :
                            label === 'SpO2' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' :
                            label === 'Weight' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600' :
                            'bg-orange-50 dark:bg-orange-900/20 text-orange-600';

                          return (
                            <div key={label} className={`text-center p-3 rounded-lg ${toneClass}`}>
                              <div className="text-xs text-muted-foreground">{label}</div>
                              <div className="text-lg font-bold">{value}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Patient</p>
                      <div className="flex items-center gap-2">
                        <PatientAvatar name={selectedOrder.patient_name ?? ''} size="sm" />
                        <div>
                          <p className="font-medium">{selectedOrder.patient_name}</p>
                          <p className="text-sm text-muted-foreground font-mono">{selectedOrder.patient_id}</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Session</p>
                      <p className="font-medium">Session {currentSession.session_number}</p>
                      <p className="text-sm text-muted-foreground">Follow-up Treatment Session</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      SUBJECTIVE (S)
                    </h3>
                    <div className="space-y-2">
                      <Label>Chief Complaint (CC) *</Label>
                      <Textarea
                        value={sessionForm.soap_note.subjective.chiefComplaint}
                        onChange={(e) => updateSubjective('chiefComplaint', e.target.value)}
                        placeholder="Main ocular complaint..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        ['ocularHistory', 'Patient Ocular History (POHx)'],
                        ['medicalHistory', 'Patient Medical History (PMHx)'],
                        ['drugHistory', 'Medication / Drug History'],
                        ['allergyHistory', 'Allergies'],
                        ['familyOcularHistory', 'Family Ocular History (FOHx)'],
                        ['familyMedicalHistory', 'Family Medical History (FMHx)'],
                        ['socialHistory', 'Social History'],
                      ].map(([field, label]) => (
                        <div key={field} className="space-y-2">
                          <Label>{label}</Label>
                          <Textarea
                            value={(sessionForm.soap_note.subjective as any)[field]}
                            onChange={(e) => updateSubjective(field as keyof EyeSoapNote['subjective'], e.target.value)}
                            rows={2}
                            className="resize-none"
                          />
                        </div>
                      ))}
                      <div className="space-y-2">
                        <Label>Special Instructions</Label>
                        <Textarea
                          value={sessionForm.special_instructions}
                          onChange={(e) => setSessionForm((prev) => ({ ...prev, special_instructions: e.target.value }))}
                          placeholder="Clinical background or instructions..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      OBJECTIVE (O)
                    </h3>

                    <div className="space-y-2">
                      <h4 className="font-medium">1. Visual Acuity</h4>
                      <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="p-2 text-left font-medium">Type</th>
                              <th className="p-2 text-left font-medium">OD</th>
                              <th className="p-2 text-left font-medium">OS</th>
                              <th className="p-2 text-left font-medium">OU</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visualAcuityRows.map((row) => (
                              <tr key={row.key} className="border-t">
                                <td className="p-2 font-medium">{row.label}</td>
                                {(['od', 'os', 'ou'] as const).map((eye) => (
                                  <td key={eye} className="p-2">
                                    <Input
                                      value={sessionForm.soap_note.objective.visualAcuity[row.key]?.[eye] || ''}
                                      onChange={(e) => updateSoapPath('objective', 'visualAcuity', row.key, e.target.value, eye)}
                                      placeholder="e.g. 6/6"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-medium">2. External / Internal Examination</h4>
                      <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="p-2 text-left font-medium">Structure</th>
                              <th className="p-2 text-left font-medium">OD</th>
                              <th className="p-2 text-left font-medium">OS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {examinationRows.map((row) => (
                              <tr key={row.key} className="border-t">
                                <td className="p-2 font-medium">{row.label}</td>
                                {(['od', 'os'] as const).map((eye) => (
                                  <td key={eye} className="p-2">
                                    <Input
                                      value={sessionForm.soap_note.objective.examination[row.key]?.[eye] || ''}
                                      onChange={(e) => updateSoapPath('objective', 'examination', row.key, e.target.value, eye)}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-medium">3. Diagnostic Tests</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {[
                          ['iopOd', 'IOP OD (mmHg)', 'e.g. 10'],
                          ['iopOs', 'IOP OS (mmHg)', 'e.g. 20'],
                          ['method', 'Method', 'e.g. Applanation'],
                          ['time', 'Time', 'e.g. 09:30'],
                        ].map(([field, label, placeholder]) => (
                          <div key={field} className="space-y-2">
                            <Label>{label}</Label>
                            <Input
                              value={(sessionForm.soap_note.objective.diagnostics as any)[field]}
                              onChange={(e) => updateSoapPath('objective', 'diagnostics', field, e.target.value)}
                              placeholder={placeholder}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Upload supporting result files and add any result notes for b to d. You can attach multiple files per test.</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {([
                          ['pachymetry', 'b. Pachymetry', 'pachymetry'] as const,
                          ['oct', 'c. OCT', 'oct'] as const,
                          ['visualField', 'd. Visual Field (CVF)', 'visual_field'] as const,
                        ]).map(([field, label, diagCategory]) => (
                          <div key={field} className="space-y-2">
                            <Label>{label}</Label>
                            <div className="rounded-md border border-dashed p-3 space-y-2">
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {diagnosticAttachmentsForCategory(currentSession, diagCategory).map((att, idx) => (
                                  <div
                                    key={att.id != null ? `s-${att.id}` : `l-${idx}-${att.file}`}
                                    className="flex items-start justify-between gap-2 text-sm"
                                  >
                                    <div className="flex items-start gap-2 min-w-0">
                                      <Upload className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                      <div className="min-w-0">
                                        <a
                                          href={att.file}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-blue-600 hover:underline break-all"
                                        >
                                          {fileLabelFromAttachmentUrl(att.file, idx)}
                                        </a>
                                        {att.legacy ? (
                                          <p className="text-xs text-muted-foreground">Legacy upload</p>
                                        ) : null}
                                      </div>
                                    </div>
                                    {att.id != null ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 shrink-0"
                                        disabled={isSubmitting}
                                        onClick={() => void removeServerDiagnosticFile(att.id as number)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    ) : null}
                                  </div>
                                ))}
                                {pendingDiagnosticFiles[diagCategory].map((file, idx) => (
                                  <div key={`p-${idx}-${file.name}`} className="flex items-center justify-between gap-2 text-sm">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                                      <span className="font-medium truncate">{file.name}</span>
                                      <span className="text-xs text-muted-foreground shrink-0">(pending)</span>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 shrink-0"
                                      onClick={() => removePendingDiagnosticAt(diagCategory, idx)}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                                {diagnosticAttachmentsForCategory(currentSession, diagCategory).length === 0 &&
                                pendingDiagnosticFiles[diagCategory].length === 0 ? (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Upload className="h-4 w-4" />
                                    <span>No files yet</span>
                                  </div>
                                ) : null}
                              </div>
                              <Input
                                type="file"
                                multiple
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={(e) => {
                                  appendPendingDiagnostics(diagCategory, e.target.files);
                                  e.target.value = '';
                                }}
                              />
                            </div>
                            <Textarea
                              value={(sessionForm.soap_note.objective.diagnostics as any)[field]}
                              onChange={(e) => updateSoapPath('objective', 'diagnostics', field, e.target.value)}
                              placeholder="Uploaded result details or notes..."
                              rows={2}
                              className="resize-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-medium">4. Refraction</h4>
                      {[
                        ['lensometry', 'a. Lensometry (Current Glasses)'],
                        ['autorefraction', 'b. Autorefraction'],
                        ['retinoscopy', 'c. Retinoscopy'],
                        ['subjective', 'd. Subjective Refraction'],
                      ].map(([group, label]) => (
                        <div key={group} className="rounded-md border p-3 space-y-3">
                          <h5 className="font-medium text-sm">{label}</h5>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="p-2 text-left font-medium">Eye</th>
                                  <th className="p-2 text-left font-medium">Sphere</th>
                                  <th className="p-2 text-left font-medium">Cylinder</th>
                                  <th className="p-2 text-left font-medium">Axis</th>
                                  <th className="p-2 text-left font-medium">VA</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(['od', 'os'] as const).map((eye) => (
                                  <tr key={eye}>
                                    <td className="p-2 font-medium uppercase">{eye}</td>
                                    {(['sphere', 'cylinder', 'axis', 'va'] as const).map((field) => (
                                      <td key={field} className="p-2">
                                        <Input
                                          value={(sessionForm.soap_note.objective.refraction as any)[group][eye][field]}
                                          onChange={(e) => updateSoapPath('objective', 'refraction', group, e.target.value, `${eye}.${field}`)}
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {group === 'lensometry' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>Add (if present)</Label>
                                <Input
                                  value={sessionForm.soap_note.objective.refraction.lensometry.add}
                                  onChange={(e) => updateSoapPath('objective', 'refraction', 'lensometry', e.target.value, 'add')}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Prism (if any)</Label>
                                <Input
                                  value={sessionForm.soap_note.objective.refraction.lensometry.prism}
                                  onChange={(e) => updateSoapPath('objective', 'refraction', 'lensometry', e.target.value, 'prism')}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="rounded-md border p-3 space-y-3">
                        <h5 className="font-medium text-sm">e. Near Addition (if needed)</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>ADD</Label>
                            <Input
                              value={sessionForm.soap_note.objective.refraction.nearAddition.add}
                              onChange={(e) => updateSoapPath('objective', 'refraction', 'nearAddition', e.target.value, 'add')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Near VA</Label>
                            <Input
                              value={sessionForm.soap_note.objective.refraction.nearAddition.nearVa}
                              onChange={(e) => updateSoapPath('objective', 'refraction', 'nearAddition', e.target.value, 'nearVa')}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      ASSESSMENT (A)
                    </h3>
                    <div className="space-y-2">
                      <Label>Diagnosis (Primary & Secondary)</Label>
                      <Textarea
                        value={sessionForm.soap_note.assessment.diagnosis}
                        onChange={(e) => updateAssessment('diagnosis', e.target.value)}
                        placeholder="Primary diagnosis, secondary diagnoses, and clinical impression..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      PLAN (P)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Optical Correction (Comments)</Label>
                        <Textarea value={sessionForm.soap_note.plan.opticalCorrection} onChange={(e) => updatePlan('opticalCorrection', e.target.value)} rows={3} className="resize-none" />
                      </div>
                      <div className="space-y-2">
                        <Label>Management Plan</Label>
                        <Textarea value={sessionForm.soap_note.plan.managementPlan} onChange={(e) => updatePlan('managementPlan', e.target.value)} placeholder="Surgery, referral, or test sent..." rows={3} className="resize-none" />
                      </div>
                      <div className="space-y-2">
                        <Label>Follow-up Date</Label>
                        <Input type="date" value={sessionForm.soap_note.plan.followUpDate} onChange={(e) => updatePlan('followUpDate', e.target.value)} />
                      </div>
                    </div>
                    <div className="pt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setIsPrescriptionDialogOpen(true)}
                      >
                        <Pill className="h-3 w-3 mr-1" />
                        Send to Pharmacy
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setIsSessionDialogOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={() => void saveSessionDocumentation()} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  {currentSession?.status === 'completed' ? 'Save changes' : 'Save session'}
                </Button>
                {currentSession?.status !== 'completed' && (
                  <Button onClick={() => void saveSessionDocumentation({ complete: true })} disabled={isSubmitting} className="bg-green-500 hover:bg-green-600 text-white">
                    {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    End Session
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <EyeSessionReportDialog
            open={isSessionReportOpen}
            onOpenChange={(open) => {
              setIsSessionReportOpen(open);
              if (!open) {
                setReportOrderId(undefined);
                setReportSessionId(undefined);
              }
            }}
            orderId={reportOrderId}
            initialSessionId={reportSessionId}
          />

          <PrescriptionOrderModal
            open={isPrescriptionDialogOpen}
            onOpenChange={setIsPrescriptionDialogOpen}
            patientAllergies={sessionForm.soap_note.subjective.allergyHistory
              .split(/[\n,]/)
              .map((item) => item.trim())
              .filter(Boolean)}
            onSubmit={handleEyePrescriptionSubmit}
            confirmLabel="Send to Pharmacy"
          />
        </div>
      </DashboardLayout>
    </TooltipProvider>
  );
}
