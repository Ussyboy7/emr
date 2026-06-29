"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePharmacyPageAuth } from '@/hooks/use-pharmacy-page-auth';
import { pharmacyService } from '@/lib/services';
import { formatIssuedQuantityDisplay } from '@/lib/pharmacy/dispense-quantity';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { resolvePatientPhoto } from "@/lib/patient-photo";
import { formatDisplayDateMedium, formatDisplayTime } from '@/lib/dates';
import { formatWaitMinutes, waitMinutesBetween } from '@/lib/pharmacy/wait-duration';
import { getServerToday, peekServerTimezone } from '@/lib/utils/serverTime';
import { 
  History, Search, Eye, Clock, CheckCircle2, Pill, Calendar, Package,
  TrendingUp, Loader2, AlertTriangle
} from 'lucide-react';

// Type definitions
interface DispenseHistoryRecord {
  id: string;
  prescriptionId: string;
  patient: { name: string; id: string; mrn: string; age: number; gender: string };
  medications: Array<{
    prescribed: string;
    dispensed: string;
    quantity: number;
    quantityDisplay: string;
    unit?: string;
    prescribedUnit?: string;
    isSubstituted: boolean;
    context?: 'as_selected_brand' | 'brand_selected_from_generic' | 'substituted';
  }>;
  doctor: string;
  pharmacist: string;
  dispensedAt: string;
  date: string;
  time: string;
  status: string;
  waitTime: string;
  substitutions: number;
  location_clinic_name?: string;
}

