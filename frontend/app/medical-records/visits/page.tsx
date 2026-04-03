"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { consultationService, visitService, type Visit } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import {
  Search, Plus, Calendar, Clock, CheckCircle2,
  Edit, Send, AlertTriangle, Loader2, Eye, X, FileText
} from 'lucide-react';
import { StandardPagination } from '@/components/StandardPagination';
import { CustomDateRangeButton } from '@/components/CustomDateRangeButton';
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';
import { getAllClinicsWithAll, CLINICS } from '@/lib/constants/clinics';
import {
  normalizeClinicName,
  getVisitServiceClinicsDisplay,
} from '@/lib/utils/clinic-utils';
import { useLocationOptions } from '@/lib/hooks/use-location-options';
import { ConsultationReportModal } from '@/components/consultation/ConsultationReportModal';
import { loadConsultationReportSession, type ConsultationReportSession } from '@/lib/consultation-report';

// NPA Clinics - standardized list
const clinics = getAllClinicsWithAll();

// Visits data will be loaded from API

export default function VisitsPage() {
  const router = useRouter();
  const { locations: locationOptions } = useLocationOptions();
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [clinicFilter, setClinicFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today'); // Default to today
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  
  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSession, setReportSession] = useState<ConsultationReportSession | null>(null);
  type TransformedVisit = ReturnType<typeof transformVisit>;
  const [selectedVisit, setSelectedVisit] = useState<TransformedVisit | null>(null);
  const [visitToCancel, setVisitToCancel] = useState<TransformedVisit | null>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState({ type: '', clinic: '', location: '', notes: '' });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Stats state (separate from pagination)
  const [statsData, setStatsData] = useState({
    total: 0,
    scheduled: 0,
    inProgress: 0,
    completed: 0,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Helper function to transform visit from API to frontend format
  const transformVisit = (visit: Visit) => ({
    id: String(visit.id), // Always use numeric ID for API calls
    numericId: visit.id, // Keep numeric ID for backend API calls
    visitId: visit.visit_id || String(visit.id), // Display ID (visit_id string)
    patientId: visit.patient_id || '',
    patient: visit.patient_name ?? '',
    type: visit.visit_type || 'consultation', // Use backend value (lowercase)
    clinic: visit.clinic || '',
    clinics: visit.clinics || [], // All clinics for this visit
    completedClinics: visit.completed_clinics || [], // Completed clinics
    date: visit.date,
    time: visit.time,
    status: visit.status === 'scheduled' ? 'Scheduled' :
           visit.status === 'in_progress' ? 'In Progress' :
           visit.status === 'completed' ? 'Completed' :
           visit.status === 'cancelled' ? 'Cancelled' : visit.status,
    department: getVisitServiceClinicsDisplay({ clinic: visit.clinic, clinics: visit.clinics }),
    notes: visit.clinical_notes || '',
    location: visit.location || '',
    isNewRegistration: Boolean(visit.is_new_registration),
    isFirstVisit: Boolean(visit.is_first_visit),
    isReturningVisit: Boolean(visit.is_returning_visit),
    patientVisitStatus: visit.patient_visit_status || '',
  });

  // Helper function to build date filter parameters
  const buildDateParams = useCallback(() => {
    let dateParam: string | undefined = undefined;
    let startDate: string | undefined = undefined;
    let endDate: string | undefined = undefined;
    
    if (dateRange.from || dateRange.to) {
      startDate = dateRange.from || undefined;
      endDate = dateRange.to || undefined;
    } else if (dateFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      dateParam = today;
    } else if (dateFilter === 'week') {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      startDate = weekStart.toISOString().split('T')[0];
      endDate = today.toISOString().split('T')[0];
    } else if (dateFilter === 'month') {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate = monthStart.toISOString().split('T')[0];
      endDate = today.toISOString().split('T')[0];
    }
    // 'all' means no date filter

    return { dateParam, startDate, endDate };
  }, [dateFilter, dateRange.from, dateRange.to]);

  // Load stats - separate from pagination to get accurate counts
  const loadStats = useCallback(async () => {
    try {
      const { dateParam, startDate, endDate } = buildDateParams();
      
      // Build base params for stats (without pagination, without status filter)
      const baseParams = {
        page: 1,
        page_size: 1, // We only need the count, not the data
        search: debouncedSearchQuery || undefined,
        visit_type: typeFilter !== 'all' ? typeFilter : undefined,
        clinic: clinicFilter !== 'all' ? clinicFilter : undefined,
        date: dateParam,
        start_date: startDate,
        end_date: endDate,
      };

      // Fetch counts for each status in parallel
      const [totalResult, scheduledResult, inProgressResult, completedResult] = await Promise.all([
        visitService.getVisits({ ...baseParams }),
        visitService.getVisits({ ...baseParams, status: 'scheduled' }),
        visitService.getVisits({ ...baseParams, status: 'in_progress' }),
        visitService.getVisits({ ...baseParams, status: 'completed' }),
      ]);

      setStatsData({
        total: totalResult.count || 0,
        scheduled: scheduledResult.count || 0,
        inProgress: inProgressResult.count || 0,
        completed: completedResult.count || 0,
      });
    } catch (err) {
      console.error('Error loading stats:', err);
      // Don't set error state for stats - visits will still load
    }
  }, [debouncedSearchQuery, typeFilter, clinicFilter, buildDateParams]);

  // Load visits from API - extracted as a reusable function
  const loadVisits = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const { dateParam, startDate, endDate } = buildDateParams();

      const filterParams = {
        page: currentPage,
        page_size: itemsPerPage,
        search: debouncedSearchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        visit_type: typeFilter !== 'all' ? typeFilter : undefined,
        clinic: clinicFilter !== 'all' ? clinicFilter : undefined,
        date: dateParam,
        start_date: startDate,
        end_date: endDate,
        ordering: '-date,-time',
      };

      const result = await visitService.getVisits(filterParams);
      setTotalCount(result.count || result.results.length);
      
      // Transform visits to match frontend structure
      const transformedVisits = result.results.map(transformVisit);
      const newestFirst = [...transformedVisits].sort((a, b) => {
        const aTime = new Date(`${a.date}T${a.time}`).getTime();
        const bTime = new Date(`${b.date}T${b.time}`).getTime();
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      });
      setVisits(newestFirst);
    } catch (err) {
      console.error('Error loading visits:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else if (!silent) {
        setError('Failed to load visits. Please try again.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentPage, itemsPerPage, debouncedSearchQuery, statusFilter, typeFilter, clinicFilter, buildDateParams]);

  // Load visits when filters change
  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  // Load stats when filters change (except status filter and pagination)
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const pollingPaused = useMemo(
    () =>
      isDateFilterDialogOpen ||
      isEditModalOpen ||
      isViewModalOpen ||
      isForwardModalOpen ||
      isCancelModalOpen ||
      isReportModalOpen,
    [
      isDateFilterDialogOpen,
      isEditModalOpen,
      isViewModalOpen,
      isForwardModalOpen,
      isCancelModalOpen,
      isReportModalOpen,
    ]
  );

  useEffect(() => {
    if (pollingPaused) return;
    const id = setInterval(() => {
      void loadVisits({ silent: true });
      void loadStats();
    }, 15000);
    return () => clearInterval(id);
  }, [loadVisits, loadStats, pollingPaused]);

  // With server-side pagination, visits array contains only current page results
  const paginatedVisits = visits;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, statusFilter, typeFilter, clinicFilter, dateFilter, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // Stats - 4 cards with useful metrics (now from separate API calls for accuracy)
  const stats = useMemo(() => {
    return [
      { label: dateFilter === 'today' ? "Today's Visits" : dateFilter === 'week' ? "This Week" : dateFilter === 'month' ? "This Month" : "All Visits", value: statsData.total, icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { label: 'Scheduled', value: statsData.scheduled, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
      { label: 'In Progress', value: statsData.inProgress, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { label: 'Completed', value: statsData.completed, icon: CheckCircle2, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    ];
  }, [statsData, dateFilter]);

  const handleEditVisit = (visit: typeof visits[0]) => {
    setSelectedVisit(visit);
    setEditForm({
      type: visit.type,
      clinic: visit.clinic,
      location: visit.location,
      notes: visit.notes,
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedVisit) return;

    try {
      // Find the visit to get numeric ID
      const visitToUpdate = visits.find(v => v.id === selectedVisit.id);
      if (!visitToUpdate) {
        toast.error('Visit not found');
        return;
      }

      // Use numeric ID for API calls (backend expects primary key, not visit_id string)
      const visitId = selectedVisit.numericId || Number(selectedVisit.id);
      
      const updateData: any = {
        visit_type: editForm.type || undefined,
        clinic: editForm.clinic ? normalizeClinicName(editForm.clinic) : undefined,
        location: editForm.location || undefined,
        clinical_notes: editForm.notes || undefined,
      };

      await visitService.updateVisit(visitId, updateData);
      
      // Reload visits with current filters preserved
      await loadVisits();
      setIsEditModalOpen(false);
      toast.success('Visit updated successfully');
    } catch (err: any) {
      console.error('Error updating visit:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to update visit. Please try again.');
      }
    }
  };

  const handleForwardToNursing = (visit: typeof visits[0]) => {
    setSelectedVisit(visit);
    setIsForwardModalOpen(true);
  };

  const confirmForwardToNursing = async () => {
    if (!selectedVisit) return;

    try {
      // Use numeric ID for API calls (backend expects primary key, not visit_id string)
      const visitId = selectedVisit.numericId || Number(selectedVisit.id);
      
      // Update visit status to in_progress (sent to nursing)
      await visitService.updateVisit(visitId, { status: 'in_progress' });
      
      // Reload visits with current filters preserved
      await loadVisits();
      setIsForwardModalOpen(false);
      toast.success(`${selectedVisit.patient} has been sent to Nursing`, {
        description: 'The patient will appear in the Nursing Pool Queue.',
      });
    } catch (err: any) {
      console.error('Error forwarding visit to nursing:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to forward visit. Please try again.');
      }
    }
  };

  const handleCancelVisit = (visit: TransformedVisit) => {
    setVisitToCancel(visit);
    setIsCancelModalOpen(true);
  };

  const handleOpenVisitReport = async (visit: TransformedVisit) => {
    try {
      setReportLoading(true);
      setReportSession(null);
      setIsReportModalOpen(true);

      const sessions = await consultationService.getSessions({
        visit: visit.numericId,
        status: 'completed',
        ordering: '-ended_at',
        page: 1,
        page_size: 1,
      });

      const session = sessions.results?.[0];
      if (!session?.id) {
        toast.error('No completed consultation report found for this visit.');
        setIsReportModalOpen(false);
        return;
      }

      const fullSession = await loadConsultationReportSession(Number(session.id));
      setReportSession(fullSession);
    } catch (err: any) {
      console.error('Error loading visit report:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error('Failed to load consultation report.');
      }
      setIsReportModalOpen(false);
    } finally {
      setReportLoading(false);
    }
  };

  const confirmCancelVisit = async () => {
    if (!visitToCancel) return;
    try {
      const visitId = visitToCancel.numericId || Number(visitToCancel.id);
      await visitService.updateVisit(visitId, { status: 'cancelled' });
      await loadVisits();
      setIsCancelModalOpen(false);
      setVisitToCancel(null);
      toast.success('Visit cancelled', {
        description: `${visitToCancel.patient} will not be sent to nursing.`,
      });
    } catch (err: any) {
      console.error('Error cancelling visit:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to cancel visit. Please try again.');
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'Scheduled': 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10',
      'In Progress': 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10',
      'Completed': 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
      'Cancelled': 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10',
    };
    return styles[status] || 'border-muted-foreground/50 text-muted-foreground';
  };

  // Helper to get display label for visit type
  const getVisitTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      'consultation': 'Consultation',
      'follow_up': 'Follow-up',
      'emergency': 'Emergency',
      'routine': 'Routine Checkup',
    };
    return typeMap[type] || type;
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      'consultation': 'border-teal-500/50 text-teal-600 dark:text-teal-400',
      'follow_up': 'border-blue-500/50 text-blue-600 dark:text-blue-400',
      'emergency': 'border-rose-500/50 text-rose-600 dark:text-rose-400',
      'routine': 'border-violet-500/50 text-violet-600 dark:text-violet-400',
    };
    return styles[type] || 'border-muted-foreground/50 text-muted-foreground';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'emergency': return 'border-l-rose-500';
      case 'follow_up': return 'border-l-blue-500';
      case 'routine': return 'border-l-violet-500';
      default: return 'border-l-teal-500';
    }
  };

  const getPatientVisitStatusBadge = (visit: TransformedVisit) => {
    if (visit.isFirstVisit) {
      return {
        label: 'First Visit',
        className: 'border-indigo-500/50 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
      };
    }

    if (visit.isNewRegistration) {
      return {
        label: 'New Registration',
        className: 'border-cyan-500/50 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10',
      };
    }

    if (visit.isReturningVisit) {
      return {
        label: 'Returning',
        className: 'border-slate-500/50 text-slate-600 dark:text-slate-300 bg-slate-500/10',
      };
    }

    return null;
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Manage Visits</h1>
            <p className="text-muted-foreground mt-1">Create visits and forward patients to nursing for vitals</p>
          </div>
          <Button className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white" asChild>
            <Link href="/medical-records/visits/new"><Plus className="h-4 w-4 mr-2" />Create Visit</Link>
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats - 4 cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl sm:text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
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
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by patient name, visit ID, or patient ID..." 
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
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="scheduled">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="routine">Routine Checkup</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={clinicFilter} onValueChange={setClinicFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Clinic" /></SelectTrigger>
                  <SelectContent>
                    {clinics.map(c => <SelectItem key={c} value={c === 'All Clinics' ? 'all' : c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom visit date range to narrow down the visit list."
          label="Visit Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {/* Results Count */}
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{paginatedVisits.length}</span> visits
            </p>
          </div>

          {/* Visit Cards */}
          <div className="space-y-2">
            {loading ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">Loading visits...</p>
                </CardContent>
              </Card>
            ) : paginatedVisits.length > 0 ? (
              paginatedVisits.map((visit) => {
                  const visitLifecycleBadge = getPatientVisitStatusBadge(visit);
                  return (
            <Card key={visit.id} className={`border-l-4 ${getTypeColor(visit.type)} hover:shadow-md transition-shadow`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {/* Patient Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    visit.type === 'emergency' ? 'bg-rose-100 dark:bg-rose-900/30' :
                    visit.type === 'follow_up' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    visit.type === 'routine' ? 'bg-violet-100 dark:bg-violet-900/30' :
                    'bg-teal-100 dark:bg-teal-900/30'
                  }`}>
                    <span className={`font-semibold text-xs ${
                      visit.type === 'emergency' ? 'text-rose-600 dark:text-rose-400' :
                      visit.type === 'follow_up' ? 'text-blue-600 dark:text-blue-400' :
                      visit.type === 'routine' ? 'text-violet-600 dark:text-violet-400' :
                      'text-teal-600 dark:text-teal-400'
                    }`}>
                      {visit.patient.split(' ').map((n: string) => n[0]).join('')}
                    </span>
                  </div>
                  
                  {/* Visit Details */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {/* Row 1: Name + Badges */}
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground text-sm truncate">{visit.patient}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getTypeBadge(visit.type)}`}>{getVisitTypeLabel(visit.type)}</Badge>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusBadge(visit.status)}`}>
                        {visit.status === 'Scheduled' ? 'Pending' : visit.status}
                      </Badge>
                      {visitLifecycleBadge && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${visitLifecycleBadge.className}`}>
                          {visitLifecycleBadge.label}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Row 2: IDs + Clinic(s) + Location + Date/Time */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span>{visit.patientId}</span>
                      <span>•</span>
                      {visit.clinics && visit.clinics.length > 1 ? (
                        <div className="flex gap-1 flex-wrap">
                          {visit.clinics.map((clinic: string, idx: number) => {
                            const isCompleted = visit.completedClinics?.includes(clinic);
                            return (
                              <Badge 
                                key={idx} 
                                variant="outline" 
                                className={`text-[10px] px-1 py-0 h-4 ${
                                  isCompleted 
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                                    : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                                }`}
                              >
                                {clinic}{isCompleted && ' ✓'}
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <span>{visit.department}</span>
                      )}
                      <span>•</span>
                      <span>{visit.location}</span>
                      <span>•</span>
                      <span>{visit.date} {visit.time}</span>
                    </div>
                    {/* Row 3: Notes (if available) */}
                    {visit.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        <span className="font-medium">Notes:</span> {visit.notes}
                      </p>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                      setSelectedVisit(visit);
                      setIsViewModalOpen(true);
                    }} title="View Visit">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {visit.status === 'Scheduled' && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditVisit(visit)} title="Edit Visit">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleCancelVisit(visit)}
                          title="Cancel Visit"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          size="sm"
                          className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          onClick={() => handleForwardToNursing(visit)}
                        >
                          <Send className="h-3 w-3 mr-1" />Send
                        </Button>
                      </>
                    )}
                    
                    {visit.status === 'Completed' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleOpenVisitReport(visit)}
                          title="View Consultation Report"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        <div className="h-7 w-7 flex items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                  </CardContent>
            </Card>
                  );
                })
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-1">No visits found</p>
                  <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Pagination */}
          {!loading && paginatedVisits.length > 0 && (
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1);
              }}
              itemName="visits"
              pageSizeOptions={[50, 75, 100]}
            />
          )}
        </>

        {/* Edit Visit Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-500" />
                Edit Visit Details
              </DialogTitle>
              <DialogDescription>
                Update the visit details for {selectedVisit?.patient}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Visit Type</Label>
                  <Select value={editForm.type} onValueChange={(v) => setEditForm(prev => ({ ...prev, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="routine">Routine Checkup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Clinic</Label>
                  <Select value={editForm.clinic} onValueChange={(v) => setEditForm(prev => ({ ...prev, clinic: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLINICS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select value={editForm.location} onValueChange={(v) => setEditForm(prev => ({ ...prev, location: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locationOptions.filter((l) => l.value !== "all").map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes / Special Instructions</Label>
                <Textarea 
                  value={editForm.notes} 
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any special instructions, referral notes, or additional information..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Visit Modal */}
        <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-500" />
                Visit Details
              </DialogTitle>
              <DialogDescription>
                {selectedVisit?.patient}
              </DialogDescription>
            </DialogHeader>
            {selectedVisit && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Visit Type</Label>
                    <p className="font-medium">{getVisitTypeLabel(selectedVisit.type)}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Status</Label>
                    <p className="font-medium">{selectedVisit.status}</p>
                  </div>
                </div>
                {(selectedVisit.department || selectedVisit.location) && (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedVisit.department ? (
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Clinic</Label>
                        <p className="font-medium">{selectedVisit.department}</p>
                      </div>
                    ) : null}
                    {selectedVisit.location ? (
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Location</Label>
                        <p className="font-medium">{selectedVisit.location}</p>
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Date</Label>
                    <p className="font-medium">{selectedVisit.date}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Time</Label>
                    <p className="font-medium">{selectedVisit.time}</p>
                  </div>
                </div>
                {selectedVisit.notes && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Notes / Special Instructions</Label>
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <p className="text-sm whitespace-pre-wrap">{selectedVisit.notes}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>Close</Button>
              {selectedVisit?.status === 'Scheduled' && (
                <Button onClick={() => {
                  setIsViewModalOpen(false);
                  handleEditVisit(selectedVisit);
                }}>
                  <Edit className="h-4 w-4 mr-2" />Edit
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send to Nursing Confirmation Modal */}
        <Dialog open={isForwardModalOpen} onOpenChange={setIsForwardModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-emerald-500" />
                Send to Nursing
              </DialogTitle>
              <DialogDescription>
                Confirm and send <strong>{selectedVisit?.patient}</strong> to the Nursing Pool Queue.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  <strong>What happens next:</strong>
                </p>
                <ul className="list-disc list-inside text-sm text-emerald-700 dark:text-emerald-300 mt-2 space-y-1">
                  <li>Patient appears in Nursing Pool Queue</li>
                  <li>Nurse records vital signs</li>
                  <li>Patient proceeds to consultation</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsForwardModalOpen(false)}>Cancel</Button>
              <Button onClick={confirmForwardToNursing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Send className="h-4 w-4 mr-2" />Confirm & Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Visit Confirmation Modal */}
        <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Cancel Visit
              </DialogTitle>
              <DialogDescription>
                Cancel <strong>{visitToCancel?.patient}</strong>’s visit (<strong>{visitToCancel?.visitId}</strong>). This will prevent sending to nursing.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">
                  This visit will be marked as <strong>Cancelled</strong>.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsCancelModalOpen(false); setVisitToCancel(null); }}>
                Keep Visit
              </Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmCancelVisit} disabled={!visitToCancel}>
                <X className="h-4 w-4 mr-2" />
                Confirm Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConsultationReportModal
          open={isReportModalOpen}
          onOpenChange={setIsReportModalOpen}
          session={reportSession}
          loading={reportLoading}
        />
      </div>
    </DashboardLayout>
  );
}
