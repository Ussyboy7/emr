"use client";

import { useState, useEffect, useCallback } from 'react';
import { formatDisplayDateMedium, formatDisplayTime } from "@/lib/dates";
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { VitalsDetailModal } from "@/components/shared/VitalsDetailModal";
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { apiFetch } from '@/lib/api-client';
import { patientService } from '@/lib/services';
import { useNursingPageAuth } from '@/hooks/use-nursing-page-auth';
import { fetchAllPaginatedResults } from '@/lib/fetch-paginated-results';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { toast } from 'sonner';
import {
  Activity, Search, Eye, Heart, Calendar, Clock, User, Loader2,
} from 'lucide-react';

interface VitalsPatientSummary {
  patient: number;
  patient_id: string;
  patient_name: string;
  patient_photo?: string | null;
  patient_gender: string;
  patient_date_of_birth: string | null;
  reading_count: number;
  last_recorded_at: string;
  latest_bp_systolic: number | null;
  latest_bp_diastolic: number | null;
}

interface ApiVital {
  id: number;
  recorded_at: string;
  recorded_by_name?: string;
  location_clinic_name?: string;
  temperature?: number | string | null;
  heart_rate?: number | string | null;
  blood_pressure_systolic?: number | string | null;
  blood_pressure_diastolic?: number | string | null;
  respiratory_rate?: number | string | null;
  oxygen_saturation?: number | string | null;
  weight?: number | string | null;
  height?: number | string | null;
  bmi?: number | string | null;
  pain_scale?: number | string | null;
  blood_sugar?: number | string | null;
  random_blood_sugar?: number | string | null;
  notes?: string;
}

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

const resolvePatientAge = (dob: string | null | undefined): number | null => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

