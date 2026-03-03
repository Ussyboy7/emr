"use client";

import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
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
  Save, Loader2, Stethoscope, History, Filter, FlaskConical, Syringe, LayoutGrid, List,
  Users, TrendingUp, ArrowRight, AlertTriangle, RefreshCw, Plus, X
} from "lucide-react";
import Link from "next/link";
import { apiFetch } from '@/lib/api-client';
import { patientService, consultationService, pharmacyService, labService, radiologyService, physioService } from '@/lib/services';
import { loadConsultationReportSession, type ConsultationReportSession } from '@/lib/consultation-report';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { useCurrentUser } from '@/hooks/use-current-user';
import { CLINICS } from '@/lib/constants/clinics';
import { clinicMatches } from '@/lib/utils/clinic-utils';
import { ConsultationRecord } from '@/components/consultation/ConsultationDetailModal';
import { ConsultationReportModal } from '@/components/consultation/ConsultationReportModal';
import { PrescriptionOrderModal, type PrescriptionOrderSubmitInput } from "@/components/consultation/orders/PrescriptionOrderModal";
import { LabOrderModal, type LabOrderSubmitInput } from "@/components/consultation/orders/LabOrderModal";
import { RadiologyOrderModal, type RadiologyOrderSubmitInput } from "@/components/consultation/orders/RadiologyOrderModal";
import { PhysioOrderModal, type PhysioOrderSubmitInput } from "@/components/consultation/orders/PhysioOrderModal";

// NOTE: doctor name is now taken directly from the session serializer (doctor_name)
// to avoid per-row API calls in large lists.

// ICD-10 Codes for diagnosis
const icd10Codes = [
  // Infectious diseases
  { code: 'A09', name: 'Infectious gastroenteritis and colitis', category: 'Infectious' },
  { code: 'A15.0', name: 'Tuberculosis of lung', category: 'Infectious' },
  { code: 'B20', name: 'Human immunodeficiency virus [HIV] disease', category: 'Infectious' },
  { code: 'B50.9', name: 'Plasmodium falciparum malaria, unspecified', category: 'Infectious' },
  { code: 'B54', name: 'Unspecified malaria', category: 'Infectious' },
  { code: 'J00', name: 'Acute nasopharyngitis [common cold]', category: 'Respiratory' },
  { code: 'J06.9', name: 'Acute upper respiratory infection, unspecified', category: 'Respiratory' },
  { code: 'J18.9', name: 'Pneumonia, unspecified', category: 'Respiratory' },

  // Endocrine, nutritional and metabolic diseases
  { code: 'E10.9', name: 'Type 1 diabetes mellitus without complications', category: 'Endocrine' },
  { code: 'E11.9', name: 'Type 2 diabetes mellitus without complications', category: 'Endocrine' },
  { code: 'E66.9', name: 'Obesity, unspecified', category: 'Endocrine' },
  { code: 'E78.5', name: 'Hyperlipidemia, unspecified', category: 'Endocrine' },

  // Diseases of the circulatory system
  { code: 'I10', name: 'Essential (primary) hypertension', category: 'Cardiovascular' },
  { code: 'I20.9', name: 'Angina pectoris, unspecified', category: 'Cardiovascular' },
  { code: 'I25.10', name: 'Atherosclerotic heart disease of native coronary artery without angina pectoris', category: 'Cardiovascular' },
  { code: 'I48.91', name: 'Unspecified atrial fibrillation', category: 'Cardiovascular' },

  // Diseases of the respiratory system
  { code: 'J45.909', name: 'Unspecified asthma, uncomplicated', category: 'Respiratory' },
  { code: 'J44.9', name: 'Chronic obstructive pulmonary disease, unspecified', category: 'Respiratory' },

  // Symptoms, signs and abnormal clinical findings
  { code: 'R50.9', name: 'Fever, unspecified', category: 'Symptoms' },
  { code: 'R51', name: 'Headache', category: 'Symptoms' },
  { code: 'R10.9', name: 'Unspecified abdominal pain', category: 'Symptoms' },
  { code: 'R05', name: 'Cough', category: 'Symptoms' },
  { code: 'R11.0', name: 'Nausea', category: 'Symptoms' },
  { code: 'M54.5', name: 'Low back pain', category: 'Musculoskeletal' },

  // Injury, poisoning and certain other consequences
  { code: 'S09.90XA', name: 'Unspecified injury of head, initial encounter', category: 'Injury' },
  { code: 'T14.90XA', name: 'Injury, unspecified, initial encounter', category: 'Injury' },

  // External causes
  { code: 'V89.9XXA', name: 'Person injured in unspecified motor-vehicle accident, initial encounter', category: 'External' },
  { code: 'W19.XXXA', name: 'Unspecified fall, initial encounter', category: 'External' }
];

