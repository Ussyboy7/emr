"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { radiologyService, adminService } from '@/lib/services';
import { PatientAvatar } from "@/components/PatientAvatar";
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/CustomDateRangeButton';
import { RadiologyCompletedReportDialog } from '@/components/radiology/RadiologyCompletedReportDialog';
import {
  transformApiRadiologyReportToCompleted,
  type CompletedRadiologyReport,
} from '@/lib/radiology/completedRadiologyReport';
import { downloadRadiologyReportFile, printRadiologyReport } from '@/lib/radiology/radiologyReportActions';

import {
  CheckCircle2, Search, Eye, Clock, AlertTriangle,
  Stethoscope, RefreshCw, Download, Loader2, Printer
} from 'lucide-react';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';

export default function CompletedReportsPage() {
  const [reports, setReports] = useState<CompletedRadiologyReport[]>([]);
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
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [clinics, setClinics] = useState<any[]>([]);

  // Dialog states
  const [selectedReport, setSelectedReport] = useState<CompletedRadiologyReport | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
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

      const transformedReports = response.results.map((apiReport: any) =>
        transformApiRadiologyReportToCompleted(apiReport)
      );

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

  const openViewDialog = (report: CompletedRadiologyReport) => {
    setSelectedReport(report);
    setIsViewDialogOpen(true);
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
