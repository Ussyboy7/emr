"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from 'sonner';
import { physioService, type PhysioSession } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { PatientAvatar } from "@/components/PatientAvatar";
import { joinDisplayParts } from '@/lib/utils/clinic-utils';

import {
  CheckCircle2, Search, Eye, Clock, Calendar, User,
  FileText, TrendingUp, AlertTriangle, Loader2, Plus,
  MessageSquare, Activity, Heart, Target, Lightbulb, RefreshCw,
  Printer, Download, Pencil, ClipboardList
} from 'lucide-react';

export default function PhysioCompletedPage() {
  const [sessions, setSessions] = useState<PhysioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [physiotherapistFilter, setPhysiotherapistFilter] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Dialogs
  const [selectedSession, setSelectedSession] = useState<PhysioSession | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isRecommendationDialogOpen, setIsRecommendationDialogOpen] = useState(false);
  const [isSessionReportOpen, setIsSessionReportOpen] = useState(false);

  // Session Report: all sessions for the same order (to switch Session 1, 2, 3...) and which one we're viewing
  const [orderSessionsForReport, setOrderSessionsForReport] = useState<PhysioSession[]>([]);
  const [reportViewingSession, setReportViewingSession] = useState<PhysioSession | null>(null);

  // Hint when 0 completed: count of sessions with other statuses (in_progress, scheduled, etc.)
  const [otherStatusCount, setOtherStatusCount] = useState<number>(0);

  // Recommendation form
  const [recommendationText, setRecommendationText] = useState('');
  const [recommendationType, setRecommendationType] = useState('general');

  // Edit Session
  const [isEditSessionDialogOpen, setIsEditSessionDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<PhysioSession | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editSessionData, setEditSessionData] = useState({
    presenting_complaint: '',
    pain_level_before: null as number | null,
    pain_level_after: null as number | null,
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
    equipment_used: [] as any[],
    patient_education: '',
    next_session_plan: '',
    session_notes: '',
    progress_notes: '',
    recommendations: [] as any[],
    follow_up_instructions: '',
  });

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setOtherStatusCount(0);

      const params: any = {
        status: 'completed',
        page: currentPage,
        page_size: itemsPerPage,
      };

      if (searchQuery) params.search = searchQuery;

      const response = await physioService.getSessions(params);
      const list = response?.results ?? [];
      setSessions(list);

      // When 0 completed, check if any sessions exist with other statuses (in_progress, scheduled)
      if (list.length === 0) {
        try {
          const any = await physioService.getSessions({ page_size: 1 });
          const total = (any as { count?: number })?.count ?? 0;
          const completedTotal = (response as { count?: number })?.count ?? 0;
          setOtherStatusCount(Math.max(0, total - completedTotal));
        } catch {
          setOtherStatusCount(0);
        }
      }
    } catch (err: any) {
      console.error('Error loading completed sessions:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        setError(err.message || 'Failed to load sessions');
        toast.error('Failed to load completed sessions');
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, searchQuery, dateFilter, physiotherapistFilter]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // When Session Report opens: load all sessions for the same order so user can switch Session 1, 2, 3...
  useEffect(() => {
    if (!isSessionReportOpen || !selectedSession) {
      return;
    }
    const orderId = selectedSession.order ?? (selectedSession as any).order_details?.id;
    if (!orderId) {
      setOrderSessionsForReport(selectedSession ? [selectedSession] : []);
      setReportViewingSession(selectedSession);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await physioService.getSessions({ order: orderId, page_size: 100 });
        const list = r?.results ?? [];
        if (cancelled) return;
        const hasSelected = list.some((s: PhysioSession) => s.id === selectedSession.id);
        const merged = hasSelected ? list : [selectedSession, ...list];
        const sorted = [...merged].sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0));
        setOrderSessionsForReport(sorted);
        setReportViewingSession(selectedSession);
      } catch {
        if (!cancelled) {
          setOrderSessionsForReport(selectedSession ? [selectedSession] : []);
          setReportViewingSession(selectedSession);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isSessionReportOpen, selectedSession?.id, selectedSession?.order]);

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      // Additional client-side filters if needed
      return true;
    });
  }, [sessions]);

  const paginatedSessions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSessions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSessions, currentPage, itemsPerPage]);

  const getPainLevelColor = (before?: number, after?: number) => {
    if (!before || !after) return 'text-muted-foreground';
    const improvement = before - after;
    if (improvement >= 3) return 'text-green-600';
    if (improvement >= 1) return 'text-blue-600';
    if (improvement === 0) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleAddRecommendation = async () => {
    if (!selectedSession || !recommendationText.trim()) return;

    try {
      await physioService.addRecommendation(selectedSession.id, recommendationText.trim(), recommendationType);
      toast.success('Recommendation added successfully');
      setIsRecommendationDialogOpen(false);
      setSelectedSession(null);
      setRecommendationText('');
      setRecommendationType('general');
      await loadSessions();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add recommendation');
    }
  };

  const openEdit = (session: PhysioSession) => {
    const s = session as any;
    const ex = s.exercises_prescribed || s.home_exercises || [];
    const exLines = Array.isArray(ex) ? ex.map((e: any) => (typeof e === 'string' ? e : (e?.description ?? ''))) : [];
    setEditSessionData({
      presenting_complaint: s.presenting_complaint || '',
      pain_level_before: s.pain_level_before ?? null,
      pain_level_after: s.pain_level_after ?? null,
      medical_history: s.medical_history || '',
      surgical_history: s.surgical_history || '',
      medications: s.medications || '',
      allergies: s.allergies || '',
      social_history: s.social_history || '',
      previous_treatments: s.previous_treatments || '',
      posture_gait: s.posture_gait || '',
      range_of_motion: s.range_of_motion || '',
      muscle_strength: s.muscle_strength || '',
      sensation: s.sensation || '',
      reflexes: s.reflexes || '',
      balance_coordination: s.balance_coordination || '',
      special_tests: s.special_tests || '',
      functional_assessment: s.functional_assessment || '',
      assistive_devices: s.assistive_devices || '',
      functional_goals: s.functional_goals || '',
      functional_limitations: s.functional_limitations || '',
      assessment_findings: s.assessment_findings || '',
      diagnosis_impression: s.diagnosis_impression || '',
      prognosis: s.prognosis || '',
      clinical_reasoning: s.clinical_reasoning || s.assessment_findings || '',
      treatment_performed: s.treatment_performed || '',
      exercises_prescribed: exLines,
      equipment_used: Array.isArray(s.equipment_used) ? s.equipment_used : [],
      patient_education: s.patient_education || '',
      next_session_plan: s.next_session_plan || '',
      session_notes: s.session_notes || '',
      progress_notes: s.progress_notes || '',
      recommendations: Array.isArray(s.recommendations) ? s.recommendations : [],
      follow_up_instructions: s.follow_up_instructions || '',
    });
    setEditingSession(session);
    setIsEditSessionDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingSession) return;
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
      toast.success('Session updated successfully');
      setIsEditSessionDialogOpen(false);
      setEditingSession(null);
      await loadSessions();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update session');
    } finally {
      setIsEditSaving(false);
    }
  };

  const stats = useMemo(() => ({
    total: sessions.length,
    withRecommendations: sessions.filter(s => s.recommendations && s.recommendations.length > 0).length,
    painReduction: sessions.filter(s => {
      const before = s.pain_level_before;
      const after = s.pain_level_after;
      return before && after && before > after;
    }).length,
    avgImprovement: sessions.length > 0 ?
      sessions.reduce((acc, s) => {
        if (s.functional_improvement) {
          // Simple heuristic: count words as improvement score
          return acc + Math.min(s.functional_improvement.split(' ').length, 10);
        }
        return acc;
      }, 0) / sessions.length : 0,
  }), [sessions]);

  const reportSession = isSessionReportOpen ? (reportViewingSession || selectedSession) : null;

  return (
    <TooltipProvider>
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              Completed Sessions
            </h1>
            <p className="text-muted-foreground mt-1">History of completed physiotherapy sessions</p>
          </div>
          <Button variant="outline" onClick={loadSessions} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Sessions</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.total}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">With Recommendations</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.withRecommendations}</p>
                </div>
                <Lightbulb className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pain Reduction</p>
                  <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">{stats.painReduction}</p>
                </div>
                <Heart className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Improvement</p>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.avgImprovement.toFixed(1)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={physiotherapistFilter} onValueChange={setPhysiotherapistFilter}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Physiotherapist" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Physiotherapists</SelectItem>
                    {/* TODO: Load actual physiotherapists */}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sessions List */}
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading completed sessions...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" className="mt-4" onClick={loadSessions}>Retry</Button>
              </CardContent>
            </Card>
          ) : paginatedSessions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground space-y-3">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No completed physiotherapy sessions found</p>
                {otherStatusCount > 0 ? (
                  <p className="text-sm max-w-md mx-auto">
                    You have <strong>{otherStatusCount}</strong> session{otherStatusCount !== 1 ? 's' : ''} that {otherStatusCount !== 1 ? 'are' : 'is'} not completed yet. To see them here: <strong>Physiotherapy → Pool Queue</strong> → open the order → green <strong>Complete Session</strong> button → fill and submit the Complete Session form. Sessions only appear here after that step.
                  </p>
                ) : (
                  <p className="text-sm max-w-md mx-auto">
                    Complete sessions from <strong>Physiotherapy → Pool Queue</strong>: open an order → green <strong>Complete Session</strong> button → submit the Complete Session form.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            paginatedSessions.map((session) => {
              const completedDate = session.completed_at ? new Date(session.completed_at) : new Date(session.scheduled_at);
              const hasRecommendations = session.recommendations && session.recommendations.length > 0;
              
              return (
                <Card key={session.id} className={`border-l-4 hover:shadow-md transition-shadow ${
                  hasRecommendations ? 'border-l-blue-500' : 'border-l-emerald-500'
                }`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        hasRecommendations ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'
                      }`}>
                        <PatientAvatar name={session.patient_name ?? ''} size="sm" />
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + Badges + Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{session.patient_name ?? ''}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                              <CheckCircle2 className="h-2 w-2 mr-0.5" />Completed
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-500/10 text-gray-600 border-gray-500/30">
                              Session {session.session_number}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {session.order_details?.diagnosis || 'Physio Session'}
                            </Badge>
                            {hasRecommendations && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 border-blue-500/30">
                                <Lightbulb className="h-2 w-2 mr-0.5" />{session.recommendations?.length} rec
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted" onClick={() => { setSelectedSession(session); setIsViewDialogOpen(true); }}>
                                  <Eye className="h-4 w-4 text-muted-foreground hover:text-blue-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View Details</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted" onClick={() => { setSelectedSession(session); setIsSessionReportOpen(true); }}>
                                  <FileText className="h-4 w-4 text-muted-foreground hover:text-green-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Session Report</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted" onClick={() => openEdit(session)}>
                                  <Pencil className="h-4 w-4 text-muted-foreground hover:text-amber-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit Session</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted" onClick={() => { setSelectedSession(session); setIsRecommendationDialogOpen(true); }}>
                                  <Plus className="h-4 w-4 text-muted-foreground hover:text-purple-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Add Recommendation</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        
                        {/* Row 2: Details */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="font-mono">{session.patient_id}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {session.physiotherapist_name || 'Unknown'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {completedDate.toLocaleDateString()} {completedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {session.order_details?.treatment_goal && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Target className="h-3 w-3" />
                                {session.order_details.treatment_goal}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {filteredSessions.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredSessions.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="sessions"
            />
          </Card>
        )}

        {/* View Session Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-500" />
                Session Details - {selectedSession?.patient_name}
              </DialogTitle>
              <DialogDescription>
                PHY-{selectedSession?.id?.toString().padStart(6, '0')} • Completed on {selectedSession?.completed_at ? new Date(selectedSession.completed_at).toLocaleString() : 'N/A'}
              </DialogDescription>
            </DialogHeader>

            {selectedSession && (
              <div className="space-y-6">
                {/* Patient & Session Info */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Patient</p>
                    <p className="font-medium text-base">{selectedSession.patient_name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{selectedSession.patient_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Physiotherapist</p>
                    <p className="font-medium text-base">{selectedSession.physiotherapist_name}</p>
                    <p className="text-sm text-muted-foreground">Physiotherapy Session</p>
                  </div>
                </div>

                {/* Order Details */}
                {selectedSession.order_details && (
                  <div className="space-y-3">
                    {selectedSession.order_details.diagnosis && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <FileText className="h-3 w-3" /> Diagnosis
                        </p>
                        <p className="text-sm font-medium">{selectedSession.order_details.diagnosis}</p>
                      </div>
                    )}

                    {selectedSession.order_details.treatment_goal && (
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Target className="h-3 w-3" /> Treatment Goal
                        </p>
                        <p className="text-sm">{selectedSession.order_details.treatment_goal}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Session Timeline */}
                <div className="p-3 rounded-lg border bg-card">
                  <p className="text-xs text-muted-foreground mb-2">Session Timeline</p>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                      <span>Scheduled: {selectedSession.scheduled_at ? new Date(selectedSession.scheduled_at).toLocaleString() : 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      <span>Completed: {selectedSession.completed_at ? new Date(selectedSession.completed_at).toLocaleString() : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Session Notes */}
                {selectedSession.notes && (
                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      Session Notes
                    </Label>
                    <p className="text-sm bg-muted/50 p-3 rounded-md">{selectedSession.notes}</p>
                  </div>
                )}

                {/* Assessment */}
                {selectedSession.assessment && (
                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Activity className="h-3.5 w-3.5" />
                      Initial Assessment
                    </Label>
                    <p className="text-sm bg-muted/50 p-3 rounded-md">{selectedSession.assessment}</p>
                  </div>
                )}

                {/* Treatment */}
                {selectedSession.treatment_performed && (
                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      Treatment Performed
                    </Label>
                    <p className="text-sm bg-muted/50 p-3 rounded-md">{selectedSession.treatment_performed}</p>
                  </div>
                )}

                {/* Pain Levels */}
                {(selectedSession.pain_level_before || selectedSession.pain_level_after) && (
                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5" />
                      Pain Assessment
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedSession.pain_level_before && (
                        <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                          <p className="text-sm text-muted-foreground">Before Treatment</p>
                          <p className="text-2xl font-bold text-red-600">{selectedSession.pain_level_before}/10</p>
                        </div>
                      )}
                      {selectedSession.pain_level_after && (
                        <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                          <p className="text-sm text-muted-foreground">After Treatment</p>
                          <p className="text-2xl font-bold text-green-600">{selectedSession.pain_level_after}/10</p>
                        </div>
                      )}
                    </div>
                    {selectedSession.pain_level_before && selectedSession.pain_level_after && (
                      <div className="text-center mt-2">
                        <Badge variant="outline" className={`text-xs ${
                          selectedSession.pain_level_before > selectedSession.pain_level_after
                            ? 'bg-green-500/10 text-green-600 border-green-500/30'
                            : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
                        }`}>
                          {selectedSession.pain_level_before > selectedSession.pain_level_after
                            ? `Improved by ${selectedSession.pain_level_before - selectedSession.pain_level_after} points`
                            : 'No improvement recorded'
                          }
                        </Badge>
                      </div>
                    )}
                  </div>
                )}

                {/* Progress Notes */}
                {selectedSession.progress_notes && (
                  <div>
                    <Label className="text-sm text-muted-foreground">Progress Notes</Label>
                    <p className="text-sm bg-muted/50 p-3 rounded-md">{selectedSession.progress_notes}</p>
                  </div>
                )}

                {/* Recommendations */}
                {selectedSession.recommendations && selectedSession.recommendations.length > 0 && (
                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Lightbulb className="h-3.5 w-3.5" />
                      Recommendations ({selectedSession.recommendations.length})
                    </Label>
                    <div className="space-y-2">
                      {selectedSession.recommendations.map((rec: any, index: number) => (
                        <div key={index} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                          <div className="flex items-start justify-between">
                            <p className="text-sm">{rec.text}</p>
                            <Badge variant="outline" className="text-xs ml-2">
                              {rec.type || 'general'}
                            </Badge>
                          </div>
                          {rec.added_by && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Added by {rec.added_by}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Home Exercises */}
                {selectedSession.home_exercises && selectedSession.home_exercises.length > 0 && (
                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      Home Exercises
                    </Label>
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                      <ul className="text-sm space-y-1">
                        {selectedSession.home_exercises.map((exercise: any, index: number) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-green-600 mt-1">•</span>
                            <span>{exercise.description || exercise}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Progress Notes */}
                {selectedSession.progress_notes && (
                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Progress Notes
                    </Label>
                    <p className="text-sm bg-muted/50 p-3 rounded-md">{selectedSession.progress_notes}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              {selectedSession && (
                <Button onClick={() => { setIsViewDialogOpen(false); openEdit(selectedSession); }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit session
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Session Report Modal */}
        <Dialog open={isSessionReportOpen} onOpenChange={(open) => {
          setIsSessionReportOpen(open);
          if (!open) { setOrderSessionsForReport([]); setReportViewingSession(null); }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Physiotherapy Session Report - {reportSession?.patient_name}
              </DialogTitle>
              <DialogDescription>
                {joinDisplayParts([
                  reportSession?.id != null ? `PHY-${String(reportSession.id).padStart(6, '0')}` : '',
                  reportSession?.session_number != null ? `Session ${reportSession.session_number}` : '',
                ])}
              </DialogDescription>
            </DialogHeader>

            {/* Session switcher: Session 1, 2, 3... for the same order */}
            {orderSessionsForReport.length > 1 && (
              <div className="flex items-center gap-2 print:hidden">
                <Label className="text-sm font-medium">View</Label>
                <Select
                  value={String(reportSession?.id ?? '')}
                  onValueChange={(v) => {
                    const s = orderSessionsForReport.find((x) => x.id === Number(v));
                    if (s) setReportViewingSession(s);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    {orderSessionsForReport.map((s, idx) => (
                      <SelectItem key={s.id ?? `s-${idx}`} value={String(s.id ?? '')}>
                        {joinDisplayParts([
                          s.session_number != null ? `Session ${s.session_number}` : '',
                          s.scheduled_at
                            ? new Date(s.scheduled_at).toLocaleString()
                            : s.id != null
                              ? `PHY-${String(s.id).padStart(6, '0')}`
                              : '',
                          s.status?.replace('_', ' '),
                        ])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {reportSession && (
              <div className="space-y-6">
                {/* Report Header */}
                <div className="border-b pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-blue-700">PHYSIOTHERAPY SESSION REPORT</h2>
                      <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
                    </div>
                    <div className="text-right print:hidden">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setIsSessionReportOpen(false); if (reportSession) openEdit(reportSession); }}>
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => window.print()}>
                          <Printer className="h-4 w-4 mr-1" />
                          Print
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-1" />
                          Download PDF
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Patient & Session Info */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Patient Information</h3>
                      <div className="space-y-1">
                        <p><span className="font-medium">Name:</span> {reportSession.patient_name}</p>
                        <p><span className="font-medium">ID:</span> {reportSession.patient_id}</p>
                        {reportSession.physiotherapist_name?.trim() && (
                          <p><span className="font-medium">Physiotherapist:</span> {reportSession.physiotherapist_name}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Session Details</h3>
                      <div className="space-y-1">
                        {reportSession.session_number != null && (
                          <p><span className="font-medium">Session:</span> {reportSession.session_number}</p>
                        )}
                        {reportSession.scheduled_at && (
                          <p><span className="font-medium">Scheduled:</span> {new Date(reportSession.scheduled_at).toLocaleString()}</p>
                        )}
                        {reportSession.completed_at && (
                          <p><span className="font-medium">Completed:</span> {new Date(reportSession.completed_at).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Diagnosis */}
                  {reportSession.order_details?.diagnosis && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Primary Diagnosis</p>
                      <p className="text-sm mt-1">{reportSession.order_details.diagnosis}</p>
                    </div>
                  )}
                </div>

                {/* Assessment Sections */}
                <div className="space-y-6">
                  {/* A. Patient Assessment */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 border-b pb-2">A. Patient Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Presenting Complaint</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.presenting_complaint || 'Not documented'}
                        </p>
                      </div>
                      {(reportSession.pain_level_before != null || reportSession.pain_level_after != null) && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Pain Assessment</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {reportSession.pain_level_before != null && (
                              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded border">
                                <p className="text-xs text-muted-foreground">Before Treatment</p>
                                <p className="text-xl font-bold text-red-600">{reportSession.pain_level_before}/10</p>
                              </div>
                            )}
                            {reportSession.pain_level_after != null && (
                              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded border">
                                <p className="text-xs text-muted-foreground">After Treatment</p>
                                <p className="text-xl font-bold text-green-600">{reportSession.pain_level_after}/10</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* B. Medical & Social Background */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 border-b pb-2">B. Medical & Social Background</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Medical History</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.medical_history || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Medications</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.medications || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Social History</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.social_history || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Previous Treatments</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.previous_treatments || 'Not documented'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* C. Physical Examination */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 border-b pb-2">C. Physical Examination</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Posture & Gait</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.posture_gait || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Range of Motion</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.range_of_motion || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Muscle Strength</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.muscle_strength || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Special Tests</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.special_tests || 'Not documented'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* D. Functional Evaluation */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 border-b pb-2">D. Functional Evaluation</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Functional Assessment</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.functional_assessment || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Functional Goals</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {reportSession.functional_goals || 'Not documented'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* E. Clinical Reasoning */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 border-b pb-2">E. Clinical Reasoning</h3>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Assessment Findings & Clinical Impression</Label>
                      <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
                        {reportSession.clinical_reasoning || reportSession.assessment_findings || 'Not documented'}
                      </p>
                    </div>
                  </div>

                  {/* F. Treatment Plan */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 border-b pb-2">F. Treatment Plan</h3>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Planned Treatment Approach</Label>
                      <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
                        {reportSession.next_session_plan || reportSession.treatment_performed || 'Not documented'}
                      </p>
                    </div>
                  </div>

                  {/* Treatment Performed & Outcomes */}
                  {(reportSession.treatment_performed || reportSession.progress_notes) && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 border-b pb-2">Treatment Performed & Outcomes</h3>
                      <div className="space-y-4">
                        {reportSession.treatment_performed && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Treatment Performed</Label>
                            <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                              {reportSession.treatment_performed}
                            </p>
                          </div>
                        )}
                        {reportSession.progress_notes && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Progress Notes</Label>
                            <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                              {reportSession.progress_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Home Exercises & Recommendations - only when there is content */}
                  {((reportSession.home_exercises?.length ?? 0) > 0 || (reportSession.exercises_prescribed?.length ?? 0) > 0 || (reportSession.recommendations?.length ?? 0) > 0) && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400 border-b pb-2">Home Program & Recommendations</h3>
                      <div className="space-y-4">
                        {((reportSession.home_exercises || reportSession.exercises_prescribed) || []).length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Home Exercises</Label>
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md p-3">
                              <ul className="text-sm space-y-1">
                                {(reportSession.home_exercises || reportSession.exercises_prescribed || []).map((exercise: any, index: number) => (
                                  <li key={index} className="flex items-start gap-2">
                                    <span className="text-emerald-600 mt-1">•</span>
                                    <span>{typeof exercise === 'string' ? exercise : (exercise?.description ?? exercise)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                        {reportSession.recommendations && reportSession.recommendations.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Recommendations</Label>
                            <div className="space-y-2">
                              {reportSession.recommendations.map((rec: any, index: number) => (
                                <div key={index} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                                  <p className="text-sm">{rec.text}</p>
                                  <p className="text-xs text-muted-foreground mt-1">Type: {rec.type || 'general'}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <p>Report generated on {new Date().toLocaleString()}</p>
                    {reportSession?.id != null && (
                      <p>Session ID: PHY-{String(reportSession.id).padStart(6, '0')}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Recommendation Dialog */}
        <Dialog open={isRecommendationDialogOpen} onOpenChange={setIsRecommendationDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-blue-500" />
                Add Recommendation
              </DialogTitle>
              <DialogDescription>
                Add a recommendation for {selectedSession?.patient_name}'s continued treatment
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Recommendation Type</Label>
                <Select value={recommendationType} onValueChange={setRecommendationType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="exercise">Exercise</SelectItem>
                    <SelectItem value="lifestyle">Lifestyle</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Recommendation Details</Label>
                <Textarea
                  value={recommendationText}
                  onChange={(e) => setRecommendationText(e.target.value)}
                  placeholder="Enter recommendation details..."
                  rows={4}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRecommendationDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddRecommendation} disabled={!recommendationText.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Recommendation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Session Dialog */}
        <Dialog open={isEditSessionDialogOpen} onOpenChange={(o) => { if (!o) { setIsEditSessionDialogOpen(false); setEditingSession(null); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-amber-500" />
                {joinDisplayParts(['Edit Session', editingSession?.session_number, editingSession?.patient_name])}
              </DialogTitle>
              <DialogDescription>
                Update assessment and treatment documentation. Changes will appear in the Session Report.
              </DialogDescription>
            </DialogHeader>
            {editingSession && (
              <div className="space-y-6 py-4">
                {/* A. Patient Assessment */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
                    <User className="h-5 w-5" /> A. Patient Assessment
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Presenting Complaint</Label>
                      <Textarea
                        value={editSessionData.presenting_complaint}
                        onChange={(e) => setEditSessionData({ ...editSessionData, presenting_complaint: e.target.value })}
                        placeholder="Chief complaint and current symptoms..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pain Before (0–10)</Label>
                      <Select value={editSessionData.pain_level_before?.toString() ?? ''} onValueChange={(v) => setEditSessionData({ ...editSessionData, pain_level_before: v ? parseInt(v) : null })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {[0,1,2,3,4,5,6,7,8,9,10].map((n) => (
                            <SelectItem key={n} value={n.toString()}>{n}/10</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Pain After (0–10)</Label>
                      <Select value={editSessionData.pain_level_after?.toString() ?? ''} onValueChange={(v) => setEditSessionData({ ...editSessionData, pain_level_after: v ? parseInt(v) : null })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {[0,1,2,3,4,5,6,7,8,9,10].map((n) => (
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
                    <FileText className="h-5 w-5" /> B. Medical & Social Background
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Medical History</Label>
                      <Textarea value={editSessionData.medical_history} onChange={(e) => setEditSessionData({ ...editSessionData, medical_history: e.target.value })} placeholder="Relevant medical conditions..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Medications</Label>
                      <Textarea value={editSessionData.medications} onChange={(e) => setEditSessionData({ ...editSessionData, medications: e.target.value })} placeholder="Current medications..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Social History</Label>
                      <Textarea value={editSessionData.social_history} onChange={(e) => setEditSessionData({ ...editSessionData, social_history: e.target.value })} placeholder="Occupation, lifestyle..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Previous Treatments</Label>
                      <Textarea value={editSessionData.previous_treatments} onChange={(e) => setEditSessionData({ ...editSessionData, previous_treatments: e.target.value })} placeholder="Prior physiotherapy..." rows={2} className="resize-none" />
                    </div>
                  </div>
                </div>

                {/* C. Physical Examination */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                    <Activity className="h-5 w-5" /> C. Physical Examination
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Posture & Gait</Label>
                      <Textarea value={editSessionData.posture_gait} onChange={(e) => setEditSessionData({ ...editSessionData, posture_gait: e.target.value })} placeholder="Posture, gait analysis..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Range of Motion</Label>
                      <Textarea value={editSessionData.range_of_motion} onChange={(e) => setEditSessionData({ ...editSessionData, range_of_motion: e.target.value })} placeholder="Joint ROM..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Muscle Strength</Label>
                      <Textarea value={editSessionData.muscle_strength} onChange={(e) => setEditSessionData({ ...editSessionData, muscle_strength: e.target.value })} placeholder="Manual muscle testing..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Special Tests</Label>
                      <Textarea value={editSessionData.special_tests} onChange={(e) => setEditSessionData({ ...editSessionData, special_tests: e.target.value })} placeholder="Special tests..." rows={2} className="resize-none" />
                    </div>
                  </div>
                </div>

                {/* D. Functional Evaluation */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2">
                    <Target className="h-5 w-5" /> D. Functional Evaluation
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Functional Assessment</Label>
                      <Textarea value={editSessionData.functional_assessment} onChange={(e) => setEditSessionData({ ...editSessionData, functional_assessment: e.target.value })} placeholder="ADL assessment..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Functional Goals</Label>
                      <Textarea value={editSessionData.functional_goals} onChange={(e) => setEditSessionData({ ...editSessionData, functional_goals: e.target.value })} placeholder="Short/long-term goals..." rows={2} className="resize-none" />
                    </div>
                  </div>
                </div>

                {/* E. Clinical Reasoning */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" /> E. Clinical Reasoning
                  </h3>
                  <div className="space-y-2">
                    <Label>Assessment Findings & Clinical Impression</Label>
                    <Textarea value={editSessionData.clinical_reasoning} onChange={(e) => setEditSessionData({ ...editSessionData, clinical_reasoning: e.target.value })} placeholder="Findings, diagnosis, rationale..." rows={3} className="resize-none" />
                  </div>
                </div>

                {/* F. Treatment Plan & Outcomes */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" /> F. Treatment Plan & Outcomes
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Planned Treatment / Next Session Plan</Label>
                      <Textarea value={editSessionData.next_session_plan} onChange={(e) => setEditSessionData({ ...editSessionData, next_session_plan: e.target.value })} placeholder="Treatment plan, next session..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Treatment Performed</Label>
                      <Textarea value={editSessionData.treatment_performed} onChange={(e) => setEditSessionData({ ...editSessionData, treatment_performed: e.target.value })} placeholder="Modalities, exercises, interventions..." rows={3} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Progress Notes</Label>
                      <Textarea value={editSessionData.progress_notes} onChange={(e) => setEditSessionData({ ...editSessionData, progress_notes: e.target.value })} placeholder="Progress, improvements..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-2">
                      <Label>Home Exercises (one per line)</Label>
                      <Textarea value={editSessionData.exercises_prescribed.join('\n')} onChange={(e) => setEditSessionData({ ...editSessionData, exercises_prescribed: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })} placeholder="One exercise per line..." rows={3} className="resize-none" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => { setIsEditSessionDialogOpen(false); setEditingSession(null); }}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={isEditSaving} className="bg-amber-500 hover:bg-amber-600 text-white">
                {isEditSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pencil className="h-4 w-4 mr-2" />}
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </DashboardLayout>
    </TooltipProvider>
  );
}