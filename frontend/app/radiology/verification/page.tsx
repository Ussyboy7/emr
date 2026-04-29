"use client";

import { useState, useEffect } from 'react';
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
import { radiologyService, type RadiologyReport as ApiRadiologyReport } from '@/lib/services';
import { RADIOLOGY_VERIFICATION_POLL_INTERVAL } from '@/lib/constants/ui';
import { formatLocalYmd } from '@/lib/laboratory/constants';
import { useServerToday } from '@/hooks/use-server-today';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { transformPriority } from '@/lib/services/transformers';
import {
  ShieldCheck, Search, Eye, Clock, CheckCircle2, AlertTriangle, XCircle,
  Loader2, User, Calendar, FileText, Stethoscope, ScanLine, Download, RefreshCw
} from 'lucide-react';

interface ImagingStudy {
  id: string;
  procedure: string;
  category: string;
  bodyPart: string;
  status: 'Pending' | 'Scheduled' | 'Acquired' | 'Processing' | 'Reported' | 'Verified';
  processingMethod?: 'In-house' | 'Outsourced';
  outsourcedFacility?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  technologist?: string;
  acquiredAt?: string;
  imagesCount?: number;
  report?: string;
  customReports?: Array<{ id: string; procedure: string; report: string; recommendations?: string; critical?: boolean; attachment?: { name: string; url: string } | null }>;
  critical?: boolean;
  reportFile?: { name: string; type: string; uploadedAt: string };
  reportedBy?: string;
  reportedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

interface RadiologyReport {
  id: string;
  orderId: string;
  studyId: string;
  patient: { id: string; name: string; age: number; gender: string; };
  doctor: { id: string; name: string; specialty: string; };
  study: ImagingStudy;
  priority: 'Routine' | 'Urgent' | 'STAT';
  clinic: string;
  clinicalIndication?: string;
  provisionalDiagnosis?: string;
  lmp?: string;
}

const getRadiologyReportFileUrl = (filePath?: string | null) => {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  const apiRoot = process.env.NEXT_PUBLIC_API_URL || '';
  const mediaBase = apiRoot.endsWith('/api') ? apiRoot.slice(0, -4) : apiRoot.endsWith('/api/v1') ? apiRoot.slice(0, -7) : apiRoot;
  if (filePath.startsWith('/media/')) return `${mediaBase}${filePath}`;
  return `${mediaBase}/media/${filePath.replace(/^\/+/, '')}`;
};

// Transform backend radiology report to frontend format
const transformReport = (apiReport: any): RadiologyReport => {
  const study = apiReport.study_details || apiReport.study;
  const studyObj = typeof study === 'object' && study !== null ? study : {};
  const legacyFindings = String(studyObj.findings || '').trim();
  const legacyImpression = String(studyObj.impression || '').trim();
  const reportText = String(studyObj.report || '').trim() || legacyFindings;
  const mergedReportText = legacyImpression
    ? `${reportText}\n\nImpression:\n${legacyImpression}`.trim()
    : reportText;
  const attachments = Array.isArray(studyObj.report_attachments) ? studyObj.report_attachments : [];
  const customReports = Array.isArray(studyObj.custom_reports)
    ? studyObj.custom_reports.map((row: any) => {
        const attachment = attachments.find((file: any) =>
          file.row_id === row.id || file.row_name?.trim().toLowerCase() === String(row.procedure || row.name || '').trim().toLowerCase()
        );
        const attachmentUrl = getRadiologyReportFileUrl(attachment?.file);
        return {
          id: String(row.id || ''),
          procedure: String(row.procedure || row.name || ''),
          report: String(row.report || ''),
          recommendations: row.recommendations ? String(row.recommendations) : undefined,
          critical: Boolean(row.critical),
          attachment: attachmentUrl
            ? {
                name: String(attachment.row_name || attachment.file.split('/').pop() || 'Report file'),
                url: attachmentUrl,
              }
            : null,
        };
      })
    : [];
  
  // Extract patient details
  const patientId = (apiReport as any).patient_details?.patient_id || '';
  const patientName = apiReport.patient_name ?? '';
  const patientAge = (apiReport as any).patient_details?.age || (apiReport as any).patient_age || 0;
  const patientGender = (apiReport as any).patient_details?.gender || (apiReport as any).patient_gender || 'Unknown';
  
  // Extract doctor details from order
  const orderDetails = (apiReport as any).order_details || {};
  const doctorId = orderDetails.doctor?.toString() || apiReport.doctor?.toString() || '';
  const doctorName = orderDetails.doctor_name || apiReport.doctor_name || '';
  const doctorSpecialty = orderDetails.doctor_specialty || (apiReport as any).doctor_specialty || '';
  
  // Extract clinic and clinical indication
  const clinic = orderDetails.clinic || (apiReport as any).clinic || '';
  const clinicalIndication = orderDetails.clinical_notes || apiReport.clinical_notes || '';
  const provisionalDiagnosis = orderDetails.provisional_diagnosis || (apiReport as any).provisional_diagnosis || '';
  const lmp = orderDetails.lmp || (apiReport as any).lmp || '';
  
  return {
    id: apiReport.id.toString(),
    orderId: apiReport.order_id || '',
    studyId: studyObj.id?.toString() || '',
    patient: {
      id: patientId,
      name: patientName,
      age: patientAge,
      gender: patientGender,
    },
    doctor: {
      id: doctorId,
      name: doctorName,
      specialty: doctorSpecialty,
    },
    study: {
      id: studyObj.id?.toString() || '',
      procedure: studyObj.procedure || '',
      category: studyObj.modality || 'X-Ray',
      bodyPart: studyObj.body_part || '',
      status: studyObj.status ? (
        studyObj.status === 'reported' || studyObj.status === 'results_ready' ? 'Reported' :
        studyObj.status === 'verified' ? 'Verified' : 'Reported'
      ) : 'Reported',
      processingMethod: studyObj.processing_method ? (studyObj.processing_method === 'in_house' ? 'In-house' : 'Outsourced') : undefined,
      outsourcedFacility: studyObj.outsourced_facility,
      imagesCount: studyObj.images_count ? Number(studyObj.images_count) : undefined,
      report: mergedReportText || undefined,
      customReports,
      critical: apiReport.overall_status === 'critical' || studyObj.critical || false,
      reportFile: studyObj.report_file_url ? {
        name: String(studyObj.report_file ? studyObj.report_file.split('/').pop() : 'Report File'),
        type: 'application/pdf', // Assume PDF for now
        uploadedAt: String(studyObj.reported_at || new Date().toISOString()),
        url: String(studyObj.report_file_url)
      } as any : undefined,
      reportedBy: studyObj.reported_by_name || (studyObj.reported_by ? String(studyObj.reported_by) : undefined),
      reportedAt: studyObj.reported_at ? String(studyObj.reported_at) : undefined,
      verifiedBy: studyObj.verified_by_name || (studyObj.verified_by ? String(studyObj.verified_by) : undefined),
      verifiedAt: studyObj.verified_at ? String(studyObj.verified_at) : undefined,
    },
    priority: transformPriority(apiReport.priority || 'routine') as 'Routine' | 'Urgent' | 'STAT',
    clinic,
    clinicalIndication,
    provisionalDiagnosis: provisionalDiagnosis || undefined,
    lmp: lmp || undefined,
  };
};

export default function RadiologyVerificationPage() {
  const serverToday = useServerToday();
  const [reports, setReports] = useState<RadiologyReport[]>([]);
  const [verifiedReports, setVerifiedReports] = useState<RadiologyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifiedLoading, setVerifiedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedError, setVerifiedError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [verifiedCurrentPage, setVerifiedCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [verifiedTotalCount, setVerifiedTotalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [verifiedBreakdown, setVerifiedBreakdown] = useState({ normal: 0, abnormal: 0, critical: 0 });

  // Tab state
  const [activeTab, setActiveTab] = useState('pending');

  // Dialog states
  const [selectedReport, setSelectedReport] = useState<RadiologyReport | null>(null);
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

  const buildDateQuery = (filter: string): Record<string, string> => {
    // Anchor on server "today" so filters line up with the server calendar,
    // not the client device clock.
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
  };
  
  const paginatedReports = reports;
  const verifiedPaginatedReports = verifiedReports;

  // Load reports from API
  useEffect(() => {
    loadReports();
    // Re-run when the server anchor date resolves so filters use the correct
    // calendar day.
  }, [currentPage, itemsPerPage, serverToday]);

  // Load verified reports when verified tab is active
  useEffect(() => {
    if (activeTab === 'verified') {
      loadVerifiedReports();
    }
  }, [activeTab, verifiedCurrentPage, itemsPerPage, serverToday]);

  // Auto-refresh every 45 seconds to show new reports for verification
  useEffect(() => {
    const interval = setInterval(() => {
      loadReports();
      if (activeTab === 'verified') {
        loadVerifiedReports();
      }
    }, RADIOLOGY_VERIFICATION_POLL_INTERVAL); // Auto-refresh every 45 seconds

    return () => clearInterval(interval);
  }, [currentPage, itemsPerPage, activeTab, verifiedCurrentPage]);

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
    setVerifiedCurrentPage(1);
  }, [searchQuery, categoryFilter, priorityFilter, dateFilter, genderFilter, itemsPerPage]);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {
        page: currentPage,
        page_size: itemsPerPage,
        search: searchQuery.trim() || undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        ...buildDateQuery(dateFilter),
      };
      if (priorityFilter !== 'all') {
        params.priority = priorityFilter.toLowerCase();
      }

      const response = await radiologyService.getPendingVerifications(params);
      setTotalCount(response.count || response.results.length);
      const transformedReports = response.results.map(transformReport);
      setReports(transformedReports);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
      toast.error('Failed to load verification reports. Please try again.');
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadVerifiedReports = async () => {
    try {
      setVerifiedLoading(true);
      setVerifiedError(null);
      const params: any = {
        status: 'verified',
        page: verifiedCurrentPage,
        page_size: itemsPerPage,
        search: searchQuery.trim() || undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        ...buildDateQuery(dateFilter),
      };
      if (priorityFilter !== 'all') {
        params.priority = priorityFilter.toLowerCase();
      }

      const response = await radiologyService.getPendingVerifications(params);
      setVerifiedTotalCount(response.count || response.results.length);
      const transformedReports = response.results.map(transformReport);
      setVerifiedReports(transformedReports);
    } catch (err: any) {
      setVerifiedError(err.message || 'Failed to load verified reports');
      toast.error('Failed to load verified reports. Please try again.');
      console.error('Error loading verified reports:', err);
    } finally {
      setVerifiedLoading(false);
    }
  };

  const loadVerificationCounts = async () => {
    const base = {
      overall_status: undefined,
      priority: priorityFilter !== 'all' ? priorityFilter.toLowerCase() : undefined,
      search: searchQuery.trim() || undefined,
      gender: genderFilter !== 'all' ? genderFilter : undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
      ...buildDateQuery(dateFilter),
    };
    const [pendingStats, verifiedStats] = await Promise.all([
      radiologyService.getVerificationStats({ ...base, status: 'reported' }),
      radiologyService.getVerificationStats({ ...base, status: 'verified' }),
    ]);
    setPendingCount(pendingStats.total || 0);
    setVerifiedCount(verifiedStats.total || 0);
    setVerifiedBreakdown({
      normal: verifiedStats.normal || 0,
      abnormal: verifiedStats.abnormal || 0,
      critical: verifiedStats.critical || 0,
    });
  };

  useEffect(() => {
    void loadVerificationCounts();
  }, [priorityFilter, searchQuery, genderFilter, dateFilter, serverToday]);

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      'X-Ray': 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50',
      'CT Scan': 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/50',
      'MRI': 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/50',
      'Ultrasound': 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/50',
      'Mammography': 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/50',
    };
    return colors[category] || 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/50';
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'STAT': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Urgent': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
    }
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return 'Unknown time';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };
  const getTimeSince = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  const handleVerify = async () => {
    if (!selectedReport) return;
    setIsSubmitting(true);

    try {
      // Determine overall_status from study
      const overallStatusMap: Record<string, 'normal' | 'abnormal' | 'critical'> = {
        'normal': 'normal',
        'abnormal': 'abnormal',
        'critical': 'critical',
      };
      
      const overallStatus = selectedReport.study.critical ? 'critical' : 'normal';
      
      await radiologyService.verifyReport(
        parseInt(selectedReport.id),
        overallStatus,
        'medium', // Default priority, could be enhanced
        verificationNotes
      );

      toast.success(`Report verified for ${selectedReport.patient.name}`, {
        description: selectedReport.study.critical ? 'Critical finding notification sent to clinician' : undefined
      });
      
      // Reload reports
      await loadReports();
      
      setIsVerifyDialogOpen(false);
      setVerificationNotes('');
      setSelectedReport(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify report');
      console.error('Error verifying report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedReport || !rejectionReason) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setIsSubmitting(true);

    try {
      // Use the reject endpoint on the report
      const { apiFetch } = await import('@/lib/api-client');
      await apiFetch(`/radiology/verification/${selectedReport.id}/reject/`, {
        method: 'POST',
        body: JSON.stringify({
          reason: rejectionReason,
        }),
      });
      
      toast.success(`Report rejected and sent back to ${selectedReport.study.reportedBy}`);
      
      // Reload reports
      await loadReports();
      
      setIsRejectDialogOpen(false);
      setRejectionReason('');
      setSelectedReport(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject report');
      console.error('Error rejecting report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBatchVerify = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);

    try {
      // Verify each report
      for (const reportId of selectedIds) {
        const report = reports.find(r => r.id === reportId);
        if (report) {
          const overallStatus = report.study.critical ? 'critical' : 'normal';
          await radiologyService.verifyReport(
            parseInt(reportId),
            overallStatus,
            'medium',
            ''
          );
        }
      }

      toast.success(`${selectedIds.length} report(s) verified`);
      
      // Reload reports
      await loadReports();
      
      setIsBatchVerifyOpen(false);
      setSelectedIds([]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify reports');
      console.error('Error batch verifying:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };



  const openViewDialog = (report: RadiologyReport) => { setSelectedReport(report); setIsViewDialogOpen(true); };
  const openVerifyDialog = (report: RadiologyReport) => { setSelectedReport(report); setVerificationNotes(''); setIsVerifyDialogOpen(true); };
  const openRejectDialog = (report: RadiologyReport) => { setSelectedReport(report); setRejectionReason(''); setIsRejectDialogOpen(true); };
  const isSelectedReportMutable = selectedReport?.study?.status === 'Reported';

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-amber-500" />
              Results Verification
            </h1>
            <p className="text-muted-foreground mt-1">Senior Admin / Radiologist - Verify radiology results before completion</p>
          </div>
          <Button variant="outline" onClick={loadReports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>

        {/* Tabs & Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList>
                  <TabsTrigger value="pending">Pending Review ({pendingCount})</TabsTrigger>
                  <TabsTrigger value="verified">Verified ({verifiedCount})</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                <div className="relative flex-1 min-w-[min(100%,16rem)]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Patient, MRN, order ID, Radiology ID (e.g. BT-26-0007), study…"
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
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="X-Ray">X-Ray</SelectItem>
                      <SelectItem value="CT Scan">CT Scan</SelectItem>
                      <SelectItem value="MRI">MRI</SelectItem>
                      <SelectItem value="Ultrasound">Ultrasound</SelectItem>
                      <SelectItem value="Mammography">Mammography</SelectItem>
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
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Pending Review Tab */}
          <TabsContent value="pending" className="space-y-6">

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


        {/* Pending Results List */}
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
              <Button variant="outline" className="mt-4" onClick={loadReports}>Retry</Button>
            </CardContent></Card>
          ) : paginatedReports.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No results pending verification</p>
            </CardContent></Card>
          ) : (
            paginatedReports
              .sort((a, b) => {
                const criticalOrder = (a.study.critical ? 0 : 1) - (b.study.critical ? 0 : 1);
                if (criticalOrder !== 0) return criticalOrder;
                const priorityOrder = { STAT: 0, Urgent: 1, Routine: 2 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
              })
              .map(report => (
                <Card key={report.id} className={`border-l-4 hover:shadow-md transition-shadow ${report.study.critical ? 'border-l-rose-500 bg-rose-50/50 dark:bg-rose-900/5' : 'border-l-amber-500'}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedIds.includes(report.id)}
                        onCheckedChange={() => toggleSelection(report.id)}
                      />
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        report.study.critical ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
                      }`}>
                        <PatientAvatar name={report.patient.name} photoUrl={(report.patient as any).photoUrl || (report.patient as any).photo} size="sm" />
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + Badges + Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{report.patient.name}</span>
                            {report.study.critical && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-rose-500 text-white">
                                <AlertTriangle className="h-2 w-2 mr-0.5" />Critical
                              </Badge>
                            )}
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityBadge(report.priority)}`}>{report.priority}</Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getCategoryBadge(report.study.category)}`}>
                              <ScanLine className="h-2 w-2 mr-0.5" />{report.study.category}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(report)}>
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button size="sm" onClick={() => openVerifyDialog(report)} className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Verify
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openRejectDialog(report)} className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Row 2: Details */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="font-medium text-foreground">{report.study.procedure}</span>
                          <span>•</span>
                          <span>{report.orderId}</span>
                          <span>•</span>
                          <span>{report.patient.age}y {report.patient.gender}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{report.doctor.name}</span>
                          <span>•</span>
                          <span>By: {report.study.reportedBy}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{getTimeSince(report.study.reportedAt || '')}</span>
                        </div>

                        {report.study.report && (
                          <p className={`text-xs mt-1.5 line-clamp-1 ${report.study.critical ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
                            {report.study.report}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
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
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1);
              }}
              itemName="results"
            />
          </Card>
        )}

          </TabsContent>

          {/* Verified Tab */}
          <TabsContent value="verified" className="space-y-6">
            {/* Verified Results List */}
            <div className="space-y-3">
              {verifiedLoading ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p>Loading verified results...</p>
                </CardContent></Card>
              ) : verifiedError ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Error Loading Results</h3>
                  <p className="mb-4">{verifiedError}</p>
                  <Button variant="outline" onClick={loadVerifiedReports}>Retry</Button>
                </CardContent></Card>
              ) : verifiedPaginatedReports.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No verified results found</p>
                </CardContent></Card>
              ) : (
                <>
                  {verifiedPaginatedReports.map((report) => {
                    const verified = {
                      date: report.study.verifiedAt ? new Date(report.study.verifiedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      }) : 'Unknown',
                      time: report.study.verifiedAt ? formatTime(report.study.verifiedAt) : 'Unknown'
                    };

                    return (
                      <Card key={report.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openViewDialog(report)}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {/* Row 1: Patient Name + Badges + Actions */}
                                <div className="flex items-center justify-between gap-2 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <PatientAvatar name={report.patient.name} size="sm" />
                                    <span className="font-semibold text-foreground truncate">{report.patient.name}</span>
                                    {report.study.critical && (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-rose-500 text-white">
                                        <AlertTriangle className="h-2 w-2 mr-0.5" />Critical
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getCategoryBadge(report.study.category)}`}>
                                      <ScanLine className="h-2 w-2 mr-0.5" />{report.study.category}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(report)}>
                                      <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                    </Button>
                                    {report.study.reportFile && (
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => {
                                        e.stopPropagation();
                                        if ((report.study.reportFile as any)?.url) {
                                          const link = document.createElement('a');
                                          link.href = (report.study.reportFile as any).url;
                                          link.target = '_blank';
                                          link.rel = 'noopener noreferrer';
                                          document.body.appendChild(link);
                                          link.click();
                                          document.body.removeChild(link);
                                        }
                                      }}>
                                        <Eye className="h-4 w-4 text-muted-foreground hover:text-emerald-500" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Row 2: Details */}
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                                <span>{report.patient.age}y {report.patient.gender}</span>
                                <span>•</span>
                                <span>{report.orderId}</span>
                                <span>•</span>
                                <span>{report.study.procedure}</span>
                                <span>•</span>
                                <span>{verified.date} {verified.time}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {report.study.verifiedAt ? getTimeSince(report.study.verifiedAt) : 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                  {/* Pagination for Verified */}
                  {verifiedTotalCount > 0 && (
                    <Card className="p-4">
                      <StandardPagination
                        currentPage={verifiedCurrentPage}
                        totalItems={verifiedTotalCount}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setVerifiedCurrentPage}
                        onItemsPerPageChange={setItemsPerPage}
                        itemName="results"
                      />
                    </Card>
                  )}
                </>
              )}
            </div>
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

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-amber-500" />Result Details</DialogTitle>
              <DialogDescription>{selectedReport?.study.procedure} - {selectedReport?.patient.name}</DialogDescription>
            </DialogHeader>
            {selectedReport && (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3">
                  {selectedReport.study.critical && (
                    <Badge className="bg-rose-500 text-white">
                      <AlertTriangle className="h-3 w-3 mr-1" />CRITICAL FINDING
                    </Badge>
                  )}
                  <Badge variant="outline" className={getPriorityBadge(selectedReport.priority)}>{selectedReport.priority}</Badge>
                  <Badge variant="outline" className={getCategoryBadge(selectedReport.study.category)}>{selectedReport.study.category}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div><p className="text-xs text-muted-foreground">Patient</p><p className="font-medium">{selectedReport.patient.name}</p><p className="text-xs text-muted-foreground">{selectedReport.patient.age}y {selectedReport.patient.gender}</p></div>
                  <div><p className="text-xs text-muted-foreground">Ordering Doctor</p><p className="font-medium">{selectedReport.doctor.name}</p><p className="text-xs text-muted-foreground">{selectedReport.doctor.specialty}</p></div>
                  <div><p className="text-xs text-muted-foreground">Order ID</p><p className="font-medium">{selectedReport.orderId}</p></div>
                  <div><p className="text-xs text-muted-foreground">Reported By</p><p className="font-medium">{selectedReport.study.reportedBy}</p><p className="text-xs text-muted-foreground">{formatTime(selectedReport.study.reportedAt || '')}</p></div>
                </div>
                {selectedReport.clinicalIndication && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Clinical Indication</p>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-sm">{selectedReport.clinicalIndication}</p>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground mb-2 font-medium">Report</p>
                  <div className={`p-3 rounded-lg ${selectedReport.study.critical ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                    {selectedReport.study.customReports && selectedReport.study.customReports.length > 0 ? (
                      <div className="space-y-3">
                        {selectedReport.study.customReports.map((row, idx) => (
                          <div key={row.id || idx} className="rounded border bg-background/70 p-3 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{row.procedure || `Custom study ${idx + 1}`}</p>
                              {row.critical && <Badge className="bg-rose-500 text-white">Critical</Badge>}
                            </div>
                            {row.report && <p className={`text-sm whitespace-pre-wrap ${row.critical ? 'font-medium text-rose-700 dark:text-rose-400' : ''}`}>{row.report}</p>}
                            {row.recommendations && <p className="text-sm"><span className="text-muted-foreground">Recommendations:</span> {row.recommendations}</p>}
                            {row.attachment?.url && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(row.attachment?.url, '_blank', 'noopener,noreferrer')}
                              >
                                <FileText className="h-3.5 w-3.5 mr-1" />
                                View file
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={`text-sm whitespace-pre-wrap ${selectedReport.study.critical ? 'font-medium text-rose-700 dark:text-rose-400' : ''}`}>{selectedReport.study.report}</p>
                    )}
                  </div>
                </div>
                {selectedReport.study.reportFile && (
                  <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-indigo-600" />
                      <span className="text-sm">{selectedReport.study.reportFile.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-indigo-600"
                      onClick={() => {
                        if ((selectedReport?.study.reportFile as any)?.url) {
                          const link = document.createElement('a');
                          link.href = (selectedReport.study.reportFile as any).url;
                          link.target = '_blank';
                          link.rel = 'noopener noreferrer';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        } else {
                          toast.error('File URL not available');
                        }
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />View
                    </Button>
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  Reported by {selectedReport.study.reportedBy} at {formatTime(selectedReport.study.reportedAt || '')}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              {isSelectedReportMutable && (
                <>
                  <Button variant="outline" onClick={() => { setIsViewDialogOpen(false); if (selectedReport) openRejectDialog(selectedReport); }} className="text-rose-600">
                    <XCircle className="h-4 w-4 mr-2" />Reject
                  </Button>
                  <Button onClick={() => { setIsViewDialogOpen(false); if (selectedReport) openVerifyDialog(selectedReport); }} className="bg-emerald-500 hover:bg-emerald-600">
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
              <DialogDescription>Confirm verification for {selectedReport?.patient.name}</DialogDescription>
            </DialogHeader>
            {selectedReport && (
              <div className="space-y-4 py-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Study:</span><span className="font-medium">{selectedReport.study.procedure}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient:</span><span className="font-medium">{selectedReport.patient.name}</span></div>
                  {selectedReport.study.critical && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><Badge className="bg-rose-500 text-white">CRITICAL</Badge></div>
                  )}
                </div>
                {selectedReport.study.critical && (
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                    <p className="text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      This report contains a critical finding. {selectedReport.doctor.name} will be notified immediately.
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
              <DialogDescription>Send back to reporting radiologist for correction</DialogDescription>
            </DialogHeader>
            {selectedReport && (
              <div className="space-y-4 py-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Study:</span><span className="font-medium">{selectedReport.study.procedure}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Reported By:</span><span className="font-medium">{selectedReport.study.reportedBy}</span></div>
                </div>
                <div className="space-y-2">
                  <Label>Rejection Reason *</Label>
                  <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain why this report is being rejected..." rows={3} />
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
              <AlertDialogTitle>Verify {selectedIds.length} Reports?</AlertDialogTitle>
              <AlertDialogDescription>
                This will verify all selected reports and mark them as completed. Ordering physicians will be able to see these reports.
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
