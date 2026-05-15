"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { labService, type LabResult as ApiLabResult } from '@/lib/services';
import { apiFetch } from '@/lib/api-client';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { transformPriority, transformToBackendPriority } from '@/lib/services/transformers';
import { buildDateQuery, formatRejectionReason, LAB_TEST_STATUS } from '@/lib/laboratory/constants';
import { useServerToday } from '@/hooks/use-server-today';
import { useLabUrlSync } from '@/hooks/use-lab-url-sync';
import {
  isValidLabVerificationTab,
  LAB_VERIFICATION_TAB_LABELS,
  type LabVerificationTab,
} from '@/lib/laboratory/lab-workflow-search';
import {
  buildOrderedLabResultViewRows,
  deriveOverallStatus,
  type ResultStatus,
} from '@/lib/laboratory/template-utils';
import {
  downloadOfficialLabReportPdf,
  resolveLabResultFileUrl,
} from '@/lib/laboratory/completedLabReport';
import {
  ShieldCheck, Search, Eye, Clock, CheckCircle2, AlertTriangle, XCircle,
  Loader2, User, Calendar, FileText, Stethoscope, RefreshCw, Send, Download
} from 'lucide-react';

function formatLabDateTime(isoString: string | undefined): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const datePart = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const timePart = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${datePart}, ${timePart}`;
  } catch {
    return '';
  }
}

interface TestResult {
  parameter: string;
  value: string;
  unit: string;
  normalRange: string;
  status: 'Normal' | 'Abnormal' | 'Critical';
  attachment?: {
    url: string;
    name: string;
  } | null;
}

interface LabResult {
  id: string;
  testId: string; // Store test ID for API operations
  orderId: string;
  patient: { id: string; name: string; age: number; gender: string; };
  doctor: { id: string; name: string; specialty: string; };
  testName: string;
  testCode: string;
  results: TestResult[];
  resultFile?: string; // PDF file URL
  resultFileExists?: boolean;
  overallStatus: 'Normal' | 'Abnormal' | 'Critical';
  priority: 'Routine' | 'Urgent' | 'STAT';
  status: 'Results Ready' | 'Verified' | 'Completed';
  submittedBy: string;
  submittedAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
  clinic: string;
  clinicalNotes?: string;
  processing_method?: 'in_house' | 'outsourced';
  outsourced_lab?: string;
}

// Transform backend LabResult to frontend format
const transformResult = (
  apiResult: ApiLabResult,
  templateNormalRangesByCode?: Record<string, any>
): LabResult => {
  // Prioritize test_details over test (test might just be an ID)
  const test = (apiResult as any).test_details || apiResult.test;
  const results: TestResult[] = [];

  // Get test details early to avoid temporal dead zone
  const testDetails = (apiResult as any).test_details || (test && typeof test === 'object' ? test : null);
  const testName = testDetails?.name || test?.name || '';

  const testCodeForTemplate = (testDetails as any)?.code || (test as any)?.code || '';
  const normalRangeObj: Record<string, any> | undefined =
    (testDetails as any)?.template_normal_range ||
    (testDetails as any)?.template?.normal_range ||
    (testCodeForTemplate ? templateNormalRangesByCode?.[testCodeForTemplate] : undefined);

  const toAbsoluteResultFileUrl = (url: string): string => {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const apiRoot = process.env.NEXT_PUBLIC_API_URL || '';
    const mediaBase = apiRoot.endsWith('/api') ? apiRoot.slice(0, -4) : apiRoot.endsWith('/api/v1') ? apiRoot.slice(0, -7) : apiRoot;
    if (url.startsWith('/media/')) return `${mediaBase}${url}`;
    return `${mediaBase}/media/${url.replace(/^\/+/, '')}`;
  };
  const displayNameFromResultFileUrl = (url: string): string => {
    try {
      return decodeURIComponent(url.split('?')[0].split('/').filter(Boolean).pop() || 'Result file');
    } catch {
      return 'Result file';
    }
  };

  // Transform results from JSON format to TestResult array
  let resultsObj: Record<string, any> | null = null;

  if (test && typeof test === 'object' && !Array.isArray(test)) {
    if (test.results && typeof test.results === 'object' && !Array.isArray(test.results)) {
      resultsObj = test.results;
    }
  }

  if (!resultsObj && (apiResult as any).test_details) {
    const td = (apiResult as any).test_details;
    if (td.results && typeof td.results === 'object' && !Array.isArray(td.results)) {
      resultsObj = td.results;
    }
  }

  if (!resultsObj && (apiResult as any).results && typeof (apiResult as any).results === 'object') {
    resultsObj = (apiResult as any).results;
  }

  if (resultsObj && Object.keys(resultsObj).length > 0) {
    const built = buildOrderedLabResultViewRows(resultsObj, normalRangeObj, {
      resultAttachments: (testDetails as any)?.result_attachments || (test as any)?.result_attachments,
      resolveFileUrl: toAbsoluteResultFileUrl,
      attachmentDisplayName: displayNameFromResultFileUrl,
    });
    results.push(...built);
  }

  // Determine overall status from individual results or use API value
  let overallStatus: ResultStatus = 'Normal';
  if (apiResult.overall_status) {
    const statusMap: Record<string, ResultStatus> = {
      normal: 'Normal',
      abnormal: 'Abnormal',
      critical: 'Critical',
    };
    overallStatus = statusMap[apiResult.overall_status] || deriveOverallStatus(results);
  } else if (results.length > 0) {
    overallStatus = deriveOverallStatus(results);
  }

  const order = (apiResult as any).order || (test as any).order;
  const patient = apiResult.patient || order?.patient || {};

  // Get test details - handle case where test might be just an ID
  const testId = typeof test === 'number' ? test.toString() : (testDetails?.id?.toString() || test?.id?.toString() || apiResult.id.toString());
  const testCode = testDetails?.code || test?.code || '';

  // Extract result file URL if available
  let resultFileUrl: string | undefined = undefined;
  const resultFileExists = (testDetails as any)?.result_file_exists !== false;
  if (testDetails?.result_file) {
    const fileField = testDetails.result_file;
    if (typeof fileField === 'string') {
      resultFileUrl = resolveLabResultFileUrl(fileField) || undefined;
    } else if (fileField) {
      const raw = fileField.url || fileField.name || undefined;
      resultFileUrl = raw ? resolveLabResultFileUrl(raw) || undefined : undefined;
    }
  }

  return {
    id: apiResult.id.toString(),
    testId: testId, // Store test ID for API operations
    orderId: order?.lab_number || (apiResult as any).order_id || order?.order_id || '',
    patient: {
      id: (patient as any)?.id?.toString() || '',
      name: (apiResult as any).patient_name ?? (patient as any)?.name ?? '',
      age: (patient as any)?.age || 0,
      gender: (patient as any)?.gender || 'Unknown',
    },
    doctor: {
      id: order?.doctor?.id?.toString() || '',
      name: order?.doctor_name || order?.doctor?.name || '',
      specialty: order?.doctor?.specialty || '',
    },
    testName: testName,
    testCode: testCode,
    results,
    resultFile: resultFileUrl,
    resultFileExists,
    overallStatus,
    priority: transformPriority(apiResult.priority || order?.priority || 'routine') as 'Routine' | 'Urgent' | 'STAT',
    status: (() => {
      const rawStatus = String(testDetails?.status || (test as any)?.status || '').toLowerCase();
      if (rawStatus === 'verified') return LAB_TEST_STATUS.VERIFIED;
      if (rawStatus === 'completed') return 'Completed';
      return LAB_TEST_STATUS.RESULTS_READY;
    })(),
    submittedBy: testDetails?.processed_by_name || testDetails?.processed_by || test?.processed_by_name || test?.processed_by || 'Lab Tech',
    submittedAt: testDetails?.processed_at || testDetails?.created_at || test?.processed_at || test?.created_at || new Date().toISOString(),
    clinic: order?.clinic || '',
    clinicalNotes: (() => {
      // Get clinical notes, avoiding duplication
      const notes = order?.clinical_notes || testDetails?.notes || test?.notes || '';
      // If notes contain repeated content, clean it up
      if (notes.includes('; ')) {
        const parts = notes.split('; ')
          .map((part: string) => part.trim()) // Trim whitespace
          .filter((part: string) => part.length > 0) // Remove empty parts
          .filter((part: string, index: number, arr: string[]) => arr.indexOf(part) === index); // Remove duplicates
        return parts.join('; ');
      }
      return notes;
    })(),
    processing_method: testDetails?.processing_method,
    outsourced_lab: testDetails?.outsourced_lab,
  };
};

export default function ResultsVerificationPage() {
  const serverToday = useServerToday();
  const [results, setResults] = useState<LabResult[]>([]);
  const [verifiedResults, setVerifiedResults] = useState<LabResult[]>([]);
  const [templateNormalRangesByCode, setTemplateNormalRangesByCode] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [verifiedLoading, setVerifiedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedError, setVerifiedError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  const [processingFilter, setProcessingFilter] = useState<'all' | 'in_house' | 'outsourced'>('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [verifiedCurrentPage, setVerifiedCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [verifiedTotalCount, setVerifiedTotalCount] = useState(0);
  const [pendingTotalCount, setPendingTotalCount] = useState(0);

  // Tab state
  const [activeTab, setActiveTab] = useState<LabVerificationTab>('pending');
  const autoTabRef = useRef<string | null>(null);

  useLabUrlSync({
    search: searchQuery,
    tab: activeTab,
    defaultTab: 'pending',
    onSearchFromUrl: setSearchQuery,
    onTabFromUrl: (tab) => setActiveTab(tab as LabVerificationTab),
    isValidTab: isValidLabVerificationTab,
  });

  // Dialog states
  const [selectedResult, setSelectedResult] = useState<LabResult | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchVerifyOpen, setIsBatchVerifyOpen] = useState(false);

  // Form states
  const [verificationNotes, setVerificationNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const pendingResults = results.filter(r => r.status === LAB_TEST_STATUS.RESULTS_READY);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Server-side pagination and filters are canonical.
  const paginatedResults = pendingResults;

  // Verified tab: filters applied server-side in loadVerifiedResults
  const verifiedPaginatedResults = verifiedResults;

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, dateFilter, genderFilter, processingFilter, itemsPerPage]);

  // Reset verified page to 1 when filters change or items per page changes
  useEffect(() => {
    setVerifiedCurrentPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, dateFilter, genderFilter, processingFilter, itemsPerPage]);

  const ensureTemplateRangesMap = useCallback(async (): Promise<Record<string, any>> => {
    if (Object.keys(templateNormalRangesByCode).length > 0) return templateNormalRangesByCode;
    try {
      const templatesRes = await labService.getTemplates({ page_size: 500 });
      const map: Record<string, any> = {};
      for (const t of templatesRes.results || []) {
        const code = (t as any)?.code;
        if (code) map[String(code)] = (t as any)?.normal_range || {};
      }
      setTemplateNormalRangesByCode(map);
      return map;
    } catch {
      return {};
    }
  }, [templateNormalRangesByCode]);

  // Load results function - memoized to prevent infinite loops
  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const templatesMap = await ensureTemplateRangesMap();

      const params: any = {
        page: currentPage,
        page_size: itemsPerPage,
      };
      if (statusFilter !== 'all') {
        params.overall_status = statusFilter;
      }
      if (priorityFilter !== 'all') {
        params.priority = transformToBackendPriority(priorityFilter);
      }
      const searching = Boolean(debouncedSearch);
      if (searching) params.search = debouncedSearch;
      if (genderFilter !== 'all') params.gender = genderFilter;
      if (processingFilter !== 'all') params.processing_method = processingFilter;
      if (!searching) {
        Object.assign(params, buildDateQuery(dateFilter, serverToday));
      }

      const response = await labService.getPendingVerifications(params);
      setTotalCount(response.count || response.results.length);
      const transformedResults = response.results.map((r) => transformResult(r, templatesMap));
      setResults(transformedResults);
    } catch (err: any) {
      setError(err.message || 'Failed to load results');
      toast.error('Failed to load verification results. Please try again.');
      console.error('Error loading results:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, statusFilter, priorityFilter, debouncedSearch, genderFilter, processingFilter, dateFilter, serverToday, ensureTemplateRangesMap]);

  const loadVerifiedResults = useCallback(async () => {
    try {
      setVerifiedLoading(true);
      setVerifiedError(null);

      const templatesMap = await ensureTemplateRangesMap();

      const params: any = {
        page: verifiedCurrentPage,
        page_size: itemsPerPage,
        status: 'verified',
      };
      if (statusFilter !== 'all') {
        params.overall_status = statusFilter;
      }
      if (priorityFilter !== 'all') {
        params.priority = transformToBackendPriority(priorityFilter);
      }
      const searching = Boolean(debouncedSearch);
      if (searching) params.search = debouncedSearch;
      if (genderFilter !== 'all') params.gender = genderFilter;
      if (processingFilter !== 'all') params.processing_method = processingFilter;

      if (!searching) {
        Object.assign(params, buildDateQuery(dateFilter, serverToday));
      }

      const response = await labService.getVerifiedResults(params);
      setVerifiedTotalCount(response.count || response.results.length);
      const transformedResults = response.results.map((r) => transformResult(r, templatesMap));
      setVerifiedResults(transformedResults);
    } catch (err: any) {
      setVerifiedError(err.message || 'Failed to load verified results');
      console.error('Error loading verified results:', err);
    } finally {
      setVerifiedLoading(false);
    }
  }, [verifiedCurrentPage, itemsPerPage, statusFilter, priorityFilter, debouncedSearch, dateFilter, serverToday, genderFilter, processingFilter, ensureTemplateRangesMap]);

  const loadVerificationCounts = useCallback(async () => {
    const searching = Boolean(debouncedSearch);
    const base = {
      overall_status: statusFilter !== 'all' ? statusFilter : undefined,
      priority: priorityFilter !== 'all' ? transformToBackendPriority(priorityFilter) : undefined,
      search: searching ? debouncedSearch : undefined,
      gender: genderFilter !== 'all' ? genderFilter : undefined,
      processing_method: processingFilter !== 'all' ? processingFilter : undefined,
      ...(searching ? {} : buildDateQuery(dateFilter, serverToday)),
    } as const;

    const [pendingStats, verifiedStats] = await Promise.all([
      labService.getVerificationStats({ ...base, status: 'results_ready' }),
      labService.getVerificationStats({ ...base, status: 'verified' }),
    ]);

    setPendingTotalCount(pendingStats.total || 0);
    setVerifiedTotalCount(verifiedStats.total || 0);
  }, [statusFilter, priorityFilter, debouncedSearch, dateFilter, serverToday, genderFilter, processingFilter]);

  // Load results from API when page or filters change
  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    loadVerificationCounts();
  }, [loadVerificationCounts]);

  // Load verified results when tab changes or filters change
  useEffect(() => {
    if (activeTab === 'verified') {
      loadVerifiedResults();
    }
  }, [activeTab, loadVerifiedResults]);

  // When searching, switch tab if the current one has no matches but the other does.
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q) {
      autoTabRef.current = null;
      return;
    }
    const pendingEmpty = activeTab === 'pending' && !loading && pendingResults.length === 0 && pendingTotalCount === 0;
    const verifiedEmpty =
      activeTab === 'verified' && !verifiedLoading && verifiedResults.length === 0 && verifiedTotalCount === 0;
    if (!pendingEmpty && !verifiedEmpty) return;

    let next: LabVerificationTab | null = null;
    if (activeTab === 'pending' && verifiedTotalCount > 0) next = 'verified';
    if (activeTab === 'verified' && pendingTotalCount > 0) next = 'pending';
    if (!next || next === activeTab) return;

    const key = `${q}:${next}`;
    if (autoTabRef.current === key) return;
    autoTabRef.current = key;
    setActiveTab(next);
    toast.info(`Found in ${LAB_VERIFICATION_TAB_LABELS[next]} — switched tab.`);
  }, [
    debouncedSearch,
    activeTab,
    loading,
    verifiedLoading,
    pendingResults.length,
    verifiedResults.length,
    pendingTotalCount,
    verifiedTotalCount,
  ]);

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

  const formatTime = (isoString: string) => new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const handleVerify = async () => {
    if (!selectedResult) return;
    setIsSubmitting(true);

    try {
      // Determine overall_status from current status
      const overallStatusMap: Record<string, 'normal' | 'abnormal' | 'critical'> = {
        'Normal': 'normal',
        'Abnormal': 'abnormal',
        'Critical': 'critical',
      };
      
      await labService.verifyResult(
        parseInt(selectedResult.id),
        overallStatusMap[selectedResult.overallStatus] || 'normal',
        'medium', // Default priority, could be enhanced
        verificationNotes
      );

      toast.success(`Result verified for ${selectedResult.patient.name}`);
      
      // Reload results to get updated data
      await loadResults();
      await loadVerificationCounts();
      
      setIsVerifyDialogOpen(false);
      setVerificationNotes('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify result');
      console.error('Error verifying result:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    const canonicalRejectionReason = formatRejectionReason(rejectionReason);
    if (!selectedResult || !canonicalRejectionReason) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setIsSubmitting(true);

    try {
      // Get the test ID from the result
      const testId = parseInt(selectedResult.testId || selectedResult.id);
      if (isNaN(testId)) {
        toast.error('Invalid test ID');
        return;
      }

      await labService.rejectResult(testId, canonicalRejectionReason);
      
      toast.success(`Result rejected and sent back to ${selectedResult.submittedBy}`);
      
      // Reload results to get updated data
      await loadResults();
      await loadVerificationCounts();
      
      setIsRejectDialogOpen(false);
      setRejectionReason('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject result');
      console.error('Error rejecting result:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBatchVerify = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);

    try {
      // Verify each result
      for (const resultId of selectedIds) {
        const result = results.find(r => r.id === resultId);
        if (result) {
          const overallStatusMap: Record<string, 'normal' | 'abnormal' | 'critical'> = {
            'Normal': 'normal',
            'Abnormal': 'abnormal',
            'Critical': 'critical',
          };
          
          await labService.verifyResult(
            parseInt(resultId),
            overallStatusMap[result.overallStatus] || 'normal',
            'medium',
            ''
          );
        }
      }

      toast.success(`${selectedIds.length} results verified`);
      
      // Reload results
      await loadResults();
      await loadVerificationCounts();
      
      setIsBatchVerifyOpen(false);
      setSelectedIds([]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify results');
      console.error('Error batch verifying:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadResult = async (result: LabResult) => {
    try {
      await downloadOfficialLabReportPdf({
        labResultId: result.id,
        patientId: result.patient.id,
        testCode: result.testCode,
        patientName: result.patient.name,
      });
    } catch (error) {
      console.error('Error downloading PDF report:', error);
      toast.error('Failed to download PDF report');
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    const visibleIds = paginatedResults.map(r => r.id);
    const allSelected = visibleIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedIds(prev => {
        const existing = new Set(prev);
        visibleIds.forEach(id => existing.add(id));
        return Array.from(existing);
      });
    }
  };

  const allIdsSelected = paginatedResults.length > 0 && paginatedResults.every(r => selectedIds.includes(r.id));
  const someIdsSelected = selectedIds.length > 0 && !allIdsSelected;

  const openViewDialog = (result: LabResult) => { setSelectedResult(result); setIsViewDialogOpen(true); };
  const openVerifyDialog = (result: LabResult) => { setSelectedResult(result); setVerificationNotes(''); setIsVerifyDialogOpen(true); };
  const openRejectDialog = (result: LabResult) => { setSelectedResult(result); setRejectionReason(''); setIsRejectDialogOpen(true); };
  const isSelectedResultMutable = selectedResult?.status === LAB_TEST_STATUS.RESULTS_READY;
  const canVerifySelectedResult = Boolean(
    selectedResult &&
      ((selectedResult.results?.length || 0) > 0 ||
        (selectedResult.resultFile && selectedResult.resultFileExists !== false))
  );

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-amber-500" />
              Results Verification
            </h1>
            <p className="text-muted-foreground mt-1">Senior Admin / Pathologist - Verify lab results before completion</p>
          </div>
          <Button variant="outline" onClick={loadResults} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>

        {/* Tabs & Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LabVerificationTab)} className="w-full">
                <TabsList>
                  <TabsTrigger value="pending">Pending Review ({pendingTotalCount})</TabsTrigger>
                  <TabsTrigger value="verified">Verified ({verifiedTotalCount})</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
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
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="STAT">STAT</SelectItem>
                      <SelectItem value="Urgent">Urgent</SelectItem>
                      <SelectItem value="Routine">Routine</SelectItem>
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
            </div>
          </CardContent>
        </Card>

        {/* Tab Content */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LabVerificationTab)} className="w-full">
          {/* Pending Review Tab */}
          <TabsContent value="pending" className="space-y-6">

            {/* Batch Actions for Pending */}
            {selectedIds.length > 0 && (
              <Card className="border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <div>
                        <p className="font-semibold text-emerald-900 dark:text-emerald-100">{selectedIds.length} result(s) selected</p>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">Ready for batch verification</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
                      <Button size="sm" onClick={() => setIsBatchVerifyOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                        <CheckCircle2 className="h-4 w-4 mr-2" />Verify All
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pending Results List */}
        {!loading && !error && paginatedResults.length > 0 && (
          <div className="flex items-center gap-2 px-1 py-2 border rounded-lg bg-background">
            <Checkbox
              checked={allIdsSelected}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {allIdsSelected ? `${paginatedResults.length} selected` : someIdsSelected ? `${selectedIds.length} selected` : 'Select All'}
            </span>
          </div>
        )}
        <div className="space-y-3">
          {loading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading results...</p>
            </CardContent></Card>
          ) : error ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" className="mt-4" onClick={loadResults}>Retry</Button>
            </CardContent></Card>
          ) : paginatedResults.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No results pending verification</p>
            </CardContent></Card>
          ) : (
            paginatedResults
              .sort((a, b) => {
                const statusOrder = { Critical: 0, Abnormal: 1, Normal: 2 };
                const priorityOrder = { STAT: 0, Urgent: 1, Routine: 2 };
                if (statusOrder[a.overallStatus] !== statusOrder[b.overallStatus]) {
                  return statusOrder[a.overallStatus] - statusOrder[b.overallStatus];
                }
                return priorityOrder[a.priority] - priorityOrder[b.priority];
              })
              .map(result => (
                <Card key={result.id} className={`border-l-4 hover:shadow-md transition-shadow ${result.overallStatus === 'Critical' ? 'border-l-rose-500' : result.overallStatus === 'Abnormal' ? 'border-l-amber-500' : 'border-l-emerald-500'}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedIds.includes(result.id)}
                        onCheckedChange={() => toggleSelection(result.id)}
                      />
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        result.overallStatus === 'Critical' ? 'bg-rose-100 dark:bg-rose-900/30' :
                        result.overallStatus === 'Abnormal' ? 'bg-amber-100 dark:bg-amber-900/30' :
                        'bg-emerald-100 dark:bg-emerald-900/30'
                      }`}>
                        <PatientAvatar name={result.patient.name} photoUrl={(result.patient as any).photoUrl || (result.patient as any).photo} size="sm" />
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + Badges + Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{result.patient.name}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getOverallStatusBadge(result.overallStatus)}`}>
                              {result.overallStatus === 'Critical' && <AlertTriangle className="h-2 w-2 mr-0.5" />}{result.overallStatus}
                            </Badge>
                                 <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityBadge(result.priority)}`}>{result.priority}</Badge>
                                 <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{result.testCode}</Badge>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(result)}>
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button size="sm" onClick={() => openVerifyDialog(result)} className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Verify
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openRejectDialog(result)} className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                         {/* Row 2: Details */}
                         <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                           <span>{result.testName}</span>
                           <span>•</span>
                           <span>{result.orderId}</span>
                           <span>•</span>
                           <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{result.doctor.name}</span>
                           <span>•</span>
                           <span>By: {result.submittedBy}</span>
                           <span>•</span>
                           <span className="flex items-center gap-1" title="Submitted">
                             <Clock className="h-3 w-3 shrink-0" />
                             {formatLabDateTime(result.submittedAt) || '—'}
                           </span>
                         </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </div>

            {/* Pagination for Pending */}
        {totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          </Card>
        )}
          </TabsContent>

          {/* Verified Tab */}
          <TabsContent value="verified" className="space-y-6">
            <div className="space-y-3">
              {verifiedLoading ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                  <p>Loading verified results...</p>
                </CardContent></Card>
              ) : verifiedError ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-red-600 dark:text-red-400">{verifiedError}</p>
                  <Button variant="outline" className="mt-4" onClick={loadVerifiedResults}>Retry</Button>
                </CardContent></Card>
              ) : verifiedResults.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No verified results found</p>
                </CardContent></Card>
              ) : (
                verifiedPaginatedResults
                  .sort((a, b) => {
                    const statusOrder = { Critical: 0, Abnormal: 1, Normal: 2 };
                    const priorityOrder = { STAT: 0, Urgent: 1, Routine: 2 };
                    if (statusOrder[a.overallStatus] !== statusOrder[b.overallStatus]) {
                      return statusOrder[a.overallStatus] - statusOrder[b.overallStatus];
                    }
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                  })
                  .map(result => (
                    <Card key={result.id} className={`border-l-4 hover:shadow-md transition-shadow ${result.overallStatus === 'Critical' ? 'border-l-rose-500' : result.overallStatus === 'Abnormal' ? 'border-l-amber-500' : 'border-l-emerald-500'}`}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            result.overallStatus === 'Critical' ? 'bg-rose-100 dark:bg-rose-900/30' :
                            result.overallStatus === 'Abnormal' ? 'bg-amber-100 dark:bg-amber-900/30' :
                            'bg-emerald-100 dark:bg-emerald-900/30'
                          }`}>
                            <PatientAvatar name={result.patient.name} photoUrl={(result.patient as any).photoUrl || (result.patient as any).photo} size="sm" />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            {/* Row 1: Name + Badges + Actions */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="font-semibold text-foreground truncate">{result.patient.name}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getOverallStatusBadge(result.overallStatus)}`}>
                                  {result.overallStatus === 'Critical' && <AlertTriangle className="h-2 w-2 mr-0.5" />}{result.overallStatus}
                                </Badge>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityBadge(result.priority)}`}>{result.priority}</Badge>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{result.testCode}</Badge>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(result)}>
                                  <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => downloadResult(result)}>
                                  <Download className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                </Button>
                              </div>
                            </div>

                             {/* Row 2: Details */}
                             <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                               <span>{result.testName}</span>
                               <span>•</span>
                               <span>{result.orderId}</span>
                               <span>•</span>
                               <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{result.doctor.name}</span>
                               <span>•</span>
                               <span>Verified by: {result.verifiedBy || 'Unknown'}</span>
                               <span>•</span>
                               <span className="flex items-center gap-1" title="Verified">
                                 <CheckCircle2 className="h-3 w-3 shrink-0" />
                                 {formatLabDateTime(result.verifiedAt || result.submittedAt) || '—'}
                               </span>
                             </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>

            {/* Pagination for Verified */}
            {verifiedTotalCount > 0 && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={verifiedCurrentPage}
                  totalItems={verifiedTotalCount}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setVerifiedCurrentPage}
                  onItemsPerPageChange={setItemsPerPage}
                />
              </Card>
            )}
          </TabsContent>

          {/* All Tab */}
          <TabsContent value="all" className="space-y-6">
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">All Results</p>
              <p className="text-sm">Combined view of pending and verified results</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-amber-500" />Result Details</DialogTitle>
              <DialogDescription>{selectedResult?.testName} - {selectedResult?.patient.name}</DialogDescription>
            </DialogHeader>
            {selectedResult && (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getOverallStatusBadge(selectedResult.overallStatus)}>{selectedResult.overallStatus}</Badge>
                  <Badge variant="outline" className={getPriorityBadge(selectedResult.priority)}>{selectedResult.priority}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div><p className="text-xs text-muted-foreground">Patient</p><p className="font-medium">{selectedResult.patient.name}</p><p className="text-xs text-muted-foreground">{selectedResult.patient.age}y {selectedResult.patient.gender}</p></div>
                  <div><p className="text-xs text-muted-foreground">Ordering Doctor</p><p className="font-medium">{selectedResult.doctor.name}</p></div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Test Results</p>
                  {selectedResult.results.length > 0 ? (
                    <div className="overflow-x-auto">
                      {(() => {
                        const hasRowAttachments = selectedResult.results.some((result) => result.attachment?.url);
                        return (
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/50">
                          <th className="text-left p-2">Parameter</th>
                          <th className="text-left p-2">Value</th>
                          <th className="text-left p-2">Unit</th>
                          <th className="text-left p-2">Normal Range</th>
                          <th className="text-left p-2">Status</th>
                          {hasRowAttachments && <th className="text-left p-2">File</th>}
                        </tr></thead>
                        <tbody>
                          {selectedResult.results.map(r => (
                            <tr key={r.parameter} className="border-b">
                              <td className="p-2 font-medium">{r.parameter}</td>
                              <td className={`p-2 ${getResultStatusColor(r.status)}`}>{r.value}</td>
                              <td className="p-2 text-muted-foreground">{r.unit}</td>
                              <td className="p-2 text-muted-foreground">{r.normalRange}</td>
                              <td className="p-2"><Badge variant="outline" className={getOverallStatusBadge(r.status)}>{r.status}</Badge></td>
                              {hasRowAttachments && (
                                <td className="p-2">
                                  {r.attachment?.url ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2"
                                      onClick={() => window.open(r.attachment!.url, '_blank', 'noopener,noreferrer')}
                                    >
                                      <Download className="h-3.5 w-3.5 mr-1" />
                                      View
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                        );
                      })()}
                    </div>
                  ) : selectedResult.resultFile && selectedResult.resultFileExists !== false ? (
                    <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-indigo-600" />
                          <div>
                            <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                              Result file available
                            </p>
                            <p className="text-xs text-indigo-700 dark:text-indigo-300">
                              Results are provided as a PDF document
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedResult.resultFile && selectedResult.resultFileExists !== false) {
                              window.open(selectedResult.resultFile, '_blank');
                            }
                          }}
                          className="border-indigo-300 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          View PDF
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        No test results available. Results may not have been entered yet.
                      </p>
                    </div>
                  )}
                </div>
                {selectedResult.clinicalNotes && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Clinical Notes</p>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-sm">{selectedResult.clinicalNotes}</p>
                    </div>
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  Submitted by {selectedResult.submittedBy} at {formatTime(selectedResult.submittedAt)}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              {selectedResult?.status === LAB_TEST_STATUS.VERIFIED && (
                <Button
                  variant="outline"
                  onClick={() => selectedResult && downloadResult(selectedResult)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              )}
              {isSelectedResultMutable && (
                <>
                  <Button variant="outline" onClick={() => { setIsViewDialogOpen(false); if (selectedResult) openRejectDialog(selectedResult); }} className="text-rose-600">
                    <XCircle className="h-4 w-4 mr-2" />Reject
                  </Button>
                  <Button
                    onClick={() => { setIsViewDialogOpen(false); if (selectedResult) openVerifyDialog(selectedResult); }}
                    className="bg-emerald-500 hover:bg-emerald-600"
                    disabled={!canVerifySelectedResult}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />Verify
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Verify Dialog */}
        <Dialog open={isVerifyDialogOpen} onOpenChange={setIsVerifyDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Verify Result</DialogTitle>
              <DialogDescription>Confirm verification for {selectedResult?.patient.name}</DialogDescription>
            </DialogHeader>
            {selectedResult && (
              <div className="space-y-4 py-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Test:</span><span className="font-medium">{selectedResult.testName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient:</span><span className="font-medium">{selectedResult.patient.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><Badge variant="outline" className={getOverallStatusBadge(selectedResult.overallStatus)}>{selectedResult.overallStatus}</Badge></div>
                </div>
                {selectedResult.overallStatus !== 'Normal' && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      This result has {selectedResult.overallStatus.toLowerCase()} values. Please review carefully.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Verification Notes (Optional)</Label>
                  <Textarea value={verificationNotes} onChange={(e) => setVerificationNotes(e.target.value)} placeholder="Add any notes..." rows={2} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsVerifyDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleVerify} disabled={isSubmitting} className="bg-emerald-500 hover:bg-emerald-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Verify Result
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600"><XCircle className="h-5 w-5" />Reject Result</DialogTitle>
              <DialogDescription>Send back for correction</DialogDescription>
            </DialogHeader>
            {selectedResult && (
              <div className="space-y-4 py-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Test:</span><span className="font-medium">{selectedResult.testName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Submitted By:</span><span className="font-medium">{selectedResult.submittedBy}</span></div>
                </div>
                <div className="space-y-2">
                  <Label>Rejection Reason *</Label>
                  <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain why this result is being rejected..." rows={3} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleReject} disabled={isSubmitting || !rejectionReason} className="bg-rose-500 hover:bg-rose-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                Reject & Send Back
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Batch Verify Dialog */}
        <AlertDialog open={isBatchVerifyOpen} onOpenChange={setIsBatchVerifyOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Verify {selectedIds.length} Results?</AlertDialogTitle>
              <AlertDialogDescription>
                This will verify all selected results and mark them as completed. Doctors will be able to see these results.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBatchVerify} disabled={isSubmitting} className="bg-emerald-500 hover:bg-emerald-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Verify All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
