"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { visitService, roomService, type Visit } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { apiFetch } from '@/lib/api-client';
import { getPriorityFromVisitType } from '@/lib/utils/priority';
import {
  Users, Search, Stethoscope, UserCheck, ArrowRight, Clock, AlertTriangle,
  Eye, Edit, CheckCircle2, Calendar, Activity, Thermometer,
  Heart, Wind, Droplets, Scale, Loader2, Save, X
} from 'lucide-react';
import { getAllClinicsWithAll } from '@/lib/constants/clinics';
import { clinicMatches } from '@/lib/utils/clinic-utils';
import { PatientAvatar } from "@/components/PatientAvatar";
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/CustomDateRangeButton';

// Format visit type for display
const getVisitTypeLabel = (type: string) => {
  const typeMap: Record<string, string> = {
    'consultation': 'Consultation',
    'follow_up': 'Follow-up',
    'emergency': 'Emergency',
    'routine': 'Routine Checkup',
  };
  return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, '-');
};

// Constants - standardized clinic list
const clinics = getAllClinicsWithAll();

// Types
interface Patient {
  id: string;
  name: string;
  patientId: string;
  patientNumericId?: number; // Store the actual patient ID from backend
  visitNumericId?: number; // Store the actual visit ID from backend
  personalNumber: string;
  clinic: string;
  visitDate: string;
  visitTime: string;
  visitType: string;
  visitNotes?: string; // Notes / Special Instructions from visit
  nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room' | 'Sent to Physiotherapy';
  consultationRoom?: string;
  vitals?: VitalsData;
  age?: number;
  gender?: string;
  waitTime?: number;
}

interface VitalsData {
  temperature: string;
  pulse: string;
  bloodPressureSystolic: string;
  bloodPressureDiastolic: string;
  respiratoryRate: string;
  oxygenSaturation: string;
  weight: string;
  height: string;
  painScale: string;
  bloodSugar: string;
  notes: string;
  recordedAt?: string;
  recordedBy?: string;
}

interface ConsultationRoom {
  id: string;
  name: string;
  status: 'available' | 'occupied';
  doctor?: string;
  specialty?: string;
  queueCount: number;
  currentPatient?: string;
}

// Patient and room data will be loaded from API

const emptyVitals: VitalsData = {
  temperature: '', pulse: '', bloodPressureSystolic: '', bloodPressureDiastolic: '',
  respiratoryRate: '', oxygenSaturation: '', weight: '', height: '',
  painScale: '', bloodSugar: '', notes: ''
};

