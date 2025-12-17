"use client";

import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { visitService, type Visit } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { 
  Search, Plus, Calendar, Clock, CheckCircle2, MapPin,
  Edit, Send, AlertTriangle, Loader2, Eye
} from 'lucide-react';
import { StandardPagination } from '@/components/StandardPagination';
import { getAllClinicsWithAll, CLINICS } from '@/lib/constants/clinics';
import { clinicMatches, normalizeClinicName } from '@/lib/utils/clinic-utils';

// NPA Clinics - standardized list
const clinics = getAllClinicsWithAll();

// NPA Locations
const locations = [
  "All Locations", "Headquarters", "Bode Thomas Clinic", "Lagos Port Complex", "Tincan Island Port Complex",
  "Rivers Port Complex", "Onne Port Complex", "Delta Port Complex", "Calabar Port", "Lekki Deep Sea Port"
];

// Simplified visit statuses for Medical Records
// Scheduled = Created, waiting to be sent to nursing
// Sent to Nursing = Confirmed and forwarded (completed from Medical Records perspective)
type VisitStatus = 'Scheduled' | 'Sent to Nursing';

// Visits data will be loaded from API

export default function VisitsPage() {
  const router = useRouter();
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [clinicFilter, setClinicFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // Default to all time
  
  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  type TransformedVisit = ReturnType<typeof transformVisit>;
  const [selectedVisit, setSelectedVisit] = useState<TransformedVisit | null>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState({ type: '', clinic: '', location: '', notes: '' });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Helper function to transform visit from API to frontend format
  const transformVisit = (visit: Visit) => ({
    id: String(visit.id), // Always use numeric ID for API calls
    numericId: visit.id, // Keep numeric ID for backend API calls
    visitId: visit.visit_id || String(visit.id), // Display ID (visit_id string)
    patientId: String(visit.patient),
    patient: visit.patient_name || `Patient ${visit.patient}`,
    type: visit.visit_type || 'consultation', // Use backend value (lowercase)
    clinic: visit.clinic || '',
    date: visit.date,
    time: visit.time,
    status: visit.status === 'scheduled' ? 'Scheduled' :
           visit.status === 'in_progress' ? 'In Progress' :
           visit.status === 'completed' ? 'Sent to Nursing' :
           visit.status === 'cancelled' ? 'Cancelled' : visit.status,
    department: visit.clinic || 'General',
    notes: visit.clinical_notes || '',
    chiefComplaint: visit.chief_complaint || '',
    location: visit.location || '',
  });

  // Load visits from API
  useEffect(() => {
    const loadVisits = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use itemsPerPage for server-side pagination, or load more if filters are active
        const hasActiveFilters = searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || clinicFilter !== 'all' || dateFilter !== 'all';
        const pageSize = hasActiveFilters ? 1000 : itemsPerPage;
        
        const result = await visitService.getVisits({ 
          page: hasActiveFilters ? 1 : currentPage,
          page_size: pageSize 
        });
        setTotalCount(result.count || result.results.length);
        
        // Transform visits to match frontend structure
        const transformedVisits = result.results.map(transformVisit);
        setVisits(transformedVisits);
      } catch (err) {
        console.error('Error loading visits:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load visits. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadVisits();
  }, [currentPage, itemsPerPage, searchQuery, statusFilter, typeFilter, clinicFilter, dateFilter]);

  const filteredVisits = useMemo(() => visits.filter(visit => {
    const matchesSearch = visit.patient.toLowerCase().includes(searchQuery.toLowerCase()) || 
      visit.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visit.patientId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || visit.status.toLowerCase().replace(/ /g, '-') === statusFilter;
    const matchesType = typeFilter === 'all' || visit.type === typeFilter; // visit.type is already lowercase from backend
    const matchesClinic = clinicFilter === 'all' || clinicMatches(visit.clinic, clinicFilter);
    
    // Date filter
    if (dateFilter !== 'all') {
      const visitDate = new Date(visit.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (dateFilter === 'today' && visitDate.toDateString() !== today.toDateString()) return false;
      if (dateFilter === 'week') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (visitDate < weekAgo) return false;
      }
      if (dateFilter === 'month') {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        if (visitDate < monthAgo) return false;
      }
    }
    
    return matchesSearch && matchesStatus && matchesType && matchesClinic;
  }), [visits, searchQuery, statusFilter, typeFilter, clinicFilter, dateFilter]);

  // Use filtered visits directly (server-side pagination when no client-side filters)
  const paginatedVisits = filteredVisits;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, typeFilter, clinicFilter, dateFilter]);

  // Stats - 4 cards with useful metrics
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayVisits = visits.filter(v => v.date === today);
    return [
      { label: "Today's Visits", value: todayVisits.length, icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { label: 'Scheduled', value: visits.filter(v => v.status === 'Scheduled' || v.status?.toLowerCase() === 'scheduled').length, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
      { label: 'In Progress', value: visits.filter(v => v.status === 'In Progress' || v.status?.toLowerCase() === 'in_progress').length, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { label: 'Completed', value: visits.filter(v => v.status === 'Sent to Nursing' || v.status === 'Completed' || v.status?.toLowerCase() === 'completed').length, icon: CheckCircle2, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    ];
  }, [visits]);

  const handleEditVisit = (visit: typeof visits[0]) => {
    setSelectedVisit(visit);
    setEditForm({
      type: visit.type,
      clinic: visit.clinic,
      location: visit.location,
      notes: visit.notes,
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedVisit) return;

    try {
      // Find the visit to get numeric ID
      const visitToUpdate = visits.find(v => v.id === selectedVisit.id);
      if (!visitToUpdate) {
        toast.error('Visit not found');
        return;
      }

      // Use numeric ID for API calls (backend expects primary key, not visit_id string)
      const visitId = selectedVisit.numericId || Number(selectedVisit.id);
      
      // Map frontend status to backend status
      const statusMap: Record<string, string> = {
        'Scheduled': 'scheduled',
        'In Progress': 'in_progress',
        'Sent to Nursing': 'completed',
        'Completed': 'completed',
        'Cancelled': 'cancelled',
      };
      
      const updateData: any = {
        visit_type: editForm.type || undefined,
        clinic: editForm.clinic ? normalizeClinicName(editForm.clinic) : undefined,
        location: editForm.location || undefined,
        clinical_notes: editForm.notes || undefined,
      };

      await visitService.updateVisit(visitId, updateData);
      
      // Reload visits
      const result = await visitService.getVisits({ page_size: 500 });
      const transformedVisits = result.results.map(transformVisit);
      setVisits(transformedVisits);
      setIsEditModalOpen(false);
      toast.success('Visit updated successfully');
    } catch (err: any) {
      console.error('Error updating visit:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to update visit. Please try again.');
      }
    }
  };

  const handleForwardToNursing = (visit: typeof visits[0]) => {
    setSelectedVisit(visit);
    setIsForwardModalOpen(true);
  };

  const confirmForwardToNursing = async () => {
    if (!selectedVisit) return;

    try {
      // Use numeric ID for API calls (backend expects primary key, not visit_id string)
      const visitId = selectedVisit.numericId || Number(selectedVisit.id);
      
      // Update visit status to completed (sent to nursing)
      await visitService.updateVisit(visitId, { status: 'completed' });
      
      // Reload visits
      const result = await visitService.getVisits({ page_size: 500 });
      const transformedVisits = result.results.map(transformVisit);
      setVisits(transformedVisits);
      setIsForwardModalOpen(false);
      toast.success(`${selectedVisit.patient} has been sent to Nursing`, {
        description: 'The patient will appear in the Nursing Pool Queue.',
      });
    } catch (err: any) {
      console.error('Error forwarding visit to nursing:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to forward visit. Please try again.');
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'Scheduled': 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10',
      'Sent to Nursing': 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    };
    return styles[status] || 'border-muted-foreground/50 text-muted-foreground';
  };

  // Helper to get display label for visit type
  const getVisitTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      'consultation': 'Consultation',
      'follow_up': 'Follow-up',
      'emergency': 'Emergency',
      'routine': 'Routine Checkup',
    };
    return typeMap[type] || type;
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      'consultation': 'border-teal-500/50 text-teal-600 dark:text-teal-400',
      'follow_up': 'border-blue-500/50 text-blue-600 dark:text-blue-400',
      'emergency': 'border-rose-500/50 text-rose-600 dark:text-rose-400',
      'routine': 'border-violet-500/50 text-violet-600 dark:text-violet-400',
    };
    return styles[type] || 'border-muted-foreground/50 text-muted-foreground';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'emergency': return 'border-l-rose-500';
      case 'follow_up': return 'border-l-blue-500';
      case 'routine': return 'border-l-violet-500';
      default: return 'border-l-teal-500';
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Manage Visits</h1>
            <p className="text-muted-foreground mt-1">Create visits and forward patients to nursing for vitals</p>
          </div>
          <Button className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white" asChild>
            <Link href="/medical-records/visits/new"><Plus className="h-4 w-4 mr-2" />Create Visit</Link>
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading visits...</p>
            </CardContent>
          </Card>
        )}

        {/* Stats - 4 cards */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
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
                  placeholder="Search by patient name, visit ID, or patient ID..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <div className="flex flex-wrap gap-2">
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
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="scheduled">Pending</SelectItem>
                    <SelectItem value="sent-to-nursing">Sent to Nursing</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="routine">Routine Checkup</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={clinicFilter} onValueChange={setClinicFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Clinic" /></SelectTrigger>
                  <SelectContent>
                    {clinics.map(c => <SelectItem key={c} value={c === 'All Clinics' ? 'all' : c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Results Count */}
        {!loading && (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{filteredVisits.length}</span> visits
              </p>
            </div>

            {/* Visit Cards */}
            <div className="space-y-2">
              {paginatedVisits.length > 0 ? (
                paginatedVisits.map((visit) => (
            <Card key={visit.id} className={`border-l-4 ${getTypeColor(visit.type)} hover:shadow-md transition-shadow`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {/* Patient Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    visit.type === 'emergency' ? 'bg-rose-100 dark:bg-rose-900/30' :
                    visit.type === 'follow_up' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    visit.type === 'routine' ? 'bg-violet-100 dark:bg-violet-900/30' :
                    'bg-teal-100 dark:bg-teal-900/30'
                  }`}>
                    <span className={`font-semibold text-xs ${
                      visit.type === 'emergency' ? 'text-rose-600 dark:text-rose-400' :
                      visit.type === 'follow_up' ? 'text-blue-600 dark:text-blue-400' :
                      visit.type === 'routine' ? 'text-violet-600 dark:text-violet-400' :
                      'text-teal-600 dark:text-teal-400'
                    }`}>
                      {visit.patient.split(' ').map((n: string) => n[0]).join('')}
                    </span>
                  </div>
                  
                  {/* Visit Details */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {/* Row 1: Name + Badges */}
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground text-sm truncate">{visit.patient}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getTypeBadge(visit.type)}`}>{getVisitTypeLabel(visit.type)}</Badge>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusBadge(visit.status)}`}>{visit.status === 'Scheduled' ? 'Pending' : 'Sent'}</Badge>
                    </div>
                    
                    {/* Row 2: IDs + Clinic + Location + Date/Time */}
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {visit.patientId} • {visit.id} • {visit.clinic} • {visit.location} • {visit.date} {visit.time}
                    </p>
                    {/* Row 3: Notes (if available) */}
                    {visit.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        <span className="font-medium">Notes:</span> {visit.notes}
                      </p>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                      setSelectedVisit(visit);
                      setIsViewModalOpen(true);
                    }} title="View Visit">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {visit.status === 'Scheduled' && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditVisit(visit)} title="Edit Visit">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          size="sm"
                          className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          onClick={() => handleForwardToNursing(visit)}
                        >
                          <Send className="h-3 w-3 mr-1" />Send
                        </Button>
                      </>
                    )}
                    
                    {visit.status === 'Sent to Nursing' && (
                      <div className="h-7 w-7 flex items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                </div>
                  </CardContent>
                </Card>
              ))
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-1">No visits found</p>
                    <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Pagination */}
            {filteredVisits.length > 0 && (
              <StandardPagination
                currentPage={currentPage}
                totalItems={searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || clinicFilter !== 'all' || dateFilter !== 'all'
                  ? filteredVisits.length 
                  : totalCount}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(newSize) => {
                  setItemsPerPage(newSize);
                  setCurrentPage(1);
                }}
                itemName="visits"
              />
            )}
          </>
        )}

        {/* Edit Visit Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-500" />
                Edit Visit Details
              </DialogTitle>
              <DialogDescription>
                Update the visit details for {selectedVisit?.patient}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Visit Type</Label>
                  <Select value={editForm.type} onValueChange={(v) => setEditForm(prev => ({ ...prev, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="routine">Routine Checkup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Clinic</Label>
                  <Select value={editForm.clinic} onValueChange={(v) => setEditForm(prev => ({ ...prev, clinic: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLINICS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select value={editForm.location} onValueChange={(v) => setEditForm(prev => ({ ...prev, location: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {locations.slice(1).map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes / Special Instructions</Label>
                <Textarea 
                  value={editForm.notes} 
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any special instructions, referral notes, or additional information..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Visit Modal */}
        <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-500" />
                Visit Details
              </DialogTitle>
              <DialogDescription>
                {selectedVisit?.patient} - {selectedVisit?.id}
              </DialogDescription>
            </DialogHeader>
            {selectedVisit && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Visit Type</Label>
                    <p className="font-medium">{getVisitTypeLabel(selectedVisit.type)}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Status</Label>
                    <p className="font-medium">{selectedVisit.status}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Clinic</Label>
                    <p className="font-medium">{selectedVisit.clinic || 'Not specified'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Location</Label>
                    <p className="font-medium">{selectedVisit.location || 'Not specified'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Date</Label>
                    <p className="font-medium">{selectedVisit.date}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Time</Label>
                    <p className="font-medium">{selectedVisit.time}</p>
                  </div>
                </div>
                {selectedVisit.notes && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Notes / Special Instructions</Label>
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <p className="text-sm whitespace-pre-wrap">{selectedVisit.notes}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>Close</Button>
              {selectedVisit?.status === 'Scheduled' && (
                <Button onClick={() => {
                  setIsViewModalOpen(false);
                  handleEditVisit(selectedVisit);
                }}>
                  <Edit className="h-4 w-4 mr-2" />Edit
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send to Nursing Confirmation Modal */}
        <Dialog open={isForwardModalOpen} onOpenChange={setIsForwardModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-emerald-500" />
                Send to Nursing
              </DialogTitle>
              <DialogDescription>
                Confirm and send <strong>{selectedVisit?.patient}</strong> to the Nursing Pool Queue.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  <strong>What happens next:</strong>
                </p>
                <ul className="list-disc list-inside text-sm text-emerald-700 dark:text-emerald-300 mt-2 space-y-1">
                  <li>Patient appears in Nursing Pool Queue</li>
                  <li>Nurse records vital signs</li>
                  <li>Patient proceeds to consultation</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsForwardModalOpen(false)}>Cancel</Button>
              <Button onClick={confirmForwardToNursing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Send className="h-4 w-4 mr-2" />Confirm & Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
