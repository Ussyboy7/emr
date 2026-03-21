"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarDays, Clock, User, Stethoscope, Building2, Plus, Search,
  Edit, Trash2, CheckCircle, XCircle, AlertCircle, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, MoreHorizontal, Eye, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { appointmentService, type Appointment } from "@/lib/services/appointment-service";
import { patientService } from "@/lib/services/patient-service";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Patient {
  id: number;
  patient_id: string;
  full_name?: string;
  age?: number;
  gender?: string;
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(10);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    patient: "",
    appointment_type: "consultation" as Appointment['appointment_type'],
    appointment_date: "",
    appointment_time: "09:00",
    duration_minutes: 30,
    reason: "",
    notes: "",
  });

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = {
        page: currentPage,
        page_size: pageSize,
      };

      if (searchQuery) params.search = searchQuery;
      if (statusFilter !== "all") params.status = statusFilter;
      if (typeFilter !== "all") params.appointment_type = typeFilter;
      if (dateFilter) params.appointment_date = format(dateFilter, "yyyy-MM-dd");

      const response = await appointmentService.getAppointments(params);
      setAppointments(response.results || []);
      setTotalPages(Math.ceil((response.count || 0) / pageSize));
    } catch (error: any) {
      console.error("Error fetching appointments:", error);
      toast.error(error.message || "Failed to load appointments");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, statusFilter, typeFilter, dateFilter]);

  const fetchPatients = useCallback(async () => {
    try {
      const response = await patientService.getPatients({ page_size: 100 });
      setPatients(response.results || []);
    } catch (error) {
      console.error("Error fetching patients:", error);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const resetForm = () => {
    setFormData({
      patient: "",
      appointment_type: "consultation",
      appointment_date: "",
      appointment_time: "09:00",
      duration_minutes: 30,
      reason: "",
      notes: "",
    });
  };

  const handleCreateAppointment = async () => {
    try {
      const appointmentData = {
        patient: parseInt(formData.patient),
        appointment_type: formData.appointment_type,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
        duration_minutes: formData.duration_minutes,
        reason: formData.reason || undefined,
        notes: formData.notes || undefined,
      };

      await appointmentService.createAppointment(appointmentData);
      toast.success("Appointment created successfully");
      setShowCreateDialog(false);
      resetForm();
      fetchAppointments();
    } catch (error: any) {
      console.error("Error creating appointment:", error);
      toast.error(error.message || "Failed to create appointment");
    }
  };

  const handleUpdateAppointment = async () => {
    if (!selectedAppointment) return;

    try {
      const appointmentData = {
        appointment_type: formData.appointment_type,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
        duration_minutes: formData.duration_minutes,
        reason: formData.reason || undefined,
        notes: formData.notes || undefined,
        status: selectedAppointment.status,
      };

      await appointmentService.updateAppointment(selectedAppointment.id, appointmentData);
      toast.success("Appointment updated successfully");
      setShowEditDialog(false);
      setSelectedAppointment(null);
      resetForm();
      fetchAppointments();
    } catch (error: any) {
      console.error("Error updating appointment:", error);
      toast.error(error.message || "Failed to update appointment");
    }
  };

  const handleDeleteAppointment = async (appointment: Appointment) => {
    if (!confirm(`Are you sure you want to delete the appointment for ${appointment.patient_name}?`)) {
      return;
    }

    try {
      await appointmentService.deleteAppointment(appointment.id);
      toast.success("Appointment deleted successfully");
      fetchAppointments();
    } catch (error: any) {
      console.error("Error deleting appointment:", error);
      toast.error(error.message || "Failed to delete appointment");
    }
  };

  const handleStatusChange = async (appointment: Appointment, newStatus: Appointment['status']) => {
    try {
      if (newStatus === 'confirmed') {
        await appointmentService.confirmAppointment(appointment.id);
      } else if (newStatus === 'cancelled') {
        await appointmentService.cancelAppointment(appointment.id);
      } else {
        await appointmentService.updateAppointment(appointment.id, { status: newStatus });
      }

      toast.success(`Appointment ${newStatus} successfully`);
      fetchAppointments();
    } catch (error: any) {
      console.error("Error updating appointment status:", error);
      toast.error(error.message || "Failed to update appointment status");
    }
  };

  const openEditDialog = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setFormData({
      patient: appointment.patient.toString(),
      appointment_type: appointment.appointment_type,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      duration_minutes: appointment.duration_minutes,
      reason: appointment.reason || "",
      notes: appointment.notes || "",
    });
    setShowEditDialog(true);
  };

  const openViewDialog = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setShowViewDialog(true);
  };

  const getStatusBadgeClass = (status: Appointment['status']) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'confirmed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'no_show': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeBadgeClass = (type: Appointment['appointment_type']) => {
    switch (type) {
      case 'consultation': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'follow_up': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'emergency': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'procedure': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'routine': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <a href="/medical-records" className="hover:text-primary">Medical Records</a>
          <span>/</span>
          <span>Appointments</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <CalendarDays className="h-8 w-8 text-blue-500" />
              Appointments Management
            </h1>
            <p className="text-muted-foreground mt-1">Schedule and manage patient appointments</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchAppointments} disabled={isLoading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              New Appointment
            </Button>
          </div>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by patient name, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="no_show">No Show</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="procedure">Procedure</SelectItem>
                    <SelectItem value="routine">Routine</SelectItem>
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 w-[min(100%,220px)] justify-start text-left font-normal shrink-0",
                        !dateFilter && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">{dateFilter ? format(dateFilter, "PPP") : "Pick a date"}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFilter}
                      onSelect={setDateFilter}
                      initialFocus
                    />
                    <div className="p-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDateFilter(undefined)}
                        className="w-full"
                      >
                        Clear Date
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <ResetFiltersButton
                  label="Clear filters and refresh"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    setTypeFilter("all");
                    setDateFilter(undefined);
                    setCurrentPage(1);
                    fetchAppointments();
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appointments Table */}
        <Card>
          <CardHeader>
            <CardTitle>Appointments ({appointments.length})</CardTitle>
            <CardDescription>
              Manage patient appointments and schedules
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                <p className="ml-3 text-muted-foreground">Loading appointments...</p>
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-12 bg-muted/50 rounded-lg border-2 border-dashed border-border">
                <CalendarDays className="h-12 w-12 mx-auto mb-3 text-blue-500 opacity-60" />
                <p className="font-medium text-foreground mb-1">No appointments found</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery || statusFilter !== "all" || typeFilter !== "all" || dateFilter
                    ? "Try adjusting your filters"
                    : "Create your first appointment to get started"}
                </p>
                {!searchQuery && statusFilter === "all" && typeFilter === "all" && !dateFilter && (
                  <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Appointment
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Doctor</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((appointment) => (
                      <TableRow key={appointment.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{appointment.patient_name}</div>
                            <div className="text-sm text-muted-foreground">ID: {appointment.appointment_id}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getTypeBadgeClass(appointment.appointment_type)}>
                            {appointment.appointment_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            <span>{format(new Date(appointment.appointment_date), "MMM dd, yyyy")}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{appointment.appointment_time} ({appointment.duration_minutes}min)</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeClass(appointment.status)}>
                            {appointment.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {appointment.doctor_name || "Not assigned"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openViewDialog(appointment)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(appointment)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Select
                              value=""
                              onValueChange={(value) => handleStatusChange(appointment, value as Appointment['status'])}
                            >
                              <SelectTrigger className="w-8 h-8 p-0 border-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </SelectTrigger>
                              <SelectContent>
                                {appointment.status !== 'confirmed' && (
                                  <SelectItem value="confirmed">
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Confirm
                                  </SelectItem>
                                )}
                                {appointment.status !== 'completed' && (
                                  <SelectItem value="completed">
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Complete
                                  </SelectItem>
                                )}
                                {appointment.status !== 'cancelled' && (
                                  <SelectItem value="cancelled">
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Cancel
                                  </SelectItem>
                                )}
                                {appointment.status !== 'no_show' && (
                                  <SelectItem value="no_show">
                                    <AlertCircle className="h-4 w-4 mr-2" />
                                    No Show
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAppointment(appointment)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {appointments.length} of {appointments.length} appointments
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Create Appointment Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-500" />
                Create New Appointment
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="patient">Patient *</Label>
                  <Select value={formData.patient} onValueChange={(value) => setFormData({ ...formData, patient: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select patient" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id.toString()}>
                          {patient.full_name || 'Unknown'} ({patient.patient_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Appointment Type *</Label>
                  <Select value={formData.appointment_type} onValueChange={(value) => setFormData({ ...formData, appointment_type: value as Appointment['appointment_type'] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consultation">Consultation</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                      <SelectItem value="procedure">Procedure</SelectItem>
                      <SelectItem value="routine">Routine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.appointment_date}
                    onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time *</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.appointment_time}
                    onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (min)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 30 })}
                    min="15"
                    max="480"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="e.g., Annual checkup, follow-up consultation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes or special instructions"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleCreateAppointment} disabled={!formData.patient || !formData.appointment_date}>
                Create Appointment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Appointment Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-500" />
                Edit Appointment
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-patient">Patient</Label>
                  <Select value={formData.patient} onValueChange={(value) => setFormData({ ...formData, patient: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id.toString()}>
                          {patient.full_name || 'Unknown'} ({patient.patient_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-type">Appointment Type</Label>
                  <Select value={formData.appointment_type} onValueChange={(value) => setFormData({ ...formData, appointment_type: value as Appointment['appointment_type'] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consultation">Consultation</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                      <SelectItem value="procedure">Procedure</SelectItem>
                      <SelectItem value="routine">Routine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={formData.appointment_date}
                    onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-time">Time</Label>
                  <Input
                    id="edit-time"
                    type="time"
                    value={formData.appointment_time}
                    onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-duration">Duration (min)</Label>
                  <Input
                    id="edit-duration"
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 30 })}
                    min="15"
                    max="480"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-reason">Reason</Label>
                <Input
                  id="edit-reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="e.g., Annual checkup, follow-up consultation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes or special instructions"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowEditDialog(false); setSelectedAppointment(null); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleUpdateAppointment}>
                Update Appointment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Appointment Dialog */}
        <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-500" />
                Appointment Details
              </DialogTitle>
            </DialogHeader>
            {selectedAppointment && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Appointment ID</Label>
                    <p className="font-medium">{selectedAppointment.appointment_id}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                    <div className="mt-1">
                      <Badge className={getStatusBadgeClass(selectedAppointment.status)}>
                        {selectedAppointment.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Patient</Label>
                    <p className="font-medium">{selectedAppointment.patient_name}</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Type</Label>
                    <div className="mt-1">
                      <Badge variant="outline" className={getTypeBadgeClass(selectedAppointment.appointment_type)}>
                        {selectedAppointment.appointment_type.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Date</Label>
                      <p>{format(new Date(selectedAppointment.appointment_date), "PPP")}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Time</Label>
                      <p>{selectedAppointment.appointment_time} ({selectedAppointment.duration_minutes} min)</p>
                    </div>
                  </div>

                  {selectedAppointment.doctor_name && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Doctor</Label>
                      <p>{selectedAppointment.doctor_name}</p>
                    </div>
                  )}

                  {selectedAppointment.reason && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Reason</Label>
                      <p>{selectedAppointment.reason}</p>
                    </div>
                  )}

                  {selectedAppointment.notes && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Notes</Label>
                      <p className="whitespace-pre-wrap">{selectedAppointment.notes}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                      <p className="text-sm">{format(new Date(selectedAppointment.created_at), "PPp")}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                      <p className="text-sm">{format(new Date(selectedAppointment.updated_at), "PPp")}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowViewDialog(false); setSelectedAppointment(null); }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}