export default function NursingPoolQueuePage() {
  // Debug logging (off by default). Enable in browser console:
  //   localStorage.setItem('debug_nursing_pool', '1')
  // Disable:
  //   localStorage.removeItem('debug_nursing_pool')
  const debugLog = (...args: any[]) => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage?.getItem('debug_nursing_pool') === '1') {
        // eslint-disable-next-line no-console
        console.log(...args);
      }
    } catch {
      // ignore
    }
  };
  const [patients, setPatients] = useState<NursingPatient[]>([]);
  const [rooms, setRooms] = useState<ConsultationRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [sendingToPhysioVisitId, setSendingToPhysioVisitId] = useState<number | null>(null);
  const [physioCheckins, setPhysioCheckins] = useState<Record<number, { orderId: number; status: string }>>({});
  const [eyeCheckins, setEyeCheckins] = useState<Record<number, { orderId: number; status: string }>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [typeFilter, setTypeFilter] = useState('all');
  const [clinicFilter, setClinicFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Load visits and rooms from API - extracted as reusable function
  const loadData = useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        // Load rooms first
        const roomsResult = await roomService.getRooms({ page_size: 200 });
        const transformedRooms: ConsultationRoom[] = roomsResult.results.map((room: any) => ({
          id: String(room.id),
          name: room.name,
          status: room.status?.toLowerCase() === 'active' ? 'available' as const : 'occupied' as const,
          doctor: room.assigned_doctor || undefined,
          specialty: room.specialty || '',
          queueCount: 0, // Will be updated if we can get queue counts
          currentPatient: undefined,
        }));
        setRooms(transformedRooms);

        // Build date filter based on dateFilter selection
        let dateParam: string | undefined = undefined;
        let startDate: string | undefined = undefined;
        let endDate: string | undefined = undefined;
        
        if (dateRange.from || dateRange.to) {
          startDate = dateRange.from || undefined;
          endDate = dateRange.to || undefined;
        } else if (dateFilter === 'today') {
          const today = new Date().toISOString().split('T')[0];
          dateParam = today;
        } else if (dateFilter === 'week') {
          const today = new Date();
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
          startDate = weekStart.toISOString().split('T')[0];
          endDate = today.toISOString().split('T')[0];
        } else if (dateFilter === 'month') {
          const today = new Date();
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          startDate = monthStart.toISOString().split('T')[0];
          endDate = today.toISOString().split('T')[0];
        }
        // 'all' means no date filter

        // Fetch visits that should go to nursing
        // Only visits with status 'in_progress' should appear in nursing pool queue
        const result = await visitService.getVisits({
          status: 'in_progress',
          page_size: 300,
          date: dateParam,
          start_date: startDate,
          end_date: endDate,
        });

        // Fetch completed consultation sessions to exclude visits that have completed consultations
        let completedConsultationVisits = new Set<number>();
        try {
          const completedQs = new URLSearchParams();
          completedQs.set('status', 'completed');
          completedQs.set('page_size', '1000');
          if (dateParam) completedQs.set('date', dateParam);
          if (startDate) completedQs.set('start_date', startDate);
          if (endDate) completedQs.set('end_date', endDate);
          const consultationSessionsResult = await apiFetch<{ results: any[] }>(`/consultation/sessions/?${completedQs.toString()}`);
          completedConsultationVisits = new Set(consultationSessionsResult.results
            .filter((session: any) => session.visit)
            .map((session: any) => session.visit));
        } catch (err) {
          console.error('Error fetching completed consultation sessions:', err);
        }

        // Filter visits that should go to nursing:
        // 1. Exclude cancelled visits (API already filters for 'in_progress' status)
        // 2. Exclude visits with completed consultation sessions
        const nursingVisits = result.results.filter(visit =>
          visit.status !== 'cancelled' &&
          !completedConsultationVisits.has(visit.id)
        );

        // When status filter is "all" or "sent-to-room", also load consultation queue
        // history for the selected date range so "Sent to Room" can be shown for
        // Today/Week/Month/All Time (including inactive queue items).
        type QueueItem = {
          visit?: number | null;
          patient?: number | null;
          patient_name?: string;
          room_name?: string;
          queued_at?: string;
          is_active?: boolean;
          visit_display_id?: string | null;
          visit_date?: string | null;
          visit_time?: string | null;
          visit_type?: string | null;
          visit_status?: string | null;
          visit_clinic?: string | null;
        };

        let sentVisitToRoom = new Map<number, { roomName: string; sentAt?: string; queueActive?: boolean; queueItem?: QueueItem }>();
        if (statusFilter === 'all' || statusFilter === 'sent-to-room') {
          try {
            const qs = new URLSearchParams();
            // NOTE: backend now supports `date/start_date/end_date` based on queued_at.
            if (dateParam) qs.set('date', dateParam);
            if (startDate) qs.set('start_date', startDate);
            if (endDate) qs.set('end_date', endDate);
            qs.set('ordering', '-queued_at');
            qs.set('page_size', dateFilter === 'all' ? '1000' : '500');

            const queueResult = await apiFetch<{ results: QueueItem[] }>(`/consultation/queue/?${qs.toString()}`);
            (queueResult.results || []).forEach((item) => {
              const visitId = typeof item.visit === 'number' ? item.visit : item.visit ? parseInt(String(item.visit), 10) : null;
              if (!visitId || !item.room_name) return;
              // Because we request ordering=-queued_at, the first time we see a visit is the latest send-to-room record.
              if (!sentVisitToRoom.has(visitId)) {
                sentVisitToRoom.set(visitId, {
                  roomName: item.room_name,
                  sentAt: item.queued_at || undefined,
                  queueActive: item.is_active,
                  queueItem: item,
                });
              }
            });
          } catch (err) {
            console.error('Error fetching consultation queue history:', err);
          }
        }

        debugLog('All visits loaded:', result.results.length);
        debugLog('Filtered nursing visits:', nursingVisits.length);
        debugLog('Visit statuses found:', [...new Set(result.results.map(v => v.status))]);

        // Use filtered results
        const filteredResult = { ...result, results: nursingVisits };

        debugLog('Nursing pool queue - loaded visits:', filteredResult.results.length);
        debugLog('Visit details:', filteredResult.results.map(v => ({
          id: v.id,
          patient: v.patient_name,
          status: v.status,
          date: v.date,
          time: v.time
        })));
        
        // Build a combined visit list:
        // - nursingVisits: in_progress visits needing nursing work
        // - sent-to-room visits: visits referenced by consultation queue in the selected date range
        const combinedVisits: Visit[] = [...nursingVisits];
        const existingVisitIds = new Set<number>(combinedVisits.map(v => v.id));
        sentVisitToRoom.forEach((meta, visitId) => {
          if (existingVisitIds.has(visitId)) return;
          const qi = meta.queueItem;
          if (!qi) return;
          const patientId = typeof qi.patient === 'number' ? qi.patient : qi.patient ? parseInt(String(qi.patient), 10) : undefined;
          if (!patientId) return;

          // Create a minimal Visit-like object sufficient for display and vitals lookup.
          // We prefer visit fields included in the queue serializer; fall back to queued_at date/time.
          const queuedAt = qi.queued_at ? new Date(qi.queued_at) : null;
          const fallbackDate = queuedAt ? queuedAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const fallbackTime = queuedAt ? queuedAt.toTimeString().slice(0, 8) : '00:00:00';

          combinedVisits.push({
            id: visitId,
            visit_id: qi.visit_display_id || `VIS-${visitId}`,
            patient_id: (qi as any).patient_details?.patient_id,
            patient: patientId,
            patient_name: qi.patient_name ?? '',
            visit_type: qi.visit_type || 'consultation',
            status: qi.visit_status || 'completed',
            date: qi.visit_date || fallbackDate,
            time: (qi.visit_time as any) || fallbackTime,
            clinic: qi.visit_clinic || 'GOPD',
            clinical_notes: '',
          } as Visit);
        });

        let physioCheckedInByVisitId: Record<number, { orderId: number; status: string }> = {};
        let eyeCheckedInByVisitId: Record<number, { orderId: number; status: string }> = {};
        const combinedVisitIds = Array.from(new Set(combinedVisits.map(v => v.id))).filter(Boolean);
        try {
          if (combinedVisitIds.length > 0) {
            const qs = new URLSearchParams();
            qs.set('visit_ids', combinedVisitIds.join(','));
            // Fetch physio checkins
            const physioCheckins = await apiFetch<{ results: Record<string, { checked_in: boolean; order_id?: number; status?: string }> }>(
              `/physiotherapy/orders/checkins-for-visits/?${qs.toString()}`
            );
            Object.entries(physioCheckins.results || {}).forEach(([visitIdRaw, payload]) => {
              const visitId = Number(visitIdRaw);
              if (!Number.isFinite(visitId)) return;
              if (!payload?.checked_in) return;
              if (typeof payload.order_id !== 'number') return;
              physioCheckedInByVisitId[visitId] = { orderId: payload.order_id, status: payload.status || 'scheduled' };
            });
            
            // Fetch eye clinic checkins
            const eyeCheckins = await apiFetch<{ results: Record<string, { checked_in: boolean; order_id?: number; status?: string }> }>(
              `/eyecare/orders/checkins-for-visits/?${qs.toString()}`
            );
            Object.entries(eyeCheckins.results || {}).forEach(([visitIdRaw, payload]) => {
              const visitId = Number(visitIdRaw);
              if (!Number.isFinite(visitId)) return;
              if (!payload?.checked_in) return;
              if (typeof payload.order_id !== 'number') return;
              eyeCheckedInByVisitId[visitId] = { orderId: payload.order_id, status: payload.status || 'scheduled' };
            });
          }
        } catch (err) {
          debugLog('Specialty clinic check-ins not available:', err);
        }
        setPhysioCheckins(physioCheckedInByVisitId);
        setEyeCheckins(eyeCheckedInByVisitId);

        // Fetch latest vitals in one batch call for active nursing visits.
        const vitalsTargetVisitIds = Array.from(new Set(nursingVisits.map(v => v.id))).filter(Boolean);
        const vitalsMap = new Map<number, any>();
        if (vitalsTargetVisitIds.length > 0) {
          try {
            const vitalsResponse = await apiFetch<{ results: Record<string, any> }>(
              `/vitals/latest-by-visits/?visit_ids=${vitalsTargetVisitIds.join(',')}`
            );
            Object.entries(vitalsResponse.results || {}).forEach(([visitIdRaw, vital]) => {
              const visitId = Number(visitIdRaw);
              if (Number.isFinite(visitId)) {
                vitalsMap.set(visitId, vital);
              }
            });
          } catch (err) {
            console.error('Error fetching batched vitals:', err);
          }
        }

        // Build visit -> room mapping for "Sent to Room" status.
        // If we did not load history (because statusFilter isn't all/sent-to-room),
        // fall back to active queue only to mark current sent-to-room visits.
        let queueVisitToRoom = new Map<number, string>();
        let queueVisitToSentAt = new Map<number, string>();
        if (sentVisitToRoom.size > 0) {
          sentVisitToRoom.forEach((meta, visitId) => {
            queueVisitToRoom.set(visitId, meta.roomName);
            if (meta.sentAt) queueVisitToSentAt.set(visitId, meta.sentAt);
          });
        } else {
          try {
            const queueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?is_active=true&page_size=1000`);
            (queueResult.results || []).forEach((item: any) => {
              if (item.visit && item.room_name) {
                const vid = typeof item.visit === 'number' ? item.visit : parseInt(String(item.visit), 10);
                queueVisitToRoom.set(vid, item.room_name);
              }
            });
          } catch (err) {
            console.error('Error fetching consultation queue:', err);
          }
        }
        
        // Don't filter out visits - show all visits, but mark those in queue as "Sent to Room"
        const visitsNeedingNursing = combinedVisits; // Include queue-history visits when loaded
        
        // Transform visits to NursingPatient format
        debugLog('Starting transformation of', visitsNeedingNursing.length, 'visits to nursing patients');
        const transformedPatients: NursingPatient[] = visitsNeedingNursing.map((visit: Visit) => {
          // Calculate wait time (minutes since visit was created)
          const visitDateTime = new Date(`${visit.date}T${visit.time}`);
          const waitTime = Math.floor((Date.now() - visitDateTime.getTime()) / (1000 * 60));
          
          // Get vitals for this visit
          const vitalsData = vitalsMap.get(visit.id);

          // Determine nursing status based on visit data, vitals, and queue status
          let nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room' | 'Sent to Physiotherapy' | 'Sent to Eye Clinic' = 'Pending';
          const roomName = queueVisitToRoom.get(visit.id);
          const sentToPhysio = Boolean(physioCheckedInByVisitId[visit.id]);
          const sentToEyeClinic = Boolean(eyeCheckedInByVisitId[visit.id]);
          
          if (roomName) {
            // Patient has been sent to a room
            nursingStatus = 'Sent to Room';
          } else if (sentToEyeClinic && clinicMatches(visit.clinic || '', 'Eye Clinic')) {
            nursingStatus = 'Sent to Eye Clinic';
          } else if (sentToPhysio && clinicMatches(visit.clinic || '', 'Physiotherapy')) {
            nursingStatus = 'Sent to Physiotherapy';
          } else if (vitalsData) {
            // Check if vitals are complete (have essential measurements - only temp and pulse required)
            const hasCompleteVitals = vitalsData.temperature && vitalsData.heart_rate;
            nursingStatus = hasCompleteVitals ? 'Ready for Consultation' : 'Vitals Recorded';
          }
          
          // Transform vitals data to frontend format
          const vitals: VitalsData | undefined = vitalsData ? {
            temperature: vitalsData.temperature?.toString() || '',
            pulse: vitalsData.heart_rate?.toString() || '',
            bloodPressureSystolic: vitalsData.blood_pressure_systolic?.toString() || '',
            bloodPressureDiastolic: vitalsData.blood_pressure_diastolic?.toString() || '',
            respiratoryRate: vitalsData.respiratory_rate?.toString() || '',
            oxygenSaturation: vitalsData.oxygen_saturation?.toString() || '',
            weight: vitalsData.weight?.toString() || '',
            height: vitalsData.height?.toString() || '',
            painScale: vitalsData.pain_scale?.toString() || '',
            bloodSugar: vitalsData.blood_sugar?.toString() || '',
            notes: vitalsData.notes || '',
            recordedAt: vitalsData.recorded_at || new Date().toISOString(),
            recordedBy: vitalsData.recorded_by_name || 'Unknown',
          } : undefined;
          
          return {
            id: String(visit.id),
            name: visit.patient_name ?? '',
            patientId: (visit as any).patient_id || '', // direct from backend
            visitId: visit.visit_id || String(visit.id), // Visit ID string (VIS-...)
            personalNumber: '', // Not used for search, keep empty
            clinic: visit.clinic || 'GOPD',
            clinics: (visit.clinics && visit.clinics.length > 0 ? visit.clinics : [visit.clinic]) as string[], // All clinics for this visit
            completedClinics: (visit.completed_clinics || []) as string[], // Completed clinics
            visitDate: visit.date,
            visitTime: visit.time,
            visitType: visit.visit_type || 'consultation', // Keep lowercase for filtering
            nursingStatus,
            consultationRoom: roomName, // Store room name if patient is in queue
            vitals,
            waitTime: waitTime > 0 ? waitTime : 0,
            patientNumericId: visit.patient, // Store the actual patient ID from backend
            visitNumericId: visit.id, // Store the actual visit ID from backend
            visitNotes: visit.clinical_notes, // Clinical notes from the visit
            age: (visit as any).age || 0, // Patient age from backend
            gender: ((visit as any).gender || 'Male') as any, // Patient gender from backend
            sentAt: queueVisitToSentAt.get(visit.id),
            sentToPhysio,
            sentToEyeClinic,
          };
        });

        setPatients(transformedPatients);
      } catch (err) {
        console.error('Error loading nursing pool data:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load nursing pool queue. Please try again.');
        }
      } finally {
        setLoading(false);
      }
  }, [dateFilter, statusFilter, dateRange.from, dateRange.to]);

  // Load data when filters change
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Dialog states
  const [isVitalsDialogOpen, setIsVitalsDialogOpen] = useState(false);
  const [isViewVitalsDialogOpen, setIsViewVitalsDialogOpen] = useState(false);
  const [isRoomPickerOpen, setIsRoomPickerOpen] = useState(false);
  // Custom interface for nursing patient objects (different from Patient interface)
  interface NursingPatient {
    id: string;
    name: string;
    patientId: string;
    visitId: string;
    personalNumber: string;
    clinic: string;
    clinics?: string[]; // Multiple clinics for this visit
    completedClinics?: string[]; // Completed clinics
    visitDate: string;
    visitTime: string;
    visitType: string;
    nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room' | 'Sent to Physiotherapy' | 'Sent to Eye Clinic';
    consultationRoom?: string;
    vitals?: any;
    waitTime: number;
    patientNumericId: number;
    visitNumericId: number;
    visitNotes?: string;
    age?: number;
    gender?: string;
    sentAt?: string;
    sentToPhysio?: boolean;
    sentToEyeClinic?: boolean;
  }

  const [selectedPatient, setSelectedPatient] = useState<NursingPatient | null>(null);
  const [vitalsForm, setVitalsForm] = useState<VitalsData>(emptyVitals);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Reload rooms when room picker opens
  useEffect(() => {
    if (isRoomPickerOpen) {
      if (rooms.length > 0) return;
      const loadRooms = async () => {
        try {
          const roomsResult = await roomService.getRooms({ page_size: 200 });
          const transformedRooms: ConsultationRoom[] = roomsResult.results.map((room: any) => ({
            id: String(room.id),
            name: room.name,
            status: room.status?.toLowerCase() === 'active' ? 'available' as const : 'occupied' as const,
            doctor: room.assigned_doctor || undefined,
            specialty: room.specialty || '',
            queueCount: 0,
            currentPatient: undefined,
          }));
          setRooms(transformedRooms);
        } catch (err) {
          console.error('Error loading rooms:', err);
        }
      };
      loadRooms();
    }
  }, [isRoomPickerOpen, rooms.length]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Filter patients
  const filteredPatients = patients.filter(p => {
    const normalizeStatus = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '-');
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery ||
                         p.name.toLowerCase().includes(searchLower) ||
                         p.patientId.toLowerCase().includes(searchLower) ||
                         (p.visitId && p.visitId.toLowerCase().includes(searchLower)) ||
                         (p.personalNumber && p.personalNumber.toLowerCase().includes(searchLower));
    const matchesStatus = statusFilter === 'all' || normalizeStatus(p.nursingStatus) === statusFilter;
    const matchesType = typeFilter === 'all' || p.visitType.toLowerCase() === typeFilter.toLowerCase();
    const matchesClinic = clinicFilter === 'all' || clinicMatches(p.clinic, clinicFilter);

    const passesAllFilters = matchesSearch && matchesStatus && matchesType && matchesClinic;
    if (!passesAllFilters && patients.length > 0) {
      debugLog('Patient filtered out:', p.name, {
        matchesSearch,
        matchesStatus,
        matchesType,
        matchesClinic,
        statusFilter,
        typeFilter,
        clinicFilter,
        patientStatus: p.nursingStatus
      });
    }
    
    // Date filter
    const dateSource = (p.nursingStatus === 'Sent to Room' && p.sentAt) ? p.sentAt : p.visitDate;
    const visitDate = new Date(dateSource);

    if (dateRange.from || dateRange.to) {
      if (Number.isNaN(visitDate.getTime())) return false;
      if (dateRange.from) {
        const from = new Date(`${dateRange.from}T00:00:00`);
        if (visitDate < from) return false;
      }
      if (dateRange.to) {
        const to = new Date(`${dateRange.to}T23:59:59.999`);
        if (visitDate > to) return false;
      }
    } else if (dateFilter !== 'all') {
      // For "Sent to Room", filter by the send timestamp (queued_at) when available.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (dateFilter === 'today' && visitDate.toDateString() !== today.toDateString()) return false;
      if (dateFilter === 'week') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (visitDate < weekAgo) return false;
      }
      if (dateFilter === 'month') {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        if (visitDate < monthAgo) return false;
      }
    }
    
    // Show all patients that have been to nursing (like Manage Visits)
    return matchesSearch && matchesStatus && matchesType && matchesClinic;
  });

  // Sort newest first
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    const getTimeKey = (p: NursingPatient) => {
      const raw = (p.nursingStatus === 'Sent to Room' && p.sentAt)
        ? p.sentAt
        : `${p.visitDate}T${p.visitTime}`;
      const t = new Date(raw).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const timeDiff = getTimeKey(b) - getTimeKey(a);
    if (timeDiff !== 0) return timeDiff;
    const typeOrder: Record<string, number> = { 'Emergency': 0, 'Consultation': 1, 'Follow-up': 2 };
    const typeDiff = (typeOrder[a.visitType] ?? 3) - (typeOrder[b.visitType] ?? 3);
    if (typeDiff !== 0) return typeDiff;
    return (b.waitTime || 0) - (a.waitTime || 0);
  });

  // Paginated patients
  const paginatedPatients = useMemo(() => {
    debugLog('Total patients:', patients.length);
    debugLog('Filtered patients:', filteredPatients.length);
    debugLog('Sorted patients:', sortedPatients.length);
    debugLog('Current filters:', { statusFilter, typeFilter, clinicFilter, dateFilter, searchQuery });

    const startIndex = (currentPage - 1) * itemsPerPage;
    const result = sortedPatients.slice(startIndex, startIndex + itemsPerPage);
    debugLog('Paginated patients:', result.length);
    return result;
  }, [patients, filteredPatients, sortedPatients, currentPage, itemsPerPage, statusFilter, typeFilter, clinicFilter, dateFilter, searchQuery]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, typeFilter, clinicFilter, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // Stats - Show all patients that have been to nursing
  const stats = {
    totalInPool: patients.length, // All patients that went through nursing
    pendingVitals: patients.filter(p => p.nursingStatus === 'Pending').length,
    readyForConsultation: patients.filter(p => p.nursingStatus === 'Ready for Consultation').length,
    sentToRooms: patients.filter(p => p.nursingStatus === 'Sent to Room').length,
  };


  const openRecordVitals = (patient: NursingPatient) => {
    setSelectedPatient(patient);
    setVitalsForm(patient.vitals || emptyVitals);
    setIsVitalsDialogOpen(true);
  };

  const openViewVitals = (patient: NursingPatient) => {
    setSelectedPatient(patient);
    setIsViewVitalsDialogOpen(true);
  };

  const openRoomPicker = (patient: NursingPatient) => {
    setSelectedPatient(patient);
    setIsRoomPickerOpen(true);
  };

  const handleSendToPhysio = async (patient: NursingPatient) => {
    if (!patient.visitNumericId) return;
    setSendingToPhysioVisitId(patient.visitNumericId);
    try {
      const order = await apiFetch<any>('/physiotherapy/orders/checkin-from-visit/', {
        method: 'POST',
        body: JSON.stringify({ visit: patient.visitNumericId }),
      });
      if (order?.id) {
        setPhysioCheckins(prev => ({
          ...prev,
          [patient.visitNumericId]: { orderId: Number(order.id), status: String(order.status || 'scheduled') },
        }));
      }
      toast.success('Sent to Physiotherapy', {
        description: `${patient.name} is now in the Physiotherapy queue`,
      });
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send to Physiotherapy');
    } finally {
      setSendingToPhysioVisitId(null);
    }
  };

  const handleSendToEyeClinic = async (patient: NursingPatient) => {
    if (!patient.visitNumericId) return;
    try {
      const order = await apiFetch<any>('/eyecare/orders/checkin-from-visit/', {
        method: 'POST',
        body: JSON.stringify({ visit: patient.visitNumericId }),
      });
      if (order?.id) {
        setEyeCheckins(prev => ({
          ...prev,
          [patient.visitNumericId]: { orderId: Number(order.id), status: String(order.status || 'scheduled') },
        }));
      }
      toast.success('Sent to Eye Clinic', {
        description: `${patient.name} is now in the Eye Clinic queue`,
      });
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send to Eye Clinic');
    }
  };

  const handleSaveVitals = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!selectedPatient) return;
    setIsSubmitting(true);
    
    try {
      // Find the visit ID from the selected patient
      const visitId = selectedPatient.id; // This is the visit ID
      
      // Get patient ID from the visit
      // Note: Visits in nursing pool queue have status 'in_progress', not 'completed'
      // Build date filter based on current dateFilter state
      let dateParam: string | undefined = undefined;
      if (dateFilter === 'today') {
        dateParam = new Date().toISOString().split('T')[0];
      }
      const visitsResult = await visitService.getVisits({ 
        status: 'in_progress',
        date: dateParam,
        page_size: 500 
      });
      const visit = visitsResult.results.find((v: Visit) => String(v.id) === visitId);
      
      if (!visit) {
        throw new Error('Visit not found');
      }
      
      // Prepare payload for API
      const payload = {
        visit: parseInt(visitId), // Link vitals to visit
        patient: visit.patient, // Patient ID
        temperature: vitalsForm.temperature ? parseFloat(vitalsForm.temperature) : null,
        blood_pressure_systolic: vitalsForm.bloodPressureSystolic ? parseInt(vitalsForm.bloodPressureSystolic) : null,
        blood_pressure_diastolic: vitalsForm.bloodPressureDiastolic ? parseInt(vitalsForm.bloodPressureDiastolic) : null,
        heart_rate: vitalsForm.pulse ? parseInt(vitalsForm.pulse) : null,
        respiratory_rate: vitalsForm.respiratoryRate ? parseInt(vitalsForm.respiratoryRate) : null,
        oxygen_saturation: vitalsForm.oxygenSaturation ? parseFloat(vitalsForm.oxygenSaturation) : null,
        weight: vitalsForm.weight ? parseFloat(vitalsForm.weight) : null,
        height: vitalsForm.height ? parseFloat(vitalsForm.height) : null,
        pain_scale: vitalsForm.painScale ? parseInt(vitalsForm.painScale, 10) : null,
        blood_sugar: vitalsForm.bloodSugar ? parseFloat(vitalsForm.bloodSugar) : null,
        notes: vitalsForm.notes || '',
        // Note: BMI will be auto-calculated by the backend
      };
      
      // Save vitals to API
      await apiFetch('/vitals/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      
      // Update visit status (optional - you might want to add a field to track vitals recorded)
      // For now, we'll just reload the data
      
      toast.success('Vitals recorded successfully', {
        description: `${selectedPatient.name} is now ready for consultation`
      });
      
      // Close dialog and reset form only after successful save
      setIsVitalsDialogOpen(false);
      setVitalsForm(emptyVitals);
      
      // Reload all data to reflect the saved vitals (preserves all filters)
      await loadData();
      
    } catch (err: any) {
      console.error('[Pool Queue] Error saving vitals:', err);
      
      // Extract error message from apiFetch error structure
      let errorMessage = 'Failed to save vitals. Please try again.';
      
      if (err?.message) {
        // apiFetch formats errors into err.message
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err?.response?.data) {
        // Handle DRF validation errors
        const errorData = err.response.data;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.non_field_errors) {
          errorMessage = Array.isArray(errorData.non_field_errors) 
            ? errorData.non_field_errors.join(', ') 
            : String(errorData.non_field_errors);
        } else {
          // Format field errors (e.g., height: ["Height must be between 30 and 300 cm..."]})
          const fieldErrors = Object.entries(errorData)
            .map(([field, errors]: [string, any]) => {
              const fieldName = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              const errorText = Array.isArray(errors) ? errors.join(', ') : String(errors);
              return `${fieldName}: ${errorText}`;
            })
            .join('; ');
          if (fieldErrors) {
            errorMessage = fieldErrors;
          }
        }
      }
      
      toast.error('Failed to save vitals', {
        description: errorMessage
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendToRoom = async (roomId: string) => {
    if (!selectedPatient) return;
    
    // Prevent double submission
    if (isSubmitting) {
      console.warn('Already submitting, ignoring duplicate request');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const room = rooms.find(r => r.id === roomId);
      if (!room) {
        toast.error('Room not found');
        setIsSubmitting(false);
        return;
      }
      
      // Get the visit ID and patient ID from selectedPatient
      const visitId = selectedPatient.visitNumericId || parseInt(selectedPatient.id);
      const patientId = selectedPatient.patientNumericId;
      
      if (!patientId) {
        toast.error('Patient ID not found');
        setIsSubmitting(false);
        return;
      }
      
      // Determine priority based on visit type using centralized utility
      // NOTE: Priority is automatically derived from visit_type - no manual selection needed.
      // The visit_type was selected when the visit was created, and we use it to determine
      // queue priority automatically. Lower number = higher priority (0 = Emergency, 1 = High, 2 = Medium, 3 = Low)
      const priority = getPriorityFromVisitType(selectedPatient.visitType);
      // Note: visits shown on this page are already `in_progress` (see loadData filter),
      // so we don't PATCH the visit status again here. Re-patching can fail if the patient
      // has legacy duplicate open visits in the system.
      
      // Add patient to consultation queue
      try {
        const queuePayload = {
          patient: patientId, // Required: Patient ID (numeric)
          visit: visitId, // Optional: Visit ID (numeric)
          room: parseInt(roomId), // Required: Room ID (numeric)
          priority: priority, // Required: Integer (0 = highest priority)
          is_active: true,
        };
        
        debugLog('Sending patient to queue for room:', room?.id || roomId);
        
        const queueResponse = await apiFetch('/consultation/queue/', {
          method: 'POST',
          body: JSON.stringify(queuePayload),
        });
        
        debugLog('Queue response:', queueResponse);
      } catch (queueErr: any) {
        console.error('Error adding to consultation queue:', queueErr);
        
        // Extract error message
        let errorMessage = 'Failed to add patient to queue. Please try again.';
        if (queueErr?.message) {
          errorMessage = queueErr.message;
        } else if (typeof queueErr === 'string') {
          errorMessage = queueErr;
        } else if (queueErr?.response?.data) {
          const errorData = queueErr.response.data;
          if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.non_field_errors) {
            // Handle array of non-field errors
            const errors = Array.isArray(errorData.non_field_errors) 
              ? errorData.non_field_errors 
              : [errorData.non_field_errors];
            errorMessage = errors[0];
          } else {
            // Format field errors
            const fieldErrors = Object.entries(errorData)
              .map(([field, errors]: [string, any]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
              .join('; ');
            errorMessage = fieldErrors || errorMessage;
          }
        }
        
        // If it's a duplicate error, reload data to sync state
        if (errorMessage.includes('already in the queue')) {
          await loadData();
        }
        
        toast.error(errorMessage);
        setIsSubmitting(false);
        return;
      }
      
      // Optimistically update UI immediately, then refresh in background.
      setPatients((prev) =>
        prev.map((p) =>
          p.visitNumericId === visitId
            ? {
                ...p,
                nursingStatus: 'Sent to Room',
                consultationRoom: room.name,
                sentAt: new Date().toISOString(),
              }
            : p
        )
      );
      void loadData();

      toast.success(`Patient sent to ${room.name}`, {
        description: `${selectedPatient.name} added to consultation queue`
      });
      
      setIsRoomPickerOpen(false);
      setSelectedPatient(null);
    } catch (err) {
      console.error('Error sending patient to room:', err);
      toast.error('Failed to send patient to room. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getVisitTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      'consultation': 'border-teal-500/50 text-teal-600 dark:text-teal-400',
      'follow_up': 'border-blue-500/50 text-blue-600 dark:text-blue-400',
      'emergency': 'border-rose-500/50 text-rose-600 dark:text-rose-400',
      'routine': 'border-violet-500/50 text-violet-600 dark:text-violet-400',
    };
    return styles[type] || 'border-muted-foreground/50 text-muted-foreground';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'Vitals Recorded': return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
      case 'Ready for Consultation': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'Sent to Room': return 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10';
      case 'Sent to Physiotherapy': return 'border-indigo-500/50 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10';
      default: return 'border-gray-500/50 text-gray-600 dark:text-gray-400 bg-gray-500/10';
    }
  };

  const getVisitTypeBorderColor = (type: string) => {
    const styles: Record<string, string> = {
      'consultation': 'border-l-teal-500',
      'follow_up': 'border-l-blue-500',
      'emergency': 'border-l-rose-500',
      'routine': 'border-l-violet-500',
    };
    return styles[type] || 'border-l-gray-500';
  };

  // Show loading state
  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Loading nursing pool queue...</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Show error state
  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error loading queue</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </CardContent>
          </Card>
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-8 w-8 text-rose-500" />
              Nursing Pool Queue
            </h1>
            <p className="text-muted-foreground mt-1">View all patients processed by nursing - record vitals and send to consultation rooms</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Today's Visits", value: stats.totalInPool, icon: Users, color: 'text-rose-500', bg: 'bg-rose-500/10' },
            { label: 'Pending Vitals', value: stats.pendingVitals, icon: Stethoscope, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Ready for Consultation', value: stats.readyForConsultation, icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Sent to Rooms', value: stats.sentToRooms, icon: ArrowRight, color: 'text-violet-500', bg: 'bg-violet-500/10' },
          ].map((stat, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
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

        {/* Filters */}
        {!loading && (
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
                    <SelectItem value="pending">Pending Vitals</SelectItem>
                    <SelectItem value="vitals-recorded">Vitals Recorded</SelectItem>
                    <SelectItem value="ready-for-consultation">Ready for Consultation</SelectItem>
                    <SelectItem value="sent-to-room">Sent to Room</SelectItem>
                    <SelectItem value="sent-to-physiotherapy">Sent to Physiotherapy</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={clinicFilter} onValueChange={setClinicFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Clinic" /></SelectTrigger>
                  <SelectContent>
                    {clinics.map(c => <SelectItem key={c} value={c === 'All Clinics' ? 'all' : c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom visit date range to narrow down the nursing pool queue."
          label="Visit Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {/* Results Count */}
        {!loading && (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{sortedPatients.length}</span> patients
              </p>
            </div>

        {/* Patient Queue */}
        <div className="space-y-3">
          {sortedPatients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">No nursing patients found</h3>
                <p className="text-sm text-muted-foreground text-center">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your search or filter criteria'
                    : 'No patients have been processed by nursing yet'}
                </p>
              </CardContent>
            </Card>
          ) : (
            paginatedPatients.map((patient) => (
              <Card key={patient.id} className={`border-l-4 ${getVisitTypeBorderColor(patient.visitType)} hover:shadow-md transition-shadow`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <PatientAvatar name={patient.name} photoUrl={undefined} size="sm" />
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{patient.name}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getVisitTypeBadge(patient.visitType)}`}>{getVisitTypeLabel(patient.visitType)}</Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(patient.nursingStatus)}`}>
                            {patient.nursingStatus === 'Sent to Room' && patient.consultationRoom
                              ? `Sent to ${patient.consultationRoom}`
                              : patient.nursingStatus === 'Sent to Physiotherapy'
                                ? 'Sent to Physiotherapy'
                                : patient.nursingStatus}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {patient.nursingStatus === 'Pending' && (
                            <Button size="sm" onClick={() => openRecordVitals(patient)} className="h-7 px-2 bg-rose-500 hover:bg-rose-600 text-white text-xs">
                              <Stethoscope className="h-3 w-3 mr-1" />Vitals
                            </Button>
                          )}
                          {(patient.nursingStatus === 'Vitals Recorded' || patient.nursingStatus === 'Ready for Consultation' || patient.nursingStatus === 'Sent to Physiotherapy' || patient.nursingStatus === 'Sent to Room') && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewVitals(patient)}>
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          )}
                          {(patient.nursingStatus === 'Vitals Recorded' || patient.nursingStatus === 'Ready for Consultation') && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openRecordVitals(patient)}>
                              <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                            </Button>
                          )}
                          {/* Action buttons for sending patient to rooms */}
                          {(() => {
                            const hasPhysio = patient.clinics?.some((c: string) => clinicMatches(c, 'Physiotherapy'));
                            const hasEye = patient.clinics?.some((c: string) => clinicMatches(c, 'Eye Clinic'));
                            const hasOtherClinics = patient.clinics?.some((c: string) => !clinicMatches(c, 'Physiotherapy') && !clinicMatches(c, 'Eye Clinic'));
                            const isOnlyPhysio = hasPhysio && !hasOtherClinics;
                            const isOnlyEye = hasEye && !hasOtherClinics;
                            
                            // If patient has multiple clinics, always show "Send" button for consultation rooms
                            // Backend will automatically create queue entries for all matching clinic rooms
                            if (patient.clinics && patient.clinics.length > 1) {
                              // Multi-clinic patient - show Send button, backend handles routing to all clinics
                              const sentToSpecialtyClinic = patient.sentToPhysio || patient.sentToEyeClinic;
                              return sentToSpecialtyClinic ? (
                                <div className="h-7 w-7 flex items-center justify-center rounded border border-indigo-500/50 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10">
                                  <CheckCircle2 className="h-4 w-4" />
                                </div>
                              ) : (
                                (patient.nursingStatus === 'Vitals Recorded' || patient.nursingStatus === 'Ready for Consultation') && (
                                  <Button 
                                    size="sm" 
                                    onClick={() => openRoomPicker(patient)} 
                                    className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
                                  >
                                    <ArrowRight className="h-3 w-3 mr-1" />Send
                                  </Button>
                                )
                              );
                            }
                            
                            // Single clinic patient - use original logic
                            if (isOnlyPhysio) {
                              // Only physiotherapy
                              return patient.sentToPhysio ? (
                                <div className="h-7 w-7 flex items-center justify-center rounded border border-indigo-500/50 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10">
                                  <CheckCircle2 className="h-4 w-4" />
                                </div>
                              ) : (
                                (patient.nursingStatus === 'Vitals Recorded' || patient.nursingStatus === 'Ready for Consultation') && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleSendToPhysio(patient)}
                                    className="h-7 px-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs"
                                    disabled={sendingToPhysioVisitId === patient.visitNumericId}
                                  >
                                    {sendingToPhysioVisitId === patient.visitNumericId ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <Activity className="h-3 w-3 mr-1" />
                                    )}
                                    Physio
                                  </Button>
                                )
                              );
                            }
                            
                            // Eye Clinic only patient
                            if (isOnlyEye) {
                              // Only eye clinic
                              return patient.sentToEyeClinic ? (
                                <div className="h-7 w-7 flex items-center justify-center rounded border border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10">
                                  <CheckCircle2 className="h-4 w-4" />
                                </div>
                              ) : (
                                (patient.nursingStatus === 'Vitals Recorded' || patient.nursingStatus === 'Ready for Consultation') && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleSendToEyeClinic(patient)}
                                    className="h-7 px-2 bg-blue-500 hover:bg-blue-600 text-white text-xs"
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    Eye
                                  </Button>
                                )
                              );
                            }

                            // General or other single-clinic patient (e.g. GOPD) - send to consultation rooms
                            if (patient.nursingStatus === 'Vitals Recorded' || patient.nursingStatus === 'Ready for Consultation') {
                              return (
                                <Button
                                  size="sm"
                                  onClick={() => openRoomPicker(patient)}
                                  className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
                                >
                                  <ArrowRight className="h-3 w-3 mr-1" />
                                  Send
                                </Button>
                              );
                            }

                            return null;
                          })()}
                          {patient.nursingStatus === 'Sent to Room' && (
                            <div className="h-7 w-7 flex items-center justify-center rounded border border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10">
                              <CheckCircle2 className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Row 2: Details */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        {patient.patientId && (
                          <>
                            <span>{patient.patientId}</span>
                            <span>•</span>
                          </>
                        )}
                        {patient.clinics && patient.clinics.length > 1 ? (
                          <div className="flex gap-1 flex-wrap">
                            {patient.clinics.map((clinic: string, idx: number) => {
                              const isCompleted = patient.completedClinics?.includes(clinic);
                              return (
                                <Badge 
                                  key={idx} 
                                  variant="outline" 
                                  className={`text-[10px] px-1 py-0 h-4 ${
                                    isCompleted 
                                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                                      : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                                  }`}
                                >
                                  {clinic}{isCompleted && ' ✓'}
                                </Badge>
                              );
                            })}
                          </div>
                        ) : (
                          <span>{patient.clinic || 'GOPD'}</span>
                        )}
                        <span>•</span>
                        <span>{patient.age}y</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{patient.waitTime}m</span>
                      </div>
                      {/* Row 3: Visit Notes (if available) */}
                      {patient.visitNotes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          <span className="font-medium">Notes:</span> {patient.visitNotes}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Pagination */}
        {sortedPatients.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={sortedPatients.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="patients"
              pageSizeOptions={[50, 75, 100]}
            />
          </Card>
        )}
          </>
        )}

        {/* Record/Edit Vitals Dialog */}
        <Dialog open={isVitalsDialogOpen} onOpenChange={(open) => {
          // Prevent closing while submitting
          if (!isSubmitting) {
            setIsVitalsDialogOpen(open);
            if (!open) {
              setVitalsForm(emptyVitals);
            }
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => {
            // Prevent closing while submitting
            if (isSubmitting) {
              e.preventDefault();
            }
          }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-rose-500" />
                {selectedPatient?.vitals ? 'Edit Vitals' : 'Record Vitals'}
              </DialogTitle>
              <DialogDescription>
                {selectedPatient?.name} - {selectedPatient?.patientId}
              </DialogDescription>
            </DialogHeader>
            {selectedPatient?.visitNotes && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 mb-4">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Visit Notes / Special Instructions:</p>
                <p className="text-sm text-blue-900 dark:text-blue-300">{selectedPatient.visitNotes}</p>
              </div>
            )}
            <form onSubmit={handleSaveVitals} className="py-4 space-y-6">
              {/* Required fields notice */}
              <p className="text-xs text-muted-foreground"><span className="text-rose-500">*</span> indicates required fields</p>
              
              {/* Basic Vitals */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Thermometer className="h-3 w-3" />Temperature (°C) <span className="text-rose-500">*</span>
                  </Label>
                  <Input type="number" step="0.1" placeholder="36.5" value={vitalsForm.temperature} onChange={(e) => setVitalsForm(prev => ({ ...prev, temperature: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Heart className="h-3 w-3" />Pulse (bpm) <span className="text-rose-500">*</span>
                  </Label>
                  <Input type="number" placeholder="72" value={vitalsForm.pulse} onChange={(e) => setVitalsForm(prev => ({ ...prev, pulse: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Wind className="h-3 w-3" />Respiratory Rate</Label>
                  <Input type="number" placeholder="16" value={vitalsForm.respiratoryRate} onChange={(e) => setVitalsForm(prev => ({ ...prev, respiratoryRate: e.target.value }))} />
                </div>
              </div>

              {/* Blood Pressure */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />Blood Pressure (mmHg)
                </Label>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="120" value={vitalsForm.bloodPressureSystolic} onChange={(e) => setVitalsForm(prev => ({ ...prev, bloodPressureSystolic: e.target.value }))} className="w-24" />
                  <span className="text-muted-foreground">/</span>
                  <Input type="number" placeholder="80" value={vitalsForm.bloodPressureDiastolic} onChange={(e) => setVitalsForm(prev => ({ ...prev, bloodPressureDiastolic: e.target.value }))} className="w-24" />
                </div>
              </div>

              {/* Additional Vitals */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Droplets className="h-3 w-3" />SpO2 (%)</Label>
                  <Input type="number" placeholder="98" value={vitalsForm.oxygenSaturation} onChange={(e) => setVitalsForm(prev => ({ ...prev, oxygenSaturation: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Scale className="h-3 w-3" />Weight (kg)
                  </Label>
                  <Input type="number" step="0.1" placeholder="70" value={vitalsForm.weight} onChange={(e) => setVitalsForm(prev => ({ ...prev, weight: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Height (cm)</Label>
                  <Input type="number" placeholder="170" value={vitalsForm.height} onChange={(e) => setVitalsForm(prev => ({ ...prev, height: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>BMI (auto)</Label>
                  <div className="h-10 px-3 py-2 rounded-md border bg-muted/50 text-sm flex items-center">
                    {vitalsForm.weight && vitalsForm.height ? (
                      <span className={`font-medium ${
                        parseFloat(vitalsForm.weight) / Math.pow(parseFloat(vitalsForm.height) / 100, 2) < 18.5 ? 'text-blue-600' :
                        parseFloat(vitalsForm.weight) / Math.pow(parseFloat(vitalsForm.height) / 100, 2) < 25 ? 'text-emerald-600' :
                        parseFloat(vitalsForm.weight) / Math.pow(parseFloat(vitalsForm.height) / 100, 2) < 30 ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {(parseFloat(vitalsForm.weight) / Math.pow(parseFloat(vitalsForm.height) / 100, 2)).toFixed(1)} kg/m²
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Enter weight & height</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pain Scale (0-10)</Label>
                  <Select value={vitalsForm.painScale} onValueChange={(v) => setVitalsForm(prev => ({ ...prev, painScale: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {[...Array(11)].map((_, i) => (
                        <SelectItem key={i} value={String(i)}>{i} - {i === 0 ? 'No pain' : i <= 3 ? 'Mild' : i <= 6 ? 'Moderate' : 'Severe'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Blood Sugar (mg/dL)</Label>
                  <Input type="number" placeholder="95" value={vitalsForm.bloodSugar} onChange={(e) => setVitalsForm(prev => ({ ...prev, bloodSugar: e.target.value }))} />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes / Observations</Label>
                <Textarea 
                  placeholder="Any additional observations..." 
                  value={vitalsForm.notes} 
                  onChange={(e) => setVitalsForm(prev => ({ ...prev, notes: e.target.value }))} 
                  rows={3}
                  onKeyDown={(e) => {
                    // Prevent Enter from submitting form (use Ctrl+Enter or button click)
                    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault();
                    }
                  }}
                />
              </div>
              <DialogFooter>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => {
                    if (!isSubmitting) {
                      setIsVitalsDialogOpen(false);
                      setVitalsForm(emptyVitals);
                    }
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting} 
                  className="bg-rose-500 hover:bg-rose-600 text-white"
                >
                  {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Vitals</>}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* View Vitals Dialog */}
        <Dialog open={isViewVitalsDialogOpen} onOpenChange={setIsViewVitalsDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-rose-500" />
                Vitals - {selectedPatient?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedPatient?.patientId} | Recorded: {selectedPatient?.vitals?.recordedAt ? new Date(selectedPatient.vitals.recordedAt).toLocaleString() : 'N/A'}
              </DialogDescription>
            </DialogHeader>
            {selectedPatient?.vitals && (
              <div className="py-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Temperature', value: selectedPatient.vitals.temperature, unit: '°C', icon: Thermometer },
                    { label: 'Pulse', value: selectedPatient.vitals.pulse, unit: 'bpm', icon: Heart },
                    { label: 'Blood Pressure', value: `${selectedPatient.vitals.bloodPressureSystolic}/${selectedPatient.vitals.bloodPressureDiastolic}`, unit: 'mmHg', icon: Activity },
                    { label: 'Respiratory Rate', value: selectedPatient.vitals.respiratoryRate, unit: '/min', icon: Wind },
                    { label: 'SpO2', value: selectedPatient.vitals.oxygenSaturation, unit: '%', icon: Droplets },
                    { label: 'Weight', value: selectedPatient.vitals.weight, unit: 'kg', icon: Scale },
                    { label: 'Height', value: selectedPatient.vitals.height, unit: 'cm' },
                    { label: 'Pain Scale', value: selectedPatient.vitals.painScale, unit: '/10' },
                    { label: 'Blood Sugar', value: selectedPatient.vitals.bloodSugar, unit: 'mg/dL' },
                  ].map((item, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        {item.icon && <item.icon className="h-3 w-3" />}
                        {item.label}
                      </p>
                      <p className="text-lg font-semibold">{item.value || '-'} <span className="text-sm font-normal text-muted-foreground">{item.unit}</span></p>
                    </div>
                  ))}
                </div>
                {selectedPatient.vitals.notes && (
                  <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Notes</p>
                    <p className="text-sm text-foreground mt-1">{selectedPatient.vitals.notes}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-4">
                  Recorded by: {selectedPatient.vitals.recordedBy || 'Unknown'}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewVitalsDialogOpen(false)}>Close</Button>
              <Button onClick={() => { setIsViewVitalsDialogOpen(false); openRecordVitals(selectedPatient!); }}>
                <Edit className="h-4 w-4 mr-2" />Edit Vitals
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Room Picker Dialog */}
        <Dialog open={isRoomPickerOpen} onOpenChange={setIsRoomPickerOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-emerald-500" />
                Select Consultation Room
              </DialogTitle>
              <DialogDescription>
                Send {selectedPatient?.name} to a consultation room
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3 max-h-[400px] overflow-y-auto">
              {rooms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ArrowRight className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No consultation rooms available</p>
                  <p className="text-sm mt-2">Please create rooms in the admin section</p>
                </div>
              ) : (
                rooms.map((room) => (
                  <div 
                    key={room.id} 
                    className={`p-4 rounded-lg border-2 transition-all ${
                      room.status === 'available' 
                        ? 'border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10 cursor-pointer' 
                        : 'border-muted bg-muted/30 opacity-60 cursor-not-allowed'
                    }`}
                    onClick={() => room.status === 'available' && !isSubmitting && handleSendToRoom(room.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">{room.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {room.doctor ? `${room.doctor} • ` : ''}{room.specialty || 'GOPD'}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={room.status === 'available' ? 'border-emerald-500 text-emerald-600' : 'border-rose-500 text-rose-600'}>
                          {room.status === 'available' ? 'Available' : 'Occupied'}
                        </Badge>
                        {room.queueCount > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">{room.queueCount} in queue</p>
                        )}
                      </div>
                    </div>
                    {room.currentPatient && (
                      <p className="text-xs text-muted-foreground mt-2">Current: {room.currentPatient}</p>
                    )}
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRoomPickerOpen(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
