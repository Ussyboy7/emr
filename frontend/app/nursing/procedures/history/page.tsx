"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from 'next/link';
import { 
  Syringe, Bandage, Pill, Search, ArrowLeft, CheckCircle2, Eye, Calendar,
  Activity, User, Clock, Stethoscope, FileText
} from 'lucide-react';

// ==================== TYPES ====================
interface CompletedProcedure {
  id: string;
  type: 'injection' | 'dressing' | 'medication';
  patientName: string;
  patientId: string;
  age: number;
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
const demoHistory: CompletedProcedure[] = [];

const getTypeConfig = (type: string) => {
  const configs: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
    'injection': { icon: Syringe, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', label: 'Injection' },
    'dressing': { icon: Bandage, color: 'text-violet-500', bgColor: 'bg-violet-500/10', label: 'Dressing' },
    'medication': { icon: Pill, color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Medication' },
  };
  return configs[type] || configs['medication'];
};

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
};

export default function ProceduresHistoryPage() {
  const [history, setHistory] = useState<CompletedProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Dialog states
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<CompletedProcedure | null>(null);

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
        const matchesDate = !dateFilter || new Date(p.completedAt).toISOString().split('T')[0] === dateFilter;
        return matchesSearch && matchesType && matchesDate;
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [history, searchQuery, typeFilter, dateFilter]);

  // Paginated history
  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredHistory.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredHistory, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, dateFilter]);

  const openViewDialog = (procedure: CompletedProcedure) => {
    setSelectedProcedure(procedure);
    setIsViewDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link href="/nursing/procedures">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Queue
                </Button>
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700">
                <FileText className="h-6 w-6 text-white" />
              </div>
              Procedures History
            </h1>
            <p className="text-muted-foreground mt-1">View all completed nursing procedures</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Records</p>
              <p className="text-3xl font-bold text-foreground">{stats.total}</p>
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
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search patient, ID, or nurse..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="injection">💉 Injections</SelectItem>
                  <SelectItem value="dressing">🩹 Dressings</SelectItem>
                  <SelectItem value="medication">💊 Medications</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="pl-10 w-[180px]" />
              </div>
              {dateFilter && (
                <Button variant="ghost" size="sm" onClick={() => setDateFilter('')}>Clear Date</Button>
              )}
            </div>
          </CardContent>
        </Card>

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
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Patient</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Procedure</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Completed By</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date & Time</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistory.map((procedure) => {
                    const typeConfig = getTypeConfig(procedure.type);
                    const TypeIcon = typeConfig.icon;
                    const { date, time } = formatDateTime(procedure.completedAt);
                    
                    return (
                      <tr key={procedure.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-4">
                          <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full ${typeConfig.bgColor}`}>
                            <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                            <span className={`text-sm font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="font-medium text-foreground">{procedure.patientName}</p>
                          <p className="text-xs text-muted-foreground">{procedure.patientId} • {procedure.ward}</p>
                        </td>
                        <td className="p-4">
                          {procedure.type === 'injection' && (
                            <p className="text-foreground">{procedure.details.medication} - {procedure.details.dosage}</p>
                          )}
                          {procedure.type === 'dressing' && (
                            <p className="text-foreground">{procedure.details.woundType} - {procedure.details.woundLocation}</p>
                          )}
                          {procedure.type === 'medication' && (
                            <p className="text-foreground">{procedure.details.medication}</p>
                          )}
                          <p className="text-xs text-muted-foreground">Ordered by: {procedure.orderedBy}</p>
                        </td>
                        <td className="p-4">
                          <p className="font-medium text-foreground">{procedure.completedBy}</p>
                        </td>
                        <td className="p-4">
                          <p className="font-medium text-foreground">{date}</p>
                          <p className="text-xs text-muted-foreground">{time}</p>
                        </td>
                        <td className="p-4">
                          <Button variant="ghost" size="sm" onClick={() => openViewDialog(procedure)}>
                            <Eye className="h-4 w-4 mr-1" />View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4">
              <StandardPagination
                currentPage={currentPage}
                totalItems={filteredHistory.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                itemName="records"
              />
            </div>
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
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
                        <div><p className="text-xs text-muted-foreground">Dosage</p><p className="font-medium">{selectedProcedure.details.dosage}</p></div>
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
                  <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />Ordered by: {selectedProcedure.orderedBy}</span>
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

