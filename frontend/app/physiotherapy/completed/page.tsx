"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from 'sonner';
import { formatDisplayDateTime } from '@/lib/dates';
import { physioService, type PhysioSession } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import {
  buildCompletedSessionQueryParams,
  fetchCompletedSessionStats,
  type CompletedSessionStats,
} from '@/lib/completed-sessions/completed-session-list';
import { CompletedSessionStatsCards } from '@/components/completed-sessions/CompletedSessionStatsCards';

import {
  CheckCircle2, Search, Eye, Calendar,
  FileText, TrendingUp, AlertTriangle, Loader2,
  Activity, Heart, Target, Lightbulb,
  Printer, Download, User,
} from 'lucide-react';

export default function PhysioCompletedPage() {
  const searchParams = useSearchParams();
  const urlHydrated = useRef(false);
  const [sessions, setSessions] = useState<PhysioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [stats, setStats] = useState<CompletedSessionStats>({
    total: 0,
    withDiagnosis: 0,
    urgent: 0,
    withFindings: 0,
  });
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Pagination / totals (server-side)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  // Dialogs
  const [selectedSession, setSelectedSession] = useState<PhysioSession | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isSessionReportOpen, setIsSessionReportOpen] = useState(false);
  const [pdfDownloadLoading, setPdfDownloadLoading] = useState(false);

  // Session Report: all sessions for the same order (to switch Session 1, 2, 3...) and which one we're viewing
  const [orderSessionsForReport, setOrderSessionsForReport] = useState<PhysioSession[]>([]);
  const [reportViewingSession, setReportViewingSession] = useState<PhysioSession | null>(null);

  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const urlSearch = searchParams.get('search');
    const urlDate = searchParams.get('date');
    if (urlSearch) setSearchQuery(urlSearch);
    if (urlDate === 'all') setDateFilter('all');
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const listParams = buildCompletedSessionQueryParams({
        debouncedSearch: debouncedSearchQuery,
        dateFilter,
        dateRange,
        currentPage,
        itemsPerPage,
      });
      const { page, page_size, ...statsBase } = listParams;

      const [response, statsResult] = await Promise.all([
        physioService.getSessions(listParams),
        fetchCompletedSessionStats(physioService.getCompletedStats.bind(physioService), statsBase),
      ]);

      setSessions(response?.results ?? []);
      setTotalCount(response?.count ?? 0);
      setStats(statsResult);
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
  }, [currentPage, itemsPerPage, debouncedSearchQuery, dateFilter, dateRange.from, dateRange.to]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, dateFilter, itemsPerPage, dateRange.from, dateRange.to]);

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
        const r = await physioService.getSessions({ order: orderId, page_size: 50 });
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

  const handleDownloadSessionPdf = async (sessionId: number) => {
    setPdfDownloadLoading(true);
    try {
      const blob = await physioService.downloadSessionReport(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `physio-session-${sessionId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF download started');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to download PDF');
    } finally {
      setPdfDownloadLoading(false);
    }
  };

  const reportSession = isSessionReportOpen ? (reportViewingSession || selectedSession) : null;

  return (
    <TooltipProvider>
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            Completed Sessions
          </h1>
          <p className="text-muted-foreground mt-1">Completed physiotherapy session reports</p>
        </div>

        <CompletedSessionStatsCards stats={stats} fourthLabel="With Recommendations" fourthIcon="recommendations" />

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
                  <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

          <AdvancedDateRangeDialog
            open={isDateFilterDialogOpen}
            onOpenChange={setIsDateFilterDialogOpen}
            description="Apply a custom completed date range to narrow down physiotherapy sessions."
            label="Completed Date Range"
            value={dateRange}
            onChange={setDateRange}
            onClear={() => setDateRange({ from: '', to: '' })}
          />

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
          ) : totalCount === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No completed physiotherapy sessions found
              </CardContent>
            </Card>
          ) : (
            sessions.map((session) => {
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
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted" onClick={() => handleDownloadSessionPdf(session.id)}>
                                  <Download className="h-4 w-4 text-muted-foreground hover:text-sky-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Download PDF</p>
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
                            {formatDisplayDateTime(completedDate)}
                          </span>

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
        {totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
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
                PHY-{selectedSession?.id?.toString().padStart(6, '0')} • Completed on {selectedSession?.completed_at ? formatDisplayDateTime(selectedSession.completed_at) : 'N/A'}
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
                    <p className="text-xs text-muted-foreground mt-1">Location: {selectedSession.order_details?.location_clinic_name || (selectedSession as any).location_clinic_name || '—'}</p>
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


                  </div>
                )}

                {/* Session Timeline */}
                <div className="p-3 rounded-lg border bg-card">
                  <p className="text-xs text-muted-foreground mb-2">Session Timeline</p>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                      <span>Scheduled: {selectedSession.scheduled_at ? formatDisplayDateTime(selectedSession.scheduled_at) : 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      <span>Completed: {selectedSession.completed_at ? formatDisplayDateTime(selectedSession.completed_at) : 'N/A'}</span>
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
                        <Button variant="outline" size="sm" onClick={() => reportSession?.id != null && handleDownloadSessionPdf(reportSession.id)} disabled={pdfDownloadLoading}>
                          {pdfDownloadLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                          Download PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => window.print()}>
                          <Printer className="h-4 w-4 mr-1" />
                          Print
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
                          <p><span className="font-medium">Scheduled:</span> {formatDisplayDateTime(reportSession.scheduled_at)}</p>
                        )}
                        {reportSession.completed_at && (
                          <p><span className="font-medium">Completed:</span> {formatDisplayDateTime(reportSession.completed_at)}</p>
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
                    <p>Report generated on {formatDisplayDateTime(new Date())}</p>
                    {reportSession?.id != null && (
                      <p>Session ID: PHY-{String(reportSession.id).padStart(6, '0')}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </DashboardLayout>
    </TooltipProvider>
  );
}