"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatDisplayDate, formatDisplayDateMedium, formatDisplayTime } from "@/lib/dates";
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiFetch } from '@/lib/api-client';
import { wardService, nursingService } from '@/lib/services';
import { useNursingPageAuth } from '@/hooks/use-nursing-page-auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import {
  Syringe, Bandage, Pill, Search, Users, Clock, CheckCircle2, AlertTriangle,
  Eye, Calendar, Loader2, Activity, ArrowRight, User, Stethoscope, DoorOpen, Plus, Building2
} from 'lucide-react';
import {
  AddNursingProcedureDialog,
  type AddNursingProcedureResult,
} from '@/components/nursing/AddNursingProcedureDialog';
import { PerformNursingProcedureDialog } from '@/components/nursing/PerformNursingProcedureDialog';
import {
  nursingOrderToProcedure,
  type NursingProcedureItem,
} from '@/lib/nursing/nursing-procedure-queue';
import { PatientAvatar } from '@/components/shared/PatientAvatar';

type Procedure = NursingProcedureItem;

// ==================== HELPERS ====================
const getPriorityBadge = (priority: string) => {
  const styles: Record<string, string> = {
    Emergency: 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10',
    High: 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10',
    Medium: 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10',
    Low: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  };
  return styles[priority] || 'border-gray-500/50 text-gray-600 bg-gray-500/10';
};

const getTypeBorderColor = (type: Procedure['type']) => {
  switch (type) {
    case 'injection':
      return 'border-l-emerald-500';
    case 'dressing':
      return 'border-l-violet-500';
    case 'ward_admission':
      return 'border-l-amber-500';
    default:
      return 'border-l-blue-500';
  }
};

