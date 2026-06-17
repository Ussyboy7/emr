"use client";
import { formatDisplayDateMedium, formatDisplayTime } from "@/lib/dates";

import { useState, useEffect, useCallback } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Syringe, Bandage, Pill, Search, CheckCircle2, Eye, Calendar,
  Activity, User, Clock, Stethoscope, FileText, Loader2, AlertTriangle
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { nursingService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import {
  resolveOrderedByName,
  resolveProcedureHistoryDetails,
  type ProcedureKind,
} from '@/lib/nursing/procedure-description';

// ==================== TYPES ====================
interface CompletedProcedure {
  id: string;
  type: 'injection' | 'dressing' | 'medication' | 'ward_admission';
  patientName: string;
  patientId: string;
  age: number;
  dob?: string;
  gender: string;
  category: string;
  bloodGroup: string;
  ward: string;
  orderInstructions?: string;
  orderedBy: string;
  completedAt: string;
  completedBy: string;
  details: {
    medication?: string;
    dosage?: string;
    route?: string;
    woundType?: string;
    woundLocation?: string;
  };
  record: {
    site?: string;
    batchNumber?: string;
    dressingType?: string;
    woundCondition?: string;
    notes?: string;
  };
}

// Procedures history data will be loaded from API

const getTypeConfig = (type: string) => {
  const configs: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
    'injection': { icon: Syringe, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', label: 'Injection' },
    'dressing': { icon: Bandage, color: 'text-violet-500', bgColor: 'bg-violet-500/10', label: 'Dressing' },
    'medication': { icon: Pill, color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Medication' },
    'ward_admission': { icon: Activity, color: 'text-amber-500', bgColor: 'bg-amber-500/10', label: 'Observation Admission' },
  };
  return configs[type] || configs['medication'];
};

const getCompletedIconStyle = (type: string) => {
  switch (type) {
    case 'injection':
      return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
    case 'dressing':
      return 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10';
    case 'medication':
      return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
    case 'ward_admission':
      return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
    default:
      return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
  }
};

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return { date: 'Date unavailable', time: '' };
  }
  return {
    date: formatDisplayDateMedium(date),
    time: formatDisplayTime(date),
  };
};

const resolvePatientAge = (patient: any): number | null => {
  if (typeof patient?.age === 'number' && Number.isFinite(patient.age) && patient.age > 0) {
    return patient.age;
  }

  const dobValue = patient?.date_of_birth || patient?.dateOfBirth;
  if (!dobValue) return null;

  const dob = new Date(dobValue);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const birthdayNotReached = monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate());
  if (birthdayNotReached) age -= 1;

  return age >= 0 ? age : null;
};

const formatDisplayAge = (age: number, dob?: string): string => {
  if (typeof dob === 'string' && dob.trim()) {
    const birthDate = new Date(dob);
    if (!Number.isNaN(birthDate.getTime())) {
      const today = new Date();
      let years = today.getFullYear() - birthDate.getFullYear();
      let months = today.getMonth() - birthDate.getMonth();
      const days = today.getDate() - birthDate.getDate();

      if (days < 0) months -= 1;
      if (months < 0) {
        years -= 1;
        months += 12;
      }

      if (years > 0) return `Age: ${years} year${years === 1 ? '' : 's'}`;
      if (months > 0) return `Age: ${months} month${months === 1 ? '' : 's'}`;
      return 'Age: 0 months';
    }
  }

  return age > 0 ? `Age: ${age} year${age === 1 ? '' : 's'}` : 'Age: Unknown';
};