const formatGender = (gender?: string): string => {
  const value = String(gender || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'male') return 'Male';
  if (value === 'female') return 'Female';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

function vitalDetailValue(value: string | number | null | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  return String(value);
}

function apiVitalToDetail(v: ApiVital) {
  return {
    id: v.id,
    recorded_at: v.recorded_at,
    recorded_by_name: v.recorded_by_name,
    location_clinic_name: v.location_clinic_name,
    temperature: vitalDetailValue(v.temperature),
    pulse: vitalDetailValue(v.heart_rate),
    heartRate: vitalDetailValue(v.heart_rate),
    bloodPressureSystolic: vitalDetailValue(v.blood_pressure_systolic),
    bloodPressureDiastolic: vitalDetailValue(v.blood_pressure_diastolic),
    respiratoryRate: vitalDetailValue(v.respiratory_rate),
    oxygenSaturation: vitalDetailValue(v.oxygen_saturation),
    weight: vitalDetailValue(v.weight),
    height: vitalDetailValue(v.height),
    bmi: vitalDetailValue(v.bmi),
    painScale: vitalDetailValue(v.pain_scale),
    bloodSugar: vitalDetailValue(v.blood_sugar),
    randomBloodSugar: vitalDetailValue(v.random_blood_sugar),
    notes: v.notes,
  };
}

export default function VitalsHistoryPage() {
  const { ready, handleAuthError } = useNursingPageAuth();
  const [patients, setPatients] = useState<VitalsPatientSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [dateFilter, setDateFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [historyStats, setHistoryStats] = useState({
    total: 0,
    today: 0,
    week: 0,
    patients: 0,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [isVitalsDialogOpen, setIsVitalsDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<VitalsPatientSummary | null>(null);
  const [patientVitals, setPatientVitals] = useState<ApiVital[]>([]);
  const [vitalsLoading, setVitalsLoading] = useState(false);
  const [selectedVital, setSelectedVital] = useState<ApiVital | null>(null);
  const [isVitalsDetailModalOpen, setIsVitalsDetailModalOpen] = useState(false);

  const appendHistoryFilters = useCallback(
    (qs: URLSearchParams, opts?: { skipDate?: boolean }) => {
      const q = debouncedSearch.trim();
      if (q) qs.set('search', q);
      if (genderFilter !== 'all') qs.set('patient_gender', genderFilter.toLowerCase());
      if (opts?.skipDate) return;
      if (dateRange.from || dateRange.to) {
        if (dateRange.from) qs.set('recorded_at_after', dateRange.from);
        if (dateRange.to) qs.set('recorded_at_before', dateRange.to);
      } else if (dateFilter !== 'all') {
        qs.set('date_filter', dateFilter);
      }
    },
    [debouncedSearch, genderFilter, dateFilter, dateRange.from, dateRange.to]
  );

  const loadHistoryStats = useCallback(async () => {
    try {
      const params: Record<string, string | undefined> = {};
      const q = debouncedSearch.trim();
      if (q) params.search = q;
      if (genderFilter !== 'all') params.patient_gender = genderFilter.toLowerCase();
      if (dateRange.from || dateRange.to) {
        if (dateRange.from) params.recorded_at_after = dateRange.from;
        if (dateRange.to) params.recorded_at_before = dateRange.to;
      } else if (dateFilter !== 'all') {
        params.date_filter = dateFilter;
      }
      const stats = await patientService.getVitalsHistoryStats(params);
      setHistoryStats({
        total: stats.total ?? 0,
        today: stats.today ?? 0,
        week: stats.week ?? 0,
        patients: stats.patients ?? 0,
      });
    } catch (e) {
      console.error('Failed to load vitals history stats:', e);
      if (handleAuthError(e)) return;
      toast.error('Failed to load vitals history statistics');
    }
  }, [debouncedSearch, genderFilter, dateFilter, dateRange.from, dateRange.to, handleAuthError]);

  const loadPatientsPage = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      qs.set('page', String(currentPage));
      qs.set('page_size', String(itemsPerPage));
      appendHistoryFilters(qs);
      const res = await apiFetch<{ results: VitalsPatientSummary[]; count?: number }>(
        `/vitals/history-patients/?${qs.toString()}`
      );
      setPatients(res.results || []);
      setTotalCount(typeof res.count === 'number' ? res.count : (res.results || []).length);
    } catch (err) {
      console.error('Error loading vitals history:', err);
      if (handleAuthError(err)) return;
      setError('Failed to load vitals history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [appendHistoryFilters, currentPage, itemsPerPage, handleAuthError]);

  const loadPatientVitals = useCallback(async (patient: VitalsPatientSummary) => {
    try {
      setVitalsLoading(true);
      const qs = new URLSearchParams({
        patient: String(patient.patient),
        ordering: '-recorded_at',
      });
      appendHistoryFilters(qs);
      const allVitals = await fetchAllPaginatedResults((page, page_size) =>
        apiFetch<{ results: ApiVital[]; count?: number }>(
          `/vitals/?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(page), page_size: String(page_size) }).toString()}`
        )
      );
      setPatientVitals(allVitals);
    } catch (err) {
      console.error('Error loading patient vitals:', err);
      if (handleAuthError(err)) return;
      toast.error('Failed to load patient vitals');
      setPatientVitals([]);
    } finally {
      setVitalsLoading(false);
    }
  }, [appendHistoryFilters, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadHistoryStats();
  }, [ready, loadHistoryStats]);

  useEffect(() => {
    if (!ready) return;
    void loadPatientsPage();
  }, [ready, loadPatientsPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, dateFilter, genderFilter, dateRange.from, dateRange.to, itemsPerPage]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  const openVitalsDialog = (patient: VitalsPatientSummary) => {
    setSelectedPatient(patient);
    setIsVitalsDialogOpen(true);
    void loadPatientVitals(patient);
  };

  const openVitalDetail = (vital: ApiVital) => {
    setSelectedVital(vital);
    setIsVitalsDetailModalOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600">
              <Heart className="h-6 w-6 text-white" />
            </div>
            Vitals History
          </h1>
          <p className="text-muted-foreground mt-1">View all recorded patient vitals</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Readings</p>
                  <p className="text-2xl sm:text-3xl font-bold">{historyStats.total}</p>
                </div>
                <Activity className="h-8 w-8 text-rose-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today</p>
                  <p className="text-2xl sm:text-3xl font-bold">{historyStats.today}</p>
                </div>
                <Calendar className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">This Week</p>
                  <p className="text-2xl sm:text-3xl font-bold">{historyStats.week}</p>
                </div>
                <Clock className="h-8 w-8 text-violet-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Patients</p>
                  <p className="text-2xl sm:text-3xl font-bold">{historyStats.patients}</p>
                </div>
                <User className="h-8 w-8 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, patient ID, or personal number..."
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
          description="Apply a custom recorded date range to narrow down vitals history."
          label="Recorded Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {error && (
          <Card className="border-red-200 dark:border-red-900">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void loadPatientsPage()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {loading && patients.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading vitals history...</p>
            </CardContent>
          </Card>
        ) : totalCount === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Heart className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No vitals found</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Try adjusting your search or filters. To record new vitals, use the Nursing Pool Queue.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {patients.map((patient) => {
              const age = resolvePatientAge(patient.patient_date_of_birth);
              const { date, time } = formatDateTime(patient.last_recorded_at);
              const bp =
                patient.latest_bp_systolic != null && patient.latest_bp_diastolic != null
                  ? `BP: ${patient.latest_bp_systolic}/${patient.latest_bp_diastolic}`
                  : '';

              return (
                <Card key={patient.patient} className="border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <PatientAvatar name={patient.patient_name} photoUrl={patient.patient_photo} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{patient.patient_name}</span>
                            {bp && (
                              <span className="text-[10px] text-muted-foreground hidden md:inline">{bp}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {patient.reading_count} reading{patient.reading_count === 1 ? '' : 's'}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 flex-shrink-0"
                            onClick={() => openVitalsDialog(patient)}
                          >
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs">View vitals</span>
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{patient.patient_id}</span>
                          {age != null && (
                            <>
                              <span>•</span>
                              <span>{age}y {formatGender(patient.patient_gender)}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>Last: {date} {time}</span>
                        </div>
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
              itemName="patients"
            />
          </Card>
        )}

        <Dialog open={isVitalsDialogOpen} onOpenChange={setIsVitalsDialogOpen}>
          <DialogContent className={`${MODAL_SIZES.lg} flex flex-col`}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-rose-500" />
                Vitals — {selectedPatient?.patient_name}
              </DialogTitle>
              <DialogDescription>
                {selectedPatient?.patient_id} · {selectedPatient?.reading_count ?? patientVitals.length} record
                {(selectedPatient?.reading_count ?? patientVitals.length) === 1 ? '' : 's'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto py-2">
              {vitalsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading vitals...
                </div>
              ) : patientVitals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No vitals recorded</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Date</th>
                        <th className="px-4 py-2 text-left font-medium">Recorded By</th>
                        <th className="px-4 py-2 text-left font-medium">Location</th>
                        <th className="px-4 py-2 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {patientVitals.map((v) => (
                        <tr key={v.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDisplayDateMedium(v.recorded_at)}</td>
                          <td className="px-4 py-3">{v.recorded_by_name || '—'}</td>
                          <td className="px-4 py-3">{v.location_clinic_name || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => openVitalDetail(v)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsVitalsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <VitalsDetailModal
          vitals={selectedVital ? apiVitalToDetail(selectedVital) : null}
          patientName={selectedPatient?.patient_name}
          patientId={selectedPatient?.patient_id}
          isOpen={isVitalsDetailModalOpen}
          onClose={() => setIsVitalsDetailModalOpen(false)}
          readonly
        />
      </div>
    </DashboardLayout>
  );
}