const getTypeConfig = (type: string) => {
  const configs: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
    'injection': { icon: Syringe, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10 border-emerald-500/30', label: 'Injection' },
    'dressing': { icon: Bandage, color: 'text-violet-500', bgColor: 'bg-violet-500/10 border-violet-500/30', label: 'Dressing' },
    'medication': { icon: Pill, color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', label: 'Medication' },
    'ward_admission': { icon: DoorOpen, color: 'text-amber-500', bgColor: 'bg-amber-500/10 border-amber-500/30', label: 'Observation Admission' },
  };
  return configs[type] || configs['medication'];
};

const WOUND_INTERVENTION_LABELS: Record<string, string> = {
  dressing: 'Dressing',
  sutures: 'Suturing',
  suture_removal: 'Suture removal',
  i_and_d: 'Incision and drainage',
};

const formatOrderDateTime = (dateString?: string) => {
  if (!dateString) return { date: '—', time: '' };
  return {
    date: formatDisplayDateMedium(dateString),
    time: formatDisplayTime(dateString),
  };
};

const getTimeSince = (dateString: string) => {
  const now = new Date();
  const ordered = new Date(dateString);
  const diffMs = now.getTime() - ordered.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  return `${diffHrs}h ${diffMins % 60}m ago`;
};

function procedureSummaryLine(procedure: Procedure): string {
  const desc = (procedure.description || '').trim();
  if (procedure.type === 'injection' || procedure.type === 'medication') {
    const parts = [procedure.details.medication, procedure.details.dosage, procedure.details.route]
      .filter((x) => x && String(x).trim() !== '');
    if (parts.length) return parts.join(' · ');
    return desc.length > 90 ? `${desc.slice(0, 90)}…` : desc;
  }
  if (procedure.type === 'dressing') {
    const wt = procedure.details.woundType;
    const wl = procedure.details.woundLocation;
    if (wt && wl) return `${wt} · ${wl}`;
    if (wt || wl) return [wt, wl].filter(Boolean).join(' · ');
    return desc.length > 90 ? `${desc.slice(0, 90)}…` : desc;
  }
  if (procedure.type === 'ward_admission') {
    const diagnosisSummary = procedure.details.admissionDiagnosesList?.length
      ? procedure.details.admissionDiagnosesList[0]
      : procedure.details.admissionDiagnosis;
    const bits = [diagnosisSummary, procedure.details.presentingComplaint].filter(Boolean);
    if (bits.length) return bits.join(' · ');
    return desc.length > 90 ? `${desc.slice(0, 90)}…` : desc;
  }
  return desc.length > 90 ? `${desc.slice(0, 90)}…` : desc;
}

// ==================== MAIN COMPONENT ====================
export default function ProceduresQueuePage() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [queueStats, setQueueStats] = useState({
    total: 0,
    pending: 0,
    completed: 0,
    injections: 0,
  });
  const [wards, setWards] = useState<any[]>([]);
  const [wardSearch, setWardSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { ready, handleAuthError } = useNursingPageAuth();
  const { currentUser } = useCurrentUser();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const hasActiveFilters =
    debouncedSearch.trim() !== '' ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    genderFilter !== 'all' ||
    Boolean(dateRange.from) ||
    Boolean(dateRange.to) ||
    dateFilter !== 'all';

  const totalOrdersLabel = useMemo(() => {
    if (dateFilter === 'today') return "Today's Orders";
    if (dateFilter === 'week') return 'This Week';
    if (dateFilter === 'month') return 'This Month';
    return 'All Orders';
  }, [dateFilter]);

  // Dialog states
  const [isPerformDialogOpen, setIsPerformDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAddProcedureOpen, setIsAddProcedureOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [viewProcedure, setViewProcedure] = useState<Procedure | null>(null);
  const [viewRecord, setViewRecord] = useState<{
    site?: string;
    notes?: string;
    wound_intervention?: string;
    performed_by_name?: string;
    performed_at?: string;
  } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    wardService
      .getWards({ status: 'active' })
      .then((wardsResponse) => {
        setWards(wardsResponse.results || []);
      })
      .catch((wardError) => {
        console.error('Failed to load wards:', wardError);
        if (handleAuthError(wardError)) return;
        toast.error('Could not load wards. The ward picker will be empty until the wards API is reachable.');
        setWards([]);
      });
  }, [ready, handleAuthError]);

  const appendQueueDateFilters = useCallback(
    (qs: URLSearchParams) => {
      if (dateRange.from || dateRange.to) {
        if (dateRange.from) qs.set('ordered_at_after', dateRange.from);
        if (dateRange.to) qs.set('ordered_at_before', dateRange.to);
      } else if (dateFilter !== 'all') {
        qs.set('date_filter', dateFilter);
      }
    },
    [dateFilter, dateRange.from, dateRange.to]
  );

  const loadQueueStats = useCallback(async () => {
    try {
      const params: Record<string, string | undefined> = {};
      if (dateRange.from || dateRange.to) {
        if (dateRange.from) params.ordered_at_after = dateRange.from;
        if (dateRange.to) params.ordered_at_before = dateRange.to;
      } else if (dateFilter !== 'all') {
        params.date_filter = dateFilter;
      }
      const stats = await nursingService.getProceduresQueueStats(params);
      setQueueStats({
        total: stats.total ?? 0,
        pending: stats.pending ?? 0,
        completed: stats.completed ?? 0,
        injections: stats.injections ?? 0,
      });
    } catch (e) {
      console.error('Failed to load procedure queue stats:', e);
      if (handleAuthError(e)) return;
      toast.error('Failed to load procedure queue statistics');
    }
  }, [dateFilter, dateRange.from, dateRange.to, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadQueueStats();
  }, [ready, loadQueueStats]);

  const getCompletedIconStyle = (type: Procedure['type']) => {
    // Use module/type colors (same as typeConfig palettes)
    switch (type) {
      case 'injection':
        return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'dressing':
        return 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10';
      case 'ward_admission':
        return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'medication':
      default:
        return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
    }
  };

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      qs.set('procedures_queue', '1');
      qs.set('page', String(currentPage));
      if (statusFilter !== 'all') {
        qs.set('status', statusFilter);
      }
      qs.set('page_size', String(itemsPerPage));
      const q = debouncedSearch.trim();
      if (q) qs.set('search', q);
      if (typeFilter !== 'all') qs.set('queue_type', typeFilter);
      if (priorityFilter !== 'all') {
        const pm: Record<string, string> = {
          Emergency: 'urgent',
          High: 'high',
          Medium: 'medium',
          Low: 'low',
        };
        const apiPri = pm[priorityFilter];
        if (apiPri) qs.set('priority', apiPri);
      }
      if (genderFilter !== 'all') {
        qs.set('patient_gender', genderFilter.toLowerCase());
      }
      appendQueueDateFilters(qs);
      const ordersResult = await apiFetch<{ results: any[]; count?: number }>(
        `/nursing/orders/?${qs.toString()}`
      );
      const rows = (ordersResult.results || []).map(nursingOrderToProcedure);
      setProcedures(rows);
      setTotalCount(typeof ordersResult.count === 'number' ? ordersResult.count : rows.length);
    } catch (err) {
      console.error('Error loading orders:', err);
      if (handleAuthError(err)) return;
      setError('Failed to load procedures queue. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    itemsPerPage,
    debouncedSearch,
    typeFilter,
    statusFilter,
    priorityFilter,
    genderFilter,
    appendQueueDateFilters,
    handleAuthError,
  ]);

  useEffect(() => {
    if (!ready) return;
    void loadOrders();
  }, [ready, loadOrders]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    typeFilter,
    statusFilter,
    priorityFilter,
    dateFilter,
    genderFilter,
    dateRange.from,
    dateRange.to,
    itemsPerPage,
  ]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // ==================== HANDLERS ====================
  const openViewDialog = async (procedure: Procedure) => {
    setViewProcedure(procedure);
    setViewRecord(null);
    setIsViewDialogOpen(true);
    if (procedure.status !== 'completed') return;
    try {
      setViewLoading(true);
      const orderId = Number(procedure.id);
      if (!Number.isFinite(orderId)) return;
      const row = await nursingService.resolveProcedureForOrder(orderId);
      if (row) {
        setViewRecord({
          site: typeof row.site === 'string' ? row.site : undefined,
          notes: typeof row.notes === 'string' ? row.notes : undefined,
          wound_intervention: typeof row.wound_intervention === 'string' ? row.wound_intervention : undefined,
          performed_by_name: typeof row.performed_by_name === 'string' ? row.performed_by_name : undefined,
          performed_at: typeof row.performed_at === 'string' ? row.performed_at : undefined,
        });
      }
    } catch (err) {
      console.error('Failed to load procedure record:', err);
      if (handleAuthError(err)) return;
      toast.error('Failed to load procedure details');
    } finally {
      setViewLoading(false);
    }
  };

  const openPerformDialog = (procedure: Procedure) => {
    setSelectedProcedure(procedure);
    setIsPerformDialogOpen(true);
  };

  // ==================== RENDER ====================
  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500">
                <Activity className="h-6 w-6 text-white" />
              </div>
              Procedures Queue
            </h1>
            <p className="text-muted-foreground mt-1">View and manage nursing procedure orders</p>
          </div>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => setIsAddProcedureOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add procedure
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: totalOrdersLabel, value: queueStats.total, icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Pending', value: queueStats.pending, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Completed', value: queueStats.completed, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Injections (pending)', value: queueStats.injections, icon: Syringe, color: 'text-violet-500', bg: 'bg-violet-500/10' },
          ].map((stat, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
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
                  placeholder="Search by patient name, patient ID, or personal number..."
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Procedure Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="injection">💉 Injections</SelectItem>
                    <SelectItem value="dressing">🩹 Dressings</SelectItem>
                    <SelectItem value="medication">💊 Medications</SelectItem>
                    <SelectItem value="ward_admission">🏥 Observation admission</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="Emergency">🔴 Emergency</SelectItem>
                    <SelectItem value="High">🟠 High</SelectItem>
                    <SelectItem value="Medium">🔵 Medium</SelectItem>
                    <SelectItem value="Low">🟢 Low</SelectItem>
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
                <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{procedures.length}</span> of{' '}
            <span className="font-medium text-foreground">{totalCount}</span> procedures
          </p>
        </div>

        {/* Queue List */}
        {!loading && totalCount === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {statusFilter === 'pending'
                  ? 'All caught up!'
                  : hasActiveFilters
                    ? 'No matching procedures'
                    : 'No procedures found'}
              </h3>
              <p className="text-muted-foreground text-center max-w-md">
                {statusFilter === 'pending'
                  ? 'No pending nursing orders in this date range.'
                  : hasActiveFilters
                    ? 'No procedures match your current filters. Try a wider date range or clear filters.'
                    : 'No nursing procedure orders in this date range.'}
              </p>
              {statusFilter === 'pending' ? (
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href="/nursing/procedures/history">View Procedures History</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {loading && procedures.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                  <p>Loading procedures queue…</p>
                </CardContent>
              </Card>
            ) : null}
            {procedures.map((procedure) => {
              const typeConfig = getTypeConfig(procedure.type);
              const TypeIcon = typeConfig.icon;
              const summary = procedureSummaryLine(procedure);

              return (
                <Card
                  key={procedure.id}
                  className={`border-l-4 ${getTypeBorderColor(procedure.type)} hover:shadow-md transition-shadow`}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <PatientAvatar name={procedure.patientName} photoUrl={procedure.patientPhoto} size="sm" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                            <span className="font-semibold text-foreground truncate">{procedure.patientName}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${typeConfig.bgColor} ${typeConfig.color}`}>
                              {typeConfig.label}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getPriorityBadge(procedure.priority)}`}>
                              {procedure.priority}
                            </Badge>
                            {procedure.status === 'completed' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                                Completed
                              </Badge>
                            )}
                            {procedure.allergies.length > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10">
                                Allergy
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {procedure.status === 'completed' ? (
                              <div className={`h-7 w-7 flex items-center justify-center rounded border ${getCompletedIconStyle(procedure.type)}`}>
                                <CheckCircle2 className="h-4 w-4" />
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => openPerformDialog(procedure)}
                                className={`h-7 px-2 text-xs ${
                                  procedure.type === 'injection' ? 'bg-emerald-500 hover:bg-emerald-600' :
                                  procedure.type === 'dressing' ? 'bg-violet-500 hover:bg-violet-600' :
                                  procedure.type === 'ward_admission' ? 'bg-amber-500 hover:bg-amber-600' :
                                  'bg-blue-500 hover:bg-blue-600'
                                }`}
                              >
                                <TypeIcon className="h-3 w-3 mr-1" />
                                {procedure.type === 'injection' ? 'Administer' :
                                 procedure.type === 'dressing' ? 'Perform' :
                                 procedure.type === 'ward_admission' ? 'Admit' : 'Perform'}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => void openViewDialog(procedure)}
                              title="View order"
                            >
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{procedure.patientId}</span>
                          <span>•</span>
                          <span>{procedure.age}y {procedure.gender}</span>
                          {procedure.ward ? (
                            <>
                              <span>•</span>
                              <span>{procedure.ward}</span>
                            </>
                          ) : null}
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Stethoscope className="h-3 w-3 shrink-0" />
                            {procedure.orderedBy}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {getTimeSince(procedure.orderedAt)}
                          </span>
                        </div>

                        {summary ? (
                          <p className="text-xs text-muted-foreground mt-1 truncate" title={procedure.description}>
                            {summary}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="procedures"
            />
            </Card>
          )}

          <AdvancedDateRangeDialog
            open={isDateFilterDialogOpen}
            onOpenChange={setIsDateFilterDialogOpen}
            description="Apply a custom procedure date range to narrow down nursing procedures."
            label="Procedure Date Range"
            value={dateRange}
            onChange={setDateRange}
            onClear={clearDateRangeFilters}
          />

        {/* View order dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className={MODAL_SIZES.md}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {viewProcedure && (() => {
                  const config = getTypeConfig(viewProcedure.type);
                  const Icon = config.icon;
                  return (
                    <>
                      <Icon className={`h-5 w-5 ${config.color}`} />
                      {config.label}
                      {viewProcedure.status === 'completed' ? (
                        <Badge variant="outline" className="text-[10px] ml-1 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={`text-[10px] ml-1 ${getPriorityBadge(viewProcedure.priority)}`}>
                          {viewProcedure.priority}
                        </Badge>
                      )}
                    </>
                  );
                })()}
              </DialogTitle>
              <DialogDescription>
                {viewProcedure?.patientName} · {viewProcedure?.patientId}
              </DialogDescription>
            </DialogHeader>
            {viewProcedure && (
              <div className="py-2 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {viewProcedure.age > 0 ? `${viewProcedure.age}y` : 'Age unknown'} · {viewProcedure.gender}
                </p>
                {viewProcedure.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <p className="text-sm font-medium text-rose-600 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Allergy: {viewProcedure.allergies.join(', ')}
                    </p>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                  <p className="text-xs text-muted-foreground">Ordered by {viewProcedure.orderedBy}</p>
                  {viewProcedure.type === 'injection' && (
                    <>
                      <p className="font-medium text-foreground">
                        {viewProcedure.details.medication} — {viewProcedure.details.dosage}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[viewProcedure.details.route, viewProcedure.details.frequency].filter(Boolean).join(' · ')}
                      </p>
                    </>
                  )}
                  {viewProcedure.type === 'dressing' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Wound type</p>
                        <p className="font-medium">{viewProcedure.details.woundType || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="font-medium">{viewProcedure.details.woundLocation || '—'}</p>
                      </div>
                      {viewProcedure.details.instructions ? (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Instructions</p>
                          <p className="text-sm">{viewProcedure.details.instructions}</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {viewProcedure.type === 'medication' && (
                    <>
                      <p className="font-medium text-foreground">{viewProcedure.details.medication}</p>
                      <p className="text-sm text-muted-foreground">{viewProcedure.details.route}</p>
                    </>
                  )}
                  {viewProcedure.type === 'ward_admission' && (
                    <>
                      <p className="font-medium text-foreground">Observation admission</p>
                      <p className="text-sm text-muted-foreground">{viewProcedure.ward || 'Ward not specified'}</p>
                      {viewProcedure.details.admissionDiagnosis ? (
                        <p className="text-sm text-muted-foreground">{viewProcedure.details.admissionDiagnosis}</p>
                      ) : null}
                    </>
                  )}
                  {viewProcedure.description && !viewProcedure.details.medication && !viewProcedure.details.woundType ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewProcedure.description}</p>
                  ) : null}
                </div>
                {viewProcedure.status === 'completed' && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium text-foreground">Completion record</p>
                    {viewLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading record…
                      </div>
                    ) : viewRecord ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {viewRecord.site ? (
                          <div>
                            <p className="text-xs text-muted-foreground">Site</p>
                            <p className="font-medium">{viewRecord.site}</p>
                          </div>
                        ) : null}
                        {viewRecord.wound_intervention ? (
                          <div>
                            <p className="text-xs text-muted-foreground">Procedure performed</p>
                            <p className="font-medium">
                              {WOUND_INTERVENTION_LABELS[viewRecord.wound_intervention] || viewRecord.wound_intervention}
                            </p>
                          </div>
                        ) : null}
                        {viewRecord.notes ? (
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">Notes</p>
                            <p className="text-muted-foreground whitespace-pre-wrap">{viewRecord.notes}</p>
                          </div>
                        ) : null}
                        {viewRecord.performed_by_name ? (
                          <div className="col-span-2 flex items-center justify-between text-xs text-muted-foreground pt-1">
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {viewRecord.performed_by_name}
                            </span>
                            {viewRecord.performed_at ? (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatOrderDateTime(viewRecord.performed_at).date}{' '}
                                {formatOrderDateTime(viewRecord.performed_at).time}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No completion record found for this order.</p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
                  <Clock className="h-3 w-3 shrink-0" />
                  Ordered {formatOrderDateTime(viewProcedure.orderedAt).date}{' '}
                  {formatOrderDateTime(viewProcedure.orderedAt).time}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                Close
              </Button>
              {viewProcedure?.status === 'pending' ? (
                <Button
                  onClick={() => {
                    setIsViewDialogOpen(false);
                    openPerformDialog(viewProcedure);
                  }}
                >
                  {viewProcedure.type === 'injection' ? 'Administer' :
                   viewProcedure.type === 'dressing' ? 'Perform' :
                   viewProcedure.type === 'ward_admission' ? 'Admit' : 'Perform'}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AddNursingProcedureDialog
          open={isAddProcedureOpen}
          onOpenChange={setIsAddProcedureOpen}
          currentUserId={currentUser?.id ? Number(currentUser.id) : undefined}
          onCreated={async (result: AddNursingProcedureResult) => {
            await loadOrders();
            void loadQueueStats();
            if (result.completeNow) {
              const proc = nursingOrderToProcedure(result.order);
              if (result.visitId) proc.visitId = result.visitId;
              proc.createdNursingVisit = result.createdNursingVisit;
              openPerformDialog(proc);
            }
          }}
        />

        <PerformNursingProcedureDialog
          open={isPerformDialogOpen}
          onOpenChange={(open) => {
            setIsPerformDialogOpen(open);
            if (!open) setSelectedProcedure(null);
          }}
          procedure={selectedProcedure}
          currentUserId={currentUser?.id ? Number(currentUser.id) : undefined}
          wards={wards}
          onCompleted={() => {
            void loadOrders();
            void loadQueueStats();
          }}
        />
      </div>
    </DashboardLayout>
  );
}
