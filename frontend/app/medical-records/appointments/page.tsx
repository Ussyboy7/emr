"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CustomDateRangeButton } from "@/components/shared/CustomDateRangeButton";
import { AdvancedDateRangeDialog } from "@/components/shared/AdvancedDateRangeDialog";
import { DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import {
  formatDisplayDate,
  formatDisplayDateMedium,
  formatDisplayDateTime,
  localMonthBounds,
  localWeekToTodayBounds,
  todayApiDateString,
} from "@/lib/dates";
import {
  CalendarDays,
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Search,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  CheckCircle2,
  Loader2,
  Calendar,
  X,
  Stethoscope,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { appointmentService, type Appointment } from "@/lib/services/appointment-service";
import { patientService, adminService, type Patient as ApiPatient } from "@/lib/services";
import { useOutpatientClinicTypes } from "@/hooks/use-outpatient-clinic-types";
import { useClinic } from "@/hooks/use-clinic";

/** Deep link to New Visit with patient + appointment date/time/type prefilled */
function buildScheduleVisitHref(a: Appointment): string {
  const pid = a.patient_code ?? String(a.patient);
  const params = new URLSearchParams();
  params.set("patient", pid);
  if (a.appointment_date) params.set("date", a.appointment_date);
  const t =
    a.appointment_time && a.appointment_time.length >= 5
      ? a.appointment_time.slice(0, 5)
      : "09:00";
  params.set("time", t);
  if (a.appointment_type) params.set("visit_type", a.appointment_type);
  return `/medical-records/visits/new?${params.toString()}`;
}

function canScheduleVisitFromAppointment(a: Appointment): boolean {
  return ["scheduled", "confirmed", "in_progress"].includes(a.status);
}

function appointmentClinicsForForm(a: Appointment): string[] {
  if (a.clinics && a.clinics.length > 0) return a.clinics;
  if (a.clinic_name) return [a.clinic_name];
  return [];
}

function formatAppointmentClinics(a: Appointment): string {
  if (a.clinics && a.clinics.length > 0) return a.clinics.join(", ");
  return a.clinic_name || "No clinic";
}

export default function AppointmentsPage() {
  const { names: opdClinicNames } = useOutpatientClinicTypes();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  /** Preset row — same options as Manage Visits */
  /** Default to all dates so future follow-ups from consultation are visible without changing filters */
  const [datePreset, setDatePreset] = useState<string>("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [clinicFilter, setClinicFilter] = useState("all");
  const { isMultiClinic } = useClinic();
  const [clinicOptions, setClinicOptions] = useState<{ id: number; name: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [statsData, setStatsData] = useState({
    total: 0,
    scheduled: 0,
    confirmed: 0,
    inProgress: 0,
  });

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    appointment_type: "consultation" as Appointment["appointment_type"],
    clinics: [] as string[],
    appointment_date: "",
    appointment_time: "09:00",
    duration_minutes: 30,
    reason: "",
    notes: "",
  });

  const [createPatientSearch, setCreatePatientSearch] = useState("");
  const [createPatientResults, setCreatePatientResults] = useState<ApiPatient[]>([]);
  const [createPatientSearching, setCreatePatientSearching] = useState(false);
  const [selectedCreatePatient, setSelectedCreatePatient] = useState<ApiPatient | null>(null);
  const createPatientSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!showCreateDialog) {
      return;
    }
    const q = createPatientSearch.trim();
    if (createPatientSearchTimeoutRef.current) {
      clearTimeout(createPatientSearchTimeoutRef.current);
      createPatientSearchTimeoutRef.current = null;
    }
    if (!q) {
      setCreatePatientResults([]);
      setCreatePatientSearching(false);
      return;
    }
    setCreatePatientSearching(true);
    createPatientSearchTimeoutRef.current = setTimeout(async () => {
      createPatientSearchTimeoutRef.current = null;
      try {
        const res = await patientService.getPatients({ search: q, page_size: DEFAULT_LIST_PAGE_SIZE });
        setCreatePatientResults(res.results || []);
      } catch (e: any) {
        toast.error(e?.message || "Patient search failed");
        setCreatePatientResults([]);
      } finally {
        setCreatePatientSearching(false);
      }
    }, 300);
    return () => {
      if (createPatientSearchTimeoutRef.current) {
        clearTimeout(createPatientSearchTimeoutRef.current);
      }
    };
  }, [createPatientSearch, showCreateDialog]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, statusFilter, typeFilter, datePreset, dateRange.from, dateRange.to, clinicFilter]);

  const buildAppointmentDateParams = useCallback(() => {
    let appointment_date: string | undefined;
    let start_date: string | undefined;
    let end_date: string | undefined;

    if (dateRange.from || dateRange.to) {
      start_date = dateRange.from || undefined;
      end_date = dateRange.to || undefined;
    } else if (datePreset === "today") {
      appointment_date = todayApiDateString();
    } else if (datePreset === "week") {
      const week = localWeekToTodayBounds();
      start_date = week.start;
      end_date = week.end;
    } else if (datePreset === "month") {
      const month = localMonthBounds();
      start_date = month.start;
      end_date = todayApiDateString();
    }

    return { appointment_date, start_date, end_date };
  }, [datePreset, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = useCallback(() => {
    setDateRange({ from: "", to: "" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminService.getClinics({ page_size: MAX_LIST_PAGE_SIZE, is_active: true });
        if (cancelled) return;
        setClinicOptions((res.results || []).map((c) => ({ id: c.id, name: c.name })));
      } catch {
        if (!cancelled) setClinicOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page: currentPage,
        page_size: pageSize,
      };

      if (debouncedSearchQuery) params.search = debouncedSearchQuery;
      if (statusFilter !== "all") params.status = statusFilter;
      if (typeFilter !== "all") params.appointment_type = typeFilter;
      if (!isMultiClinic && clinicFilter !== "all") params.clinic = Number(clinicFilter);

      const { appointment_date, start_date, end_date } = buildAppointmentDateParams();
      if (appointment_date) params.appointment_date = appointment_date;
      if (start_date) params.start_date = start_date;
      if (end_date) params.end_date = end_date;

      const response = await appointmentService.getAppointments(params);
      setAppointments(response.results || []);
      const count = response.count ?? 0;
      setTotalCount(count);
      setTotalPages(Math.max(1, Math.ceil(count / pageSize)));
    } catch (error: any) {
      console.error("Error fetching appointments:", error);
      toast.error(error.message || "Failed to load appointments");
    } finally {
      setIsLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    debouncedSearchQuery,
    statusFilter,
    typeFilter,
    clinicFilter,
    buildAppointmentDateParams,
  ]);

  const loadStats = useCallback(async () => {
    try {
      const { appointment_date, start_date, end_date } = buildAppointmentDateParams();

      const stats = await appointmentService.getListStats({
        search: debouncedSearchQuery || undefined,
        appointment_type: typeFilter !== "all" ? typeFilter : undefined,
        clinic: !isMultiClinic && clinicFilter !== "all" ? Number(clinicFilter) : undefined,
        appointment_date,
        start_date,
        end_date,
      });

      setStatsData({
        total: stats.total,
        scheduled: stats.scheduled,
        confirmed: stats.confirmed,
        inProgress: stats.inProgress,
      });
    } catch {
      /* list fetch will surface errors */
    }
  }, [debouncedSearchQuery, typeFilter, clinicFilter, buildAppointmentDateParams]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const resetCreatePatientPicker = () => {
    setCreatePatientSearch("");
    setCreatePatientResults([]);
    setSelectedCreatePatient(null);
  };

  const resetForm = () => {
    resetCreatePatientPicker();
    setFormData({
      appointment_type: "consultation",
      clinics: [],
      appointment_date: "",
      appointment_time: "09:00",
      duration_minutes: 30,
      reason: "",
      notes: "",
    });
  };

  const handleClinicToggle = (clinicName: string) => {
    setFormData((prev) => {
      const next = [...prev.clinics];
      const i = next.indexOf(clinicName);
      if (i >= 0) next.splice(i, 1);
      else next.push(clinicName);
      return { ...prev, clinics: next };
    });
  };

  const handleCreateAppointment = async () => {
    if (!selectedCreatePatient) {
      toast.error("Please search and select a patient.");
      return;
    }
    if (formData.clinics.length === 0) {
      toast.error("Select at least one clinic (e.g. GOPD, Eye Clinic).");
      return;
    }
    try {
      const appointmentData = {
        patient: selectedCreatePatient.id,
        appointment_type: formData.appointment_type,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
        duration_minutes: formData.duration_minutes,
        reason: formData.reason || undefined,
        notes: formData.notes || undefined,
        clinics: formData.clinics,
      };

      await appointmentService.createAppointment(appointmentData);
      toast.success("Appointment created successfully");
      setShowCreateDialog(false);
      void loadStats();
      fetchAppointments();
    } catch (error: any) {
      console.error("Error creating appointment:", error);
      toast.error(error.message || "Failed to create appointment");
    }
  };

  const handleUpdateAppointment = async () => {
    if (!selectedAppointment) return;
    if (formData.clinics.length === 0) {
      toast.error("Select at least one clinic.");
      return;
    }

    try {
      const appointmentData = {
        appointment_type: formData.appointment_type,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
        duration_minutes: formData.duration_minutes,
        reason: formData.reason || undefined,
        notes: formData.notes || undefined,
        status: selectedAppointment.status,
        clinics: formData.clinics,
      };

      await appointmentService.updateAppointment(selectedAppointment.id, appointmentData);
      toast.success("Appointment updated successfully");
      setShowEditDialog(false);
      setSelectedAppointment(null);
      resetForm();
      void loadStats();
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
      void loadStats();
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

      const label =
        newStatus === "confirmed"
          ? "marked as confirmed"
          : newStatus === "cancelled"
            ? "cancelled"
            : `set to ${newStatus.replace(/_/g, " ")}`;
      toast.success(`Appointment ${label}`);
      void loadStats();
      fetchAppointments();
    } catch (error: any) {
      console.error("Error updating appointment status:", error);
      toast.error(error.message || "Failed to update appointment status");
    }
  };

  const openEditDialog = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setFormData({
      appointment_type: appointment.appointment_type,
      clinics: appointmentClinicsForForm(appointment),
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

  const getAppointmentListTypeBorder = (type: Appointment["appointment_type"]) => {
    switch (type) {
      case "emergency":
        return "border-l-rose-500";
      case "follow_up":
        return "border-l-blue-500";
      case "routine":
        return "border-l-violet-500";
      case "procedure":
        return "border-l-orange-500";
      default:
        return "border-l-teal-500";
    }
  };

  const getAppointmentListTypeOutline = (type: Appointment["appointment_type"]) => {
    const map: Record<string, string> = {
      consultation: "border-teal-500/50 text-teal-600 dark:text-teal-400",
      follow_up: "border-blue-500/50 text-blue-600 dark:text-blue-400",
      emergency: "border-rose-500/50 text-rose-600 dark:text-rose-400",
      procedure: "border-orange-500/50 text-orange-600 dark:text-orange-400",
      routine: "border-violet-500/50 text-violet-600 dark:text-violet-400",
    };
    return map[type] || "border-muted-foreground/50 text-muted-foreground";
  };

  const getAppointmentListStatusOutline = (status: Appointment["status"]) => {
    const map: Record<string, string> = {
      scheduled: "border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10",
      confirmed: "border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10",
      in_progress: "border-yellow-500/50 text-yellow-700 dark:text-yellow-400 bg-yellow-500/10",
      completed: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
      cancelled: "border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10",
      no_show: "border-slate-500/50 text-slate-600 dark:text-slate-400 bg-slate-500/10",
    };
    return map[status] || "border-muted-foreground/50 text-muted-foreground";
  };

  const stats = useMemo(() => {
    const totalLabel =
      datePreset === "today"
        ? "Today's appointments"
        : datePreset === "week"
          ? "This week"
          : datePreset === "month"
            ? "This month"
            : "All appointments";
    return [
      {
        label: totalLabel,
        value: statsData.total,
        icon: Calendar,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
      },
      {
        label: "Scheduled",
        value: statsData.scheduled,
        icon: Clock,
        color: "text-amber-500",
        bg: "bg-amber-500/10",
      },
      {
        label: "Confirmed",
        value: statsData.confirmed,
        icon: CheckCircle,
        color: "text-green-600",
        bg: "bg-green-500/10",
      },
      {
        label: "In progress",
        value: statsData.inProgress,
        icon: CheckCircle2,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
      },
    ];
  }, [statsData, datePreset]);

  const formatAppointmentTypeLabel = (type: Appointment["appointment_type"]) =>
    type.replace(/_/g, " ");

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header — matches Manage Visits / Dependents */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Appointments</h1>
            <p className="text-muted-foreground mt-1">Schedule and manage patient appointments</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shrink-0"
              onClick={() => {
                resetForm();
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New appointment
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`mt-1 text-2xl font-bold sm:text-3xl ${stat.color}`}>{stat.value}</p>
                  </div>
                  <div className={`rounded-full p-3 ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters — same structure & widths as Manage Visits */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name, appointment ID, or patient ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
                <Select value={datePreset} onValueChange={setDatePreset}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="procedure">Procedure</SelectItem>
                    <SelectItem value="routine">Routine Checkup</SelectItem>
                  </SelectContent>
                </Select>
                {!isMultiClinic && (
                <Select value={clinicFilter} onValueChange={setClinicFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Clinic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clinics</SelectItem>
                    {clinicOptions.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom appointment date range to narrow down the list."
          label="Appointment date range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">{appointments.length}</span>
            {totalCount > 0 && (
              <>
                {" "}
                of <span className="font-medium text-foreground">{totalCount}</span>
              </>
            )}{" "}
            appointments
          </p>
              </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading appointments…</p>
            </CardContent>
          </Card>
            ) : appointments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarDays className="mx-auto mb-3 h-12 w-12 text-blue-500 opacity-60" />
              <p className="mb-1 font-medium text-foreground">No appointments found</p>
              <p className="mb-4 text-sm text-muted-foreground">
                {searchQuery ||
                statusFilter !== "all" ||
                typeFilter !== "all" ||
                datePreset !== "all" ||
                dateRange.from ||
                dateRange.to ||
                clinicFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Create your first appointment to get started"}
                </p>
              {!searchQuery &&
                statusFilter === "all" &&
                typeFilter === "all" &&
                datePreset === "all" &&
                !dateRange.from &&
                !dateRange.to &&
                clinicFilter === "all" && (
                <Button
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white"
                  onClick={() => {
                    resetForm();
                    setShowCreateDialog(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create first appointment
                  </Button>
                )}
            </CardContent>
          </Card>
            ) : (
              <>
            <div className="space-y-2">
              {appointments.map((appointment) => {
                const name = appointment.patient_name ?? "Patient";
                const initials = name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0]?.toUpperCase())
                  .join("");
                const t = appointment.appointment_type;
                const avatarBg =
                  t === "emergency"
                    ? "bg-rose-100 dark:bg-rose-900/30"
                    : t === "follow_up"
                      ? "bg-blue-100 dark:bg-blue-900/30"
                      : t === "routine"
                        ? "bg-violet-100 dark:bg-violet-900/30"
                        : t === "procedure"
                          ? "bg-orange-100 dark:bg-orange-900/30"
                          : "bg-teal-100 dark:bg-teal-900/30";
                const avatarFg =
                  t === "emergency"
                    ? "text-rose-600 dark:text-rose-400"
                    : t === "follow_up"
                      ? "text-blue-600 dark:text-blue-400"
                      : t === "routine"
                        ? "text-violet-600 dark:text-violet-400"
                        : t === "procedure"
                          ? "text-orange-600 dark:text-orange-400"
                          : "text-teal-600 dark:text-teal-400";
                return (
                  <Card
                    key={appointment.id}
                    className={`border-l-4 ${getAppointmentListTypeBorder(t)} transition-shadow hover:shadow-md`}
                  >
                    <CardContent className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${avatarBg}`}
                        >
                          <span className={`text-xs font-semibold ${avatarFg}`}>{initials}</span>
                          </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-medium text-foreground">{name}</h3>
                            <Badge
                              variant="outline"
                              className={`h-5 px-1.5 py-0 text-[10px] ${getAppointmentListTypeOutline(t)}`}
                            >
                              {formatAppointmentTypeLabel(t)}
                          </Badge>
                            <Badge
                              variant="outline"
                              className={`h-5 px-1.5 py-0 text-[10px] ${getAppointmentListStatusOutline(appointment.status)}`}
                            >
                              {appointment.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{appointment.appointment_id}</span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              {formatDisplayDateMedium(appointment.appointment_date)}
                            </span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                              {appointment.appointment_time} ({appointment.duration_minutes} min)
                            </span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3 shrink-0" />
                              {formatAppointmentClinics(appointment)}
                            </span>
                            <span>•</span>
                            <span>{appointment.doctor_name || "No doctor assigned"}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button variant="ghost" size="sm" onClick={() => openViewDialog(appointment)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(appointment)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          {canScheduleVisitFromAppointment(appointment) && (
                            <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs" asChild>
                              <Link href={buildScheduleVisitHref(appointment)} title="Open New Visit with patient and date prefilled">
                                <Stethoscope className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Schedule visit</span>
                              </Link>
                            </Button>
                          )}
                          {appointment.status !== "cancelled" && (
                            <Select
                              value=""
                              onValueChange={(value) =>
                                handleStatusChange(appointment, value as Appointment["status"])
                              }
                            >
                              <SelectTrigger
                                className="h-8 w-8 border-0 p-0"
                                aria-label="Appointment actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </SelectTrigger>
                              <SelectContent>
                                {appointment.status === "scheduled" && (
                                  <SelectItem value="confirmed">
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Confirm (patient acknowledged for this date)
                                  </SelectItem>
                                )}
                                  <SelectItem value="cancelled">
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Cancel appointment
                                  </SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAppointment(appointment)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                  </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}

        {/* Create Appointment Dialog */}
        <Dialog
          open={showCreateDialog}
          onOpenChange={(open) => {
            setShowCreateDialog(open);
            if (!open) {
              resetForm();
            }
          }}
        >
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-500" />
                Create New Appointment
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                <Label>Patient *</Label>
                {selectedCreatePatient ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {selectedCreatePatient.full_name ??
                          `${selectedCreatePatient.first_name} ${selectedCreatePatient.surname}`.trim()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedCreatePatient.patient_id}
                        {selectedCreatePatient.age_display != null &&
                          selectedCreatePatient.age_display !== "" &&
                          ` • ${selectedCreatePatient.age_display}`}
                        {selectedCreatePatient.gender && ` • ${selectedCreatePatient.gender}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setSelectedCreatePatient(null)}
                      aria-label="Clear patient"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-10"
                        placeholder="Search by name or patient ID…"
                        value={createPatientSearch}
                        onChange={(e) => setCreatePatientSearch(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="max-h-[200px] space-y-1 overflow-y-auto rounded-md border border-border p-1">
                      {createPatientSearching && (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching…
                        </div>
                      )}
                      {!createPatientSearching &&
                        createPatientResults.length === 0 &&
                        createPatientSearch.trim() !== "" && (
                          <p className="py-6 text-center text-sm text-muted-foreground">No patients found.</p>
                        )}
                      {!createPatientSearching && createPatientSearch.trim() === "" && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          Type a name or patient ID to search the register.
                        </p>
                      )}
                      {!createPatientSearching &&
                        createPatientResults.map((p) => {
                          const label = p.full_name ?? `${p.first_name} ${p.surname}`.trim();
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedCreatePatient(p);
                                setCreatePatientSearch("");
                                setCreatePatientResults([]);
                              }}
                              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/80"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                {label
                                  .split(/\s+/)
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((n) => n[0]?.toUpperCase())
                                  .join("")}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{label}</p>
                                <p className="truncate text-xs text-muted-foreground">{p.patient_id}</p>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Appointment Type *</Label>
                <Select value={formData.appointment_type} onValueChange={(value) => setFormData({ ...formData, appointment_type: value as Appointment["appointment_type"] })}>
                  <SelectTrigger id="type">
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
              <div className="space-y-3">
                <Label>Clinics *</Label>
                <p className="text-xs text-muted-foreground">
                  Select one or more clinics for this appointment (e.g. GOPD, Eye Clinic, Physiotherapy)
                </p>
                <div className="grid max-h-[280px] grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border p-2 md:grid-cols-3">
                  {opdClinicNames.map((clinic) => {
                    const isSelected = formData.clinics.includes(clinic);
                    return (
                      <button
                        key={clinic}
                        type="button"
                        onClick={() => handleClinicToggle(clinic)}
                        className={`rounded-md p-2 text-center transition-all ${
                          isSelected
                            ? "border border-teal-500 bg-teal-500/10"
                            : "border border-transparent hover:border-primary/50"
                        }`}
                      >
                        <p className={`text-sm font-medium ${isSelected ? "text-teal-600 dark:text-teal-400" : "text-foreground"}`}>
                          {clinic}
                        </p>
                        {isSelected && <CheckCircle className="mx-auto mt-1 h-3 w-3 text-teal-600 dark:text-teal-400" />}
                      </button>
                    );
                  })}
                </div>
                {formData.clinics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {formData.clinics.map((clinic) => (
                      <Badge key={clinic} variant="secondary" className="gap-1">
                        {clinic}
                        <button
                          type="button"
                          className="ml-1 hover:text-destructive"
                          onClick={() => handleClinicToggle(clinic)}
                          aria-label={`Remove ${clinic}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.appointment_date}
                    onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                    min={todayApiDateString()}
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
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateAppointment}
                disabled={!selectedCreatePatient || !formData.appointment_date || formData.clinics.length === 0}
              >
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Patient</Label>
                  <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium text-foreground">
                    {selectedAppointment?.patient_name ?? ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    To change the patient, cancel and create a new appointment.
                  </p>
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
                <div className="space-y-3 sm:col-span-2">
                  <Label>Clinics *</Label>
                  <p className="text-xs text-muted-foreground">
                    Select one or more clinics (same list as New Visit)
                  </p>
                  <div className="grid max-h-[240px] grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border p-2 md:grid-cols-3">
                    {opdClinicNames.map((clinic) => {
                      const isSelected = formData.clinics.includes(clinic);
                      return (
                        <button
                          key={clinic}
                          type="button"
                          onClick={() => handleClinicToggle(clinic)}
                          className={`rounded-md p-2 text-center transition-all ${
                            isSelected
                              ? "border border-teal-500 bg-teal-500/10"
                              : "border border-transparent hover:border-primary/50"
                          }`}
                        >
                          <p className={`text-sm font-medium ${isSelected ? "text-teal-600 dark:text-teal-400" : "text-foreground"}`}>
                            {clinic}
                          </p>
                          {isSelected && <CheckCircle className="mx-auto mt-1 h-3 w-3 text-teal-600 dark:text-teal-400" />}
                        </button>
                      );
                    })}
                  </div>
                  {formData.clinics.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.clinics.map((clinic) => (
                        <Badge key={clinic} variant="secondary" className="gap-1">
                          {clinic}
                          <button
                            type="button"
                            className="ml-1 hover:text-destructive"
                            onClick={() => handleClinicToggle(clinic)}
                            aria-label={`Remove ${clinic}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
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
                    min={todayApiDateString()}
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
                    <Label className="text-sm font-medium text-muted-foreground">Clinics</Label>
                    <p className="inline-flex flex-wrap items-center gap-2 font-medium">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {formatAppointmentClinics(selectedAppointment)}
                    </p>
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
                      <p>{formatDisplayDate(selectedAppointment.appointment_date)}</p>
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
                      <p className="text-sm">{formatDisplayDateTime(selectedAppointment.created_at)}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                      <p className="text-sm">{formatDisplayDateTime(selectedAppointment.updated_at)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {selectedAppointment && canScheduleVisitFromAppointment(selectedAppointment) && (
                <Button variant="default" className="gap-2" asChild>
                  <Link href={buildScheduleVisitHref(selectedAppointment)}>
                    <Stethoscope className="h-4 w-4" />
                    Schedule visit
                  </Link>
                </Button>
              )}
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