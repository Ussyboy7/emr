"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { pharmacyService, type Dispense as ApiDispense } from '@/lib/services';
import { 
  History, Search, Eye, Clock, CheckCircle2, Pill, Calendar, Package,
  User, RefreshCw, TrendingUp, ArrowUpDown, Printer, Download, Loader2, AlertTriangle
} from 'lucide-react';

// Type definitions
interface DispenseHistoryRecord {
  id: string;
  prescriptionId: string;
  patient: { name: string; id: string; mrn: string; age: number; gender: string };
  medications: Array<{ prescribed: string; dispensed: string; quantity: number; isSubstituted: boolean }>;
  doctor: string;
  pharmacist: string;
  date: string;
  time: string;
  status: string;
  waitTime: string;
  substitutions: number;
}

// Dispense history data will be loaded from API

export default function DispenseHistoryPage() {
  const [history, setHistory] = useState<DispenseHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedRecord, setSelectedRecord] = useState<DispenseHistoryRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Load dispense history from API
  useEffect(() => {
    loadHistory();
  }, [currentPage]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await pharmacyService.getDispenseHistory({
        page: currentPage,
      });
      // Transform API data to frontend format
      const transformed = await Promise.all(response.results.map(async (dispense: any) => {
        // Extract patient details from prescription
        const prescription = dispense.prescription_details || {};
        const patientDetails = prescription.patient_details || {};
        const patientName = dispense.patient_name || patientDetails.name || 'Unknown';
        const patientId = patientDetails.id || '';
        const patientMRN = patientDetails.mrn || patientDetails.patient_id || '';
        const patientAge = patientDetails.age || 0;
        const patientGender = patientDetails.gender || '';
        
        // Extract doctor details
        const doctorName = prescription.prescribed_by_name || prescription.doctor_name || '';
        
        // Extract medications from prescription items
        const prescriptionItems = prescription.items || [];
        const medications = prescriptionItems.map((item: any) => {
          const prescribed = item.medication_name || item.medication_details?.name || '';
          const dispensed = item.substituted_with_details?.name || item.substituted_with_details?.medication_name || prescribed;
          const isSubstituted = !!item.substituted_with || !!item.substituted_with_details;
          
          return {
            prescribed,
            dispensed,
            quantity: Number(item.dispensed_quantity || item.quantity || dispense.quantity),
            isSubstituted,
          };
        });
        
        // If no medications from prescription items, use dispense data
        if (medications.length === 0) {
          medications.push({
            prescribed: dispense.medication_name || '',
            dispensed: dispense.medication_name || '',
            quantity: Number(dispense.quantity),
            isSubstituted: false,
          });
        }
        
        // Count substitutions
        const substitutions = medications.filter(m => m.isSubstituted).length;
        
        // Calculate wait time (if prescription has prescribed_at)
        let waitTime = '0 min';
        if (prescription.prescribed_at && dispense.dispensed_at) {
          const prescribedAt = new Date(prescription.prescribed_at);
          const dispensedAt = new Date(dispense.dispensed_at);
          const waitTimeMs = dispensedAt.getTime() - prescribedAt.getTime();
          const waitTimeMins = Math.floor(waitTimeMs / 60000);
          waitTime = `${waitTimeMins} min`;
        }
        
        return {
          id: dispense.dispense_id || dispense.id.toString(),
          prescriptionId: dispense.prescription?.toString() || prescription.prescription_id || '',
          patient: { 
            name: patientName, 
            id: patientId, 
            mrn: patientMRN, 
            age: patientAge, 
            gender: patientGender 
          },
          medications,
          doctor: doctorName,
          pharmacist: dispense.dispensed_by_name || '',
          date: dispense.dispensed_at.split('T')[0],
          time: new Date(dispense.dispensed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          status: 'Dispensed',
          waitTime,
          substitutions,
        };
      }));
      setHistory(transformed);
    } catch (err: any) {
      setError(err.message || 'Failed to load dispense history');
      console.error('Error loading dispense history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort history
  const filteredHistory = useMemo(() => {
    return history.filter(record => {
      const matchesSearch = 
        record.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.patient.mrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.prescriptionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || record.status.toLowerCase().replace(' ', '-') === statusFilter;
      const matchesDate = !dateFilter || record.date === dateFilter;
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [history, searchQuery, statusFilter, dateFilter]);

  // Pagination
  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredHistory.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredHistory, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter]);

  // Stats
  const stats = useMemo(() => ({
    total: history.length,
    today: history.filter(r => r.date === new Date().toISOString().split('T')[0]).length,
    withSubstitutions: history.filter(r => r.substitutions > 0).length,
    avgWaitTime: Math.round(history.reduce((sum, r) => sum + parseInt(r.waitTime), 0) / history.length) || 0
  }), [history]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Dispensed': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'Partially Dispensed': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
      case 'Cancelled': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleViewDetails = (record: DispenseHistoryRecord) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <History className="h-8 w-8 text-violet-500" />
              Dispense History
            </h1>
            <p className="text-muted-foreground mt-1">Track all dispensed prescriptions and analytics</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadHistory} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Dispensed</p>
                  <p className="text-3xl font-bold text-violet-600">{stats.total}</p>
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
                  <p className="text-3xl font-bold text-emerald-600">{stats.today}</p>
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
                  <p className="text-3xl font-bold text-amber-600">{stats.withSubstitutions}</p>
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
                  <p className="text-3xl font-bold text-blue-600">{stats.avgWaitTime}m</p>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Label>Search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Patient name, ID, or prescription..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="dispensed">Dispensed</SelectItem>
                    <SelectItem value="partially-dispensed">Partially Dispensed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                  className="mt-1"
                />
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
                <Button variant="outline" className="mt-4" onClick={loadHistory}>Retry</Button>
              </CardContent>
            </Card>
          ) : paginatedHistory.length > 0 ? (
            paginatedHistory.map((record) => (
              <Card key={record.id} className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="font-semibold text-xs text-emerald-600">
                        {record.patient.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    
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
                        <span>{record.id}</span>
                        <span>•</span>
                        <span>{record.prescriptionId}</span>
                        <span>•</span>
                        <span>{record.pharmacist}</span>
                        <span>•</span>
                        <span>{formatDate(record.date)} {record.time}</span>
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

        {/* Detail Modal */}
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
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
                    <p className="font-semibold">{formatDate(selectedRecord.date)} {selectedRecord.time}</p>
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
                            {med.isSubstituted ? (
                              <div className="space-y-2">
                                {/* Show prescribed (crossed out) and what was dispensed */}
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Pill className="h-3 w-3 text-amber-600" />
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground line-through">{med.prescribed}</p>
                                    <p className="text-xs text-muted-foreground">Prescribed</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-8">
                                  <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  </div>
                                  <div>
                                    <p className="font-semibold text-emerald-900 dark:text-emerald-400">{med.dispensed}</p>
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Dispensed (Substitute)</p>
                                  </div>
                                </div>
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/50 dark:text-amber-400 ml-8" variant="outline">
                                  Substituted
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
                            <span className="font-bold text-lg">×{med.quantity}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDetailModal(false)}>Close</Button>
              <Button variant="outline">
                <Printer className="h-4 w-4 mr-2" />
                Print Receipt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

