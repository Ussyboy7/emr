"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { labService } from '@/lib/services';
import { PatientAvatar } from "@/components/PatientAvatar";
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/CustomDateRangeButton';
import { LabCompletedReportDialog } from '@/components/laboratory/LabCompletedReportDialog';
import {
  transformApiRowToCompletedTest,
  type CompletedTest,
} from '@/lib/laboratory/completedLabReport';

import {
  CheckCircle2, Search, Eye, Clock, AlertTriangle, Calendar,
  User, Stethoscope, RefreshCw, FlaskConical, Loader2
} from 'lucide-react';
import { CLINICS } from '@/lib/constants/clinics';

export default function CompletedTestsPage() {
  const [tests, setTests] = useState<CompletedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [clinicFilter, setClinicFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yyyyMmDd = (d: Date) => d.toISOString().split('T')[0];
      let date: string | undefined;
      let start_date: string | undefined;
      let end_date: string | undefined;

      if (dateRange.from || dateRange.to) {
        start_date = dateRange.from || undefined;
        end_date = dateRange.to || undefined;
      } else if (dateFilter === 'today') {
        date = yyyyMmDd(today);
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        start_date = yyyyMmDd(weekAgo);
        end_date = yyyyMmDd(today);
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        start_date = yyyyMmDd(monthAgo);
        end_date = yyyyMmDd(today);
      }

      const baseParams = {
        search: debouncedSearchQuery || undefined,
        overall_status: statusFilter !== 'all' ? statusFilter : undefined,
        clinic: clinicFilter !== 'all' ? clinicFilter : undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
        date,
        start_date,
        end_date,
      } as const;

      // Primary data source: verification history endpoint (LabResultViewSet).
      // Some deployments don't expose it; if it 404s we fall back to /laboratory/tests/?status=verified
      // to keep the Completed Tests page working.
      let listMode: 'verification' | 'tests' = 'verification';
      let listResult:
        | { results: any[]; count: number }
        | { results: any[]; count: number; next?: string; previous?: string };

      try {
        listResult = await labService.getVerifiedResults({
          ...baseParams,
          page: currentPage,
          page_size: itemsPerPage,
        });
      } catch (e: any) {
        if (typeof e?.status === 'number' && e.status === 404) {
          listMode = 'tests';
          listResult = await labService.getCompletedTests({
            page: currentPage,
            page_size: itemsPerPage,
            status: 'verified',
          });
        } else {
          throw e;
        }
      }

      setTotalCount(listResult.count || (listResult.results || []).length);

      // Stats: avoid calling a dedicated stats endpoint because some deployments don't expose it,
      // and apiFetch logs 404s to console even if caught. Instead, derive counts via lightweight
      // filtered requests (page_size=1) to read `count`.
      if (listMode === 'verification') {
        try {
          // If user picked a specific status, don't do 3 extra count calls.
          if (statusFilter !== 'all') {
            setStats({
              total: listResult.count || 0,
              normal: statusFilter === 'normal' ? (listResult.count || 0) : 0,
              abnormal: statusFilter === 'abnormal' ? (listResult.count || 0) : 0,
              critical: statusFilter === 'critical' ? (listResult.count || 0) : 0,
            });
          } else {
            const [normalRes, abnormalRes, criticalRes] = await Promise.all([
              labService.getVerifiedResults({ ...baseParams, overall_status: 'normal', page: 1, page_size: 1 }),
              labService.getVerifiedResults({ ...baseParams, overall_status: 'abnormal', page: 1, page_size: 1 }),
              labService.getVerifiedResults({ ...baseParams, overall_status: 'critical', page: 1, page_size: 1 }),
            ]);

            const normal = normalRes.count || 0;
            const abnormal = abnormalRes.count || 0;
            const critical = criticalRes.count || 0;
            setStats({
              total: (normal + abnormal + critical),
              normal,
              abnormal,
              critical,
            });
          }
        } catch {
          setStats({ total: listResult.count || 0, normal: 0, abnormal: 0, critical: 0 });
        }
      } else {
        // Fallback mode: we only know accurate total (count). Breakdown is best-effort from current page.
        const pageStats = (listResult.results || []).reduce(
          (acc: { total: number; normal: number; abnormal: number; critical: number }, test: any) => {
            const overall = String(test?.overall_status || '').toLowerCase();
            if (overall === 'abnormal') acc.abnormal += 1;
            else if (overall === 'critical') acc.critical += 1;
            else acc.normal += 1;
            return acc;
          },
          { total: listResult.count || 0, normal: 0, abnormal: 0, critical: 0 }
        );
        setStats(pageStats);
      }

      // Transform API data to frontend format (shared with consultation room lab viewer)
      const transformed = (listResult.results || []).map((row: any) =>
        transformApiRowToCompletedTest(row, listMode)
      );
      setTests(transformed);
    } catch (err: any) {
      setError(err.message || 'Failed to load completed tests');
      console.error('Error loading completed tests:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchQuery, statusFilter, clinicFilter, genderFilter, dateFilter, dateRange.from, dateRange.to]);

  // Load completed tests from API when page changes
  useEffect(() => {
    loadTests();
  }, [loadTests]);

  // Server-side filtered list (already matches current filters)
  const paginatedTests = tests;

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, statusFilter, clinicFilter, dateFilter, genderFilter, itemsPerPage, dateRange.from, dateRange.to]);

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

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const openViewDialog = (test: CompletedTest) => {
    setSelectedTest(test);
    setIsViewDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              Completed Tests
            </h1>
            <p className="text-muted-foreground mt-1">History of verified and completed lab tests</p>
          </div>
          <Button variant="outline" onClick={loadTests} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
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
                <Input placeholder="Search by patient, order ID, or test..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
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
                    {CLINICS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                          <span>{test.patient.age !== null && test.patient.age !== undefined ? `${test.patient.age}y` : ''} {test.patient.gender}</span>
                          <span>•</span>
                          <span>{test.orderId}</span>
                          <span>•</span>
                          <span>{test.testName}</span>
                          <span>•</span>
                          <span>{test.clinic}</span>
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
