"use client";

import { useState, useMemo, useEffect } from 'react';
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
import { radiologyService, type RadiologyReport as ApiRadiologyReport } from '@/lib/services';
import { transformPriority } from '@/lib/services/transformers';
import {
  ShieldCheck, Search, Eye, Clock, CheckCircle2, AlertTriangle, XCircle,
  Loader2, User, Calendar, FileText, Stethoscope, RefreshCw, ScanLine, Download
} from 'lucide-react';

interface ImagingStudy {
  id: string;
  procedure: string;
  category: string;
  bodyPart: string;
  contrastRequired: boolean;
  status: 'Pending' | 'Scheduled' | 'Acquired' | 'Processing' | 'Reported' | 'Verified';
  processingMethod?: 'In-house' | 'Outsourced';
  outsourcedFacility?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  technologist?: string;
  acquiredAt?: string;
  imagesCount?: number;
  findings?: string;
  impression?: string;
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
  specialInstructions?: string;
}

// Transform backend radiology report to frontend format
const transformReport = (apiReport: ApiRadiologyReport): RadiologyReport => {
  const study = apiReport.study_details || apiReport.study;
  
  const studyObj = typeof study === 'object' && study !== null ? study : null;
  return {
    id: apiReport.id.toString(),
    orderId: apiReport.order_id || '',
    studyId: studyObj?.id?.toString() || '',
    patient: {
      id: apiReport.patient?.toString() || '',
      name: apiReport.patient_name || 'Unknown',
      age: 0, // Would need to get from patient API
      gender: 'Unknown', // Would need to get from patient API
    },
    doctor: {
      id: '',
      name: '',
      specialty: '',
    },
    study: {
      id: studyObj?.id?.toString() || '',
      procedure: studyObj?.procedure || '',
      category: studyObj?.modality || 'X-Ray',
      bodyPart: studyObj?.body_part || '',
      contrastRequired: false,
      status: studyObj?.status ? (studyObj.status === 'reported' ? 'Reported' : 'Verified') : 'Reported',
      processingMethod: studyObj?.processing_method ? (studyObj.processing_method === 'in_house' ? 'In-house' : 'Outsourced') : undefined,
      outsourcedFacility: studyObj?.outsourced_facility,
      imagesCount: studyObj?.images_count,
      findings: studyObj?.findings,
      impression: studyObj?.impression,
      critical: apiReport.overall_status === 'critical',
      reportedBy: studyObj?.reported_by,
      reportedAt: studyObj?.reported_at ? String(studyObj.reported_at) : undefined,
    },
    priority: transformPriority(apiReport.priority || 'routine') as 'Routine' | 'Urgent' | 'STAT',
    clinic: '',
    clinicalIndication: '',
    specialInstructions: '',
  };
};

