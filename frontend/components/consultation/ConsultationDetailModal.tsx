"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Stethoscope, Printer, Edit, CheckCircle2, Loader2, User, Activity, FlaskConical, Syringe, Pill, Download, Calendar, FileText, ScanLine, AlertTriangle
} from "lucide-react";
import { apiFetch } from '@/lib/api-client';
import { patientService, wardService, physioService, labService } from '@/lib/services';
import { toast } from 'sonner';
import { LabOrderModal, type LabOrderSubmitInput } from '@/components/consultation/orders/LabOrderModal';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export interface WardAdmission {
  id: number;
  admission_id: string;
  patient: number;
  patient_name?: string;
  ward: number;
  ward_name: string;
  bed?: number;
  bed_number?: string;
  admission_type: string; // Allow any string from API
  admitting_doctor?: number;
  admitting_doctor_name?: string;
  admission_date: string;
  admission_diagnosis: string;
  presenting_complaint?: string;
  status: string; // Allow any string status from API
  current_condition?: string;
  discharge_date?: string;
  discharge_type?: string; // Allow any string from API
  discharge_diagnosis?: string;
  discharge_notes?: string;
  discharge_doctor?: number;
  length_of_stay: number;
}

export interface NursingOrder {
  id: string;
  type: string; // Allow any string type from API
  instructions: string;
  priority: string; // Allow any string priority from API
  status: string; // Allow any string status from API
  orderedBy: string;
  createdAt: string;
  patient?: number;
  visit?: number;
  consultation_session?: number;
}

export interface VitalsRecord {
  id: string;
  date: string;
  time: string;
  systolic: number;
  diastolic: number;
  heartRate: number;
  temperature: number;
  respiratoryRate: number;
  oxygenSaturation: number;
  weight?: number;
  height?: number;
  bmi?: number;
  painScale?: number;
  bloodSugar?: number;
  recordedBy?: string;
  notes?: string;
  bloodPressureSystolic?: number; // Keep for compatibility
  bloodPressureDiastolic?: number; // Keep for compatibility
}

export interface TimelineEvent {
  time: string; // ISO string for sorting
  event: string;
  description: string;
  type: 'visit' | 'consultation' | 'vitals' | 'prescription' | 'lab_order' | 'radiology_order' | 'nursing_order';
}

export interface ConsultationRecord {
  id: string;
  type?: 'visit' | 'consultation';
  patient: string;
  patientId: string;
  /** Numeric patient id for API (e.g. create prescription/orders). */
  patientIdNumeric?: number;
  /** Visit id for API when adding orders from Edit modal. */
  visitId?: number;
  patientAge?: number;
  patientGender?: string;
  doctor: string;
  doctorId: string;
  doctorSpecialty?: string;
  date: string;
  time: string;
  clinic: string;
  room: string;
  diagnosis: string;
  presentationComplaint?: string;
  diagnosisCodes?: { code: string; description: string; type: 'Primary' | 'Secondary' | 'Differential' }[];
  status: "Completed" | "In Progress";
  priority: string;
  sessionDuration: number;
  historyOfPresentIllness: string;
  physicalExamination: string;
  assessment: string;
  plan: string;
  vitals: VitalsRecord[]; // Properly typed
  prescriptions: {
    id: string;
    medication: string;
    strength: string;
    form: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
    quantity?: string;
  }[];
  labOrders: {
    id: string;
    test: string;
    priority: string;
    instructions: string;
    status: string;
    orderedBy: string;
    createdAt: string;
    result?: string;
  }[];
  radiologyOrders?: {
    id: string;
    study: string;
    priority: string;
    instructions: string;
    status: string;
    orderedBy: string;
    createdAt: string;
    result?: string;
  }[];
  physioOrders?: {
    id: string;
    diagnosis: string;
    chiefComplaint?: string;
    priority: string;
    status: string;
  }[];
  nursingOrders: NursingOrder[]; // Properly typed
  timeline: TimelineEvent[]; // Properly typed
  followUpDate?: string;
  followUpNotes?: string;
}

export interface VisitData {
  id: number;
  visit_id: string;
  patient: number;
  patient_name?: string;
  doctor?: number;
  doctor_name?: string;
  doctor_specialty?: string;
  date: string;
  time?: string;
  visit_date?: string;
  visit_time?: string;
  visit_type: string;
  department?: string;
  status: string;
  notes?: string;
  clinic?: string;
  clinic_name?: string;
  room?: number;
  room_name?: string;
  diagnosis?: string;
  priority?: string;
}

export interface ApiResponse<T> {
  results: T[];
  count: number;
}

export interface UserData {
  id: number;
  username: string;
  full_name?: string;
  email?: string;
}

export interface ConsultationSessionData {
  id: number;
  session_id?: string;
  patient: number;
  patient_name?: string;
  doctor?: number;
  doctor_name?: string;
  doctor_specialty?: string;
  room?: number;
  room_name?: string;
  status: string; // Allow any string status
  presentation_complaint?: string;
  history_of_presenting_illness?: string;
  physical_examination?: string;
  assessment?: string;
  plan?: string;
  started_at?: string;
  ended_at?: string;
  visit?: number;
  notes?: string;
  priority?: string;
  created_by?: number;
  created_by_name?: string;
  clinic?: string;
  date?: string;
  time?: string;
}

export interface PrescriptionData {
  id: number;
  medication_name?: string;
  medication?: { name: string };
  strength?: string;
  form?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  quantity?: string;
  created_at?: string;
}

export interface LabOrderData {
  id: number;
  test_name?: string;
  test?: string;
  name?: string;
  tests?: Array<{
    id: string;
    test?: string;
    name?: string;
    test_name?: string;
    priority?: string;
    instructions?: string;
    notes?: string;
    status?: string;
    result?: string;
    results?: any;
    created_at?: string;
    template?: { name?: string };
  }>;
  created_at?: string;
  priority?: string;
  clinical_notes?: string;
  doctor_name?: string;
  created_by_name?: string;
  ordered_at?: string;
  status?: string;
}

export interface RadiologyOrderData {
  id: number;
  studies?: Array<{
    id: string;
    study: string;
    priority: string;
    instructions?: string;
    status: string;
    result?: string;
    created_at?: string;
  }>;
  created_at?: string;
}

export interface NursingOrderData {
  id: string;
  type: string;
  instructions: string;
  priority: string;
  status: string;
  orderedBy: string;
  createdAt: string;
  patient?: number;
  visit?: number;
  consultation_session?: number;
}

export interface VitalsData {
  id: string;
  date: any; // Allow any type for date
  time: any; // Allow any type for time
  systolic: any; // Allow any type for blood pressure
  diastolic: any; // Allow any type for blood pressure
  heartRate: any; // Allow any type
  temperature: number;
  respiratoryRate: any; // Allow any type
  oxygenSaturation: number;
  weight?: number;
  height?: number;
  bmi?: number;
  painScale?: any; // Allow any type
  bloodSugar?: any; // Allow any type
  recordedBy?: any; // Allow any type
  notes?: any; // Allow any type
  comment?: any; // Alternative field name
}

// Helper function to resolve doctor names
const resolveDoctorName = async (
  doctorName: string | undefined,
  doctorId: string | number | undefined,
  fallbackName: string | undefined
): Promise<string> => {
  // First try the provided doctor name or fallback
  let resolvedName = doctorName || fallbackName;

  // If still unknown, try to fetch from API
  if (!resolvedName || resolvedName === 'Unknown') {
    if (doctorId) {
      try {
        const doctor = await apiFetch<UserData>(`/accounts/users/${doctorId}/`);
        resolvedName = doctor.full_name || doctor.username || 'Unknown';
      } catch (err) {
        console.warn('Could not load doctor details:', err);
      }
    }
  }

  return resolvedName || 'Unknown';
};

// Safe date formatting utility
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString();
  } catch {
    return 'Invalid Date';
  }
};

