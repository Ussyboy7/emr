"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from 'sonner';
import { OrderDiagnosesBlock } from '@/components/medical/OrderDiagnosesBlock';
import { countOrderDiagnoses } from '@/lib/consultation/order-diagnoses';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePhysioUrlSync } from '@/hooks/use-physio-url-sync';
import { usePhysioPageAuth } from '@/hooks/use-physio-page-auth';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import {
  findPhysioOrdersTabForOrders,
  isValidPhysioOrdersTab,
  orderMatchesPhysioOrdersTab,
  physioOrdersTabToStatus,
  PHYSIO_ORDERS_TAB_LABELS,
  type PhysioOrdersTab,
} from '@/lib/physiotherapy/physio-workflow-search';
import {
  emptyPhysioSessionForm,
  physioSessionFormForNewSession,
  physioSessionFormFromSession,
  physioSessionFormToCompletionPayload,
  physioSessionFormToCreatePayload,
  physioSessionFormToProgressPayload,
  physioSessionFormToUpdatePayload,
  type PhysioSessionFormData,
} from '@/lib/physiotherapy/physio-session-form';
import { physioService, patientService, type PhysioOrder, type PhysioSession } from '@/lib/services';
import { PhysioSessionReportDialog } from '@/components/physiotherapy/PhysioSessionReportDialog';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { getOrganizationHeader } from '@/lib/constants/organization';
import { formatDisplayDate, formatDisplayDateTime, toApiDateString } from '@/lib/dates';
import { PatientAvatar } from "@/components/shared/PatientAvatar";

import {
  Users, Search, Stethoscope, Calendar, Clock, CheckCircle, CheckCircle2,
  Eye, Play, AlertTriangle, Loader2, Activity, RefreshCw, XCircle,
  FileText, Target, ClipboardList, Plus, User, Lightbulb, Heart, Pencil, Download, Printer
} from 'lucide-react';

// Helper function to format relative time
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

// Priority color helper
const getPriorityColor = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case 'stat': return 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800';
    case 'urgent': return 'bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800';
    default: return 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800';
  }
};

