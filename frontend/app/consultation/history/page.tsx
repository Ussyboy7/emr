"use client";

import { useState, useEffect, useMemo } from "react";
import { StandardPagination } from "@/components/StandardPagination";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search, Eye, Edit, Clock, CheckCircle2, Activity, Calendar, User, FileText, Pill, TestTube,
  Save, Loader2, Printer, Stethoscope, History, Filter, FlaskConical, Syringe, LayoutGrid, List,
  Users, TrendingUp, ArrowRight
} from "lucide-react";
import Link from "next/link";
import { apiFetch } from '@/lib/api-client';
import { patientService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';

// Types
interface ConsultationRecord {
  id: string;
  patient: string;
  patientId: string;
  doctor: string;
  doctorId: string;
  date: string;
  time: string;
  clinic: string;
  room: string;
  diagnosis: string;
  status: "Completed" | "In Progress";
  priority: string;
  sessionDuration: number;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  physicalExamination: string;
  assessment: string;
  plan: string;
  vitals: { id: string; systolic: number; diastolic: number; heartRate: number; temperature: number; respiratoryRate: number; weight: number; height: number; oxygenSaturation: number; bloodSugar: number; painScale: number; comment: string; recordedBy: string; date: string }[];
  prescriptions: { id: string; medication: string; strength: string; form: string; dosage: string; frequency: string; duration: string; instructions: string }[];
  labOrders: { id: string; test: string; priority: string; instructions: string; status: string; orderedBy: string; createdAt: string }[];
  nursingOrders: { id: string; type: string; instructions: string; status: string; priority: string; orderedBy: string; createdAt: string }[];
  timeline: { time: string; event: string; description: string; type: string }[];
}

// Consultation history data will be loaded from API
const demoConsultations: ConsultationRecord[] = [];

// Current logged-in doctor (demo)
const CURRENT_DOCTOR_ID = "doc-1";
const CURRENT_DOCTOR_NAME = "Dr. Amaka Eze";

const getPriorityColor = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case "emergency": case "urgent": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400";
    case "high": return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400";
    case "medium": case "normal": return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "low": return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
};

const getStatusBadge = (status: string) => {
  if (status === "Completed") return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
  return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400";
};

