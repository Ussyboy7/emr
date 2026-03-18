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
import { radiologyService, adminService } from '@/lib/services';
import { PatientAvatar } from "@/components/PatientAvatar";
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';

import {
  CheckCircle2, Search, Eye, Clock, AlertTriangle,
  User, FileText, Stethoscope, RefreshCw, Download, Loader2, Printer, ScanLine
} from 'lucide-react';

interface CompletedReport {
  id: string;
  orderId: string;
  patient: { id: string; name: string; age: number | null; gender: string; };
  patientName: string;
  patientId: string;
  age: number;
  gender: string;
  doctor: { id: string; name: string; specialty: string; };
  studyName: string;
  studyType: string;
  category: string;
  overallStatus: string;
  priority: string;
  orderingDoctor: string;
  orderedAt: string;
  completedAt: string;
  verifiedBy: string;
  verifiedAt: string;
  clinic: string;
  turnaroundTime: string;
  report?: string;
  reportFile?: { name: string; url: string; };
}

export default function CompletedReportsPage() {
  const [reports, setReports] = useState<CompletedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [clinicFilter, setClinicFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [clinics, setClinics] = useState<any[]>([]);

  // Dialog states
  const [selectedReport, setSelectedReport] = useState<CompletedReport | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const calculateTurnaroundTime = (createdAt?: string, verifiedAt?: string): string => {
    if (!createdAt || !verifiedAt) return 'N/A';

    try {
      const start = new Date(createdAt);
      const end = new Date(verifiedAt);
      const diffMs = end.getTime() - start.getTime();

      if (diffMs < 0) return 'N/A';

      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        return `${diffDays}d ${diffHours % 24}h`;
      } else if (diffHours > 0) {
        return `${diffHours}h ${diffMins % 60}m`;
      } else {
        return `${diffMins}m`;
      }
    } catch (error) {
      return 'N/A';
    }
  };

  // Load clinics function
  const loadClinics = useCallback(async () => {
    try {
      const clinicsResult = await adminService.getClinics({ page_size: 1000 });
      setClinics(clinicsResult.results);
    } catch (err) {
      console.error('Failed to load clinics:', err);
    }
  }, []);

  // Load completed reports function - memoized to prevent infinite loops
  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {
        status: 'verified',
        page: currentPage,
        page_size: itemsPerPage,
      };
      if (statusFilter !== 'all') {
        params.overall_status = statusFilter;
      }
      // Note: searchQuery, dateFilter, genderFilter not yet implemented in backend

      const response = await radiologyService.getPendingVerifications(params);
      setTotalCount(response.count || response.results.length);

      // Transform the reports to match our interface
      const transformedReports = response.results.map((apiReport: any) => {
        const legacyFindings = String(apiReport.study_details?.findings || '').trim();
        const legacyImpression = String(apiReport.study_details?.impression || '').trim();
        const reportText = String(apiReport.study_details?.report || '').trim() || legacyFindings;
        const mergedReportText = legacyImpression
          ? `${reportText}\n\nImpression:\n${legacyImpression}`.trim()
          : reportText;

        const verified = {
          date: apiReport.study_details?.verified_at ? new Date(apiReport.study_details.verified_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          }) : 'Unknown',
          time: apiReport.study_details?.verified_at ? new Date(apiReport.study_details.verified_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }) : 'Unknown'
        };

        return {
          id: apiReport.id.toString(),
          orderId: apiReport.order_id || '',
          patient: {
            id: apiReport.patient_details?.id || '',
            name: apiReport.patient_name || 'Unknown',
            age: apiReport.patient_details?.age || null,
            gender: apiReport.patient_details?.gender || 'Unknown'
          },
          patientName: apiReport.patient_name || 'Unknown',
          patientId: apiReport.patient_details?.patient_id || '',
          age: apiReport.patient_details?.age || 0,
          gender: apiReport.patient_details?.gender || 'Unknown',
          doctor: {
            id: apiReport.order_details?.doctor || '',
            name: apiReport.order_details?.doctor_name || 'Unknown',
            specialty: apiReport.order_details?.doctor_specialty || ''
          },
          studyName: apiReport.study_details?.procedure || 'Unknown Study',
          studyType: apiReport.study_details?.modality || 'Unknown',
          category: apiReport.study_details?.modality || 'X-Ray',
          overallStatus: apiReport.overall_status === 'critical' ? 'Critical' :
                       apiReport.overall_status === 'abnormal' ? 'Abnormal' : 'Normal',
          priority: apiReport.priority || 'Routine',
          orderingDoctor: apiReport.order_details?.doctor_name || 'Unknown',
          orderedAt: apiReport.study_details?.created_at || '',
          completedAt: apiReport.study_details?.verified_at || '',
          verifiedBy: apiReport.study_details?.verified_by_name || 'Unknown',
          verifiedAt: apiReport.study_details?.verified_at || '',
          clinic: apiReport.order_details?.clinic || '',
          turnaroundTime: calculateTurnaroundTime(apiReport.study_details?.created_at, apiReport.study_details?.verified_at),
          report: mergedReportText || undefined,
          reportFile: apiReport.study_details?.report_file_url ? {
            name: (typeof apiReport.study_details.report_file === 'string' ? apiReport.study_details.report_file.split('/').pop() : null) || 'Report File',
            url: apiReport.study_details.report_file_url
          } : undefined
        };
      });

      setReports(transformedReports);
    } catch (err: any) {
      setError(err.message || 'Failed to load completed reports');
      toast.error('Failed to load completed reports. Please try again.');
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, statusFilter, searchQuery, dateFilter, genderFilter, dateRange.from, dateRange.to]);

  // Load clinics on component mount
  useEffect(() => {
    loadClinics();
  }, [loadClinics]);

  // Load reports from API when page or filters change
  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, genderFilter, itemsPerPage, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // The API handles pagination, but we still filter client-side for search
  const filteredReports = useMemo(() => reports.filter(report => {
    const matchesSearch = report.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.studyName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || report.overallStatus.toLowerCase() === statusFilter;
    const matchesGender = genderFilter === 'all' || report.patient.gender.toLowerCase() === genderFilter.toLowerCase();

    // Date filtering
    let matchesDate = true;
    if (dateRange.from || dateRange.to) {
      const reportDate = new Date(report.completedAt);
      if (Number.isNaN(reportDate.getTime())) {
        matchesDate = false;
      } else {
        if (dateRange.from) {
          const from = new Date(`${dateRange.from}T00:00:00`);
          if (reportDate < from) matchesDate = false;
        }
        if (dateRange.to) {
          const to = new Date(`${dateRange.to}T23:59:59.999`);
          if (reportDate > to) matchesDate = false;
        }
      }
    } else if (dateFilter !== 'all') {
      const reportDate = new Date(report.completedAt);
      const today = new Date();

      switch (dateFilter) {
        case 'today':
          matchesDate = reportDate.toDateString() === today.toDateString();
          break;
        case 'week':
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          matchesDate = reportDate >= weekAgo;
          break;
        case 'month':
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          matchesDate = reportDate >= monthAgo;
          break;
      }
    }

    return matchesSearch && matchesStatus && matchesGender && matchesDate;
  }), [reports, searchQuery, statusFilter, dateFilter, genderFilter, dateRange.from, dateRange.to]);

  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const stats = {
    total: reports.length,
    normal: reports.filter(r => r.overallStatus === 'Normal').length,
    abnormal: reports.filter(r => r.overallStatus === 'Abnormal').length,
    critical: reports.filter(r => r.overallStatus === 'Critical').length,
  };

  const openViewDialog = (report: CompletedReport) => {
    setSelectedReport(report);
    setIsViewDialogOpen(true);
  };

  const handlePrint = (report: CompletedReport) => {
    // Create a print-friendly version of the report
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Radiology Report - ${report.patientName}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
            .report-title { font-size: 18px; margin: 10px 0; }
            .patient-info { margin: 20px 0; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .info-item { margin: 5px 0; }
            .label { font-weight: bold; }
            .timeline { margin: 20px 0; background: #f8f9fa; padding: 15px; border-radius: 5px; }
            .timeline-item { margin: 5px 0; }
            .signatures { margin: 30px 0; }
            .signature-item { margin: 15px 0; border-top: 1px solid #ddd; padding-top: 10px; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">Nigerian Ports Authority</div>
            <div class="logo">Medical Services</div>
            <div class="report-title">RADIOLOGY REPORT</div>
          </div>

          <div class="patient-info">
            <h3>Patient Information</h3>
            <div class="info-grid">
              <div class="info-item"><span class="label">Patient Name:</span> ${report.patientName}</div>
              <div class="info-item"><span class="label">Patient ID:</span> ${report.patientId}</div>
              <div class="info-item"><span class="label">Age/Gender:</span> ${report.age}y ${report.gender}</div>
              <div class="info-item"><span class="label">Study:</span> ${report.studyType}</div>
            </div>
          </div>

          <div class="timeline">
            <h3>Study Timeline</h3>
            <div class="timeline-item"><span class="label">Ordered:</span> ${report.orderedAt}</div>
            <div class="timeline-item"><span class="label">Completed:</span> ${report.completedAt}</div>
            <div class="timeline-item"><span class="label">Verified:</span> ${report.verifiedAt}</div>
            <div class="timeline-item"><span class="label">Turnaround Time:</span> ${report.turnaroundTime}</div>
          </div>

          ${report.report ? `
          <div class="patient-info" style="margin-top: 20px;">
            <h3>Report Content</h3>
            <div style="margin: 10px 0;"><div class="label">Report:</div><div style="white-space: pre-wrap;">${report.report}</div></div>
          </div>
          ` : ''}

          <div class="signatures">
            <h3>Signatures</h3>
            <div class="signature-item">
              <div><span class="label">Ordering Doctor:</span> ${report.orderingDoctor}</div>
              <div><span class="label">Verified By:</span> ${report.verifiedBy}</div>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownload = (report: CompletedReport) => {
    if (!report.reportFile) {
      toast.error('No report file available for download');
      return;
    }

    try {
      // Create download link
      const link = document.createElement('a');
      link.href = report.reportFile.url;
      link.download = `radiology_report_${report.patientName.replace(/\s+/g, '_')}_${report.id}.pdf`;
      link.target = '_blank';

      // Add to DOM temporarily
      document.body.appendChild(link);

      // Trigger download
      link.click();

      // Remove from DOM
      document.body.removeChild(link);

      toast.success('Report download started');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download report. Please try again.');
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              Completed Studies
            </h1>
            <p className="text-muted-foreground mt-1">History of verified and completed radiology studies</p>
          </div>
          <Button variant="outline" onClick={loadReports} disabled={loading}>
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
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by patient, report ID, or study..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Button variant="outline" onClick={() => setIsDateFilterDialogOpen(true)}>
                Filters
              </Button>
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
                  {clinics.map(clinic => (
                    <SelectItem key={clinic.id} value={clinic.name}>{clinic.name}</SelectItem>
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
          ) : filteredReports.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No completed reports found</h3>
              <p>Reports will appear here after verification in Orders Queue</p>
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
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                          report.overallStatus === 'Critical' ? 'bg-rose-100 dark:bg-rose-900/30' :
                          report.overallStatus === 'Abnormal' ? 'bg-amber-100 dark:bg-amber-900/30' :
                          'bg-emerald-100 dark:bg-emerald-900/30'
                        }`}>
                          <PatientAvatar name={report.patient.name} size="sm" />
                        </div>

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
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handlePrint(report)}>
                                <Printer className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(report)}>
                                <Download className="h-4 w-4 text-muted-foreground hover:text-emerald-500" />
                              </Button>
                            </div>
                          </div>

                          {/* Row 2: Details */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>{report.patient.age !== null && report.patient.age !== undefined ? `${report.patient.age}y` : ''} {report.patient.gender}</span>
                            <span>•</span>
                            <span>{report.orderId}</span>
                            <span>•</span>
                            <span>{report.studyName}</span>
                            <span>•</span>
                            <span>{report.clinic || 'Main Clinic'}</span>
                            <span>•</span>
                            <span>{completed.date} {completed.time}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{report.turnaroundTime}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

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
            </>
          )}
        </div>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-500" />Radiology Report</DialogTitle>
              <DialogDescription>{selectedReport?.studyName} - {selectedReport?.patient.name}</DialogDescription>
            </DialogHeader>
            {selectedReport && (
              <div className="space-y-6 py-4">
                {/* Header */}
                <div className="text-center p-4 border-b">
                  <h2 className="text-xl font-bold">RADIOLOGY REPORT</h2>
                  <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
                </div>

                {/* Patient & Study Info */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient Name</p>
                    <p className="font-medium">{selectedReport.patient.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Age / Gender</p>
                    <p className="font-medium">{selectedReport.patient.age !== null && selectedReport.patient.age !== undefined ? `${selectedReport.patient.age} years` : ''} / {selectedReport.patient.gender}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ordering Doctor</p>
                    <p className="font-medium">{selectedReport.doctor.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Order ID</p>
                    <p className="font-medium">{selectedReport.orderId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Study Name</p>
                    <p className="font-medium">{selectedReport.studyName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="font-medium">{selectedReport.category}</p>
                  </div>
                </div>

                {/* Study Details */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <ScanLine className="h-4 w-4 text-cyan-500" />
                    Study Details
                    <Badge variant="outline" className={selectedReport.overallStatus === 'Critical' ? 'border-rose-500 text-rose-700' : 'border-emerald-500 text-emerald-700'}>
                      {selectedReport.overallStatus}
                    </Badge>
                  </h3>

                  {/* Report File Info */}
                  {selectedReport.reportFile && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Radiology Report File Available</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (selectedReport.reportFile) {
                                // Open in new tab for viewing
                                const link = document.createElement('a');
                                link.href = selectedReport.reportFile.url;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(selectedReport)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
                    <p className="text-sm font-medium text-cyan-800 dark:text-cyan-200">{selectedReport.studyName}</p>
                    <p className="text-xs text-muted-foreground mt-1">Category: {selectedReport.category} | Status: {selectedReport.overallStatus}</p>
                  </div>
                </div>

                {selectedReport.report && (
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-500" />
                      Report Content
                    </h3>
                    <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
                      <div>
                        <p className="text-xs text-muted-foreground font-medium mb-1">Report</p>
                        <p className="text-sm whitespace-pre-wrap">{selectedReport.report}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Report File (uploaded document) */}
                {selectedReport.reportFile && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      Attached Report
                    </h3>
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">{selectedReport.reportFile.name}</span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (selectedReport.reportFile?.url) {
                                const link = document.createElement('a');
                                link.href = selectedReport.reportFile.url;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Eye className="h-3 w-3 mr-1" />View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(selectedReport)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Download className="h-3 w-3 mr-1" />Download
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Ordered</p>
                    <p className="font-medium">{selectedReport.orderedAt ? `${formatDateTime(selectedReport.orderedAt).date} ${formatDateTime(selectedReport.orderedAt).time}` : 'Unknown'}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="font-medium">{selectedReport.completedAt ? `${formatDateTime(selectedReport.completedAt).date} ${formatDateTime(selectedReport.completedAt).time}` : 'Unknown'}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Verified</p>
                    <p className="font-medium">{selectedReport.verifiedAt ? `${formatDateTime(selectedReport.verifiedAt).date} ${formatDateTime(selectedReport.verifiedAt).time}` : 'Unknown'}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Turnaround Time</p>
                    <p className="font-medium">{selectedReport.turnaroundTime}</p>
                  </div>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">Reported By</p>
                    <p className="font-medium">{selectedReport.verifiedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Verified By</p>
                    <p className="font-medium">{selectedReport.verifiedBy}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              <Button variant="outline" onClick={() => selectedReport && handlePrint(selectedReport)}>
                <Printer className="h-4 w-4 mr-2" />Print
              </Button>
              <Button onClick={() => selectedReport && handleDownload(selectedReport)}>
                <Download className="h-4 w-4 mr-2" />Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