const formatGender = (gender?: string): string => {
  const value = String(gender || '').trim().toLowerCase();
  if (!value) return 'Gender unknown';
  if (value === 'male') return 'Male';
  if (value === 'female') return 'Female';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const PATIENT_CATEGORY_LABELS: Record<string, string> = {
  employee: 'Employee',
  retiree: 'Retiree',
  dependent: 'Dependent',
  nonnpa: 'Non-NPA',
};

function formatCategoryLabel(category?: string): string {
  const key = String(category || '').trim().toLowerCase();
  if (!key) return '—';
  return PATIENT_CATEGORY_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function nursingProcedureToHistory(proc: any): CompletedProcedure {
  const typeMap: Record<string, ProcedureKind> = {
    injection: 'injection',
    dressing: 'dressing',
    wound_care: 'dressing',
    medication: 'medication',
    other: 'medication',
    'ward admission': 'ward_admission',
    'observation admission': 'ward_admission',
    ward_admission: 'ward_admission',
    observation_admission: 'ward_admission',
  };
  const procedureType = typeMap[String(proc.procedure_type || '').toLowerCase()] || 'medication';
  const description = String(proc.description || '');
  const wardFromDescription = description.match(/to\s+([^.;,\n]+)$/i)?.[1]?.trim() || '';
  const wardLabel =
    proc.ward_name ||
    proc.ward?.name ||
    wardFromDescription ||
    (procedureType === 'ward_admission' ? 'Observation Ward' : '');
  const orderedByLabel = resolveOrderedByName(proc);

  const { details, orderInstructions, record } = resolveProcedureHistoryDetails(procedureType, proc);

  if (procedureType === 'ward_admission' && !details.medication) {
    details.medication = 'Observation Admission';
  }

  const age = resolvePatientAge({
    age: proc.patient_age,
    date_of_birth: proc.patient_date_of_birth,
  }) ?? 0;

  return {
    id: String(proc.id),
    type: procedureType,
    patientName: proc.patient_name ?? '',
    patientId: proc.patient_patient_id ?? '',
    age,
    dob: proc.patient_date_of_birth || '',
    gender: formatGender(proc.patient_gender),
    category: formatCategoryLabel(proc.patient_category),
    bloodGroup: proc.patient_blood_group ? String(proc.patient_blood_group) : '',
    ward: wardLabel,
    orderInstructions,
    orderedBy: orderedByLabel,
    completedAt: proc.performed_at || proc.created_at || new Date().toISOString(),
    completedBy: proc.performed_by_name || 'Unknown',
    details,
    record,
  };
}

export default function ProceduresHistoryPage() {
  const [history, setHistory] = useState<CompletedProcedure[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [historyStats, setHistoryStats] = useState({
    total: 0,
    injections: 0,
    dressings: 0,
    medications: 0,
    observations: 0,
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Dialog states
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<CompletedProcedure | null>(null);

  useAuthRedirect(authError);

  const appendHistoryFilters = useCallback(
    (qs: URLSearchParams, opts?: { skipDate?: boolean }) => {
      const q = debouncedSearch.trim();
      if (q) qs.set('search', q);
      if (typeFilter !== 'all') qs.set('history_type', typeFilter);
      if (genderFilter !== 'all') qs.set('patient_gender', genderFilter.toLowerCase());
      if (opts?.skipDate) return;
      if (dateRange.from || dateRange.to) {
        if (dateRange.from) qs.set('performed_at_after', dateRange.from);
        if (dateRange.to) qs.set('performed_at_before', dateRange.to);
      } else if (dateFilter !== 'all') {
        qs.set('date_filter', dateFilter);
      }
    },
    [debouncedSearch, typeFilter, genderFilter, dateFilter, dateRange.from, dateRange.to]
  );

  const loadHistoryStats = useCallback(async () => {
    try {
      const params: Record<string, string | undefined> = {};
      const q = debouncedSearch.trim();
      if (q) params.search = q;
      if (genderFilter !== 'all') params.patient_gender = genderFilter.toLowerCase();
      if (dateRange.from || dateRange.to) {
        if (dateRange.from) params.performed_at_after = dateRange.from;
        if (dateRange.to) params.performed_at_before = dateRange.to;
      } else if (dateFilter !== 'all') {
        params.date_filter = dateFilter;
      }
      const stats = await nursingService.getProceduresHistoryStats(params);
      setHistoryStats({
        total: stats.total ?? 0,
        injections: stats.injections ?? 0,
        dressings: stats.dressings ?? 0,
        medications: stats.medications ?? 0,
        observations: stats.observations ?? 0,
      });
    } catch (e) {
      console.error('Failed to load procedure history stats:', e);
    }
  }, [debouncedSearch, genderFilter, dateFilter, dateRange.from, dateRange.to]);

  const loadHistoryPage = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      qs.set('page', String(currentPage));
      qs.set('page_size', String(itemsPerPage));
      appendHistoryFilters(qs);
      const res = await apiFetch<{ results: any[]; count?: number }>(`/nursing/procedures/?${qs.toString()}`);
      setHistory((res.results || []).map(nursingProcedureToHistory));
      setTotalCount(typeof res.count === 'number' ? res.count : (res.results || []).length);
    } catch (err) {
      console.error('Error loading procedures history:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        setError('Failed to load procedures history. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [appendHistoryFilters, currentPage, itemsPerPage]);

  useEffect(() => {
    void loadHistoryStats();
  }, [loadHistoryStats]);

  useEffect(() => {
    void loadHistoryPage();
  }, [loadHistoryPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, typeFilter, dateFilter, genderFilter, dateRange.from, dateRange.to, itemsPerPage]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  const openViewDialog = (procedure: CompletedProcedure) => {
    setSelectedProcedure(procedure);
    setIsViewDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700">
              <FileText className="h-6 w-6 text-white" />
            </div>
            Procedures History
          </h1>
          <p className="text-muted-foreground mt-1">View all completed nursing procedures</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-l-4 border-l-slate-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Records</p>
                  <p className="text-2xl sm:text-3xl font-bold">{historyStats.total}</p>
                </div>
                <FileText className="h-8 w-8 text-slate-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Injections</p>
                  <p className="text-2xl sm:text-3xl font-bold">{historyStats.injections}</p>
                </div>
                <Syringe className="h-8 w-8 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Dressings</p>
                  <p className="text-2xl sm:text-3xl font-bold">{historyStats.dressings}</p>
                </div>
                <Bandage className="h-8 w-8 text-violet-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Medications</p>
                  <p className="text-2xl sm:text-3xl font-bold">{historyStats.medications}</p>
                </div>
                <Pill className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Observations</p>
                  <p className="text-2xl sm:text-3xl font-bold">{historyStats.observations}</p>
                </div>
                <Activity className="h-8 w-8 text-amber-500 opacity-50" />
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
                <Input placeholder="Search patient, ID, or nurse..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
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
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="injection">💉 Injections</SelectItem>
                    <SelectItem value="dressing">🩹 Dressings</SelectItem>
                    <SelectItem value="medication">💊 Medications</SelectItem>
                    <SelectItem value="ward_admission">🛏️ Observation Admissions</SelectItem>
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

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom completed date range to narrow down procedure history."
          label="Completed Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {error && (
          <Card className="border-red-200 dark:border-red-900">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void loadHistoryPage()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* History List */}
        {loading && history.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading procedures history...</p>
            </CardContent>
          </Card>
        ) : totalCount === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No records found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {history.map((procedure) => {
              const typeConfig = getTypeConfig(procedure.type);
              const TypeIcon = typeConfig.icon;
              const { date, time } = formatDateTime(procedure.completedAt);
              const leftBorderClass =
                procedure.type === 'injection'
                  ? 'border-l-emerald-500'
                  : procedure.type === 'dressing'
                    ? 'border-l-violet-500'
                    : procedure.type === 'ward_admission'
                      ? 'border-l-amber-500'
                    : 'border-l-blue-500';

              return (
                <Card key={procedure.id} className={`border-l-4 ${leftBorderClass} hover:shadow-md transition-shadow`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${typeConfig.bgColor}`}>
                        <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{procedure.patientName}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeConfig.bgColor} ${typeConfig.color}`}>
                              {typeConfig.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                              Completed
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <div className={`h-7 w-7 flex items-center justify-center rounded border ${getCompletedIconStyle(procedure.type)}`}>
                              <CheckCircle2 className="h-4 w-4" />
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(procedure)} title="View Procedure">
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{procedure.patientId}</span>
                          <span>•</span>
                          <span>{formatDisplayAge(procedure.age, procedure.dob)}</span>
                          {procedure.type === 'ward_admission' && (
                            <>
                              <span>•</span>
                              <span>{procedure.ward || 'Ward not specified'}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{procedure.completedBy}</span>
                          {procedure.orderedBy && procedure.orderedBy !== procedure.completedBy && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{procedure.orderedBy}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{time ? `${date} ${time}` : date}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 truncate max-w-[260px] hidden md:block">
                          {procedure.type === 'injection' && `${procedure.details.medication || 'Medication'} ${procedure.details.dosage || ''}`.trim()}
                          {procedure.type === 'dressing' && `${procedure.details.woundType || 'Wound care'} - ${procedure.details.woundLocation || 'Location not specified'}`}
                          {procedure.type === 'medication' && (procedure.details.medication || 'Medication administered')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="records"
            />
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedProcedure && (() => {
                  const config = getTypeConfig(selectedProcedure.type);
                  const Icon = config.icon;
                  return <><Icon className={`h-5 w-5 ${config.color}`} />{config.label}</>;
                })()}
              </DialogTitle>
              <DialogDescription>
                {selectedProcedure?.patientName} - {selectedProcedure?.patientId}
              </DialogDescription>
            </DialogHeader>
            {selectedProcedure && (
              <div className="py-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {selectedProcedure.age > 0 ? `${selectedProcedure.age}y` : 'Age unknown'} · {selectedProcedure.gender}
                </p>

                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                  {selectedProcedure.orderedBy && (
                    <p className="text-xs text-muted-foreground">Ordered by {selectedProcedure.orderedBy}</p>
                  )}
                  {selectedProcedure.type === 'injection' && (
                    <>
                      <p className="font-medium text-foreground">
                        {selectedProcedure.details.medication} - {selectedProcedure.details.dosage}
                      </p>
                      <p className="text-sm text-muted-foreground">{selectedProcedure.details.route}</p>
                    </>
                  )}
                  {selectedProcedure.type === 'dressing' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Wound type</p>
                        <p className="font-medium">{selectedProcedure.details.woundType || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="font-medium">{selectedProcedure.details.woundLocation || '—'}</p>
                      </div>
                      {selectedProcedure.orderInstructions ? (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Instructions</p>
                          <p className="text-sm">{selectedProcedure.orderInstructions}</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {selectedProcedure.type === 'medication' && (
                    <>
                      <p className="font-medium text-foreground">{selectedProcedure.details.medication}</p>
                      <p className="text-sm text-muted-foreground">{selectedProcedure.details.route}</p>
                    </>
                  )}
                  {selectedProcedure.type === 'ward_admission' && (
                    <>
                      <p className="font-medium text-foreground">Observation Admission</p>
                      <p className="text-sm text-muted-foreground">{selectedProcedure.ward || 'Ward not specified'}</p>
                    </>
                  )}
                </div>

                {selectedProcedure.type === 'dressing' &&
                  (selectedProcedure.record.dressingType ||
                    selectedProcedure.record.woundCondition ||
                    selectedProcedure.record.notes) && (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedProcedure.record.dressingType ? (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Procedure performed</p>
                        <p className="text-sm text-muted-foreground">{selectedProcedure.record.dressingType}</p>
                      </div>
                    ) : null}
                    {selectedProcedure.record.woundCondition ? (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Wound condition</p>
                        <p className="text-sm text-muted-foreground">{selectedProcedure.record.woundCondition}</p>
                      </div>
                    ) : null}
                    {selectedProcedure.record.notes ? (
                      <div className="col-span-2 space-y-1">
                        <p className="text-sm font-medium">Observations</p>
                        <p className="text-sm text-muted-foreground">{selectedProcedure.record.notes}</p>
                      </div>
                    ) : null}
                  </div>
                )}

                {selectedProcedure.type === 'injection' && (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedProcedure.record.site ? (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Injection site</p>
                        <p className="text-sm text-muted-foreground">{selectedProcedure.record.site}</p>
                      </div>
                    ) : null}
                    {selectedProcedure.record.batchNumber ? (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Batch #</p>
                        <p className="text-sm text-muted-foreground">{selectedProcedure.record.batchNumber}</p>
                      </div>
                    ) : null}
                  </div>
                )}

                {selectedProcedure.type === 'medication' && selectedProcedure.record.site && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Administration site</p>
                    <p className="text-sm text-muted-foreground">{selectedProcedure.record.site}</p>
                  </div>
                )}

                {selectedProcedure.type !== 'dressing' && selectedProcedure.record.notes && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xs text-blue-600 dark:text-blue-400">Notes</p>
                    <p className="text-sm mt-1">{selectedProcedure.record.notes}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />Completed by {selectedProcedure.completedBy}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateTime(selectedProcedure.completedAt).date} at {formatDateTime(selectedProcedure.completedAt).time}</span>
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
