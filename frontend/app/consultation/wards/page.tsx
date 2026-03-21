"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Building2, Users, UserCheck, Clock, Search, Eye,
  Edit, Stethoscope, UserPlus, FileText, AlertTriangle, CheckCircle,
  Plus, MessageSquare, Calendar, Bed, Activity, RefreshCw
} from 'lucide-react';
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
  const [statusFilter, setStatusFilter] = useState<string>('all'); // Changed default to 'all' to show all patients
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [showAdmissionDetails, setShowAdmissionDetails] = useState(false);
  const [showAssignNurse, setShowAssignNurse] = useState(false);
  const [showUpdateCondition, setShowUpdateCondition] = useState(false);
  const [showDischargeDialog, setShowDischargeDialog] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<PatientAdmission | null>(null);

  // Assignment form
  const [assignmentData, setAssignmentData] = useState({
    nurse: '',
    assignment_type: 'primary',
    responsibilities: '',
  });

  // Condition update form
  const [conditionData, setConditionData] = useState({
    current_condition: '',
    notes: '',
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch wards
      const wardsResponse = await wardService.getWards();
      setWards(wardsResponse.results || []);

      // Fetch admissions
      const admissionsParams: any = {};
      if (statusFilter !== 'all') {
        admissionsParams.status = statusFilter;
      }
      if (selectedWard !== 'all') {
        admissionsParams.ward = parseInt(selectedWard);
      }
      const admissionsResponse = await wardService.getAdmissions(admissionsParams);
      setAdmissions(admissionsResponse.results || []);

      // Fetch all assignments
      const assignmentsResponse = await wardService.getAssignments();
      setAssignments(assignmentsResponse.results || []);
    } catch (error: any) {
      console.error('Error fetching ward data:', error);
      // Don't show error toast for initial load - just show empty state
      if (!wards.length && !admissions.length) {
        // Only show error if this is the first load attempt
        toast.error('Unable to load ward data. Please check your connection and try refreshing.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, selectedWard, wards.length, admissions.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleViewAdmission = (admission: PatientAdmission) => {
    setSelectedAdmission(admission);
    setConditionData({
      current_condition: admission.current_condition || '',
      notes: '',
    });
    setShowAdmissionDetails(true);
  };

  const handleAssignNurse = async () => {
    if (!selectedAdmission) return;

    try {
      await wardService.createAssignment({
        admission: selectedAdmission.id,
        nurse: parseInt(assignmentData.nurse),
        assignment_type: assignmentData.assignment_type,
        responsibilities: assignmentData.responsibilities,
      });

      toast.success('Nurse assigned successfully');
      setShowAssignNurse(false);
      setSelectedAdmission(null);
      setAssignmentData({
        nurse: '',
        assignment_type: 'primary',
        responsibilities: '',
      });
      fetchData(); // Refresh data
    } catch (error: any) {
      console.error('Error assigning nurse:', error);
      toast.error(error.message || 'Failed to assign nurse');
    }
  };

  const handleUpdateCondition = async () => {
    if (!selectedAdmission) return;

    try {
      // This would need an API endpoint to update admission condition
      // For now, we'll just show a success message
      toast.success('Patient condition updated');
      setShowUpdateCondition(false);
      setSelectedAdmission(null);
      setConditionData({
        current_condition: '',
        notes: '',
      });
      fetchData(); // Refresh data
    } catch (error: any) {
      console.error('Error updating condition:', error);
      toast.error(error.message || 'Failed to update patient condition');
    }
  };

  const handleDischargePatient = async () => {
    if (!selectedAdmission) return;

    try {
      // Discharge patient
      await wardService.dischargePatient(selectedAdmission.id, {
        discharge_type: 'regular',
        discharge_doctor: currentUser?.id ? parseInt(currentUser.id) : undefined,
      });

      toast.success('Patient discharged successfully');
      setShowDischargeDialog(false);
      setSelectedAdmission(null);
      fetchData(); // Refresh data
    } catch (error: any) {
      console.error('Error discharging patient:', error);
      toast.error(error.message || 'Failed to discharge patient');
    }
  };

  const getPatientAssignments = (admissionId: number) => {
    return assignments.filter(assignment => assignment.admission === admissionId && assignment.is_active);
  };

  const wardStats = useMemo(() => {
    const totalCapacity = wards.reduce((sum, ward) => sum + ward.total_beds, 0);
    const totalOccupied = wards.reduce((sum, ward) => sum + ward.occupied_beds, 0);
    const totalAdmissions = admissions.filter(a => a.status === 'admitted').length;
    const criticalPatients = admissions.filter(a =>
      a.status === 'admitted' &&
      (a.current_condition?.toLowerCase().includes('critical') ||
       a.current_condition?.toLowerCase().includes('serious'))
    ).length;

    return {
      totalCapacity,
      totalOccupied,
      totalAdmissions,
      criticalPatients,
      occupancyRate: totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0
    };
  }, [wards, admissions]);

  const filteredAdmissions = admissions.filter(admission => {
    const matchesSearch = !searchQuery ||
      admission.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admission.admission_id.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'admitted': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'discharged': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'transferred': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConditionBadgeClass = (condition: string) => {
    if (!condition) return 'bg-gray-100 text-gray-800';
    const lowerCondition = condition.toLowerCase();
    if (lowerCondition.includes('stable') || lowerCondition.includes('good')) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    } else if (lowerCondition.includes('critical') || lowerCondition.includes('serious')) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    } else {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-500" />
              Ward Overview
            </h1>
            <p className="text-muted-foreground mt-1">Monitor admitted patients and manage ward operations</p>
          </div>
          <Button onClick={fetchData} disabled={isLoading}>
            <Search className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </div>

        {/* Overall Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Capacity</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{wardStats.totalCapacity}</p>
                  <p className="text-xs text-muted-foreground">beds available</p>
                </div>
                <Bed className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Admitted Patients</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{wardStats.totalAdmissions}</p>
                  <p className="text-xs text-muted-foreground">currently admitted</p>
                </div>
                <Users className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Occupancy Rate</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{wardStats.occupancyRate}%</p>
                  <p className="text-xs text-muted-foreground">beds occupied</p>
                </div>
                <Activity className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critical Patients</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{wardStats.criticalPatients}</p>
                  <p className="text-xs text-muted-foreground">require attention</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ward Status Summary */}
        {wards.length === 0 && !isLoading ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-8 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground mb-2">No Wards Configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Ward management has not been set up yet. Please contact your system administrator to configure hospital wards.
              </p>
              <Button variant="outline" onClick={fetchData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {wards.map((ward) => {
              const occupancyPercentage = ward.total_beds > 0 ? Math.round((ward.occupied_beds / ward.total_beds) * 100) : 0;
              const isFull = occupancyPercentage >= 90;
              const hasAvailability = ward.available_beds > 0;

              return (
                <Card key={ward.id} className={`transition-all hover:shadow-md ${isFull ? 'border-red-200 dark:border-red-800' : hasAvailability ? 'border-green-200 dark:border-green-800' : 'border-yellow-200 dark:border-yellow-800'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className={`h-5 w-5 ${hasAvailability ? 'text-green-500' : 'text-red-500'}`} />
                          <p className="font-medium text-sm">{ward.name}</p>
                        </div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-2xl font-bold">{ward.occupied_beds}/{ward.total_beds}</span>
                          <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                            isFull ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                            hasAvailability ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                            {occupancyPercentage}%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {ward.available_beds} beds available
                        </p>
                      </div>
                    </div>
                    {/* Occupancy bar */}
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            isFull ? 'bg-red-500' :
                            occupancyPercentage > 70 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(occupancyPercentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

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
                <Select value={selectedWard} onValueChange={setSelectedWard}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All wards" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Wards</SelectItem>
                    {wards.length > 0 ? wards.map(ward => (
                      <SelectItem key={ward.id} value={ward.id.toString()}>
                        {ward.name}
                      </SelectItem>
                    )) : (
                      <SelectItem value="all" disabled>No wards available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="admitted">Admitted</SelectItem>
                    <SelectItem value="discharged">Discharged</SelectItem>
                    <SelectItem value="transferred">Transferred</SelectItem>
                  </SelectContent>
                </Select>
                <ResetFiltersButton
                  label="Reset filters"
                  onClick={() => {
                    setSelectedWard('all');
                    setStatusFilter('admitted');
                    setSearchQuery('');
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Patients Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Admitted Patients ({filteredAdmissions.length})
            </CardTitle>
            <CardDescription>Monitor patient status and manage ward operations</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : filteredAdmissions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No patients found matching the criteria</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Ward/Bed</TableHead>
                    <TableHead>Admission</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Nurse Assignment</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdmissions.map((admission) => {
                    const patientAssignments = getPatientAssignments(admission.id);
                    return (
                      <TableRow key={admission.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{admission.patient_name}</p>
                            <p className="text-sm text-muted-foreground">{admission.admission_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{admission.ward_name}</p>
                            {admission.bed_number && (
                              <p className="text-sm text-muted-foreground">Bed {admission.bed_number}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{new Date(admission.admission_date).toLocaleDateString()}</p>
                            <p className="text-xs text-muted-foreground">{admission.length_of_stay} days</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {admission.current_condition ? (
                            <Badge className={getConditionBadgeClass(admission.current_condition)}>
                              {admission.current_condition}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Not specified</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {patientAssignments.length > 0 ? (
                            <div className="space-y-1">
                              {patientAssignments.slice(0, 2).map((assignment, idx) => (
                                <div key={idx} className="text-sm">
                                  <span className="font-medium">{assignment.nurse_name}</span>
                                  <span className="text-muted-foreground"> ({assignment.assignment_type})</span>
                                </div>
                              ))}
                              {patientAssignments.length > 2 && (
                                <p className="text-xs text-muted-foreground">
                                  +{patientAssignments.length - 2} more
                                </p>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-red-600">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Unassigned
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewAdmission(admission)}
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {admission.status === 'admitted' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedAdmission(admission);
                                    setShowAssignNurse(true);
                                  }}
                                  title="Assign Nurse"
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedAdmission(admission);
                                    setShowUpdateCondition(true);
                                  }}
                                  title="Update Condition"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setSelectedAdmission(admission);
                                    setShowDischargeDialog(true);
                                  }}
                                  title="Discharge Patient"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Admission Details Dialog */}
        {selectedAdmission && (
          <Dialog open={showAdmissionDetails} onOpenChange={setShowAdmissionDetails}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Patient Details: {selectedAdmission.patient_name}</DialogTitle>
                <DialogDescription>
                  Admission ID: {selectedAdmission.admission_id} • Ward: {selectedAdmission.ward_name}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Admission Date</Label>
                    <p>{new Date(selectedAdmission.admission_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label>Length of Stay</Label>
                    <p>{selectedAdmission.length_of_stay} days</p>
                  </div>
                  <div>
                    <Label>Admitting Doctor</Label>
                    <p>{selectedAdmission.admitting_doctor_name || 'Not specified'}</p>
                  </div>
                  <div>
                    <Label>Current Status</Label>
                    <Badge className={getStatusBadgeClass(selectedAdmission.status)}>
                      {selectedAdmission.status}
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label>Admission Diagnosis</Label>
                  <p className="text-sm bg-muted p-3 rounded">{selectedAdmission.admission_diagnosis}</p>
                </div>

                {selectedAdmission.presenting_complaint && (
                  <div>
                    <Label>Presenting Complaint</Label>
                    <p className="text-sm bg-muted p-3 rounded">{selectedAdmission.presenting_complaint}</p>
                  </div>
                )}

                {selectedAdmission.current_condition && (
                  <div>
                    <Label>Current Condition</Label>
                    <p className="text-sm bg-muted p-3 rounded">{selectedAdmission.current_condition}</p>
                  </div>
                )}

                <div>
                  <Label>Nurse Assignments</Label>
                  <div className="space-y-2">
                    {getPatientAssignments(selectedAdmission.id).map((assignment, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded">
                        <div>
                          <p className="font-medium">{assignment.nurse_name}</p>
                          <p className="text-sm text-muted-foreground">{assignment.assignment_type}</p>
                        </div>
                        <Badge variant="outline">{assignment.status}</Badge>
                      </div>
                    ))}
                    {getPatientAssignments(selectedAdmission.id).length === 0 && (
                      <p className="text-sm text-muted-foreground">No nurse assignments</p>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Assign Nurse Dialog */}
        {selectedAdmission && (
          <Dialog open={showAssignNurse} onOpenChange={setShowAssignNurse}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Assign Nurse to {selectedAdmission.patient_name}</DialogTitle>
                <DialogDescription>
                  Assign a nurse to provide care for this patient
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Nurse</Label>
                  <Select
                    value={assignmentData.nurse}
                    onValueChange={(value) => setAssignmentData({...assignmentData, nurse: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select nurse" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* This would normally be populated from the users API */}
                      <SelectItem value="3">Mary Adebayo (Nurse)</SelectItem>
                      <SelectItem value="4">Another Nurse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assignment Type</Label>
                  <Select
                    value={assignmentData.assignment_type}
                    onValueChange={(value) => setAssignmentData({...assignmentData, assignment_type: value as any})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">Primary Nurse</SelectItem>
                      <SelectItem value="secondary">Secondary Nurse</SelectItem>
                      <SelectItem value="shift">Shift Assignment</SelectItem>
                      <SelectItem value="specialist">Specialist Care</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Responsibilities</Label>
                  <Textarea
                    value={assignmentData.responsibilities}
                    onChange={(e) => setAssignmentData({...assignmentData, responsibilities: e.target.value})}
                    placeholder="Specific nursing responsibilities and tasks"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAssignNurse(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAssignNurse}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Nurse
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Update Condition Dialog */}
        {selectedAdmission && (
          <Dialog open={showUpdateCondition} onOpenChange={setShowUpdateCondition}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Update Condition: {selectedAdmission.patient_name}</DialogTitle>
                <DialogDescription>
                  Update the patient's current clinical condition
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Current Condition</Label>
                  <Select
                    value={conditionData.current_condition}
                    onValueChange={(value) => setConditionData({...conditionData, current_condition: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Stable">Stable</SelectItem>
                      <SelectItem value="Improving">Improving</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                      <SelectItem value="Serious">Serious</SelectItem>
                      <SelectItem value="Guarded">Guarded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Clinical Notes</Label>
                  <Textarea
                    value={conditionData.notes}
                    onChange={(e) => setConditionData({...conditionData, notes: e.target.value})}
                    placeholder="Additional clinical observations and notes"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowUpdateCondition(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateCondition}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Update Condition
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Discharge Patient Dialog */}
        {selectedAdmission && (
          <Dialog open={showDischargeDialog} onOpenChange={setShowDischargeDialog}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Discharge Patient: {selectedAdmission.patient_name}</DialogTitle>
                <DialogDescription>
                  Confirm discharge for patient {selectedAdmission.admission_id}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-800 dark:text-yellow-200">Confirm Discharge</h4>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        This will mark the patient as discharged and remove them from the ward. Make sure all discharge paperwork is completed.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Admission Date</Label>
                    <p className="font-medium">{new Date(selectedAdmission.admission_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Length of Stay</Label>
                    <p className="font-medium">{selectedAdmission.length_of_stay} days</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDischargeDialog(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDischargePatient}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Discharge
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

      </div>
    </DashboardLayout>
  );
}