export default function DispenseHistoryPage() {
  const { ready, handleAuthError } = usePharmacyPageAuth();
  const [history, setHistory] = useState<DispenseHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [dateFilter, setDateFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [summaryStats, setSummaryStats] = useState<{
    total: number;
    today: number;
    substitutions: number;
    avg_wait_minutes: number;
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<DispenseHistoryRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const loadSummaryStats = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const s = await pharmacyService.getDispenseHistorySummaryStats({
        search: debouncedSearch.trim() || undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
        date_preset: dateFilter !== 'all' ? dateFilter : undefined,
      });
      setSummaryStats(s);
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      setSummaryStats(null);
      setSummaryError(e instanceof Error ? e.message : 'Failed to load summary statistics');
    } finally {
      setSummaryLoading(false);
    }
  }, [debouncedSearch, genderFilter, dateFilter, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadSummaryStats();
  }, [loadSummaryStats, ready]);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [, response] = await Promise.all([
        getServerToday(),
        pharmacyService.getDispenseHistory({
          page: currentPage,
          page_size: itemsPerPage,
          search: debouncedSearch.trim() || undefined,
          gender: genderFilter !== 'all' ? genderFilter : undefined,
          date_preset: dateFilter !== 'all' ? dateFilter : undefined,
        }),
      ]);
      const serverTz = peekServerTimezone();
      if (!serverTz) {
        throw new Error('Server timezone unavailable. Check /common/server-time/.');
      }
      setTotalCount(response.count || response.results.length);
      // Transform API data to frontend format
      const transformed = await Promise.all(response.results.map(async (dispense: any) => {
        // Extract patient details from prescription
        const prescription = dispense.prescription_details || {};
        const patientDetails = prescription.patient_details || {};
        const patientName = dispense.patient_name ?? patientDetails.name ?? '';
        const patientId = patientDetails.patient_id || '';
        const patientMRN = patientDetails.patient_id || patientDetails.mrn || '';
        const patientAge = patientDetails.age || 0;
        const patientGender = patientDetails.gender || '';
        
        // Extract doctor details
        const doctorName = prescription.prescribed_by_name || prescription.doctor_name || '';
        const locationClinicName = dispense.location_clinic_name || (prescription as any).location_clinic_name || '';
        
        const context = (dispense.dispense_context || undefined) as 'as_selected_brand' | 'brand_selected_from_generic' | 'substituted' | undefined;
        const prescribedName =
          context === 'brand_selected_from_generic'
            ? (dispense.prescribed_generic_name || '')
            : (dispense.prescribed_medication_name || '');
        const dispensedName = dispense.medication_name || '';
        const quantityUnits = Number(dispense.quantity || 0);
        const quantityDisplay = formatIssuedQuantityDisplay(
          quantityUnits,
          { pack_size: dispense.medication_pack_size, unit: dispense.unit },
          dispense.quantity_entry_mode
        );
        const medications = [{
          prescribed: prescribedName,
          dispensed: dispensedName,
          quantity: quantityUnits,
          quantityDisplay,
          unit: dispense.unit || '',
          prescribedUnit: dispense.prescribed_unit || '',
          isSubstituted: context === 'substituted',
          context,
        }];
        
        // Count substitutions
        const substitutions = medications.filter((m: any) => m.context === 'substituted').length;
        
        const dispensingStartedAt = prescription.dispensing_started_at as string | undefined;
        const dispensedAt = dispense.dispensed_at as string;
        const waitMins = waitMinutesBetween(dispensingStartedAt, dispensedAt);
        const waitTime = formatWaitMinutes(waitMins);
        
        return {
          id: dispense.dispense_id || dispense.id.toString(),
          prescriptionId: dispense.prescription?.toString() || prescription.prescription_id || '',
          patient: {
            name: patientName,
            id: patientId,
            mrn: patientMRN,
            age: patientAge,
            gender: patientGender,
            photo: patientDetails.photo || null,
          },
          medications,
          doctor: doctorName,
          pharmacist: dispense.dispensed_by_name || '',
          dispensedAt,
          date: formatDisplayDateMedium(dispensedAt),
          time: formatDisplayTime(dispensedAt),
          status: 'Dispensed',
          waitTime,
          substitutions,
          location_clinic_name: locationClinicName,
        };
      }));
      setHistory(transformed);
    } catch (err: any) {
      if (handleAuthError(err)) return;
      setError(err.message || 'Failed to load dispense history');
      console.error('Error loading dispense history:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, genderFilter, dateFilter, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadHistory();
  }, [loadHistory, ready]);

  const stats = useMemo(() => {
    if (!summaryStats) return null;
    return {
      total: summaryStats.total,
      today: summaryStats.today,
      withSubstitutions: summaryStats.substitutions,
      avgWaitTime: summaryStats.avg_wait_minutes,
      avgWaitLabel: formatWaitMinutes(summaryStats.avg_wait_minutes),
    };
  }, [summaryStats]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Dispensed': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'Partially Dispensed': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
      case 'Cancelled': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const handleViewDetails = (record: DispenseHistoryRecord) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <History className="h-8 w-8 text-violet-500" />
              Dispense History
            </h1>
            <p className="text-muted-foreground mt-1">Track all dispensed prescriptions and analytics</p>
          </div>
        </div>

        {/* Stats Cards */}
        {summaryError && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-3 text-sm text-destructive">{summaryError}</CardContent>
          </Card>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Dispensed</p>
                  <p className="text-2xl sm:text-3xl font-bold text-violet-600 tabular-nums">
                    {summaryLoading ? '—' : stats ? stats.total.toLocaleString() : '—'}
                  </p>
                </div>
                <Package className="h-6 w-6 text-violet-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">All time records</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 tabular-nums">
                    {summaryLoading ? '—' : stats ? stats.today.toLocaleString() : '—'}
                  </p>
                </div>
                <Calendar className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Dispensed today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Substitutions</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600 tabular-nums">
                    {summaryLoading ? '—' : stats ? stats.withSubstitutions.toLocaleString() : '—'}
                  </p>
                </div>
                <TrendingUp className="h-6 w-6 text-amber-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">With substitutions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Wait Time</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 tabular-nums">
                    {summaryLoading ? '—' : stats ? stats.avgWaitLabel : '—'}
                  </p>
                </div>
                <Clock className="h-6 w-6 text-blue-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Average processing</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Patient name, ID, or prescription..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={genderFilter} onValueChange={(v) => { setGenderFilter(v); setCurrentPage(1); }}>
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

        {/* History List */}
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading dispense history...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" className="mt-4" onClick={() => { void loadHistory(); void loadSummaryStats(); }}>Retry</Button>
              </CardContent>
            </Card>
          ) : history.length > 0 ? (
            history.map((record) => (
              <Card key={record.id} className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <PatientAvatar name={record.patient.name} photoUrl={resolvePatientPhoto(record.patient)} size="sm" />
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{record.patient.name}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(record.status)}`}>{record.status}</Badge>
                          {record.substitutions > 0 && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400" variant="outline">
                              {record.substitutions} Sub
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{record.medications.length} meds</Badge>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleViewDetails(record)}>
                          <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>
                      </div>
                      
                      {/* Row 2: Details */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span className="font-mono">{record.id}</span>
                        <span>•</span>
                        <span>RX {record.prescriptionId}</span>
                        {record.doctor ? (
                          <>
                            <span>•</span>
                            <span>Dr {record.doctor}</span>
                          </>
                        ) : null}
                        {record.pharmacist ? (
                          <>
                            <span>•</span>
                            <span>Pharm {record.pharmacist}</span>
                          </>
                        ) : null}
                        <span>•</span>
                        <span>{record.date} {record.time}</span>
                        <span>•</span>
                        <span>{record.waitTime} wait</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No dispense records found</p>
                <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pagination */}
        {history.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1);
              }}
              itemName="records"
            />
          </Card>
        )}

        {/* Detail Modal */}
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Package className="h-5 w-5 text-violet-500" />
                <div>
                  <div className="text-xl font-bold">Dispense Record - {selectedRecord?.patient.name}</div>
                  <div className="text-sm text-muted-foreground">ID: {selectedRecord?.id}</div>
                </div>
              </DialogTitle>
            </DialogHeader>
            
            {selectedRecord && (
              <div className="overflow-y-auto max-h-[65vh] space-y-4">
                {/* Patient Info */}
                <div className="bg-muted/50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Patient ID:</span>
                    <p className="font-semibold">{selectedRecord.patient.mrn}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date & Time:</span>
                    <p className="font-semibold">{selectedRecord.date} {selectedRecord.time}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Wait Time:</span>
                    <p className="font-semibold">{selectedRecord.waitTime}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Doctor:</span>
                    <p className="font-semibold">{selectedRecord.doctor}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pharmacist:</span>
                    <p className="font-semibold">{selectedRecord.pharmacist}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <div className="mt-1">
                      <Badge variant="outline" className={getStatusColor(selectedRecord.status)}>
                        {selectedRecord.status}
                      </Badge>
                    </div>
                  </div>
                  {selectedRecord.location_clinic_name && (
                    <div>
                      <span className="text-muted-foreground">Location:</span>
                      <p className="font-semibold">{selectedRecord.location_clinic_name}</p>
                    </div>
                  )}
                  {selectedRecord.substitutions > 0 && (
                    <div>
                      <span className="text-muted-foreground">Substitutions:</span>
                      <p className="font-semibold text-amber-600">{selectedRecord.substitutions}</p>
                    </div>
                  )}
                </div>

                {/* Medications List */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Pill className="h-4 w-4 text-violet-500" />
                    Dispensed Medications ({selectedRecord.medications.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedRecord.medications.map((med, index) => (
                      <div 
                        key={index}
                        className={`p-4 rounded-lg border ${med.isSubstituted ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 bg-gray-50 dark:bg-gray-800/50'}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {med.context === 'substituted' || med.context === 'brand_selected_from_generic' ? (
                              <div className="space-y-2">
                                {/* Show prescribed and what was actually dispensed */}
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Pill className="h-3 w-3 text-amber-600" />
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">{med.prescribed}</p>
                                    <p className="text-xs text-muted-foreground">Prescribed</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-8">
                                  <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  </div>
                                  <div>
                                    <p className="font-semibold text-emerald-900 dark:text-emerald-400">{med.dispensed}</p>
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                      {med.context === 'substituted' ? 'Dispensed (Substituted)' : 'Dispensed (Brand selected)'}
                                    </p>
                                  </div>
                                </div>
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/50 dark:text-amber-400 ml-8" variant="outline">
                                  {med.context === 'substituted' ? 'Substituted' : 'Brand selected'}
                                </Badge>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                </div>
                                <div>
                                  <p className="font-semibold">{med.dispensed}</p>
                                  <p className="text-xs text-muted-foreground">Dispensed as prescribed</p>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <span className="font-bold text-lg">×{med.quantityDisplay}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
