"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { labService, type LabTest as ApiLabTest } from '@/lib/services';
import { transformPriority } from '@/lib/services/transformers';
import { PatientAvatar } from "@/components/PatientAvatar";
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';

// Import test templates from orders page
const testTemplates: Record<string, { name: string; fields: { name: string; unit: string; normalRange: string; }[] }> = {
  LFT: {
    name: 'Liver Function Test',
    fields: [
      { name: 'ALT', unit: 'U/L', normalRange: '7-56' },
      { name: 'AST', unit: 'U/L', normalRange: '10-40' },
      { name: 'ALP', unit: 'U/L', normalRange: '44-147' },
      { name: 'Bilirubin (Total)', unit: 'mg/dL', normalRange: '0.1-1.2' },
      { name: 'Albumin', unit: 'g/dL', normalRange: '3.5-5.0' },
    ]
  },
  FBS: {
    name: 'Fasting Blood Sugar',
    fields: [
      { name: 'Glucose', unit: 'mg/dL', normalRange: '70-140' },
    ]
  },
  '24HR_PROTEIN': {
    name: '24 Hour Urinary Protein',
    fields: [
      { name: 'Result', unit: 'mg/day', normalRange: '<150' },
    ]
  },
};
import {
  CheckCircle2, Search, Eye, Clock, AlertTriangle, Calendar,
  User, FileText, Stethoscope, RefreshCw, Download, Printer, FlaskConical, Loader2
} from 'lucide-react';
import { CLINICS } from '@/lib/constants/clinics';

interface TestResult {
  parameter: string;
  value: string;
  unit: string;
  normalRange: string;
  status: 'Normal' | 'Abnormal' | 'Critical';
}

