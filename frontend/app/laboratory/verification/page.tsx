"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
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
import { toast } from "sonner";
import { labService, type LabResult as ApiLabResult } from '@/lib/services';
import { transformPriority } from '@/lib/services/transformers';
import {
  ShieldCheck, Search, Eye, Clock, CheckCircle2, AlertTriangle, XCircle,
  Loader2, User, Calendar, FileText, Stethoscope, RefreshCw, Send
} from 'lucide-react';

interface TestResult {
  parameter: string;
  value: string;
  unit: string;
  normalRange: string;
  status: 'Normal' | 'Abnormal' | 'Critical';
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
  overallStatus: 'Normal' | 'Abnormal' | 'Critical';
  priority: 'Routine' | 'Urgent' | 'STAT';
  status: 'Results Ready' | 'Verified' | 'Completed';
  submittedBy: string;
  submittedAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
  clinic: string;
  clinicalNotes?: string;
}

// Transform backend LabResult to frontend format
const transformResult = (apiResult: ApiLabResult): LabResult => {
  // Prioritize test_details over test (test might just be an ID)
  const test = (apiResult as any).test_details || apiResult.test;
  const results: TestResult[] = [];
  
  // Debug: Log the structure to help identify issues
  if (process.env.NODE_ENV === 'development') {
    console.log('LabResult API response:', {
      hasTest: !!apiResult.test,
      hasTestDetails: !!(apiResult as any).test_details,
      testObject: test,
      testType: typeof test,
      testIsObject: test && typeof test === 'object' && !Array.isArray(test),
      testResults: test?.results,
      testResultsType: typeof test?.results,
      testResultsKeys: test?.results ? Object.keys(test.results) : [],
      fullApiResult: apiResult,
    });
  }
  
  // Transform results from JSON format to TestResult array
  // Try multiple ways to access results
  let resultsObj: Record<string, any> | null = null;
  
  // If test is an object (not just an ID), try to access results
  if (test && typeof test === 'object' && !Array.isArray(test)) {
    // Try direct access to test.results
    if (test.results && typeof test.results === 'object' && !Array.isArray(test.results)) {
      resultsObj = test.results;
    }
  }
  
  // Also try accessing from test_details.results if test_details exists
  if (!resultsObj && (apiResult as any).test_details) {
    const testDetails = (apiResult as any).test_details;
    if (testDetails.results && typeof testDetails.results === 'object' && !Array.isArray(testDetails.results)) {
      resultsObj = testDetails.results;
    }
  }
  
  // Also try accessing from the root API result
  if (!resultsObj && (apiResult as any).results && typeof (apiResult as any).results === 'object') {
    resultsObj = (apiResult as any).results;
  }
  
  // Process results if we found them
  if (resultsObj && Object.keys(resultsObj).length > 0) {
    Object.entries(resultsObj).forEach(([key, value]) => {
      // Skip if value is null, undefined, or empty string
      if (value === null || value === undefined || value === '') {
        return;
      }
      
      // Try to determine status based on value (simplified)
      let status: 'Normal' | 'Abnormal' | 'Critical' = 'Normal';
      const valueStr = String(value);
      if (valueStr.includes('Critical') || valueStr.includes('critical')) {
        status = 'Critical';
      } else if (valueStr.includes('Abnormal') || valueStr.includes('abnormal')) {
        status = 'Abnormal';
      }
      
      results.push({
        parameter: key,
        value: valueStr,
        unit: '', // Would need to come from template
        normalRange: '', // Would need to come from template
        status,
      });
    });
  }
  
  // Determine overall status from individual results or use API value
  let overallStatus: 'Normal' | 'Abnormal' | 'Critical' = 'Normal';
  if (apiResult.overall_status) {
    const statusMap: Record<string, 'Normal' | 'Abnormal' | 'Critical'> = {
      'normal': 'Normal',
      'abnormal': 'Abnormal',
      'critical': 'Critical',
    };
    overallStatus = statusMap[apiResult.overall_status] || 'Normal';
  } else if (results.length > 0) {
    // Determine from results
    if (results.some(r => r.status === 'Critical')) overallStatus = 'Critical';
    else if (results.some(r => r.status === 'Abnormal')) overallStatus = 'Abnormal';
  }

  const order = (apiResult as any).order || (test as any).order;
  const patient = apiResult.patient || order?.patient || {};
  
  // Get test details - handle case where test might be just an ID
  const testDetails = (apiResult as any).test_details || (test && typeof test === 'object' ? test : null);
  const testId = typeof test === 'number' ? test.toString() : (testDetails?.id?.toString() || test?.id?.toString() || apiResult.id.toString());
  const testName = testDetails?.name || test?.name || '';
  const testCode = testDetails?.code || test?.code || '';
  
  return {
    id: apiResult.id.toString(),
    testId: testId, // Store test ID for API operations
    orderId: (apiResult as any).order_id || order?.order_id || '',
    patient: {
      id: (patient as any)?.id?.toString() || '',
      name: (apiResult as any).patient_name || (patient as any)?.name || 'Unknown',
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
    overallStatus,
    priority: transformPriority(apiResult.priority || order?.priority || 'routine') as 'Routine' | 'Urgent' | 'STAT',
    status: 'Results Ready',
    submittedBy: testDetails?.processed_by_name || testDetails?.processed_by || test?.processed_by_name || test?.processed_by || 'Lab Tech',
    submittedAt: testDetails?.processed_at || testDetails?.created_at || test?.processed_at || test?.created_at || new Date().toISOString(),
    clinic: order?.clinic || '',
    clinicalNotes: order?.clinical_notes || testDetails?.notes || test?.notes || '',
  };
};

export default function ResultsVerificationPage() {
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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

  const pendingResults = results.filter(r => r.status === 'Results Ready');
  
  const filteredResults = useMemo(() => pendingResults.filter(result => {
    const matchesSearch = result.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      result.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      result.testName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || result.overallStatus.toLowerCase() === statusFilter;
    const matchesPriority = priorityFilter === 'all' || result.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  }), [pendingResults, searchQuery, statusFilter, priorityFilter]);

  // Note: Since we're using server-side pagination, we display all filtered results
  // The API handles pagination, but we still filter client-side for search
  const paginatedResults = filteredResults;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, priorityFilter]);

  // Load results function - memoized to prevent infinite loops
  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {
        page: currentPage,
      };
      if (statusFilter !== 'all') {
        params.overall_status = statusFilter;
      }
      if (priorityFilter !== 'all') {
        params.priority = priorityFilter.toLowerCase();
      }
      
      const response = await labService.getPendingVerifications(params);
      const transformedResults = response.results.map(transformResult);
      setResults(transformedResults);
    } catch (err: any) {
      setError(err.message || 'Failed to load results');
      toast.error('Failed to load verification results. Please try again.');
      console.error('Error loading results:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, priorityFilter]);

  // Load results from API when page or filters change
  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const stats = {
    pending: pendingResults.length,
    critical: pendingResults.filter(r => r.overallStatus === 'Critical').length,
    abnormal: pendingResults.filter(r => r.overallStatus === 'Abnormal').length,
    normal: pendingResults.filter(r => r.overallStatus === 'Normal').length,
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

  const formatTime = (isoString: string) => new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const getTimeSince = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

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
    if (!selectedResult || !rejectionReason) {
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

      await labService.rejectResult(testId, rejectionReason);
      
      toast.success(`Result rejected and sent back to ${selectedResult.submittedBy}`);
      
      // Reload results to get updated data
      await loadResults();
      
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
      
      setIsBatchVerifyOpen(false);
      setSelectedIds([]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify results');
      console.error('Error batch verifying:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectAllNormal = () => {
    const normalIds = filteredResults.filter(r => r.overallStatus === 'Normal').map(r => r.id);
    setSelectedIds(normalIds);
  };

  const openViewDialog = (result: LabResult) => { setSelectedResult(result); setIsViewDialogOpen(true); };
  const openVerifyDialog = (result: LabResult) => { setSelectedResult(result); setVerificationNotes(''); setIsVerifyDialogOpen(true); };
  const openRejectDialog = (result: LabResult) => { setSelectedResult(result); setRejectionReason(''); setIsRejectDialogOpen(true); };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-amber-500" />
              Results Verification
            </h1>
            <p className="text-muted-foreground mt-1">Senior Admin / Pathologist - Verify lab results before completion</p>
          </div>
          <Button variant="outline" onClick={loadResults} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critical</p>
                  <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.critical}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-rose-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Abnormal</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.abnormal}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Normal</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.normal}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Batch Actions */}
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

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search results..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="abnormal">Abnormal</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
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
                </div>
                <Button variant="outline" onClick={selectAllNormal} disabled={stats.normal === 0}>
                  Select All Normal
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results List */}
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
          ) : filteredResults.length === 0 ? (
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
                        <span className={`font-semibold text-xs ${
                          result.overallStatus === 'Critical' ? 'text-rose-600' :
                          result.overallStatus === 'Abnormal' ? 'text-amber-600' :
                          'text-emerald-600'
                        }`}>{result.patient.name.split(' ').map(n => n[0]).join('')}</span>
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
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{getTimeSince(result.submittedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </div>

        {/* Pagination */}
        {filteredResults.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredResults.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="results"
            />
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
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
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/50">
                          <th className="text-left p-2">Parameter</th>
                          <th className="text-left p-2">Value</th>
                          <th className="text-left p-2">Normal Range</th>
                          <th className="text-left p-2">Status</th>
                        </tr></thead>
                        <tbody>
                          {selectedResult.results.map(r => (
                            <tr key={r.parameter} className="border-b">
                              <td className="p-2 font-medium">{r.parameter}</td>
                              <td className={`p-2 ${getResultStatusColor(r.status)}`}>{r.value} {r.unit}</td>
                              <td className="p-2 text-muted-foreground">{r.normalRange}</td>
                              <td className="p-2"><Badge variant="outline" className={getOverallStatusBadge(r.status)}>{r.status}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
              <Button variant="outline" onClick={() => { setIsViewDialogOpen(false); if (selectedResult) openRejectDialog(selectedResult); }} className="text-rose-600">
                <XCircle className="h-4 w-4 mr-2" />Reject
              </Button>
              <Button onClick={() => { setIsViewDialogOpen(false); if (selectedResult) openVerifyDialog(selectedResult); }} className="bg-emerald-500 hover:bg-emerald-600">
                <CheckCircle2 className="h-4 w-4 mr-2" />Verify
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Verify Dialog */}
        <Dialog open={isVerifyDialogOpen} onOpenChange={setIsVerifyDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
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
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600"><XCircle className="h-5 w-5" />Reject Result</DialogTitle>
              <DialogDescription>Send back to lab technician for correction</DialogDescription>
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