// Ward Admission Status Component
const WardAdmissionStatus = ({ patientId }: { patientId: string }) => {
  const [admissions, setAdmissions] = useState<WardAdmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdmissions = async () => {
      const patientNum = Number(patientId);
      if (!patientId || Number.isNaN(patientNum) || patientNum < 1) {
        setAdmissions([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const response = await wardService.getAdmissions({ patient: patientNum });
        setAdmissions(response.results || []);
      } catch (error) {
        console.warn('Could not fetch ward admissions:', error);
        setError('Failed to load admission data');
        setAdmissions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAdmissions();
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading admission data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 dark:border-red-800 rounded-lg p-3 bg-red-50 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (admissions.length === 0) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/20">
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No ward admissions found for this patient</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {admissions.map((admission) => (
        <div key={admission.id} className="border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 bg-indigo-50 dark:bg-indigo-900/10">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`${
                  admission.status === 'admitted' ? 'bg-green-600' :
                  admission.status === 'discharged' ? 'bg-blue-600' :
                  admission.status === 'transferred' ? 'bg-yellow-600' :
                  admission.status === 'deceased' ? 'bg-red-600' :
                  'bg-gray-600'
                } text-white`}>
                  {admission.status}
                </Badge>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {admission.admission_id}
                </span>
              </div>
              <p className="font-medium text-gray-800 dark:text-gray-200">
                {admission.ward_name}
                {admission.bed_number && ` • Bed ${admission.bed_number}`}
              </p>
            </div>
            <div className="text-right text-sm text-gray-600 dark:text-gray-400">
              <p>Admitted: {formatDate(admission.admission_date)}</p>
              {admission.discharge_date && (
                <p>Discharged: {formatDate(admission.discharge_date)}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-3">
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Type:</span>
              <span className="ml-2 text-gray-600 dark:text-gray-400">{admission.admission_type}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Length of Stay:</span>
              <span className="ml-2 text-gray-600 dark:text-gray-400">{admission.length_of_stay} days</span>
            </div>
          </div>

          {admission.admission_diagnosis && (
            <div className="mb-2">
              <span className="font-medium text-gray-700 dark:text-gray-300 text-sm">Diagnosis:</span>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{admission.admission_diagnosis}</p>
            </div>
          )}

          {admission.admitting_doctor_name && (
            <div className="text-xs text-gray-500 dark:text-gray-500">
              <span>Admitting Doctor: {admission.admitting_doctor_name}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// Helper function to clean garbage text from clinical notes
const cleanClinicalText = (text: string): string => {
  if (!text || text.trim().length < 3) return '';

  // Remove common garbage patterns
  const cleaned = text
    .replace(/[a-zA-Z]{20,}/g, '') // Remove very long words (likely garbage)
    .replace(/[^\w\s.,;:\-\n]/g, '') // Remove special characters except common punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // If it's too short or contains suspicious patterns, return empty
  if (cleaned.length < 3 ||
      cleaned.includes('lorem') ||
      cleaned.includes('ipsum') ||
      /^[^\w]*$/.test(cleaned)) {
    return '';
  }

  return cleaned;
};

// Helper function to validate ICD-10 codes
const isValidICD10Code = (code: string): boolean => {
  if (!code || typeof code !== 'string') return false;

  // Remove whitespace and convert to uppercase
  const cleanCode = code.trim().toUpperCase();

  // ICD-10 codes should be 3-7 characters, starting with a letter
  if (cleanCode.length < 3 || cleanCode.length > 7) return false;

  // First character should be a letter
  if (!/^[A-Z]/.test(cleanCode)) return false;

  // Should not contain garbage patterns
  if (/[^A-Z0-9.]/.test(cleanCode) ||
      cleanCode.includes('LOREM') ||
      cleanCode.includes('IPSUM') ||
      cleanCode.length > 20) {
    return false;
  }

  return true;
};

// Helper function to validate diagnosis descriptions
const isValidDiagnosisDescription = (description: string): boolean => {
  if (!description || typeof description !== 'string') return false;

  const cleanDesc = description.trim();

  // Should be at least 3 characters and not contain garbage
  if (cleanDesc.length < 3 || cleanDesc.length > 200) return false;

  // Should not be just special characters or numbers
  if (/^[^a-zA-Z]*$/.test(cleanDesc)) return false;

  // Should not contain garbage patterns
  if (cleanDesc.includes('lorem ipsum') ||
      cleanDesc.includes('test data') ||
      /^[^\w\s.,;:\-\(\)]*$/.test(cleanDesc)) {
    return false;
  }

  return true;
};

interface ConsultationDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultation?: ConsultationRecord | null;
  visitId?: string | number;
  consultationSessionId?: string | number;
  onEdit?: (consultation: ConsultationRecord) => void;
  onComplete?: (consultation: ConsultationRecord) => void;
  onPrint?: (consultation: ConsultationRecord) => void;
  isSubmitting?: boolean;
}

const getStatusBadge = (status: string) => {
  if (status === "Completed") return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
  return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400";
};

// Generate timeline from session events
const generateTimeline = (
  session: {
    id: string | number;
    type?: 'visit' | 'consultation';
    started_at?: string;
    date?: string;
    time?: string;
    visitId?: string;
    session_id?: string;
  },
  vitals: VitalsRecord[],
  prescriptions: ConsultationRecord['prescriptions'],
  labOrders: ConsultationRecord['labOrders'],
  nursingOrders: NursingOrder[]
): TimelineEvent[] => {
  const timeline: ConsultationRecord['timeline'] = [];
  
  // Session started
  if (session.started_at || session.date) {
    try {
      const startTime = session.started_at || `${session.date}T${session.time}`;
      const startDate = new Date(startTime);

      if (!isNaN(startDate.getTime())) {
        timeline.push({
          time: startDate.toISOString(), // Store as ISO string for sorting
          event: session.type === 'visit' ? 'Visit Started' : 'Consultation Started',
          description: session.type === 'visit'
            ? `Visit ${session.visitId || session.id} began`
            : `Session ${session.session_id || session.id} began`,
          type: session.type === 'visit' ? 'visit' : 'consultation',
        });
      }
    } catch (error) {
      console.warn('Could not parse session start time:', error);
    }
  }
  
  // Vitals recorded
  vitals.forEach((v) => {
    try {
      let vitalsDate: Date;
      if (v.date && v.time) {
        vitalsDate = new Date(`${v.date}T${v.time}`);
      } else if (v.date) {
        vitalsDate = new Date(v.date);
      } else {
        // Fallback to session start time if no vitals date available
        vitalsDate = new Date(session.started_at || `${session.date}T${session.time}`);
      }

      // Check if date is valid
      if (isNaN(vitalsDate.getTime())) {
        vitalsDate = new Date(session.started_at || `${session.date}T${session.time}`);
      }

      timeline.push({
        time: vitalsDate.toISOString(),
        event: 'Vitals Recorded',
        description: `BP: ${v.systolic}/${v.diastolic}, Temp: ${v.temperature}°C, HR: ${v.heartRate} bpm`,
        type: 'vitals',
      });
    } catch (error) {
      // If date parsing fails, use session time as fallback
      const fallbackDate = new Date(session.started_at || `${session.date}T${session.time}`);
      timeline.push({
        time: isNaN(fallbackDate.getTime()) ? new Date().toISOString() : fallbackDate.toISOString(),
        event: 'Vitals Recorded',
        description: `BP: ${v.systolic}/${v.diastolic}, Temp: ${v.temperature}°C, HR: ${v.heartRate} bpm`,
        type: 'vitals',
      });
    }
  });
  
  // Prescriptions added
  prescriptions.forEach((p) => {
    try {
      // Use session start time as fallback since prescriptions don't have createdAt
      const prescriptionTime = session.started_at || `${session.date}T${session.time}`;
      const prescriptionDate = new Date(prescriptionTime);

      if (!isNaN(prescriptionDate.getTime())) {
        timeline.push({
          time: prescriptionDate.toISOString(),
          event: 'Prescription Added',
          description: `${p.medication || 'Unknown'} ${p.strength || ''} - ${p.dosage || ''} ${p.frequency || ''}`.trim(),
          type: 'prescription',
        });
      }
    } catch (error) {
      console.warn('Could not parse prescription time:', error);
    }
  });

  // Lab orders added
  labOrders.forEach((l) => {
    try {
      const labDate = new Date(l.createdAt);
      if (!isNaN(labDate.getTime())) {
        timeline.push({
          time: labDate.toISOString(),
          event: 'Lab Order Added',
          description: `${l.test || 'Unknown Test'} - ${l.priority || 'Normal'} priority`,
          type: 'lab_order',
        });
      }
    } catch (error) {
      console.warn('Could not parse lab order time:', error);
    }
  });

  // Nursing orders added
  nursingOrders.forEach((n) => {
    try {
      const nursingDate = new Date(n.createdAt);
      if (!isNaN(nursingDate.getTime())) {
        timeline.push({
          time: nursingDate.toISOString(),
          event: 'Nursing Order Added',
          description: `${n.type}: ${n.instructions || 'No instructions'}`,
          type: 'nursing_order',
        });
      }
    } catch (error) {
      console.warn('Could not parse nursing order time:', error);
    }
  });
  
  return timeline.sort((a, b) => {
    try {
      return a.time.localeCompare(b.time);
    } catch (error) {
      console.warn('Could not sort timeline events:', error);
      return 0; // Keep original order if sorting fails
    }
  });
};

// Load consultation data from visit ID
const loadConsultationFromVisit = async (visitId: string | number): Promise<ConsultationRecord | null> => {
  try {
    const visit = await apiFetch<VisitData>(`/visits/${visitId}/`);
    
    // Get patient details
    const patient = await patientService.getPatient(visit.patient);
    
    // Get prescriptions, lab orders, radiology orders, and nursing orders - FILTERED BY CURRENT VISIT/CONSULTATION SESSION
    let prescriptions: ConsultationRecord['prescriptions'] = [];
    let labOrders: ConsultationRecord['labOrders'] = [];
    let radiologyOrders: ConsultationRecord['radiologyOrders'] = [];
    let nursingOrders: ConsultationRecord['nursingOrders'] = [];
    
    // First try to get the consultation session to filter by session if available
    let consultationSessionId: string | null = null;
    let consultationSession: ConsultationSessionData | null = null;
    try {
      const sessionsResult = await apiFetch<ApiResponse<ConsultationSessionData>>(`/consultation/sessions/?visit=${visitId}&page_size=1`);
      if (sessionsResult.results && sessionsResult.results.length > 0) {
        consultationSession = sessionsResult.results[0];
        consultationSessionId = String(consultationSession.id);
      }
    } catch (err) {
      // Ignore - will use visit filter
    }
    
    // Get session timeframe for filtering orders by creation time
    const sessionStart = consultationSession?.started_at ? new Date(consultationSession.started_at) : null;
    const sessionEnd = consultationSession?.ended_at ? new Date(consultationSession.ended_at) : (consultationSession?.started_at ? new Date() : null);
    
    // Helper function to filter orders by session timeframe
    const filterBySessionTime = <T extends { created_at?: string; createdAt?: string }>(orders: T[]): T[] => {
      if (!sessionStart) return orders; // If no session, return all (fallback behavior)
      return orders.filter((order) => {
        const orderDate = new Date(order.created_at || order.createdAt || '');
        return orderDate >= sessionStart && orderDate <= sessionEnd!;
      });
    };
    
    // Use consultation_session filter if available, otherwise use visit
    const sessionFilter = consultationSessionId ? `consultation_session=${consultationSessionId}` : '';
    const visitFilter = `visit=${visitId}`;
    // If we have a consultation session, only use session filtering - don't fall back to visit
    const filterParam = consultationSessionId ? sessionFilter : visitFilter;
    
    try {
      let prescriptionsResult;
      if (consultationSessionId) {
        // If we have a consultation session, only use session filtering
        try {
          prescriptionsResult = await apiFetch<ApiResponse<PrescriptionData>>(`/pharmacy/prescriptions/?${sessionFilter}&page_size=100`);
        } catch (err) {
          prescriptionsResult = { results: [] };
        }
      } else {
        // Only use visit filtering if no consultation session
        prescriptionsResult = await apiFetch<ApiResponse<PrescriptionData>>(`/pharmacy/prescriptions/?${visitFilter}&page_size=100`);
      }
      const filteredPrescriptions = filterBySessionTime(prescriptionsResult.results || []);
      prescriptions = filteredPrescriptions.map((p: PrescriptionData) => ({
        id: String(p.id),
        medication: p.medication_name ||
                   (p.medication && typeof p.medication === 'object' && p.medication.name) ||
                   (p.medication && typeof p.medication === 'string' && !(p.medication as string).match(/^\d+$/) && p.medication) ||
                   'Unknown',
        strength: p.strength || '',
        form: p.form || '',
        dosage: p.dosage || '',
        frequency: p.frequency || '',
        duration: p.duration || '',
        instructions: p.instructions || '',
      }));
    } catch (err) {
      console.warn('Could not load prescriptions:', err);
    }
    
    try {
      let labOrdersResult;
      if (consultationSessionId) {
        // If we have a consultation session, only use session filtering
        try {
          labOrdersResult = await apiFetch<ApiResponse<LabOrderData>>(`/laboratory/orders/?${sessionFilter}&page_size=100`);
        } catch (err) {
          labOrdersResult = { results: [] };
        }
      } else {
        // Only use visit filtering if no consultation session
        labOrdersResult = await apiFetch<ApiResponse<LabOrderData>>(`/laboratory/orders/?${visitFilter}&page_size=100`);
      }
      const filteredLabOrders = filterBySessionTime(labOrdersResult.results || []);
      // Flatten lab orders - each test in an order should be a separate entry
      labOrders = filteredLabOrders.flatMap((l: LabOrderData) => {
        // If order has tests array, create an entry for each test
        if (l.tests && Array.isArray(l.tests) && l.tests.length > 0) {
          return l.tests.map((test: any) => ({
            id: `LAB-${l.id}-${test.id}`,
            test: test.name || test.test_name || test.template?.name || 'Unknown Test',
            priority: l.priority === 'stat' ? 'STAT' : l.priority === 'urgent' ? 'Urgent' : l.priority === 'routine' ? 'Routine' : String(l.priority || 'Routine'),
            instructions: test.notes || l.clinical_notes || '',
            status: test.status || 'pending',
            orderedBy: l.doctor_name || l.created_by_name || 'Unknown',
            createdAt: test.created_at || l.ordered_at || new Date().toISOString(),
            result: test.results ? JSON.stringify(test.results) : undefined,
          }));
        }
        // Fallback: single test entry from order-level fields
        const testName = l.test_name || l.test || l.name || 'Unknown Test';
        return [{
          id: String(l.id),
          test: testName,
          priority: l.priority === 'stat' ? 'STAT' : l.priority === 'urgent' ? 'Urgent' : l.priority === 'routine' ? 'Routine' : String(l.priority || 'Routine'),
          instructions: l.clinical_notes || '',
          status: l.status || 'pending',
          orderedBy: l.doctor_name || l.created_by_name || 'Unknown',
          createdAt: l.ordered_at || l.created_at || new Date().toISOString(),
          result: undefined, // Add result property for consistency
        }];
      });
    } catch (err) {
      console.warn('Could not load lab orders:', err);
    }
    
    try {
      let radiologyOrdersResult;
      if (consultationSessionId) {
        // If we have a consultation session, only use session filtering
        try {
          radiologyOrdersResult = await apiFetch<{ results: any[] }>(`/radiology/orders/?${sessionFilter}&page_size=100`);
        } catch (err) {
          radiologyOrdersResult = { results: [] };
        }
      } else {
        // Only use visit filtering if no consultation session
        radiologyOrdersResult = await apiFetch<{ results: any[] }>(`/radiology/orders/?${visitFilter}&page_size=100`);
      }
      const filteredRadiologyOrders = filterBySessionTime(radiologyOrdersResult.results || []);
      // Flatten radiology orders - each study in an order should be a separate entry
      radiologyOrders = filteredRadiologyOrders.flatMap((r: any) => {
        // If order has studies array, create an entry for each study
        if (r.studies && Array.isArray(r.studies) && r.studies.length > 0) {
          return r.studies.map((study: any) => ({
            id: `RAD-${r.id}-${study.id}`,
            study: study.procedure || study.study_type || study.name || 'Unknown Study',
            priority: r.priority === 'stat' ? 'STAT' : r.priority === 'urgent' ? 'Urgent' : r.priority === 'routine' ? 'Routine' : String(r.priority || 'Routine'),
            instructions: study.technical_notes || r.clinical_notes || '',
            status: study.status || 'pending',
            orderedBy: r.doctor_name || r.created_by_name || 'Unknown',
            createdAt: study.created_at || r.ordered_at || new Date().toISOString(),
            result: study.report || study.findings ? `${study.findings || ''}\n${study.impression || ''}`.trim() : undefined,
          }));
        }
        // Fallback: single study entry from order-level fields
        return [{
          id: String(r.id),
          study: r.study_type || r.study || r.name || 'Unknown Study',
          priority: r.priority === 'stat' ? 'STAT' : r.priority === 'urgent' ? 'Urgent' : r.priority === 'routine' ? 'Routine' : String(r.priority || 'Routine'),
          instructions: r.clinical_notes || '',
          status: r.status || 'pending',
          orderedBy: r.doctor_name || r.created_by_name || 'Unknown',
          createdAt: r.ordered_at || r.created_at || new Date().toISOString(),
        }];
      });
    } catch (err) {
      console.warn('Could not load radiology orders:', err);
    }
    
    try {
      let nursingOrdersResult;
      if (consultationSessionId) {
        // If we have a consultation session, only use session filtering
        try {
          nursingOrdersResult = await apiFetch<{ results: any[] }>(`/nursing/orders/?${sessionFilter}&page_size=100`);
        } catch (err) {
          nursingOrdersResult = { results: [] };
        }
      } else {
        // Only use visit filtering if no consultation session
        nursingOrdersResult = await apiFetch<{ results: any[] }>(`/nursing/orders/?${visitFilter}&page_size=100`);
      }
      const filteredNursingOrders = filterBySessionTime(nursingOrdersResult.results || []);
      nursingOrders = filteredNursingOrders.map((n: any) => ({
        id: String(n.id),
        type: n.order_type || n.type || 'General',
        instructions: n.instructions || '',
        status: n.status || 'pending',
        priority: n.priority === 'urgent' ? 'Urgent' : n.priority === 'high' ? 'High' : n.priority === 'medium' ? 'Medium' : n.priority === 'low' ? 'Low' : String(n.priority || 'Medium'),
        orderedBy: n.ordered_by_name || 'Unknown',
        createdAt: n.created_at || new Date().toISOString(),
      }));
    } catch (err) {
      console.warn('Could not load nursing orders:', err);
    }

    let physioOrders: ConsultationRecord['physioOrders'] = [];
    if (consultationSessionId) {
      try {
        const physioResult = await physioService.getOrders({ consultation_session: Number(consultationSessionId), page_size: 100 });
        physioOrders = (physioResult.results || []).map((o: any) => ({
          id: String(o.id),
          diagnosis: (o.diagnosis ?? o.chief_complaint ?? '').toString().trim(),
          chiefComplaint: o.chief_complaint ?? '',
          priority: o.priority === 'stat' ? 'STAT' : o.priority === 'urgent' ? 'Urgent' : String(o.priority || 'Routine'),
          status: o.status ?? 'pending',
        }));
      } catch (err) {
        console.warn('Could not load physio orders:', err);
      }
    }
    
    // Get vitals - filter by consultation session if available, otherwise by visit
    let vitals: ConsultationRecord['vitals'] = [];
    try {
      let vitalsResult;
      try {
        // Try filtering by consultation_session first
        if (consultationSessionId) {
          vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?consultation_session=${consultationSessionId}&page_size=10`);
        } else {
          throw new Error('No session ID');
        }
      } catch (sessionErr) {
        // Fallback to visit filter and filter by session timeframe if consultation session exists
        vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${visitId}&page_size=10`);
        if (consultationSession && vitalsResult.results && consultationSession.started_at) {
          const sessionStart = new Date(consultationSession.started_at);
          const sessionEnd = consultationSession.ended_at ? new Date(consultationSession.ended_at) : new Date();
          vitalsResult.results = vitalsResult.results.filter((v: any) => {
            const vitalDate = new Date(v.recorded_at || v.created_at);
            return vitalDate >= sessionStart && vitalDate <= sessionEnd;
          });
        }
      }
      vitals = (vitalsResult.results || []).map((v: any) => {
        // Handle temperature - could be string or number
        const temp = v.temperature ? (typeof v.temperature === 'string' ? parseFloat(v.temperature) : Number(v.temperature)) : null;
        // Handle blood pressure - could be separate fields or combined
        const systolic = v.blood_pressure_systolic || v.systolic || (v.blood_pressure ? parseFloat(v.blood_pressure.split('/')[0]) : null) || 0;
        const diastolic = v.blood_pressure_diastolic || v.diastolic || (v.blood_pressure ? parseFloat(v.blood_pressure.split('/')[1]) : null) || 0;
        // Handle weight/height
        const weight = v.weight ? (typeof v.weight === 'string' ? parseFloat(v.weight) : Number(v.weight)) : null;
        const height = v.height ? (typeof v.height === 'string' ? parseFloat(v.height) : Number(v.height)) : null;
        const oxygenSat = v.oxygen_saturation ? (typeof v.oxygen_saturation === 'string' ? parseFloat(v.oxygen_saturation) : Number(v.oxygen_saturation)) : null;
        
        return {
          id: String(v.id),
          systolic: systolic || 0,
          diastolic: diastolic || 0,
          heartRate: v.heart_rate || v.heartRate || 0,
          temperature: temp || 0,
          respiratoryRate: v.respiratory_rate || v.respiratoryRate || 0,
          weight: weight || 0,
          height: height || 0,
          oxygenSaturation: oxygenSat || 0,
          bloodSugar: v.blood_sugar || v.bloodSugar || 0,
          painScale: v.pain_scale || v.painScale || 0,
          comment: v.notes || v.comment || '',
          recordedBy: v.recorded_by_name || (typeof v.recorded_by === 'object' ? v.recorded_by?.full_name || v.recorded_by?.username : v.recorded_by) || 'Unknown',
          date: v.recorded_at || v.created_at || new Date().toISOString(),
          time: v.recorded_at ? new Date(v.recorded_at).toLocaleTimeString() : '00:00:00',
        };
      });
    } catch (err) {
      // Ignore
    }
    
    
    const sessionDuration = consultationSession?.started_at && consultationSession?.ended_at
      ? Math.floor((new Date(consultationSession.ended_at).getTime() - new Date(consultationSession.started_at).getTime()) / (1000 * 60))
      : 0;
    
    return {
      id: String(visit.id),
      patient: patient.full_name || `${patient.first_name} ${patient.surname}`,
      patientId: patient.patient_id || '',
      patientAge: patient.age || undefined,
      patientGender: patient.gender || undefined,
      doctor: await resolveDoctorName(
        visit.doctor_name || consultationSession?.doctor_name,
        visit.doctor || consultationSession?.doctor,
        consultationSession?.created_by_name
      ),
      doctorId: String(visit.doctor || consultationSession?.doctor || ''),
      doctorSpecialty: visit.doctor_specialty || consultationSession?.doctor_specialty || undefined,
      date: visit.visit_date || visit.date || new Date().toISOString().split('T')[0],
      time: visit.visit_time || visit.time || '',
      clinic: visit.clinic_name || visit.clinic || 'GOPD',
      room: consultationSession?.room_name || visit.room_name || 'Unknown',
      diagnosis: cleanClinicalText(consultationSession?.assessment || visit.diagnosis || ''),
      presentationComplaint: consultationSession?.presentation_complaint || '',
      historyOfPresentIllness: cleanClinicalText(consultationSession?.history_of_presenting_illness || ''),
      physicalExamination: cleanClinicalText(consultationSession?.physical_examination || ''),
      diagnosisCodes: (() => {
        // Try to parse diagnosis codes from notes field (stored as JSON)
        const notes = consultationSession?.notes || visit?.notes;
        if (notes) {
          try {
            // Try to parse just the JSON part (in case follow-up text is appended)
            let jsonPart = notes;
            if (notes.includes('\n\nFollow-up')) {
              jsonPart = notes.split('\n\nFollow-up')[0].trim();
            }

            const notesData = JSON.parse(jsonPart);
            if (notesData.diagnosis_codes && Array.isArray(notesData.diagnosis_codes)) {
              return notesData.diagnosis_codes
                .map((dx: any) => ({
                  code: dx.code || '',
                  description: dx.description || '',
                  type: (dx.type === 'Primary' || dx.type === 'Secondary' || dx.type === 'Differential') ? dx.type : 'Primary'
                }))
                .filter((dx: any) => isValidICD10Code(dx.code) && isValidDiagnosisDescription(dx.description));
            }
          } catch (parseErr) {
            // If notes is not JSON, try to parse old format
            if (notes.includes(':')) {
              return notes.split(';')
                .map((dxStr: string) => {
                  const [code, ...nameParts] = dxStr.trim().split(':');
                  return {
                    code: code?.trim() || '',
                    description: nameParts.join(':').trim() || ''
                  };
                })
                .filter((dx: any) => isValidICD10Code(dx.code) && isValidDiagnosisDescription(dx.description));
            }
          }
        }

        // Also try to extract ICD-10 codes from diagnosis/assessment text
        const diagnosisText = consultationSession?.assessment || visit?.diagnosis || '';
        if (diagnosisText) {
          const icd10Regex = /\b([A-Z]\d{2}(?:\.\d{1,3})?)\b/g;
          const matches = diagnosisText.match(icd10Regex);
          if (matches) {
            return matches.map((code: string) => ({
              code: code,
              description: 'Diagnosis code extracted from text'
            })).filter((dx: any) => isValidICD10Code(dx.code));
          }
        }

        return undefined;
      })(),
      status: consultationSession?.status === 'completed' ? 'Completed' as const : 'In Progress' as const,
      priority: (() => {
        const p = visit.priority;
        if (typeof p === 'number') {
          return p === 0 ? 'Emergency' : p === 1 ? 'High' : p === 2 ? 'Medium' : 'Low';
        }
        return String(p || 'Medium');
      })(),
      sessionDuration,
      assessment: cleanClinicalText(consultationSession?.assessment || ''),
      plan: cleanClinicalText(consultationSession?.plan || ''),
      vitals,
      prescriptions,
      labOrders,
      radiologyOrders,
      physioOrders,
      nursingOrders,
      timeline: generateTimeline(
        { ...visit, ...consultationSession, type: 'visit', visitId: visit.visit_id },
        vitals,
        prescriptions,
        labOrders,
        nursingOrders
      ),
      type: 'visit',
    };
  } catch (error) {
    console.error('Error loading visit data:', error);
    return null;
  }
};

// Load consultation data from consultation session ID
const loadConsultationFromSession = async (sessionId: string | number): Promise<ConsultationRecord | null> => {
  try {
    const session = await apiFetch<ConsultationSessionData>(`/consultation/sessions/${sessionId}/`);
    
    // Get patient details
    const patient = await patientService.getPatient(session.patient);
    
    // Get visit details if available
    let visitDate = session.started_at ? new Date(session.started_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    let visitTime = session.started_at ? new Date(session.started_at).toTimeString().slice(0, 5) : '';
    
    if (session.visit) {
      try {
        const visit = await apiFetch<VisitData>(`/visits/${session.visit}/`);
        visitDate = visit.visit_date || visit.date || visitDate;
        visitTime = visit.visit_time || visit.time || visitTime;
      } catch (visitErr) {
        console.warn('Could not load visit details:', visitErr);
      }
    }
    
    // Calculate actual session duration
    let sessionDuration = 0;
    if (session.started_at && session.ended_at) {
      const startTime = new Date(session.started_at);
      const endTime = new Date(session.ended_at);
      sessionDuration = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60));
    }
    
    // Get prescriptions, lab orders, radiology orders, and nursing orders - FILTERED BY CURRENT SESSION ONLY
    let prescriptions: ConsultationRecord['prescriptions'] = [];
    let labOrders: ConsultationRecord['labOrders'] = [];
    let radiologyOrders: ConsultationRecord['radiologyOrders'] = [];
    let nursingOrders: ConsultationRecord['nursingOrders'] = [];
    
    // Get session timeframe for filtering orders by creation time
    const sessionStart = session.started_at ? new Date(session.started_at) : null;
    const sessionEnd = session.ended_at ? new Date(session.ended_at) : new Date(); // Use current time if session not ended
    
    // Helper function to filter orders by session timeframe
    const filterBySessionTime = <T extends { created_at?: string; createdAt?: string }>(orders: T[]): T[] => {
      if (!sessionStart) return orders;
      return orders.filter((order) => {
        const orderDate = new Date(order.created_at || order.createdAt || '');
        return orderDate >= sessionStart && orderDate <= sessionEnd;
      });
    };
    
    // Try to filter by consultation_session first, fallback to visit if needed
    const sessionFilter = `consultation_session=${sessionId}`;
    const visitFilter = session.visit ? `visit=${session.visit}` : '';
    
    try {
      // Get prescriptions - ONLY filter by consultation_session (no visit fallback)
      let prescriptionsResult;
      try {
        prescriptionsResult = await apiFetch<{ results: any[] }>(`/pharmacy/prescriptions/?${sessionFilter}&page_size=100`);
      } catch (sessionErr: any) {
        // Don't fallback to visit - only show prescriptions created during this session
        console.warn('Could not load prescriptions by session:', sessionErr?.message || sessionErr);
        prescriptionsResult = { results: [] };
      }
      const filteredPrescriptions = filterBySessionTime(prescriptionsResult.results || []);
      prescriptions = filteredPrescriptions.map((p: PrescriptionData) => ({
        id: String(p.id),
        medication: p.medication_name ||
                   (p.medication && typeof p.medication === 'object' && p.medication.name) ||
                   (p.medication && typeof p.medication === 'string' && !(p.medication as string).match(/^\d+$/) && p.medication) ||
                   'Unknown',
        strength: p.strength || '',
        form: p.form || '',
        dosage: p.dosage || '',
        frequency: p.frequency || '',
        duration: p.duration || '',
        instructions: p.instructions || '',
      }));
    } catch (err) {
      console.warn('Could not load prescriptions:', err);
    }
    
    try {
      // Get lab orders - ONLY filter by consultation_session (no visit fallback)
      let labOrdersResult;
      try {
        labOrdersResult = await apiFetch<{ results: any[] }>(`/laboratory/orders/?${sessionFilter}&page_size=100`);
      } catch (sessionErr: any) {
        // Don't fallback to visit - only show lab orders created during this session
        console.warn('Could not load lab orders by session:', sessionErr?.message || sessionErr);
        labOrdersResult = { results: [] };
      }
      const filteredLabOrders = filterBySessionTime(labOrdersResult.results || []);
      // Flatten lab orders - each test in an order should be a separate entry
      labOrders = filteredLabOrders.flatMap((l: LabOrderData) => {
        // If order has tests array, create an entry for each test
        if (l.tests && Array.isArray(l.tests) && l.tests.length > 0) {
          return l.tests.map((test: any) => ({
            id: `LAB-${l.id}-${test.id}`,
            test: test.name || test.test_name || test.template?.name || 'Unknown Test',
            priority: l.priority === 'stat' ? 'STAT' : l.priority === 'urgent' ? 'Urgent' : l.priority === 'routine' ? 'Routine' : String(l.priority || 'Routine'),
            instructions: test.notes || l.clinical_notes || '',
            status: test.status || 'pending',
            orderedBy: l.doctor_name || l.created_by_name || 'Unknown',
            createdAt: test.created_at || l.ordered_at || new Date().toISOString(),
            result: test.results ? JSON.stringify(test.results) : undefined,
          }));
        }
        // Fallback: single test entry from order-level fields
        const testName = l.test_name || l.test || l.name || 'Unknown Test';
        return [{
          id: String(l.id),
          test: testName,
          priority: l.priority === 'stat' ? 'STAT' : l.priority === 'urgent' ? 'Urgent' : l.priority === 'routine' ? 'Routine' : String(l.priority || 'Routine'),
          instructions: l.clinical_notes || '',
          status: l.status || 'pending',
          orderedBy: l.doctor_name || l.created_by_name || 'Unknown',
          createdAt: l.ordered_at || l.created_at || new Date().toISOString(),
          result: undefined, // Add result property for consistency
        }];
      });
    } catch (err) {
      console.warn('Could not load lab orders:', err);
    }
    
    try {
      // Get radiology orders - ONLY filter by consultation_session (no visit fallback)
      let radiologyOrdersResult;
      try {
        radiologyOrdersResult = await apiFetch<{ results: any[] }>(`/radiology/orders/?${sessionFilter}&page_size=100`);
      } catch (sessionErr: any) {
        // Don't fallback to visit - only show radiology orders created during this session
        console.warn('Could not load radiology orders by session:', sessionErr?.message || sessionErr);
        radiologyOrdersResult = { results: [] };
      }
      const filteredRadiologyOrders = filterBySessionTime(radiologyOrdersResult.results || []);
      // Flatten radiology orders - each study in an order should be a separate entry
      radiologyOrders = filteredRadiologyOrders.flatMap((r: any) => {
        // If order has studies array, create an entry for each study
        if (r.studies && Array.isArray(r.studies) && r.studies.length > 0) {
          return r.studies.map((study: any) => ({
            id: `RAD-${r.id}-${study.id}`,
            study: study.procedure || study.study_type || study.name || 'Unknown Study',
            priority: r.priority === 'stat' ? 'STAT' : r.priority === 'urgent' ? 'Urgent' : r.priority === 'routine' ? 'Routine' : String(r.priority || 'Routine'),
            instructions: study.technical_notes || r.clinical_notes || '',
            status: study.status || 'pending',
            orderedBy: r.doctor_name || r.created_by_name || 'Unknown',
            createdAt: study.created_at || r.ordered_at || new Date().toISOString(),
            result: study.report || study.findings ? `${study.findings || ''}\n${study.impression || ''}`.trim() : undefined,
          }));
        }
        // Fallback: single study entry from order-level fields
        return [{
          id: String(r.id),
          study: r.study_type || r.study || r.name || 'Unknown Study',
          priority: r.priority === 'stat' ? 'STAT' : r.priority === 'urgent' ? 'Urgent' : r.priority === 'routine' ? 'Routine' : String(r.priority || 'Routine'),
          instructions: r.clinical_notes || '',
          status: r.status || 'pending',
          orderedBy: r.doctor_name || r.created_by_name || 'Unknown',
          createdAt: r.ordered_at || r.created_at || new Date().toISOString(),
        }];
      });
    } catch (err) {
      console.warn('Could not load radiology orders:', err);
    }
    
    try {
      // Get nursing orders - ONLY filter by consultation_session (no visit fallback)
      let nursingOrdersResult;
      try {
        nursingOrdersResult = await apiFetch<{ results: any[] }>(`/nursing/orders/?${sessionFilter}&page_size=100`);
      } catch (sessionErr: any) {
        // Don't fallback to visit - only show nursing orders created during this session
        console.warn('Could not load nursing orders by session:', sessionErr?.message || sessionErr);
        nursingOrdersResult = { results: [] };
      }
      const filteredNursingOrders = filterBySessionTime(nursingOrdersResult.results || []);
      nursingOrders = filteredNursingOrders.map((n: any) => ({
        id: String(n.id),
        type: n.order_type || n.type || 'General',
        instructions: n.instructions || '',
        status: n.status || 'pending',
        priority: n.priority === 'urgent' ? 'Urgent' : n.priority === 'high' ? 'High' : n.priority === 'medium' ? 'Medium' : n.priority === 'low' ? 'Low' : String(n.priority || 'Medium'),
        orderedBy: n.ordered_by_name || 'Unknown',
        createdAt: n.created_at || new Date().toISOString(),
      }));
    } catch (err) {
      console.warn('Could not load nursing orders:', err);
    }

    let physioOrders: ConsultationRecord['physioOrders'] = [];
    try {
      const physioResult = await physioService.getOrders({ consultation_session: Number(sessionId), page_size: 100 });
      physioOrders = (physioResult.results || []).map((o: any) => ({
        id: String(o.id),
        diagnosis: (o.diagnosis ?? o.chief_complaint ?? '').toString().trim(),
        chiefComplaint: o.chief_complaint ?? '',
        priority: o.priority === 'stat' ? 'STAT' : o.priority === 'urgent' ? 'Urgent' : String(o.priority || 'Routine'),
        status: o.status ?? 'pending',
      }));
    } catch (err) {
      console.warn('Could not load physio orders:', err);
    }
    
    // Get vitals - filter by consultation session (fallback to visit if session filter not supported)
    let vitals: ConsultationRecord['vitals'] = [];
    try {
      // Try filtering by consultation_session first
      let vitalsResult;
      try {
        vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?consultation_session=${sessionId}&page_size=10`);
      } catch (sessionErr: any) {
        // Fallback to visit filter and filter by session timeframe
        console.warn('Could not load vitals by session:', sessionErr?.message || sessionErr);
        const visitId = session.visit || '';
        if (visitId) {
          try {
            vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${visitId}&page_size=10`);
            // Filter vitals to only those recorded during this session timeframe
            if (vitalsResult.results && session.started_at) {
              const sessionStart = new Date(session.started_at);
              const sessionEnd = session.ended_at ? new Date(session.ended_at) : new Date();
              vitalsResult.results = vitalsResult.results.filter((v: any) => {
                const vitalDate = new Date(v.recorded_at || v.created_at);
                return vitalDate >= sessionStart && vitalDate <= sessionEnd;
              });
            }
          } catch (visitErr) {
            console.warn('Could not load vitals by visit:', visitErr);
            vitalsResult = { results: [] };
          }
        } else {
          vitalsResult = { results: [] };
        }
      }
      vitals = (vitalsResult.results || []).map((v: any) => {
        // Handle temperature - could be string or number
        const temp = v.temperature ? (typeof v.temperature === 'string' ? parseFloat(v.temperature) : Number(v.temperature)) : null;
        // Handle blood pressure - could be separate fields or combined
        const systolic = v.blood_pressure_systolic || v.systolic || (v.blood_pressure ? parseFloat(v.blood_pressure.split('/')[0]) : null) || 0;
        const diastolic = v.blood_pressure_diastolic || v.diastolic || (v.blood_pressure ? parseFloat(v.blood_pressure.split('/')[1]) : null) || 0;
        // Handle weight/height
        const weight = v.weight ? (typeof v.weight === 'string' ? parseFloat(v.weight) : Number(v.weight)) : null;
        const height = v.height ? (typeof v.height === 'string' ? parseFloat(v.height) : Number(v.height)) : null;
        const oxygenSat = v.oxygen_saturation ? (typeof v.oxygen_saturation === 'string' ? parseFloat(v.oxygen_saturation) : Number(v.oxygen_saturation)) : null;
        
        return {
          id: String(v.id),
          systolic: systolic || 0,
          diastolic: diastolic || 0,
          heartRate: v.heart_rate || v.heartRate || 0,
          temperature: temp || 0,
          respiratoryRate: v.respiratory_rate || v.respiratoryRate || 0,
          weight: weight || 0,
          height: height || 0,
          oxygenSaturation: oxygenSat || 0,
          bloodSugar: v.blood_sugar || v.bloodSugar || 0,
          painScale: v.pain_scale || v.painScale || 0,
          comment: v.notes || v.comment || '',
          recordedBy: v.recorded_by_name || (typeof v.recorded_by === 'object' ? v.recorded_by?.full_name || v.recorded_by?.username : v.recorded_by) || 'Unknown',
          date: v.recorded_at || v.created_at || new Date().toISOString(),
          time: v.recorded_at ? new Date(v.recorded_at).toLocaleTimeString() : '00:00:00',
        };
      });
    } catch (err) {
      // Ignore
    }
    
    return {
      id: String(session.id),
      patient: patient.full_name || `${patient.first_name} ${patient.surname}`,
      patientId: patient.patient_id || '',
      patientAge: patient.age || undefined,
      patientGender: patient.gender || undefined,
      doctor: await resolveDoctorName(
        session.doctor_name,
        session.doctor,
        session.created_by_name
      ),
      doctorId: String(session.doctor || ''),
      doctorSpecialty: session.doctor_specialty || undefined,
      date: visitDate,
      time: visitTime,
      clinic: session.clinic || 'GOPD',
      room: session.room_name || 'Unknown',
      diagnosis: session.assessment || '',
      presentationComplaint: session.presentation_complaint || '',
      diagnosisCodes: (() => {
        // Try to parse diagnosis codes from notes field (stored as JSON)
        if (session.notes) {
          try {
            // Try to parse just the JSON part (in case follow-up text is appended)
            let jsonPart = session.notes;
            if (session.notes.includes('\n\nFollow-up')) {
              jsonPart = session.notes.split('\n\nFollow-up')[0].trim();
            }

            const notesData = JSON.parse(jsonPart);
            if (notesData.diagnosis_codes && Array.isArray(notesData.diagnosis_codes)) {
              return notesData.diagnosis_codes
                .map((dx: any) => ({
                  code: dx.code || '',
                  description: dx.description || '',
                  type: (dx.type === 'Primary' || dx.type === 'Secondary' || dx.type === 'Differential') ? dx.type : 'Primary'
                }))
                .filter((dx: any) => isValidICD10Code(dx.code) && isValidDiagnosisDescription(dx.description));
            }
          } catch (parseErr) {
            // If notes is not JSON, try to parse old format
            if (session.notes.includes(':')) {
              return session.notes.split(';')
                .map((dxStr: string) => {
                  const [code, ...nameParts] = dxStr.trim().split(':');
                  return {
                    code: code?.trim() || '',
                    description: nameParts.join(':').trim() || ''
                  };
                })
                .filter((dx: any) => isValidICD10Code(dx.code) && isValidDiagnosisDescription(dx.description));
            }
          }
        }

        // Also try to extract ICD-10 codes from diagnosis/assessment text
        const diagnosisText = session.assessment || '';
        if (diagnosisText) {
          const icd10Regex = /\b([A-Z]\d{2}(?:\.\d{1,3})?)\b/g;
          const matches = diagnosisText.match(icd10Regex);
          if (matches) {
            return matches.map((code: string) => ({
              code: code,
              description: 'Diagnosis code extracted from text'
            })).filter((dx: any) => isValidICD10Code(dx.code));
          }
        }

        return undefined;
      })(),
      status: session.status === 'completed' ? 'Completed' as const : 'In Progress' as const,
      priority: (() => {
        const p = session.priority;
        if (typeof p === 'number') {
          return p === 0 ? 'Emergency' : p === 1 ? 'High' : p === 2 ? 'Medium' : 'Low';
        }
        return String(p || 'Medium');
      })(),
      sessionDuration,
      historyOfPresentIllness: session.history_of_presenting_illness || '',
      physicalExamination: session.physical_examination || '',
      assessment: cleanClinicalText(session.assessment || ''),
      plan: cleanClinicalText(session.plan || ''),
      vitals,
      prescriptions,
      labOrders,
      radiologyOrders,
      physioOrders,
      nursingOrders,
      timeline: generateTimeline(session, vitals, prescriptions, labOrders, nursingOrders),
      type: 'consultation',
      /** For ordering labs from detail modal (same as consultation session API) */
      patientIdNumeric: session.patient,
      visitId: session.visit ?? undefined,
    };
  } catch (error) {
    console.error('Error loading consultation session data:', error);
    return null;
  }
};

export const ConsultationDetailModal = React.memo(function ConsultationDetailModal({
  open,
  onOpenChange,
  consultation,
  visitId,
  consultationSessionId,
  onEdit,
  onComplete,
  onPrint,
  isSubmitting = false,
}: ConsultationDetailModalProps) {
  const [loadedConsultation, setLoadedConsultation] = useState<ConsultationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddLabOrder, setShowAddLabOrder] = useState(false);

  useEffect(() => {
    if (open) {
      if (consultation) {
        // Always try to reload fresh session data when consultation is provided
        setLoading(true);
        loadConsultationFromSession(consultation.id).then((data) => {
          setLoadedConsultation(data);
          setLoading(false);
        }).catch((err) => {
          console.warn('Failed to reload session data, using provided data:', err);
          // Fallback to using provided consultation data
          setLoadedConsultation(consultation);
          setLoading(false);
        });
      } else if (visitId) {
        setLoading(true);
        loadConsultationFromVisit(visitId).then((data) => {
          setLoadedConsultation(data);
          setLoading(false);
        });
      } else if (consultationSessionId) {
        setLoading(true);
        loadConsultationFromSession(consultationSessionId).then((data) => {
          setLoadedConsultation(data);
          setLoading(false);
        });
      } else {
        setLoadedConsultation(null);
      }
    } else {
      setLoadedConsultation(null);
    }
  }, [open, consultation, visitId, consultationSessionId]);

  const displayConsultation = loadedConsultation || consultation;

  // Memoize safe consultation object to prevent unnecessary re-renders
  const safeConsultation = useMemo(() => {
    if (!displayConsultation) return null;

    return {
      ...displayConsultation,
      vitals: displayConsultation.vitals || [],
      prescriptions: displayConsultation.prescriptions || [],
      labOrders: displayConsultation.labOrders || [],
      radiologyOrders: displayConsultation.radiologyOrders || [],
      physioOrders: displayConsultation.physioOrders || [],
      nursingOrders: displayConsultation.nursingOrders || [],
      timeline: displayConsultation.timeline || [],
    };
  }, [displayConsultation]);

  // Memoize latest vitals extraction
  const latestVitals = useMemo(() => safeConsultation?.vitals?.[0], [safeConsultation?.vitals]);

  // Memoize event handlers to prevent unnecessary re-renders
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  const handlePrint = useCallback(() => {
    if (onPrint && safeConsultation) {
      onPrint(safeConsultation);
    }
  }, [onPrint, safeConsultation]);
  const handleEdit = useCallback(() => {
    if (onEdit && safeConsultation) {
      onEdit(safeConsultation);
    }
  }, [onEdit, safeConsultation]);
  const handleComplete = useCallback(() => {
    if (onComplete && safeConsultation) {
      onComplete(safeConsultation);
    }
  }, [onComplete, safeConsultation]);

  const canAddLabOrder = useMemo(() => {
    if (!safeConsultation || safeConsultation.type !== 'consultation') return false;
    if (safeConsultation.status !== 'In Progress') return false;
    const pid = safeConsultation.patientIdNumeric;
    if (typeof pid !== 'number' || Number.isNaN(pid)) return false;
    const sid = Number(safeConsultation.id);
    return !Number.isNaN(sid);
  }, [safeConsultation]);

  const handleSubmitLabOrder = useCallback(
    async (payload: LabOrderSubmitInput) => {
      if (!safeConsultation) return;
      const patientId = safeConsultation.patientIdNumeric;
      const sessionId = Number(safeConsultation.id);
      if (typeof patientId !== 'number' || Number.isNaN(patientId) || Number.isNaN(sessionId)) {
        toast.error('Cannot add lab order: missing patient or session');
        return;
      }
      await labService.createOrder({
        patient: patientId as any,
        visit: safeConsultation.visitId ?? undefined,
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
              .replace(/[^A-Z0-9]+/g, '_')
              .replace(/^_|_$/g, '') ||
            'LAB',
          sample_type: t.sample_type || 'Blood',
          template: t.id,
          status: 'pending',
          notes: payload.clinicalNotes || '',
        })),
      } as any);
      toast.success('Lab order added');
      try {
        const fresh = await loadConsultationFromSession(safeConsultation.id);
        if (fresh) setLoadedConsultation(fresh);
      } catch (e) {
        console.warn('Reload after lab order failed:', e);
      }
    },
    [safeConsultation]
  );

  if (!safeConsultation && !loading) {
    return null;
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] sm:max-w-[1000px] lg:max-w-[1200px] max-h-[90vh] overflow-y-auto mx-2 sm:mx-4"
        aria-labelledby="consultation-modal-title"
        aria-describedby="consultation-modal-description"
      >
        <VisuallyHidden>
          <DialogTitle id="consultation-modal-title">{loading ? 'Loading Consultation Details' : (safeConsultation?.type === 'visit' ? 'Visit Details' : 'Consultation Details')}</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight" aria-hidden="true">
          <Stethoscope className="h-5 w-5 text-emerald-500" />
          {loading ? 'Loading Consultation Details...' : (safeConsultation?.type === 'visit' ? 'Visit Details' : 'Consultation Details')}
        </div>
        <DialogDescription id="consultation-modal-description">
          {loading
            ? 'Loading consultation details...'
            : `${safeConsultation?.id || 'Unknown ID'} • ${safeConsultation?.patient || 'Unknown Patient'} • ${safeConsultation?.date || 'Unknown Date'}`
          }
        </DialogDescription>
        
        {loading ? (
          <div
            className="flex items-center justify-center py-12"
            role="status"
            aria-label="Loading consultation details"
          >
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Loading consultation details...</span>
          </div>
        ) : safeConsultation ? (
          <div className="mt-4">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md print:shadow-none p-3 sm:p-6 space-y-4 sm:space-y-6">
                {/* Header with Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-4 mb-6 gap-4">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white" tabIndex={-1}>
                      {safeConsultation?.type === 'visit' ? 'Patient Visit Summary' : 'Consultation Report'}
                    </h1>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge className="bg-emerald-500 text-white">{safeConsultation.id}</Badge>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {(() => {
                          try {
                            const dateTime = new Date(`${safeConsultation.date}T${safeConsultation.time}`);
                            if (isNaN(dateTime.getTime())) {
                              return `${safeConsultation.date} • ${safeConsultation.time} • ${safeConsultation.clinic}`;
                            }
                            return `${dateTime.toLocaleDateString()} • ${dateTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} • ${safeConsultation.clinic}`;
                          } catch {
                            return `${safeConsultation.date} • ${safeConsultation.time} • ${safeConsultation.clinic}`;
                          }
                        })()}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 print:hidden">
                    {onPrint && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPrint(safeConsultation)}
                        className="flex-shrink-0"
                        aria-label="Download consultation report"
                      >
                        <Download className="h-4 w-4 mr-2" aria-hidden="true" />Download
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                      className="flex-shrink-0"
                      aria-label="Print consultation report"
                    >
                      <Printer className="h-4 w-4 mr-2" aria-hidden="true" />Print
                    </Button>
                  </div>
                </div>

                {/* Patient Information */}
                <div className="border-b pb-4">
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">PATIENT INFORMATION</h3>
                  <p className="text-gray-800 dark:text-gray-200 font-medium text-lg">{safeConsultation.patient}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    ID: {safeConsultation.patientId}
                    {safeConsultation.patientAge && ` • ${safeConsultation.patientAge}y`}
                    {safeConsultation.patientGender && ` • ${safeConsultation.patientGender}`}
                  </p>
                </div>

                {/* Session Information */}
                <div className="border-b pb-4">
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-blue-500" />
                    CONSULTATION DETAILS
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Doctor:</span>
                      <span className="ml-2 text-gray-600 dark:text-gray-400">{safeConsultation.doctor}</span>
                    </div>
                    {safeConsultation.doctorSpecialty && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Specialty:</span>
                        <span className="ml-2 text-gray-600 dark:text-gray-400">{safeConsultation.doctorSpecialty}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Duration:</span>
                      <span className="ml-2 text-gray-600 dark:text-gray-400">{safeConsultation.sessionDuration || 0} min</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Room:</span>
                      <span className="ml-2 text-gray-600 dark:text-gray-400">{safeConsultation.room}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                      <Badge className={`ml-2 ${getStatusBadge(safeConsultation.status)}`}>{safeConsultation.status}</Badge>
                    </div>
                  </div>
                </div>

                {/* Vital Signs */}
                {latestVitals && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">VITAL SIGNS</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="p-3 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-500">Temperature</p>
                        <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{latestVitals.temperature}°C</p>
                      </div>
                      <div className="p-3 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-500">Blood Pressure</p>
                        <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{latestVitals.systolic}/{latestVitals.diastolic} mmHg</p>
                      </div>
                      <div className="p-3 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-500">Heart Rate</p>
                        <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{latestVitals.heartRate} bpm</p>
                      </div>
                      <div className="p-3 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-500">Respiratory Rate</p>
                        <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{latestVitals.respiratoryRate}/min</p>
                      </div>
                      <div className="p-3 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-500">Oxygen Saturation</p>
                        <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{latestVitals.oxygenSaturation}%</p>
                      </div>
                      <div className="p-3 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-500">Weight</p>
                        <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{latestVitals.weight} kg</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Presenting Complaint */}
                {safeConsultation.presentationComplaint && safeConsultation.presentationComplaint.trim().length > 0 && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      PRESENTING COMPLAINT
                    </h3>
                    <div className="border border-amber-300 dark:border-amber-700 rounded-lg p-4 bg-amber-50 dark:bg-amber-900/20">
                      <p className="text-gray-800 dark:text-gray-200 font-medium">{safeConsultation.presentationComplaint}</p>
                    </div>
                  </div>
                )}

                {/* Clinical Notes */}
                <div className="border-b pb-4">
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-slate-500" />
                    CLINICAL NOTES
                  </h3>
                  <div className="space-y-4">
                    {safeConsultation.historyOfPresentIllness && (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-900/10">
                        <span className="font-medium text-gray-700 dark:text-gray-300">History of Present Illness:</span>
                        <p className="mt-2 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{safeConsultation.historyOfPresentIllness}</p>
                      </div>
                    )}
                    {safeConsultation.physicalExamination && (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-900/10">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Physical Examination:</span>
                        <p className="mt-2 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{safeConsultation.physicalExamination}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Diagnosis (ICD-10) */}
                <div className="border-b pb-4">
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">DIAGNOSIS (ICD-10)</h3>
                  {safeConsultation.diagnosisCodes && safeConsultation.diagnosisCodes.length > 0 ? (
                    <div className="space-y-4">
                      {/* Primary Diagnoses */}
                      {safeConsultation.diagnosisCodes.filter(diag => diag.type === 'Primary').length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            Primary - Main diagnosis
                          </h4>
                          <div className="space-y-2 ml-4">
                            {safeConsultation.diagnosisCodes.filter(diag => diag.type === 'Primary').map((diag, idx) => (
                              <div key={`primary-${idx}`} className="flex items-start gap-3 p-3 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
                                <Badge className="bg-red-600 text-white font-mono shrink-0">{diag.code}</Badge>
                                <p className="text-sm text-gray-800 dark:text-gray-200 flex-1">{diag.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Secondary Diagnoses */}
                      {safeConsultation.diagnosisCodes.filter(diag => diag.type === 'Secondary').length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
                            <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                            Secondary - Contributing condition
                          </h4>
                          <div className="space-y-2 ml-4">
                            {safeConsultation.diagnosisCodes.filter(diag => diag.type === 'Secondary').map((diag, idx) => (
                              <div key={`secondary-${idx}`} className="flex items-start gap-3 p-3 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                                <Badge className="bg-amber-600 text-white font-mono shrink-0">{diag.code}</Badge>
                                <p className="text-sm text-gray-800 dark:text-gray-200 flex-1">{diag.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Differential Diagnoses */}
                      {safeConsultation.diagnosisCodes.filter(diag => diag.type === 'Differential').length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            Differential - Possible diagnosis
                          </h4>
                          <div className="space-y-2 ml-4">
                            {safeConsultation.diagnosisCodes.filter(diag => diag.type === 'Differential').map((diag, idx) => (
                              <div key={`differential-${idx}`} className="flex items-start gap-3 p-3 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                <Badge className="bg-blue-600 text-white font-mono shrink-0">{diag.code}</Badge>
                                <p className="text-sm text-gray-800 dark:text-gray-200 flex-1">{diag.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/20">
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">No ICD-10 diagnosis codes recorded</p>
                    </div>
                  )}
                </div>

                {/* Assessment */}
                {safeConsultation.assessment && safeConsultation.assessment.trim().length > 0 && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">ASSESSMENT</h3>
                    <div className="border border-blue-300 dark:border-blue-700 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20">
                      <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{safeConsultation.assessment}</p>
                    </div>
                  </div>
                )}

                {/* Treatment Plan */}
                {safeConsultation.plan && safeConsultation.plan.trim().length > 0 && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">TREATMENT PLAN</h3>
                    <div className="pl-4">
                      <ol className="list-decimal space-y-1 text-sm text-gray-700 dark:text-gray-300">
                        {safeConsultation.plan.split('\n').filter(line => line.trim()).map((item, idx) => (
                          <li key={idx} className="pl-2">{item.trim()}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}

                {/* Prescriptions */}
                {(safeConsultation.prescriptions || []).length > 0 && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Pill className="h-5 w-5 text-purple-500" />
                      PRESCRIPTIONS
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-gray-300 dark:border-gray-700">
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Medication</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Dose</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Frequency</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Duration</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Instructions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(safeConsultation.prescriptions || []).map((rx) => (
                            <tr key={rx.id} className="border-b border-gray-200 dark:border-gray-800">
                              <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">
                                {rx.medication} {rx.strength} ({rx.form})
                              </td>
                              <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{rx.dosage}</td>
                              <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{rx.frequency}</td>
                              <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{rx.duration}</td>
                              <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{rx.instructions || 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Laboratory Orders */}
                {(canAddLabOrder || (safeConsultation.labOrders || []).length > 0) && (
                  <div className="border-b pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <FlaskConical className="h-5 w-5 text-orange-500" />
                        LABORATORY ORDERS
                      </h3>
                      {canAddLabOrder && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="print:hidden shrink-0"
                          onClick={() => setShowAddLabOrder(true)}
                          aria-label="Add lab order for this session"
                        >
                          <FlaskConical className="h-4 w-4 mr-2" aria-hidden />
                          Add lab order
                        </Button>
                      )}
                    </div>
                    {(safeConsultation.labOrders || []).length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-gray-300 dark:border-gray-700">
                              <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Test</th>
                              <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Priority</th>
                              <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(safeConsultation.labOrders || []).map((l) => (
                              <tr key={l.id} className="border-b border-gray-200 dark:border-gray-800">
                                <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">{l.test}</td>
                                <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{l.priority}</td>
                                <td className="py-2 px-3">
                                  <Badge variant="outline" className={l.status === 'Completed' || l.status === 'completed' ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400' : ''}>
                                    {l.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No lab orders recorded for this session yet.</p>
                    )}
                  </div>
                )}

                {/* Radiology Orders */}
                {(safeConsultation.radiologyOrders || []).length > 0 && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <ScanLine className="h-5 w-5 text-cyan-500" />
                      RADIOLOGY ORDERS
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-gray-300 dark:border-gray-700">
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Study</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Priority</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(safeConsultation.radiologyOrders || []).map((r) => (
                            <tr key={r.id} className="border-b border-gray-200 dark:border-gray-800">
                              <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">{r.study}</td>
                              <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{r.priority}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className={r.status === 'Completed' || r.status === 'completed' ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400' : ''}>
                                  {r.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Physiotherapy Orders */}
                {(safeConsultation.physioOrders || []).length > 0 && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Activity className="h-5 w-5 text-emerald-500" />
                      PHYSIOTHERAPY ORDERS
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-gray-300 dark:border-gray-700">
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Diagnosis / Chief Complaint</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Priority</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(safeConsultation.physioOrders || []).map((p) => (
                            <tr key={p.id} className="border-b border-gray-200 dark:border-gray-800">
                              <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">{p.diagnosis || p.chiefComplaint || '—'}</td>
                              <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{p.priority}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className={p.status === 'completed' || p.status?.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400' : ''}>
                                  {p.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Nursing Orders/Interventions */}
                {(safeConsultation.nursingOrders || []).length > 0 && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Syringe className="h-5 w-5 text-purple-500" />
                      NURSING ORDERS & INTERVENTIONS
                    </h3>
                    <div className="space-y-3">
                      {(safeConsultation.nursingOrders || []).map((order) => (
                        <div key={order.id} className="border border-purple-200 dark:border-purple-800 rounded-lg p-4 bg-purple-50 dark:bg-purple-900/10">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge
                                className={`${
                                  order.type.toLowerCase().includes('ward') ? 'bg-red-600' :
                                  order.type.toLowerCase().includes('injection') ? 'bg-blue-600' :
                                  order.type.toLowerCase().includes('dressing') ? 'bg-green-600' :
                                  order.type.toLowerCase().includes('medication') ? 'bg-purple-600' :
                                  'bg-gray-600'
                                } text-white`}
                              >
                                {order.type}
                              </Badge>
                              <Badge variant="outline" className={
                                order.priority === 'Emergency' ? 'border-red-300 text-red-700 bg-red-50 dark:bg-red-900/20' :
                                order.priority === 'Urgent' ? 'border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-900/20' :
                                'border-gray-300 text-gray-700 bg-gray-50 dark:bg-gray-900/20'
                              }>
                                {order.priority}
                              </Badge>
                            </div>
                            <Badge variant="outline" className={
                              (order.status === 'completed' || order.status?.toLowerCase() === 'completed') ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400' :
                              (order.status === 'in_progress' || order.status?.toLowerCase() === 'in progress') ? 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400'
                            }>
                              {order.status}
                            </Badge>
                          </div>
                          {order.instructions && (
                            <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">
                              <span className="font-medium">Instructions:</span> {order.instructions}
                            </p>
                          )}
                          <div className="text-xs text-gray-500 dark:text-gray-500 flex items-center justify-between">
                            <span>Ordered by: {order.orderedBy}</span>
                            <span>{new Date(order.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hospitalization Status */}
                {safeConsultation.patientId && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <User className="h-5 w-5 text-indigo-500" />
                      HOSPITALIZATION STATUS
                    </h3>
                    <WardAdmissionStatus patientId={safeConsultation.patientId} />
                  </div>
                )}

                {/* Session Timeline */}
                {(safeConsultation.timeline || []).length > 0 && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-orange-500" />
                      SESSION TIMELINE
                    </h3>
                    <div className="space-y-3">
                      {(safeConsultation.timeline || [])
                        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
                        .map((event, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-3 h-3 rounded-full ${
                              event.type === 'vitals' ? 'bg-blue-500' :
                              event.type === 'prescription' ? 'bg-green-500' :
                              event.type === 'lab_order' ? 'bg-purple-500' :
                              event.type === 'radiology_order' ? 'bg-cyan-500' :
                              event.type === 'nursing_order' ? 'bg-red-500' :
                              'bg-gray-500'
                            }`} />
                            {index < (safeConsultation.timeline || []).length - 1 && (
                              <div className="w-0.5 h-8 bg-gray-300 dark:bg-gray-600 mt-1" />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {event.event}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-500">
                                {(() => {
                                  try {
                                    const eventDate = new Date(event.time);
                                    if (isNaN(eventDate.getTime())) {
                                      return 'Invalid Time';
                                    }
                                    return eventDate.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
                                  } catch {
                                    return 'Invalid Time';
                                  }
                                })()}
                              </span>
                            </div>
                            {event.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400">{event.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up Information */}
                {(safeConsultation.followUpDate || safeConsultation.followUpNotes) && (
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-teal-500" />
                      FOLLOW-UP INFORMATION
                    </h3>
                    <div className="border border-teal-200 dark:border-teal-800 rounded-lg p-3 bg-teal-50 dark:bg-teal-900/10">
                      {safeConsultation.followUpDate && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          <span className="font-medium">Follow-up Date:</span> {formatDate(safeConsultation.followUpDate)}
                        </p>
                      )}
                      {safeConsultation.followUpNotes && (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          <span className="font-medium">Follow-up Notes:</span> {safeConsultation.followUpNotes}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Session Outcome */}
                <div>
                  <h3 className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 mb-2">SESSION OUTCOME</h3>
                  <div className="border border-emerald-300 dark:border-emerald-700 rounded-lg p-3 bg-emerald-50 dark:bg-emerald-900/20">
                    <Badge className="bg-emerald-500 text-white">{safeConsultation.status}</Badge>
                    {safeConsultation.assessment && safeConsultation.assessment.trim().length > 0 && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                        <span className="font-medium">Assessment Summary:</span> {safeConsultation.assessment}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-4 border-t text-xs text-gray-500 dark:text-gray-600 text-center print:block">
                  <p>Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
                  <p className="mt-1">Document ID: {safeConsultation.id}</p>
                  <p className="mt-1">Nigerian Ports Authority • Medical Services Department</p>
                </div>
              </div>
          </div>
        ) : null}
        
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            aria-label="Close consultation details"
          >
            Close
          </Button>
          {onPrint && safeConsultation && (
            <Button
              variant="outline"
              onClick={handlePrint}
              aria-label="Print consultation report"
            >
              <Printer className="h-4 w-4 mr-2" aria-hidden="true" />Print
            </Button>
          )}
          {onEdit && safeConsultation && (
            <Button
              variant="outline"
              onClick={handleEdit}
              aria-label="Edit consultation details"
            >
              <Edit className="h-4 w-4 mr-2" aria-hidden="true" />Edit
            </Button>
          )}
          {onComplete && safeConsultation?.status === "In Progress" && (
            <Button
              onClick={handleComplete}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700"
              aria-label={isSubmitting ? "Completing consultation..." : "Mark consultation as complete"}
              aria-disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />Completing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />Complete
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <LabOrderModal
      open={showAddLabOrder}
      onOpenChange={setShowAddLabOrder}
      onSubmit={handleSubmitLabOrder}
      confirmLabel="Submit lab order"
    />
    </>
  );
});
