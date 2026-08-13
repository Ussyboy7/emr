"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
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
import { useRouter, useSearchParams } from 'next/navigation';
import { visitService, type Visit, type VisitClinicalSummary } from '@/lib/services';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMedicalRecordsPageAuth } from '@/hooks/use-medical-records-page-auth';
import {
  Search,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  Edit,
  Send,
  AlertTriangle,
  Loader2,
  Eye,
  X,
  FileText,
} from 'lucide-react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import {
  buildVisitClinicFilterOptions,
  ALL_CLINICS_FILTER_LABEL,
} from '@/lib/constants/clinics';
import {
  normalizeClinicName,
  getVisitServiceClinicsDisplay,
} from '@/lib/utils/clinic-utils';
import { useLocationOptions } from '@/hooks/use-location-options';
import { useServerToday } from '@/hooks/use-server-today';
import { localWeekToTodayBounds } from '@/lib/dates';
import { formatLocalYmd } from '@/lib/laboratory/constants';
import { useOutpatientClinicTypes } from '@/hooks/use-outpatient-clinic-types';
import { VisitSummaryModal } from '@/components/medical-records/VisitSummaryModal';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { resolvePatientPhoto } from '@/lib/patient-photo';

export default function VisitsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serverToday = useServerToday();
  const { locations: locationOptions } = useLocationOptions();
  const { names: opdClinicNames } = useOutpatientClinicTypes();
  const clinicFilterOptions = useMemo(
    () => buildVisitClinicFilterOptions(opdClinicNames),
    [opdClinicNames]
  );
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
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
  const [reportSummary, setReportSummary] = useState<VisitClinicalSummary | null>(null);
  type TransformedVisit = ReturnType<typeof transformVisit>;
  const [selectedVisit, setSelectedVisit] = useState<TransformedVisit | null>(null);
  const [visitToCancel, setVisitToCancel] = useState<TransformedVisit | null>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState({ type: '', clinic: '', location: '', notes: '' });
  /** Clinics to append on save (Manage Visits — in-workflow add Physio etc.) */
  const [clinicsToAppend, setClinicsToAppend] = useState<string[]>([]);
  const [extraClinicPick, setExtraClinicPick] = useState('');
  
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

  // Helper function to transform visit from API to frontend format
  const transformVisit = (visit: Visit) => ({
    id: String(visit.id), // Always use numeric ID for API calls
    numericId: visit.id, // Keep numeric ID for backend API calls
    visitId: visit.visit_id || String(visit.id), // Display ID (visit_id string)
    patientId: visit.patient_id || '',
    patient: visit.patient_name ?? '',
    patientPhoto: resolvePatientPhoto(visit),
    type: visit.visit_type || 'consultation', // Use backend value (lowercase)
    clinic: visit.clinic || '',
    clinics: visit.clinics || [], // All clinics for this visit
    completedClinics: visit.completed_clinics || [], // Completed clinics
    /** Raw API status — used to respect VisitSerializer workflow guardrails on PATCH */
    visitStatusRaw: visit.status,
    date: visit.date,
    time: visit.time,
    status: visit.status === 'scheduled' ? 'Scheduled' :
           visit.status === 'in_progress' ? 'In Progress' :
           visit.status === 'completed' ? 'Completed' :
           visit.status === 'cancelled' ? 'Cancelled' : visit.status,
    department: getVisitServiceClinicsDisplay({ clinic: visit.clinic, clinics: visit.clinics }),
    notes: visit.clinical_notes || '',
    location: visit.location || '',
    location_clinic_name: visit.location_clinic_name || undefined,
    isNewRegistration: Boolean(visit.is_new_registration),
    isFirstVisit: Boolean(visit.is_first_visit),
    isReturningVisit: Boolean(visit.is_returning_visit),
    patientVisitStatus: visit.patient_visit_status || '',
    createdBy: visit.created_by_name?.trim() || '',
  });

  // Helper function to build date filter parameters
  const buildDateParams = useCallback(() => {
    // Anchor on the server's "today" so filters match the server calendar.
    const anchor = serverToday ? new Date(`${serverToday}T00:00:00`) : new Date();
    const anchorYmd = serverToday || formatLocalYmd(anchor);
    let dateParam: string | undefined = undefined;
    let startDate: string | undefined = undefined;
    let endDate: string | undefined = undefined;

    if (dateRange.from || dateRange.to) {
      startDate = dateRange.from || undefined;
      endDate = dateRange.to || undefined;
    } else if (dateFilter === 'today') {
      dateParam = anchorYmd;
    } else if (dateFilter === 'week') {
      const weekBounds = localWeekToTodayBounds(serverToday || undefined);
      startDate = weekBounds.start;
      endDate = weekBounds.end;
    } else if (dateFilter === 'month') {
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      startDate = formatLocalYmd(monthStart);
      endDate = anchorYmd;
    }
    // 'all' means no date filter

    return { dateParam, startDate, endDate };
  }, [dateFilter, dateRange.from, dateRange.to, serverToday]);

  // Load stats - separate from pagination to get accurate counts
  const loadStats = useCallback(async () => {
    try {
      const { dateParam, startDate, endDate } = buildDateParams();

      const stats = await visitService.getListStats({
        search: debouncedSearchQuery || undefined,
        visit_type: typeFilter !== 'all' ? typeFilter : undefined,
        clinic: clinicFilter !== 'all' ? clinicFilter : undefined,
        date: dateParam,
        start_date: startDate,
        end_date: endDate,
      });

      setStatsData({
        total: stats.total,
        scheduled: stats.scheduled,
        inProgress: stats.inProgress,
        completed: stats.completed,
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
      if (handleAuthError(err)) return;
      if (!silent) {
        setError('Failed to load visits. Please try again.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentPage, itemsPerPage, debouncedSearchQuery, statusFilter, typeFilter, clinicFilter, buildDateParams, handleAuthError]);

  // Load visits when filters change
  useEffect(() => {
    if (!ready) return;
    loadVisits();
  }, [ready, loadVisits]);

  // Load stats when filters change (except status filter and pagination)
  useEffect(() => {
    if (!ready) return;
    loadStats();
  }, [ready, loadStats]);

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
    if (!ready || pollingPaused) return;
    const id = setInterval(() => {
      void loadVisits({ silent: true });
      void loadStats();
    }, 15000);
    return () => clearInterval(id);
  }, [ready, loadVisits, loadStats, pollingPaused]);

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

  const inWorkflowEdit =
    selectedVisit?.visitStatusRaw === 'in_progress' ||
    selectedVisit?.visitStatusRaw === 'completed';

  const extraClinicSelectOptions = useMemo(() => {
    if (!selectedVisit) return opdClinicNames;
    const existing = new Set<string>();
    const mark = (s: string) => {
      const n = normalizeClinicName(String(s).trim(), opdClinicNames);
      if (n) existing.add(n);
    };
    (selectedVisit.clinics || []).forEach((c: string) => mark(c));
    if (selectedVisit.clinic) mark(selectedVisit.clinic);
    clinicsToAppend.forEach((c) => mark(c));
    return opdClinicNames.filter((name) => {
      const n = normalizeClinicName(name, opdClinicNames);
      return n && !existing.has(n);
    });
  }, [selectedVisit, clinicsToAppend, opdClinicNames]);

  const handleAppendExtraClinic = () => {
    if (!extraClinicPick.trim() || !selectedVisit) return;
    const n = normalizeClinicName(extraClinicPick.trim(), opdClinicNames);
    if (!n) return;
    const existing = new Set<string>();
    const mark = (s: string) => {
      const x = normalizeClinicName(String(s).trim(), opdClinicNames);
      if (x) existing.add(x);
    };
    (selectedVisit.clinics || []).forEach((c: string) => mark(c));
    if (selectedVisit.clinic) mark(selectedVisit.clinic);
    clinicsToAppend.forEach((c) => mark(c));
    if (existing.has(n)) {
      toast.info('That clinic is already on this visit.');
      return;
    }
    setClinicsToAppend((prev) => [...prev, n]);
    setExtraClinicPick('');
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
    setClinicsToAppend([]);
    setExtraClinicPick('');
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

      const rawStatus = visitToUpdate.visitStatusRaw;
      const inWorkflow = rawStatus === 'in_progress' || rawStatus === 'completed';

      // VisitSerializer blocks visit_type, location, etc. once the visit is in workflow;
      // only clinical_notes, clinic, and clinics are safe to PATCH.
      let updateData: Record<string, unknown>;
      if (inWorkflow) {
        updateData = {
          clinical_notes: editForm.notes ?? '',
        };
        if (clinicsToAppend.length > 0) {
          const norm = (s: string) =>
            s.trim() ? normalizeClinicName(s.trim(), opdClinicNames) : '';
          const prevList: string[] =
            visitToUpdate.clinics?.length > 0
              ? [...visitToUpdate.clinics]
              : visitToUpdate.clinic
                ? [visitToUpdate.clinic]
                : [];
          const merged: string[] = [];
          const seen = new Set<string>();
          for (const c of prevList) {
            const n = norm(String(c));
            if (n && !seen.has(n)) {
              seen.add(n);
              merged.push(n);
            }
          }
          for (const c of clinicsToAppend) {
            const n = norm(String(c));
            if (n && !seen.has(n)) {
              seen.add(n);
              merged.push(n);
            }
          }
          if (merged.length) {
            updateData.clinics = merged;
            const primaryRaw = (visitToUpdate.clinic || merged[0] || '').trim();
            const primaryNorm = primaryRaw ? norm(primaryRaw) : '';
            updateData.clinic =
              primaryNorm && merged.includes(primaryNorm) ? primaryNorm : merged[0];
          }
        }
      } else {
        updateData = {
          visit_type: editForm.type || undefined,
          clinic: editForm.clinic ? normalizeClinicName(editForm.clinic, opdClinicNames) : undefined,
          location: editForm.location || undefined,
          clinical_notes: editForm.notes || undefined,
        };
      }

      await visitService.updateVisit(visitId, updateData as Partial<Visit>);
      
      // Reload visits with current filters preserved
      await loadVisits();
      setIsEditModalOpen(false);
      toast.success('Visit updated successfully');
    } catch (err: any) {
      console.error('Error updating visit:', err);
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to update visit. Please try again.');
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
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to forward visit. Please try again.');
    }
  };

  const handleCancelVisit = (visit: TransformedVisit) => {
    setVisitToCancel(visit);
    setIsCancelModalOpen(true);
  };

  const handleOpenVisitReport = async (visit: TransformedVisit) => {
    try {
      setReportLoading(true);
      setReportSummary(null);
      setIsReportModalOpen(true);
      const summary = await visitService.getVisitSummary(visit.numericId);
      setReportSummary(summary);
    } catch (err: any) {
      console.error('Error loading visit report:', err);
      if (handleAuthError(err)) return;
      toast.error('Failed to load visit summary.');
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
      if (handleAuthError(err)) return;
      toast.error(err.message || 'Failed to cancel visit. Please try again.');
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
      'annual_checkup': 'Annual Check-up',
      'nursing_procedure': 'Nursing Procedure',
      'responsility_form': 'Responsility Form',
      'responsibility_form': 'Responsibility Form',
    };
    return typeMap[type] || type;
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      'consultation': 'border-teal-500/50 text-teal-600 dark:text-teal-400',
      'follow_up': 'border-blue-500/50 text-blue-600 dark:text-blue-400',
      'emergency': 'border-rose-500/50 text-rose-600 dark:text-rose-400',
      'routine': 'border-violet-500/50 text-violet-600 dark:text-violet-400',
      'annual_checkup': 'border-amber-500/50 text-amber-600 dark:text-amber-400',
      'nursing_procedure': 'border-rose-500/50 text-rose-600 dark:text-rose-400',
      'responsility_form': 'border-yellow-500/50 text-yellow-600 dark:text-yellow-400',
      'responsibility_form': 'border-yellow-500/50 text-yellow-600 dark:text-yellow-400',
    };
    return styles[type] || 'border-muted-foreground/50 text-muted-foreground';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'emergency': return 'border-l-rose-500';
      case 'follow_up': return 'border-l-blue-500';
      case 'routine': return 'border-l-violet-500';
      case 'annual_checkup': return 'border-l-amber-500';
      case 'nursing_procedure': return 'border-l-rose-500';
      case 'responsility_form':
      case 'responsibility_form': return 'border-l-yellow-500';
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
                    <SelectItem value="annual_checkup">Annual Check-up</SelectItem>
                    <SelectItem value="nursing_procedure">Nursing Procedure</SelectItem>
                    <SelectItem value="responsility_form">Responsility Form</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={clinicFilter} onValueChange={setClinicFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Clinic" /></SelectTrigger>
                  <SelectContent>
                    {clinicFilterOptions.map((c) => (
                      <SelectItem key={c} value={c === ALL_CLINICS_FILTER_LABEL ? 'all' : c}>
                        {c}
                      </SelectItem>
                    ))}
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
                  <PatientAvatar name={visit.patient} photoUrl={visit.patientPhoto} size="sm" />
                  
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
                    }} title="View visit details (edit from there)">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {(visit.visitStatusRaw === 'completed' || visit.completedClinics.length > 0) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenVisitReport(visit)}
                        title="View Clinical Summary"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {visit.visitStatusRaw === 'scheduled' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
                        onClick={() => handleCancelVisit(visit)}
                        title="Cancel Visit"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {visit.visitStatusRaw === 'scheduled' && (
                      <Button
                        size="sm"
                        className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        onClick={() => handleForwardToNursing(visit)}
                      >
                        <Send className="h-3 w-3 mr-1" />Send
                      </Button>
                    )}
                    
                    {visit.visitStatusRaw === 'completed' && (
                      <>
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
              pageSizeOptions={[25, 50, 100]}
            />
          )}
        </>

        {/* Edit Visit Modal */}
        <Dialog
          open={isEditModalOpen}
          onOpenChange={(open) => {
            setIsEditModalOpen(open);
            if (!open) {
              setClinicsToAppend([]);
              setExtraClinicPick('');
            }
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-500" />
                Edit Visit Details
              </DialogTitle>
              <DialogDescription>
                Update the visit details for {selectedVisit?.patient}
                {selectedVisit &&
                  (selectedVisit.visitStatusRaw === 'in_progress' ||
                    selectedVisit.visitStatusRaw === 'completed') && (
                  <span className="mt-2 block text-amber-700 dark:text-amber-400">
                    Visit type and location are locked. You can update clinical notes and add more service clinics
                    (e.g. Physiotherapy) — they are saved when you click Save.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Visit Type</Label>
                  <Select
                    value={editForm.type}
                    onValueChange={(v) => setEditForm(prev => ({ ...prev, type: v }))}
                    disabled={
                      !!selectedVisit &&
                      (selectedVisit.visitStatusRaw === 'in_progress' ||
                        selectedVisit.visitStatusRaw === 'completed')
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="routine">Routine Checkup</SelectItem>
                    <SelectItem value="annual_checkup">Annual Check-up</SelectItem>
                    <SelectItem value="nursing_procedure">Nursing Procedure</SelectItem>
                    <SelectItem value="responsility_form">Responsility Form</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Clinic</Label>
                  <Select
                    value={editForm.clinic}
                    onValueChange={(v) => setEditForm(prev => ({ ...prev, clinic: v }))}
                    disabled={inWorkflowEdit}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {opdClinicNames.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select
                    value={editForm.location}
                    onValueChange={(v) => setEditForm(prev => ({ ...prev, location: v }))}
                    disabled={
                      !!selectedVisit &&
                      (selectedVisit.visitStatusRaw === 'in_progress' ||
                        selectedVisit.visitStatusRaw === 'completed')
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locationOptions.filter((l) => l.value !== "all").map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {inWorkflowEdit && (
                <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
                  <div className="space-y-1">
                    <Label>Clinics already on this visit</Label>
                    <div className="flex flex-wrap gap-1">
                      {(selectedVisit.clinics?.length
                        ? selectedVisit.clinics
                        : selectedVisit.clinic
                          ? [selectedVisit.clinic]
                          : []
                      ).length === 0 ? (
                        <span className="text-sm text-muted-foreground">None listed</span>
                      ) : (
                        (selectedVisit.clinics?.length
                          ? selectedVisit.clinics
                          : selectedVisit.clinic
                            ? [selectedVisit.clinic]
                            : []
                        ).map((c: string) => (
                          <Badge key={c} variant="secondary" className="text-xs">
                            {c}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  {clinicsToAppend.length > 0 && (
                    <div className="space-y-1">
                      <Label>Added (saved when you click Save)</Label>
                      <div className="flex flex-wrap gap-1">
                        {clinicsToAppend.map((c) => (
                          <Badge key={c} variant="default" className="text-xs gap-1 pr-1">
                            {c}
                            <button
                              type="button"
                              className="rounded-full hover:bg-background/20 p-0.5"
                              onClick={() => setClinicsToAppend((p) => p.filter((x) => x !== c))}
                              aria-label={`Remove ${c}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Add another clinic</Label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Select value={extraClinicPick} onValueChange={setExtraClinicPick}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Choose clinic to add" />
                        </SelectTrigger>
                        <SelectContent>
                          {extraClinicSelectOptions.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        className="sm:shrink-0"
                        onClick={handleAppendExtraClinic}
                        disabled={!extraClinicPick || extraClinicSelectOptions.length === 0}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Add
                      </Button>
                    </div>
                    {extraClinicSelectOptions.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        All clinics from your directory are already on this visit.
                      </p>
                    )}
                  </div>
                </div>
              )}
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
                {selectedVisit &&
                  (selectedVisit.visitStatusRaw === 'scheduled' ||
                    selectedVisit.visitStatusRaw === 'in_progress' ||
                    selectedVisit.visitStatusRaw === 'completed') && (
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Use <span className="font-medium text-foreground">Edit</span> below to change clinics or notes — it
                    opens here so the list stays compact.
                  </span>
                )}
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
                {(selectedVisit.department || selectedVisit.location || selectedVisit.location_clinic_name) && (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedVisit.department ? (
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Clinic</Label>
                        <p className="font-medium">{selectedVisit.department}</p>
                      </div>
                    ) : null}
                    {selectedVisit.location_clinic_name ? (
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Facility</Label>
                        <p className="font-medium">{selectedVisit.location_clinic_name}</p>
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
                {selectedVisit.createdBy ? (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Created By</Label>
                    <p className="font-medium">{selectedVisit.createdBy}</p>
                  </div>
                ) : null}
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
              {selectedVisit &&
                (selectedVisit.visitStatusRaw === 'scheduled' ||
                  selectedVisit.visitStatusRaw === 'in_progress' ||
                  selectedVisit.visitStatusRaw === 'completed') && (
                <Button
                  onClick={() => {
                    setIsViewModalOpen(false);
                    handleEditVisit(selectedVisit);
                  }}
                >
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

        <VisitSummaryModal
          open={isReportModalOpen}
          onOpenChange={setIsReportModalOpen}
          summary={reportSummary}
          loading={reportLoading}
        />
      </div>
    </DashboardLayout>
  );
}