// Helper function to clean garbage text from clinical notes
const cleanClinicalText = (text: string): string => {
  if (!text || text.trim().length < 3) return '';

  // Remove common garbage patterns and normalize
  let cleaned = text
    .replace(/[a-zA-Z]{25,}/g, '') // Remove very long words (likely garbage)
    .replace(/[^\w\s.,;:\-\n]/g, '') // Remove special characters except common punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Additional garbage detection patterns
  const garbagePatterns = [
    /^[^\w]*$/, // Only non-word characters
    /lorem ipsum/i,
    /test data/i,
    /sample text/i,
    /^[a-z]{1,2}(\s+[a-z]{1,2})*$/i, // Very short words repeated (like "a b c d")
    /(.)\1{4,}/, // Same character repeated 5+ times
    /([a-z])\1{2,}[a-z]*([a-z])\2{2,}/i, // Repeated letter patterns
  ];

  // Check for garbage patterns
  for (const pattern of garbagePatterns) {
    if (pattern.test(cleaned)) {
      return '';
    }
  }

  // If it's too short after cleaning, return empty
  if (cleaned.length < 3) {
    return '';
  }

  return cleaned;
};

// Extended type for local use (includes patientGender for filtering)
interface ConsultationRecordWithGender extends ConsultationRecord {
  patientGender?: string;
  visitDisplayId?: string;
}

// Consultation history data will be loaded from API

// Helper function for status badge styling
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'STAT': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
    case 'Urgent': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
    default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
  }
};

const getStatusBadge = (status: string) => {
  if (status === "Completed") return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
  return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400";
};