export default function RadiologyVerificationPage() {
  const [reports, setReports] = useState<RadiologyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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

  const pendingReports = reports.filter(r => r.study.status === 'Reported');
  
  const filteredReports = useMemo(() => pendingReports.filter(report => {
    const matchesSearch = report.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.study.procedure.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || report.study.category === categoryFilter;
    const matchesPriority = priorityFilter === 'all' || report.priority === priorityFilter;
    return matchesSearch && matchesCategory && matchesPriority;
  }), [pendingReports, searchQuery, categoryFilter, priorityFilter]);

  // Paginated reports
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredReports.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredReports, currentPage, itemsPerPage]);

  // Load reports from API
  useEffect(() => {
    loadReports();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, priorityFilter]);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {
        page: currentPage,
      };
      if (priorityFilter !== 'all') {
        params.priority = priorityFilter.toLowerCase();
      }
      
      const response = await radiologyService.getPendingVerifications(params);
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

  const stats = {
    pending: pendingReports.length,
    critical: pendingReports.filter(r => r.study.critical).length,
    urgent: pendingReports.filter(r => r.priority === 'Urgent' || r.priority === 'STAT').length,
    routine: pendingReports.filter(r => r.priority === 'Routine').length,
  };

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

  const formatTime = (isoString: string) => new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
    await new Promise(r => setTimeout(r, 1000));

    // In real app, this would send back to reporting radiologist
    setReports(prev => prev.filter(r => r.id !== selectedReport.id));
    toast.success(`Report rejected and sent back to ${selectedReport.study.reportedBy}`);
    setIsSubmitting(false);
    setIsRejectDialogOpen(false);
    setRejectionReason('');
    setSelectedReport(null);
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

  const selectAllRoutine = () => {
    const routineIds = filteredReports.filter(r => r.priority === 'Routine' && !r.study.critical).map(r => r.id);
    setSelectedIds(routineIds);
  };

  const openViewDialog = (report: RadiologyReport) => { setSelectedReport(report); setIsViewDialogOpen(true); };
  const openVerifyDialog = (report: RadiologyReport) => { setSelectedReport(report); setVerificationNotes(''); setIsVerifyDialogOpen(true); };
  const openRejectDialog = (report: RadiologyReport) => { setSelectedReport(report); setRejectionReason(''); setIsRejectDialogOpen(true); };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-amber-500" />
              Report Verification
            </h1>
            <p className="text-muted-foreground mt-1">Senior Radiologist - Verify radiology reports before finalization</p>
          </div>
          <Button variant="outline" onClick={loadReports} disabled={loading}>
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
                  <p className="text-sm text-muted-foreground">Urgent/STAT</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.urgent}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Routine</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.routine}</p>
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
                    <p className="font-semibold text-emerald-900 dark:text-emerald-100">{selectedIds.length} report(s) selected</p>
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
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex gap-2 flex-1">
                <div className="relative flex-1 md:max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search reports..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                </div>
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
              </div>
              <Button variant="outline" onClick={selectAllRoutine} disabled={stats.routine === 0}>
                Select All Routine
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reports List */}
        <div className="space-y-3">
          {loading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading reports...</p>
            </CardContent></Card>
          ) : error ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" className="mt-4" onClick={loadReports}>Retry</Button>
            </CardContent></Card>
          ) : filteredReports.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No reports pending verification</p>
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
                        <span className={`font-semibold text-xs ${
                          report.study.critical ? 'text-rose-600' : 'text-amber-600'
                        }`}>{report.patient.name.split(' ').map(n => n[0]).join('')}</span>
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

                        {/* Impression Preview */}
                        {report.study.impression && (
                          <p className={`text-xs mt-1.5 line-clamp-1 ${report.study.critical ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
                            {report.study.impression}
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
        {filteredReports.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredReports.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="reports"
            />
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-amber-500" />Report Details</DialogTitle>
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
                  <p className="text-sm text-muted-foreground mb-2 font-medium">Findings</p>
                  <div className={`p-3 rounded-lg ${selectedReport.study.critical ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                    <p className="text-sm">{selectedReport.study.findings}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2 font-medium">Impression</p>
                  <div className={`p-3 rounded-lg ${selectedReport.study.critical ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                    <p className={`text-sm ${selectedReport.study.critical ? 'font-medium text-rose-700 dark:text-rose-400' : ''}`}>{selectedReport.study.impression}</p>
                  </div>
                </div>
                {selectedReport.study.reportFile && (
                  <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-indigo-600" />
                      <span className="text-sm">{selectedReport.study.reportFile.name}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-indigo-600">
                      <Download className="h-4 w-4 mr-1" />View
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
              <Button variant="outline" onClick={() => { setIsViewDialogOpen(false); if (selectedReport) openRejectDialog(selectedReport); }} className="text-rose-600">
                <XCircle className="h-4 w-4 mr-2" />Reject
              </Button>
              <Button onClick={() => { setIsViewDialogOpen(false); if (selectedReport) openVerifyDialog(selectedReport); }} className="bg-emerald-500 hover:bg-emerald-600">
                <CheckCircle2 className="h-4 w-4 mr-2" />Verify
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Verify Dialog */}
        <Dialog open={isVerifyDialogOpen} onOpenChange={setIsVerifyDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Verify Report</DialogTitle>
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
                Verify Report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600"><XCircle className="h-5 w-5" />Reject Report</DialogTitle>
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

