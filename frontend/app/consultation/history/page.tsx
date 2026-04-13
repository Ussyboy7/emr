"use client";

import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
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
  Users, TrendingUp, ArrowRight, AlertTriangle, RefreshCw, Plus, X, ScanLine
} from "lucide-react";
import Link from "next/link";
import { apiFetch } from '@/lib/api-client';
import { patientService, consultationService, pharmacyService, labService, radiologyService, physioService } from '@/lib/services';
import { loadConsultationReportSession, type ConsultationReportSession } from '@/lib/consultation-report';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { useCurrentUser } from '@/hooks/use-current-user';
import { getVisitServiceClinicsDisplay } from '@/lib/utils/clinic-utils';
import { useOutpatientClinicTypes } from '@/lib/hooks/use-outpatient-clinic-types';
import { ConsultationRecord } from '@/components/consultation/ConsultationDetailModal';
import { ConsultationReportModal } from '@/components/consultation/ConsultationReportModal';
import { PrescriptionOrderModal, type PrescriptionOrderSubmitInput } from "@/components/consultation/orders/PrescriptionOrderModal";
import { LabOrderModal, type LabOrderSubmitInput } from "@/components/consultation/orders/LabOrderModal";
import { RadiologyOrderModal, type RadiologyOrderSubmitInput } from "@/components/consultation/orders/RadiologyOrderModal";
import { PhysioOrderModal, type PhysioOrderSubmitInput } from "@/components/consultation/orders/PhysioOrderModal";
import { NursingOrderModal, type NursingOrderSubmitInput } from "@/components/consultation/orders/NursingOrderModal";

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

