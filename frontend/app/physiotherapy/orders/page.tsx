"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { physioService, type PhysioOrder, type PhysioSession } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { useCurrentUser } from '@/hooks/use-current-user';
import { isAuthenticationError } from '@/lib/auth-errors';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { apiFetch } from '@/lib/api-client';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { getOrganizationHeader } from '@/lib/constants/organization';

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
    return date.toLocaleDateString();
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

export default function PhysioPoolQueuePage() {
  const [orders, setOrders] = useState<PhysioOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const { currentUser } = useCurrentUser();
  const physioId = currentUser?.id ? Number(currentUser.id) : null;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [dateFilter, setDateFilter] = useState('today');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
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
  const [reportViewingSession, setReportViewingSession] = useState<PhysioSession | null>(null);
  const [isCancelOrderDialogOpen, setIsCancelOrderDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [cancelActiveSessions, setCancelActiveSessions] = useState<'yes' | 'no'>('no');
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editSessionData, setEditSessionData] = useState({
    presenting_complaint: '', pain_level_before: null as number | null, pain_level_after: null as number | null,
    medical_history: '', surgical_history: '', medications: '', allergies: '', social_history: '', previous_treatments: '',
    posture_gait: '', range_of_motion: '', muscle_strength: '', sensation: '', reflexes: '', balance_coordination: '', special_tests: '',
    functional_assessment: '', assistive_devices: '', functional_goals: '', functional_limitations: '',
    assessment_findings: '', diagnosis_impression: '', prognosis: '', clinical_reasoning: '',
    treatment_performed: '', exercises_prescribed: [] as string[], equipment_used: [] as any[],
    patient_education: '', next_session_plan: '', session_notes: '', progress_notes: '', recommendations: [] as any[], follow_up_instructions: '',
  });

  // Session completion form
  const [sessionCompletionData, setSessionCompletionData] = useState({
    treatment_performed: '',
    pain_level_after: null as number | null,
    progress_notes: '',
    exercises_prescribed: [] as string[],
    home_exercises: [] as any[],
    next_session_plan: '',
    recommendations: [] as any[],
    follow_up_instructions: ''
  });

  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Comprehensive session data
  const [sessionData, setSessionData] = useState({
    presenting_complaint: '',
    pain_level_before: null as number | null,
    medical_history: '',
    surgical_history: '',
    medications: '',
    allergies: '',
    social_history: '',
    previous_treatments: '',
    posture_gait: '',
    range_of_motion: '',
    muscle_strength: '',
    sensation: '',
    reflexes: '',
    balance_coordination: '',
    special_tests: '',
    functional_assessment: '',
    assistive_devices: '',
    functional_goals: '',
    functional_limitations: '',
    assessment_findings: '',
    diagnosis_impression: '',
    prognosis: '',
    clinical_reasoning: '',
    treatment_performed: '',
    exercises_prescribed: [],
    equipment_used: [],
    patient_education: '',
    next_session_plan: '',
    session_notes: '',
    progress_notes: '',
    recommendations: [],
    follow_up_instructions: '',
    home_exercises: [] as any[]
  });

  // Patient vitals
  const [patientVitals, setPatientVitals] = useState<any>(null);

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
      // Note: searchQuery, dateFilter not yet implemented in backend

      if (searchQuery) params.search = searchQuery;

      const response = await physioService.getOrders(params);
      setTotalCount(response.count);
      setOrders(response.results);
    } catch (err: any) {
      console.error('Error loading physiotherapy orders:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else if (!silent) {
        setError(err.message || 'Failed to load orders');
        toast.error('Failed to load physiotherapy orders');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentPage, itemsPerPage, searchQuery, dateFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const pollingPaused = useMemo(
    () =>
      isDateFilterDialogOpen ||
      isViewDialogOpen ||
      isStartSessionDialogOpen ||
      isCompleteSessionDialogOpen ||
      isContinueSessionDialogOpen ||
      isEditSessionDialogOpen,
    [
      isDateFilterDialogOpen,
      isViewDialogOpen,
      isStartSessionDialogOpen,
      isCompleteSessionDialogOpen,
      isContinueSessionDialogOpen,
      isEditSessionDialogOpen,
    ]
  );

  useEffect(() => {
    if (pollingPaused) return;
    const id = setInterval(() => {
      void loadOrders({ silent: true });
    }, 15000);
    return () => clearInterval(id);
  }, [loadOrders, pollingPaused]);

  // Load sessions for the order when View dialog is open
  useEffect(() => {
    if (!isViewDialogOpen || !selectedOrder?.id) {
      setOrderSessionsList([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await physioService.getSessions({ order: selectedOrder.id, page_size: 100 });
        if (!cancelled) setOrderSessionsList(r?.results ?? []);
      } catch {
        if (!cancelled) setOrderSessionsList([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isViewDialogOpen, selectedOrder?.id]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, dateFilter, itemsPerPage, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  const openEditSession = (session: PhysioSession) => {
    const s = session as any;
    const ex = s.exercises_prescribed || s.home_exercises || [];
    const exLines = Array.isArray(ex) ? ex.map((e: any) => (typeof e === 'string' ? e : (e?.description ?? ''))) : [];
    setEditSessionData({
      presenting_complaint: s.presenting_complaint || '', pain_level_before: s.pain_level_before ?? null, pain_level_after: s.pain_level_after ?? null,
      medical_history: s.medical_history || '', surgical_history: s.surgical_history || '', medications: s.medications || '', allergies: s.allergies || '',
      social_history: s.social_history || '', previous_treatments: s.previous_treatments || '',
      posture_gait: s.posture_gait || '', range_of_motion: s.range_of_motion || '', muscle_strength: s.muscle_strength || '',
      sensation: s.sensation || '', reflexes: s.reflexes || '', balance_coordination: s.balance_coordination || '', special_tests: s.special_tests || '',
      functional_assessment: s.functional_assessment || '', assistive_devices: s.assistive_devices || '', functional_goals: s.functional_goals || '', functional_limitations: s.functional_limitations || '',
      assessment_findings: s.assessment_findings || '', diagnosis_impression: s.diagnosis_impression || '', prognosis: s.prognosis || '',
      clinical_reasoning: s.clinical_reasoning || s.assessment_findings || '',
      treatment_performed: s.treatment_performed || '', exercises_prescribed: exLines, equipment_used: Array.isArray(s.equipment_used) ? s.equipment_used : [],
      patient_education: s.patient_education || '', next_session_plan: s.next_session_plan || '', session_notes: s.session_notes || '',
      progress_notes: s.progress_notes || '', recommendations: Array.isArray(s.recommendations) ? s.recommendations : [], follow_up_instructions: s.follow_up_instructions || '',
    });
    setEditingSession(session);
    setIsEditSessionDialogOpen(true);
  };

  const openSessionReport = (session: PhysioSession) => {
    setReportViewingSession(session);
    setIsSessionReportOpen(true);
  };

  const handlePrintSessionReport = () => {
    window.print();
  };

  const handleDownloadSessionReport = () => {
    window.print();
    toast.success('Use Save as PDF in the print dialog to download.');
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
      .filter((s: any) => s.status === 'completed')
      .sort((a: any, b: any) => (b.id || 0) - (a.id || 0))[0];

    const baseData = {
      presenting_complaint: '',
      pain_level_before: null,
      medical_history: '',
      surgical_history: '',
      medications: '',
      allergies: '',
      social_history: '',
      previous_treatments: '',
      posture_gait: '',
      range_of_motion: '',
      muscle_strength: '',
      sensation: '',
      reflexes: '',
      balance_coordination: '',
      special_tests: '',
      functional_assessment: '',
      assistive_devices: '',
      functional_goals: '',
      functional_limitations: '',
      assessment_findings: '',
      diagnosis_impression: '',
      prognosis: '',
      clinical_reasoning: '',
      treatment_performed: '',
      exercises_prescribed: [] as string[],
      equipment_used: [] as string[],
      patient_education: '',
      next_session_plan: '',
      session_notes: '',
      progress_notes: '',
      recommendations: [] as any[],
      follow_up_instructions: '',
      home_exercises: [] as any[]
    };
    if (lastCompleted) {
      baseData.presenting_complaint = lastCompleted.presenting_complaint || '';
      baseData.medical_history = lastCompleted.medical_history || '';
      baseData.functional_goals = lastCompleted.functional_goals || '';
      baseData.diagnosis_impression = lastCompleted.diagnosis_impression || '';
      baseData.clinical_reasoning = lastCompleted.clinical_reasoning || '';
    }
    (setSessionData as any)(baseData);
    setCurrentSession(createdSession);
    setIsStartSessionDialogOpen(true);
    setIsViewDialogOpen(false);
  };

  const handleEditSessionSave = async () => {
    if (!editingSession) return;
    setIsEditSaving(true);
    try {
      await physioService.updateSession(editingSession.id, {
        presenting_complaint: editSessionData.presenting_complaint, pain_level_before: editSessionData.pain_level_before ?? undefined, pain_level_after: editSessionData.pain_level_after ?? undefined,
        medical_history: editSessionData.medical_history, surgical_history: editSessionData.surgical_history, medications: editSessionData.medications, allergies: editSessionData.allergies,
        social_history: editSessionData.social_history, previous_treatments: editSessionData.previous_treatments,
        posture_gait: editSessionData.posture_gait, range_of_motion: editSessionData.range_of_motion, muscle_strength: editSessionData.muscle_strength,
        sensation: editSessionData.sensation, reflexes: editSessionData.reflexes, balance_coordination: editSessionData.balance_coordination, special_tests: editSessionData.special_tests,
        functional_assessment: editSessionData.functional_assessment, assistive_devices: editSessionData.assistive_devices, functional_goals: editSessionData.functional_goals, functional_limitations: editSessionData.functional_limitations,
        assessment_findings: editSessionData.assessment_findings, diagnosis_impression: editSessionData.diagnosis_impression, prognosis: editSessionData.prognosis, clinical_reasoning: editSessionData.clinical_reasoning,
        treatment_performed: editSessionData.treatment_performed, exercises_prescribed: editSessionData.exercises_prescribed.map((d) => ({ description: d })), equipment_used: editSessionData.equipment_used,
        patient_education: editSessionData.patient_education, next_session_plan: editSessionData.next_session_plan, session_notes: editSessionData.session_notes,
        progress_notes: editSessionData.progress_notes, recommendations: editSessionData.recommendations, follow_up_instructions: editSessionData.follow_up_instructions,
      });
      toast.success('Session updated successfully');
      setIsEditSessionDialogOpen(false);
      setEditingSession(null);
      await loadOrders();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update session');
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleEditSessionSaveAndEnd = async () => {
    if (!editingSession || !selectedOrder) return;
    setIsEditSaving(true);
    try {
      await physioService.updateSession(editingSession.id, {
        presenting_complaint: editSessionData.presenting_complaint,
        pain_level_before: editSessionData.pain_level_before ?? undefined,
        pain_level_after: editSessionData.pain_level_after ?? undefined,
        medical_history: editSessionData.medical_history,
        surgical_history: editSessionData.surgical_history,
        medications: editSessionData.medications,
        allergies: editSessionData.allergies,
        social_history: editSessionData.social_history,
        previous_treatments: editSessionData.previous_treatments,
        posture_gait: editSessionData.posture_gait,
        range_of_motion: editSessionData.range_of_motion,
        muscle_strength: editSessionData.muscle_strength,
        sensation: editSessionData.sensation,
        reflexes: editSessionData.reflexes,
        balance_coordination: editSessionData.balance_coordination,
        special_tests: editSessionData.special_tests,
        functional_assessment: editSessionData.functional_assessment,
        assistive_devices: editSessionData.assistive_devices,
        functional_goals: editSessionData.functional_goals,
        functional_limitations: editSessionData.functional_limitations,
        assessment_findings: editSessionData.assessment_findings,
        diagnosis_impression: editSessionData.diagnosis_impression,
        prognosis: editSessionData.prognosis,
        clinical_reasoning: editSessionData.clinical_reasoning,
        treatment_performed: editSessionData.treatment_performed,
        exercises_prescribed: editSessionData.exercises_prescribed.map((d) => ({ description: d })),
        equipment_used: editSessionData.equipment_used,
        patient_education: editSessionData.patient_education,
        next_session_plan: editSessionData.next_session_plan,
        session_notes: editSessionData.session_notes,
        progress_notes: editSessionData.progress_notes,
        recommendations: editSessionData.recommendations,
        follow_up_instructions: editSessionData.follow_up_instructions,
      });
      await handleCompleteIndividualSession(editingSession.id, {
        treatment_performed: editSessionData.treatment_performed,
        pain_level_after: editSessionData.pain_level_after,
        progress_notes: editSessionData.progress_notes,
        exercises_prescribed: editSessionData.exercises_prescribed,
        home_exercises: editSessionData.exercises_prescribed.map((description) => ({ description })),
        next_session_plan: editSessionData.next_session_plan,
        recommendations: editSessionData.recommendations,
        follow_up_instructions: editSessionData.follow_up_instructions,
      });
      setIsEditSessionDialogOpen(false);
      setEditingSession(null);
    } catch (err: any) {
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
    } catch (err: any) {
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

  const getTimeSince = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const getFilteredOrders = () => {
    return orders.filter(order => {
      const matchesSearch = order.patient_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.patient_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.diagnosis?.toLowerCase().includes(searchQuery.toLowerCase());

      // Date filter
      if (dateFilter !== 'all') {
        const orderedDate = new Date(order.ordered_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === 'today' && orderedDate.toDateString() !== today.toDateString()) return false;
        if (dateFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (orderedDate < weekAgo) return false;
        }
        if (dateFilter === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          if (orderedDate < monthAgo) return false;
        }
      }

      if (dateRange.from || dateRange.to) {
        const orderedDate = new Date(order.ordered_at);
        if (Number.isNaN(orderedDate.getTime())) return false;
        if (dateRange.from) {
          const from = new Date(`${dateRange.from}T00:00:00`);
          if (orderedDate < from) return false;
        }
        if (dateRange.to) {
          const to = new Date(`${dateRange.to}T23:59:59.999`);
          if (orderedDate > to) return false;
        }
      }

      // Tab filtering
      if (activeTab === 'all') return matchesSearch;
      if (activeTab === 'pending') return matchesSearch && order.status === 'pending';
      if (activeTab === 'in_progress') return matchesSearch && order.status === 'in_progress';
      if (activeTab === 'cancelled') return matchesSearch && order.status === 'cancelled';
      if (activeTab === 'completed') return matchesSearch && order.status === 'completed';
      return matchesSearch;
    });
  };

  const filteredOrders = getFilteredOrders();
  const activeUncompletedSession = useMemo(
    () => getLatestUncompletedSession(orderSessionsList),
    [orderSessionsList]
  );

  const stats = useMemo(() => ({
    pending: orders.filter(o => o.status === 'pending').length,
    inProgress: orders.filter(o => o.status === 'in_progress').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    completed: orders.filter(o => o.status === 'completed').length,
  }), [orders]);

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
        await physioService.updateSession(sessionId, {
          presenting_complaint: sessionData.presenting_complaint,
          pain_level_before: sessionData.pain_level_before ?? undefined,
          medical_history: sessionData.medical_history,
          surgical_history: sessionData.surgical_history,
          medications: sessionData.medications,
          allergies: sessionData.allergies,
          social_history: sessionData.social_history,
          previous_treatments: sessionData.previous_treatments,
          posture_gait: sessionData.posture_gait,
          range_of_motion: sessionData.range_of_motion,
          muscle_strength: sessionData.muscle_strength,
          sensation: sessionData.sensation,
          reflexes: sessionData.reflexes,
          balance_coordination: sessionData.balance_coordination,
          special_tests: sessionData.special_tests,
          functional_assessment: sessionData.functional_assessment,
          assistive_devices: sessionData.assistive_devices,
          functional_goals: sessionData.functional_goals,
          functional_limitations: sessionData.functional_limitations,
          assessment_findings: sessionData.assessment_findings,
          diagnosis_impression: sessionData.diagnosis_impression,
          prognosis: sessionData.prognosis,
          clinical_reasoning: sessionData.clinical_reasoning,
          treatment_performed: sessionData.treatment_performed,
          exercises_prescribed: sessionData.exercises_prescribed,
          equipment_used: sessionData.equipment_used,
          patient_education: sessionData.patient_education,
          next_session_plan: sessionData.next_session_plan,
          session_notes: sessionData.session_notes,
          progress_notes: sessionData.progress_notes,
          recommendations: sessionData.recommendations,
          follow_up_instructions: sessionData.follow_up_instructions,
        });

        toast.success('Session updated successfully');
        // Session updated successfully
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
          presenting_complaint: sessionData.presenting_complaint,
          pain_level_before: sessionData.pain_level_before ?? undefined,
          medical_history: sessionData.medical_history,
          surgical_history: sessionData.surgical_history,
          medications: sessionData.medications,
          allergies: sessionData.allergies,
          social_history: sessionData.social_history,
          previous_treatments: sessionData.previous_treatments,
          posture_gait: sessionData.posture_gait,
          range_of_motion: sessionData.range_of_motion,
          muscle_strength: sessionData.muscle_strength,
          sensation: sessionData.sensation,
          reflexes: sessionData.reflexes,
          balance_coordination: sessionData.balance_coordination,
          special_tests: sessionData.special_tests,
          functional_assessment: sessionData.functional_assessment,
          assistive_devices: sessionData.assistive_devices,
          functional_goals: sessionData.functional_goals,
          functional_limitations: sessionData.functional_limitations,
          assessment_findings: sessionData.assessment_findings,
          diagnosis_impression: sessionData.diagnosis_impression,
          prognosis: sessionData.prognosis,
          clinical_reasoning: sessionData.clinical_reasoning,
          treatment_performed: sessionData.treatment_performed,
          exercises_prescribed: sessionData.exercises_prescribed,
          equipment_used: sessionData.equipment_used,
          patient_education: sessionData.patient_education,
          next_session_plan: sessionData.next_session_plan,
          session_notes: sessionData.session_notes,
          progress_notes: sessionData.progress_notes,
          recommendations: sessionData.recommendations,
          follow_up_instructions: sessionData.follow_up_instructions,
          status: 'in_progress',
        };

        const createdSession = await physioService.createSession(sessionPayload as any);

        // Update order status to in_progress
        await physioService.updateOrder(selectedOrder.id, { status: 'in_progress' });

        toast.success(`Session ${nextSessionNumber} started successfully`);
      }

      setIsStartSessionDialogOpen(false);
      setSelectedOrder(null);
      setCurrentSession(null);

      // Reset session data
      (setSessionData as any)({
        presenting_complaint: '',
        pain_level_before: null,
        medical_history: '',
        surgical_history: '',
        medications: '',
        allergies: '',
        social_history: '',
        previous_treatments: '',
        posture_gait: '',
        range_of_motion: '',
        muscle_strength: '',
        sensation: '',
        reflexes: '',
        balance_coordination: '',
        special_tests: '',
        functional_assessment: '',
        assistive_devices: '',
        functional_goals: '',
        functional_limitations: '',
        assessment_findings: '',
        diagnosis_impression: '',
        prognosis: '',
        clinical_reasoning: '',
        treatment_performed: '',
        exercises_prescribed: [],
        equipment_used: [],
        patient_education: '',
        next_session_plan: '',
        session_notes: '',
        progress_notes: '',
        recommendations: [],
        follow_up_instructions: ''
      });

      // Reset session data
      (setSessionData as any)({
        presenting_complaint: '',
        pain_level_before: null,
        medical_history: '',
        surgical_history: '',
        medications: '',
        allergies: '',
        social_history: '',
        previous_treatments: '',
        posture_gait: '',
        range_of_motion: '',
        muscle_strength: '',
        sensation: '',
        reflexes: '',
        balance_coordination: '',
        special_tests: '',
        functional_assessment: '',
        assistive_devices: '',
        functional_goals: '',
        functional_limitations: '',
        assessment_findings: '',
        diagnosis_impression: '',
        prognosis: '',
        clinical_reasoning: '',
        treatment_performed: '',
        exercises_prescribed: [],
        equipment_used: [],
        patient_education: '',
        next_session_plan: '',
        session_notes: '',
        progress_notes: '',
        recommendations: [],
        follow_up_instructions: ''
      });

      await loadOrders();
    } catch (err: any) {
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
    } catch (err: any) {
      toast.error(err.message || 'Failed to end treatment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSessionProgress = async (sessionId: number, progressData: any) => {
    try {
      await physioService.updateSession(sessionId, {
        treatment_performed: progressData.treatment_performed,
        pain_level_after: progressData.pain_level_after,
        progress_notes: progressData.progress_notes,
        // Keep session status as 'in_progress'
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save session progress');
    }
  };

  const handleCompleteIndividualSession = async (sessionId: number, treatmentData: any) => {
    setIsSubmitting(true);
    try {
      await physioService.updateSession(sessionId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        treatment_performed: treatmentData.treatment_performed,
        pain_level_after: treatmentData.pain_level_after,
        progress_notes: treatmentData.progress_notes,
        exercises_prescribed: treatmentData.home_exercises?.length ? treatmentData.home_exercises : (treatmentData.exercises_prescribed || []),
        next_session_plan: treatmentData.next_session_plan,
        recommendations: treatmentData.recommendations,
        follow_up_instructions: treatmentData.follow_up_instructions
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
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadPatientVitals = async (patientId: number) => {
    try {
      const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?patient=${patientId}&page_size=1`);
      if (vitalsResult.results && vitalsResult.results.length > 0) {
        const latestVitals = vitalsResult.results[0];
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
    return (
      <Card
        className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer ${
          order.status === 'in_progress' ? 'border-l-orange-500' :
          order.status === 'scheduled' ? 'border-l-blue-500' :
          order.status === 'cancelled' ? 'border-l-red-500' :
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
                              {order.status.replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                              order.status === 'in_progress'
                                ? 'bg-orange-500/10 text-orange-600 border-orange-500/30'
                                : 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                            }`}>
                              {order.sessions_completed || 0} sessions completed
                            </Badge>
                            {order.diagnosis && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{order.diagnosis}</Badge>
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
                <p className="text-xs">New referrals awaiting first session</p>
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

          {/* Filters & Tabs */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                      placeholder="Patient, order ID, Physio ID (e.g. PHY-000002)…"
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
            ) : filteredOrders.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders found</p>
              </CardContent></Card>
            ) : (
              filteredOrders.map(order => <OrderCard key={order.id} order={order} />)
            )}
          </div>

          {/* Pagination */}
          {filteredOrders.length > 0 && (
            <Card className="p-4">
              <StandardPagination
                currentPage={currentPage}
                totalItems={filteredOrders.length}
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
            <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-teal-500" />
                  Manage Physio Order
                </DialogTitle>
                <DialogDescription>
                  PHY-{selectedOrder?.id?.toString().padStart(6, '0')} • {selectedOrder?.ordered_at ? new Date(selectedOrder.ordered_at).toLocaleString() : 'N/A'}
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
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Ordering Doctor</p>
                      {selectedOrder.ordered_by_name?.trim() && (
                        <p className="font-medium text-base">{selectedOrder.ordered_by_name}</p>
                      )}
                      <p className="text-sm text-muted-foreground">Physiotherapy Referral</p>
                    </div>
                  </div>

                  {/* Diagnosis - Highlighted */}
                  {selectedOrder.diagnosis && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Diagnosis
                      </p>
                      <p className="text-sm font-medium">{selectedOrder.diagnosis}</p>
                    </div>
                  )}

                  {/* Chief Complaint */}
                  {selectedOrder.chief_complaint && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-muted-foreground mb-1">Chief Complaint</p>
                      <p className="text-sm">{selectedOrder.chief_complaint}</p>
                    </div>
                  )}

                  {/* Treatment Goal & Instructions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedOrder.treatment_goal && (
                      <div className="p-3 rounded-lg border bg-card">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Target className="h-3 w-3" /> Treatment Goal
                        </p>
                        <p className="text-sm">{selectedOrder.treatment_goal}</p>
                      </div>
                    )}

                    {selectedOrder.special_instructions && (
                      <div className="p-3 rounded-lg border bg-card">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" /> Special Instructions
                        </p>
                        <p className="text-sm">{selectedOrder.special_instructions}</p>
                      </div>
                    )}
                  </div>

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
                        <span>Ordered: {selectedOrder.ordered_at ? new Date(selectedOrder.ordered_at).toLocaleString() : 'N/A'}</span>
                      </div>
                      {selectedOrder.scheduled_at && (
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                          <span>Session started: {new Date(selectedOrder.scheduled_at).toLocaleString()}</span>
                        </div>
                      )}
                      {selectedOrder.completed_at && (
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          <span>Completed: {new Date(selectedOrder.completed_at).toLocaleString()}</span>
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
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-8" onClick={() => openSessionReport(s)}>
                                  <FileText className="h-4 w-4 mr-1" />
                                  Report
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8" onClick={() => openEditSession(s)}>
                                  <Pencil className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
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
                                  setIsCompleteSessionDialogOpen(true);
                                  setIsViewDialogOpen(false);
                                } else {
                                  handleEndTreatment(selectedOrder);
                                }
                              } catch (error) {
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
            <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
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
                        value={sessionCompletionData.treatment_performed}
                        onChange={(e) => setSessionCompletionData({...sessionCompletionData, treatment_performed: e.target.value})}
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
                          value={sessionCompletionData.pain_level_after?.toString() || ''}
                          onValueChange={(v) => setSessionCompletionData({...sessionCompletionData, pain_level_after: v ? parseInt(v) : null})}
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
                            sessionCompletionData.pain_level_after !== null && currentSession.pain_level_before
                              ? (sessionCompletionData.pain_level_after < currentSession.pain_level_before ? 'text-green-600' : 'text-red-600')
                              : 'text-muted-foreground'
                          }`}>
                            {sessionCompletionData.pain_level_after !== null && currentSession.pain_level_before !== null
                              ? `${sessionCompletionData.pain_level_after - currentSession.pain_level_before > 0 ? '+' : ''}${sessionCompletionData.pain_level_after - currentSession.pain_level_before}`
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
                        value={sessionCompletionData.progress_notes}
                        onChange={(e) => setSessionCompletionData({...sessionCompletionData, progress_notes: e.target.value})}
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
                          handleUpdateSessionProgress(currentSession.id, sessionCompletionData);
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
            <DialogContent className="sm:max-w-[520px]">
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
            <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
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
                        value={sessionCompletionData.treatment_performed}
                        onChange={(e) => setSessionCompletionData({...sessionCompletionData, treatment_performed: e.target.value})}
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
                          value={sessionCompletionData.pain_level_after?.toString() || ''}
                          onValueChange={(v) => setSessionCompletionData({...sessionCompletionData, pain_level_after: v ? parseInt(v) : null})}
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
                          value={sessionCompletionData.progress_notes}
                          onChange={(e) => setSessionCompletionData({...sessionCompletionData, progress_notes: e.target.value})}
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
                        value={sessionCompletionData.home_exercises.map(ex => ex.description || ex).join('\n')}
                        onChange={(e) => setSessionCompletionData({
                          ...sessionCompletionData,
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
                        value={sessionCompletionData.next_session_plan}
                        onChange={(e) => setSessionCompletionData({...sessionCompletionData, next_session_plan: e.target.value})}
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
                        value={sessionCompletionData.follow_up_instructions}
                        onChange={(e) => setSessionCompletionData({...sessionCompletionData, follow_up_instructions: e.target.value})}
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
                      handleCompleteIndividualSession(currentSession.id, sessionCompletionData);
                      setIsCompleteSessionDialogOpen(false);
                      // Reset form
                      setSessionCompletionData({
                        treatment_performed: '',
                        pain_level_after: null,
                        progress_notes: '',
                        exercises_prescribed: [],
                        home_exercises: [],
                        next_session_plan: '',
                        recommendations: [],
                        follow_up_instructions: ''
                      });
                    }
                  }}
                  disabled={isSubmitting || !sessionCompletionData.treatment_performed.trim()}
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

          {/* Session Report Dialog */}
          <Dialog open={isSessionReportOpen} onOpenChange={(open) => {
            setIsSessionReportOpen(open);
            if (!open) setReportViewingSession(null);
          }}>
            <DialogContent className="w-[95vw] sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      Physiotherapy Session Report - {(reportViewingSession as any)?.patient_name || selectedOrder?.patient_name}
                    </DialogTitle>
                    <DialogDescription>
                      {joinDisplayParts([
                        reportViewingSession?.id != null ? `Document ${reportViewingSession.id}` : '',
                        reportViewingSession?.completed_at
                          ? new Date(reportViewingSession.completed_at).toLocaleString()
                          : (reportViewingSession?.scheduled_at ? new Date(reportViewingSession.scheduled_at).toLocaleString() : ''),
                      ])}
                    </DialogDescription>
                  </div>
                  <div className="flex gap-2 print:hidden">
                    <Button variant="outline" size="sm" onClick={handleDownloadSessionReport}>
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrintSessionReport}>
                      <Printer className="h-4 w-4 mr-1" />
                      Print
                    </Button>
                  </div>
                </div>
              </DialogHeader>
              {reportViewingSession && (
                <div className="space-y-6">
                  <div className="border-b pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-semibold text-blue-700">PHYSIOTHERAPY SESSION REPORT</h2>
                        <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
                      </div>
                      <div className="text-right print:hidden">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={handlePrintSessionReport}>
                            <Printer className="h-4 w-4 mr-1" />
                            Print
                          </Button>
                          <Button variant="outline" size="sm" onClick={handleDownloadSessionReport}>
                            <Download className="h-4 w-4 mr-1" />
                            Download PDF
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Patient Information</h3>
                        <div className="space-y-1">
                          <p><span className="font-medium">Name:</span> {(reportViewingSession as any)?.patient_name || selectedOrder?.patient_name || 'N/A'}</p>
                          <p><span className="font-medium">ID:</span> {(reportViewingSession as any)?.patient_id || selectedOrder?.patient_id || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Session Details</h3>
                        <div className="space-y-1">
                          <p><span className="font-medium">Session:</span> {reportViewingSession.session_number ?? 'N/A'}</p>
                          {reportViewingSession.scheduled_at && (
                            <p><span className="font-medium">Scheduled:</span> {new Date(reportViewingSession.scheduled_at).toLocaleString()}</p>
                          )}
                          {reportViewingSession.completed_at && (
                            <p><span className="font-medium">Completed:</span> {new Date(reportViewingSession.completed_at).toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    {(reportViewingSession as any)?.order_details?.diagnosis && (
                      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Primary Diagnosis</p>
                        <p className="text-sm mt-1">{(reportViewingSession as any).order_details.diagnosis}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 border-b pb-2">A. Patient Assessment</h3>
                    <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">{(reportViewingSession as any).presenting_complaint || 'Not documented'}</p>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 border-b pb-2">B. Medical & Social Background</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">{(reportViewingSession as any).medical_history || 'Not documented'}</p>
                      <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">{(reportViewingSession as any).medications || 'Not documented'}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 border-b pb-2">E. Clinical Reasoning</h3>
                    <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
                      {(reportViewingSession as any).clinical_reasoning || (reportViewingSession as any).assessment_findings || 'Not documented'}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 border-b pb-2">F. Treatment Plan</h3>
                    <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
                      {(reportViewingSession as any).next_session_plan || (reportViewingSession as any).treatment_performed || 'Not documented'}
                    </p>
                  </div>
                  {(reportViewingSession as any).progress_notes && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 border-b pb-2">Treatment Performed & Outcomes</h3>
                      <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">{(reportViewingSession as any).progress_notes}</p>
                    </div>
                  )}
                  <div className="border-t pt-4 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
                      <span>Session ID: PHY-{String(reportViewingSession.id).padStart(6, '0')}</span>
                    </div>
                    <div className="mt-2 text-center">{getOrganizationHeader()}</div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSessionReportOpen(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Session Dialog (Orders) */}
          <Dialog open={isEditSessionDialogOpen} onOpenChange={(o) => { if (!o) { setIsEditSessionDialogOpen(false); setEditingSession(null); } }}>
            <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
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
                      <div className="space-y-2"><Label>Presenting Complaint</Label><Textarea value={editSessionData.presenting_complaint} onChange={(e) => setEditSessionData({ ...editSessionData, presenting_complaint: e.target.value })} placeholder="Chief complaint..." rows={3} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Pain Before (0–10)</Label><Select value={editSessionData.pain_level_before?.toString() ?? ''} onValueChange={(v) => setEditSessionData({ ...editSessionData, pain_level_before: v ? parseInt(v) : null })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{[0,1,2,3,4,5,6,7,8,9,10].map((n) => <SelectItem key={n} value={n.toString()}>{n}/10</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-2"><Label>Pain After (0–10)</Label><Select value={editSessionData.pain_level_after?.toString() ?? ''} onValueChange={(v) => setEditSessionData({ ...editSessionData, pain_level_after: v ? parseInt(v) : null })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{[0,1,2,3,4,5,6,7,8,9,10].map((n) => <SelectItem key={n} value={n.toString()}>{n}/10</SelectItem>)}</SelectContent></Select></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2"><FileText className="h-5 w-5" /> B. Medical & Social Background</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Medical History</Label><Textarea value={editSessionData.medical_history} onChange={(e) => setEditSessionData({ ...editSessionData, medical_history: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Medications</Label><Textarea value={editSessionData.medications} onChange={(e) => setEditSessionData({ ...editSessionData, medications: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Social History</Label><Textarea value={editSessionData.social_history} onChange={(e) => setEditSessionData({ ...editSessionData, social_history: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Previous Treatments</Label><Textarea value={editSessionData.previous_treatments} onChange={(e) => setEditSessionData({ ...editSessionData, previous_treatments: e.target.value })} rows={2} className="resize-none" /></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 flex items-center gap-2"><Activity className="h-5 w-5" /> C. Physical Examination</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Posture & Gait</Label><Textarea value={editSessionData.posture_gait} onChange={(e) => setEditSessionData({ ...editSessionData, posture_gait: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Range of Motion</Label><Textarea value={editSessionData.range_of_motion} onChange={(e) => setEditSessionData({ ...editSessionData, range_of_motion: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Muscle Strength</Label><Textarea value={editSessionData.muscle_strength} onChange={(e) => setEditSessionData({ ...editSessionData, muscle_strength: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Special Tests</Label><Textarea value={editSessionData.special_tests} onChange={(e) => setEditSessionData({ ...editSessionData, special_tests: e.target.value })} rows={2} className="resize-none" /></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2"><Target className="h-5 w-5" /> D. Functional Evaluation</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Functional Assessment</Label><Textarea value={editSessionData.functional_assessment} onChange={(e) => setEditSessionData({ ...editSessionData, functional_assessment: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Functional Goals</Label><Textarea value={editSessionData.functional_goals} onChange={(e) => setEditSessionData({ ...editSessionData, functional_goals: e.target.value })} rows={2} className="resize-none" /></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2"><Lightbulb className="h-5 w-5" /> E. Clinical Reasoning</h3>
                    <div className="space-y-2"><Label>Assessment Findings & Clinical Impression</Label><Textarea value={editSessionData.clinical_reasoning} onChange={(e) => setEditSessionData({ ...editSessionData, clinical_reasoning: e.target.value })} rows={3} className="resize-none" /></div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 flex items-center gap-2"><ClipboardList className="h-5 w-5" /> F. Treatment Plan & Outcomes</h3>
                    <div className="space-y-4">
                      <div className="space-y-2"><Label>Planned Treatment / Next Session Plan</Label><Textarea value={editSessionData.next_session_plan} onChange={(e) => setEditSessionData({ ...editSessionData, next_session_plan: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Treatment Performed</Label><Textarea value={editSessionData.treatment_performed} onChange={(e) => setEditSessionData({ ...editSessionData, treatment_performed: e.target.value })} rows={3} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Progress Notes</Label><Textarea value={editSessionData.progress_notes} onChange={(e) => setEditSessionData({ ...editSessionData, progress_notes: e.target.value })} rows={2} className="resize-none" /></div>
                      <div className="space-y-2"><Label>Home Exercises (one per line)</Label><Textarea value={editSessionData.exercises_prescribed.join('\n')} onChange={(e) => setEditSessionData({ ...editSessionData, exercises_prescribed: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })} rows={3} className="resize-none" /></div>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => { setIsEditSessionDialogOpen(false); setEditingSession(null); }}>Cancel</Button>
                {editingSession?.status === 'in_progress' && (
                  <Button onClick={handleEditSessionSaveAndEnd} disabled={isEditSaving || !editSessionData.treatment_performed.trim()} className="bg-green-600 hover:bg-green-700 text-white">
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
              // Reset session data
              (setSessionData as any)({
                presenting_complaint: '',
                pain_level_before: null,
                medical_history: '',
                surgical_history: '',
                medications: '',
                allergies: '',
                social_history: '',
                previous_treatments: '',
                posture_gait: '',
                range_of_motion: '',
                muscle_strength: '',
                sensation: '',
                reflexes: '',
                balance_coordination: '',
                special_tests: '',
                functional_assessment: '',
                assistive_devices: '',
                functional_goals: '',
                functional_limitations: '',
                assessment_findings: '',
                diagnosis_impression: '',
                prognosis: '',
                clinical_reasoning: '',
                treatment_performed: '',
                exercises_prescribed: [],
                equipment_used: [],
                patient_education: '',
                next_session_plan: '',
                session_notes: '',
                progress_notes: '',
                recommendations: [],
                follow_up_instructions: ''
              });
            }
          }}>
            <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
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
                          value={sessionData.presenting_complaint}
                          onChange={(e) => setSessionData({...sessionData, presenting_complaint: e.target.value})}
                          placeholder="Chief complaint and current symptoms..."
                          rows={3}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Pain Level (0-10)</Label>
                        <Select value={sessionData.pain_level_before?.toString() || ''} onValueChange={(v) => setSessionData({...sessionData, pain_level_before: v ? parseInt(v) : null})}>
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
                          value={sessionData.medical_history}
                          onChange={(e) => setSessionData({...sessionData, medical_history: e.target.value})}
                          placeholder="Relevant medical conditions, comorbidities..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Medications</Label>
                        <Textarea
                          value={sessionData.medications}
                          onChange={(e) => setSessionData({...sessionData, medications: e.target.value})}
                          placeholder="Current medications and dosages..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Social History</Label>
                        <Textarea
                          value={sessionData.social_history}
                          onChange={(e) => setSessionData({...sessionData, social_history: e.target.value})}
                          placeholder="Occupation, lifestyle, support systems..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Previous Treatments</Label>
                        <Textarea
                          value={sessionData.previous_treatments}
                          onChange={(e) => setSessionData({...sessionData, previous_treatments: e.target.value})}
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
                          value={sessionData.posture_gait}
                          onChange={(e) => setSessionData({...sessionData, posture_gait: e.target.value})}
                          placeholder="Static/dynamic posture, gait analysis..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Range of Motion</Label>
                        <Textarea
                          value={sessionData.range_of_motion}
                          onChange={(e) => setSessionData({...sessionData, range_of_motion: e.target.value})}
                          placeholder="Joint ROM measurements with goniometer..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Muscle Strength</Label>
                        <Textarea
                          value={sessionData.muscle_strength}
                          onChange={(e) => setSessionData({...sessionData, muscle_strength: e.target.value})}
                          placeholder="Manual muscle testing results (0-5 scale)..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Special Tests</Label>
                        <Textarea
                          value={sessionData.special_tests}
                          onChange={(e) => setSessionData({...sessionData, special_tests: e.target.value})}
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
                          value={sessionData.functional_assessment}
                          onChange={(e) => setSessionData({...sessionData, functional_assessment: e.target.value})}
                          placeholder="Activities of daily living assessment..."
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Functional Goals</Label>
                        <Textarea
                          value={sessionData.functional_goals}
                          onChange={(e) => setSessionData({...sessionData, functional_goals: e.target.value})}
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
                        value={sessionData.clinical_reasoning}
                        onChange={(e) => setSessionData({...sessionData, clinical_reasoning: e.target.value})}
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
                        value={sessionData.next_session_plan}
                        onChange={(e) => setSessionData({...sessionData, next_session_plan: e.target.value})}
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
                  disabled={isSubmitting || !sessionData.presenting_complaint.trim()}
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
        </div>
      </DashboardLayout>
    </TooltipProvider>
  );
}
