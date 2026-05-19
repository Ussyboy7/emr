"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiFetch } from '@/lib/api-client';
import { patientService, consultationService, visitService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { VitalsDetailModal } from "@/components/shared/VitalsDetailModal";
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { useServerToday } from '@/hooks/use-server-today';
import { formatLocalYmd } from '@/lib/laboratory/constants';
import {
  Activity, Search, Eye, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Heart, Thermometer, Wind, Droplets, Scale, Calendar,
  Clock, User, Loader2
} from 'lucide-react';

// Types
interface VitalsData {
  id: string;
  temperature: string;
  pulse: string;
  bloodPressureSystolic: string;
  bloodPressureDiastolic: string;
  respiratoryRate: string;
  oxygenSaturation: string;
  weight: string;
  height: string;
  painScale: string;
  bloodSugar: string;
  randomBloodSugar: string;
  bmi: string;
  notes: string;
  recordedAt: string;
  recordedBy: string;
}

interface PatientVitals {
  id: string;
  name: string;
  patientId: string;
  personalNumber: string;
  age: number;
  gender: string;
  latestVitals: VitalsData;
  vitalsHistory: VitalsData[];
  status: 'normal' | 'warning' | 'critical';
  nursingStatus: 'Awaiting Vitals' | 'Vitals Recorded';
  alerts: string[];
}

// Patient vitals data will be loaded from API

export default function PatientVitalsPage() {
  const serverToday = useServerToday();
  const [patients, setPatients] = useState<PatientVitals[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Pagination state (moved before loadPatients to avoid hoisting issues)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Load patients with vitals from API (using proper backend pagination like lab orders)
  const loadPatients = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      // Build query parameters for backend filtering (like lab orders page)
      const params: any = {
        page: currentPage,
        page_size: itemsPerPage,
      };

      // Add date filtering
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
        const weekStart = new Date(anchor);
        weekStart.setDate(anchor.getDate() - anchor.getDay());
        startDate = formatLocalYmd(weekStart);
        endDate = anchorYmd;
      } else if (dateFilter === 'month') {
        const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        startDate = formatLocalYmd(monthStart);
        endDate = anchorYmd;
      }

      if (dateParam) params.date = dateParam;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      // Add search and gender filters
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      if (genderFilter !== 'all') {
        params.gender = genderFilter;
      }

      // Add nursing status filter (similar to pool queue)
      if (statusFilter === 'Awaiting Vitals') {
        params.nursing_status = 'pending';
      } else if (statusFilter === 'Vitals Recorded') {
        params.nursing_status = 'ready';
      }

      // Fetch visits with backend filtering and pagination
      const [visitsResponse, sessionsResult] = await Promise.all([
        visitService.getVisits(params),
        (async () => {
          try {
            return await consultationService.getSessions({ page_size: 200 });
          } catch (error) {
            console.warn('[Patient Vitals] Could not load consultation sessions:', error);
            return { results: [] };
          }
        })(),
      ]);
      const nursingVisits = visitsResponse.results || [];

      // Get consultation sessions to exclude already processed visits
      let visitsWithSessions: Set<number> = new Set();
      visitsWithSessions = new Set(
        (sessionsResult as any).results
          .map((s: any) => s.visit?.id || s.visit_id)
          .filter((id: any) => id)
      );

      // Filter out cancelled visits and those already in consultation
      const filteredNursingVisits = nursingVisits.filter((visit: any) => {
        if (visit.status === 'cancelled') return false;
        if (visitsWithSessions.has(visit.id)) return false;
        return ['completed', 'in_progress', 'scheduled', 'waiting'].includes(visit.status);
      });

      if (filteredNursingVisits.length === 0) {
        setPatients([]);
        setTotalCount(0);
        if (!silent) setLoading(false);
        return;
      }

      // Get unique patient IDs
      const patientIds = [
        ...new Set(
          filteredNursingVisits
            .map((v: any) => {
              if (typeof v.patient === 'number') return String(v.patient);
              if (v.patient && typeof v.patient === 'object' && v.patient.id) return String(v.patient.id);
              return null;
            })
            .filter((id: string | null): id is string => Boolean(id))
        ),
      ];

      // Fetch patient details and vitals in parallel (like lab orders page)
      const patientPromises = patientIds.map(async (patientId) => {
        try {
          const [patient, vitalsResponse] = await Promise.all([
            patientService.getPatient(parseInt(patientId)),
            apiFetch<{ results: any[] }>(`/vitals/?patient=${patientId}&ordering=-recorded_at&page_size=10`).catch(() => ({ results: [] }))
          ]);

          const patientVitals = vitalsResponse.results || [];
          const latestVitals = patientVitals.length > 0 ? patientVitals[0] : null;

          // Check if vitals were recorded recently (within last 7 days)
          const hasVitalsToday = latestVitals ? (() => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const vitalsDate = new Date(latestVitals.recorded_at);
            return vitalsDate >= sevenDaysAgo;
          })() : false;

          // Determine nursing status
          const nursingStatus = hasVitalsToday ? 'Vitals Recorded' : 'Awaiting Vitals';

          // Calculate vitals status and alerts
          let vitalsStatus: 'normal' | 'warning' | 'critical' = 'normal';
          const alerts: string[] = [];

          if (latestVitals && hasVitalsToday) {
            if (latestVitals.temperature) {
              const temp = parseFloat(latestVitals.temperature);
              if (temp >= 39) { vitalsStatus = 'critical'; alerts.push('High temperature'); }
              else if (temp >= 38) { vitalsStatus = vitalsStatus === 'normal' ? 'warning' : vitalsStatus; alerts.push('Elevated temperature'); }
              else if (temp < 36) { vitalsStatus = vitalsStatus === 'normal' ? 'warning' : vitalsStatus; alerts.push('Low temperature'); }
            }

            if (latestVitals.heart_rate) {
              const hr = parseInt(latestVitals.heart_rate);
              if (hr >= 120 || hr < 60) { vitalsStatus = vitalsStatus !== 'critical' ? 'warning' : vitalsStatus; alerts.push('Abnormal heart rate'); }
            }

            if (latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic) {
              const systolic = parseInt(latestVitals.blood_pressure_systolic);
              const diastolic = parseInt(latestVitals.blood_pressure_diastolic);

              if (systolic >= 180 || diastolic >= 120) {
                vitalsStatus = 'critical'; alerts.push('Hypertensive crisis');
              } else if (systolic >= 130 || diastolic >= 80) {
                vitalsStatus = vitalsStatus !== 'critical' ? 'warning' : vitalsStatus; alerts.push('High blood pressure');
              } else if (systolic < 90 || diastolic < 60) {
                vitalsStatus = vitalsStatus !== 'critical' ? 'warning' : vitalsStatus; alerts.push('Low blood pressure');
              }
            }
          }

          // Transform vitals data
          const transformedVitals: VitalsData = {
            id: String(latestVitals?.id || ''),
            temperature: latestVitals?.temperature?.toString() || '',
            pulse: latestVitals?.heart_rate?.toString() || '',
            bloodPressureSystolic: latestVitals?.blood_pressure_systolic?.toString() || '',
            bloodPressureDiastolic: latestVitals?.blood_pressure_diastolic?.toString() || '',
            respiratoryRate: latestVitals?.respiratory_rate?.toString() || '',
            oxygenSaturation: latestVitals?.oxygen_saturation?.toString() || '',
            weight: latestVitals?.weight?.toString() || '',
            height: latestVitals?.height?.toString() || '',
            painScale: latestVitals?.pain_scale?.toString() || '',
            bloodSugar: latestVitals?.blood_sugar?.toString() || '',
            randomBloodSugar: latestVitals?.random_blood_sugar?.toString() || '',
            bmi: latestVitals?.bmi?.toString() || '',
            notes: latestVitals?.notes || '',
            recordedAt: latestVitals?.recorded_at || new Date().toISOString(),
            recordedBy: latestVitals?.recorded_by_name || 'Unknown',
          };

          const vitalsHistory: VitalsData[] = patientVitals.map((v: any) => ({
            id: String(v.id),
            temperature: v.temperature?.toString() || '',
            pulse: v.heart_rate?.toString() || '',
            bloodPressureSystolic: v.blood_pressure_systolic?.toString() || '',
            bloodPressureDiastolic: v.blood_pressure_diastolic?.toString() || '',
            respiratoryRate: v.respiratory_rate?.toString() || '',
            oxygenSaturation: v.oxygen_saturation?.toString() || '',
            weight: v.weight?.toString() || '',
            height: v.height?.toString() || '',
            painScale: v.pain_scale?.toString() || '',
            bloodSugar: v.blood_sugar?.toString() || '',
            randomBloodSugar: v.random_blood_sugar?.toString() || '',
            bmi: v.bmi?.toString() || '',
            notes: v.notes || '',
            recordedAt: v.recorded_at || new Date().toISOString(),
            recordedBy: v.recorded_by_name || 'Unknown',
          }));

          return {
            id: String(patient.id),
            name: patient.full_name ?? '',
            patientId: patient.patient_id || '',
            personalNumber: patient.personal_number || '',
            age: patient.age || 0,
            gender: patient.gender || '',
            latestVitals: transformedVitals,
            vitalsHistory,
            status: vitalsStatus,
            nursingStatus,
            alerts,
          } as PatientVitals;
        } catch (err) {
          console.error(`[Patient Vitals] Error loading patient ${patientId}:`, err);
          return null;
        }
      });

      const loadedPatients = (await Promise.all(patientPromises)).filter((p): p is PatientVitals => p !== null);
      setPatients(loadedPatients);
      setTotalCount(visitsResponse.count || loadedPatients.length);

    } catch (err) {
      console.error('[Patient Vitals] Error loading patients with vitals:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        setError(`Failed to load patient vitals: ${errorMessage}`);
        toast.error(`Failed to load patient vitals: ${errorMessage}`);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentPage, itemsPerPage, dateFilter, dateRange.from, dateRange.to, searchQuery, genderFilter, statusFilter, serverToday]);

  // Load data when filters change
  useEffect(() => {
    loadPatients();
  }, [loadPatients]);
  
  // Dialog states
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientVitals | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedVitals, setSelectedVitals] = useState<VitalsData | null>(null);
  const [isVitalsDetailModalOpen, setIsVitalsDetailModalOpen] = useState(false);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, genderFilter, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // Stats (calculated from current page - would be better with separate stats endpoint like lab orders)
  const stats = useMemo(() => ({
    total: totalCount,
    pendingVitals: patients.filter(p => p.nursingStatus === 'Awaiting Vitals').length,
    readyForConsultation: patients.filter(p => p.nursingStatus === 'Vitals Recorded').length,
  }), [patients, totalCount]);


  const openHistoryDialog = (patient: PatientVitals) => {
    setSelectedPatient(patient);
    setHistoryPage(1);
    setIsHistoryDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Awaiting Vitals': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'Vitals Recorded': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'normal': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'warning': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'critical': return 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10';
      default: return 'border-gray-500/50 text-gray-600 bg-gray-500/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'critical': return <AlertTriangle className="h-4 w-4 text-rose-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getVitalStatus = (type: string, value: string): 'normal' | 'high' | 'low' | 'critical' => {
    const num = parseFloat(value);
    if (isNaN(num)) return 'normal';
    
    switch (type) {
      case 'temperature':
        if (num >= 39) return 'critical';
        if (num >= 38) return 'high';
        if (num < 36) return 'low';
        return 'normal';
      case 'pulse':
        if (num >= 120) return 'critical';
        if (num >= 100) return 'high';
        if (num < 60) return 'low';
        return 'normal';
      case 'bloodPressureSystolic':
        if (num >= 180) return 'critical';
        if (num >= 140) return 'high';
        if (num < 90) return 'low';
        return 'normal';
      case 'oxygenSaturation':
        if (num < 90) return 'critical';
        if (num < 95) return 'low';
        return 'normal';
      default:
        return 'normal';
    }
  };

  const getVitalStatusColor = (status: string) => {
    switch (status) {
      case 'high': return 'text-amber-600 dark:text-amber-400';
      case 'low': return 'text-blue-600 dark:text-blue-400';
      case 'critical': return 'text-rose-600 dark:text-rose-400 font-bold';
      default: return 'text-foreground';
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-8 w-8 text-rose-500" />
            Patient Vitals
          </h1>
          <p className="text-muted-foreground mt-1">Monitor and view patient vitals history</p>
        </div>

        {/* Loading State */}
        {loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
              <p className="text-muted-foreground">Loading patient vitals...</p>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && !loading && (
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {          [
            { label: 'Total Patients', value: stats.total, icon: User, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Awaiting Vitals', value: stats.pendingVitals, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Vitals Recorded', value: stats.readyForConsultation, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          ].map((stat, i) => (
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
        )}

        {/* Filters */}
        {!loading && (
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Awaiting Vitals">Awaiting Vitals</SelectItem>
                    <SelectItem value="Vitals Recorded">Vitals Recorded</SelectItem>
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

        )}

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom recorded date range to narrow down patient vitals."
          label="Recorded Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {/* Results Count */}
        {!loading && (
        <p className="text-sm text-muted-foreground px-1">
          Showing <span className="font-medium text-foreground">{patients.length}</span> of {totalCount} patients
        </p>
        )}

        {/* Patient Vitals List */}
        {!loading && (
        <div className="space-y-3">
          {totalCount === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">No patient vitals recorded</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Patient vitals will appear here once they are recorded in the Nursing Pool Queue
                </p>
              </CardContent>
            </Card>
          ) : patients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                  {searchQuery || statusFilter !== 'all' ? 'No patients found' : 'No patient vitals recorded'}
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your search or filter criteria'
                    : 'No patient vitals have been recorded yet. To record vitals, go to the Nursing Pool Queue page and record vitals for patients during their visit.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            patients.map((patient) => (
              <Card key={patient.id} className={`border-l-4 hover:shadow-md transition-shadow ${
                patient.status === 'critical' ? 'border-l-rose-500' : 
                patient.status === 'warning' ? 'border-l-amber-500' : 'border-l-emerald-500'
              }`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <PatientAvatar name={patient.name} photoUrl={undefined} size="sm" />
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Vitals Summary + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{patient.name}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(patient.nursingStatus)}`}>{patient.nursingStatus}</Badge>
                          {patient.alerts.length > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-rose-500 text-rose-500">⚠️ Alert</Badge>
                          )}
                           {/* Compact Vitals */}
                           <span className="text-[10px] text-muted-foreground hidden md:inline">
                             {patient.latestVitals.bloodPressureSystolic && patient.latestVitals.bloodPressureDiastolic ? `BP:${patient.latestVitals.bloodPressureSystolic}/${patient.latestVitals.bloodPressureDiastolic}` : ''}
                           </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => openHistoryDialog(patient)}>
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs">History</span>
                          </Button>
                        </div>
                      </div>
                      
                      {/* Row 2: Details */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span>{patient.patientId}</span>
                        <span>•</span>
                        <span>{patient.age}y {patient.gender}</span>
                        <span>•</span>
                        <span>Last: {new Date(patient.latestVitals.recordedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(patient.latestVitals.recordedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                  
                </CardContent>
              </Card>
            ))
          )}
        </div>
        )}

        {/* Pagination */}
        {patients.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={patients.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="patients"
            />
          </Card>
        )}

        {/* History Dialog */}
        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-rose-500" />
                Vitals History - {selectedPatient?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedPatient?.patientId} | {selectedPatient?.personalNumber} | {selectedPatient?.vitalsHistory?.length || 0} records
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto py-4 space-y-2">
              {selectedPatient?.vitalsHistory.map((vitals, index) => (
                <Card key={vitals.id} className={`${index === 0 ? 'border-rose-500/50' : ''}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{new Date(vitals.recordedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span>{new Date(vitals.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {index === 0 && <Badge className="bg-rose-500 text-white text-[10px] h-4">Latest</Badge>}
                          <span className="ml-auto">{vitals.recordedBy ? `by ${vitals.recordedBy}` : ''}</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                          {vitals.bloodPressureSystolic || vitals.bloodPressureDiastolic ? <div><span className="text-muted-foreground">BP:</span> <span className="font-medium">{vitals.bloodPressureSystolic || '—'}/{vitals.bloodPressureDiastolic || '—'}</span></div> : null}
                          {vitals.pulse ? <div><span className="text-muted-foreground">Pulse:</span> <span className="font-medium">{vitals.pulse}</span> <span className="text-xs text-muted-foreground">bpm</span></div> : null}
                          {vitals.temperature ? <div><span className="text-muted-foreground">Temp:</span> <span className="font-medium">{vitals.temperature}°C</span></div> : null}
                          {vitals.oxygenSaturation ? <div><span className="text-muted-foreground">SpO2:</span> <span className="font-medium">{vitals.oxygenSaturation}%</span></div> : null}
                          {vitals.respiratoryRate ? <div><span className="text-muted-foreground">RR:</span> <span className="font-medium">{vitals.respiratoryRate}</span> <span className="text-xs text-muted-foreground">/min</span></div> : null}
                          {vitals.bloodSugar ? <div><span className="text-muted-foreground">FBS:</span> <span className="font-medium">{vitals.bloodSugar}</span> <span className="text-xs text-muted-foreground">mg/dL</span></div> : null}
                          {vitals.randomBloodSugar ? <div><span className="text-muted-foreground">RBS:</span> <span className="font-medium">{vitals.randomBloodSugar}</span> <span className="text-xs text-muted-foreground">mg/dL</span></div> : null}
                          {vitals.weight ? <div><span className="text-muted-foreground">Weight:</span> <span className="font-medium">{vitals.weight}</span> <span className="text-xs text-muted-foreground">kg</span></div> : null}
                          {vitals.height ? <div><span className="text-muted-foreground">Height:</span> <span className="font-medium">{vitals.height}</span> <span className="text-xs text-muted-foreground">cm</span></div> : null}
                          {vitals.bmi ? <div><span className="text-muted-foreground">BMI:</span> <span className="font-medium">{vitals.bmi}</span></div> : null}
                          {vitals.painScale ? <div><span className="text-muted-foreground">Pain:</span> <span className="font-medium">{vitals.painScale}/10</span></div> : null}
                        </div>
                        {vitals.notes && <p className="text-xs text-muted-foreground italic mt-2">{vitals.notes}</p>}
                      </div>
                      <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => { setSelectedVitals(vitals); setIsVitalsDetailModalOpen(true); }}>
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {selectedPatient?.vitalsHistory.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No vitals history available</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Vitals Detail Modal */}
        <VitalsDetailModal
          vitals={selectedVitals}
          patientName={selectedPatient?.name}
          isOpen={isVitalsDetailModalOpen}
          onClose={() => setIsVitalsDetailModalOpen(false)}
        />
      </div>
    </DashboardLayout>
  );
}
