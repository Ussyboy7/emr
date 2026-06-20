'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDisplayDateTime } from '@/lib/dates';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useEyecarePageAuth } from '@/hooks/use-eyecare-page-auth';
import { useEyecareCompletedUrlSync } from '@/hooks/use-eyecare-completed-url-sync';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { EyeSessionReportDialog } from '@/components/eyecare/EyeSessionReportDialog';
import { CompletedSessionStatsCards } from '@/components/completed-sessions/CompletedSessionStatsCards';
import { downloadEyeSessionPdf } from '@/lib/eyecare/sessionReportPdf';
import { eyeCompletedSessionSubtitle } from '@/lib/eyecare/session-display';
import { eyeCareService, type EyeSession } from '@/lib/services/eye-care-service';
import {
  buildCompletedSessionQueryParams,
  fetchCompletedSessionStats,
  type CompletedSessionStats,
} from '@/lib/completed-sessions/completed-session-list';
import {
  CheckCircle2, Search, AlertTriangle, Loader2, Calendar, FileText,
  Target, Download,
} from 'lucide-react';

export default function EyeClinicCompletedSessionsPage() {
  const { ready, handleAuthError } = useEyecarePageAuth();

  const [sessions, setSessions] = useState<EyeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [dateFilter, setDateFilter] = useState('today');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [stats, setStats] = useState<CompletedSessionStats>({
    total: 0,
    withDiagnosis: 0,
    urgent: 0,
    withFindings: 0,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  const [isSessionReportOpen, setIsSessionReportOpen] = useState(false);
  const [reportOrderId, setReportOrderId] = useState<number | undefined>();
  const [reportSessionId, setReportSessionId] = useState<number | undefined>();
  const [pdfDownloadLoadingId, setPdfDownloadLoadingId] = useState<number | null>(null);

  useEyecareCompletedUrlSync({
    search: searchQuery,
    dateFilter,
    onSearchFromUrl: setSearchQuery,
    onDateFilterFromUrl: () => setDateFilter('all'),
  });

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

      const [listResult, statsResult] = await Promise.all([
        eyeCareService.getSessions(listParams),
        fetchCompletedSessionStats(eyeCareService.getCompletedStats.bind(eyeCareService), statsBase),
      ]);

      setSessions(listResult?.results ?? []);
      setTotalCount(listResult?.count ?? 0);
      setStats(statsResult);
    } catch (err: unknown) {
      console.error('Error loading completed eye sessions:', err);
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
      toast.error('Failed to load completed eye sessions');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchQuery, dateFilter, dateRange.from, dateRange.to, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadSessions();
  }, [ready, loadSessions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, dateFilter, itemsPerPage, dateRange.from, dateRange.to]);

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

  const handleDownloadSessionPdf = async (session: EyeSession) => {
    setPdfDownloadLoadingId(session.id);
    try {
      await downloadEyeSessionPdf(session.id, session.patient_id || String(session.id));
      toast.success('PDF download started');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to download PDF');
    } finally {
      setPdfDownloadLoadingId(null);
    }
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
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              Completed Sessions
            </h1>
            <p className="text-muted-foreground mt-1">Completed eye clinic session reports</p>
          </div>

          <CompletedSessionStatsCards stats={stats} fourthLabel="With Findings" />

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
            ) : totalCount === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No completed eye clinic sessions found
                </CardContent>
              </Card>
            ) : (
              sessions.map((session) => {
                const diag = session.order_details?.diagnosis?.trim();
                const subtitle = eyeCompletedSessionSubtitle(session);

                return (
                  <Card
                    key={session.id}
                    className={`border-l-4 hover:shadow-md transition-shadow ${
                      diag ? 'border-l-amber-500' : 'border-l-emerald-500'
                    }`}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                          diag ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'
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
                              {diag ? (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 max-w-[200px] truncate">
                                  {diag}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-muted"
                                    onClick={() => openSessionReport(session)}
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
                                    onClick={() => void handleDownloadSessionPdf(session)}
                                    disabled={pdfDownloadLoadingId === session.id}
                                  >
                                    {pdfDownloadLoadingId === session.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    ) : (
                                      <Download className="h-4 w-4 text-muted-foreground hover:text-sky-600" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Download PDF</p></TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span className="font-mono">{session.patient_id}</span>
                            {session.completed_at ? (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDisplayDateTime(new Date(session.completed_at))}
                                </span>
                              </>
                            ) : null}
                            {subtitle ? (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1 truncate max-w-[280px]">
                                  <Target className="h-3 w-3 shrink-0" />
                                  {subtitle}
                                </span>
                              </>
                            ) : null}
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
      </DashboardLayout>
    </TooltipProvider>
  );
}
