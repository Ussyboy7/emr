"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
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
import { PatientAvatar } from "@/components/PatientAvatar";
import { VitalsDetailModal } from "@/components/VitalsDetailModal";
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';
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
  nursingStatus: 'Pending Vitals' | 'Ready for Consultation' | 'Sent to Rooms';
  alerts: string[];
}

// Patient vitals data will be loaded from API

export default function PatientVitalsPage() {
  const [patients, setPatients] = useState<PatientVitals[]>([]);
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
  
  // Load patients with vitals from API
  useEffect(() => {
    const loadPatients = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch visits that should be processed by nursing (similar to pool queue)
        // NOTE: `patientService.getPatientVisits(id)` fetches visits for a single patient.
        // Passing `0` causes a 404 on backends that don't have a patient with ID 0.
        // Use the visits endpoint instead.
        let dateParam: string | undefined = undefined;
        let startDate: string | undefined = undefined;
        let endDate: string | undefined = undefined;
        if (dateRange.from || dateRange.to) {
          startDate = dateRange.from || undefined;
          endDate = dateRange.to || undefined;
        } else if (dateFilter === 'today') {
          dateParam = new Date().toISOString().split('T')[0];
        } else if (dateFilter === 'week') {
          const today = new Date();
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          startDate = weekStart.toISOString().split('T')[0];
          endDate = today.toISOString().split('T')[0];
        } else if (dateFilter === 'month') {
          const today = new Date();
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          startDate = monthStart.toISOString().split('T')[0];
          endDate = today.toISOString().split('T')[0];
        }

        const visitsResponse = await visitService.getVisits({
          page_size: 1000,
          date: dateParam,
          start_date: startDate,
          end_date: endDate,
        });
        const allVisits = visitsResponse.results || [];

        // Get all visit IDs that have consultation sessions
        let visitsWithSessions: Set<number> = new Set();
        try {
          const sessionsResult = await consultationService.getSessions({ page_size: 1000 });
          visitsWithSessions = new Set(
            sessionsResult.results
              .map((s: any) => s.visit?.id || s.visit_id)
              .filter((id: any) => id)
          );
        } catch (error) {
          console.warn('[Patient Vitals] Could not load consultation sessions:', error);
        }

        // Filter visits that should go to nursing (active visits that don't have consultation sessions)
        const nursingVisits = allVisits.filter((visit: any) => {
          // Exclude cancelled visits
          if (visit.status === 'cancelled') return false;

          // Only include active visits
          if (!['completed', 'in_progress', 'scheduled', 'waiting'].includes(visit.status)) return false;

          // Exclude visits that have consultation sessions (already sent to consultation)
          if (visitsWithSessions.has(visit.id)) {
            return false;
          }

          return true;
        });

        if (nursingVisits.length === 0) {
          setPatients([]);
          setLoading(false);
          return;
        }

        // Get unique *numeric* patient IDs from nursing visits.
        // IMPORTANT: `visit.patient_id` is the human-readable patient identifier (e.g. "9852"),
        // not the DB primary key, and will 404 if used with `/patients/:id/`.
        const patientIds = [
          ...new Set(
            nursingVisits
              .map((v: any) => {
                if (typeof v.patient === 'number') return String(v.patient);
                if (v.patient && typeof v.patient === 'object' && v.patient.id) return String(v.patient.id);
                return null;
              })
              .filter((id: string | null): id is string => Boolean(id))
          ),
        ];

        // Fetch patient details and check vitals status
        const patientPromises = patientIds.map(async (patientId) => {
          try {
            const patient = await patientService.getPatient(parseInt(patientId));

            // Load patient's vitals history
            let patientVitals: any[] = [];
            let latestVitals: any = null;
            let hasVitalsToday = false;

            try {
              const vitalsResponse = await apiFetch<{ results: any[] }>(`/vitals/?patient=${patientId}&ordering=-recorded_at&page_size=10`);
              patientVitals = vitalsResponse.results || [];
              if (patientVitals.length > 0) {
                latestVitals = patientVitals[0];
                // Check if vitals were recorded recently (within last 7 days)
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                const vitalsDate = new Date(latestVitals.recorded_at);
                hasVitalsToday = vitalsDate >= sevenDaysAgo;
              }
            } catch (vitalsError) {
              console.warn('[Patient Vitals] Could not load vitals for patient:', patientId, vitalsError);
            }
            
            // Determine nursing status based on vitals recording
            const nursingStatus = hasVitalsToday ? 'Ready for Consultation' : 'Pending Vitals';

            // Calculate vitals status if vitals exist
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

              if (latestVitals.bloodPressureSystolic && latestVitals.bloodPressureDiastolic) {
                const systolic = parseInt(latestVitals.bloodPressureSystolic);
                const diastolic = parseInt(latestVitals.bloodPressureDiastolic);

                // Hypertension stages (medical guidelines)
                if (systolic >= 180 || diastolic >= 120) {
                  vitalsStatus = 'critical'; alerts.push('Hypertensive crisis');
                } else if (systolic >= 130 || diastolic >= 80) {
                  vitalsStatus = vitalsStatus !== 'critical' ? 'warning' : vitalsStatus; alerts.push('High blood pressure');
                } else if (systolic < 90 || diastolic < 60) {
                  vitalsStatus = vitalsStatus !== 'critical' ? 'warning' : vitalsStatus; alerts.push('Low blood pressure');
                }
              }
            }
            
            // Transform vitals
            const transformedVitals: VitalsData = {
              id: String(latestVitals.id),
              temperature: latestVitals.temperature?.toString() || '',
              pulse: latestVitals.heart_rate?.toString() || '',
              bloodPressureSystolic: latestVitals.blood_pressure_systolic?.toString() || '',
              bloodPressureDiastolic: latestVitals.blood_pressure_diastolic?.toString() || '',
              respiratoryRate: latestVitals.respiratory_rate?.toString() || '',
              oxygenSaturation: latestVitals.oxygen_saturation?.toString() || '',
              weight: latestVitals.weight?.toString() || '',
              height: latestVitals.height?.toString() || '',
              painScale: latestVitals.pain_scale?.toString() || '',
              bloodSugar: latestVitals.blood_sugar?.toString() || '',
              bmi: latestVitals.bmi?.toString() || '',
              notes: latestVitals.notes || '',
              recordedAt: latestVitals.recorded_at || new Date().toISOString(),
              recordedBy: latestVitals.recorded_by_name || 'Unknown',
            };
            
            // Transform vitals history
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
              bmi: v.bmi?.toString() || '',
              notes: v.notes || '',
              recordedAt: v.recorded_at || new Date().toISOString(),
              recordedBy: v.recorded_by_name || 'Unknown',
            }));
            
            return {
              id: String(patient.id),
              name: patient.full_name || `${patient.surname} ${patient.first_name}`,
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
            // Don't fail silently - show which patient failed
            toast.error(`Failed to load patient ${patientId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return null;
          }
        });
        
        const loadedPatients = (await Promise.all(patientPromises)).filter((p): p is PatientVitals => p !== null);
        setPatients(loadedPatients);
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
        setLoading(false);
      }
    };
    
    loadPatients();
  }, [dateFilter, dateRange.from, dateRange.to]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Dialog states
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientVitals | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedVitals, setSelectedVitals] = useState<VitalsData | null>(null);
  const [isVitalsDetailModalOpen, setIsVitalsDetailModalOpen] = useState(false);

  // Filter patients
  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           p.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           p.personalNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.nursingStatus === statusFilter;
      const matchesGender = genderFilter === 'all' || p.gender.toLowerCase() === genderFilter.toLowerCase();
      
      // Date filter (filter by latest vitals recorded date)
      if ((dateRange.from || dateRange.to) && p.latestVitals?.recordedAt) {
        const recordedDate = new Date(p.latestVitals.recordedAt);
        if (Number.isNaN(recordedDate.getTime())) return false;
        if (dateRange.from) {
          const from = new Date(`${dateRange.from}T00:00:00`);
          if (recordedDate < from) return false;
        }
        if (dateRange.to) {
          const to = new Date(`${dateRange.to}T23:59:59.999`);
          if (recordedDate > to) return false;
        }
      } else if (dateFilter !== 'all' && p.latestVitals?.recordedAt) {
        const recordedDate = new Date(p.latestVitals.recordedAt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (dateFilter === 'today' && recordedDate.toDateString() !== today.toDateString()) return false;
        if (dateFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (recordedDate < weekAgo) return false;
        }
        if (dateFilter === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          if (recordedDate < monthAgo) return false;
        }
      }
      
      return matchesSearch && matchesStatus && matchesGender;
    });
  }, [patients, searchQuery, statusFilter, dateFilter, genderFilter, dateRange.from, dateRange.to]);

  // Paginated patients
  const paginatedPatients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPatients.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPatients, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, genderFilter, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // Stats
  const stats = useMemo(() => ({
    total: patients.length,
    pendingVitals: patients.filter(p => p.nursingStatus === 'Pending Vitals').length,
    readyForConsultation: patients.filter(p => p.nursingStatus === 'Ready for Consultation').length,
    sentToRooms: patients.filter(p => p.nursingStatus === 'Sent to Rooms').length,
  }), [patients]);


  const openHistoryDialog = (patient: PatientVitals) => {
    setSelectedPatient(patient);
    setHistoryPage(1);
    setIsHistoryDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending Vitals': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'Ready for Consultation': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'Sent to Rooms': return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
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
            { label: 'Pending Vitals', value: stats.pendingVitals, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Ready for Consultation', value: stats.readyForConsultation, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Sent to Rooms', value: stats.sentToRooms, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10' },
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
            <div className="flex flex-col gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by name, patient ID, or personal number..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <div className="flex flex-wrap gap-2">
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
                    <SelectItem value="Pending Vitals">Pending Vitals</SelectItem>
                    <SelectItem value="Ready for Consultation">Ready for Consultation</SelectItem>
                    <SelectItem value="Sent to Rooms">Sent to Rooms</SelectItem>
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
          Showing <span className="font-medium text-foreground">{paginatedPatients.length}</span> of {filteredPatients.length} patients
        </p>
        )}

        {/* Patient Vitals List */}
        {!loading && (
        <div className="space-y-3">
          {patients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">No patient vitals recorded</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Patient vitals will appear here once they are recorded in the Nursing Pool Queue
                </p>
              </CardContent>
            </Card>
          ) : filteredPatients.length === 0 ? (
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
            paginatedPatients.map((patient) => (
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
                            BP:{patient.latestVitals.bloodPressureSystolic}/{patient.latestVitals.bloodPressureDiastolic} • 
                            P:{patient.latestVitals.pulse} • 
                            T:{patient.latestVitals.temperature}°
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
                        <span>{patient.personalNumber}</span>
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
        {filteredPatients.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredPatients.length}
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
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {selectedPatient?.vitalsHistory.map((vitals, index) => (
                <Card key={vitals.id} className={`${index === 0 ? 'border-rose-500/50 bg-rose-500/5' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {new Date(vitals.recordedAt).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {new Date(vitals.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {index === 0 && <Badge className="bg-rose-500 text-white text-xs">Latest</Badge>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>BP: {vitals.bloodPressureSystolic}/{vitals.bloodPressureDiastolic}</span>
                          <span>P: {vitals.pulse}</span>
                          <span>T: {vitals.temperature}°C</span>
                          <span>SpO2: {vitals.oxygenSaturation}%</span>
                          {vitals.recordedBy && <span className="ml-auto">Recorded by: {vitals.recordedBy}</span>}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedVitals(vitals);
                          setIsVitalsDetailModalOpen(true);
                        }}
                        className="ml-4"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
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
