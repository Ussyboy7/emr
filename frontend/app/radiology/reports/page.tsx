"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { radiologyService, type RadiologyReport as ApiRadiologyReport } from '@/lib/services';
import { 
  FileBarChart, Search, Eye, CheckCircle2, AlertTriangle, 
  User, ScanLine, Calendar, Stethoscope, RefreshCw, Loader2
} from 'lucide-react';

interface RadiologyReport {
  id: string;
  patient: {
    id: string;
    name: string;
    age: number;
    gender: string;
  };
  study: string;
  studyId: string;
  category: string;
  radiologist: string;
  orderedBy: string;
  date: string;
  findings: string;
  impression: string;
  status: 'Draft' | 'Verified';
  critical: boolean;
}

// Transform backend report to frontend format
const transformReport = (apiReport: ApiRadiologyReport): RadiologyReport => {
  const study = apiReport.study_details || apiReport.study;
  const dateStr = study?.created_at ? new Date(study.created_at).toISOString().split('T')[0] : '';
  
  return {
    id: apiReport.id.toString(),
    patient: {
      id: apiReport.patient?.toString() || '',
      name: apiReport.patient_name || 'Unknown',
      age: 0, // Would need patient API
      gender: 'Unknown', // Would need patient API
    },
    study: study?.procedure || '',
    studyId: apiReport.order_id || '',
    category: study?.modality || 'X-Ray',
    radiologist: study?.reported_by || study?.verified_by || 'Unknown',
    orderedBy: '',
    date: dateStr,
    findings: study?.findings || '',
    impression: study?.impression || '',
    status: 'Verified' as const,
    critical: apiReport.overall_status === 'critical',
  };
};

