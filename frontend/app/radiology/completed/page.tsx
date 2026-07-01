"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { useSearchParams } from 'next/navigation';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { radiologyService, adminService, type Clinic } from '@/lib/services';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { resolvePatientPhoto } from "@/lib/patient-photo";
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { RadiologyCompletedReportDialog } from '@/components/radiology/RadiologyCompletedReportDialog';
import {
  transformApiRadiologyReportToCompleted,
  type CompletedRadiologyReport,
} from '@/lib/radiology/completedRadiologyReport';
import { downloadRadiologyReportFile, printRadiologyReport } from '@/lib/radiology/radiologyReportActions';
import { formatLocalYmd } from '@/lib/laboratory/constants';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useRadiologyPageAuth } from '@/hooks/use-radiology-page-auth';
import { useServerToday } from '@/hooks/use-server-today';

import {
  CheckCircle2, Search, Eye, Clock, AlertTriangle,
  Stethoscope, Download, Loader2, Printer
} from 'lucide-react';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { formatDisplayDateMedium, formatDisplayTime } from '@/lib/dates';

export default function CompletedReportsPage() {
  const { ready, handleAuthError } = useRadiologyPageAuth();
  const serverToday = useServerToday();
  const searchParams = useSearchParams();
  const urlHydrated = useRef(false);
  const [reports, setReports] = useState<CompletedRadiologyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, normal: 0, abnormal: 0, critical: 0 });
  const [facilities, setFacilities] = useState<Clinic[]>([]);

  // Dialog states
  const [selectedReport, setSelectedReport] = useState<CompletedRadiologyReport | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const urlSearch = searchParams.get('search');
    const urlDate = searchParams.get('date');
    if (urlSearch) setSearchQuery(urlSearch);
    if (urlDate === 'all') setDateFilter('all');
  }, [searchParams]);

  const formatDateTime = (isoString: string) => ({
    date: formatDisplayDateMedium(isoString),
    time: formatDisplayTime(isoString),
  });

  const buildDateQuery = useCallback(
    (filter: string): Record<string, string> => {
      // Anchor on server "today" so filters match the server calendar.
      const anchor = serverToday ? new Date(`${serverToday}T00:00:00`) : new Date();
      const anchorYmd = serverToday || formatLocalYmd(anchor);
      if (filter === 'today') return { date: anchorYmd };
      if (filter === 'week') {
        const start = new Date(anchor);
        start.setDate(anchor.getDate() - 7);
        return { start_date: formatLocalYmd(start), end_date: anchorYmd };
      }
      if (filter === 'month') {
        const start = new Date(anchor);
        start.setMonth(anchor.getMonth() - 1);
        return { start_date: formatLocalYmd(start), end_date: anchorYmd };
      }
      return {};
    },
    [serverToday],
  );

  // Load facilities for filter dropdown
  const loadFacilities = useCallback(async () => {
    try {
      const clinicsResult = await adminService.getClinics({ is_active: true, page_size: MAX_LIST_PAGE_SIZE });
      setFacilities(clinicsResult.results || []);
    } catch (err: unknown) {
      console.error('Failed to load facilities:', err);
      if (handleAuthError(err)) return;
      toast.error('Failed to load facilities');
    }
  }, [handleAuthError]);

  // Load completed reports function - memoized to prevent infinite loops
  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {
        page: currentPage,
        page_size: itemsPerPage,
        search: debouncedSearchQuery.trim() || undefined,
        location_clinic: facilityFilter !== 'all' ? Number(facilityFilter) : undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
      };
      if (statusFilter !== 'all') {
        params.overall_status = statusFilter;
      }
      const searching = Boolean(debouncedSearchQuery.trim());
      const allTime = dateFilter === 'all' || searching;
      if (!allTime) {
        Object.assign(params, buildDateQuery(dateFilter));
        if (dateRange.from || dateRange.to) {
          delete params.date;
          if (dateRange.from) params.start_date = dateRange.from;
          if (dateRange.to) params.end_date = dateRange.to;
        }
      }

      const [response, statsResponse] = await Promise.all([
        radiologyService.getVerifiedReports(params),
        radiologyService.getVerificationStats({
          status: 'verified',
          overall_status: statusFilter !== 'all' ? statusFilter : undefined,
          search: debouncedSearchQuery.trim() || undefined,
          location_clinic: facilityFilter !== 'all' ? Number(facilityFilter) : undefined,
          gender: genderFilter !== 'all' ? genderFilter : undefined,
          ...(allTime
            ? {}
            : {
                ...buildDateQuery(dateFilter),
                ...(dateRange.from || dateRange.to
                  ? { start_date: dateRange.from || undefined, end_date: dateRange.to || undefined }
                  : {}),
              }),
        }),
      ]);
      setTotalCount(response.count || response.results.length);
      setStats({
        total: statsResponse.total || 0,
        normal: statsResponse.normal || 0,
        abnormal: statsResponse.abnormal || 0,
        critical: statsResponse.critical || 0,
      });

      const transformedReports = response.results.map((apiReport: any) =>
        transformApiRadiologyReportToCompleted(apiReport)
      );

      setReports(transformedReports);
    } catch (err: any) {
      if (handleAuthError(err)) return;
      setError(err.message || 'Failed to load completed reports');
      toast.error('Failed to load completed reports. Please try again.');
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, statusFilter, debouncedSearchQuery, dateFilter, facilityFilter, genderFilter, dateRange.from, dateRange.to, buildDateQuery, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    loadReports();
  }, [ready, loadReports]);

  useEffect(() => {
    if (!ready) return;
    void loadFacilities();
  }, [ready, loadFacilities]);

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, statusFilter, facilityFilter, dateFilter, genderFilter, itemsPerPage, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  const paginatedReports = reports;

  const openViewDialog = (report: CompletedRadiologyReport) => {
    setSelectedReport(report);
    setIsViewDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            Completed Studies
          </h1>
          <p className="text-muted-foreground mt-1">History of verified and completed radiology studies</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Completed</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                </div>
                <Stethoscope className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Normal</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.normal}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Abnormal</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.abnormal}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critical</p>
                  <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.critical}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-rose-400" />
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
                <Input placeholder="Search by patient, report ID, or study..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="abnormal">Abnormal</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={facilityFilter} onValueChange={setFacilityFilter}>
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="Facility" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Facilities</SelectItem>
                    {facilities.map((facility) => (
                      <SelectItem key={facility.id} value={String(facility.id)}>
                        {facility.name}
                      </SelectItem>
                    ))}
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
              </div>
            </div>
          </CardContent>
        </Card>

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom completed date range to narrow down radiology reports."
          label="Completed Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {/* Reports List */}
        <div className="space-y-3">
          {loading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading completed reports...</p>
            </CardContent></Card>
          ) : error ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Error Loading Reports</h3>
              <p className="mb-4">{error}</p>
              <Button variant="outline" onClick={loadReports}>Retry</Button>
            </CardContent></Card>
          ) : paginatedReports.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No completed studies found</h3>
              <p>Studies will appear here after verification in Study Orders</p>
            </CardContent></Card>
          ) : (
            <>
              {paginatedReports.map((report) => {
                const completed = {
                  date: report.completedAt ? formatDateTime(report.completedAt).date : 'Unknown',
                  time: report.completedAt ? formatDateTime(report.completedAt).time : 'Unknown'
                };

                return (
                  <Card key={report.id} className={`border-l-4 hover:shadow-md transition-shadow ${
                    report.overallStatus === 'Critical' ? 'border-l-rose-500' :
                    report.overallStatus === 'Abnormal' ? 'border-l-amber-500' : 'border-l-emerald-500'
                  }`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <PatientAvatar name={report.patient.name} photoUrl={resolvePatientPhoto(report.patient)} size="sm" />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Name + Badges + Actions */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-foreground truncate">{report.patient.name}</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                report.overallStatus === 'Critical' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50' :
                                report.overallStatus === 'Abnormal' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50' :
                                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50'
                              }`}>
                                {report.overallStatus === 'Critical' && <AlertTriangle className="h-2 w-2 mr-0.5" />}{report.overallStatus}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{report.category}</Badge>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(report)}>
                                <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => printRadiologyReport(report)}>
                                <Printer className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => downloadRadiologyReportFile(report)}>
                                <Download className="h-4 w-4 text-muted-foreground hover:text-emerald-500" />
                              </Button>
                            </div>
                          </div>

                          {/* Row 2: Details */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>
                              {joinDisplayParts([
                                joinDisplayParts(
                                  [
                                    report.patient.age !== null && report.patient.age !== undefined
                                      ? `${report.patient.age}y`
                                      : '',
                                    report.patient.gender,
                                  ],
                                  ' '
                                ),
                                report.orderId,
                                report.studyName,
                                 report.clinic,
                                 report.location_clinic_name || '',
                                 `${completed.date} ${completed.time}`.trim(),
                              ])}
                            </span>
                            {report.turnaroundTime ? (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {report.turnaroundTime}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Pagination */}
              {totalCount > 0 && (
                <Card className="p-4">
                  <StandardPagination
                    currentPage={currentPage}
                    totalItems={totalCount}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                    itemName="reports"
                  />
                </Card>
              )}
            </>
          )}
        </div>

        <RadiologyCompletedReportDialog
          open={isViewDialogOpen}
          onOpenChange={(o) => {
            setIsViewDialogOpen(o);
            if (!o) setSelectedReport(null);
          }}
          report={selectedReport}
        />
      </div>
    </DashboardLayout>
  );
}
