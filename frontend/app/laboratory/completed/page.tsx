"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { labService, formatPatientGenderLabel } from '@/lib/services';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { formatDisplayDateMedium, formatDisplayTime } from '@/lib/dates';
import { LabCompletedReportDialog } from '@/components/laboratory/LabCompletedReportDialog';
import {
  transformApiRowToCompletedTest,
  type CompletedTest,
} from '@/lib/laboratory/completedLabReport';
import { formatLocalYmd } from '@/lib/laboratory/constants';
import { useServerToday } from '@/hooks/use-server-today';

import {
  CheckCircle2, Search, Eye, Clock, AlertTriangle, Calendar,
  User, Stethoscope, FlaskConical, Loader2
} from 'lucide-react';
import { useOutpatientClinicTypes } from '@/hooks/use-outpatient-clinic-types';

export default function CompletedTestsPage() {
  const { names: opdClinicNames } = useOutpatientClinicTypes();
  const serverToday = useServerToday();
  const searchParams = useSearchParams();
  const urlHydrated = useRef(false);
  const [tests, setTests] = useState<CompletedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [clinicFilter, setClinicFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [processingFilter, setProcessingFilter] = useState<'all' | 'in_house' | 'outsourced'>('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [stats, setStats] = useState<{ total: number; normal: number; abnormal: number; critical: number }>({
    total: 0,
    normal: 0,
    abnormal: 0,
    critical: 0,
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Dialog states
  const [selectedTest, setSelectedTest] = useState<CompletedTest | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Hydrate search / date from deep links (?search=…&date=all)
  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const urlSearch = searchParams.get('search');
    const urlDate = searchParams.get('date');
    if (urlSearch) setSearchQuery(urlSearch);
    if (urlDate === 'all') setDateFilter('all');
  }, [searchParams]);

  // Debounce search to prevent firing API calls per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Load completed tests function - memoized to prevent infinite loops
  const loadTests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Anchor Today/Week/Month on the server's calendar, not the client clock.
      const anchor = serverToday
        ? new Date(`${serverToday}T00:00:00`)
        : (() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            return d;
          })();
      const anchorYmd = serverToday || formatLocalYmd(anchor);
      let date: string | undefined;
      let start_date: string | undefined;
      let end_date: string | undefined;

      const searching = Boolean(debouncedSearchQuery.trim());
      const allTime = dateFilter === 'all' || searching;

      if (!allTime && (dateRange.from || dateRange.to)) {
        start_date = dateRange.from || undefined;
        end_date = dateRange.to || undefined;
      } else if (!allTime && dateFilter === 'today') {
        date = anchorYmd;
      } else if (!allTime && dateFilter === 'week') {
        const weekAgo = new Date(anchor);
        weekAgo.setDate(weekAgo.getDate() - 7);
        start_date = formatLocalYmd(weekAgo);
        end_date = anchorYmd;
      } else if (!allTime && dateFilter === 'month') {
        const monthAgo = new Date(anchor);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        start_date = formatLocalYmd(monthAgo);
        end_date = anchorYmd;
      }

      const baseParams = {
        search: debouncedSearchQuery || undefined,
        overall_status: statusFilter !== 'all' ? statusFilter : undefined,
        clinic: clinicFilter !== 'all' ? clinicFilter : undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
        processing_method: processingFilter !== 'all' ? processingFilter : undefined,
        date,
        start_date,
        end_date,
      } as const;

      const [listResult, statsResult] = await Promise.all([
        labService.getVerifiedResults({
          ...baseParams,
          page: currentPage,
          page_size: itemsPerPage,
        }),
        labService.getVerificationStats({
          status: 'verified',
          overall_status: statusFilter !== 'all' ? statusFilter : undefined,
          clinic: clinicFilter !== 'all' ? clinicFilter : undefined,
          gender: genderFilter !== 'all' ? genderFilter : undefined,
          search: debouncedSearchQuery || undefined,
          processing_method: processingFilter !== 'all' ? processingFilter : undefined,
          date,
          start_date,
          end_date,
        }),
      ]);

      setTotalCount(listResult.count || (listResult.results || []).length);
      setStats({
        total: statsResult.total || 0,
        normal: statsResult.normal || 0,
        abnormal: statsResult.abnormal || 0,
        critical: statsResult.critical || 0,
      });

      // Transform API data to frontend format (shared with consultation room lab viewer)
      const transformed = (listResult.results || []).map((row: any) =>
        transformApiRowToCompletedTest(row, 'verification')
      );
      setTests(transformed);
    } catch (err: any) {
      setError(err.message || 'Failed to load completed tests');
      console.error('Error loading completed tests:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchQuery, statusFilter, clinicFilter, genderFilter, processingFilter, dateFilter, dateRange.from, dateRange.to, serverToday]);

  // Load completed tests from API when page changes
  useEffect(() => {
    loadTests();
  }, [loadTests]);

  // Server-side filtered list (already matches current filters)
  const paginatedTests = tests;

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, statusFilter, clinicFilter, dateFilter, genderFilter, processingFilter, itemsPerPage, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  const getOverallStatusBadge = (status: string) => {
    switch (status) {
      case 'Critical': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Abnormal': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      default: return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'STAT': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Urgent': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
    }
  };

  const formatDateTime = (isoString: string) => ({
    date: formatDisplayDateMedium(isoString),
    time: formatDisplayTime(isoString),
  });

  const openViewDialog = (test: CompletedTest) => {
    setSelectedTest(test);
    setIsViewDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            Completed Tests
          </h1>
          <p className="text-muted-foreground mt-1">History of verified and completed lab tests</p>
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
                <FlaskConical className="h-8 w-8 text-blue-400" />
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
                <Input
                  placeholder="Patient, MRN, order ID, Lab ID (e.g. BT-26-0007), test…"
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="abnormal">Abnormal</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={clinicFilter} onValueChange={setClinicFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Clinic" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clinics</SelectItem>
                    {opdClinicNames.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
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
                <Select
                  value={processingFilter}
                  onValueChange={(v) => setProcessingFilter(v as 'all' | 'in_house' | 'outsourced')}
                >
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Processing" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All processing</SelectItem>
                    <SelectItem value="in_house">In-house</SelectItem>
                    <SelectItem value="outsourced">Outsourced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom verified date range to narrow down completed laboratory tests."
          label="Verified Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {/* Tests List */}
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading completed tests...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" className="mt-4" onClick={loadTests}>Retry</Button>
              </CardContent>
            </Card>
          ) : totalCount === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No completed tests found</CardContent></Card>
          ) : (
            paginatedTests.map(test => {
              const completed = formatDateTime(test.completedAt);
              return (
                <Card key={test.id} className={`border-l-4 hover:shadow-md transition-shadow ${
                  test.overallStatus === 'Critical' ? 'border-l-rose-500' :
                  test.overallStatus === 'Abnormal' ? 'border-l-amber-500' : 'border-l-emerald-500'
                }`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        test.overallStatus === 'Critical' ? 'bg-rose-100 dark:bg-rose-900/30' :
                        test.overallStatus === 'Abnormal' ? 'bg-amber-100 dark:bg-amber-900/30' :
                        'bg-emerald-100 dark:bg-emerald-900/30'
                      }`}>
                        <PatientAvatar name={test.patient.name} photoUrl={(test.patient as any).photoUrl || (test.patient as any).photo} size="sm" />
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + Badges + Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{test.patient.name}</span>
                             <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getOverallStatusBadge(test.overallStatus)}`}>
                               {test.overallStatus === 'Critical' && <AlertTriangle className="h-2 w-2 mr-0.5" />}{test.overallStatus}
                             </Badge>
                             <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{test.testCode}</Badge>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(test)}>
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          </div>
                        </div>
                        
                         {/* Row 2: Details */}
                         <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                           <span>
                             {test.patient.age !== null && test.patient.age !== undefined ? `${test.patient.age}y` : ''}
                             {test.patient.age !== null && test.patient.age !== undefined ? ' ' : ''}
                             {formatPatientGenderLabel(test.patient.gender) ||
                               (test.patient.gender ? String(test.patient.gender) : '')}
                           </span>
                           <span>•</span>
                           <span>{test.orderId}</span>
                           <span>•</span>
                           <span>{test.testName}</span>
                           <span>•</span>
                            <span>{test.clinic}</span>
                            {test.location_clinic_name && (<><span>•</span><span>{test.location_clinic_name}</span></>)}
                            <span>•</span>
                            <span>{completed.date} {completed.time}</span>
                           <span>•</span>
                           <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{test.turnaroundTime}</span>
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
              itemName="tests"
            />
          </Card>
        )}

        <LabCompletedReportDialog
          open={isViewDialogOpen}
          onOpenChange={(o) => {
            setIsViewDialogOpen(o);
            if (!o) setSelectedTest(null);
          }}
          test={selectedTest}
        />
      </div>
    </DashboardLayout>
  );
}