export default function ReportsPage() {
  // Only show Verified (completed) reports - this is the archive
  const [reports, setReports] = useState<RadiologyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Dialog states
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<RadiologyReport | null>(null);

  // Load verified reports from API
  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await radiologyService.getVerifiedReports({
        page: currentPage,
      });
      const transformedReports = response.results.map(transformReport);
      setReports(transformedReports);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
      toast.error('Failed to load completed reports. Please try again.');
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = useMemo(() => reports.filter(report => {
    const matchesSearch = report.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         report.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         report.study.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || report.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }), [reports, searchQuery, categoryFilter]);

  // Paginated reports
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredReports.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredReports, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter]);

  const stats = useMemo(() => [
    { label: 'Total Reports', value: reports.length, icon: FileBarChart, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { label: 'X-Ray', value: reports.filter(r => r.category === 'X-Ray').length, icon: ScanLine, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'CT/MRI', value: reports.filter(r => r.category === 'CT Scan' || r.category === 'MRI').length, icon: Stethoscope, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { label: 'Critical', value: reports.filter(r => r.critical).length, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  ], [reports]);

  const openViewDialog = (report: RadiologyReport) => {
    setSelectedReport(report);
    setIsViewDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'Verified') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  };

  const getBorderColor = (report: RadiologyReport) => {
    if (report.critical) return 'border-l-rose-500';
    if (report.status === 'Verified') return 'border-l-emerald-500';
    return 'border-l-amber-500';
  };

  // Report Card Component
  const ReportCard = ({ report }: { report: RadiologyReport }) => (
    <Card className={`border-l-4 hover:shadow-md transition-shadow ${getBorderColor(report)} ${report.critical ? 'bg-rose-50/50 dark:bg-rose-900/5' : ''}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
            report.critical ? 'bg-rose-100 dark:bg-rose-900/30' :
            report.status === 'Verified' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
            'bg-amber-100 dark:bg-amber-900/30'
          }`}>
            <span className={`font-semibold text-xs ${
              report.critical ? 'text-rose-600' :
              report.status === 'Verified' ? 'text-emerald-600' :
              'text-amber-600'
            }`}>
              {report.patient.name.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Name + Badges + Actions */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="font-semibold text-foreground truncate">{report.patient.name}</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusBadge(report.status)}`}>
                  {report.status === 'Verified' && <CheckCircle2 className="h-2 w-2 mr-0.5" />}
                  {report.status}
                </Badge>
                {report.critical && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-rose-500 text-white">
                    <AlertTriangle className="h-2 w-2 mr-0.5" />Critical
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  <ScanLine className="h-2 w-2 mr-0.5" />{report.category}
                </Badge>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(report)}>
                  <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </Button>
              </div>
            </div>
            
            {/* Row 2: Study & Details */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
              <span className="font-medium text-foreground">{report.study}</span>
              <span>•</span>
              <span>{report.id}</span>
              <span>•</span>
              <span>{report.patient.age}y {report.patient.gender}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />{report.radiologist}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />{report.date}
              </span>
            </div>
            
            {/* Row 3: Impression Preview */}
            {report.impression && (
              <p className={`text-xs mt-1.5 line-clamp-1 ${report.critical ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
                {report.impression}
              </p>
            )}
            {!report.impression && report.status === 'Draft' && (
              <p className="text-xs mt-1.5 text-amber-600 italic">Pending radiologist interpretation...</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Completed Reports</h1>
            <p className="text-muted-foreground mt-1">Archive of verified radiology reports</p>
          </div>
          <Button variant="outline" onClick={loadReports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by patient, report ID, or study..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="X-Ray">X-Ray</SelectItem>
                  <SelectItem value="CT Scan">CT Scan</SelectItem>
                  <SelectItem value="MRI">MRI</SelectItem>
                  <SelectItem value="Ultrasound">Ultrasound</SelectItem>
                  <SelectItem value="Mammography">Mammography</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Reports List */}
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading reports...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" className="mt-4" onClick={loadReports}>Retry</Button>
              </CardContent>
            </Card>
          ) : paginatedReports.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileBarChart className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No completed reports found</p>
                <p className="text-sm text-muted-foreground mt-1">Reports will appear here after verification in Orders Queue</p>
              </CardContent>
            </Card>
          ) : (
            paginatedReports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))
          )}
        </div>

        {/* Pagination */}
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

        {/* View Report Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-cyan-500" />
                Radiology Report
              </DialogTitle>
              <DialogDescription>{selectedReport?.study} - {selectedReport?.patient.name}</DialogDescription>
            </DialogHeader>
            {selectedReport && (
              <div className="py-4 space-y-4">
                {/* Header Info */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-muted-foreground">Report ID</p>
                      <p className="font-medium">{selectedReport.id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Study ID</p>
                      <p className="font-medium">{selectedReport.studyId}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Date</p>
                      <p className="font-medium">{selectedReport.date}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Radiologist</p>
                      <p className="font-medium">{selectedReport.radiologist}</p>
                    </div>
                  </div>
                  <Badge className={getStatusBadge(selectedReport.status)}>{selectedReport.status}</Badge>
                </div>
                
                {selectedReport.critical && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <p className="text-sm font-medium text-rose-600 dark:text-rose-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />CRITICAL FINDING - Immediate attention required
                    </p>
                  </div>
                )}
                
                <div className="p-4 rounded-lg border">
                  <p className="text-sm font-medium text-muted-foreground mb-2">FINDINGS</p>
                  <p className="text-foreground whitespace-pre-wrap">{selectedReport.findings || 'No findings documented.'}</p>
                </div>
                
                <div className="p-4 rounded-lg border">
                  <p className="text-sm font-medium text-muted-foreground mb-2">IMPRESSION</p>
                  <p className={`whitespace-pre-wrap ${selectedReport.critical ? 'text-rose-600 font-medium' : 'text-foreground'}`}>
                    {selectedReport.impression || 'No impression documented.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-muted-foreground">Ordered By</p>
                    <p className="font-medium">{selectedReport.orderedBy}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Patient</p>
                    <p className="font-medium">{selectedReport.patient.name} ({selectedReport.patient.age}y {selectedReport.patient.gender})</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