interface CompletedTest {
  id: string;
  orderId: string;
  patient: { id: string; name: string; age: number | null; gender: string; };
  doctor: { id: string; name: string; specialty: string; };
  testName: string;
  testCode: string;
  results: TestResult[];
  result_file?: string;
  overallStatus: 'Normal' | 'Abnormal' | 'Critical';
  priority: 'Routine' | 'Urgent' | 'STAT';
  orderedAt: string;
  completedAt: string;
  verifiedBy: string;
  verifiedAt: string;
  submittedBy: string;
  clinic: string;
  turnaroundTime: string;
}

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

      // Transform API data to frontend format
      const transformed = await Promise.all((listResult.results || []).map(async (row: any) => {
        const test: any = listMode === 'verification' ? (row.test_details || row.test || {}) : row;
        // Extract patient data from test.order_details (added to LabTestSerializer)
        // The order_details field includes patient_details, doctor_details, order_id, etc.
        const orderDetails = test.order_details || {};
        
        // Extract patient data directly from API response - no fallbacks
        const patientDetails = orderDetails.patient_details;
        const patientName = patientDetails?.name || orderDetails.patient_name || '';
        const patientId = patientDetails?.patient_id?.toString() || '';
        const age = patientDetails?.age || null;
        const gender = patientDetails?.gender || '';
        
        const orderId = orderDetails.order_id || '';
        
        // Extract doctor data directly from API response - no fallbacks
        const doctorDetails = orderDetails.doctor_details;
        const doctorName = doctorDetails?.name || orderDetails.doctor_name || '';
        const doctorSpecialty = doctorDetails?.specialty || '';
        
        // Extract clinic and other order data
        const clinic = orderDetails.clinic || '';
        
        // Calculate turnaround time
        const orderedAt = test.collected_at || (test.lab_order?.order_date) || new Date().toISOString();
        const completedAt = test.processed_at || (test.verified_at) || new Date().toISOString();
        const turnaroundMs = new Date(completedAt).getTime() - new Date(orderedAt).getTime();
        const turnaroundHours = Math.floor(turnaroundMs / 3600000);
        const turnaroundMins = Math.floor((turnaroundMs % 3600000) / 60000);
        const turnaroundTime = turnaroundHours > 0 ? `${turnaroundHours}h ${turnaroundMins}m` : `${turnaroundMins}m`;
        
        // Process results first to determine individual statuses

        // Process result_file URL if it exists
        const resultFileUrl = test.result_file ? (
          test.result_file.startsWith('http') ? test.result_file :
          `${window.location.origin}${test.result_file}`
        ) : null;

        const resolveTemplateMeta = (parameterName: string) => {
          const normalRangeObj: Record<string, any> | undefined =
            (test as any)?.template_normal_range || (test as any)?.template?.normal_range;
          if (!normalRangeObj || typeof normalRangeObj !== 'object') return null;
          const wanted = String(parameterName || '').trim().toLowerCase();
          if (!wanted) return null;
          for (const [k, v] of Object.entries(normalRangeObj)) {
            if (String(k).trim().toLowerCase() === wanted) return { key: k, meta: v as any };
          }
          return null;
        };

        const formatTemplateRange = (meta: any) => {
          if (!meta) return '';
          if (typeof meta.range === 'string' && meta.range.trim()) return meta.range.trim();
          const min = meta.min ?? meta.normalRangeMin;
          const max = meta.max ?? meta.normalRangeMax;
          if (min !== undefined && max !== undefined && String(min).trim() && String(max).trim()) {
            return `${min}-${max}`;
          }
          return '';
        };

        const processedResults = Object.entries(test.results || {}).map(([key, value]) => {
          const valueStr = String(value);
          const valueNum = parseFloat(valueStr);

          // No hardcoded fallbacks: unit/range comes from template metadata only.
          let unit = '';
          let normalRange = '';
          let status: 'Normal' | 'Abnormal' | 'Critical' = 'Normal';

          // Prefer template-defined unit/range (source of truth).
          const templateMatch = resolveTemplateMeta(key);
          if (templateMatch) {
            unit = String((templateMatch.meta?.unit ?? '') || '');
            normalRange = formatTemplateRange(templateMatch.meta);

            const minRaw = templateMatch.meta?.min ?? templateMatch.meta?.normalRangeMin;
            const maxRaw = templateMatch.meta?.max ?? templateMatch.meta?.normalRangeMax;
            const min = minRaw !== undefined && String(minRaw).trim() !== '' ? Number(minRaw) : undefined;
            const max = maxRaw !== undefined && String(maxRaw).trim() !== '' ? Number(maxRaw) : undefined;
            if (!isNaN(valueNum) && valueStr.trim() !== '' && (min !== undefined || max !== undefined)) {
              if (min !== undefined && !isNaN(min) && valueNum < min) status = 'Abnormal';
              if (max !== undefined && !isNaN(max) && valueNum > max) status = 'Abnormal';
            }
          }

          // Hardcoded validation logic disabled (template metadata is source of truth).
          if (false && !templateMatch && !isNaN(valueNum) && valueStr.trim() !== '') {
            // Liver Function Test validations
            if (test.code === 'LFT') {
              if (key.toLowerCase().includes('alt') || key.toLowerCase().includes('sgpt')) {
                unit = 'U/L';
                normalRange = '7-56';
                if (valueNum > 1000) status = 'Critical';
                else if (valueNum < 7 || valueNum > 56) status = 'Abnormal';
                else status = 'Normal';
              } else if (key.toLowerCase().includes('ast') || key.toLowerCase().includes('sgot')) {
                unit = 'U/L';
                normalRange = '10-40';
                if (valueNum > 1000) status = 'Critical';
                else if (valueNum < 10 || valueNum > 40) status = 'Abnormal';
                else status = 'Normal';
              } else if (key.toLowerCase().includes('alp') || key.toLowerCase().includes('alkaline phosphatase')) {
                unit = 'U/L';
                normalRange = '44-147';
                if (valueNum > 1000) status = 'Critical';
                else if (valueNum < 44 || valueNum > 147) status = 'Abnormal';
                else status = 'Normal';
              } else if (key.toLowerCase().includes('albumin')) {
                unit = 'g/dL';
                normalRange = '3.5-5.0';
                if (valueNum < 2.0 || valueNum > 6.0) status = 'Critical';
                else if (valueNum < 3.5 || valueNum > 5.0) status = 'Abnormal';
                else status = 'Normal';
              } else if (key.toLowerCase().includes('bilirubin') && key.toLowerCase().includes('total')) {
                unit = 'mg/dL';
                normalRange = '0.1-1.2';
                if (valueNum > 5.0) status = 'Critical';
                else if (valueNum > 1.2) status = 'Abnormal';
                else status = 'Normal';
              }
            }
            // Fasting Blood Sugar validations
            else if (test.code === 'FBS') {
              if (key.toLowerCase().includes('glucose')) {
                unit = 'mg/dL';
                normalRange = '70-140';
                if (valueNum < 40 || valueNum > 600) status = 'Critical';
                else if (valueNum < 70 || valueNum > 140) status = 'Abnormal';
                else status = 'Normal';
              }
            }
            // 24 Hour Protein validations
            else if (test.code === '24HR_PROTEIN') {
              if (key.toLowerCase() === 'result') {
                unit = 'mg/day';
                normalRange = '<150';
                if (!isNaN(valueNum)) {
                  if (valueNum > 1000) status = 'Critical';
                  else if (valueNum > 300) status = 'Abnormal';
                  else status = 'Normal';
                }
              }
            }
          }

          return {
            parameter: key,
            value: valueStr,
            unit,
            normalRange,
            status,
          };
        });

        // Determine overall status from API first, then from results if not provided
        let overallStatus: 'Normal' | 'Abnormal' | 'Critical' = 'Normal';
        if (test.overall_status) {
          const statusMap: Record<string, 'Normal' | 'Abnormal' | 'Critical'> = {
            'normal': 'Normal',
            'abnormal': 'Abnormal',
            'critical': 'Critical',
          };
          overallStatus = statusMap[test.overall_status.toLowerCase()] || 'Normal';
        } else {
          // Determine from individual results
          // Note: this page derives per-parameter status from template min/max only,
          // which currently supports "Normal" and "Abnormal". "Critical" is sourced
          // from the backend overall_status when available.
          if (processedResults.some(r => r.status === 'Abnormal')) overallStatus = 'Abnormal';
          else overallStatus = 'Normal';
        }
        
        // Determine priority - use transformPriority for consistency
        const priority = transformPriority(test.lab_order?.priority || test.priority || 'routine') as 'Routine' | 'Urgent' | 'STAT';
        
        return {
          id: test.id.toString(),
          orderId,
          patient: { 
            id: patientId, 
            name: patientName, 
            age: age ?? null, 
            gender: gender 
          },
          doctor: { 
            id: (test.lab_order?.doctor?.id)?.toString() || '', 
            name: doctorName, 
            specialty: doctorSpecialty 
          },
          testName: test.name,
          testCode: test.code,
          results: processedResults,
          overallStatus,
          priority,
          orderedAt,
          completedAt,
          verifiedBy: test.verified_by_name || test.verified_by || '',
          verifiedAt: test.verified_at || new Date().toISOString(),
          submittedBy: test.processed_by_name || test.processed_by || '',
          clinic,
          turnaroundTime,
          result_file: resultFileUrl,
        };
      }));
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

  const getResultStatusColor = (status: string) => {
    switch (status) {
      case 'Critical': return 'text-rose-600 dark:text-rose-400 font-bold';
      case 'Abnormal': return 'text-amber-600 dark:text-amber-400 font-medium';
      default: return 'text-foreground';
    }
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const handlePrint = (test: CompletedTest) => {
    toast.info(`Printing result for ${test.patient.name}...`);
  };

  const handleDownload = (test: CompletedTest) => {
    toast.success(`Downloaded result for ${test.patient.name}`);
  };

  const openViewDialog = (test: CompletedTest) => { setSelectedTest(test); setIsViewDialogOpen(true); };

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
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by patient, order ID, or test..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                <Button variant="outline" onClick={() => setIsDateFilterDialogOpen(true)} className="mt-2">
                  Filters
                </Button>
              </div>
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

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-500" />Lab Report</DialogTitle>
              <DialogDescription>{selectedTest?.testName} - {selectedTest?.patient.name}</DialogDescription>
            </DialogHeader>
            {selectedTest && (
              <div className="space-y-6 py-4">
                {/* Header */}
                <div className="text-center p-4 border-b">
                  <h2 className="text-xl font-bold">LABORATORY REPORT</h2>
                  <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
                </div>

                {/* Patient & Test Info */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient Name</p>
                    <p className="font-medium">{selectedTest.patient.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Age / Gender</p>
                    <p className="font-medium">{selectedTest.patient.age !== null && selectedTest.patient.age !== undefined ? `${selectedTest.patient.age} years` : ''} / {selectedTest.patient.gender}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ordering Doctor</p>
                    <p className="font-medium">{selectedTest.doctor.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Order ID</p>
                    <p className="font-medium">{selectedTest.orderId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Test Name</p>
                    <p className="font-medium">{selectedTest.testName} ({selectedTest.testCode})</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Clinic</p>
                    <p className="font-medium">{selectedTest.clinic}</p>
                  </div>
                </div>

                {/* Results */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-amber-500" />
                    Test Results
                    {/* Only show status badge when there are parsed results */}
                    {selectedTest.results.length > 0 && (
                      <Badge variant="outline" className={getOverallStatusBadge(selectedTest.overallStatus)}>{selectedTest.overallStatus}</Badge>
                    )}
                  </h3>

                  {selectedTest.results.length > 0 ? (
                    // Show parsed results with table
                    <>
                      {/* Result File Info - Only show when there are also parsed results */}
                      {selectedTest.result_file && (
                        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Additional Result File Available</span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  window.open(selectedTest.result_file, '_blank');
                                }}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (selectedTest.result_file) {
                                    const link = document.createElement('a');
                                    link.href = selectedTest.result_file;
                                    link.download = `lab_result_${selectedTest.id}.pdf`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }
                                }}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-medium">Parameter</th>
                            <th className="text-left p-3 font-medium">Result</th>
                            <th className="text-left p-3 font-medium">Unit</th>
                            <th className="text-left p-3 font-medium">Normal Range</th>
                            <th className="text-left p-3 font-medium">Status</th>
                          </tr></thead>
                          <tbody>
                            {selectedTest.results.map(r => (
                              <tr key={r.parameter} className="border-b">
                                <td className="p-3 font-medium">{r.parameter}</td>
                                <td className={`p-3 ${getResultStatusColor(r.status)}`}>{r.value || 'Pending'}</td>
                                <td className="p-3 text-muted-foreground">{r.unit}</td>
                                <td className="p-3 text-muted-foreground">{r.normalRange}</td>
                                <td className="p-3">
                                  {r.status === 'Normal' ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  ) : (
                                    <AlertTriangle className={`h-4 w-4 ${r.status === 'Critical' ? 'text-rose-500' : 'text-amber-500'}`} />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : selectedTest.result_file ? (
                    // Show uploaded file as clean simple display when no parsed results
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="flex items-center gap-3 mb-2">
                          <FileText className="h-5 w-5 text-blue-600" />
                          <span className="font-medium text-blue-800 dark:text-blue-200">Result file available</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                          Results are provided as a PDF document
                        </p>
                        <Button
                          onClick={() => {
                            window.open(selectedTest.result_file, '_blank');
                          }}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          View PDF
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // No results at all
                    <div className="p-8 text-center border rounded-lg">
                      <div className="flex flex-col items-center gap-3">
                        <FlaskConical className="h-8 w-8 text-amber-500" />
                        <div>
                          <p className="font-medium text-amber-800 dark:text-amber-200">No Results Available</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Test results have not been entered or uploaded yet.
                          </p>
                          <div className="flex gap-2 mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Navigate to orders page to re-enter results
                                window.location.href = `/laboratory/orders?test=${selectedTest.id}`;
                              }}
                            >
                              Re-enter Results
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                toast.info('Please contact laboratory staff to resolve this issue.');
                              }}
                            >
                              Report Issue
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Ordered</p>
                    <p className="font-medium">{formatDateTime(selectedTest.orderedAt).date} {formatDateTime(selectedTest.orderedAt).time}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="font-medium">{formatDateTime(selectedTest.completedAt).date} {formatDateTime(selectedTest.completedAt).time}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Verified</p>
                    <p className="font-medium">{formatDateTime(selectedTest.verifiedAt).date} {formatDateTime(selectedTest.verifiedAt).time}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Turnaround Time</p>
                    <p className="font-medium">{selectedTest.turnaroundTime}</p>
                  </div>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">Performed By</p>
                    <p className="font-medium">{selectedTest.submittedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Verified By</p>
                    <p className="font-medium">{selectedTest.verifiedBy}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              <Button variant="outline" onClick={() => selectedTest && handlePrint(selectedTest)}>
                <Printer className="h-4 w-4 mr-2" />Print
              </Button>
              <Button onClick={() => selectedTest && handleDownload(selectedTest)}>
                <Download className="h-4 w-4 mr-2" />Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
