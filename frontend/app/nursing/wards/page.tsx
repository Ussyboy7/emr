"use client";

import { useState, useEffect, useCallback } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building2, Users, UserCheck, Search, Eye, CheckCircle, AlertTriangle,
  Bed, Activity, Loader2, Thermometer, Bell
} from 'lucide-react';
import { CustomDateRangeButton } from '@/components/CustomDateRangeButton';
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';
import { toast } from 'sonner';
import { wardService, type Ward, type PatientAdmission, type WardAssignment } from '@/lib/services/ward-service';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ResetFiltersButton } from '@/components/ResetFiltersButton';
import { WardDoctorOrdersSection } from '@/components/ward/WardDoctorOrdersSection';

export default function WardCarePage() {
  const { currentUser } = useCurrentUser();
  const [wards, setWards] = useState<Ward[]>([]);
  const [admissions, setAdmissions] = useState<PatientAdmission[]>([]);
  const [assignments, setAssignments] = useState<WardAssignment[]>([]);
  const [allAssignments, setAllAssignments] = useState<WardAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedWard, setSelectedWard] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [showAdmissionDetails, setShowAdmissionDetails] = useState(false);
  const [showObservationDialog, setShowObservationDialog] = useState(false);
  const [showAssignBedDialog, setShowAssignBedDialog] = useState(false);
  const [showCompleteDischargeDialog, setShowCompleteDischargeDialog] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<PatientAdmission | null>(null);
  const [availableBeds, setAvailableBeds] = useState<any[]>([]);
  const [isAssigningBed, setIsAssigningBed] = useState(false);
  const [isCompletingDischarge, setIsCompletingDischarge] = useState(false);

  // Observation form
  const [observationData, setObservationData] = useState({
    current_condition: '',
    bp: '',
    temperature: '',
    pulse: '',
    spo2: '',
    shift_notes: '',
    escalate: false,
  });
  const [isSavingObservation, setIsSavingObservation] = useState(false);

  const getPatientAssignments = (admissionId: number) =>
    allAssignments.filter(a => a.admission === admissionId && a.is_active);

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

      const admissionsResponse = await wardService.getAdmissions(admissionsParams);
      setAdmissions(admissionsResponse.results || []);

      const nurseId = Number(currentUser?.id);
      const roleName = (currentUser as any)?.systemRole ?? '';
      const isNurseRole = typeof roleName === 'string' && /(nurse|midwife)/i.test(roleName);

      // Fetch all active assignments for patient-level display in Care Plan tab
      try {
        const allAssignmentsResponse = await wardService.getAssignments({ status: 'active' });
        setAllAssignments(allAssignmentsResponse.results || []);
      } catch {
        setAllAssignments([]);
      }

      if (Number.isFinite(nurseId) && isNurseRole) {
        try {
          const assignmentsResponse = await wardService.getAssignments({ nurse: nurseId, status: 'active' });
          setAssignments(assignmentsResponse.results || []);
        } catch {
          setAssignments([]);
        }
      } else {
        setAssignments([]);
      }
    } catch (error: any) {
      console.error('Error fetching ward data:', error);
      toast.error(error.message || 'Failed to load ward data');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, statusFilter, selectedWard, typeFilter, buildDateParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleViewAdmission = (admission: PatientAdmission) => {
    setSelectedAdmission(admission);
    setShowAdmissionDetails(true);
  };

  const openObservationDialog = (admission: PatientAdmission) => {
    setSelectedAdmission(admission);
    setObservationData({
      current_condition: admission.current_condition || '',
      bp: '',
      temperature: '',
      pulse: '',
      spo2: '',
      shift_notes: '',
      escalate: false,
    });
    setShowObservationDialog(true);
  };

  const handleSaveObservation = async () => {
    if (!selectedAdmission) return;
    if (!observationData.current_condition && !observationData.shift_notes && !observationData.escalate) {
      toast.error('Please enter at least a condition or shift notes');
      return;
    }
    setIsSavingObservation(true);
    try {
      const vitals = [
        observationData.bp && `BP: ${observationData.bp}`,
        observationData.temperature && `Temp: ${observationData.temperature}°C`,
        observationData.pulse && `Pulse: ${observationData.pulse} bpm`,
        observationData.spo2 && `SpO2: ${observationData.spo2}%`,
      ].filter(Boolean).join(' | ');

      const noteLines = [
        vitals && `Vitals — ${vitals}`,
        observationData.shift_notes,
        observationData.escalate ? '⚠️ ESCALATED — Needs Doctor Review' : '',
      ].filter(Boolean).join('\n');

      const condition = observationData.escalate
        ? 'Needs Doctor Review'
        : observationData.current_condition || selectedAdmission.current_condition;

      await wardService.updateAdmission(selectedAdmission.id, {
        current_condition: condition || undefined,
        admission_notes: noteLines || undefined,
      });

      if (observationData.escalate) {
        toast.warning('Patient escalated — doctor has been flagged for review', { duration: 5000 });
      } else {
        toast.success('Observation recorded successfully');
      }

      setShowObservationDialog(false);
      setSelectedAdmission(null);
      setObservationData({ current_condition: '', bp: '', temperature: '', pulse: '', spo2: '', shift_notes: '', escalate: false });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save observation');
    } finally {
      setIsSavingObservation(false);
    }
  };

  const handleAssignBed = async (admission: PatientAdmission) => {
    setSelectedAdmission(admission);
    setShowAssignBedDialog(true);
    try {
      const bedsResponse = await wardService.getBeds({ ward: admission.ward, status: 'available' });
      setAvailableBeds(bedsResponse.results || []);
    } catch {
      setAvailableBeds([]);
    }
  };

  const handleBedAssignment = async (bedId: number) => {
    if (!selectedAdmission) return;
    setIsAssigningBed(true);
    try {
      const isChange = !!selectedAdmission.bed;
      const updated = await wardService.assignBedToAdmission(selectedAdmission.id, bedId);
      setAdmissions(prev => prev.map(a => a.id === updated.id ? updated : a));
      toast.success(isChange ? 'Bed changed successfully' : `Bed ${updated.bed_number} assigned`);
      setShowAssignBedDialog(false);
      setSelectedAdmission(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign bed');
    } finally {
      setIsAssigningBed(false);
    }
  };

  const handleRemoveFromBed = async (admission: PatientAdmission) => {
    try {
      const updated = await wardService.assignBedToAdmission(admission.id, null);
      setAdmissions(prev => prev.map(a => a.id === updated.id ? updated : a));
      toast.success(`${admission.patient_name} removed from bed`);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove patient from bed');
    }
  };

  const handleCompleteDischarge = async () => {
    if (!selectedAdmission) return;
    setIsCompletingDischarge(true);
    try {
      await wardService.completeDischarge(
        selectedAdmission.id,
        currentUser?.id ? Number(currentUser.id) : undefined
      );
      toast.success(`${selectedAdmission.patient_name} discharged — bed is now available`);
      setShowCompleteDischargeDialog(false);
      setSelectedAdmission(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete discharge');
    } finally {
      setIsCompletingDischarge(false);
    }
  };

  const filteredAdmissions = admissions.filter(admission => {
    if (!searchQuery) return true;
    return (
      admission.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admission.admission_id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const criticalCount = admissions.filter(a =>
    a.status === 'admitted' && /critical|severe|urgent|needs doctor/i.test(a.current_condition || '')
  ).length;

  const escalatedCount = admissions.filter(a =>
    a.status === 'admitted' && /needs doctor review/i.test(a.current_condition || '')
  ).length;

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

  const pendingDischargeCount = admissions.filter(a => a.status === 'pending_discharge').length;

  const getConditionBadgeClass = (condition: string) => {
    if (/needs doctor review/i.test(condition))
      return 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10';
    const lc = condition.toLowerCase();
    if (lc.includes('stable') || lc.includes('improving'))
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Ward Care</h1>
            <p className="text-muted-foreground mt-1">Record observations, execute doctor orders, and manage patient care</p>
          </div>
          <Button variant="outline" onClick={fetchData} disabled={isLoading}>
            <Activity className={`h-4 w-4 mr-2 ${isLoading ? 'animate-pulse' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Admitted Patients', value: admissions.filter(a => a.status === 'admitted').length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Pending Discharge', value: pendingDischargeCount, icon: CheckCircle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'My Assignments', value: assignments.length, icon: UserCheck, color: 'text-teal-500', bg: 'bg-teal-500/10' },
            { label: 'Needs Attention', value: escalatedCount + criticalCount, icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
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
              <p className="text-sm text-muted-foreground mb-4">Please contact your system administrator to configure hospital wards.</p>
              <Button variant="outline" onClick={fetchData} disabled={isLoading}>
                <Activity className="h-4 w-4 mr-2" />Try Again
              </Button>
            </CardContent>
          </Card>
        ) : wards.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wards.map((ward) => {
              const pct = ward.total_beds > 0 ? Math.round((ward.occupied_beds / ward.total_beds) * 100) : 0;
              return (
                <Card key={ward.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm">{ward.name}</p>
                      <Badge variant="outline" className="text-xs">{ward.occupied_beds}/{ward.total_beds}</Badge>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                      <div
                        className={`h-1.5 rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-400' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{pct}%</span>
                      <span>{ward.available_beds} bed{ward.available_beds !== 1 ? 's' : ''} available</span>
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

        {/* Main Content */}
        <Tabs defaultValue="patients" className="space-y-4">
          <TabsList>
            <TabsTrigger value="patients">All Patients</TabsTrigger>
            <TabsTrigger value="assignments">
              My Assignments
              {assignments.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-teal-500 text-white">
                  {assignments.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="patients" className="space-y-4">
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
                    Showing <span className="font-medium text-foreground">{filteredAdmissions.length}</span> patient{filteredAdmissions.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    {pendingDischargeCount > 0 && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/50 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {pendingDischargeCount} pending discharge
                      </Badge>
                    )}
                    {escalatedCount > 0 && (
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/50 text-xs">
                        <Bell className="h-3 w-3 mr-1" />
                        {escalatedCount} escalated
                      </Badge>
                    )}
                  </div>
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
                      const avatar = getAvatarStyle(admission.status);
                      const isEscalated = /needs doctor review/i.test(admission.current_condition || '');
                      return (
                        <Card
                          key={admission.id}
                          className={`border-l-4 ${getStatusColor(admission.status, admission.current_condition)} hover:shadow-md transition-shadow ${admission.status === 'discharged' ? 'opacity-80' : ''}`}
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
                                        {isEscalated ? '⚠️ ' : ''}{admission.current_condition}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleViewAdmission(admission)} title="View Details">
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    {admission.status === 'admitted' && !admission.bed_number && (
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleAssignBed(admission)} title="Assign Bed">
                                        <Bed className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {admission.status === 'admitted' && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                                        onClick={() => openObservationDialog(admission)}
                                        title="Record Observation"
                                      >
                                        <Thermometer className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {admission.status === 'pending_discharge' && (
                                      <Button
                                        size="sm"
                                        className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                                        onClick={() => { setSelectedAdmission(admission); setShowCompleteDischargeDialog(true); }}
                                        title="Complete Discharge — confirm patient has left"
                                      >
                                        <CheckCircle className="h-3 w-3 mr-1" />Complete
                                      </Button>
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
                                  {admission.admitting_doctor_name && (
                                    <><span>•</span><span>{admission.admitting_doctor_name}</span></>
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
          </TabsContent>

          <TabsContent value="assignments" className="space-y-4">
            {assignments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <UserCheck className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-1">No active assignments</p>
                  <p className="text-sm text-muted-foreground">You have no patients assigned to you at the moment</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {assignments.map((assignment) => (
                  <Card key={assignment.id} className="border-l-4 border-l-teal-500 hover:shadow-md transition-shadow">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                          <span className="font-semibold text-xs text-teal-600 dark:text-teal-400">
                            {initials(assignment.patient_name)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-foreground truncate">{assignment.patient_name}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-teal-500/50 text-teal-600 dark:text-teal-400 bg-teal-500/10">
                                {assignment.assignment_type}
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              title="Mark assignment complete"
                              onClick={async () => {
                                try {
                                  await wardService.completeAssignment(assignment.id);
                                  toast.success('Assignment marked as complete');
                                  fetchData();
                                } catch (err: any) {
                                  toast.error(err.message || 'Failed to complete assignment');
                                }
                              }}
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />Complete
                            </Button>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            <span>{assignment.ward_name}</span>
                            {assignment.responsibilities && <><span>•</span><span className="truncate max-w-[240px]">{assignment.responsibilities}</span></>}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Admission Details Dialog */}
        {selectedAdmission && (
          <Dialog open={showAdmissionDetails} onOpenChange={setShowAdmissionDetails}>
            <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Patient: {selectedAdmission.patient_name}</DialogTitle>
                <DialogDescription>{selectedAdmission.admission_id} · {selectedAdmission.ward_name}</DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="care" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-9">
                  <TabsTrigger value="care" className="text-xs">Care Plan</TabsTrigger>
                  <TabsTrigger value="orders" className="text-xs">Doctor's Orders</TabsTrigger>
                  <TabsTrigger value="observations" className="text-xs">Observations</TabsTrigger>
                </TabsList>

                <TabsContent value="care" className="space-y-4 py-4 mt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Ward</Label>
                      <p className="font-medium text-sm">{selectedAdmission.ward_name}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Bed</Label>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {selectedAdmission.bed_number
                          ? <p className="font-medium text-sm">Bed {selectedAdmission.bed_number}</p>
                          : <p className="text-sm text-amber-500 dark:text-amber-400 font-medium">Unassigned</p>
                        }
                        {selectedAdmission.status === 'admitted' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => {
                                setShowAdmissionDetails(false);
                                handleAssignBed(selectedAdmission);
                              }}
                            >
                              <Bed className="h-3 w-3 mr-1" />
                              {selectedAdmission.bed_number ? 'Change' : 'Assign'}
                            </Button>
                            {selectedAdmission.bed_number && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  setShowAdmissionDetails(false);
                                  handleRemoveFromBed(selectedAdmission);
                                }}
                              >
                                Remove
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Admission Date</Label>
                      <p className="font-medium text-sm">
                        {new Date(selectedAdmission.admission_date).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Days Admitted</Label>
                      <p className="font-medium text-sm">
                        {selectedAdmission.length_of_stay === 0
                          ? 'Same day'
                          : `${selectedAdmission.length_of_stay} day${selectedAdmission.length_of_stay === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {selectedAdmission.admitting_doctor_name && (
                      <div className="col-span-2">
                        <Label className="text-muted-foreground text-xs">Admitting Doctor</Label>
                        <p className="font-medium text-sm">{selectedAdmission.admitting_doctor_name}</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Admission Diagnosis</Label>
                    <p className="text-sm bg-muted p-2 rounded mt-1">{selectedAdmission.admission_diagnosis}</p>
                  </div>
                  {selectedAdmission.presenting_complaint && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Presenting Complaint</Label>
                      <p className="text-sm bg-muted p-2 rounded mt-1">{selectedAdmission.presenting_complaint}</p>
                    </div>
                  )}
                  {/* Nurse assignments — operational view for nursing staff */}
                  <div>
                    <Label className="text-muted-foreground text-xs">Nurse Assignments</Label>
                    <div className="space-y-2 mt-1">
                      {getPatientAssignments(selectedAdmission.id).length > 0 ? (
                        getPatientAssignments(selectedAdmission.id).map((assignment, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-muted rounded">
                            <div>
                              <p className="font-medium text-sm">{assignment.nurse_name}</p>
                              <p className="text-xs text-muted-foreground capitalize">{assignment.assignment_type}</p>
                            </div>
                            <Badge variant="outline" className="text-xs capitalize">{assignment.status}</Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No nurse assigned yet</p>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="orders" className="py-4 mt-2">
                  <WardDoctorOrdersSection
                    admission={selectedAdmission}
                    allowAddOrders={false}
                    allowEditCancelOrders={false}
                    currentUserId={currentUser?.id != null ? Number(currentUser.id) : undefined}
                  />
                </TabsContent>

                <TabsContent value="observations" className="py-4 mt-2 space-y-4">
                  {selectedAdmission.current_condition && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Current Condition</Label>
                      <p className={`text-sm font-medium mt-1 px-3 py-2 rounded border ${getConditionBadgeClass(selectedAdmission.current_condition)}`}>
                        {/needs doctor review/i.test(selectedAdmission.current_condition) ? '⚠️ ' : ''}{selectedAdmission.current_condition}
                      </p>
                    </div>
                  )}
                  {selectedAdmission.admission_notes && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Latest Notes</Label>
                      <p className="text-sm bg-muted p-3 rounded mt-1 whitespace-pre-wrap">{selectedAdmission.admission_notes}</p>
                    </div>
                  )}
                  {!selectedAdmission.current_condition && !selectedAdmission.admission_notes && (
                    <p className="text-sm text-muted-foreground text-center py-6">No observations recorded yet.</p>
                  )}
                  {selectedAdmission.status === 'admitted' && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setShowAdmissionDetails(false);
                        openObservationDialog(selectedAdmission);
                      }}
                    >
                      <Thermometer className="h-4 w-4 mr-2" />Record New Observation
                    </Button>
                  )}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        )}

        {/* Record Observation Dialog */}
        {selectedAdmission && (
          <Dialog open={showObservationDialog} onOpenChange={(open) => {
            setShowObservationDialog(open);
            if (!open) setObservationData({ current_condition: '', bp: '', temperature: '', pulse: '', spo2: '', shift_notes: '', escalate: false });
          }}>
            <DialogContent className="sm:max-w-[540px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Thermometer className="h-5 w-5 text-teal-500" />
                  Record Observation
                </DialogTitle>
                <DialogDescription>
                  {selectedAdmission.patient_name} · {selectedAdmission.ward_name}{selectedAdmission.bed_number ? ` · Bed ${selectedAdmission.bed_number}` : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label>Current Condition</Label>
                  <Select value={observationData.current_condition} onValueChange={(v) => setObservationData(p => ({ ...p, current_condition: v, escalate: v === 'Needs Doctor Review' ? true : p.escalate }))}>
                    <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Stable">Stable</SelectItem>
                      <SelectItem value="Improving">Improving</SelectItem>
                      <SelectItem value="Guarded">Guarded</SelectItem>
                      <SelectItem value="Deteriorating">Deteriorating</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                      <SelectItem value="Needs Doctor Review">⚠️ Needs Doctor Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm mb-2 block">Vitals</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Blood Pressure (mmHg)</Label>
                      <Input
                        value={observationData.bp}
                        onChange={(e) => setObservationData(p => ({ ...p, bp: e.target.value }))}
                        placeholder="e.g. 120/80"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Temperature (°C)</Label>
                      <Input
                        value={observationData.temperature}
                        onChange={(e) => setObservationData(p => ({ ...p, temperature: e.target.value }))}
                        placeholder="e.g. 36.8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Pulse (bpm)</Label>
                      <Input
                        value={observationData.pulse}
                        onChange={(e) => setObservationData(p => ({ ...p, pulse: e.target.value }))}
                        placeholder="e.g. 72"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">SpO2 (%)</Label>
                      <Input
                        value={observationData.spo2}
                        onChange={(e) => setObservationData(p => ({ ...p, spo2: e.target.value }))}
                        placeholder="e.g. 98"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Shift Notes</Label>
                  <Textarea
                    value={observationData.shift_notes}
                    onChange={(e) => setObservationData(p => ({ ...p, shift_notes: e.target.value }))}
                    placeholder="Clinical observations, patient complaints, response to treatment..."
                    rows={3}
                  />
                </div>

                <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  observationData.escalate
                    ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700'
                    : 'bg-muted/30 border-border'
                }`}>
                  <Checkbox
                    id="escalate"
                    checked={observationData.escalate}
                    onCheckedChange={(checked) => setObservationData(p => ({
                      ...p,
                      escalate: !!checked,
                      current_condition: checked ? 'Needs Doctor Review' : p.current_condition === 'Needs Doctor Review' ? '' : p.current_condition,
                    }))}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="escalate" className={`font-medium cursor-pointer ${observationData.escalate ? 'text-orange-600 dark:text-orange-400' : ''}`}>
                      {observationData.escalate ? '⚠️ Escalate to Doctor' : 'Escalate to Doctor'}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Flags this patient as needing urgent doctor review. The doctor will see this on their Ward Rounds page.
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowObservationDialog(false)}>Cancel</Button>
                <Button
                  onClick={handleSaveObservation}
                  disabled={isSavingObservation}
                  className={observationData.escalate ? 'bg-orange-600 hover:bg-orange-700' : ''}
                >
                  {isSavingObservation ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : observationData.escalate ? (
                    <Bell className="h-4 w-4 mr-2" />
                  ) : (
                    <Thermometer className="h-4 w-4 mr-2" />
                  )}
                  {observationData.escalate ? 'Escalate & Save' : 'Save Observation'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Complete Discharge Dialog (Step 2) */}
        {selectedAdmission && (
          <Dialog open={showCompleteDischargeDialog} onOpenChange={(open) => {
            setShowCompleteDischargeDialog(open);
            if (!open) setSelectedAdmission(null);
          }}>
            <DialogContent className="sm:max-w-[460px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Complete Discharge — Step 2 of 2
                </DialogTitle>
                <DialogDescription>
                  {selectedAdmission.patient_name} · {selectedAdmission.ward_name}
                  {selectedAdmission.bed_number && ` · Bed ${selectedAdmission.bed_number}`}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 space-y-2">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">Before confirming, please ensure:</p>
                  <ul className="text-sm text-green-700 dark:text-green-400 space-y-1 list-disc list-inside">
                    <li>Patient has physically left the ward</li>
                    <li>Bed linen has been changed / bed is ready</li>
                    <li>Patient belongings have been collected</li>
                    <li>Discharge documents given to patient</li>
                  </ul>
                </div>
                {selectedAdmission.discharge_diagnosis && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Discharge Diagnosis (set by doctor)</Label>
                    <p className="text-sm bg-muted p-2 rounded mt-1">{selectedAdmission.discharge_diagnosis}</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCompleteDischargeDialog(false)} disabled={isCompletingDischarge}>
                  Cancel
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleCompleteDischarge}
                  disabled={isCompletingDischarge}
                >
                  {isCompletingDischarge
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <CheckCircle className="h-4 w-4 mr-2" />
                  }
                  Confirm — Patient Has Left
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Assign Bed Dialog */}
        {selectedAdmission && (
          <Dialog open={showAssignBedDialog} onOpenChange={setShowAssignBedDialog}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {selectedAdmission.bed_number ? 'Change Bed' : 'Assign Bed'}: {selectedAdmission.patient_name}
                </DialogTitle>
                <DialogDescription>
                  {selectedAdmission.bed_number
                    ? `Currently in Bed ${selectedAdmission.bed_number} — select a different bed in ${selectedAdmission.ward_name}`
                    : `Select an available bed in ${selectedAdmission.ward_name}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {availableBeds.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bed className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No available beds in this ward</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {availableBeds.map((bed) => (
                      <Button
                        key={bed.id}
                        variant="outline"
                        className="h-16 flex flex-col items-center justify-center"
                        disabled={isAssigningBed}
                        onClick={() => handleBedAssignment(bed.id)}
                      >
                        {isAssigningBed
                          ? <Loader2 className="h-5 w-5 mb-1 animate-spin" />
                          : <Bed className="h-5 w-5 mb-1" />
                        }
                        <span className="text-sm font-medium">Bed {bed.bed_number}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAssignBedDialog(false)}>Cancel</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

      </div>
    </DashboardLayout>
  );
}