const formatLocalYyyyMmDd = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const { names: opdClinicNames } = useOutpatientClinicTypes();
  const { currentUser } = useCurrentUser();
  const [consultations, setConsultations] = useState<ConsultationRecordWithGender[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [clinicFilter, setClinicFilter] = useState("all");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [statsData, setStatsData] = useState({
    today: 0,
    thisWeek: 0,
    inProgress: 0,
    completed: 0,
  });
  
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
  const [editNursingOrders, setEditNursingOrders] = useState<any[]>([]);
  // Local draft prescriptions (like consultation room)
  const [draftPrescriptions, setDraftPrescriptions] = useState<any[]>([]);

  const [loadingOrders, setLoadingOrders] = useState(false);
  const [editActiveTab, setEditActiveTab] = useState('notes');
  // Add-order dialogs (Option A: use session-style modals, submit immediately)
  const [showAddPrescription, setShowAddPrescription] = useState(false);
  const [showAddLabOrder, setShowAddLabOrder] = useState(false);
  const [showAddRadiologyOrder, setShowAddRadiologyOrder] = useState(false);
  const [showAddPhysioOrder, setShowAddPhysioOrder] = useState(false);
  const [showAddNursingOrder, setShowAddNursingOrder] = useState(false);
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

  const buildDateParams = useCallback(() => {
    let date: string | undefined;
    let start_date: string | undefined;
    let end_date: string | undefined;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateFilter === "today") {
      date = formatLocalYyyyMmDd(today);
    } else if (dateFilter === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      start_date = formatLocalYyyyMmDd(weekStart);
      end_date = formatLocalYyyyMmDd(today);
    } else if (dateFilter === "month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      start_date = formatLocalYyyyMmDd(monthStart);
      end_date = formatLocalYyyyMmDd(today);
    }

    return { date, start_date, end_date };
  }, [dateFilter]);

  useEffect(() => {
    const loadConsultations = async () => {
      try {
        setLoading(true);

        const { date, start_date, end_date } = buildDateParams();
        
        // Backend expects status: 'active' | 'completed' | 'cancelled' (not 'in-progress')
        // Load all for date range (like Nursing Pool Queue) - search is client-side
        const apiStatus = statusFilter === 'all' ? undefined : statusFilter === 'in-progress' ? 'active' : statusFilter === 'completed' ? 'completed' : statusFilter;
        const sessionsResult = await consultationService.getSessions({
          page: 1,
          page_size: dateFilter === "month" ? 1000 : 500,
          status: apiStatus,
          clinic: clinicFilter !== "all" ? clinicFilter : undefined,
          date,
          start_date,
          end_date,
        });
        const sessions = sessionsResult.results || [];
        
        // Transform sessions to consultation records
        const transformedConsultations = await Promise.all(sessions.map(async (session: any) => {
          try {
            // IMPORTANT: keep this list page light.
            // Avoid N+1 requests (patients, visits, diagnoses, orders, vitals).
            const startedAt = session.started_at ? new Date(session.started_at) : new Date();
            const visitDate = formatLocalYyyyMmDd(startedAt);
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

            const presentationComplaint = session.presentation_complaint || '';

            return {
              id: String(session.id),
              patient: session.patient_name ?? '',
              patientId: session.patient_id || '',
              patientIdNumeric: session.patient,
              visitId: session.visit,
              visitDisplayId,
              patientGender: session.patient_gender || undefined, // Store gender for filtering
              doctor: doctorName,
              doctorId: doctorId,
              date: visitDate,
              time: visitTime,
              clinic: getVisitServiceClinicsDisplay({
                clinic: session.clinic_name,
                clinics: session.visit_clinics,
              }),
              room: session.room_name || '',
              diagnosis,
              diagnosisCodes,
              presentationComplaint,
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
  }, [statusFilter, clinicFilter, buildDateParams]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const { date, start_date, end_date } = buildDateParams();
        const baseParams = {
          page: 1,
          page_size: 1,
          clinic: clinicFilter !== "all" ? clinicFilter : undefined,
          date,
          start_date,
          end_date,
        };

        const todayDate = formatLocalYyyyMmDd(new Date());
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const thisWeekStart = formatLocalYyyyMmDd(weekStart);

        const [todayRes, thisWeekRes, inProgressRes, completedRes] = await Promise.all([
          consultationService.getSessions({
            page: 1,
            page_size: 1,
            clinic: clinicFilter !== "all" ? clinicFilter : undefined,
            date: todayDate,
          }),
          consultationService.getSessions({
            page: 1,
            page_size: 1,
            clinic: clinicFilter !== "all" ? clinicFilter : undefined,
            start_date: thisWeekStart,
            end_date: todayDate,
          }),
          consultationService.getSessions({ ...baseParams, status: "active" }),
          consultationService.getSessions({ ...baseParams, status: "completed" }),
        ]);

        setStatsData({
          today: todayRes.count || 0,
          thisWeek: thisWeekRes.count || 0,
          inProgress: inProgressRes.count || 0,
          completed: completedRes.count || 0,
        });
      } catch (err) {
        console.error("Error loading consultation stats:", err);
      }
    };

    loadStats();
  }, [clinicFilter, buildDateParams]);

  // Client-side filter and pagination (same as Nursing Pool Queue)
  const filteredConsultations = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim();
    if (!searchLower) return consultations;
    return consultations.filter(
      (c) =>
        (c.patient && c.patient.toLowerCase().includes(searchLower)) ||
        (c.patientId && String(c.patientId).toLowerCase().includes(searchLower)) ||
        (c.visitId != null && String(c.visitId).toLowerCase().includes(searchLower)) ||
        (c.visitDisplayId && c.visitDisplayId.toLowerCase().includes(searchLower)) ||
        (c.doctor && c.doctor.toLowerCase().includes(searchLower)) ||
        (c.clinic && c.clinic.toLowerCase().includes(searchLower))
    );
  }, [consultations, searchQuery]);

  const sortedConsultations = useMemo(
    () =>
      [...filteredConsultations].sort((a, b) => {
        const keyA = `${a.date}T${a.time || "00:00"}`;
        const keyB = `${b.date}T${b.time || "00:00"}`;
        return new Date(keyB).getTime() - new Date(keyA).getTime();
      }),
    [filteredConsultations]
  );

  const paginatedConsultations = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedConsultations.slice(start, start + itemsPerPage);
  }, [sortedConsultations, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, clinicFilter, itemsPerPage]);

  const stats = statsData;

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

  // Load orders, session notes, and diagnoses for Edit modal when it opens (synced with backend)
  useEffect(() => {
    if (!showEditModal || !selectedConsultation) return;
    const sessionId = parseInt(selectedConsultation.id, 10);
    if (isNaN(sessionId)) return;

    const loadOrdersAndSession = async () => {
      setLoadingOrders(true);
      try {
        const [rxRes, labRes, radRes, physioRes, nursingRes, session, diagnosesRes] = await Promise.all([
          pharmacyService.getPrescriptions({ consultation_session: sessionId, page_size: 100 }),
          labService.getOrders({ consultation_session: sessionId, page_size: 100 }),
          radiologyService.getOrders({ consultation_session: sessionId, page_size: 100 }),
          physioService.getOrders({ consultation_session: sessionId, page_size: 100 }),
          apiFetch<{ results: any[] }>(`/nursing/orders/?consultation_session=${sessionId}&page_size=100`),
          consultationService.getSession(sessionId),
          consultationService.getDiagnoses({ session: sessionId, page_size: 100 }),
        ]);
        setEditPrescriptions(rxRes.results || []);
        setEditLabOrders(labRes.results || []);
        setEditRadiologyOrders(radRes.results || []);
        setEditPhysioOrders(physioRes.results || []);
        setEditNursingOrders(nursingRes.results || []);

        // Sync edit form with backend: notes and diagnoses (so Edit shows what was saved in the session)
        const diagnosisList = diagnosesRes?.results || [];
        const diagnosisCodes = diagnosisList.map((d: { id: number; certainty?: string; icd10_code_details?: { code: string; description: string }; diagnosis_text?: string; notes?: string }) => {
          const details = d.icd10_code_details;
          const type = (d.certainty === 'confirmed' ? 'Primary' : d.certainty === 'probable' ? 'Secondary' : 'Differential') as 'Primary' | 'Secondary' | 'Differential';
          return {
            id: String(d.id),
            code: details?.code ?? '',
            name: details?.description ?? d.diagnosis_text ?? '',
            type,
            notes: d.notes ?? '',
          };
        });
        // Coerce session note fields to string; form always reflects backend after fetch
        const safeStr = (v: unknown): string => (v != null && typeof v === 'string' ? v : '');
        setEditForm((prev) => ({
          ...prev,
          presentationComplaint: safeStr(session.presentation_complaint),
          historyOfPresentIllness: safeStr(session.history_of_presenting_illness),
          physicalExamination: safeStr(session.physical_examination),
          assessment: safeStr(session.assessment),
          plan: safeStr(session.plan),
          status: session.status === 'completed' ? 'Completed' : 'In Progress',
          diagnosisCodes,
        }));
      } catch (err) {
        console.error('Error loading orders/session for edit:', err);
        toast.error('Failed to load prescriptions and orders');
      } finally {
        setLoadingOrders(false);
      }
    };
    loadOrdersAndSession();
  }, [showEditModal, selectedConsultation?.id]);

  const loadEditOrdersRefetch = async () => {
    if (!selectedConsultation) return;
    const sessionId = parseInt(selectedConsultation.id, 10);
    if (isNaN(sessionId)) return;
    try {
      const [rxRes, labRes, radRes, physioRes, nursingRes] = await Promise.all([
        pharmacyService.getPrescriptions({ consultation_session: sessionId, page_size: 100 }),
        labService.getOrders({ consultation_session: sessionId, page_size: 100 }),
        radiologyService.getOrders({ consultation_session: sessionId, page_size: 100 }),
        physioService.getOrders({ consultation_session: sessionId, page_size: 100 }),
        apiFetch<{ results: any[] }>(`/nursing/orders/?consultation_session=${sessionId}&page_size=100`),
      ]);
      setEditPrescriptions(rxRes.results || []);
      setEditLabOrders(labRes.results || []);
      setEditRadiologyOrders(radRes.results || []);
      setEditPhysioOrders(physioRes.results || []);
      setEditNursingOrders(nursingRes.results || []);
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

    if (payload.items.length === 0) {
      toast.error('Please select at least one medication');
      return;
    }

    // Debug: Log the payload being sent
    const prescriptionPayload = {
      patient: patientId,
      visit: selectedConsultation.visitId,
      consultation_session: sessionId,
      notes: payload.clinicalIndication || undefined,
      items: payload.items.map((i) => ({
        medication: i.medication,
        generic: i.generic || null, // Add generic ID
        medication_name: i.medication_name,
        quantity: i.quantity,
        unit: i.unit,
        dose: i.dosage, // Use 'dose' not 'dosage'
        frequency: i.frequency,
        duration: i.duration,
        route: i.route || 'Oral',
        instructions: i.instructions,
        dispensed_quantity: 0,
        is_dispensed: false,
      })) as any,
    };

    console.log('Sending prescription payload:', prescriptionPayload);

    try {
      const result = await pharmacyService.createPrescription(prescriptionPayload as any);
      console.log('Prescription created successfully:', result);

      toast.success("Prescription sent to pharmacy");
      await loadEditOrdersRefetch();
    } catch (error) {
      console.error('Error creating prescription:', error);
      toast.error('Failed to create prescription');
    }
  };

  const handleSaveDraftPrescriptions = async () => {
    const patientId = getSelectedPatientId();
    const sessionId = getSelectedSessionId();
    if (!selectedConsultation || !patientId || !sessionId || draftPrescriptions.length === 0) {
      toast.error("Invalid consultation/patient or no drafts to save");
      return;
    }

    setIsSubmitting(true);
    try {
      // Group draft prescriptions by their properties and create actual prescriptions
      // For simplicity, create one prescription with all medications
      await pharmacyService.createPrescription({
        patient: patientId,
        visit: selectedConsultation.visitId,
        consultation_session: sessionId,
        notes: draftPrescriptions[0]?.instructions || undefined,
        medications: draftPrescriptions.map((rx) => ({
          medication: rx.medicationId,
          medication_name: rx.medication,
          quantity: rx.quantity,
          unit: rx.unit,
          dosage: rx.dosage,
          frequency: rx.frequency,
          duration: rx.duration,
          route: rx.route,
          instructions: rx.instructions,
          dispensed_quantity: 0,
          is_dispensed: false,
        })) as any,
      } as any);

      setDraftPrescriptions([]);
      toast.success("Prescriptions saved to pharmacy");
      await loadEditOrdersRefetch();
    } catch (error) {
      console.error('Error saving draft prescriptions:', error);
      toast.error('Failed to save prescriptions');
    } finally {
      setIsSubmitting(false);
    }
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
        code:
          t.code ||
          t.name
            .substring(0, 24)
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "_")
            .replace(/^_|_$/g, "") ||
          "LAB",
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
        template: t.id,
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
      referral_source: 'doctor',
    } as any);
    toast.success("Physiotherapy order added");
    await loadEditOrdersRefetch();
  };

  const handleSubmitNursingOrder = async (payload: NursingOrderSubmitInput) => {
    const patientId = getSelectedPatientId();
    const sessionId = getSelectedSessionId();
    if (!selectedConsultation || !patientId || !sessionId) {
      toast.error("Invalid consultation/patient");
      return;
    }

    const priorityMap: Record<string, "low" | "medium" | "high" | "urgent"> = {
      Routine: "low",
      Urgent: "high",
      STAT: "urgent",
    };

    let description = payload.instructions;
    let orderTypeForApi: string = payload.type;

    if (payload.type === "Observation Admission") {
      orderTypeForApi = "observation admission";
      description = `Observation admission (Day Care) to ${payload.ward}. Diagnosis: ${payload.admissionDiagnosis}. Presenting complaint: ${payload.presentingComplaint || "N/A"}. ${payload.instructions}`;
    } else if (payload.type === "Injection" && payload.medication) {
      description = `${payload.medication} - ${payload.dosage || ""} via ${payload.route || ""}. ${payload.instructions}`;
    } else if (payload.type === "Dressing") {
      description = `${payload.woundType || "Wound"} dressing at ${payload.woundLocation || "site"}. ${payload.instructions}`;
    } else if (payload.type === "IV Infusion" && payload.medication) {
      description = `IV Infusion: ${payload.medication}${payload.dosage ? ` — ${payload.dosage}` : ""}. ${payload.instructions}`;
    }

    await apiFetch("/nursing/orders/", {
      method: "POST",
      body: JSON.stringify({
        patient: patientId,
        visit: selectedConsultation.visitId,
        consultation_session: sessionId,
        ordered_by: currentUser?.id ? Number(currentUser.id) : undefined,
        order_type: orderTypeForApi,
        description,
        frequency: payload.type === "Injection" ? "As ordered" : "",
        duration: "",
        status: "pending",
        priority: priorityMap[payload.priority] || "medium",
      }),
    });

    toast.success("Nursing order added");
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

        {/* Stats: Today | This Week | In Progress | Completed */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.today}</p>
                </div>
                <Calendar className="h-8 w-8 text-blue-500/80" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-slate-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">This Week</p>
                  <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{stats.thisWeek}</p>
                </div>
                <History className="h-8 w-8 text-slate-500/80" />
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
                <Activity className="h-8 w-8 text-amber-500/80" />
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
                <CheckCircle2 className="h-8 w-8 text-emerald-500/80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by patient name, visit ID, or patient ID..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                    {opdClinicNames.map((clinic) => (
                      <SelectItem key={clinic} value={clinic}>
                        {clinic}
                      </SelectItem>
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
              totalItems={sortedConsultations.length}
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
        <Dialog open={showEditModal} onOpenChange={(open) => {
          setShowEditModal(open);
          if (!open) {
            setDraftPrescriptions([]);
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-emerald-500" />
                Edit Consultation
              </DialogTitle>
              <DialogDescription className="space-y-1">
                <span>Update consultation details and add prescriptions or investigations for <strong className="text-foreground">{selectedConsultation?.patient ?? 'Unknown'}</strong>.</span>
                {selectedConsultation && (
                  <span className="block text-xs text-muted-foreground mt-1">
                    Session #{selectedConsultation.id} · {selectedConsultation.date}{selectedConsultation.time ? ` · ${selectedConsultation.time}` : ''}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            {selectedConsultation && (
              <Tabs value={editActiveTab} onValueChange={setEditActiveTab} className="w-full mt-2">
                <TabsList className="grid w-full grid-cols-6 h-10 gap-1 p-1">
                  <TabsTrigger value="notes" className="text-xs sm:text-sm flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    Notes
                  </TabsTrigger>
                  <TabsTrigger value="prescriptions" className="text-xs sm:text-sm flex items-center gap-1">
                    <Pill className="h-3.5 w-3.5" />
                    Prescriptions
                  </TabsTrigger>
                  <TabsTrigger value="lab" className="text-xs sm:text-sm flex items-center gap-1">
                    <TestTube className="h-3.5 w-3.5" />
                    Lab
                  </TabsTrigger>
                  <TabsTrigger value="radiology" className="text-xs sm:text-sm flex items-center gap-1">
                    <ScanLine className="h-3.5 w-3.5" />
                    Radiology
                  </TabsTrigger>
                  <TabsTrigger value="physio" className="text-xs sm:text-sm flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" />
                    Physio
                  </TabsTrigger>
                  <TabsTrigger value="nursing" className="text-xs sm:text-sm flex items-center gap-1">
                    <Syringe className="h-3.5 w-3.5" />
                    Nursing
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="notes" className="space-y-5 mt-5">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-emerald-500" />
                        Medical Notes
                      </CardTitle>
                      <CardDescription>Document the consultation findings and plan</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Match consultation room order: Presentation → HPI → Exam → Diagnosis → Assessment → Plan → Status */}
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label>Presentation Complaint</Label>
                          <Textarea value={editForm.presentationComplaint} onChange={(e) => setEditForm(prev => ({ ...prev, presentationComplaint: e.target.value }))} placeholder="Chief complaint or presenting symptoms..." rows={3} className="mt-0" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>History of Present Illness</Label>
                          <Textarea value={editForm.historyOfPresentIllness} onChange={(e) => setEditForm(prev => ({ ...prev, historyOfPresentIllness: e.target.value }))} placeholder="Detailed history..." rows={4} className="mt-0" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Physical Examination</Label>
                          <Textarea value={editForm.physicalExamination} onChange={(e) => setEditForm(prev => ({ ...prev, physicalExamination: e.target.value }))} placeholder="Examination findings..." rows={4} className="mt-0" />
                        </div>
                      </div>

                      <div className="space-y-3 pt-2 border-t">
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
                            <p className="text-xs">Click &quot;Add Diagnosis&quot; to add ICD-10 codes</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {editForm.diagnosisCodes.map((dx) => {
                              const typeStyles = dx.type === 'Primary' ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800' : dx.type === 'Secondary' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
                              const typeBadgeStyles = dx.type === 'Primary' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700' : dx.type === 'Secondary' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700' : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700';
                              return (
                                <div key={dx.id} className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${typeStyles}`}>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                      <Badge variant="outline" className={`text-xs font-medium shrink-0 ${typeBadgeStyles}`}>{dx.type}</Badge>
                                      <span className="font-mono text-sm font-semibold text-foreground">{dx.code}</span>
                                    </div>
                                    <p className="text-sm text-foreground/90 leading-snug">{dx.name}</p>
                                    {dx.notes && <p className="text-xs text-muted-foreground mt-1.5">{dx.notes}</p>}
                                  </div>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0 rounded-full" onClick={() => setEditForm(prev => ({ ...prev, diagnosisCodes: prev.diagnosisCodes.filter(d => d.id !== dx.id) }))} title="Remove diagnosis">
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                          )}

                          {/* Draft Prescriptions */}
                          {draftPrescriptions.length > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400">Draft Prescriptions</h4>
                                <Button size="sm" onClick={handleSaveDraftPrescriptions} disabled={isSubmitting}>
                                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                  Save to Pharmacy
                                </Button>
                              </div>
                              <ul className="space-y-2">
                                {draftPrescriptions.map((rx: any) => (
                                  <li key={rx.id} className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 text-sm">
                                    <div className="flex items-center justify-between mb-2">
                                      <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">Draft</Badge>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDraftPrescriptions(prev => prev.filter(p => p.id !== rx.id))}
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <div className="space-y-0.5">
                                      <div>{rx.medication} — {rx.dosage} {rx.frequency} {rx.duration}</div>
                                      {rx.instructions && <div className="text-xs text-muted-foreground mt-1">{rx.instructions}</div>}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                        </div>
                      <div className="space-y-3 pt-2 border-t">
                        <div className="space-y-1.5">
                          <Label>Assessment</Label>
                          <Textarea value={editForm.assessment} onChange={(e) => setEditForm(prev => ({ ...prev, assessment: e.target.value }))} placeholder="Clinical assessment and reasoning..." rows={3} className="mt-0" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Plan</Label>
                          <Textarea value={editForm.plan} onChange={(e) => setEditForm(prev => ({ ...prev, plan: e.target.value }))} placeholder="Treatment plan, follow-up instructions..." rows={4} className="mt-0" />
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t">
                        <Label>Status</Label>
                        <Select value={editForm.status} onValueChange={(v) => setEditForm(prev => ({ ...prev, status: v as "Completed" | "In Progress" }))}>
                          <SelectTrigger className="mt-0 w-full max-w-[200px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="prescriptions" className="mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Pill className="h-5 w-5 text-violet-500" />
                            Prescriptions
                          </CardTitle>
                          <CardDescription>Prescribe medications - will be sent to Pharmacy queue</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setShowAddPrescription(true)}>
                          <Plus className="h-4 w-4 mr-1" />Add Medication
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {loadingOrders ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                      ) : editPrescriptions.length === 0 && draftPrescriptions.length === 0 ? (
                        <div className="text-center py-12 bg-gradient-to-b from-violet-50 to-violet-100/50 dark:from-violet-900/10 dark:to-violet-900/5 rounded-lg border-2 border-dashed border-violet-200 dark:border-violet-800">
                          <Pill className="h-12 w-12 mx-auto mb-3 text-violet-500 opacity-60" />
                          <p className="font-medium text-violet-900 dark:text-violet-100 mb-1">No prescriptions yet</p>
                          <p className="text-sm text-muted-foreground mb-4">Add medications to be sent to the Pharmacy</p>
                          <Button variant="outline" size="sm" onClick={() => setShowAddPrescription(true)} className="border-violet-300 text-violet-700 hover:bg-violet-100">
                            <Plus className="h-4 w-4 mr-1" />Add First Medication
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Existing Prescriptions */}
                          {editPrescriptions.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-muted-foreground mb-2">Existing Prescriptions</h4>
                              <ul className="space-y-2">
                                {editPrescriptions.map((rx: any) => {
                                  const items = rx.medications || rx.items || [];
                                  return (
                                    <li key={rx.id} className="p-3 rounded-lg border bg-muted/30 text-sm">
                                      <div className="flex items-center justify-between mb-2">
                                        <Badge variant="outline" className="text-xs">{rx.status}</Badge>
                                        <span className="text-xs text-muted-foreground">{new Date(rx.prescribed_at).toLocaleDateString()}</span>
                                      </div>
                                      {items.length ? (
                                        <ul className="space-y-0.5">
                                          {items.map((m: any, i: number) => (
                                            <li key={i}>{m.medication_name || m.name} — {m.dosage} {m.frequency} {m.duration}</li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="text-muted-foreground text-xs">No medications on this prescription</p>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                        <h4 className="font-medium text-violet-900 dark:text-violet-100 mb-2 flex items-center gap-2">
                          <Activity className="h-4 w-4" />Prescription Workflow
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300 flex-wrap">
                          <Badge variant="outline" className="bg-violet-100 dark:bg-violet-900/30">Ordered</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Processing</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Dispensed ✓</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="lab" className="mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <TestTube className="h-5 w-5 text-blue-500" />
                            Lab Orders
                          </CardTitle>
                          <CardDescription>Request laboratory tests - Orders are sent to Lab Tech queue</CardDescription>
                        </div>
                        <Button size="sm" onClick={() => setShowAddLabOrder(true)} className="bg-amber-500 hover:bg-amber-600">
                          <Plus className="h-4 w-4 mr-1" />Add Test
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {loadingOrders ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                      ) : editLabOrders.length === 0 ? (
                        <div className="text-center py-12 bg-gradient-to-b from-amber-50 to-amber-100/50 dark:from-amber-900/10 dark:to-amber-900/5 rounded-lg border-2 border-dashed border-amber-200 dark:border-amber-800">
                          <TestTube className="h-12 w-12 mx-auto mb-3 text-amber-500 opacity-60" />
                          <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">No lab orders yet</p>
                          <p className="text-sm text-muted-foreground mb-4">Order tests to be processed by the lab</p>
                          <Button variant="outline" size="sm" onClick={() => setShowAddLabOrder(true)} className="border-amber-300 text-amber-700 hover:bg-amber-100">
                            <Plus className="h-4 w-4 mr-1" />Order First Test
                          </Button>
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {editLabOrders.map((order: any) => (
                            <li key={order.id} className="p-3 rounded-lg border bg-muted/30 text-sm">
                              <span className="font-medium">{order.order_id || `#${order.id}`}</span>
                              {(() => {
                                const testsLine = order.tests?.map((t: any) => t.name || t.template?.name).filter(Boolean).join(', ');
                                return testsLine ? (
                                  <p className="text-muted-foreground mt-1">{testsLine}</p>
                                ) : null;
                              })()}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                          <Activity className="h-4 w-4" />Lab Order Workflow
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 flex-wrap">
                          <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Ordered</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">Results Ready</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Verified ✓</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="radiology" className="mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <ScanLine className="h-5 w-5 text-indigo-500" />
                            Radiology Orders
                          </CardTitle>
                          <CardDescription>Order imaging studies - X-rays, CT, MRI, Ultrasound</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setShowAddRadiologyOrder(true)}>
                          <Plus className="h-4 w-4 mr-1" />Add Imaging
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {loadingOrders ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                      ) : editRadiologyOrders.length === 0 ? (
                        <div className="text-center py-12 bg-gradient-to-b from-indigo-50 to-indigo-100/50 dark:from-indigo-900/10 dark:to-indigo-900/5 rounded-lg border-2 border-dashed border-indigo-200 dark:border-indigo-800">
                          <ScanLine className="h-12 w-12 mx-auto mb-3 text-indigo-500 opacity-60" />
                          <p className="font-medium text-indigo-900 dark:text-indigo-100 mb-1">No radiology orders yet</p>
                          <p className="text-sm text-muted-foreground mb-4">Order imaging studies for diagnosis</p>
                          <Button variant="outline" size="sm" onClick={() => setShowAddRadiologyOrder(true)} className="border-indigo-300 text-indigo-700 hover:bg-indigo-100">
                            <Plus className="h-4 w-4 mr-1" />Add First Order
                          </Button>
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {editRadiologyOrders.map((order: any) => (
                            <li key={order.id} className="p-3 rounded-lg border bg-muted/30 text-sm">
                              <span className="font-medium">{order.order_id || `#${order.id}`}</span>
                              {(() => {
                                const studiesLine = order.studies?.map((s: any) => s.procedure).filter(Boolean).join(', ');
                                return studiesLine ? (
                                  <p className="text-muted-foreground mt-1">{studiesLine}</p>
                                ) : null;
                              })()}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                        <h4 className="font-medium text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
                          <Activity className="h-4 w-4" />Radiology Order Workflow
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 flex-wrap">
                          <Badge variant="outline" className="bg-indigo-100 dark:bg-indigo-900/30">Ordered</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Scheduled</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="physio" className="mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-teal-500" />
                            Physiotherapy Orders
                          </CardTitle>
                          <CardDescription>
                            Order physiotherapy treatment sessions — will be sent to Physiotherapy pool queue.
                          </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setShowAddPhysioOrder(true)}>
                          <Plus className="h-4 w-4 mr-1" />Add Physio Order
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {loadingOrders ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                      ) : editPhysioOrders.length === 0 ? (
                        <div className="text-center py-12 bg-gradient-to-b from-emerald-50 to-emerald-100/50 dark:from-emerald-900/10 dark:to-emerald-900/5 rounded-lg border-2 border-dashed border-emerald-200 dark:border-emerald-800">
                          <Activity className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-60" />
                          <p className="font-medium text-emerald-900 dark:text-emerald-100 mb-1">No physiotherapy orders yet</p>
                          <p className="text-sm text-muted-foreground mb-4">Order physiotherapy treatment sessions</p>
                          <Button variant="outline" size="sm" onClick={() => setShowAddPhysioOrder(true)} className="border-emerald-300 text-emerald-700 hover:bg-emerald-100">
                            <Plus className="h-4 w-4 mr-1" />Add First Physio Order
                          </Button>
                        </div>
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
                      <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <h4 className="font-medium text-emerald-900 dark:text-emerald-100 mb-2 flex items-center gap-2">
                          <Activity className="h-4 w-4" />Physio Workflow
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 flex-wrap">
                          <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Sent</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Scheduled</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">In Progress</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="nursing" className="mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Syringe className="h-5 w-5 text-cyan-500" />
                            Nursing Orders
                          </CardTitle>
                          <CardDescription>Request nursing procedures - will be sent to Nursing queue.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setShowAddNursingOrder(true)}>
                          <Plus className="h-4 w-4 mr-1" />Add Nursing Order
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {loadingOrders ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                      ) : editNursingOrders.length === 0 ? (
                        <div className="text-center py-12 bg-gradient-to-b from-cyan-50 to-cyan-100/50 dark:from-cyan-900/10 dark:to-cyan-900/5 rounded-lg border-2 border-dashed border-cyan-200 dark:border-cyan-800">
                          <Syringe className="h-12 w-12 mx-auto mb-3 text-cyan-500 opacity-60" />
                          <p className="font-medium text-cyan-900 dark:text-cyan-100 mb-1">No nursing orders yet</p>
                          <p className="text-sm text-muted-foreground mb-4">Add procedures to be sent to Nursing</p>
                          <Button variant="outline" size="sm" onClick={() => setShowAddNursingOrder(true)} className="border-cyan-300 text-cyan-700 hover:bg-cyan-100">
                            <Plus className="h-4 w-4 mr-1" />Add First Nursing Order
                          </Button>
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {editNursingOrders.map((order: any) => (
                            <li key={order.id} className="p-3 rounded-lg border bg-muted/30 text-sm">
                              <span className="font-medium capitalize">{order.order_type || ''}</span>
                              {order.description ? (
                                <p className="text-muted-foreground mt-1">{order.description}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="p-4 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
                        <h4 className="font-medium text-cyan-900 dark:text-cyan-100 mb-2 flex items-center gap-2">
                          <Activity className="h-4 w-4" />Nursing Order Workflow
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300 flex-wrap">
                          <Badge variant="outline" className="bg-cyan-100 dark:bg-cyan-900/30">Ordered</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">In Progress</Badge>
                          <span>→</span>
                          <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
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
        />

        <LabOrderModal
          open={showAddLabOrder}
          onOpenChange={setShowAddLabOrder}
          onSubmit={handleSubmitLabOrder}
        />

        <RadiologyOrderModal
          open={showAddRadiologyOrder}
          onOpenChange={setShowAddRadiologyOrder}
          onSubmit={handleSubmitRadiologyOrder}
        />

        <PhysioOrderModal
          open={showAddPhysioOrder}
          onOpenChange={setShowAddPhysioOrder}
          onSubmit={handleSubmitPhysioOrder}
        />

        <NursingOrderModal
          open={showAddNursingOrder}
          onOpenChange={setShowAddNursingOrder}
          onSubmit={handleSubmitNursingOrder}
        />
      </div>
    </DashboardLayout>
  );
}
