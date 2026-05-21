'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { EyeSessionReportView } from '@/components/eyecare/EyeSessionReportView';
import { eyeCareService, type EyeSession } from '@/lib/services/eye-care-service';
import {
  buildCompletedAtApiRange,
  rollingWeekStart,
  calendarMonthBounds,
} from '@/lib/utils/completed-session-filters';
import {
  CheckCircle2, Search, Eye, AlertTriangle, Loader2, Activity, User, Calendar, FileText, Printer,
  Target,
  Download,
} from 'lucide-react';

export default function EyeClinicCompletedSessionsPage() {
  const searchParams = useSearchParams();
  const urlHydrated = useRef(false);
  const [sessions, setSessions] = useState<EyeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [weekCompletedCount, setWeekCompletedCount] = useState(0);
  const [monthCompletedCount, setMonthCompletedCount] = useState(0);

  const [selectedSession, setSelectedSession] = useState<EyeSession | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isSessionReportOpen, setIsSessionReportOpen] = useState(false);
  const [pdfDownloadLoading, setPdfDownloadLoading] = useState(false);

  const [orderSessionsForReport, setOrderSessionsForReport] = useState<EyeSession[]>([]);
  const [reportViewingSession, setReportViewingSession] = useState<EyeSession | null>(null);

  const [otherStatusCount, setOtherStatusCount] = useState(0);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setOtherStatusCount(0);

      const searching = Boolean(searchQuery.trim());
      const effectiveDateFilter = searching || dateFilter === 'all' ? 'all' : dateFilter;
      const completedRange = buildCompletedAtApiRange(
        effectiveDateFilter,
        searching ? { from: '', to: '' } : dateRange,
      );
      const search = searchQuery.trim() || undefined;
      const baseList = {
        status: 'completed' as const,
        search,
        ...completedRange,
      };

      const { start: monthStart, end: monthEnd } = calendarMonthBounds();
      const weekStart = rollingWeekStart();

      const [response, weekRow, monthRow] = await Promise.all([
        eyeCareService.getSessions({
          ...baseList,
          page: currentPage,
          page_size: itemsPerPage,
        }),
        eyeCareService.getSessions({
          status: 'completed',
          search,
          page: 1,
          page_size: 1,
          completed_after: weekStart.toISOString(),
        }),
        eyeCareService.getSessions({
          status: 'completed',
          search,
          page: 1,
          page_size: 1,
          completed_after: monthStart.toISOString(),
          completed_before: monthEnd.toISOString(),
        }),
      ]);

      const list = response?.results ?? [];
      setSessions(list);
      setTotalCount(response?.count ?? 0);
      setWeekCompletedCount(weekRow?.count ?? 0);
      setMonthCompletedCount(monthRow?.count ?? 0);

      if (list.length === 0) {
        try {
          const [anyStatus, completedOnly] = await Promise.all([
            eyeCareService.getSessions({ page_size: 1 }),
            eyeCareService.getSessions({ status: 'completed', page_size: 1 }),
          ]);
          const total = anyStatus?.count ?? 0;
          const nCompleted = completedOnly?.count ?? 0;
          setOtherStatusCount(Math.max(0, total - nCompleted));
        } catch {
          setOtherStatusCount(0);
        }
      }
    } catch (err: unknown) {
      console.error('Error loading completed eye sessions:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load sessions');
        toast.error('Failed to load completed eye sessions');
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, searchQuery, dateFilter, dateRange.from, dateRange.to]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter, itemsPerPage, dateRange.from, dateRange.to]);

  useEffect(() => {
    if (!isSessionReportOpen || !selectedSession) return;
    const orderId =
      typeof selectedSession.order === 'number'
        ? selectedSession.order
        : selectedSession.order_details?.id;
    if (!orderId) {
      setOrderSessionsForReport(selectedSession ? [selectedSession] : []);
      setReportViewingSession(selectedSession);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await eyeCareService.getSessions({ order: orderId, page_size: 50, status: 'completed' });
        const list = (r?.results ?? []).filter((s) => s.status === 'completed');
        if (cancelled) return;
        const hasSelected = list.some((s) => s.id === selectedSession.id);
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
    return () => {
      cancelled = true;
    };
  }, [isSessionReportOpen, selectedSession?.id, selectedSession?.order]);

  const handleDownloadSessionPdf = async (sessionId: number) => {
    setPdfDownloadLoading(true);
    try {
      const blob = await eyeCareService.downloadSessionReportPdf(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eye-session-${sessionId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF download started');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to download PDF');
    } finally {
      setPdfDownloadLoading(false);
    }
  };

  const stats = useMemo(
    () => ({
      total: totalCount,
      uniquePatients: new Set(sessions.map((s) => s.patient_id).filter(Boolean)).size,
      thisWeek: weekCompletedCount,
      thisMonth: monthCompletedCount,
    }),
    [totalCount, weekCompletedCount, monthCompletedCount, sessions]
  );

  const reportSession = isSessionReportOpen ? (reportViewingSession || selectedSession) : null;

  return (
    <TooltipProvider>
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                Completed Sessions
              </h1>
              <p className="text-muted-foreground mt-1">Completed eye clinic session reports</p>
            </div>
            <Button variant="outline" onClick={() => void loadSessions()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Matching filter</p>
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
                    <p className="text-sm text-muted-foreground">Patients (this page)</p>
                    <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.uniquePatients}</p>
                  </div>
                  <User className="h-8 w-8 text-blue-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">This week (all)</p>
                    <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.thisWeek}</p>
                  </div>
                  <Calendar className="h-8 w-8 text-amber-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">This month (calendar)</p>
                    <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.thisMonth}</p>
                  </div>
                  <Calendar className="h-8 w-8 text-purple-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

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
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
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
            description="Apply a custom completed date range to narrow down eye clinic sessions."
            label="Completed Date Range"
            value={dateRange}
            onChange={setDateRange}
            onClear={() => setDateRange({ from: '', to: '' })}
          />

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
                  <Button variant="outline" className="mt-4" onClick={() => void loadSessions()}>Retry</Button>
                </CardContent>
              </Card>
            ) : sessions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground space-y-3">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No completed eye clinic sessions found</p>
                  {otherStatusCount > 0 ? (
                    <p className="text-sm max-w-md mx-auto">
                      You have <strong>{otherStatusCount}</strong> session{otherStatusCount !== 1 ? 's' : ''} that {otherStatusCount !== 1 ? 'are' : 'is'} not completed yet. Complete documentation from{' '}
                      <Link href="/eyecare/orders" className="text-primary underline font-medium">Eye Clinic → Orders</Link>
                      {' '}(<strong>End Session</strong> on an in-progress session). Sessions appear here after the order is completed.
                    </p>
                  ) : (
                    <p className="text-sm max-w-md mx-auto">
                      Complete sessions from{' '}
                      <Link href="/eyecare/orders" className="text-primary underline font-medium">Eye Clinic → Orders</Link>
                      : document the visit and use <strong>End Session</strong> to mark the session and order complete.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              sessions.map((session) => {
                const completedDate = session.completed_at
                  ? new Date(session.completed_at)
                  : new Date(session.scheduled_at);
                const diag = session.order_details?.diagnosis?.trim();
                const hasDiag = Boolean(diag);

                return (
                  <Card
                    key={session.id}
                    className={`border-l-4 hover:shadow-md transition-shadow ${
                      hasDiag ? 'border-l-amber-500' : 'border-l-emerald-500'
                    }`}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                          hasDiag ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'
                        }`}>
                          <PatientAvatar name={session.patient_name ?? ''} size="sm" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-foreground truncate">{session.patient_name ?? ''}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                <CheckCircle2 className="h-2 w-2 mr-0.5" />Completed
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-500/10 text-gray-600 border-gray-500/30">
                                Session {session.session_number}
                              </Badge>
                              {diag && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 max-w-[200px] truncate">
                                  {diag}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-muted"
                                    onClick={() => {
                                      setSelectedSession(session);
                                      setIsViewDialogOpen(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4 text-muted-foreground hover:text-blue-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>View details</p></TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-muted"
                                    onClick={() => {
                                      setSelectedSession(session);
                                      setIsSessionReportOpen(true);
                                    }}
                                  >
                                    <FileText className="h-4 w-4 text-muted-foreground hover:text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Session report</p></TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-muted"
                                    onClick={() => void handleDownloadSessionPdf(session.id)}
                                  >
                                    <Download className="h-4 w-4 text-muted-foreground hover:text-sky-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Download PDF</p></TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span className="font-mono">{session.patient_id}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {completedDate.toLocaleDateString()} {completedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {session.order_details?.chief_complaint && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1 truncate max-w-[280px]">
                                  <Target className="h-3 w-3 shrink-0" />
                                  {session.order_details.chief_complaint}
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
        </div>

        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-500" />
                Session details — {selectedSession?.patient_name}
              </DialogTitle>
              <DialogDescription>
                Session {selectedSession?.session_number} •{' '}
                {selectedSession?.completed_at
                  ? new Date(selectedSession.completed_at).toLocaleString()
                  : '—'}
              </DialogDescription>
            </DialogHeader>

            {selectedSession && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Patient</p>
                    <p className="font-medium">{selectedSession.patient_name}</p>
                    <p className="text-muted-foreground font-mono">{selectedSession.patient_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Order</p>
                    <p className="font-medium">#{selectedSession.order_details?.id ?? selectedSession.order}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Location</p>
                    <p className="font-medium">{selectedSession.order_details?.location_clinic_name || '—'}</p>
                  </div>
                </div>

                {selectedSession.order_details?.diagnosis && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-muted-foreground mb-1">Diagnosis</p>
                    <p>{selectedSession.order_details.diagnosis}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assessment (SOAP)</p>
                  <p className="bg-muted/50 p-3 rounded border min-h-[60px]">
                    {selectedSession.soap_note?.assessment.diagnosis
                      || selectedSession.order_details?.diagnosis
                      || selectedSession.findings
                      || '—'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Plan / notes</p>
                  <p className="bg-muted/50 p-3 rounded border whitespace-pre-wrap">
                    {selectedSession.soap_note?.plan.managementPlan
                      || selectedSession.procedures_performed
                      || selectedSession.notes
                      || '—'}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isSessionReportOpen}
          onOpenChange={(open) => {
            setIsSessionReportOpen(open);
            if (!open) {
              setOrderSessionsForReport([]);
              setReportViewingSession(null);
            }
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Eye session report — {reportSession?.order_details?.patient_name || reportSession?.patient_name}
              </DialogTitle>
              <DialogDescription>
                {reportSession?.completed_at
                  ? new Date(reportSession.completed_at).toLocaleString()
                  : (reportSession?.scheduled_at ? new Date(reportSession.scheduled_at).toLocaleString() : '')}
              </DialogDescription>
            </DialogHeader>

            {orderSessionsForReport.length > 1 && reportSession && (
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <span className="text-sm text-muted-foreground">View session:</span>
                <Select
                  value={String(reportViewingSession?.id ?? reportSession.id)}
                  onValueChange={(id) => {
                    const next = orderSessionsForReport.find((s) => s.id === Number(id));
                    if (next) setReportViewingSession(next);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderSessionsForReport.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        Session {s.session_number}
                        {s.completed_at ? ` · ${new Date(s.completed_at).toLocaleDateString()}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {reportSession && <EyeSessionReportView reportSession={reportSession} />}

            <DialogFooter className="print:hidden gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => reportSession?.id != null && void handleDownloadSessionPdf(reportSession.id)}
                disabled={pdfDownloadLoading}
              >
                {pdfDownloadLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Download PDF
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button variant="outline" onClick={() => setIsSessionReportOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </TooltipProvider>
  );
}
