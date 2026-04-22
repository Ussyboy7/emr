'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, Search, Eye, Calendar, User, FileText, AlertTriangle, Loader2, Activity, Clock, Printer, Download, Target, Pencil } from 'lucide-react';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { toast } from 'sonner';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { eyeCareService, type EyeSession } from '@/lib/services/eye-care-service';
import { ViewEyeOrderModal } from '@/components/eyecare/ViewEyeOrderModal';

export default function EyeClinicCompletedPage() {
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const [sessions, setSessions] = useState<EyeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [viewOrderId, setViewOrderId] = useState<number | undefined>(undefined);
  const [isViewOrderModalOpen, setIsViewOrderModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<EyeSession | null>(null);
  const [isViewSessionDialogOpen, setIsViewSessionDialogOpen] = useState(false);
  const [isSessionReportOpen, setIsSessionReportOpen] = useState(false);
  const [isEditSessionDialogOpen, setIsEditSessionDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<EyeSession | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editSessionData, setEditSessionData] = useState({
    findings: '',
    procedures_performed: '',
    notes: '',
  });
  const [otherStatusCount, setOtherStatusCount] = useState(0);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setOtherStatusCount(0);

      const response = await eyeCareService.getSessions({
        status: 'completed',
        page_size: 500,
      });
      const list = response.results ?? [];
      setSessions(list);

      if (list.length === 0) {
        try {
          const any = await eyeCareService.getSessions({ page_size: 500 });
          const all = any.results ?? [];
          const nonCompleted = all.filter((s) => s.status !== 'completed').length;
          setOtherStatusCount(nonCompleted);
        } catch {
          setOtherStatusCount(0);
        }
      }
    } catch (err) {
      console.error('Error loading completed eye clinic sessions:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load completed eye clinic sessions');
        toast.error('Failed to load completed sessions');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter, itemsPerPage, dateRange.from, dateRange.to]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return sessions.filter((session) => {
      const completedDate = session.completed_at
        ? new Date(session.completed_at)
        : new Date(session.scheduled_at);
      if (Number.isNaN(completedDate.getTime())) return false;

      if (dateFilter !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dateFilter === 'today' && completedDate.toDateString() !== today.toDateString()) return false;
        if (dateFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (completedDate < weekAgo) return false;
        }
        if (dateFilter === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          if (completedDate < monthAgo) return false;
        }
      }

      if (dateRange.from) {
        const from = new Date(`${dateRange.from}T00:00:00`);
        if (completedDate < from) return false;
      }
      if (dateRange.to) {
        const to = new Date(`${dateRange.to}T23:59:59.999`);
        if (completedDate > to) return false;
      }

      if (!q) return true;
      const od = session.order_details;
      return (
        session.patient_name?.toLowerCase().includes(q) ||
        session.patient_id?.toLowerCase().includes(q) ||
        od?.diagnosis?.toLowerCase().includes(q) ||
        od?.chief_complaint?.toLowerCase().includes(q) ||
        String(session.session_number).includes(q) ||
        session.findings?.toLowerCase().includes(q) ||
        session.procedures_performed?.toLowerCase().includes(q) ||
        session.notes?.toLowerCase().includes(q) ||
        String(session.order).includes(q)
      );
    });
  }, [sessions, searchQuery, dateFilter, dateRange.from, dateRange.to]);

  const paginatedSessions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSessions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSessions, currentPage, itemsPerPage]);

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    return {
      total: sessions.length,
      uniquePatients: new Set(sessions.map((s) => s.patient_id).filter(Boolean)).size,
      thisWeek: sessions.filter((s) => {
        const at = s.completed_at ? new Date(s.completed_at) : s.scheduled_at ? new Date(s.scheduled_at) : null;
        return at ? at >= weekStart : false;
      }).length,
      thisMonth: sessions.filter((s) => {
        const at = s.completed_at ? new Date(s.completed_at) : s.scheduled_at ? new Date(s.scheduled_at) : null;
        return at ? at.getMonth() === now.getMonth() && at.getFullYear() === now.getFullYear() : false;
      }).length,
    };
  }, [sessions]);

  const summarySession = selectedSession;

  const openOrderModalFromSession = () => {
    if (!summarySession?.order) return;
    setViewOrderId(summarySession.order);
    setIsViewSessionDialogOpen(false);
    setIsSessionReportOpen(false);
    setIsViewOrderModalOpen(true);
  };

  const openEdit = (session: EyeSession) => {
    setEditSessionData({
      findings: session.findings || '',
      procedures_performed: session.procedures_performed || '',
      notes: session.notes || '',
    });
    setEditingSession(session);
    setIsEditSessionDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingSession) return;
    setIsEditSaving(true);
    try {
      const updated = await eyeCareService.updateSession(editingSession.id, {
        findings: editSessionData.findings,
        procedures_performed: editSessionData.procedures_performed,
        notes: editSessionData.notes,
      });

      setSessions((prev) => prev.map((session) => (
        session.id === editingSession.id
          ? { ...session, ...updated, order_details: session.order_details ?? updated.order_details }
          : session
      )));

      setSelectedSession((prev) => (
        prev?.id === editingSession.id
          ? { ...prev, ...updated, order_details: prev.order_details ?? updated.order_details }
          : prev
      ));

      toast.success('Session updated successfully');
      setIsEditSessionDialogOpen(false);
      setEditingSession(null);
    } catch (err) {
      console.error('Error updating eye clinic session:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update session');
    } finally {
      setIsEditSaving(false);
    }
  };

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
                    <p className="text-sm text-muted-foreground">Unique Patients</p>
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
                    <p className="text-sm text-muted-foreground">This Week</p>
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
                    <p className="text-sm text-muted-foreground">This Month</p>
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
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Date Range" />
                    </SelectTrigger>
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
                  <Button variant="outline" className="mt-4" onClick={() => void loadSessions()}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : sessions.length > 0 && filteredSessions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground space-y-3">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No sessions match your filters</p>
                  <p className="text-sm max-w-md mx-auto">
                    Try clearing search, setting date range to <strong>All Time</strong>, or removing the custom completed date
                    range.
                  </p>
                </CardContent>
              </Card>
            ) : sessions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground space-y-3">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No completed eye clinic sessions found</p>
                  {otherStatusCount > 0 ? (
                    <p className="text-sm max-w-md mx-auto">
                      You have <strong>{otherStatusCount}</strong> session{otherStatusCount !== 1 ? 's' : ''} that{' '}
                      {otherStatusCount !== 1 ? 'are' : 'is'} not completed yet. To see them here:{' '}
                      <strong>Eye Clinic → Orders</strong> → open the order → complete the in-progress session workflow. Sessions
                      appear here after they are marked completed.
                    </p>
                  ) : (
                    <p className="text-sm max-w-md mx-auto">
                      Complete sessions from <strong>Eye Clinic → Orders</strong>: open an order, run the session, then mark the
                      session completed when documentation is finished.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              paginatedSessions.map((session) => {
                const completedDate = session.completed_at
                  ? new Date(session.completed_at)
                  : new Date(session.scheduled_at);
                const orderId = session.order;
                const diagnosis = session.order_details?.diagnosis || session.order_details?.chief_complaint || 'Eye clinic session';

                return (
                  <Card key={session.id} className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/30">
                          <PatientAvatar name={session.patient_name ?? ''} size="sm" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-foreground truncate">{session.patient_name ?? '—'}</span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                              >
                                <CheckCircle2 className="h-2 w-2 mr-0.5" />
                                Completed
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-500/10 text-gray-600 border-gray-500/30">
                                Session {session.session_number}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 truncate max-w-[200px]">
                                {diagnosis}
                              </Badge>
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
                                      setIsViewSessionDialogOpen(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4 text-muted-foreground hover:text-blue-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>View details</p>
                                </TooltipContent>
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
                                <TooltipContent>
                                  <p>Session report</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span className="font-mono">{session.patient_id}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {completedDate.toLocaleDateString()}{' '}
                              {completedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {session.duration_minutes != null && (
                              <>
                                <span>•</span>
                                <span>{session.duration_minutes} min</span>
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

          {filteredSessions.length > 0 ? (
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
          ) : null}

          <ViewEyeOrderModal
            open={isViewOrderModalOpen}
            onOpenChange={(open) => {
              setIsViewOrderModalOpen(open);
              if (!open) setViewOrderId(undefined);
            }}
            orderId={viewOrderId}
          />

          <Dialog open={isViewSessionDialogOpen} onOpenChange={setIsViewSessionDialogOpen}>
            <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-500" />
                  Session Details - {summarySession?.patient_name}
                </DialogTitle>
                <DialogDescription>
                  EYE-{summarySession?.id?.toString().padStart(6, '0')} • Completed on{' '}
                  {summarySession?.completed_at ? new Date(summarySession.completed_at).toLocaleString() : 'N/A'}
                </DialogDescription>
              </DialogHeader>
              {summarySession ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Patient</p>
                      <p className="font-medium text-base">{summarySession.patient_name || '—'}</p>
                      <p className="text-sm text-muted-foreground font-mono">{summarySession.patient_id || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Eye Clinic Staff</p>
                      <p className="font-medium text-base">{summarySession.order_details?.ordered_by_name || 'Not documented'}</p>
                      <p className="text-sm text-muted-foreground">Eye Clinic Session</p>
                    </div>
                  </div>

                  {summarySession.order_details?.diagnosis && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Diagnosis
                      </p>
                      <p className="text-sm font-medium">{summarySession.order_details.diagnosis}</p>
                    </div>
                  )}

                  {summarySession.order_details?.treatment_plan && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Activity className="h-3 w-3" /> Treatment Goal
                      </p>
                      <p className="text-sm">{summarySession.order_details.treatment_plan}</p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg border bg-card">
                    <p className="text-xs text-muted-foreground mb-2">Session Timeline</p>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                        <span>Scheduled: {summarySession.scheduled_at ? new Date(summarySession.scheduled_at).toLocaleString() : 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                        <span>Completed: {summarySession.completed_at ? new Date(summarySession.completed_at).toLocaleString() : 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      Treatment Performed
                    </Label>
                    <p className="text-sm bg-muted/50 p-3 rounded-md">
                      {summarySession.procedures_performed || summarySession.findings || 'Not documented'}
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm text-muted-foreground">Progress Notes</Label>
                    <p className="text-sm bg-muted/50 p-3 rounded-md">{summarySession.notes || summarySession.findings || 'Not documented'}</p>
                  </div>
                </div>
              ) : null}
              <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsViewSessionDialogOpen(false)}>Close</Button>
                {summarySession && (
                  <Button onClick={() => { setIsViewSessionDialogOpen(false); openEdit(summarySession); }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit session
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isSessionReportOpen} onOpenChange={setIsSessionReportOpen}>
            <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  Eye Clinic Session Report - {summarySession?.patient_name}
                </DialogTitle>
                <DialogDescription>
                  {summarySession?.id != null ? `EYE-${String(summarySession.id).padStart(6, '0')}` : ''}
                  {summarySession?.session_number != null ? ` • Session ${summarySession.session_number}` : ''}
                </DialogDescription>
              </DialogHeader>

              {summarySession ? (
                <>
                <div className="space-y-6">
                  <div className="border-b pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-semibold text-blue-700">EYE CLINIC SESSION REPORT</h2>
                        <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
                      </div>
                      <div className="text-right print:hidden">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setIsSessionReportOpen(false); if (summarySession) openEdit(summarySession); }}>
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => window.print()}>
                            <Printer className="h-4 w-4 mr-1" />
                            Print
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => window.print()}>
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
                          <p><span className="font-medium">Name:</span> {summarySession.patient_name || '—'}</p>
                          <p><span className="font-medium">ID:</span> {summarySession.patient_id || '—'}</p>
                          <p><span className="font-medium">Eye Clinic Staff:</span> {summarySession.order_details?.ordered_by_name || 'Not documented'}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Session Details</h3>
                        <div className="space-y-1">
                          <p><span className="font-medium">Session:</span> {summarySession.session_number}</p>
                          <p><span className="font-medium">Scheduled:</span> {summarySession.scheduled_at ? new Date(summarySession.scheduled_at).toLocaleString() : 'N/A'}</p>
                          <p><span className="font-medium">Completed:</span> {summarySession.completed_at ? new Date(summarySession.completed_at).toLocaleString() : 'N/A'}</p>
                          <p><span className="font-medium">Duration:</span> {summarySession.duration_minutes != null ? `${summarySession.duration_minutes} min` : 'Not documented'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {summarySession.order_details?.diagnosis && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Primary Diagnosis</p>
                      <p className="text-sm mt-1">{summarySession.order_details.diagnosis}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 border-b pb-2">A. Patient Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Presenting Complaint</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {summarySession.order_details?.chief_complaint || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Special Instructions</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {summarySession.order_details?.special_instructions || 'Not documented'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 border-b pb-2">B. Medical & Social Background</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Referring Clinician</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {summarySession.order_details?.ordered_by_name || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Treatment Plan</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {summarySession.order_details?.treatment_plan || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Patient ID</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {summarySession.patient_id || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Order Number</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          #{summarySession.order}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 border-b pb-2">C. Physical Examination</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Visual Acuity</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px] whitespace-pre-wrap">
                          OD: {summarySession.order_details?.visual_acuity_od || 'N/A'}{'\n'}
                          OS: {summarySession.order_details?.visual_acuity_os || 'N/A'}{'\n'}
                          OU: {summarySession.order_details?.visual_acuity_ou || 'N/A'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Refraction</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px] whitespace-pre-wrap">
                          OD: {summarySession.order_details?.refraction_od || 'N/A'}{'\n'}
                          OS: {summarySession.order_details?.refraction_os || 'N/A'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Intraocular Pressure</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px] whitespace-pre-wrap">
                          OD: {summarySession.order_details?.iop_od ?? 'N/A'}{'\n'}
                          OS: {summarySession.order_details?.iop_os ?? 'N/A'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Special Tests</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {summarySession.findings || 'Not documented'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 border-b pb-2">D. Functional Evaluation</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Clinical Context</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {summarySession.order_details?.chief_complaint || summarySession.order_details?.diagnosis || 'Not documented'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Session Duration</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                          {summarySession.duration_minutes != null ? `${summarySession.duration_minutes} min` : 'Not documented'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 border-b pb-2">E. Clinical Reasoning</h3>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Assessment Findings & Clinical Impression</Label>
                      <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
                        {summarySession.findings || summarySession.order_details?.diagnosis || 'Not documented'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 border-b pb-2">F. Treatment Plan</h3>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Planned Treatment Approach</Label>
                      <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
                        {summarySession.order_details?.treatment_plan || summarySession.procedures_performed || 'Not documented'}
                      </p>
                    </div>
                  </div>

                  {(summarySession.procedures_performed || summarySession.notes) && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 border-b pb-2">Treatment Performed & Outcomes</h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Treatment Performed</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {summarySession.procedures_performed || 'Not documented'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Progress Notes</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {summarySession.notes || 'Not documented'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <p>Report generated on {new Date().toLocaleString()}</p>
                      <p>Session ID: EYE-{String(summarySession.id).padStart(6, '0')}</p>
                    </div>
                  </div>
                </div>
                </>
              ) : null}
            </DialogContent>
          </Dialog>

          <Dialog open={isEditSessionDialogOpen} onOpenChange={(open) => {
            if (!open) {
              setIsEditSessionDialogOpen(false);
              setEditingSession(null);
            }
          }}>
            <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="h-5 w-5 text-amber-500" />
                  Edit Session {editingSession?.session_number ? `• ${editingSession.session_number}` : ''} • {editingSession?.patient_name}
                </DialogTitle>
                <DialogDescription>
                  Update eye clinic session documentation. Changes will appear in the Session Report.
                </DialogDescription>
              </DialogHeader>
              {editingSession ? (
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <Label>Findings</Label>
                    <Textarea
                      value={editSessionData.findings}
                      onChange={(e) => setEditSessionData((prev) => ({ ...prev, findings: e.target.value }))}
                      placeholder="Clinical findings..."
                      rows={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Procedures Performed</Label>
                    <Textarea
                      value={editSessionData.procedures_performed}
                      onChange={(e) => setEditSessionData((prev) => ({ ...prev, procedures_performed: e.target.value }))}
                      placeholder="Document procedures performed..."
                      rows={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Progress Notes</Label>
                    <Textarea
                      value={editSessionData.notes}
                      onChange={(e) => setEditSessionData((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Session progress notes..."
                      rows={5}
                    />
                  </div>
                </div>
              ) : null}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => { setIsEditSessionDialogOpen(false); setEditingSession(null); }}>
                  Cancel
                </Button>
                <Button onClick={handleEditSave} disabled={isEditSaving}>
                  {isEditSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
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
