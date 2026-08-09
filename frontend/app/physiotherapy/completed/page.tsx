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
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from 'sonner';
import { formatDisplayDateTime } from '@/lib/dates';
import { physioService, type PhysioSession } from '@/lib/services';
import { usePhysioPageAuth } from '@/hooks/use-physio-page-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { resolvePatientPhoto } from "@/lib/patient-photo";
import { PhysioSessionReportDialog } from '@/components/physiotherapy/PhysioSessionReportDialog';
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
  const { ready, handleAuthError } = usePhysioPageAuth();
  const [sessions, setSessions] = useState<PhysioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
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
  const [reportSession, setReportSession] = useState<PhysioSession | null>(null);

  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const urlSearch = searchParams.get('search');
    const urlDate = searchParams.get('date');
    if (urlSearch) setSearchQuery(urlSearch);
    if (urlDate === 'all') setDateFilter('all');
  }, [searchParams]);

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
      if (handleAuthError(err)) return;
      setError(err.message || 'Failed to load sessions');
      toast.error('Failed to load completed sessions');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchQuery, dateFilter, dateRange, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    loadSessions();
  }, [ready, loadSessions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, dateFilter, itemsPerPage, dateRange.from, dateRange.to]);

  const openSessionReport = (session: PhysioSession) => {
    setReportSession(session);
    setIsSessionReportOpen(true);
  };

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
                      <PatientAvatar name={session.patient_name ?? ''} photoUrl={resolvePatientPhoto(session)} size="sm" />
                      
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
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted" onClick={() => openSessionReport(session)}>
                                  <FileText className="h-4 w-4 text-muted-foreground hover:text-green-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Session Report</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted" onClick={() => openSessionReport(session)}>
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
          <DialogContent className={MODAL_SIZES.ml}>
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

        <PhysioSessionReportDialog
          open={isSessionReportOpen}
          onOpenChange={(open) => {
            setIsSessionReportOpen(open);
            if (!open) setReportSession(null);
          }}
          session={reportSession}
          handleAuthError={handleAuthError}
        />

        </div>
      </DashboardLayout>
    </TooltipProvider>
  );
}
