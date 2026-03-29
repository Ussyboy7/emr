"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  WardDoctorOrdersSection,
  userCanAddWardDoctorOrders,
  userCanEditCancelWardOrders,
} from '@/components/ward/WardDoctorOrdersSection';
import {
  Building2, Users, Search, Eye, AlertTriangle, CheckCircle,
  Bed, Activity, RefreshCw, Loader2, FileText, User
} from 'lucide-react';
import { CustomDateRangeButton } from '@/components/CustomDateRangeButton';
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';
import { toast } from 'sonner';
import { wardService, type Ward, type PatientAdmission, type WardAssignment } from '@/lib/services/ward-service';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ResetFiltersButton } from '@/components/ResetFiltersButton';

export default function WardOverviewPage() {
  const { currentUser } = useCurrentUser();
  const [wards, setWards] = useState<Ward[]>([]);
  const [admissions, setAdmissions] = useState<PatientAdmission[]>([]);
  const [assignments, setAssignments] = useState<WardAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedWard, setSelectedWard] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [myPatientsOnly, setMyPatientsOnly] = useState(false);

  // Progress note form
  const [progressNote, setProgressNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Dialog states
  const [showAdmissionDetails, setShowAdmissionDetails] = useState(false);
  const [showDischargeDialog, setShowDischargeDialog] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<PatientAdmission | null>(null);

  // Discharge form
  const [dischargeData, setDischargeData] = useState({
    discharge_type: 'regular',
    discharge_diagnosis: '',
    discharge_notes: '',
    follow_up_instructions: '',
  });

  const buildDateParams = useCallback(() => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    if (dateRange.from || dateRange.to) {
      return {
        admission_date_after: dateRange.from || undefined,
        admission_date_before: dateRange.to || undefined,
      };
    }
    if (dateFilter === 'today') return { admission_date: fmt(today) };
    if (dateFilter === 'week') {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      return { admission_date_after: fmt(start), admission_date_before: fmt(today) };
    }
    if (dateFilter === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { admission_date_after: fmt(start), admission_date_before: fmt(today) };
    }
    return {};
  }, [dateFilter, dateRange.from, dateRange.to]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const wardsResponse = await wardService.getWards();
      setWards(wardsResponse.results || []);

      const admissionsParams: any = { ...buildDateParams() };
      if (statusFilter !== 'all') admissionsParams.status = statusFilter;
      if (selectedWard !== 'all') admissionsParams.ward = parseInt(selectedWard);
      if (typeFilter !== 'all') admissionsParams.admission_type = typeFilter;

      const [admissionsResponse, assignmentsResponse] = await Promise.all([
        wardService.getAdmissions(admissionsParams),
        wardService.getAssignments(),
      ]);
      setAdmissions(admissionsResponse.results || []);
      setAssignments(assignmentsResponse.results || []);
    } catch (error: any) {
      console.error('Error fetching ward data:', error);
      toast.error(error.message || 'Unable to load ward data.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, selectedWard, typeFilter, buildDateParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleViewAdmission = (admission: PatientAdmission) => {
    setSelectedAdmission(admission);
    setShowAdmissionDetails(true);
  };

  const handleInitiateDischarge = async () => {
    if (!selectedAdmission) return;
    if (!dischargeData.discharge_diagnosis.trim()) {
      toast.error('Discharge diagnosis is required');
      return;
    }
    try {
      await wardService.initiateDischarge(selectedAdmission.id, {
        discharge_type: dischargeData.discharge_type,
        discharge_diagnosis: dischargeData.discharge_diagnosis,
        discharge_notes: dischargeData.discharge_notes || undefined,
        follow_up_instructions: dischargeData.follow_up_instructions || undefined,
      });
      toast.success('Discharge initiated — nursing will complete when patient leaves', { duration: 5000 });
      setShowDischargeDialog(false);
      setSelectedAdmission(null);
      setDischargeData({ discharge_type: 'regular', discharge_diagnosis: '', discharge_notes: '', follow_up_instructions: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to initiate discharge');
    }
  };

  const handleSaveProgressNote = async () => {
    if (!selectedAdmission) return;
    if (!progressNote.trim()) {
      toast.error('Please enter a progress note');
      return;
    }
    setIsSavingNote(true);
    try {
      const timestamp = new Date().toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      const authorName = currentUser?.name || currentUser?.username || 'Unknown';
      const newNote = `[${timestamp} — Dr. ${authorName}]\n${progressNote.trim()}`;
      const existing = selectedAdmission.admission_notes?.trim();
      const combined = existing ? `${newNote}\n\n---\n\n${existing}` : newNote;

      await wardService.updateAdmission(selectedAdmission.id, { admission_notes: combined });
      toast.success('Progress note saved');
      setProgressNote('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save progress note');
    } finally {
      setIsSavingNote(false);
    }
  };

  const getPatientAssignments = (admissionId: number) =>
    assignments.filter(a => a.admission === admissionId && a.is_active);

  const wardStats = useMemo(() => {
    const totalCapacity = wards.reduce((sum, w) => sum + w.total_beds, 0);
    const totalOccupied = wards.reduce((sum, w) => sum + w.occupied_beds, 0);
    const totalAdmissions = admissions.filter(a => a.status === 'admitted').length;
    const criticalPatients = admissions.filter(a =>
      (a.status === 'admitted' || a.status === 'pending_discharge') &&
      /critical|serious|needs doctor review/i.test(a.current_condition || '')
    ).length;
    const pendingDischarge = admissions.filter(a => a.status === 'pending_discharge').length;
    return {
      totalCapacity,
      totalAdmissions,
      criticalPatients,
      pendingDischarge,
      occupancyRate: totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0,
    };
  }, [wards, admissions]);

  const filteredAdmissions = admissions.filter(admission => {
    if (myPatientsOnly && currentUser?.id) {
      if (admission.admitting_doctor !== Number(currentUser.id)) return false;
    }
    if (!searchQuery) return true;
    return (
      admission.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admission.admission_id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const getStatusColor = (status: string, condition?: string) => {
    if (condition && /needs doctor review/i.test(condition)) return 'border-l-orange-500';
    switch (status) {
      case 'admitted': return 'border-l-blue-500';
      case 'pending_discharge': return 'border-l-amber-500';
      case 'discharged': return 'border-l-green-500';
      case 'transferred': return 'border-l-purple-500';
      default: return 'border-l-muted';
    }
  };

  const getAvatarStyle = (status: string) => {
    switch (status) {
      case 'admitted': return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' };
      case 'pending_discharge': return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' };
      case 'discharged': return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400' };
      case 'transferred': return { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' };
      default: return { bg: 'bg-muted', text: 'text-muted-foreground' };
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'admitted': return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
      case 'pending_discharge': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'discharged': return 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10';
      case 'transferred': return 'border-purple-500/50 text-purple-600 dark:text-purple-400 bg-purple-500/10';
      default: return 'border-muted-foreground/50 text-muted-foreground';
    }
  };

  const formatStatus = (status: string) => {
    if (status === 'pending_discharge') return 'Pending Discharge';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getConditionBadgeClass = (condition: string) => {
    if (/needs doctor review/i.test(condition))
      return 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10';
    const lc = condition.toLowerCase();
    if (lc.includes('stable') || lc.includes('good') || lc.includes('improving'))
      return 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10';
    if (lc.includes('critical') || lc.includes('serious'))
      return 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10';
    return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
  };

  const initials = (name: string) =>
    name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Ward Rounds</h1>
            <p className="text-muted-foreground mt-1">Review patients, write orders, record progress notes, and manage discharges</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={myPatientsOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMyPatientsOnly(p => !p)}
              className={myPatientsOnly ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
            >
              <User className="h-4 w-4 mr-2" />
              {myPatientsOnly ? 'My Patients' : 'My Patients'}
            </Button>
            <Button variant="outline" onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Capacity', value: wardStats.totalCapacity, icon: Bed, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Admitted Patients', value: wardStats.totalAdmissions, icon: Users, color: 'text-green-500', bg: 'bg-green-500/10' },
            { label: 'Pending Discharge', value: wardStats.pendingDischarge, icon: CheckCircle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Critical / Escalated', value: wardStats.criticalPatients, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
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

        {/* Ward Capacity Cards */}
        {!isLoading && wards.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-8 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground mb-2">No Wards Configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please contact your system administrator to configure hospital wards.
              </p>
              <Button variant="outline" onClick={fetchData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : wards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {wards.map((ward) => {
              const pct = ward.total_beds > 0 ? Math.round((ward.occupied_beds / ward.total_beds) * 100) : 0;
              const isFull = pct >= 90;
              const hasAvailability = ward.available_beds > 0;
              return (
                <Card key={ward.id} className={`transition-all hover:shadow-md ${
                  isFull ? 'border-red-200 dark:border-red-800' :
                  hasAvailability ? 'border-green-200 dark:border-green-800' :
                  'border-yellow-200 dark:border-yellow-800'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className={`h-4 w-4 ${hasAvailability ? 'text-green-500' : 'text-red-500'}`} />
                      <p className="font-medium text-sm truncate">{ward.name}</p>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-2xl font-bold">{ward.occupied_beds}/{ward.total_beds}</span>
                      <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                        isFull ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                        hasAvailability ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>{pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{ward.available_beds} beds available</p>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CustomDateRangeButton onClick={() => setIsDateRangeOpen(true)} />
                <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); setDateRange({ from: '', to: '' }); }}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This week</SelectItem>
                    <SelectItem value="month">This month</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedWard} onValueChange={setSelectedWard}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Wards" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Wards</SelectItem>
                    {wards.map(w => (
                      <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="admitted">Admitted</SelectItem>
                    <SelectItem value="discharged">Discharged</SelectItem>
                    <SelectItem value="transferred">Transferred</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="observation">Observation</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="elective">Elective</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                  </SelectContent>
                </Select>
                <ResetFiltersButton
                  label="Reset filters"
                  onClick={() => { setSelectedWard('all'); setStatusFilter('all'); setTypeFilter('all'); setDateFilter('all'); setDateRange({ from: '', to: '' }); setSearchQuery(''); }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <AdvancedDateRangeDialog
          open={isDateRangeOpen}
          onOpenChange={setIsDateRangeOpen}
          description="Apply a custom admission date range to narrow down the patient list."
          label="Admission Date Range"
          value={dateRange}
          onChange={(range) => { setDateRange(range); setDateFilter('all'); }}
          onClear={() => { setDateRange({ from: '', to: '' }); setIsDateRangeOpen(false); }}
        />

        {/* Patient List */}
        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading patients...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-muted-foreground">
                {myPatientsOnly ? 'My patients · ' : ''}
                Showing <span className="font-medium text-foreground">{filteredAdmissions.length}</span> patient{filteredAdmissions.length !== 1 ? 's' : ''}
              </p>
              {filteredAdmissions.some(a => /needs doctor review/i.test(a.current_condition || '')) && (
                <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/50 text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {filteredAdmissions.filter(a => /needs doctor review/i.test(a.current_condition || '')).length} need{filteredAdmissions.filter(a => /needs doctor review/i.test(a.current_condition || '')).length === 1 ? 's' : ''} review
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {filteredAdmissions.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-1">No patients found</p>
                    <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
                  </CardContent>
                </Card>
              ) : (
                filteredAdmissions.map((admission) => {
                  const patientAssignments = getPatientAssignments(admission.id);
                  const avatar = getAvatarStyle(admission.status);
                  return (
                    <Card
                      key={admission.id}
                      className={`border-l-4 ${getStatusColor(admission.status, admission.current_condition)} hover:shadow-md transition-shadow`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${avatar.bg}`}>
                            <span className={`font-semibold text-xs ${avatar.text}`}>{initials(admission.patient_name)}</span>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            {/* Row 1 */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="font-semibold text-foreground truncate">{admission.patient_name}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusBadgeClass(admission.status)}`}>
                                  {formatStatus(admission.status)}
                                </Badge>
                                {admission.current_condition && (
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getConditionBadgeClass(admission.current_condition)}`}>
                                    {admission.current_condition}
                                  </Badge>
                                )}
                              </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleViewAdmission(admission)} title="View Details">
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {admission.status === 'admitted' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                    onClick={() => { setSelectedAdmission(admission); setShowDischargeDialog(true); }}
                                    title="Initiate Discharge"
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1" />Discharge
                                  </Button>
                                )}
                                {admission.status === 'pending_discharge' && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10 animate-pulse">
                                    Awaiting nurse
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Row 2 */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              <span>{admission.admission_id}</span>
                              <span>•</span>
                              <span>{admission.ward_name}</span>
                              <span>•</span>
                              {admission.bed_number
                                ? <span>Bed {admission.bed_number}</span>
                                : <span className="text-amber-500 dark:text-amber-400">No bed</span>
                              }
                              <span>•</span>
                              <span>
                                {new Date(admission.admission_date).toLocaleDateString('en-GB', {
                                  day: 'numeric', month: 'short', year: 'numeric',
                                })}
                              </span>
                              <span>•</span>
                              <span>
                                {admission.length_of_stay === 0
                                  ? 'Same day'
                                  : `${admission.length_of_stay} day${admission.length_of_stay === 1 ? '' : 's'}`}
                              </span>
                              {patientAssignments.length > 0 && (
                                <>
                                  <span>•</span>
                                  <span>
                                    {patientAssignments.slice(0, 2).map(a => a.nurse_name).join(', ')}
                                    {patientAssignments.length > 2 ? ` +${patientAssignments.length - 2}` : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Admission Details Dialog */}
        {selectedAdmission && (
          <Dialog open={showAdmissionDetails} onOpenChange={setShowAdmissionDetails}>
            <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Patient Details: {selectedAdmission.patient_name}</DialogTitle>
                <DialogDescription>
                  {selectedAdmission.admission_id} · {selectedAdmission.ward_name}
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="clinical" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-9">
                  <TabsTrigger value="clinical" className="text-xs">Clinical</TabsTrigger>
                  <TabsTrigger value="orders" className="text-xs">Orders</TabsTrigger>
                  <TabsTrigger value="progress" className="text-xs">
                    <FileText className="h-3 w-3 mr-1 hidden sm:inline" />
                    Progress Notes
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="clinical" className="space-y-4 py-4 mt-2">
                  {/* Nurse escalation alert — shown at top so doctor sees it immediately */}
                  {selectedAdmission.current_condition && (
                    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm ${
                      /needs doctor review/i.test(selectedAdmission.current_condition)
                        ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400'
                        : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                    }`}>
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-xs uppercase tracking-wide mb-0.5">Nurse Report — Current Condition</p>
                        <p>{selectedAdmission.current_condition}</p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Admission Date</Label>
                      <p className="font-medium text-sm">
                        {new Date(selectedAdmission.admission_date).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Length of Stay</Label>
                      <p className="font-medium text-sm">
                        {selectedAdmission.length_of_stay === 0
                          ? 'Same day'
                          : `${selectedAdmission.length_of_stay} day${selectedAdmission.length_of_stay === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {selectedAdmission.admitting_doctor_name && (
                      <div>
                        <Label className="text-muted-foreground text-xs">Admitting Doctor</Label>
                        <p className="font-medium text-sm">{selectedAdmission.admitting_doctor_name}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground text-xs">Status</Label>
                      <Badge variant="outline" className={`text-xs mt-0.5 ${getStatusBadgeClass(selectedAdmission.status)}`}>
                        {formatStatus(selectedAdmission.status)}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Admission Diagnosis</Label>
                    <p className="text-sm bg-muted p-3 rounded mt-1">{selectedAdmission.admission_diagnosis}</p>
                  </div>
                  {selectedAdmission.presenting_complaint && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Presenting Complaint</Label>
                      <p className="text-sm bg-muted p-3 rounded mt-1">{selectedAdmission.presenting_complaint}</p>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="orders" className="py-4 mt-2">
                  <WardDoctorOrdersSection
                    admission={selectedAdmission}
                    allowAddOrders={!!currentUser?.isSuperuser || userCanAddWardDoctorOrders(currentUser?.systemRole)}
                    allowEditCancelOrders={!!currentUser?.isSuperuser || userCanEditCancelWardOrders(currentUser?.systemRole)}
                    currentUserId={currentUser?.id != null ? Number(currentUser.id) : undefined}
                  />
                </TabsContent>

                <TabsContent value="progress" className="py-4 mt-2 space-y-4">
                  {/* Write new note */}
                  {selectedAdmission.status === 'admitted' && (
                    <div className="space-y-2">
                      <Label>Write Progress Note</Label>
                      <Textarea
                        value={progressNote}
                        onChange={(e) => setProgressNote(e.target.value)}
                        placeholder="Daily ward round note — patient progress, clinical findings, plan..."
                        rows={4}
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveProgressNote}
                        disabled={isSavingNote || !progressNote.trim()}
                      >
                        {isSavingNote ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                        Save Note
                      </Button>
                    </div>
                  )}

                  {/* Existing notes */}
                  {selectedAdmission.admission_notes ? (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs">Previous Notes</Label>
                      <div className="text-sm bg-muted p-3 rounded whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {selectedAdmission.admission_notes}
                      </div>
                    </div>
                  ) : (
                    !selectedAdmission.current_condition && (
                      <p className="text-sm text-muted-foreground text-center py-4">No progress notes recorded yet.</p>
                    )
                  )}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        )}

        {/* Discharge Dialog */}
        {selectedAdmission && (
          <Dialog open={showDischargeDialog} onOpenChange={(open) => {
            setShowDischargeDialog(open);
            if (!open) setDischargeData({ discharge_type: 'regular', discharge_diagnosis: '', discharge_notes: '', follow_up_instructions: '' });
          }}>
            <DialogContent className="sm:max-w-[580px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-amber-500" />
                  Initiate Discharge — Step 1 of 2
                </DialogTitle>
                <DialogDescription>
                  {selectedAdmission.patient_name} · {selectedAdmission.admission_id} · {selectedAdmission.length_of_stay === 0 ? 'Same day' : `${selectedAdmission.length_of_stay} day${selectedAdmission.length_of_stay === 1 ? '' : 's'}`}
                  <span className="block mt-1 text-amber-600 dark:text-amber-400 font-medium">
                    Nursing staff will complete discharge once the patient has physically left.
                  </span>
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Discharge Type</Label>
                    <Select value={dischargeData.discharge_type} onValueChange={(v) => setDischargeData({ ...dischargeData, discharge_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular Discharge</SelectItem>
                        <SelectItem value="against_medical_advice">Against Medical Advice</SelectItem>
                        <SelectItem value="transfer">Transfer to Another Facility</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Discharge Diagnosis <span className="text-red-500">*</span></Label>
                    <Input
                      value={dischargeData.discharge_diagnosis}
                      onChange={(e) => setDischargeData({ ...dischargeData, discharge_diagnosis: e.target.value })}
                      placeholder="Final diagnosis"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Discharge Notes</Label>
                  <Textarea
                    value={dischargeData.discharge_notes}
                    onChange={(e) => setDischargeData({ ...dischargeData, discharge_notes: e.target.value })}
                    placeholder="Clinical notes for discharge"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Follow-up Instructions</Label>
                  <Textarea
                    value={dischargeData.follow_up_instructions}
                    onChange={(e) => setDischargeData({ ...dischargeData, follow_up_instructions: e.target.value })}
                    placeholder="Instructions for follow-up care"
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDischargeDialog(false)}>Cancel</Button>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleInitiateDischarge}>
                  <CheckCircle className="h-4 w-4 mr-2" />Initiate Discharge
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

      </div>
    </DashboardLayout>
  );
}
