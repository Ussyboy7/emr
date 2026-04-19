"use client";

import { useState, useMemo, useEffect } from 'react';
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
import { patientService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';

// ==================== TYPES ====================
interface CompletedProcedure {
  id: string;
  type: 'injection' | 'dressing' | 'medication' | 'ward_admission';
  patientName: string;
  patientId: string;
  age: number;
  dob?: string;
  gender: string;
  ward: string;
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
    date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
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

export default function ProceduresHistoryPage() {
  const [history, setHistory] = useState<CompletedProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Dialog states
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<CompletedProcedure | null>(null);

  useAuthRedirect(authError);

  // Load procedures history from API
  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch completed nursing procedures
        const proceduresResult = await apiFetch<{ results: any[] }>('/nursing/procedures/?page_size=1000');
        const procedures = proceduresResult.results || [];
        
        // Transform procedures to history format
        const transformedHistory = await Promise.all(procedures.map(async (proc: any) => {
          try {
            // Get patient details
            const patient = await patientService.getPatient(proc.patient);
            
            // Map backend procedure_type to frontend type
            const typeMap: Record<string, CompletedProcedure['type']> = {
              'injection': 'injection',
              'dressing': 'dressing',
              'wound_care': 'dressing',
              'medication': 'medication',
              'other': 'medication',
              'ward admission': 'ward_admission',
              'observation admission': 'ward_admission',
              'ward_admission': 'ward_admission',
              'observation_admission': 'ward_admission',
            };
            
            const procedureType = typeMap[String(proc.procedure_type || '').toLowerCase()] || 'medication';
            const description = String(proc.description || '');
            const wardFromDescription = description.match(/to\s+([^.;,\n]+)$/i)?.[1]?.trim() || '';
            const wardLabel =
              proc.ward_name ||
              proc.ward?.name ||
              wardFromDescription ||
              (procedureType === 'ward_admission' ? 'Observation Ward' : '');
            const orderedByLabel =
              proc.ordered_by_name ||
              proc.ordered_by_user_name ||
              proc.ordered_by?.full_name ||
              proc.ordered_by?.username ||
              proc.requested_by_name ||
              proc.requested_by?.full_name ||
              proc.recorded_by_name ||
              proc.performed_by_name ||
              '';
            
            // Parse description for details
            const details: CompletedProcedure['details'] = {};
            const record: CompletedProcedure['record'] = {
              site: proc.site || '',
              notes: proc.notes || '',
            };
            
            // Try to extract details from description
            if (description) {
              if (procedureType === 'injection') {
                const match = description.match(/([^:]+):\s*(.+)/);
                if (match) {
                  details.medication = match[1].trim();
                  const rest = match[2].trim();
                  const parts = rest.split(' • ');
                  details.dosage = parts[0] || '';
                  details.route = parts[1] || '';
                }
              } else if (procedureType === 'dressing') {
                const match = description.match(/([^:]+):\s*(.+)/);
                if (match) {
                  details.woundType = match[1].trim();
                  details.woundLocation = match[2].trim();
                }
              } else {
                const match = description.match(/([^:]+):\s*(.+)/);
                if (match) {
                  details.medication = match[1].trim();
                } else if (procedureType === 'ward_admission') {
                  details.medication = 'Observation Admission';
                }
              }
            }
            
            return {
              id: String(proc.id),
              type: procedureType,
              patientName: patient.full_name ?? '',
              patientId: patient.patient_id || '',
              age: resolvePatientAge(patient) ?? 0,
              dob: patient.date_of_birth || '',
              gender: formatGender(patient.gender),
              ward: wardLabel,
              orderedBy: orderedByLabel,
              completedAt: proc.created_at || proc.recorded_at || new Date().toISOString(),
              completedBy: proc.recorded_by_name || proc.performed_by_name || 'Unknown',
              details,
              record,
            } as CompletedProcedure;
          } catch (err) {
            console.error(`Error loading procedure ${proc.id}:`, err);
            return null;
          }
        }));
        
        const validHistory = transformedHistory.filter((p): p is CompletedProcedure => p !== null);
        setHistory(validHistory);
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
    };
    
    loadHistory();
  }, []);

  // Stats
  const stats = useMemo(() => ({
    total: history.length,
    injections: history.filter(p => p.type === 'injection').length,
    dressings: history.filter(p => p.type === 'dressing').length,
    medications: history.filter(p => p.type === 'medication').length,
    todayCount: history.filter(p => new Date(p.completedAt).toDateString() === new Date().toDateString()).length,
  }), [history]);

  // Filtering
  const filteredHistory = useMemo(() => {
    return history
      .filter(p => {
        const matchesSearch = p.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             p.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             p.completedBy.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || p.type === typeFilter;
        const matchesGender = genderFilter === 'all' || p.gender.toLowerCase() === genderFilter.toLowerCase();
        
        // Date filter
        if (dateRange.from || dateRange.to) {
          const completedDate = new Date(p.completedAt);
          if (Number.isNaN(completedDate.getTime())) return false;
          if (dateRange.from) {
            const from = new Date(`${dateRange.from}T00:00:00`);
            if (completedDate < from) return false;
          }
          if (dateRange.to) {
            const to = new Date(`${dateRange.to}T23:59:59.999`);
            if (completedDate > to) return false;
          }
        } else if (dateFilter !== 'all') {
          const completedDate = new Date(p.completedAt);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (dateFilter === 'today' && completedDate.toDateString() !== today.toDateString()) return false;
          if (dateFilter === 'week') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            if (completedDate < weekAgo) return false;
          }
          if (dateFilter === 'month') {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            if (completedDate < monthAgo) return false;
          }
        }
        
        return matchesSearch && matchesType && matchesGender;
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [history, searchQuery, typeFilter, dateFilter, genderFilter, dateRange.from, dateRange.to]);

  // Paginated history
  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredHistory.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredHistory, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, dateFilter, genderFilter, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  const openViewDialog = (procedure: CompletedProcedure) => {
    setSelectedProcedure(procedure);
    setIsViewDialogOpen(true);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading procedures history...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error loading history</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Records</p>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-xl font-bold text-emerald-500">{stats.todayCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><Syringe className="h-4 w-4 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Injections</p>
                <p className="text-xl font-bold text-emerald-500">{stats.injections}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10"><Bandage className="h-4 w-4 text-violet-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Dressings</p>
                <p className="text-xl font-bold text-violet-500">{stats.dressings}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Pill className="h-4 w-4 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Medications</p>
                <p className="text-xl font-bold text-blue-500">{stats.medications}</p>
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

        {/* History List */}
        {filteredHistory.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No records found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {paginatedHistory.map((procedure) => {
              const typeConfig = getTypeConfig(procedure.type);
              const TypeIcon = typeConfig.icon;
              const { date, time } = formatDateTime(procedure.completedAt);
              const leftBorderClass =
                procedure.type === 'injection'
                  ? 'border-l-emerald-500'
                  : procedure.type === 'dressing'
                    ? 'border-l-violet-500'
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
                          <span>•</span>
                          <span>{procedure.ward || 'Ward not specified'}</span>
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

        {filteredHistory.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredHistory.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="records"
            />
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedProcedure && (() => {
                  const config = getTypeConfig(selectedProcedure.type);
                  const Icon = config.icon;
                  return <><Icon className={`h-5 w-5 ${config.color}`} />{config.label} Record</>;
                })()}
              </DialogTitle>
              <DialogDescription>{selectedProcedure?.patientName} - {selectedProcedure?.patientId}</DialogDescription>
            </DialogHeader>
            {selectedProcedure && (
              <div className="py-4 space-y-4">
                {/* Patient Info */}
                <div className="p-4 rounded-lg bg-muted/50 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient</p>
                    <p className="font-medium">{selectedProcedure.patientName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Patient ID</p>
                    <p className="font-medium">{selectedProcedure.patientId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Age / Gender</p>
                    <p className="font-medium">{selectedProcedure.age}y {selectedProcedure.gender}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ward</p>
                    <p className="font-medium">{selectedProcedure.ward}</p>
                  </div>
                </div>

                {/* Procedure Details */}
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Procedure Details</h4>
                  <div className="p-3 rounded-lg border grid grid-cols-2 gap-2">
                    {selectedProcedure.type === 'injection' && (
                      <>
                        <div><p className="text-xs text-muted-foreground">Medication</p><p className="font-medium">{selectedProcedure.details.medication}</p></div>
                        <div><p className="text-xs text-muted-foreground">Dose</p><p className="font-medium">{selectedProcedure.details.dosage}</p></div>
                        <div><p className="text-xs text-muted-foreground">Route</p><p className="font-medium">{selectedProcedure.details.route}</p></div>
                        <div><p className="text-xs text-muted-foreground">Site</p><p className="font-medium">{selectedProcedure.record.site}</p></div>
                        {selectedProcedure.record.batchNumber && (
                          <div className="col-span-2"><p className="text-xs text-muted-foreground">Batch #</p><p className="font-medium">{selectedProcedure.record.batchNumber}</p></div>
                        )}
                      </>
                    )}
                    {selectedProcedure.type === 'dressing' && (
                      <>
                        <div><p className="text-xs text-muted-foreground">Wound Type</p><p className="font-medium">{selectedProcedure.details.woundType}</p></div>
                        <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{selectedProcedure.details.woundLocation}</p></div>
                        <div><p className="text-xs text-muted-foreground">Dressing Type</p><p className="font-medium">{selectedProcedure.record.dressingType}</p></div>
                        <div><p className="text-xs text-muted-foreground">Condition</p><p className="font-medium">{selectedProcedure.record.woundCondition}</p></div>
                      </>
                    )}
                    {selectedProcedure.type === 'medication' && (
                      <>
                        <div><p className="text-xs text-muted-foreground">Medication</p><p className="font-medium">{selectedProcedure.details.medication}</p></div>
                        <div><p className="text-xs text-muted-foreground">Route</p><p className="font-medium">{selectedProcedure.details.route}</p></div>
                        {selectedProcedure.record.site && (
                          <div className="col-span-2"><p className="text-xs text-muted-foreground">Site</p><p className="font-medium">{selectedProcedure.record.site}</p></div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {selectedProcedure.record.notes && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xs text-blue-600 dark:text-blue-400">Notes</p>
                    <p className="text-sm mt-1">{selectedProcedure.record.notes}</p>
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  {selectedProcedure.orderedBy && (
                    <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />Ordered by: {selectedProcedure.orderedBy}</span>
                  )}
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />Completed by: {selectedProcedure.completedBy}</span>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  {formatDateTime(selectedProcedure.completedAt).date} at {formatDateTime(selectedProcedure.completedAt).time}
                </p>
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
