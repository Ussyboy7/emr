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
import { patientService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { 
  Activity, Search, RefreshCw, Eye, TrendingUp, TrendingDown, AlertTriangle, 
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Load patients with vitals from API
  useEffect(() => {
    const loadPatients = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch all vitals
        console.log('[Patient Vitals] Fetching vitals from API...');
        const vitalsResult = await apiFetch<{ results: any[] }>('/vitals/?ordering=-recorded_at&page_size=1000');
        console.log('[Patient Vitals] Full API response:', vitalsResult);
        const allVitals = vitalsResult.results || vitalsResult || [];
        console.log('[Patient Vitals] Fetched vitals:', allVitals.length, 'records');
        console.log('[Patient Vitals] Sample vital record:', allVitals[0]);
        
        if (allVitals.length === 0) {
          console.log('[Patient Vitals] No vitals found in database');
          setPatients([]);
          setLoading(false);
          return;
        }
        
        // Group vitals by patient ID
        const vitalsByPatient: Record<string, any[]> = {};
        allVitals.forEach((vital: any) => {
          // Handle both numeric and object patient IDs
          let patientId: string | null = null;
          if (vital.patient) {
            if (typeof vital.patient === 'object' && vital.patient.id) {
              patientId = String(vital.patient.id);
            } else if (typeof vital.patient === 'number') {
              patientId = String(vital.patient);
            } else if (typeof vital.patient === 'string') {
              patientId = vital.patient;
            }
          }
          
          if (!patientId || patientId === 'null' || patientId === 'undefined') {
            console.warn('[Patient Vitals] Vital record missing or invalid patient ID:', vital);
            return;
          }
          
          if (!vitalsByPatient[patientId]) {
            vitalsByPatient[patientId] = [];
          }
          vitalsByPatient[patientId].push(vital);
        });
        
        // Get unique patient IDs
        const patientIds = Object.keys(vitalsByPatient);
        console.log('[Patient Vitals] Found', patientIds.length, 'unique patients with vitals:', patientIds);
        
        if (patientIds.length === 0) {
          console.log('[Patient Vitals] No patient IDs found in vitals - all vitals may be missing patient field');
          setPatients([]);
          setLoading(false);
          return;
        }
        
        // Fetch patient details for all patients with vitals
        const patientPromises = patientIds.map(async (patientId) => {
          try {
            console.log('[Patient Vitals] Fetching patient details for ID:', patientId);
            const patient = await patientService.getPatient(parseInt(patientId));
            const patientVitals = vitalsByPatient[patientId];
            const latestVitals = patientVitals[0]; // Already sorted by -recorded_at
            console.log('[Patient Vitals] Loaded patient:', patient.full_name || patient.surname, 'with', patientVitals.length, 'vitals records');
            
            // Calculate status based on vitals
            let status: 'normal' | 'warning' | 'critical' = 'normal';
            const alerts: string[] = [];
            
            if (latestVitals.temperature) {
              const temp = parseFloat(latestVitals.temperature);
              if (temp >= 39) { status = 'critical'; alerts.push('High temperature'); }
              else if (temp >= 38) { status = status === 'normal' ? 'warning' : status; alerts.push('Elevated temperature'); }
              else if (temp < 36) { status = status === 'normal' ? 'warning' : status; alerts.push('Low temperature'); }
            }
            
            if (latestVitals.heart_rate) {
              const hr = parseInt(latestVitals.heart_rate);
              if (hr >= 120 || hr < 60) { status = status !== 'critical' ? 'warning' : status; alerts.push('Abnormal heart rate'); }
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
              painScale: '',
              bloodSugar: '',
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
              painScale: '',
              bloodSugar: '',
              bmi: v.bmi?.toString() || '',
              notes: v.notes || '',
              recordedAt: v.recorded_at || new Date().toISOString(),
              recordedBy: v.recorded_by_name || 'Unknown',
            }));
            
            return {
              id: String(patient.id),
              name: patient.full_name || `${patient.surname} ${patient.first_name}`,
              patientId: patient.patient_id || String(patient.id),
              personalNumber: patient.personal_number || '',
              age: patient.age || 0,
              gender: patient.gender || '',
              latestVitals: transformedVitals,
              vitalsHistory,
              status,
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
        console.log('[Patient Vitals] Successfully loaded', loadedPatients.length, 'patients');
        setPatients(loadedPatients);
      } catch (err) {
        console.error('[Patient Vitals] Error loading patients with vitals:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Patient Vitals] Full error details:', err);
        
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
  }, []);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Dialog states
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientVitals | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  // Filter patients
  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           p.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           p.personalNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [patients, searchQuery, statusFilter]);

  // Paginated patients
  const paginatedPatients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPatients.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPatients, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Stats
  const stats = useMemo(() => ({
    total: patients.length,
    normal: patients.filter(p => p.status === 'normal').length,
    warning: patients.filter(p => p.status === 'warning').length,
    critical: patients.filter(p => p.status === 'critical').length,
  }), [patients]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Reload patients with vitals (same logic as useEffect)
      const vitalsResult = await apiFetch<{ results: any[] }>('/vitals/?ordering=-recorded_at&page_size=1000');
      const allVitals = vitalsResult.results || [];
      
      const vitalsByPatient: Record<string, any[]> = {};
      allVitals.forEach((vital: any) => {
        const patientId = String(vital.patient);
        if (!vitalsByPatient[patientId]) {
          vitalsByPatient[patientId] = [];
        }
        vitalsByPatient[patientId].push(vital);
      });
      
      const patientIds = Object.keys(vitalsByPatient);
      
      if (patientIds.length === 0) {
        setPatients([]);
        toast.success('Vitals data refreshed');
        return;
      }
      
      const patientPromises = patientIds.map(async (patientId) => {
        try {
          const patient = await patientService.getPatient(parseInt(patientId));
          const patientVitals = vitalsByPatient[patientId];
          const latestVitals = patientVitals[0];
          
          let status: 'normal' | 'warning' | 'critical' = 'normal';
          const alerts: string[] = [];
          
          if (latestVitals.temperature) {
            const temp = parseFloat(latestVitals.temperature);
            if (temp >= 39) { status = 'critical'; alerts.push('High temperature'); }
            else if (temp >= 38) { status = status === 'normal' ? 'warning' : status; alerts.push('Elevated temperature'); }
            else if (temp < 36) { status = status === 'normal' ? 'warning' : status; alerts.push('Low temperature'); }
          }
          
          if (latestVitals.heart_rate) {
            const hr = parseInt(latestVitals.heart_rate);
            if (hr >= 120 || hr < 60) { status = status !== 'critical' ? 'warning' : status; alerts.push('Abnormal heart rate'); }
          }
          
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
            painScale: '',
            bloodSugar: '',
            bmi: latestVitals.bmi?.toString() || '',
            notes: latestVitals.notes || '',
            recordedAt: latestVitals.recorded_at || new Date().toISOString(),
            recordedBy: latestVitals.recorded_by_name || 'Unknown',
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
            painScale: '',
            bloodSugar: '',
            bmi: v.bmi?.toString() || '',
            notes: v.notes || '',
            recordedAt: v.recorded_at || new Date().toISOString(),
            recordedBy: v.recorded_by_name || 'Unknown',
          }));
          
          return {
            id: String(patient.id),
            name: patient.full_name || `${patient.surname} ${patient.first_name}`,
            patientId: patient.patient_id || String(patient.id),
            personalNumber: patient.personal_number || '',
            age: patient.age || 0,
            gender: patient.gender || '',
            latestVitals: transformedVitals,
            vitalsHistory,
            status,
            alerts,
          } as PatientVitals;
        } catch (err) {
          console.error(`Error loading patient ${patientId}:`, err);
          return null;
        }
      });
      
      const loadedPatients = (await Promise.all(patientPromises)).filter((p): p is PatientVitals => p !== null);
      setPatients(loadedPatients);
      toast.success('Vitals data refreshed');
    } catch (err) {
      console.error('Error refreshing vitals:', err);
      toast.error('Failed to refresh vitals data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const openHistoryDialog = (patient: PatientVitals) => {
    setSelectedPatient(patient);
    setHistoryPage(1);
    setIsHistoryDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
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
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Activity className="h-8 w-8 text-rose-500" />
              Patient Vitals
            </h1>
            <p className="text-muted-foreground mt-1">Monitor and view patient vitals history</p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
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
          {[
            { label: 'Total Patients', value: stats.total, icon: User, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Normal', value: stats.normal, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Warning', value: stats.warning, icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Critical', value: stats.critical, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
          ].map((stat, i) => (
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

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
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      patient.status === 'critical' ? 'bg-rose-100 dark:bg-rose-900/30' : 
                      patient.status === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' : 
                      'bg-emerald-100 dark:bg-emerald-900/30'
                    }`}>
                      <span className={`font-semibold text-xs ${
                        patient.status === 'critical' ? 'text-rose-600' : 
                        patient.status === 'warning' ? 'text-amber-600' : 
                        'text-emerald-600'
                      }`}>{patient.name.split(' ').map(n => n[0]).join('')}</span>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Vitals Summary + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{patient.name}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(patient.status)}`}>{patient.status}</Badge>
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
                        <span>Last: {new Date(patient.latestVitals.recordedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
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
          <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-rose-500" />
                Vitals History - {selectedPatient?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedPatient?.patientId} | {selectedPatient?.personalNumber} | {selectedPatient?.vitalsHistory?.length || 0} records
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {selectedPatient?.vitalsHistory.map((vitals, index) => {
                // Calculate BMI if weight and height are available
                const weight = parseFloat(vitals.weight || '0');
                const height = parseFloat(vitals.height || '0');
                const bmi = weight && height ? (weight / Math.pow(height / 100, 2)).toFixed(1) : null;
                const bmiStatus = bmi ? (parseFloat(bmi) < 18.5 ? 'Underweight' : parseFloat(bmi) < 25 ? 'Normal' : parseFloat(bmi) < 30 ? 'Overweight' : 'Obese') : null;
                
                return (
                  <Card key={vitals.id} className={`${index === 0 ? 'border-rose-500/50 bg-rose-500/5' : ''}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{new Date(vitals.recordedAt).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          <span className="text-sm text-muted-foreground">{new Date(vitals.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {index === 0 && <Badge className="bg-rose-500 text-white">Latest</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">Recorded by: {vitals.recordedBy}</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Primary Vitals */}
                      <div className="grid grid-cols-5 gap-2">
                        {[
                          { label: 'Blood Pressure', value: `${vitals.bloodPressureSystolic}/${vitals.bloodPressureDiastolic}`, unit: 'mmHg', icon: Activity },
                          { label: 'Pulse', value: vitals.pulse, unit: 'bpm', icon: Heart },
                          { label: 'Temperature', value: vitals.temperature, unit: '°C', icon: Thermometer },
                          { label: 'Resp. Rate', value: vitals.respiratoryRate, unit: '/min', icon: Wind },
                          { label: 'SpO2', value: vitals.oxygenSaturation, unit: '%', icon: Droplets },
                        ].map((item, i) => (
                          <div key={i} className="text-center p-2 bg-muted/30 rounded">
                            <item.icon className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
                            <p className="text-xs text-muted-foreground">{item.label}</p>
                            <p className="text-sm font-semibold">{item.value || '-'} <span className="font-normal text-muted-foreground">{item.unit}</span></p>
                          </div>
                        ))}
                      </div>
                      
                      {/* Secondary Vitals (Weight, Height, BMI) */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-2 bg-muted/30 rounded">
                          <Scale className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
                          <p className="text-xs text-muted-foreground">Weight</p>
                          <p className="text-sm font-semibold">{vitals.weight || '-'} <span className="font-normal text-muted-foreground">kg</span></p>
                        </div>
                        <div className="text-center p-2 bg-muted/30 rounded">
                          <TrendingUp className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
                          <p className="text-xs text-muted-foreground">Height</p>
                          <p className="text-sm font-semibold">{vitals.height || '-'} <span className="font-normal text-muted-foreground">cm</span></p>
                        </div>
                        <div className="text-center p-2 bg-muted/30 rounded">
                          <p className="text-xs text-muted-foreground mb-1">BMI</p>
                          {bmi ? (
                            <div>
                              <p className={`text-sm font-semibold ${
                                bmiStatus === 'Normal' ? 'text-emerald-600' :
                                bmiStatus === 'Underweight' ? 'text-blue-600' :
                                bmiStatus === 'Overweight' ? 'text-amber-600' : 'text-rose-600'
                              }`}>{bmi} kg/m²</p>
                              <p className={`text-xs ${
                                bmiStatus === 'Normal' ? 'text-emerald-500' :
                                bmiStatus === 'Underweight' ? 'text-blue-500' :
                                bmiStatus === 'Overweight' ? 'text-amber-500' : 'text-rose-500'
                              }`}>{bmiStatus}</p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">-</p>
                          )}
                        </div>
                      </div>
                      
                      {/* Notes if available */}
                      {vitals.notes && (
                        <div className="p-2 bg-muted/20 rounded text-sm">
                          <p className="text-xs text-muted-foreground mb-1">Notes:</p>
                          <p>{vitals.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}