export default function PhysiotherapyOrdersPage() {
  const { ready, handleAuthError, currentUser } = usePhysioPageAuth();
  const physioId = currentUser?.id ? Number(currentUser.id) : null;
  const [orders, setOrders] = useState<PhysioOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [activeTab, setActiveTab] = useState<PhysioOrdersTab>('pending');
  const autoTabRef = useRef<string | null>(null);

  usePhysioUrlSync({
    search: searchQuery,
    tab: activeTab,
    defaultTab: 'pending',
    onSearchFromUrl: setSearchQuery,
    onTabFromUrl: (tab) => setActiveTab(tab as PhysioOrdersTab),
    isValidTab: isValidPhysioOrdersTab,
  });
  const [dateFilter, setDateFilter] = useState('today');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Dialogs
  const [selectedOrder, setSelectedOrder] = useState<PhysioOrder | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isStartSessionDialogOpen, setIsStartSessionDialogOpen] = useState(false);
  const [isCompleteSessionDialogOpen, setIsCompleteSessionDialogOpen] = useState(false);
  const [isContinueSessionDialogOpen, setIsContinueSessionDialogOpen] = useState(false);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [orderSessionsList, setOrderSessionsList] = useState<PhysioSession[]>([]);
  const [isEditSessionDialogOpen, setIsEditSessionDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<PhysioSession | null>(null);
  const [isSessionReportOpen, setIsSessionReportOpen] = useState(false);
  const [reportSession, setReportSession] = useState<PhysioSession | null>(null);
  const [isCancelOrderDialogOpen, setIsCancelOrderDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [cancelActiveSessions, setCancelActiveSessions] = useState<'yes' | 'no'>('no');
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [sessionForm, setSessionForm] = useState<PhysioSessionFormData>(emptyPhysioSessionForm);

  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [patientVitals, setPatientVitals] = useState<any>(null);

  /**
   * Build the `ordered_at_after` / `ordered_at_before` params from the
   * current date filter state. Shared by `loadOrders` and `loadStats` so
   * the cards always reflect the visible rows.
   */
  const buildDateFilterParams = useCallback((): {
    ordered_at_after?: string;
    ordered_at_before?: string;
  } => {
    const result: { ordered_at_after?: string; ordered_at_before?: string } = {};
    if (dateRange.from || dateRange.to) {
      if (dateRange.from) result.ordered_at_after = dateRange.from;
      if (dateRange.to) result.ordered_at_before = dateRange.to;
      return result;
    }
    if (dateFilter === 'all') return result;
    const today = new Date();
    if (dateFilter === 'today') {
      result.ordered_at_after = toApiDateString(today);
      result.ordered_at_before = toApiDateString(today);
    } else if (dateFilter === 'week') {
      const from = new Date(today);
      from.setDate(from.getDate() - 7);
      result.ordered_at_after = toApiDateString(from);
    } else if (dateFilter === 'month') {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 1);
      result.ordered_at_after = toApiDateString(from);
    }
    return result;
  }, [dateFilter, dateRange]);

  const loadOrders = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const params: Record<string, any> = {
        page: currentPage,
        page_size: itemsPerPage,
      };

      const searching = Boolean(debouncedSearch.trim());
      if (searching) params.search = debouncedSearch.trim();

      const status = physioOrdersTabToStatus(activeTab);
      if (status) params.status = status;

      if (!searching) {
        const dp = buildDateFilterParams();
        if (dp.ordered_at_after) params.ordered_at_after = dp.ordered_at_after;
        if (dp.ordered_at_before) params.ordered_at_before = dp.ordered_at_before;
      }

      const response = await physioService.getOrders(params);
      setTotalCount(response.count);
      setOrders(response.results);
    } catch (err: any) {
      console.error('Error loading physiotherapy orders:', err);
      if (handleAuthError(err)) return;
      if (!silent) {
        setError(err.message || 'Failed to load orders');
        toast.error('Failed to load physiotherapy orders');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentPage, itemsPerPage, debouncedSearch, activeTab, buildDateFilterParams, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadOrders();
  }, [ready, loadOrders]);

  // Stats: scoped by the same date filter as the list so the cards match
  // the visible rows.
  const [stats, setStats] = useState({ pending: 0, scheduled: 0, inProgress: 0, cancelled: 0, completed: 0 });
  const loadStats = useCallback(async () => {
    try {
      const data = await physioService.getOrderStats(buildDateFilterParams());
      setStats({
        pending: data.pending,
        scheduled: data.scheduled,
        inProgress: data.in_progress,
        cancelled: data.cancelled,
        completed: data.completed,
      });
    } catch (err) {
      console.error('Failed to load physio order stats:', err);
      if (handleAuthError(err)) return;
      toast.error('Failed to load order statistics');
    }
  }, [buildDateFilterParams, handleAuthError]);

  const pollingPaused = useMemo(
    () =>
      isDateFilterDialogOpen ||
      isViewDialogOpen ||
      isStartSessionDialogOpen ||
      isCompleteSessionDialogOpen ||
      isContinueSessionDialogOpen ||
      isEditSessionDialogOpen ||
      isSessionReportOpen ||
      isCancelOrderDialogOpen,
    [
      isDateFilterDialogOpen,
      isViewDialogOpen,
      isStartSessionDialogOpen,
      isCompleteSessionDialogOpen,
      isContinueSessionDialogOpen,
      isEditSessionDialogOpen,
      isSessionReportOpen,
      isCancelOrderDialogOpen,
    ]
  );

  useEffect(() => {
    if (!ready) return;
    void loadStats();
  }, [ready, loadStats]);

  useEffect(() => {
    if (!ready || pollingPaused) return;
    const id = setInterval(() => {
      void loadOrders({ silent: true });
      void loadStats();
    }, 15000);
    return () => clearInterval(id);
  }, [ready, loadOrders, loadStats, pollingPaused]);

  // Load sessions for the order when View dialog is open
  useEffect(() => {
    if (!isViewDialogOpen || !selectedOrder?.id) {
      setOrderSessionsList([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await physioService.getSessions({ order: selectedOrder.id, page_size: MAX_LIST_PAGE_SIZE });
        if (!cancelled) setOrderSessionsList(r?.results ?? []);
      } catch (err) {
        if (!cancelled) {
          if (handleAuthError(err)) return;
          setOrderSessionsList([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isViewDialogOpen, selectedOrder?.id, handleAuthError]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, dateFilter, itemsPerPage, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  const openEditSession = (session: PhysioSession) => {
    setSessionForm(physioSessionFormFromSession(session));
    setEditingSession(session);
    setIsEditSessionDialogOpen(true);
  };

  const openSessionReport = (session: PhysioSession) => {
    setReportSession(session);
    setIsSessionReportOpen(true);
  };

  const getLatestInProgressSession = (sessions: PhysioSession[]) =>
    [...sessions]
      .filter((s) => s.status === 'in_progress')
      .sort((a, b) => (b.session_number ?? 0) - (a.session_number ?? 0))[0] ?? null;

  const getLatestUncompletedSession = (sessions: PhysioSession[]) =>
    [...sessions]
      .filter((s) => s.status !== 'completed' && s.status !== 'cancelled')
      .sort((a, b) => (b.session_number ?? 0) - (a.session_number ?? 0))[0] ?? null;

  const startNextSessionForOrder = async (order: PhysioOrder) => {
    if (!physioId) {
      toast.error('Unable to identify physiotherapist. Please re-login and try again.');
      return;
    }
    await loadPatientVitals(order.patient);
    const existingSessions = await physioService.getSessions({ order: order.id });
    const blockingSession = getLatestUncompletedSession(existingSessions.results || []);
    if (blockingSession) {
      toast.error(`Complete Session ${blockingSession.session_number ?? ''} before starting a new session.`);
      openEditSession(blockingSession);
      return;
    }
    const nextSessionNumber = (existingSessions.results?.length)
      ? Math.max(...existingSessions.results.map((s: any) => s.session_number || 0)) + 1
      : 1;

    const sessionPayload = {
      order: order.id,
      physiotherapist: physioId,
      session_number: nextSessionNumber,
      scheduled_at: new Date().toISOString(),
      status: 'in_progress',
    };
    const createdSession = await physioService.createSession(sessionPayload as any);
    await physioService.updateOrder(order.id, { status: 'in_progress' });
    toast.success(`Session ${nextSessionNumber} started`);

    const lastCompleted = (existingSessions.results || [])
      .filter((s: PhysioSession) => s.status === 'completed')
      .sort((a, b) => (b.id || 0) - (a.id || 0))[0];

    setSessionForm(physioSessionFormForNewSession(lastCompleted));
    setCurrentSession(createdSession);
    setIsStartSessionDialogOpen(true);
    setIsViewDialogOpen(false);
  };

  const handleEditSessionSave = async () => {
    if (!editingSession) return;
    setIsEditSaving(true);
    try {
      await physioService.updateSession(editingSession.id, physioSessionFormToUpdatePayload(sessionForm));
      toast.success('Session updated successfully');
      setIsEditSessionDialogOpen(false);
      setEditingSession(null);
      await loadOrders();
      await loadStats();
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to update session');
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleEditSessionSaveAndEnd = async () => {
    if (!editingSession || !selectedOrder) return;
    setIsEditSaving(true);
    try {
      await physioService.updateSession(editingSession.id, physioSessionFormToUpdatePayload(sessionForm));
      await handleCompleteIndividualSession(editingSession.id, sessionForm);
      setIsEditSessionDialogOpen(false);
      setEditingSession(null);
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to save and end session');
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder || !cancelReason) return;
    setIsSubmitting(true);
    try {
      const sessionsResponse = await physioService.getSessions({ order: selectedOrder.id });
      const openSessions = (sessionsResponse.results || []).filter(
        (s: any) => s.status !== 'completed' && s.status !== 'cancelled'
      );

      if (openSessions.length > 0 && cancelActiveSessions !== 'yes') {
        toast.error('This order has active/open sessions. Choose to cancel active sessions first.');
        setIsSubmitting(false);
        return;
      }

      if (openSessions.length > 0 && cancelActiveSessions === 'yes') {
        for (const s of openSessions) {
          await physioService.updateSession(s.id, {
            status: 'cancelled',
            session_notes: joinDisplayParts([s.session_notes || '', `Order cancelled: ${cancelReason}`, cancelNotes]).trim(),
          });
        }
      }

      await physioService.updateOrder(selectedOrder.id, {
        status: 'cancelled',
        special_instructions: joinDisplayParts([
          selectedOrder.special_instructions || '',
          `Cancellation reason: ${cancelReason}`,
          cancelNotes,
        ]).trim(),
      } as any);

      toast.success('Order cancelled successfully');
      setIsCancelOrderDialogOpen(false);
      setIsViewDialogOpen(false);
      setCancelReason('');
      setCancelNotes('');
      setCancelActiveSessions('no');
      setSelectedOrder(null);
      await loadOrders();
      await loadStats();
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to cancel order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
      case 'scheduled': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'in_progress': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30';
      case 'completed': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'cancelled': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
      default: return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
    }
  };

  const getTimeSince = (isoString: string) => formatRelativeTime(isoString);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q || loading || orders.length === 0) {
      autoTabRef.current = null;
      return;
    }
    if (orders.some((o) => orderMatchesPhysioOrdersTab(o, activeTab))) return;
    const next = findPhysioOrdersTabForOrders(orders);
    if (next && next !== activeTab) {
      const key = `${q}:${next}`;
      if (autoTabRef.current !== key) {
        autoTabRef.current = key;
        setActiveTab(next);
        toast.info(`Found in ${PHYSIO_ORDERS_TAB_LABELS[next]} — switched tab.`);
      }
    }
  }, [debouncedSearch, orders, activeTab, loading]);

  const activeUncompletedSession = useMemo(
    () => getLatestUncompletedSession(orderSessionsList),
    [orderSessionsList]
  );

  const handleStartSession = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);

    try {
      if (currentSession) {
        const sessionId = currentSession.id ?? currentSession.pk;
        if (sessionId == null || sessionId === undefined || sessionId === '') {
          toast.error('Session ID is missing. Please close and try Continue Session again.');
          setIsSubmitting(false);
          return;
        }
        // Update existing session (from Continue Session flow — save form into the new session)
        await physioService.updateSession(sessionId, physioSessionFormToUpdatePayload(sessionForm));

        toast.success('Session updated successfully');
      } else {
        if (!physioId) {
          toast.error('Unable to identify physiotherapist. Please re-login and try again.');
          setIsSubmitting(false);
          return;
        }
        // Get existing sessions to determine next session number
        const existingSessions = await physioService.getSessions({ order: selectedOrder.id });
        const nextSessionNumber = existingSessions.results.length + 1;

        // Create comprehensive session with all assessment data
        const sessionPayload = {
          order: selectedOrder.id,
          physiotherapist: physioId,
          session_number: nextSessionNumber,
          scheduled_at: new Date().toISOString(),
          ...physioSessionFormToCreatePayload(sessionForm),
        };

        await physioService.createSession(sessionPayload as any);

        // Update order status to in_progress
        await physioService.updateOrder(selectedOrder.id, { status: 'in_progress' });

        toast.success(`Session ${nextSessionNumber} started successfully`);
      }

      setIsStartSessionDialogOpen(false);
      setSelectedOrder(null);
      setCurrentSession(null);

      setSessionForm(emptyPhysioSessionForm());

      await loadOrders();
      await loadStats();
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to start session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndTreatment = async (order: PhysioOrder) => {
    setIsSubmitting(true);
    try {
      // First, get sessions for this order and complete them
      const sessionsResponse = await physioService.getSessions({ order: order.id });
      for (const session of sessionsResponse.results) {
        if (session.status !== 'completed') {
          await physioService.updateSession(session.id, {
            status: 'completed',
            completed_at: new Date().toISOString()
          });
        }
      }

      // Then complete the order
      await physioService.updateOrder(order.id, {
        status: 'completed',
        completed_at: new Date().toISOString()
      });
      toast.success('Treatment ended successfully');
      setIsViewDialogOpen(false);
      setSelectedOrder(null);
      await loadOrders();
      await loadStats();
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to end treatment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSessionProgress = async (sessionId: number, form: PhysioSessionFormData) => {
    try {
      await physioService.updateSession(sessionId, physioSessionFormToProgressPayload(form));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to save session progress');
    }
  };

  const handleCompleteIndividualSession = async (sessionId: number, form: PhysioSessionFormData) => {
    setIsSubmitting(true);
    try {
      await physioService.updateSession(sessionId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        ...physioSessionFormToCompletionPayload(form),
      });

      // Update order's sessions_completed count
      const sessionsResponse = await physioService.getSessions({ order: selectedOrder?.id });
      const completedCount = sessionsResponse.results.filter((s: any) => s.status === 'completed').length;

      await physioService.updateOrder(selectedOrder!.id, {
        sessions_completed: completedCount
      });

      // No longer auto-creating next session. Use Continue Session/Add Session when more sessions are needed.

      toast.success('Session completed successfully');
      setIsViewDialogOpen(false);
      setSelectedOrder(null);
      await loadOrders();
      await loadStats();
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to complete session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadPatientVitals = async (patientId: number) => {
    try {
      const latestVitals = await patientService.resolveVital({ patient: patientId });
      if (latestVitals) {
        const formattedVitals = {
          temperature: latestVitals.temperature ? `${latestVitals.temperature}°C` : '',
          bloodPressure: latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic
            ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}`
            : '',
          heartRate: latestVitals.heart_rate ? `${latestVitals.heart_rate} bpm` : '',
          respiratoryRate: latestVitals.respiratory_rate ? `${latestVitals.respiratory_rate}/min` : '',
          oxygenSaturation: latestVitals.oxygen_saturation ? `${latestVitals.oxygen_saturation}%` : '',
          weight: latestVitals.weight ? `${latestVitals.weight} kg` : '',
          height: latestVitals.height ? `${latestVitals.height} cm` : ''
        };
        setPatientVitals(formattedVitals);
      } else {
        setPatientVitals(null);
      }
    } catch (error) {
      if (handleAuthError(error)) return;
      console.error('Error loading patient vitals:', error);
      setPatientVitals(null);
    }
  };

  const openViewDialog = (order: PhysioOrder) => {
    setSelectedOrder(order);
    setIsViewDialogOpen(true);
  };

  // Order Card component - matches Lab Orders style
  const OrderCard = ({ order }: { order: PhysioOrder }) => {
    const diagnosisCount = countOrderDiagnoses({ diagnosisText: order.diagnosis });

    return (
      <Card
        className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer ${
          order.status === 'in_progress' ? 'border-l-orange-500' :
          order.status === 'scheduled' ? 'border-l-blue-500' :
          order.status === 'cancelled' ? 'border-l-red-500' :
          order.status === 'completed' ? 'border-l-emerald-500' :
          'border-l-yellow-500'
        }`}
        onClick={() => openViewDialog(order)}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <PatientAvatar name={order.patient_name ?? ''} size="sm" />

            {/* Info */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Name + Badges */}
              <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{order.patient_name ?? ''}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(order.status)}`}>
                              {order.status === 'in_progress' && <Activity className="h-2 w-2 mr-0.5" />}
                              {order.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                              order.status === 'in_progress'
                                ? 'bg-orange-500/10 text-orange-600 border-orange-500/30'
                                : 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                            }`}>
                              {order.sessions_completed || 0} sessions completed
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

              {/* Row 2: Details */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span>{order.patient_id}</span>
                {order.ordered_by_name && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{order.ordered_by_name}</span>
                  </>
                )}
                <span>•</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{getTimeSince(order.ordered_at)}</span>
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
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
                <Activity className="h-8 w-8 text-blue-500" />
                Physio Orders
              </h1>
              <p className="text-muted-foreground mt-1">Process orders, document sessions, and manage ongoing physiotherapy treatment flow.</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                <p className="text-xs">New referrals awaiting first session</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('scheduled')}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Scheduled</p>
                        <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.scheduled}</p>
                      </div>
                      <Calendar className="h-8 w-8 text-blue-400" />
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Orders with a future appointment scheduled</p>
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
                <p className="text-xs">Active treatment sessions</p>
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
                <p className="text-xs">Cancelled orders</p>
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
                <p className="text-xs">Finished treatment plans</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Filters & Tabs — Lab Orders style */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PhysioOrdersTab)} className="w-full">
                  <TabsList>
                    <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
                    <TabsTrigger value="scheduled">Scheduled ({stats.scheduled})</TabsTrigger>
                    <TabsTrigger value="in_progress">In Progress ({stats.inProgress})</TabsTrigger>
                    <TabsTrigger value="cancelled">Cancelled ({stats.cancelled})</TabsTrigger>
                    <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                  <div className="relative flex-1 min-w-[min(100%,16rem)]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Patient, order ID, Physio ID (e.g. PHY-000002)…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
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
            description="Apply a custom order date range to narrow down physiotherapy orders."
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
            ) : orders.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders found</p>
              </CardContent></Card>
            ) : (
              orders.map(order => <OrderCard key={order.id} order={order} />)
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
                itemName="orders"
              />
            </Card>
          )}

          {/* View Order Dialog */}
          <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
            <DialogContent className={MODAL_SIZES.xl}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-teal-500" />
                  Manage Physio Order
                </DialogTitle>
                <DialogDescription>
                  PHY-{selectedOrder?.id?.toString().padStart(6, '0')} • {selectedOrder?.ordered_at ? formatDisplayDateTime(selectedOrder.ordered_at) : 'N/A'}
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && (
                <div className="space-y-4 py-4">
                  {/* Order Header with Priority & Status */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className={getPriorityColor(selectedOrder.priority || 'routine')}>
                      {(selectedOrder.priority || 'routine').toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className={getStatusColor(selectedOrder.status)}>
                      {selectedOrder.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    {(() => {
                      const rel = formatRelativeTime(selectedOrder.ordered_at);
                      return rel ? (
                        <span className="text-sm text-muted-foreground">Ordered {rel}</span>
                      ) : null;
                    })()}
                  </div>

                  {/* Patient & Doctor Info */}
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
                      <p className="text-sm text-muted-foreground">Physiotherapy Referral</p>
                    </div>
                  </div>

                  {selectedOrder.diagnosis ? (
                    <OrderDiagnosesBlock diagnosisText={selectedOrder.diagnosis} />
                  ) : null}

                  {/* History/Clinical Findings */}
                  {selectedOrder.history_clinical_findings && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-muted-foreground mb-1">History/Clinical Findings</p>
                      <p className="text-sm">{selectedOrder.history_clinical_findings}</p>
                    </div>
                  )}

                  {/* Drug History */}
                  {selectedOrder.drug_history && (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <p className="text-xs text-muted-foreground mb-1">Drug History</p>
                      <p className="text-sm">{selectedOrder.drug_history}</p>
                    </div>
                  )}

                  {/* Special Instructions */}
                  {selectedOrder.special_instructions && (
                    <div className="p-3 rounded-lg border bg-card">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" /> Special Instructions
                      </p>
                      <p className="text-sm">{selectedOrder.special_instructions}</p>
                    </div>
                  )}

                  {/* Active Sessions */}
                  {selectedOrder.status === 'in_progress' && activeUncompletedSession && (
                    <div className="space-y-3">
                      <Label className="text-sm text-muted-foreground flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5" />
                        Active Sessions
                      </Label>
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>Session {activeUncompletedSession.session_number ?? 'N/A'}</strong> is currently active.
                        </p>
                        <div className="mt-2 text-xs space-y-1">
                          <p>• Click "Continue Session" to open the current uncompleted session</p>
                          <p>• Click "End session" when treatment for this session is finished</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="p-3 rounded-lg border bg-card">
                    <p className="text-xs text-muted-foreground mb-2">Order Timeline</p>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                        <span>Ordered: {selectedOrder.ordered_at ? formatDisplayDateTime(selectedOrder.ordered_at) : 'N/A'}</span>
                      </div>
                      {selectedOrder.scheduled_at && (
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                          <span>Session started: {formatDisplayDateTime(selectedOrder.scheduled_at)}</span>
                        </div>
                      )}
                      {selectedOrder.completed_at && (
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          <span>Completed: {formatDisplayDateTime(selectedOrder.completed_at)}</span>
                        </div>
                      )}
                    </div>
                    {selectedOrder.sessions_completed > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {selectedOrder.sessions_completed || 0} sessions completed
                      </div>
                    )}
                  </div>

                  {/* Sessions list with Edit */}
                  {orderSessionsList.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-muted-foreground flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          Sessions ({orderSessionsList.length})
                        </Label>
                        {(selectedOrder.status === 'in_progress' || selectedOrder.status === 'pending' || selectedOrder.status === 'scheduled' || selectedOrder.status === 'completed') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={async () => {
                              try {
                                const blockingSession = getLatestUncompletedSession(orderSessionsList);
                                if (blockingSession) {
                                  toast.error(`Complete Session ${blockingSession.session_number ?? ''} before adding a new session.`);
                                  openEditSession(blockingSession);
                                  return;
                                }
                                await startNextSessionForOrder(selectedOrder);
                              } catch (error) {
                                if (handleAuthError(error)) return;
                                console.error('Error adding new session:', error);
                                toast.error('Failed to add new session');
                              }
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Session
                          </Button>
                        )}
                      </div>
                      <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                        {orderSessionsList
                          .sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0))
                          .map((s) => (
                            <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                              <span>
                                {joinDisplayParts([
                                  s.session_number != null ? `Session ${s.session_number}` : '',
                                  s.status?.replace('_', ' '),
                                ])}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" className="h-8" onClick={() => openSessionReport(s)}>
                                  <FileText className="h-4 w-4 mr-1" />
                                  Report
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8" onClick={() => openEditSession(s)}>
                                  <Pencil className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                  {s.completed_at
                                    ? formatDisplayDateTime(s.completed_at)
                                    : (s.scheduled_at ? formatDisplayDateTime(s.scheduled_at) : 'N/A')}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    {/* Primary Actions */}
                    <div className="flex gap-2">
                      {!selectedOrder && (
                        <div className="text-sm text-muted-foreground">Loading order details...</div>
                      )}
                      {(selectedOrder.status === 'pending' || selectedOrder.status === 'scheduled') && (
                        <Button
                          onClick={async () => {
                            try {
                              await startNextSessionForOrder(selectedOrder);
                            } catch (error) {
                              if (handleAuthError(error)) return;
                              console.error('Error starting processing:', error);
                              toast.error('Failed to start processing');
                            }
                          }}
                          className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Start Processing
                        </Button>
                      )}
                      {selectedOrder.status === 'in_progress' && activeUncompletedSession && (
                        <>
                          <Button
                            onClick={async () => {
                              try {
                                openEditSession(activeUncompletedSession);
                                setIsViewDialogOpen(false);
                              } catch (error) {
                                if (handleAuthError(error)) return;
                                console.error('Error continuing session:', error);
                                toast.error('Failed to continue session');
                              }
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Continue Session
                          </Button>
                          <Button
                            onClick={async () => {
                              try {
                                const sessionsResponse = await physioService.getSessions({ order: selectedOrder.id });
                                const inProgress = getLatestUncompletedSession(sessionsResponse.results || []);
                                if (inProgress) {
                                  setCurrentSession(inProgress);
                                  setSessionForm(physioSessionFormFromSession(inProgress));
                                  setIsCompleteSessionDialogOpen(true);
                                  setIsViewDialogOpen(false);
                                } else {
                                  handleEndTreatment(selectedOrder);
                                }
                              } catch (error) {
                                if (handleAuthError(error)) return;
                                console.error('Error completing session:', error);
                                toast.error('Failed to complete session');
                              }
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            End session
                          </Button>
                        </>
                      )}
                      {selectedOrder.status === 'in_progress' && !activeUncompletedSession && (
                        <Button
                          onClick={() => handleEndTreatment(selectedOrder)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          End Treatment
                        </Button>
                      )}
                    </div>
                    {/* Secondary Actions */}
                    <div className="flex gap-2 ml-auto">
                      {(selectedOrder.status === 'pending' || selectedOrder.status === 'in_progress' || selectedOrder.status === 'scheduled') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-500 text-red-600 hover:bg-red-50 hover:border-red-600"
                          onClick={() => setIsCancelOrderDialogOpen(true)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel Order
                        </Button>
                      )}
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

          {/* Continue Session Dialog */}
          <Dialog open={isContinueSessionDialogOpen} onOpenChange={setIsContinueSessionDialogOpen}>
            <DialogContent className={MODAL_SIZES.xl}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  Continue Physiotherapy Session
                </DialogTitle>
                <DialogDescription>
                  Record treatment activities and monitor patient progress during the session
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && currentSession && (
                <div className="space-y-6 py-4">
                  {/* Session Info */}
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
                      <p className="text-xs text-muted-foreground mb-1">Session Info</p>
                      <p className="font-medium">Session {currentSession.session_number}</p>
                      <p className="text-sm text-muted-foreground">Treatment in Progress</p>
                    </div>
                  </div>

                  {/* Assessment Summary */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Initial Assessment Summary
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {currentSession.presenting_complaint && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground mb-1">Presenting Complaint</p>
                          <p className="text-sm">{currentSession.presenting_complaint}</p>
                        </div>
                      )}
                      {currentSession.pain_level_before && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground mb-1">Initial Pain Level</p>
                          <p className="text-sm font-medium">{currentSession.pain_level_before}/10</p>
                        </div>
                      )}
                      {currentSession.functional_goals && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground mb-1">Functional Goals</p>
                          <p className="text-sm">{currentSession.functional_goals}</p>
                        </div>
                      )}
                      {currentSession.clinical_reasoning && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground mb-1">Clinical Reasoning</p>
                          <p className="text-sm">{currentSession.clinical_reasoning}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Current Treatment Plan */}
                  {currentSession.next_session_plan && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Planned Treatment Approach
                      </h3>
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <p className="text-sm">{currentSession.next_session_plan}</p>
                      </div>
                    </div>
                  )}

                  {/* Treatment Activities */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Treatment Activities Performed
                    </h3>
                    <div className="space-y-2">
                      <Label>Treatment Notes (Real-time)</Label>
                      <Textarea
                        value={sessionForm.treatment_performed}
                        onChange={(e) => setSessionForm({...sessionForm, treatment_performed: e.target.value})}
                        placeholder="Record treatment modalities, exercises, and interventions as you perform them..."
                        rows={6}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  {/* Current Pain Assessment */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                      <Heart className="h-5 w-5" />
                      Current Pain Assessment
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Pre-treatment Pain (0-10)</Label>
                        <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <div className="text-lg font-bold text-red-600">
                            {currentSession.pain_level_before || 'Not recorded'}/10
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Current Pain Level (0-10)</Label>
                        <Select
                          value={sessionForm.pain_level_after?.toString() || ''}
                          onValueChange={(v) => setSessionForm({...sessionForm, pain_level_after: v ? parseInt(v) : null})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select current pain level" />
                          </SelectTrigger>
                          <SelectContent>
                            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                              <SelectItem key={n} value={n.toString()}>{n}/10</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Pain Change</Label>
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className={`text-lg font-bold ${
                            sessionForm.pain_level_after !== null && currentSession.pain_level_before
                              ? (sessionForm.pain_level_after < currentSession.pain_level_before ? 'text-green-600' : 'text-red-600')
                              : 'text-muted-foreground'
                          }`}>
                            {sessionForm.pain_level_after !== null && currentSession.pain_level_before !== null
                              ? `${sessionForm.pain_level_after - currentSession.pain_level_before > 0 ? '+' : ''}${sessionForm.pain_level_after - currentSession.pain_level_before}`
                              : 'Not assessed'
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Session Notes */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Session Notes
                    </h3>
                    <div className="space-y-2">
                      <Label>Observations & Progress</Label>
                      <Textarea
                        value={sessionForm.progress_notes}
                        onChange={(e) => setSessionForm({...sessionForm, progress_notes: e.target.value})}
                        placeholder="Patient response, technique modifications, equipment used, etc..."
                        rows={4}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={() => {
                        // Save current progress without completing session
                        if (currentSession) {
                          handleUpdateSessionProgress(currentSession.id, sessionForm);
                        }
                        toast.success('Session progress saved');
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Save Progress
                    </Button>
                    <Button
                      onClick={() => {
                        setIsContinueSessionDialogOpen(false);
                        setIsCompleteSessionDialogOpen(true);
                      }}
                      className="bg-green-500 hover:bg-green-600 text-white"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Finish Session
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Cancel Order Dialog */}
          <Dialog open={isCancelOrderDialogOpen} onOpenChange={setIsCancelOrderDialogOpen}>
            <DialogContent className={MODAL_SIZES.sm2}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  Cancel Physio Order
                </DialogTitle>
                <DialogDescription>
                  Cancellation requires a reason. If there are active sessions, choose whether to cancel them too.
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && (
                <div className="space-y-4 py-2">
                  <div className="p-3 rounded-lg bg-muted/40 border text-sm">
                    <p><span className="font-medium">Patient:</span> {selectedOrder.patient_name}</p>
                    <p><span className="font-medium">Order:</span> PHY-{String(selectedOrder.id).padStart(6, '0')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Cancellation Reason *</Label>
                    <Select value={cancelReason} onValueChange={setCancelReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="patient_declined">Patient declined</SelectItem>
                        <SelectItem value="duplicate_referral">Duplicate referral</SelectItem>
                        <SelectItem value="referred_in_error">Referred in error</SelectItem>
                        <SelectItem value="no_show">No-show / unreachable</SelectItem>
                        <SelectItem value="clinical_contraindication">Clinical contraindication</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Textarea
                      value={cancelNotes}
                      onChange={(e) => setCancelNotes(e.target.value)}
                      placeholder="Additional cancellation notes..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>If active sessions exist</Label>
                    <Select value={cancelActiveSessions} onValueChange={(v: 'yes' | 'no') => setCancelActiveSessions(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">Do not cancel active sessions (block cancellation)</SelectItem>
                        <SelectItem value="yes">Cancel active sessions and cancel order</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCancelOrderDialogOpen(false)}>Close</Button>
                <Button
                  onClick={handleCancelOrder}
                  disabled={isSubmitting || !cancelReason}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                  Confirm Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Complete Session Dialog */}
          <Dialog open={isCompleteSessionDialogOpen} onOpenChange={setIsCompleteSessionDialogOpen}>
            <DialogContent className={MODAL_SIZES.xl}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Complete Physiotherapy Session
                </DialogTitle>
                <DialogDescription>
                  Record treatment performed and update patient progress. Only this green <strong>End session</strong> flow sets the session status to completed; it will appear under Physiotherapy → Completed Sessions. <strong>Save session</strong> in Open/Continue documentation does not.
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && currentSession && (
                <div className="space-y-6 py-4">
                  {/* Session Info */}
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
                      <p className="text-xs text-muted-foreground mb-1">Session Info</p>
                      <p className="font-medium">Session {currentSession.session_number}</p>
                      <p className="text-sm text-muted-foreground">Completing Treatment Session</p>
                    </div>
                  </div>

                  {/* Treatment Performed */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Treatment Performed
                    </h3>
                    <div className="space-y-2">
                      <Label>Treatment Details *</Label>
                      <Textarea
                        value={sessionForm.treatment_performed}
                        onChange={(e) => setSessionForm({...sessionForm, treatment_performed: e.target.value})}
                        placeholder="Describe the treatment modalities, exercises, and interventions performed during this session..."
                        rows={4}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  {/* Post-Treatment Assessment */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Post-Treatment Assessment
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Pain Level After Treatment (0-10)</Label>
                        <Select
                          value={sessionForm.pain_level_after?.toString() || ''}
                          onValueChange={(v) => setSessionForm({...sessionForm, pain_level_after: v ? parseInt(v) : null})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select pain level" />
                          </SelectTrigger>
                          <SelectContent>
                            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                              <SelectItem key={n} value={n.toString()}>{n}/10</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Progress Notes</Label>
                        <Textarea
                          value={sessionForm.progress_notes}
                          onChange={(e) => setSessionForm({...sessionForm, progress_notes: e.target.value})}
                          placeholder="Patient progress, improvements, or concerns noted..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Home Exercises */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Home Exercise Program
                    </h3>
                    <div className="space-y-2">
                      <Label>Home Exercises Prescribed</Label>
                      <Textarea
                        value={sessionForm.home_exercises.map((ex) => (typeof ex === 'string' ? ex : ex.description ?? '')).join('\n')}
                        onChange={(e) => setSessionForm({
                          ...sessionForm,
                          home_exercises: e.target.value.split('\n').filter(line => line.trim()).map(desc => ({ description: desc.trim() }))
                        })}
                        placeholder="List exercises for patient to perform at home (one per line)..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  {/* Next Session Planning */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Next Session Planning
                    </h3>
                    <div className="space-y-2">
                      <Label>Plan for Next Session</Label>
                      <Textarea
                        value={sessionForm.next_session_plan}
                        onChange={(e) => setSessionForm({...sessionForm, next_session_plan: e.target.value})}
                        placeholder="Planned interventions, progressions, or adjustments for the next session..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  {/* Follow-up Instructions */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
                      <ClipboardList className="h-5 w-5" />
                      Follow-up Instructions
                    </h3>
                    <div className="space-y-2">
                      <Label>Patient Instructions</Label>
                      <Textarea
                        value={sessionForm.follow_up_instructions}
                        onChange={(e) => setSessionForm({...sessionForm, follow_up_instructions: e.target.value})}
                        placeholder="Instructions for patient between sessions (activity modifications, precautions, etc.)..."
                        rows={2}
                        className="resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setIsCompleteSessionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (currentSession) {
                      handleCompleteIndividualSession(currentSession.id, sessionForm);
                      setIsCompleteSessionDialogOpen(false);
                      setSessionForm(emptyPhysioSessionForm());
                    }
                  }}
                  disabled={isSubmitting || !sessionForm.treatment_performed.trim()}
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  End session
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <PhysioSessionReportDialog
            open={isSessionReportOpen}
            onOpenChange={(open) => {
              setIsSessionReportOpen(open);
              if (!open) setReportSession(null);
            }}
            session={reportSession}
            handleAuthError={handleAuthError}
          />

          {/* Edit Session Dialog (Orders) */}
          <Dialog open={isEditSessionDialogOpen} onOpenChange={(o) => { if (!o) { setIsEditSessionDialogOpen(false); setEditingSession(null); } }}>
            <DialogContent className={MODAL_SIZES.xl}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="h-5 w-5 text-amber-500" />
                  {joinDisplayParts([
                    'Edit Session',
                    editingSession?.session_number,
                    (editingSession as any)?.patient_name || selectedOrder?.patient_name,
                  ])}
                </DialogTitle>
                <DialogDescription>Update assessment and treatment documentation. Changes will appear in the Session Report.</DialogDescription>
              </DialogHeader>
              {editingSession && (
                <div className="space-y-6 py-4">
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2"><User className="h-5 w-5" /> A. Patient Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Presenting Complaint</Label><Textarea value={sessionForm.presenting_complaint} onChange={(e) => setSessionForm({ ...sessionForm, presenting_complaint: e.target.value })} placeholder="Chief complaint..." rows={3} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Pain Before (0–10)</Label><Select value={sessionForm.pain_level_before?.toString() ?? ''} onValueChange={(v) => setSessionForm({ ...sessionForm, pain_level_before: v ? parseInt(v) : null })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{[0,1,2,3,4,5,6,7,8,9,10].map((n) => <SelectItem key={n} value={n.toString()}>{n}/10</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-2"><Label>Pain After (0–10)</Label><Select value={sessionForm.pain_level_after?.toString() ?? ''} onValueChange={(v) => setSessionForm({ ...sessionForm, pain_level_after: v ? parseInt(v) : null })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{[0,1,2,3,4,5,6,7,8,9,10].map((n) => <SelectItem key={n} value={n.toString()}>{n}/10</SelectItem>)}</SelectContent></Select></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2"><FileText className="h-5 w-5" /> B. Medical & Social Background</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Medical History</Label><Textarea value={sessionForm.medical_history} onChange={(e) => setSessionForm({ ...sessionForm, medical_history: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Medications</Label><Textarea value={sessionForm.medications} onChange={(e) => setSessionForm({ ...sessionForm, medications: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Social History</Label><Textarea value={sessionForm.social_history} onChange={(e) => setSessionForm({ ...sessionForm, social_history: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Previous Treatments</Label><Textarea value={sessionForm.previous_treatments} onChange={(e) => setSessionForm({ ...sessionForm, previous_treatments: e.target.value })} rows={2} className="resize-none" /></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 flex items-center gap-2"><Activity className="h-5 w-5" /> C. Physical Examination</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Posture & Gait</Label><Textarea value={sessionForm.posture_gait} onChange={(e) => setSessionForm({ ...sessionForm, posture_gait: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Range of Motion</Label><Textarea value={sessionForm.range_of_motion} onChange={(e) => setSessionForm({ ...sessionForm, range_of_motion: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Muscle Strength</Label><Textarea value={sessionForm.muscle_strength} onChange={(e) => setSessionForm({ ...sessionForm, muscle_strength: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Special Tests</Label><Textarea value={sessionForm.special_tests} onChange={(e) => setSessionForm({ ...sessionForm, special_tests: e.target.value })} rows={2} className="resize-none" /></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2"><Target className="h-5 w-5" /> D. Functional Evaluation</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Functional Assessment</Label><Textarea value={sessionForm.functional_assessment} onChange={(e) => setSessionForm({ ...sessionForm, functional_assessment: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Functional Goals</Label><Textarea value={sessionForm.functional_goals} onChange={(e) => setSessionForm({ ...sessionForm, functional_goals: e.target.value })} rows={2} className="resize-none" /></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2"><Lightbulb className="h-5 w-5" /> E. Clinical Reasoning</h3>
                    <div className="space-y-2"><Label>Assessment Findings & Clinical Impression</Label><Textarea value={sessionForm.clinical_reasoning} onChange={(e) => setSessionForm({ ...sessionForm, clinical_reasoning: e.target.value })} rows={3} className="resize-none" /></div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 flex items-center gap-2"><ClipboardList className="h-5 w-5" /> F. Treatment Plan & Outcomes</h3>
                    <div className="space-y-4">
                      <div className="space-y-2"><Label>Planned Treatment / Next Session Plan</Label><Textarea value={sessionForm.next_session_plan} onChange={(e) => setSessionForm({ ...sessionForm, next_session_plan: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Treatment Performed</Label><Textarea value={sessionForm.treatment_performed} onChange={(e) => setSessionForm({ ...sessionForm, treatment_performed: e.target.value })} rows={3} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Progress Notes</Label><Textarea value={sessionForm.progress_notes} onChange={(e) => setSessionForm({ ...sessionForm, progress_notes: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Home Exercises (one per line)</Label><Textarea value={sessionForm.exercises_prescribed.join('\n')} onChange={(e) => setSessionForm({ ...sessionForm, exercises_prescribed: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })} rows={3} className="resize-none" /></div>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => { setIsEditSessionDialogOpen(false); setEditingSession(null); }}>Cancel</Button>
                {editingSession?.status === 'in_progress' && (
                  <Button onClick={handleEditSessionSaveAndEnd} disabled={isEditSaving || !sessionForm.treatment_performed.trim()} className="bg-green-600 hover:bg-green-700 text-white">
                    {isEditSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Save & End Session
                  </Button>
                )}
                <Button onClick={handleEditSessionSave} disabled={isEditSaving} className="bg-amber-500 hover:bg-amber-600 text-white">
                  {isEditSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pencil className="h-4 w-4 mr-2" />}
                  Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Start Session Dialog */}
          <Dialog open={isStartSessionDialogOpen} onOpenChange={(open) => {
            setIsStartSessionDialogOpen(open);
            if (!open) {
              setCurrentSession(null);
              setSessionForm(emptyPhysioSessionForm());
            }
          }}>
            <DialogContent className={MODAL_SIZES.xl}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-teal-500" />
                  {currentSession ? 'Continue Comprehensive Physio Session' : 'Start Comprehensive Physio Session'}
                </DialogTitle>
                <DialogDescription>
                  {currentSession ? 'Continue assessment and treatment documentation' : 'Complete initial assessment and treatment documentation'}
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && (
                <div className="space-y-6 py-4">
                  {/* Current Vitals */}
                  {patientVitals && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Current Vitals
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                        {patientVitals.temperature && (
                          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <div className="text-xs text-muted-foreground">Temperature</div>
                            <div className="text-lg font-bold text-blue-600">{patientVitals.temperature}</div>
                          </div>
                        )}
                        {patientVitals.bloodPressure && (
                          <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                            <div className="text-xs text-muted-foreground">Blood Pressure</div>
                            <div className="text-lg font-bold text-red-600">{patientVitals.bloodPressure}</div>
                          </div>
                        )}
                        {patientVitals.heartRate && (
                          <div className="text-center p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                            <div className="text-xs text-muted-foreground">Heart Rate</div>
                            <div className="text-lg font-bold text-pink-600">{patientVitals.heartRate}</div>
                          </div>
                        )}
                        {patientVitals.respiratoryRate && (
                          <div className="text-center p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                            <div className="text-xs text-muted-foreground">Resp. Rate</div>
                            <div className="text-lg font-bold text-cyan-600">{patientVitals.respiratoryRate}</div>
                          </div>
                        )}
                        {patientVitals.oxygenSaturation && (
                          <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                            <div className="text-xs text-muted-foreground">SpO2</div>
                            <div className="text-lg font-bold text-emerald-600">{patientVitals.oxygenSaturation}</div>
                          </div>
                        )}
                        {patientVitals.weight && (
                          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <div className="text-xs text-muted-foreground">Weight</div>
                            <div className="text-lg font-bold text-purple-600">{patientVitals.weight}</div>
                          </div>
                        )}
                        {patientVitals.height && (
                          <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                            <div className="text-xs text-muted-foreground">Height</div>
                            <div className="text-lg font-bold text-orange-600">{patientVitals.height}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Patient & Session Header */}
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
                      <p className="text-xs text-muted-foreground mb-1">Session Info</p>
                      <p className="font-medium">Session {(selectedOrder.sessions_completed || 0) + 1}</p>
                      <p className="text-sm text-muted-foreground">
                        {(selectedOrder.sessions_completed || 0) === 0 ? 'Comprehensive Initial Assessment' : 'Follow-up Treatment Session'}
                      </p>
                    </div>
                  </div>

                  {/* A. Patient Assessment */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
                      <User className="h-5 w-5" />
                      A. Patient Assessment
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Presenting Complaint *</Label>
                        <Textarea
                          value={sessionForm.presenting_complaint}
                          onChange={(e) => setSessionForm({...sessionForm, presenting_complaint: e.target.value})}
                          placeholder="Chief complaint and current symptoms..."
                          rows={3}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Pain Level (0-10)</Label>
                        <Select value={sessionForm.pain_level_before?.toString() || ''} onValueChange={(v) => setSessionForm({...sessionForm, pain_level_before: v ? parseInt(v) : null})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select pain level" />
                          </SelectTrigger>
                          <SelectContent>
                            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                              <SelectItem key={n} value={n.toString()}>{n}/10</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* B. Medical & Social Background */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      B. Medical & Social Background
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Medical History</Label>
                        <Textarea
                          value={sessionForm.medical_history}
                          onChange={(e) => setSessionForm({...sessionForm, medical_history: e.target.value})}
                          placeholder="Relevant medical conditions, comorbidities..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Medications</Label>
                        <Textarea
                          value={sessionForm.medications}
                          onChange={(e) => setSessionForm({...sessionForm, medications: e.target.value})}
                          placeholder="Current medications and dosages..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Social History</Label>
                        <Textarea
                          value={sessionForm.social_history}
                          onChange={(e) => setSessionForm({...sessionForm, social_history: e.target.value})}
                          placeholder="Occupation, lifestyle, support systems..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Previous Treatments</Label>
                        <Textarea
                          value={sessionForm.previous_treatments}
                          onChange={(e) => setSessionForm({...sessionForm, previous_treatments: e.target.value})}
                          placeholder="Prior physiotherapy or related treatments..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* C. Physical Examination */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      C. Physical Examination
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Posture & Gait</Label>
                        <Textarea
                          value={sessionForm.posture_gait}
                          onChange={(e) => setSessionForm({...sessionForm, posture_gait: e.target.value})}
                          placeholder="Static/dynamic posture, gait analysis..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Range of Motion</Label>
                        <Textarea
                          value={sessionForm.range_of_motion}
                          onChange={(e) => setSessionForm({...sessionForm, range_of_motion: e.target.value})}
                          placeholder="Joint ROM measurements with goniometer..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Muscle Strength</Label>
                        <Textarea
                          value={sessionForm.muscle_strength}
                          onChange={(e) => setSessionForm({...sessionForm, muscle_strength: e.target.value})}
                          placeholder="Manual muscle testing results (0-5 scale)..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Special Tests</Label>
                        <Textarea
                          value={sessionForm.special_tests}
                          onChange={(e) => setSessionForm({...sessionForm, special_tests: e.target.value})}
                          placeholder="Orthopedic/neurological test results..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* D. Functional Evaluation */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      D. Functional Evaluation
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Functional Assessment</Label>
                        <Textarea
                          value={sessionForm.functional_assessment}
                          onChange={(e) => setSessionForm({...sessionForm, functional_assessment: e.target.value})}
                          placeholder="Activities of daily living assessment..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Functional Goals</Label>
                        <Textarea
                          value={sessionForm.functional_goals}
                          onChange={(e) => setSessionForm({...sessionForm, functional_goals: e.target.value})}
                          placeholder="Short-term and long-term functional goals..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* E. Clinical Reasoning */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      E. Clinical Reasoning
                    </h3>
                    <div className="space-y-2">
                      <Label>Assessment Findings & Clinical Impression</Label>
                      <Textarea
                        value={sessionForm.clinical_reasoning}
                        onChange={(e) => setSessionForm({...sessionForm, clinical_reasoning: e.target.value})}
                        placeholder="Key assessment findings, working diagnosis, prognosis, rationale for treatment approach..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  {/* F. Treatment Plan */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                      <ClipboardList className="h-5 w-5" />
                      F. Treatment Plan
                    </h3>
                    <div className="space-y-2">
                      <Label>Planned Treatment Approach</Label>
                      <Textarea
                        value={sessionForm.next_session_plan}
                        onChange={(e) => setSessionForm({...sessionForm, next_session_plan: e.target.value})}
                        placeholder="Treatment modalities, exercises to prescribe, frequency, duration, goals..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setIsStartSessionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleStartSession}
                  disabled={isSubmitting || !sessionForm.presenting_complaint.trim()}
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {currentSession ? 'Save session' : 'Begin documentation'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>{/* end container */}
      </DashboardLayout>
    </TooltipProvider>
  );
}
