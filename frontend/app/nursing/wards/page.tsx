"use client";

import { useState, useEffect, useCallback } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2, Users, UserCheck, Clock, Search, Filter,
  Eye, Edit, CheckCircle, XCircle, AlertTriangle, Calendar,
  Thermometer, Syringe, FileText, Bed, DoorOpen, Stethoscope, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { wardService, type Ward, type PatientAdmission, type WardAssignment } from '@/lib/services/ward-service';
import { useCurrentUser } from '@/hooks/use-current-user';

export default function WardManagementPage() {
  const { currentUser } = useCurrentUser();
  const [wards, setWards] = useState<Ward[]>([]);
  const [admissions, setAdmissions] = useState<PatientAdmission[]>([]);
  const [assignments, setAssignments] = useState<WardAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedWard, setSelectedWard] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [showAdmissionDetails, setShowAdmissionDetails] = useState(false);
  const [showDischargeDialog, setShowDischargeDialog] = useState(false);
  const [showAssignBedDialog, setShowAssignBedDialog] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<PatientAdmission | null>(null);
  const [availableBeds, setAvailableBeds] = useState<any[]>([]);

  // Discharge form
  const [dischargeData, setDischargeData] = useState({
    discharge_type: 'regular',
    discharge_diagnosis: '',
    discharge_notes: '',
    discharge_summary: '',
    follow_up_instructions: ''
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

      // Fetch assignments for current nurse (only if user has nurse role)
      if (currentUser?.id) {
        try {
          const assignmentsResponse = await wardService.getAssignments({
            nurse: Number(currentUser.id),
            status: 'active'
          });
          setAssignments(assignmentsResponse.results || []);
        } catch (assignmentError: any) {
          // If user doesn't have nurse permissions, just set empty assignments
          console.warn('Could not fetch ward assignments for current user:', assignmentError);
          setAssignments([]);
        }
      }
    } catch (error: any) {
      console.error('Error fetching ward data:', error);
      toast.error(error.message || 'Failed to load ward data');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, statusFilter, selectedWard]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleViewAdmission = (admission: PatientAdmission) => {
    setSelectedAdmission(admission);
    setShowAdmissionDetails(true);
  };

  const handleAssignBed = async (admission: PatientAdmission) => {
    setSelectedAdmission(admission);
    setShowAssignBedDialog(true);

    try {
      // Fetch available beds for this ward
      const bedsResponse = await wardService.getBeds({
        ward: admission.ward,
        status: 'available'
      });
      setAvailableBeds(bedsResponse.results || []);
    } catch (error) {
      console.error('Error fetching available beds:', error);
      setAvailableBeds([]);
    }
  };

  const handleBedAssignment = async (bedId: number) => {
    if (!selectedAdmission) return;

    try {
      await wardService.assignBed(bedId, selectedAdmission.id);
      toast.success('Bed assigned successfully');
      setShowAssignBedDialog(false);
      setSelectedAdmission(null);
      fetchData(); // Refresh data
    } catch (error: any) {
      console.error('Error assigning bed:', error);
      toast.error(error.message || 'Failed to assign bed');
    }
  };

  const handleDischargePatient = async () => {
    if (!selectedAdmission) return;

    // Validate required fields
    if (!dischargeData.discharge_diagnosis.trim()) {
      toast.error('Discharge diagnosis is required');
      return;
    }

    try {
      await wardService.dischargePatient(selectedAdmission.id, {
        discharge_type: dischargeData.discharge_type,
        discharge_doctor: currentUser?.id ? Number(currentUser.id) : undefined,
        discharge_diagnosis: dischargeData.discharge_diagnosis,
        discharge_notes: dischargeData.discharge_notes,
        discharge_summary: dischargeData.discharge_summary,
        follow_up_instructions: dischargeData.follow_up_instructions,
      });

      toast.success('Patient discharged successfully');
      setShowDischargeDialog(false);
      setSelectedAdmission(null);
      setDischargeData({
        discharge_type: 'regular',
        discharge_diagnosis: '',
        discharge_notes: '',
        discharge_summary: '',
        follow_up_instructions: ''
      });
      fetchData(); // Refresh data
    } catch (error: any) {
      console.error('Error discharging patient:', error);
      toast.error(error.message || 'Failed to discharge patient');
    }
  };

  const filteredAdmissions = admissions.filter(admission => {
    const matchesSearch = !searchQuery ||
      admission.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admission.admission_id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || admission.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'admitted': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'discharged': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'transferred': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAdmissionTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'emergency': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'elective': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'transfer': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const getStatusTitle = (status: string) => {
    switch (status) {
      case 'admitted': return 'Admitted Patients';
      case 'discharged': return 'Discharged Patients';
      case 'transferred': return 'Transferred Patients';
      case 'all': return 'All Patients';
      default: return 'Patients';
    }
  };

  const getStatusDescription = (status: string) => {
    switch (status) {
      case 'admitted': return 'Manage currently admitted patients';
      case 'discharged': return 'View recently discharged patients';
      case 'transferred': return 'View transferred patients';
      case 'all': return 'View all patient records';
      default: return 'Manage patient records';
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-500" />
              Ward Management
            </h1>
            <p className="text-muted-foreground mt-1">Manage admitted patients and ward operations</p>
          </div>
          <Button onClick={fetchData} disabled={isLoading}>
            <Search className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </div>

        {/* Ward Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {wards.map((ward) => (
            <Card key={ward.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{ward.name}</p>
                    <p className="text-2xl font-bold">{ward.occupied_beds}/{ward.total_beds}</p>
                    <p className="text-xs text-muted-foreground">{ward.occupancy_rate}% occupied</p>
                  </div>
                  <Bed className={`h-8 w-8 ${ward.available_beds > 0 ? 'text-green-500' : 'text-red-500'}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Ward Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Capacity</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {wards.reduce((sum, ward) => sum + ward.total_beds, 0)}
                  </p>
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
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {admissions.filter(a => a.status === 'admitted').length}
                  </p>
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
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {wards.length > 0 ?
                      Math.round((wards.reduce((sum, ward) => sum + ward.occupied_beds, 0) /
                                 wards.reduce((sum, ward) => sum + ward.total_beds, 0)) * 100) : 0
                    }%
                  </p>
                </div>
                <Activity className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Discharged Today</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {admissions.filter(a => {
                      if (a.status !== 'discharged' || !a.discharge_date) return false;
                      const dischargeDate = new Date(a.discharge_date);
                      const today = new Date();
                      return dischargeDate.toDateString() === today.toDateString();
                    }).length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Ward</Label>
                <Select value={selectedWard} onValueChange={setSelectedWard}>
                  <SelectTrigger>
                    <SelectValue placeholder="All wards" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Wards</SelectItem>
                    {wards.map(ward => (
                      <SelectItem key={ward.id} value={ward.id.toString()}>
                        {ward.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="admitted">Admitted</SelectItem>
                    <SelectItem value="discharged">Discharged</SelectItem>
                    <SelectItem value="transferred">Transferred</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Search</Label>
                <Input
                  placeholder="Search by patient name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => {
                  setSelectedWard('all');
                  setStatusFilter('all');
                  setSearchQuery('');
                }}>
                  <Filter className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Tabs defaultValue="patients" className="space-y-4">
          <TabsList>
            <TabsTrigger value="patients">{getStatusTitle(statusFilter)}</TabsTrigger>
            <TabsTrigger value="assignments">My Assignments</TabsTrigger>
            <TabsTrigger value="wards">Ward Overview</TabsTrigger>
          </TabsList>

          <TabsContent value="patients" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{getStatusTitle(statusFilter)} ({filteredAdmissions.length})</CardTitle>
                <CardDescription>{getStatusDescription(statusFilter)}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : filteredAdmissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No {statusFilter === 'all' ? 'patients' : statusFilter.toLowerCase()} patients found</p>
                    {searchQuery && (
                      <p className="text-sm mt-1">Try adjusting your search terms or clearing filters</p>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Ward/Bed</TableHead>
                        <TableHead>Admission Type</TableHead>
                        <TableHead>Diagnosis</TableHead>
                        <TableHead>Days Admitted</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAdmissions.map((admission) => (
                        <TableRow key={admission.id} className={admission.status === 'discharged' ? 'opacity-75 bg-gray-50 dark:bg-gray-900/50' : ''}>
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
                            <Badge className={getAdmissionTypeBadgeClass(admission.admission_type)}>
                              {admission.admission_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[200px]">
                              {admission.admission_diagnosis && !admission.admission_diagnosis.startsWith('Admitted to ') ? (
                                <p className="text-sm truncate" title={admission.admission_diagnosis}>
                                  {admission.admission_diagnosis}
                                </p>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  No diagnosis
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{admission.length_of_stay} days</TableCell>
                          <TableCell>
                            <Badge className={getStatusBadgeClass(admission.status)}>
                              {admission.status}
                            </Badge>
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
                              {admission.status === 'admitted' && !admission.bed_number && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAssignBed(admission)}
                                  title="Assign Bed"
                                >
                                  <Bed className="h-4 w-4" />
                                </Button>
                              )}
                              {admission.status === 'admitted' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedAdmission(admission);
                                    setShowDischargeDialog(true);
                                  }}
                                  title="Discharge"
                                >
                                  <DoorOpen className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assignments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>My Assignments ({assignments.length})</CardTitle>
                <CardDescription>Patients assigned to you for care</CardDescription>
              </CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No active assignments</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {assignments.map((assignment) => (
                      <Card key={assignment.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-medium">{assignment.patient_name}</h3>
                              <p className="text-sm text-muted-foreground">{assignment.ward_name}</p>
                              <Badge className="mt-2" variant="outline">
                                {assignment.assignment_type}
                              </Badge>
                              {assignment.responsibilities && (
                                <p className="text-sm mt-2">{assignment.responsibilities}</p>
                              )}
                            </div>
                            <Button size="sm" variant="outline">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wards" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              {wards.map((ward) => (
                <Card key={ward.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {ward.name}
                      <Badge variant={ward.status === 'active' ? 'default' : 'secondary'}>
                        {ward.status}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{ward.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Capacity</p>
                        <p className="text-2xl font-bold">{ward.occupied_beds}/{ward.total_beds}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Occupancy</p>
                        <p className="text-2xl font-bold">{ward.occupancy_rate}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Admission Details Dialog */}
        {selectedAdmission && (
          <Dialog open={showAdmissionDetails} onOpenChange={setShowAdmissionDetails}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Admission Details: {selectedAdmission.admission_id}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Patient</Label>
                    <p className="font-medium">{selectedAdmission.patient_name}</p>
                  </div>
                  <div>
                    <Label>Ward</Label>
                    <p className="font-medium">{selectedAdmission.ward_name}</p>
                  </div>
                  <div>
                    <Label>Admission Date</Label>
                    <p>{new Date(selectedAdmission.admission_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label>Days Admitted</Label>
                    <p>{selectedAdmission.length_of_stay} days</p>
                  </div>
                </div>
                <div>
                  <Label>Admission Diagnosis</Label>
                  <p className="text-sm bg-muted p-2 rounded">{selectedAdmission.admission_diagnosis}</p>
                </div>
                {selectedAdmission.presenting_complaint && (
                  <div>
                    <Label>Presenting Complaint</Label>
                    <p className="text-sm bg-muted p-2 rounded">{selectedAdmission.presenting_complaint}</p>
                  </div>
                )}
                {selectedAdmission.current_condition && (
                  <div>
                    <Label>Current Condition</Label>
                    <p className="text-sm bg-muted p-2 rounded">{selectedAdmission.current_condition}</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Discharge Dialog */}
        {selectedAdmission && (
          <Dialog open={showDischargeDialog} onOpenChange={setShowDischargeDialog}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Discharge Patient: {selectedAdmission.patient_name}</DialogTitle>
                <DialogDescription>
                  Complete patient discharge from {selectedAdmission.ward_name}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Discharge Type</Label>
                    <Select
                      value={dischargeData.discharge_type}
                      onValueChange={(value) => setDischargeData({...dischargeData, discharge_type: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular Discharge</SelectItem>
                        <SelectItem value="against_medical_advice">Against Medical Advice</SelectItem>
                        <SelectItem value="transfer">Transfer to Another Facility</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Discharge Diagnosis</Label>
                    <Input
                      value={dischargeData.discharge_diagnosis}
                      onChange={(e) => setDischargeData({...dischargeData, discharge_diagnosis: e.target.value})}
                      placeholder="Final diagnosis"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Discharge Notes</Label>
                  <Textarea
                    value={dischargeData.discharge_notes}
                    onChange={(e) => setDischargeData({...dischargeData, discharge_notes: e.target.value})}
                    placeholder="Clinical notes for discharge"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Discharge Summary</Label>
                  <Textarea
                    value={dischargeData.discharge_summary}
                    onChange={(e) => setDischargeData({...dischargeData, discharge_summary: e.target.value})}
                    placeholder="Comprehensive discharge summary"
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Follow-up Instructions</Label>
                  <Textarea
                    value={dischargeData.follow_up_instructions}
                    onChange={(e) => setDischargeData({...dischargeData, follow_up_instructions: e.target.value})}
                    placeholder="Instructions for follow-up care"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDischargeDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleDischargePatient} className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Discharge Patient
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
                <DialogTitle>Assign Bed: {selectedAdmission.patient_name}</DialogTitle>
                <DialogDescription>
                  Assign a bed in {selectedAdmission.ward_name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {availableBeds.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bed className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No available beds in this ward</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {availableBeds.map((bed) => (
                      <Button
                        key={bed.id}
                        variant="outline"
                        className="h-16 flex flex-col items-center justify-center"
                        onClick={() => handleBedAssignment(bed.id)}
                      >
                        <Bed className="h-6 w-6 mb-1" />
                        <span className="text-sm font-medium">Bed {bed.bed_number}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAssignBedDialog(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}