const getEventColor = (type: string) => {
  switch (type) {
    case "visit": return "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";
    case "vitals": return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
    case "consultation": return "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400";
    case "lab": return "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400";
    case "prescription": return "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
    case "nursing": return "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
};

const getEventIcon = (type: string) => {
  switch (type) {
    case "visit": return <User className="h-4 w-4" />;
    case "vitals": return <Activity className="h-4 w-4" />;
    case "consultation": return <Stethoscope className="h-4 w-4" />;
    case "lab": return <FlaskConical className="h-4 w-4" />;
    case "prescription": return <Pill className="h-4 w-4" />;
    case "nursing": return <Syringe className="h-4 w-4" />;
    default: return <CheckCircle2 className="h-4 w-4" />;
  }
};

export default function ConsultationHistoryPage() {
  const [consultations, setConsultations] = useState<ConsultationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "my">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [clinicFilter, setClinicFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Modal states
  const [selectedConsultation, setSelectedConsultation] = useState<ConsultationRecord | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState<{ diagnosis: string; assessment: string; plan: string; status: "Completed" | "In Progress" }>({ 
    diagnosis: "", 
    assessment: "", 
    plan: "", 
    status: "In Progress" 
  });

  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  useEffect(() => {
    const loadConsultations = async () => {
      try {
        setLoading(true);
        
        // Fetch consultation sessions from API
        const sessionsResult = await apiFetch<{ results: any[] }>('/consultation/sessions/?page_size=1000');
        const sessions = sessionsResult.results || [];
        
        // Transform sessions to consultation records
        const transformedConsultations = await Promise.all(sessions.map(async (session: any) => {
          try {
            // Get patient details
            const patient = await patientService.getPatient(session.patient);
            
            // Get visit details if available
            let visitDate = session.started_at ? new Date(session.started_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            let visitTime = session.started_at ? new Date(session.started_at).toTimeString().slice(0, 5) : '';
            let chiefComplaint = '';
            let diagnosis = '';
            let assessment = '';
            let plan = '';
            
            if (session.visit) {
              try {
                const visit = await apiFetch(`/visits/${session.visit}/`) as {
                  date?: string;
                  time?: string;
                  chief_complaint?: string;
                  clinical_notes?: string;
                };
                visitDate = visit.date || visitDate;
                visitTime = visit.time || visitTime;
                chiefComplaint = visit.chief_complaint || '';
              } catch (visitErr) {
                console.warn('Could not load visit details:', visitErr);
              }
            }
            
            // Get consultation notes if available
            if (session.notes) {
              try {
                const notesResult = await apiFetch<{ results: any[] }>(`/consultation/notes/?session=${session.id}&page_size=1`);
                const latestNote = notesResult.results?.[0];
                if (latestNote) {
                  diagnosis = latestNote.diagnosis || '';
                  assessment = latestNote.assessment || '';
                  plan = latestNote.plan || '';
                }
              } catch (notesErr) {
                console.warn('Could not load consultation notes:', notesErr);
              }
            }
            
            // Calculate session duration
            let sessionDuration = 0;
            if (session.started_at && session.ended_at) {
              sessionDuration = Math.floor((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / (1000 * 60));
            }
            
            // Get prescriptions, lab orders, and nursing orders counts
            let prescriptionsCount = 0;
            let labOrdersCount = 0;
            let nursingOrdersCount = 0;
            
            try {
              const prescriptionsResult = await apiFetch<{ results: any[] }>(`/prescriptions/?visit=${session.visit || ''}&page_size=1`);
              prescriptionsCount = prescriptionsResult.count || 0;
            } catch (err) {
              // Ignore
            }
            
            try {
              const labOrdersResult = await apiFetch<{ results: any[] }>(`/laboratory/orders/?visit=${session.visit || ''}&page_size=1`);
              labOrdersCount = labOrdersResult.count || 0;
            } catch (err) {
              // Ignore
            }
            
            try {
              const nursingOrdersResult = await apiFetch<{ results: any[] }>(`/nursing/orders/?visit=${session.visit || ''}&page_size=1`);
              nursingOrdersCount = nursingOrdersResult.count || 0;
            } catch (err) {
              // Ignore
            }
            
            // Get vitals
            let vitals: ConsultationRecord['vitals'] = [];
            try {
              const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${session.visit || ''}&page_size=10`);
              vitals = (vitalsResult.results || []).map((v: any) => ({
                id: String(v.id),
                systolic: v.blood_pressure_systolic || 0,
                diastolic: v.blood_pressure_diastolic || 0,
                heartRate: v.heart_rate || 0,
                temperature: parseFloat(v.temperature) || 0,
                respiratoryRate: v.respiratory_rate || 0,
                weight: parseFloat(v.weight) || 0,
                height: parseFloat(v.height) || 0,
                oxygenSaturation: parseFloat(v.oxygen_saturation) || 0,
                bloodSugar: 0, // Not in backend model
                painScale: 0, // Not in backend model
                comment: v.notes || '',
                recordedBy: v.recorded_by_name || 'Unknown',
                date: v.recorded_at || new Date().toISOString(),
              }));
            } catch (err) {
              // Ignore
            }
            
            return {
              id: String(session.id),
              patient: patient.full_name || `${patient.first_name} ${patient.surname}`,
              patientId: patient.patient_id || String(patient.id),
              doctor: session.doctor_name || 'Unknown',
              doctorId: String(session.doctor || ''),
              date: visitDate,
              time: visitTime,
              clinic: session.clinic || 'General',
              room: session.room_name || 'Unknown',
              diagnosis,
              status: session.status === 'completed' ? 'Completed' as const : 'In Progress' as const,
              priority: session.priority === 0 ? 'Emergency' : session.priority === 1 ? 'High' : session.priority === 2 ? 'Medium' : 'Low',
              sessionDuration,
              chiefComplaint,
              historyOfPresentIllness: '',
              physicalExamination: '',
              assessment,
              plan,
              vitals,
              prescriptions: [], // Will be loaded separately if needed
              labOrders: [], // Will be loaded separately if needed
              nursingOrders: [], // Will be loaded separately if needed
              timeline: [],
            } as ConsultationRecord;
          } catch (err) {
            console.error(`Error loading consultation ${session.id}:`, err);
            return null;
          }
        }));
        
        const validConsultations = transformedConsultations.filter((c): c is ConsultationRecord => c !== null);
        setConsultations(validConsultations);
      } catch (err) {
        console.error('Error loading consultations:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          toast.error('Failed to load consultation history. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadConsultations();
  }, []);

  const filteredConsultations = useMemo(() => {
    return consultations.filter((c) => {
      const matchesSearch = !searchQuery || c.patient.toLowerCase().includes(searchQuery.toLowerCase()) || c.id.toLowerCase().includes(searchQuery.toLowerCase()) || c.patientId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesScope = scopeFilter === "all" || (scopeFilter === "my" && c.doctorId === CURRENT_DOCTOR_ID);
      const matchesStatus = statusFilter === "all" || c.status.toLowerCase().replace(" ", "-") === statusFilter;
      const matchesDate = !dateFilter || c.date === dateFilter;
      const matchesClinic = clinicFilter === "all" || c.clinic === clinicFilter;
      return matchesSearch && matchesScope && matchesStatus && matchesDate && matchesClinic;
    });
  }, [consultations, searchQuery, scopeFilter, statusFilter, dateFilter, clinicFilter]);

  // Paginated consultations
  const paginatedConsultations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredConsultations.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredConsultations, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, scopeFilter, statusFilter, dateFilter, clinicFilter]);

  // Stats
  const stats = useMemo(() => {
    const filtered = scopeFilter === "my" ? consultations.filter(c => c.doctorId === CURRENT_DOCTOR_ID) : consultations;
    const today = new Date().toISOString().split("T")[0];
    return {
      total: filtered.length,
      today: filtered.filter(c => c.date === today).length,
      completed: filtered.filter(c => c.status === "Completed").length,
      inProgress: filtered.filter(c => c.status === "In Progress").length,
    };
  }, [consultations, scopeFilter]);

  const openViewModal = (consultation: ConsultationRecord) => {
    setSelectedConsultation(consultation);
    setShowViewModal(true);
  };

  const openEditModal = (consultation: ConsultationRecord) => {
    setSelectedConsultation(consultation);
    setEditForm({ diagnosis: consultation.diagnosis, assessment: consultation.assessment, plan: consultation.plan, status: consultation.status });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedConsultation) return;
    setIsSubmitting(true);
    
    try {
      const sessionId = parseInt(selectedConsultation.id);
      if (isNaN(sessionId)) {
        toast.error('Invalid consultation ID');
        setIsSubmitting(false);
        return;
      }
      
      // Update consultation notes if they exist
      try {
        const notesResult = await apiFetch<{ results: any[] }>(`/consultation/notes/?session=${sessionId}&page_size=1`);
        const existingNote = notesResult.results?.[0];
        
        if (existingNote) {
          // Update existing note
          await apiFetch(`/consultation/notes/${existingNote.id}/`, {
            method: 'PATCH',
            body: JSON.stringify({
              diagnosis: editForm.diagnosis,
              assessment: editForm.assessment,
              plan: editForm.plan,
            }),
          });
        } else {
          // Create new note
          await apiFetch('/consultation/notes/', {
            method: 'POST',
            body: JSON.stringify({
              session: sessionId,
              diagnosis: editForm.diagnosis,
              assessment: editForm.assessment,
              plan: editForm.plan,
            }),
          });
        }
      } catch (notesErr) {
        console.warn('Could not update consultation notes:', notesErr);
      }
      
      // Update session status if changed
      if (editForm.status !== selectedConsultation.status) {
        try {
          await apiFetch(`/consultation/sessions/${sessionId}/`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: editForm.status === 'Completed' ? 'completed' : 'in_progress',
            }),
          });
        } catch (sessionErr) {
          console.warn('Could not update session status:', sessionErr);
        }
      }
      
      // Update local state
      setConsultations(prev => prev.map(c => 
        c.id === selectedConsultation.id 
          ? { ...c, diagnosis: editForm.diagnosis, assessment: editForm.assessment, plan: editForm.plan, status: editForm.status } 
          : c
      ));
      
      toast.success(`Consultation ${selectedConsultation.id} updated`);
      setShowEditModal(false);
    } catch (err: any) {
      console.error('Error saving consultation:', err);
      toast.error('Failed to update consultation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = (consultation: ConsultationRecord) => {
    toast.info(`Printing ${consultation.id}...`);
  };

  const handleComplete = async (consultation: ConsultationRecord) => {
    setIsSubmitting(true);
    
    try {
      const sessionId = parseInt(consultation.id);
      if (isNaN(sessionId)) {
        toast.error('Invalid consultation ID');
        setIsSubmitting(false);
        return;
      }
      
      // Update session status to completed
      await apiFetch(`/consultation/sessions/${sessionId}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          ended_at: new Date().toISOString(),
        }),
      });
      
      // Update local state
      setConsultations(prev => prev.map(c => c.id === consultation.id ? { ...c, status: "Completed" } : c));
      toast.success("Consultation marked as complete");
      setShowViewModal(false);
    } catch (err: any) {
      console.error('Error completing consultation:', err);
      toast.error('Failed to complete consultation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading consultation history...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Consultation History</h1>
            <p className="text-muted-foreground mt-1">View and manage all consultation records</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/consultation/dashboard">
              <Button variant="outline" size="sm">
                <TrendingUp className="h-4 w-4 mr-2" />
                My Dashboard
              </Button>
            </Link>
            <Link href="/consultation/start">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <Stethoscope className="h-4 w-4 mr-2" />
                Start Consultation
              </Button>
            </Link>
          </div>
        </div>

        {/* Scope Toggle */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button variant={scopeFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setScopeFilter("all")} className={scopeFilter === "all" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                  <Users className="h-4 w-4 mr-2" />
                  All Consultations
                </Button>
                <Button variant={scopeFilter === "my" ? "default" : "outline"} size="sm" onClick={() => setScopeFilter("my")} className={scopeFilter === "my" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                  <User className="h-4 w-4 mr-2" />
                  My Sessions
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">View:</span>
                <Button variant={viewMode === "table" ? "default" : "ghost"} size="icon" onClick={() => setViewMode("table")} className={viewMode === "table" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                  <List className="h-4 w-4" />
                </Button>
                <Button variant={viewMode === "cards" ? "default" : "ghost"} size="icon" onClick={() => setViewMode("cards")} className={viewMode === "cards" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.today}</p>
                </div>
                <Calendar className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.inProgress}</p>
                </div>
                <Activity className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.total}</p>
                </div>
                <History className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search patient, ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={clinicFilter} onValueChange={setClinicFilter}>
                <SelectTrigger><SelectValue placeholder="Clinic" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clinics</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Eye">Eye Clinic</SelectItem>
                  <SelectItem value="Physiotherapy">Physiotherapy</SelectItem>
                  <SelectItem value="Sickle Cell">Sickle Cell</SelectItem>
                  <SelectItem value="Cardiology">Cardiology</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {viewMode === "table" ? (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">ID</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Patient</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Doctor</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date/Time</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Clinic</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Diagnosis</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConsultations.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No consultations found</td></tr>
                  ) : (
                    paginatedConsultations.map((c) => (
                      <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-4 font-medium">{c.id}</td>
                        <td className="p-4">
                          <p className="font-medium">{c.patient}</p>
                          <p className="text-xs text-muted-foreground">{c.patientId}</p>
                        </td>
                        <td className="p-4">{c.doctor}</td>
                        <td className="p-4">
                          <p>{c.date}</p>
                          <p className="text-xs text-muted-foreground">{c.time}</p>
                        </td>
                        <td className="p-4"><Badge variant="outline">{c.clinic}</Badge></td>
                        <td className="p-4 max-w-[200px] truncate">{c.diagnosis}</td>
                        <td className="p-4"><Badge className={getStatusBadge(c.status)}>{c.status}</Badge></td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openViewModal(c)} title="View"><Eye className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditModal(c)} title="Edit"><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handlePrint(c)} title="Print"><Printer className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredConsultations.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No consultations found</CardContent></Card>
            ) : (
              paginatedConsultations.map((c) => (
                <Card key={c.id} className={`hover:shadow-lg transition-shadow border-l-4 ${c.status === "Completed" ? "border-l-emerald-500" : "border-l-blue-500"}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          <span className="font-semibold text-lg">{c.patient}</span>
                          <Badge variant="outline">{c.patientId}</Badge>
                          <Badge className={getPriorityColor(c.priority)}>{c.priority}</Badge>
                          <Badge className={getStatusBadge(c.status)}>{c.status}</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground mb-4">
                          <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{c.date}</span>
                          <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{c.time} ({c.sessionDuration}min)</span>
                          <span className="flex items-center gap-1"><Stethoscope className="h-4 w-4" />{c.doctor}</span>
                          <span className="flex items-center gap-1"><Activity className="h-4 w-4" />{c.clinic}</span>
                        </div>
                        <div className="bg-muted/50 p-3 rounded-lg mb-3">
                          <span className="font-medium text-sm">Diagnosis:</span>
                          <span className="ml-2 text-sm">{c.diagnosis}</span>
                        </div>
                        <div className="flex gap-4 text-sm flex-wrap">
                          <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><Activity className="h-4 w-4" />{c.vitals.length} Vitals</span>
                          <span className="flex items-center gap-1 text-pink-600 dark:text-pink-400"><FlaskConical className="h-4 w-4" />{c.labOrders.length} Labs</span>
                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400"><Pill className="h-4 w-4" />{c.prescriptions.length} Rx</span>
                          <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400"><Syringe className="h-4 w-4" />{c.nursingOrders.length} Nursing</span>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => openViewModal(c)} className="bg-emerald-600 hover:bg-emerald-700 ml-4">
                        <Eye className="h-4 w-4 mr-2" />View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Pagination */}
        {filteredConsultations.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredConsultations.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="consultations"
            />
          </Card>
        )}

        {/* View Modal with Tabs */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-emerald-500" />Consultation Details</DialogTitle>
              <DialogDescription>{selectedConsultation?.id} • {selectedConsultation?.patient} • {selectedConsultation?.date}</DialogDescription>
            </DialogHeader>
            {selectedConsultation && (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="vitals">Vitals</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="orders">Orders</TabsTrigger>
                  <TabsTrigger value="rx">Prescriptions</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                    <div><p className="text-xs text-muted-foreground">Patient</p><p className="font-medium">{selectedConsultation.patient}</p><p className="text-xs">{selectedConsultation.patientId}</p></div>
                    <div><p className="text-xs text-muted-foreground">Doctor</p><p className="font-medium">{selectedConsultation.doctor}</p></div>
                    <div><p className="text-xs text-muted-foreground">Date/Time</p><p className="font-medium">{selectedConsultation.date}</p><p className="text-xs">{selectedConsultation.time}</p></div>
                    <div><p className="text-xs text-muted-foreground">Status</p><Badge className={getStatusBadge(selectedConsultation.status)}>{selectedConsultation.status}</Badge></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"><p className="text-2xl font-bold text-blue-600">{selectedConsultation.sessionDuration}</p><p className="text-xs text-muted-foreground">Minutes</p></div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg"><p className="text-2xl font-bold text-emerald-600">{selectedConsultation.prescriptions.length}</p><p className="text-xs text-muted-foreground">Prescriptions</p></div>
                    <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg"><p className="text-2xl font-bold text-pink-600">{selectedConsultation.labOrders.length}</p><p className="text-xs text-muted-foreground">Lab Orders</p></div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                    <p className="font-semibold text-purple-900 dark:text-purple-300">Diagnosis</p>
                    <p className="text-purple-700 dark:text-purple-400">{selectedConsultation.diagnosis}</p>
                  </div>
                </TabsContent>

                <TabsContent value="vitals" className="space-y-4 mt-4">
                  {selectedConsultation.vitals.length > 0 ? selectedConsultation.vitals.map((v) => (
                    <Card key={v.id}>
                      <CardHeader><CardTitle className="text-base">Recorded by {v.recordedBy}</CardTitle></CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg"><p className="text-xs text-muted-foreground">BP</p><p className="font-bold">{v.systolic}/{v.diastolic}</p></div>
                          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg"><p className="text-xs text-muted-foreground">Temp</p><p className="font-bold">{v.temperature}°C</p></div>
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg"><p className="text-xs text-muted-foreground">HR</p><p className="font-bold">{v.heartRate} bpm</p></div>
                          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg"><p className="text-xs text-muted-foreground">SpO2</p><p className="font-bold">{v.oxygenSaturation}%</p></div>
                          <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg"><p className="text-xs text-muted-foreground">RR</p><p className="font-bold">{v.respiratoryRate}/min</p></div>
                          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg"><p className="text-xs text-muted-foreground">Weight</p><p className="font-bold">{v.weight} kg</p></div>
                          <div className="bg-pink-50 dark:bg-pink-900/20 p-3 rounded-lg"><p className="text-xs text-muted-foreground">Height</p><p className="font-bold">{v.height} cm</p></div>
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg"><p className="text-xs text-muted-foreground">Pain</p><p className="font-bold">{v.painScale}/10</p></div>
                        </div>
                        {v.comment && <p className="mt-3 text-sm text-muted-foreground bg-muted p-2 rounded">{v.comment}</p>}
                      </CardContent>
                    </Card>
                  )) : <Card><CardContent className="p-8 text-center text-muted-foreground">No vitals recorded</CardContent></Card>}
                </TabsContent>

                <TabsContent value="notes" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div><Label className="text-sm font-semibold">Chief Complaint</Label><p className="mt-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">{selectedConsultation.chiefComplaint}</p></div>
                    <div><Label className="text-sm font-semibold">History of Present Illness</Label><p className="mt-1 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg text-sm">{selectedConsultation.historyOfPresentIllness}</p></div>
                    <div><Label className="text-sm font-semibold">Physical Examination</Label><p className="mt-1 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">{selectedConsultation.physicalExamination}</p></div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div><Label className="text-sm font-semibold">Assessment</Label><p className="mt-1 p-3 bg-muted rounded-lg text-sm">{selectedConsultation.assessment}</p></div>
                      <div><Label className="text-sm font-semibold">Plan</Label><p className="mt-1 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm">{selectedConsultation.plan}</p></div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="orders" className="space-y-4 mt-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-pink-500" />Lab Orders ({selectedConsultation.labOrders.length})</h4>
                      {selectedConsultation.labOrders.length > 0 ? selectedConsultation.labOrders.map((l) => (
                        <Card key={l.id} className="mb-2"><CardContent className="p-3">
                          <div className="flex justify-between items-start">
                            <div><p className="font-medium">{l.test}</p><p className="text-xs text-muted-foreground">{l.orderedBy}</p></div>
                            <div className="flex gap-1"><Badge className={getPriorityColor(l.priority)} variant="outline">{l.priority}</Badge><Badge variant="outline">{l.status}</Badge></div>
                          </div>
                        </CardContent></Card>
                      )) : <p className="text-sm text-muted-foreground">No lab orders</p>}
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2"><Syringe className="h-4 w-4 text-orange-500" />Nursing Orders ({selectedConsultation.nursingOrders.length})</h4>
                      {selectedConsultation.nursingOrders.length > 0 ? selectedConsultation.nursingOrders.map((n) => (
                        <Card key={n.id} className="mb-2"><CardContent className="p-3">
                          <div className="flex justify-between items-start">
                            <div><p className="font-medium">{n.type}</p><p className="text-xs text-muted-foreground">{n.instructions}</p></div>
                            <Badge className={getPriorityColor(n.priority)} variant="outline">{n.priority}</Badge>
                          </div>
                        </CardContent></Card>
                      )) : <p className="text-sm text-muted-foreground">No nursing orders</p>}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="rx" className="space-y-4 mt-4">
                  {selectedConsultation.prescriptions.length > 0 ? selectedConsultation.prescriptions.map((rx) => (
                    <Card key={rx.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="font-semibold text-lg">{rx.medication} {rx.strength} ({rx.form})</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm">
                          <div><span className="text-muted-foreground">Dosage:</span> {rx.dosage}</div>
                          <div><span className="text-muted-foreground">Frequency:</span> {rx.frequency}</div>
                          <div><span className="text-muted-foreground">Duration:</span> {rx.duration}</div>
                          {rx.instructions && <div className="md:col-span-4"><span className="text-muted-foreground">Instructions:</span> {rx.instructions}</div>}
                        </div>
                      </CardContent>
                    </Card>
                  )) : <Card><CardContent className="p-8 text-center text-muted-foreground">No prescriptions</CardContent></Card>}
                </TabsContent>

                <TabsContent value="timeline" className="mt-4">
                  <Card>
                    <CardHeader><CardTitle>Session Timeline</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {selectedConsultation.timeline.map((event, idx) => (
                          <div key={idx} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getEventColor(event.type)}`}>{getEventIcon(event.type)}</div>
                              {idx < selectedConsultation.timeline.length - 1 && <div className="w-0.5 h-full bg-border my-1"></div>}
                            </div>
                            <div className="flex-1 pb-4">
                              <div className="flex items-center justify-between"><span className="font-semibold">{event.event}</span><span className="text-xs text-muted-foreground">{event.time}</span></div>
                              <p className="text-sm text-muted-foreground">{event.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowViewModal(false)}>Close</Button>
              <Button variant="outline" onClick={() => selectedConsultation && handlePrint(selectedConsultation)}><Printer className="h-4 w-4 mr-2" />Print</Button>
              <Button variant="outline" onClick={() => { setShowViewModal(false); selectedConsultation && openEditModal(selectedConsultation); }}><Edit className="h-4 w-4 mr-2" />Edit</Button>
              {selectedConsultation?.status === "In Progress" && (
                <Button onClick={() => selectedConsultation && handleComplete(selectedConsultation)} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                  {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Complete
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5 text-emerald-500" />Edit Consultation</DialogTitle>
              <DialogDescription>Update consultation details for {selectedConsultation?.patient}</DialogDescription>
            </DialogHeader>
            {selectedConsultation && (
              <div className="space-y-4">
                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  <span className="text-muted-foreground">ID:</span> <span className="font-medium">{selectedConsultation.id}</span>
                  <span className="ml-4 text-muted-foreground">Date:</span> <span className="font-medium">{selectedConsultation.date}</span>
                </div>
                <div><Label>Diagnosis</Label><Input value={editForm.diagnosis} onChange={(e) => setEditForm(prev => ({ ...prev, diagnosis: e.target.value }))} className="mt-1" /></div>
                <div><Label>Assessment</Label><Textarea value={editForm.assessment} onChange={(e) => setEditForm(prev => ({ ...prev, assessment: e.target.value }))} rows={3} className="mt-1" /></div>
                <div><Label>Plan</Label><Textarea value={editForm.plan} onChange={(e) => setEditForm(prev => ({ ...prev, plan: e.target.value }))} rows={3} className="mt-1" /></div>
                <div><Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm(prev => ({ ...prev, status: v as "Completed" | "In Progress" }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