// Helper function for timeline generation (still needed for data transformation)
const generateTimeline = (
  session: any,
  vitals: ConsultationRecord['vitals'],
  prescriptions: ConsultationRecord['prescriptions'],
  labOrders: ConsultationRecord['labOrders'],
  nursingOrders: ConsultationRecord['nursingOrders']
): ConsultationRecord['timeline'] => {
  const timeline: ConsultationRecord['timeline'] = [];
  
  // Session started
  if (session.started_at) {
    timeline.push({
      time: new Date(session.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      event: 'Consultation Started',
      description: `Session ${session.session_id} began`,
      type: 'consultation',
    });
  }
  
  // Vitals recorded
  vitals.forEach((v) => {
    timeline.push({
      time: new Date(v.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      event: 'Vitals Recorded',
      description: `BP: ${v.systolic}/${v.diastolic}, Temp: ${v.temperature}°C, HR: ${v.heartRate} bpm`,
      type: 'vitals',
    });
  });
  
  // Prescriptions added
  prescriptions.forEach((p) => {
    timeline.push({
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      event: 'Prescription Added',
      description: `${p.medication} ${p.strength} - ${p.dosage} ${p.frequency}`,
      type: 'prescription',
    });
  });
  
  // Lab orders added
  labOrders.forEach((l) => {
    timeline.push({
      time: new Date(l.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      event: 'Lab Order Added',
      description: `${l.test} - ${l.priority} priority`,
      type: 'lab_order',
    });
  });

  // Nursing orders added
  nursingOrders.forEach((n) => {
    timeline.push({
      time: new Date(n.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      event: 'Nursing Order Added',
      description: `${n.type} - ${n.instructions}`,
      type: 'nursing_order',
    });
  });
  
  // Session ended
  if (session.ended_at) {
    timeline.push({
      time: new Date(session.ended_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      event: 'Consultation Completed',
      description: `Session ${session.session_id} ended`,
      type: 'consultation',
    });
  }
  
  // Sort by time
  return timeline.sort((a, b) => {
    const timeA = a.time;
    const timeB = b.time;
    return timeA.localeCompare(timeB);
  });
};

export default function ConsultationHistoryPage() {
  const { currentUser } = useCurrentUser();
  const [consultations, setConsultations] = useState<ConsultationRecordWithGender[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all"); // Changed from "today" to "all" to show all data by default
  const [clinicFilter, setClinicFilter] = useState("all");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  
  // Modal states
  const [selectedConsultation, setSelectedConsultation] = useState<ConsultationRecordWithGender | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [reportSession, setReportSession] = useState<ConsultationReportSession | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddDiagnosisInEdit, setShowAddDiagnosisInEdit] = useState(false);
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [selectedDiagnosisType, setSelectedDiagnosisType] = useState<'Primary' | 'Secondary' | 'Differential'>('Primary');
  const [diagnosisNotes, setDiagnosisNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Orders loaded for Edit modal (by consultation_session)
  const [editPrescriptions, setEditPrescriptions] = useState<any[]>([]);
  const [editLabOrders, setEditLabOrders] = useState<any[]>([]);
  const [editRadiologyOrders, setEditRadiologyOrders] = useState<any[]>([]);
  const [editPhysioOrders, setEditPhysioOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [editActiveTab, setEditActiveTab] = useState('notes');
  // Add-order dialogs (Option A: use session-style modals, submit immediately)
  const [showAddPrescription, setShowAddPrescription] = useState(false);
  const [showAddLabOrder, setShowAddLabOrder] = useState(false);
  const [showAddRadiologyOrder, setShowAddRadiologyOrder] = useState(false);
  const [showAddPhysioOrder, setShowAddPhysioOrder] = useState(false);
  const [editOrderAllergies, setEditOrderAllergies] = useState<string[]>([]);
  const [editForm, setEditForm] = useState<{
    diagnosis: string;
    presentationComplaint: string;
    historyOfPresentIllness: string;
    physicalExamination: string;
    assessment: string;
    plan: string;
    status: "Completed" | "In Progress";
    diagnosisCodes: { id: string; code: string; name: string; type: 'Primary' | 'Secondary' | 'Differential'; notes: string }[];
  }>({
    diagnosis: "",
    presentationComplaint: "",
    historyOfPresentIllness: "",
    physicalExamination: "",
    assessment: "",
    plan: "",
    status: "In Progress",
    diagnosisCodes: []
  });

  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  useEffect(() => {
    const loadConsultations = async () => {
      try {
        setLoading(true);

        // Date filter (server-side) - match Manage Visits/Nursing Pool concepts
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yyyyMmDd = (d: Date) => d.toISOString().split("T")[0];
        let date: string | undefined;
        let start_date: string | undefined;
        let end_date: string | undefined;

        if (dateFilter === "today") {
          date = yyyyMmDd(today);
        } else if (dateFilter === "week") {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          start_date = yyyyMmDd(weekAgo);
          end_date = yyyyMmDd(today);
        } else if (dateFilter === "month") {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          start_date = yyyyMmDd(monthAgo);
          end_date = yyyyMmDd(today);
        }
        
        const sessionsResult = await consultationService.getSessions({
          page: currentPage,
          page_size: itemsPerPage,
          search: searchQuery || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          clinic: clinicFilter !== "all" ? clinicFilter : undefined,
          date,
          start_date,
          end_date,
        });
        setTotalCount(sessionsResult.count || sessionsResult.results.length);
        const sessions = sessionsResult.results || [];
        
        // Transform sessions to consultation records
        const transformedConsultations = await Promise.all(sessions.map(async (session: any) => {
          try {
            // IMPORTANT: keep this list page light.
            // Avoid N+1 requests (patients, visits, diagnoses, orders, vitals).
            const startedAt = session.started_at ? new Date(session.started_at) : new Date();
            const visitDate = startedAt.toISOString().split('T')[0];
            const visitTime = startedAt.toTimeString().slice(0, 5);
            const visitDisplayId: string | undefined = undefined;

            const diagnosis = '';
            const diagnosisCodes: { code: string; description: string; type: 'Primary' | 'Secondary' | 'Differential' }[] = [];
            const assessment = cleanClinicalText(session.assessment || '');
            const plan = cleanClinicalText(session.plan || '');
            const historyOfPresentIllness = session.history_of_presenting_illness || '';
            const physicalExamination = session.physical_examination || '';
            
            // Calculate session duration
            let sessionDuration = 0;
            if (session.started_at && session.ended_at) {
              sessionDuration = Math.floor((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / (1000 * 60));
            }
            const vitals: ConsultationRecord['vitals'] = [];
            const prescriptions: ConsultationRecord['prescriptions'] = [];
            const labOrders: ConsultationRecord['labOrders'] = [];
            const nursingOrders: ConsultationRecord['nursingOrders'] = [];

            const doctorName = (session.doctor_name && String(session.doctor_name).trim()) ? String(session.doctor_name).trim() : 'Unknown';
            const doctorId = String(session.doctor || '');

            return {
              id: String(session.id),
              patient: session.patient_name || 'Unknown',
              patientId: session.patient_id || '',
              patientIdNumeric: session.patient,
              visitId: session.visit,
              visitDisplayId,
              patientGender: session.patient_gender || undefined, // Store gender for filtering
              doctor: doctorName,
              doctorId: doctorId,
              date: visitDate,
              time: visitTime,
              clinic: session.clinic_name || 'GOPD',
              room: session.room_name || 'Unknown',
              diagnosis,
              diagnosisCodes,
              status: session.status === 'completed' ? 'Completed' as const : 'In Progress' as const,
              priority: (() => {
                const p = session.priority;
                if (typeof p === 'number') {
                  return p === 0 ? 'Emergency' : p === 1 ? 'High' : p === 2 ? 'Medium' : 'Low';
                }
                return String(p || 'Medium');
              })(),
              sessionDuration,
              historyOfPresentIllness,
              physicalExamination,
              assessment,
              plan,
              vitals,
              prescriptions,
              labOrders,
              nursingOrders,
              timeline: generateTimeline(session, vitals, prescriptions, labOrders, nursingOrders),
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
  }, [currentPage, itemsPerPage, searchQuery, statusFilter, dateFilter, clinicFilter]);

  // With server-side pagination, consultations array contains only current page results
  const paginatedConsultations = consultations;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, searchQuery, statusFilter, dateFilter, clinicFilter]);

  // Stats
  const stats = useMemo(() => {
    const filtered = consultations;

    // Fix today calculation with proper date comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = filtered.filter(c => {
      try {
        const consultationDate = new Date(c.date + 'T' + (c.time || '00:00:00'));
        consultationDate.setHours(0, 0, 0, 0);
        return consultationDate.getTime() === today.getTime();
      } catch {
        // Fallback to date-only comparison if time parsing fails
        return c.date === today.toISOString().split('T')[0];
      }
    }).length;

    return {
      total: filtered.length,
      today: todayCount,
      completed: filtered.filter(c => c.status === "Completed").length,
      inProgress: filtered.filter(c => c.status === "In Progress").length,
    };
  }, [consultations]);

  const openViewModal = (consultation: ConsultationRecord) => {
    setSelectedConsultation(consultation);
    setReportSession(null);
    setLoadingReport(true);
    setShowViewModal(true);
  };

  // Load full report session when View modal opens (same as Patient Medical Records View Report)
  useEffect(() => {
    if (!showViewModal || !selectedConsultation) return;
    const id = Number(selectedConsultation.id);
    if (Number.isNaN(id)) {
      setLoadingReport(false);
      return;
    }
    let cancelled = false;
    loadConsultationReportSession(id)
      .then((session) => {
        if (!cancelled) setReportSession(session);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load consultation report');
      })
      .finally(() => {
        if (!cancelled) setLoadingReport(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showViewModal, selectedConsultation?.id]);

  const canEditConsultation = (consultation: ConsultationRecord): boolean => {
    // Allow editing if within 48 hours of the consultation date/time
    const consultationDateTime = new Date(consultation.date + 'T' + (consultation.time || '00:00:00'));
    const now = new Date();
    const hoursDifference = (now.getTime() - consultationDateTime.getTime()) / (1000 * 60 * 60);
    return hoursDifference <= 48;
  };

  const openEditModal = (consultation: ConsultationRecord) => {
    if (!canEditConsultation(consultation)) {
      toast.error('Consultation can only be edited within 48 hours of the session');
      return;
    }

    setSelectedConsultation(consultation);
    setEditForm({
      diagnosis: consultation.diagnosis,
      presentationComplaint: consultation.presentationComplaint || '',
      historyOfPresentIllness: consultation.historyOfPresentIllness || '',
      physicalExamination: consultation.physicalExamination || '',
      assessment: consultation.assessment,
      plan: consultation.plan,
      status: consultation.status,
      diagnosisCodes: (consultation.diagnosisCodes || []).map((dx, index) => ({
        id: `existing-${index}`,
        code: dx.code,
        name: dx.description,
        type: 'Primary' as const,
        notes: ''
      }))
    });
    setShowEditModal(true);
  };

  // Load orders for Edit modal when it opens (by consultation_session)
  useEffect(() => {
    if (!showEditModal || !selectedConsultation) return;
    const sessionId = parseInt(selectedConsultation.id, 10);
    if (isNaN(sessionId)) return;

    const loadOrders = async () => {
      setLoadingOrders(true);
      try {
        const [rxRes, labRes, radRes, physioRes] = await Promise.all([
          pharmacyService.getPrescriptions({ consultation_session: sessionId, page_size: 100 }),
          labService.getOrders({ consultation_session: sessionId, page_size: 100 }),
          radiologyService.getOrders({ consultation_session: sessionId, page_size: 100 }),
          physioService.getOrders({ consultation_session: sessionId, page_size: 100 }),
        ]);
        setEditPrescriptions(rxRes.results || []);
        setEditLabOrders(labRes.results || []);
        setEditRadiologyOrders(radRes.results || []);
        setEditPhysioOrders(physioRes.results || []);
      } catch (err) {
        console.error('Error loading orders for edit:', err);
        toast.error('Failed to load prescriptions and orders');
      } finally {
        setLoadingOrders(false);
      }
    };
    loadOrders();
  }, [showEditModal, selectedConsultation?.id]);

  const loadEditOrdersRefetch = async () => {
    if (!selectedConsultation) return;
    const sessionId = parseInt(selectedConsultation.id, 10);
    if (isNaN(sessionId)) return;
    try {
      const [rxRes, labRes, radRes, physioRes] = await Promise.all([
        pharmacyService.getPrescriptions({ consultation_session: sessionId, page_size: 100 }),
        labService.getOrders({ consultation_session: sessionId, page_size: 100 }),
        radiologyService.getOrders({ consultation_session: sessionId, page_size: 100 }),
        physioService.getOrders({ consultation_session: sessionId, page_size: 100 }),
      ]);
      setEditPrescriptions(rxRes.results || []);
      setEditLabOrders(labRes.results || []);
      setEditRadiologyOrders(radRes.results || []);
      setEditPhysioOrders(physioRes.results || []);
    } catch (err) {
      console.error('Error refetching orders:', err);
    }
  };

  const getSelectedPatientId = (): number | null => {
    if (!selectedConsultation) return null;
    const pid = selectedConsultation.patientIdNumeric ?? parseInt(selectedConsultation.patientId, 10);
    return pid && !isNaN(pid) ? pid : null;
  };

  const getSelectedSessionId = (): number | null => {
    if (!selectedConsultation) return null;
    const sid = parseInt(selectedConsultation.id, 10);
    return sid && !isNaN(sid) ? sid : null;
  };

  // Load allergies when opening prescription modal (best-effort)
  useEffect(() => {
    const pid = getSelectedPatientId();
    if (!showAddPrescription || !pid) return;

    const loadAllergies = async () => {
      try {
        const history = await patientService.getPatientHistory(pid);
        const raw = (history as any)?.allergies;
        let allergies: string[] = [];
        if (Array.isArray(raw)) allergies = raw;
        else if (typeof raw === "string") allergies = raw.split(/[,\n]/).map((a) => a.trim()).filter(Boolean);
        setEditOrderAllergies(allergies);
      } catch (err) {
        setEditOrderAllergies([]);
      }
    };
    loadAllergies();
  }, [showAddPrescription, selectedConsultation?.id]);

  const handleSubmitPrescription = async (payload: PrescriptionOrderSubmitInput) => {
    const patientId = getSelectedPatientId();
    const sessionId = getSelectedSessionId();
    if (!selectedConsultation || !patientId || !sessionId) {
      toast.error("Invalid consultation/patient");
      return;
    }
    await pharmacyService.createPrescription({
      patient: patientId,
      visit: selectedConsultation.visitId,
      consultation_session: sessionId,
      notes: payload.clinicalIndication || undefined,
      items: payload.items.map((i) => ({
        medication: i.medicationId,
        quantity: i.quantity,
        unit: i.unit,
        dosage: i.dosage,
        frequency: i.frequency,
        duration: i.duration,
        instructions: i.instructions,
      })),
    } as any);
    toast.success("Prescription added");
    await loadEditOrdersRefetch();
  };

  const handleSubmitLabOrder = async (payload: LabOrderSubmitInput) => {
    const patientId = getSelectedPatientId();
    const sessionId = getSelectedSessionId();
    if (!selectedConsultation || !patientId || !sessionId) {
      toast.error("Invalid consultation/patient");
      return;
    }
    await labService.createOrder({
      patient: patientId as any,
      visit: selectedConsultation.visitId,
      consultation_session: sessionId,
      priority: payload.priority,
      clinical_notes: payload.clinicalNotes || undefined,
      tests_data: payload.templates.map((t) => ({
        name: t.name,
        code: t.code || t.name.substring(0, 10).toUpperCase().replace(/\s/g, "_"),
        sample_type: t.sample_type || "Blood",
        template: t.id,
        status: "pending",
        notes: payload.clinicalNotes || "",
      })),
    } as any);
    toast.success("Lab order added");
    await loadEditOrdersRefetch();
  };

  const handleSubmitRadiologyOrder = async (payload: RadiologyOrderSubmitInput) => {
    const patientId = getSelectedPatientId();
    const sessionId = getSelectedSessionId();
    if (!selectedConsultation || !patientId || !sessionId) {
      toast.error("Invalid consultation/patient");
      return;
    }

    await radiologyService.createOrder({
      patient: patientId,
      visit: selectedConsultation.visitId,
      consultation_session: sessionId,
      priority: payload.priority,
      clinical_notes: payload.clinicalIndication?.trim() || undefined,
      provisional_diagnosis: payload.provisionalDiagnosis?.trim() || undefined,
      lmp: payload.lmp || undefined,
      studies_data: payload.templates.map((t) => ({
        procedure: t.name,
        body_part: t.body_part || "",
        modality: t.modality || "X-Ray",
        status: "pending",
      })),
    } as any);
    toast.success("Radiology order added");
    await loadEditOrdersRefetch();
  };

  const handleSubmitPhysioOrder = async (payload: PhysioOrderSubmitInput) => {
    const patientId = getSelectedPatientId();
    const sessionId = getSelectedSessionId();
    if (!selectedConsultation || !patientId || !sessionId) {
      toast.error("Invalid consultation/patient");
      return;
    }
    await physioService.createOrder({
      patient: patientId,
      consultation_session: sessionId,
      diagnosis: payload.diagnosis.trim(),
      chief_complaint: payload.chiefComplaint || undefined,
      treatment_goal: payload.treatmentGoal || undefined,
      special_instructions: payload.specialInstructions || undefined,
      priority: payload.priority,
    } as any);
    toast.success("Physiotherapy order added");
    await loadEditOrdersRefetch();
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
      
      // Update consultation session notes directly
      // Store diagnosis codes as JSON in notes field
      const diagnosisData = editForm.diagnosisCodes.length > 0 ? JSON.stringify({
        diagnosis_codes: editForm.diagnosisCodes.map(d => ({
          code: d.code,
          description: d.name,
          type: d.type,
          notes: d.notes || ''
        }))
      }) : '';

      const updateData: any = {
        presentation_complaint: editForm.presentationComplaint,
        history_of_presenting_illness: editForm.historyOfPresentIllness,
        physical_examination: editForm.physicalExamination,
        assessment: editForm.assessment,
        plan: editForm.plan,
        notes: diagnosisData, // Store structured diagnosis data as JSON
      };
      
      // Update session status if changed
      if (editForm.status !== selectedConsultation.status) {
        updateData.status = editForm.status === 'Completed' ? 'completed' : 'in_progress';
        if (editForm.status === 'Completed' && !selectedConsultation.status) {
          updateData.ended_at = new Date().toISOString();
        }
      }
      
      await consultationService.updateSession(sessionId, updateData);
      
      // Update local state
      setConsultations(prev => prev.map(c =>
        c.id === selectedConsultation.id
          ? { ...c, diagnosis: editForm.diagnosis, presentationComplaint: editForm.presentationComplaint, historyOfPresentIllness: editForm.historyOfPresentIllness, physicalExamination: editForm.physicalExamination, assessment: editForm.assessment, plan: editForm.plan, status: editForm.status, diagnosisCodes: editForm.diagnosisCodes.map(dx => ({ code: dx.code, description: dx.name, type: dx.type })) }
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
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Consultation History</h1>
            <p className="text-muted-foreground mt-1">View and manage all consultation records</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/consultation">
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
            <div className="flex flex-col gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search patient, ID..." 
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
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={clinicFilter} onValueChange={setClinicFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Clinic" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clinics</SelectItem>
                    {CLINICS.map(clinic => (
                      <SelectItem key={clinic} value={clinic}>{clinic}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {paginatedConsultations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <History className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              {searchQuery ? (
                <>
                  <p className="text-lg font-medium mb-1">No consultations found for "{searchQuery}"</p>
                  <p className="text-sm text-muted-foreground">Try adjusting your search terms or filters</p>
                </>
              ) : statusFilter !== "all" ? (
                <>
                  <p className="text-lg font-medium mb-1">No {statusFilter.replace("-", " ")} consultations</p>
                  <p className="text-sm text-muted-foreground">Try selecting "All Status" to see all consultations</p>
                </>
              ) : dateFilter !== "all" ? (
                <>
                  <p className="text-lg font-medium mb-1">No consultations for {dateFilter}</p>
                  <p className="text-sm text-muted-foreground">Try selecting "All Time" to see all consultations</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium mb-1">No consultations found</p>
                  <p className="text-sm text-muted-foreground">Consultations will appear here once patients are seen</p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {paginatedConsultations.map((c) => {
              const isEditable = canEditConsultation(c);
              const isCompleted = c.status === "Completed";
              const borderColor = isEditable
                ? "border-l-emerald-500"
                : isCompleted
                  ? "border-l-emerald-500"
                  : "border-l-amber-500";
              const avatarBg = isCompleted ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-amber-100 dark:bg-amber-900/30";
              const avatarText = isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300";

              const initials = (c.patient || "P")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((n) => n[0]!)
                .join("")
                .toUpperCase();

              const diagnosisSummary = (() => {
                if (c.diagnosisCodes && c.diagnosisCodes.length > 0) {
                  const codes = c.diagnosisCodes.map((dx) => dx.code).filter(Boolean);
                  const shown = codes.slice(0, 3).join(", ");
                  const extra = codes.length > 3 ? ` (+${codes.length - 3})` : "";
                  return `${shown}${extra}`.trim();
                }
                if (c.diagnosis && c.diagnosis.trim()) return c.diagnosis.trim();
                return "";
              })();

              return (
                <Card
                  key={c.id}
                  className={`border-l-4 ${borderColor} hover:shadow-md transition-shadow ${
                    isEditable ? "bg-emerald-50/30 dark:bg-emerald-900/10" : ""
                  }`}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar (Manage Visits pattern) */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${avatarBg}`}>
                        <span className={`font-semibold text-xs ${avatarText}`}>{initials}</span>
                      </div>

                      {/* Details (Manage Visits pattern) */}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        {/* Row 1: Name + Badges */}
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-foreground text-sm truncate">{c.patient}</h3>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            {c.clinic}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusBadge(c.status)}`}>
                            {c.status}
                          </Badge>
                        </div>

                        {/* Row 2: IDs + Room + Doctor + Date/Time */}
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {c.patientId}
                          {c.visitDisplayId ? ` • ${c.visitDisplayId}` : ""}
                          {c.room ? ` • ${c.room}` : ""}
                          {c.doctor ? ` • ${c.doctor}` : ""}
                          {c.date ? ` • ${c.date}${c.time ? ` ${c.time}` : ""}` : ""}
                        </p>

                        {/* Row 3: Diagnosis summary (like Notes in Manage Visits) */}
                        {(diagnosisSummary || true) && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            <span className="font-medium">Diagnosis:</span>{" "}
                            {diagnosisSummary ? diagnosisSummary : <span className="text-amber-600">No diagnosis recorded</span>}
                          </p>
                        )}
                      </div>

                      {/* Actions (Manage Visits pattern) */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openViewModal(c)}
                          title="View Consultation"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditModal(c)}
                          title={isEditable ? "Edit Consultation" : "Consultation can only be edited within 48 hours"}
                          disabled={!isEditable}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>

                        {isCompleted && (
                          <div className="h-7 w-7 flex items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                        )}

                        {isEditable && <div className="w-2 h-2 bg-emerald-500 rounded-full" title="Editable (within 48 hours)" />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {paginatedConsultations.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName={"consultations"}
            />
          </Card>
        )}

        {/* Consultation Report modal (same as Patient Medical Records View Report) */}
        <ConsultationReportModal
          open={showViewModal}
          onOpenChange={setShowViewModal}
          session={reportSession}
          loading={loadingReport}
        />

        {/* Edit Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5 text-emerald-500" />Edit Consultation</DialogTitle>
              <DialogDescription>Update consultation details and add prescriptions or investigations for {selectedConsultation?.patient}</DialogDescription>
            </DialogHeader>
            {selectedConsultation && (
              <Tabs value={editActiveTab} onValueChange={setEditActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
                  <TabsTrigger value="prescriptions" className="text-xs">Prescriptions</TabsTrigger>
                  <TabsTrigger value="lab" className="text-xs">Lab</TabsTrigger>
                  <TabsTrigger value="radiology" className="text-xs">Radiology</TabsTrigger>
                  <TabsTrigger value="physio" className="text-xs">Physio</TabsTrigger>
                </TabsList>
                <TabsContent value="notes" className="space-y-4 mt-4">
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <span className="text-muted-foreground">ID:</span> <span className="font-medium">{selectedConsultation.id}</span>
                    <span className="ml-4 text-muted-foreground">Date:</span> <span className="font-medium">{selectedConsultation.date}</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Diagnosis (ICD-10)</Label>
                      <Button variant="outline" size="sm" onClick={() => setShowAddDiagnosisInEdit(true)}>
                        <Plus className="h-4 w-4 mr-1" />Add Diagnosis
                      </Button>
                    </div>
                    {editForm.diagnosisCodes.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground">
                        <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No diagnoses added yet</p>
                        <p className="text-xs">Click "Add Diagnosis" to add ICD-10 codes</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {editForm.diagnosisCodes.map((dx) => (
                          <div key={dx.id} className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${
                            dx.type === 'Primary' ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800' :
                            dx.type === 'Secondary' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' :
                            'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                          }`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className={`text-xs ${
                                  dx.type === 'Primary' ? 'bg-rose-500/10 text-rose-600 border-rose-500/30' :
                                  dx.type === 'Secondary' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                                  'bg-blue-500/10 text-blue-600 border-blue-500/30'
                                }`}>{dx.type}</Badge>
                                <span className="font-mono text-sm font-medium">{dx.code}</span>
                              </div>
                              <p className="text-sm font-medium">{dx.name}</p>
                              {dx.notes && <p className="text-xs text-muted-foreground mt-1">{dx.notes}</p>}
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditForm(prev => ({ ...prev, diagnosisCodes: prev.diagnosisCodes.filter(d => d.id !== dx.id) }))}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div><Label>Presentation Complaint</Label><Textarea value={editForm.presentationComplaint} onChange={(e) => setEditForm(prev => ({ ...prev, presentationComplaint: e.target.value }))} placeholder="Chief complaint or presenting symptoms..." rows={2} className="mt-1" /></div>
                  <div><Label>History of Present Illness</Label><Textarea value={editForm.historyOfPresentIllness} onChange={(e) => setEditForm(prev => ({ ...prev, historyOfPresentIllness: e.target.value }))} placeholder="Detailed history..." rows={3} className="mt-1" /></div>
                  <div><Label>Physical Examination</Label><Textarea value={editForm.physicalExamination} onChange={(e) => setEditForm(prev => ({ ...prev, physicalExamination: e.target.value }))} placeholder="Examination findings..." rows={3} className="mt-1" /></div>
                  <div><Label>Assessment</Label><Textarea value={editForm.assessment} onChange={(e) => setEditForm(prev => ({ ...prev, assessment: e.target.value }))} placeholder="Clinical assessment and reasoning..." rows={3} className="mt-1" /></div>
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
                </TabsContent>
                <TabsContent value="prescriptions" className="mt-4">
                  {loadingOrders ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Prescriptions (this session)</Label>
                        <Button variant="outline" size="sm" onClick={() => setShowAddPrescription(true)}><Plus className="h-4 w-4 mr-1" />Add prescription</Button>
                      </div>
                      {editPrescriptions.length === 0 ? (
                        <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground text-sm">No prescriptions for this consultation. Click Add prescription to create one.</div>
                      ) : (
                        <ul className="space-y-2">
                          {editPrescriptions.map((rx: any) => {
                            const items = rx.medications || rx.items || [];
                            return (
                              <li key={rx.id} className="p-3 rounded-lg border bg-muted/30 text-sm">
                                <span className="font-medium">{rx.prescription_id || `#${rx.id}`}</span>
                                {items.length ? (
                                  <ul className="mt-1 text-muted-foreground">
                                    {items.map((m: any, i: number) => (
                                      <li key={i}>{m.medication_name || m.name} — {m.dosage} {m.frequency} {m.duration}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-1 text-muted-foreground">—</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="lab" className="mt-4">
                  {loadingOrders ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Lab orders (this session)</Label>
                        <Button variant="outline" size="sm" onClick={() => setShowAddLabOrder(true)}><Plus className="h-4 w-4 mr-1" />Add lab order</Button>
                      </div>
                      {editLabOrders.length === 0 ? (
                        <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground text-sm">No lab orders. Click Add lab order to create one.</div>
                      ) : (
                        <ul className="space-y-2">
                          {editLabOrders.map((order: any) => (
                            <li key={order.id} className="p-3 rounded-lg border bg-muted/30 text-sm">
                              <span className="font-medium">{order.order_id || `#${order.id}`}</span>
                              <p className="text-muted-foreground mt-1">{order.tests?.map((t: any) => t.name || t.template?.name).filter(Boolean).join(', ') || '—'}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="radiology" className="mt-4">
                  {loadingOrders ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Radiology orders (this session)</Label>
                        <Button variant="outline" size="sm" onClick={() => setShowAddRadiologyOrder(true)}><Plus className="h-4 w-4 mr-1" />Add radiology order</Button>
                      </div>
                      {editRadiologyOrders.length === 0 ? (
                        <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground text-sm">No radiology orders. Click Add radiology order to create one.</div>
                      ) : (
                        <ul className="space-y-2">
                          {editRadiologyOrders.map((order: any) => (
                            <li key={order.id} className="p-3 rounded-lg border bg-muted/30 text-sm">
                              <span className="font-medium">{order.order_id || `#${order.id}`}</span>
                              <p className="text-muted-foreground mt-1">{order.studies?.map((s: any) => s.procedure).filter(Boolean).join(', ') || '—'}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="physio" className="mt-4">
                  {loadingOrders ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Physiotherapy orders (this session)</Label>
                        <Button variant="outline" size="sm" onClick={() => setShowAddPhysioOrder(true)}><Plus className="h-4 w-4 mr-1" />Add physio order</Button>
                      </div>
                      {editPhysioOrders.length === 0 ? (
                        <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground text-sm">No physio orders. Click Add physio order to create one.</div>
                      ) : (
                        <ul className="space-y-2">
                          {editPhysioOrders.map((order: any) => (
                            <li key={order.id} className="p-3 rounded-lg border bg-muted/30 text-sm">
                              <span className="font-medium">{order.diagnosis || 'Physio order'}</span>
                              {order.chief_complaint && <p className="text-muted-foreground mt-1">{order.chief_complaint}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Diagnosis Dialog in Edit Modal */}
        <Dialog open={showAddDiagnosisInEdit} onOpenChange={(open) => { setShowAddDiagnosisInEdit(open); if (!open) { setDiagnosisSearch(""); setDiagnosisNotes(""); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-rose-500" />
                Add Diagnosis
              </DialogTitle>
              <DialogDescription>
                Search and add ICD-10 diagnosis codes to this consultation
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Diagnosis Type */}
              <div className="space-y-2">
                <Label>Diagnosis Type *</Label>
                <Select value={selectedDiagnosisType} onValueChange={(v) => setSelectedDiagnosisType(v as 'Primary' | 'Secondary' | 'Differential')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Primary">Primary</SelectItem>
                    <SelectItem value="Secondary">Secondary</SelectItem>
                    <SelectItem value="Differential">Differential</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ICD-10 Search */}
              <div className="space-y-2">
                <Label>Search ICD-10 Code *</Label>
                <div className="relative">
                  <Input
                    value={diagnosisSearch}
                    onChange={(e) => {
                      setDiagnosisSearch(e.target.value);
                    }}
                    placeholder="Search ICD-10 codes..."
                  />
                  {diagnosisSearch && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto z-50">
                      {icd10Codes
                        .filter(dx =>
                          dx.code.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
                          dx.name.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
                          dx.category.toLowerCase().includes(diagnosisSearch.toLowerCase())
                        )
                        .slice(0, 10)
                        .map((dx) => (
                          <div
                            key={dx.code}
                            className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                            onClick={() => {
                              const newDiagnosis = {
                                id: `${dx.code}-${Date.now()}`,
                                code: dx.code,
                                name: dx.name,
                                type: selectedDiagnosisType,
                                notes: diagnosisNotes
                              };
                              setEditForm(prev => ({
                                ...prev,
                                diagnosisCodes: [...prev.diagnosisCodes, newDiagnosis]
                              }));
                              setShowAddDiagnosisInEdit(false);
                              setDiagnosisSearch("");
                              setDiagnosisNotes("");
                              toast.success(`Added: ${dx.code} - ${dx.name}`);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-mono text-sm font-medium">{dx.code}</div>
                                <div className="text-sm text-muted-foreground">{dx.name}</div>
                                <div className="text-xs text-muted-foreground">{dx.category}</div>
                              </div>
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        ))}
                      {icd10Codes.filter(dx =>
                        dx.code.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
                        dx.name.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
                        dx.category.toLowerCase().includes(diagnosisSearch.toLowerCase())
                      ).length === 0 && diagnosisSearch && (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No matching ICD-10 codes found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Diagnosis Notes */}
              <div className="space-y-2">
                <Label>Additional Notes (Optional)</Label>
                <Textarea
                  value={diagnosisNotes}
                  onChange={(e) => setDiagnosisNotes(e.target.value)}
                  placeholder="Additional notes about this diagnosis..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDiagnosisInEdit(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Session-style order modals (submit immediately) */}
        <PrescriptionOrderModal
          open={showAddPrescription}
          onOpenChange={setShowAddPrescription}
          patientAllergies={editOrderAllergies}
          onSubmit={handleSubmitPrescription}
          confirmLabel="Submit prescription order"
        />

        <LabOrderModal
          open={showAddLabOrder}
          onOpenChange={setShowAddLabOrder}
          onSubmit={handleSubmitLabOrder}
          confirmLabel="Submit lab order"
        />

        <RadiologyOrderModal
          open={showAddRadiologyOrder}
          onOpenChange={setShowAddRadiologyOrder}
          onSubmit={handleSubmitRadiologyOrder}
          confirmLabel="Submit radiology order"
        />

        <PhysioOrderModal
          open={showAddPhysioOrder}
          onOpenChange={setShowAddPhysioOrder}
          onSubmit={handleSubmitPhysioOrder}
        />
      </div>
    </DashboardLayout>
  );
}
