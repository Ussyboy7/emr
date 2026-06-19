"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
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
import { useNursingPageAuth } from '@/hooks/use-nursing-page-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { fetchAllPaginatedResults } from '@/lib/fetch-paginated-results';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { apiFetch } from '@/lib/api-client';
import {
  getQueuePriorityFromVisitType,
  getVisitTypeBadgeClass,
  getVisitTypeLabel,
} from '@/lib/utils/priority';
import {
  Users, Search, Stethoscope, UserCheck, ArrowRight, Clock, AlertTriangle,
  Eye, Edit, CheckCircle2, Calendar, Activity, Thermometer,
  Heart, Wind, Droplets, Scale, Loader2, Save, X
} from 'lucide-react';
import {
  buildVisitClinicFilterOptions,
  ALL_CLINICS_FILTER_LABEL,
} from '@/lib/constants/clinics';
import {
  clinicMatches,
  getVisitServiceClinicsList,
  getVisitServiceClinicsDisplay,
  joinDisplayParts,
} from '@/lib/utils/clinic-utils';
import { useOutpatientClinicTypes } from '@/hooks/use-outpatient-clinic-types';
import { useServerToday } from '@/hooks/use-server-today';
import { localWeekToTodayBounds } from '@/lib/dates';
import { formatLocalYmd } from '@/lib/laboratory/constants';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { VitalsDetailModal } from "@/components/shared/VitalsDetailModal";
import { vitalFieldToString } from "@/lib/vitals-display";
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';

const formatWaitTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
};

/** Lower number = higher in the queue (action-required first, done at bottom). */
const NURSING_STAGE_PRIORITY: Record<string, number> = {
  'Pending': 1,
  'Vitals Recorded': 2,
  'Ready for Consultation': 3,
  'Sent to Room': 4,
  'Sent to Physiotherapy': 5,
  'Sent to Eye Clinic': 6,
  'Completed': 7,
};

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
  nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room' | 'Sent to Physiotherapy' | 'Sent to Eye Clinic' | 'Completed';
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
  randomBloodSugar: string;
  bmi: string;
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
  respiratoryRate: '', oxygenSaturation: '', weight: '', height: '', bmi: '',
  painScale: '', bloodSugar: '', randomBloodSugar: '', notes: ''
};

function parseOptionalInt(raw: string | undefined): number | null {
  const t = (raw ?? '').trim();
  if (t === '') return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

function parseOptionalFloat(raw: string | undefined): number | null {
  const t = (raw ?? '').trim();
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

export default function NursingPoolQueuePage() {
  const { names: opdClinicNames } = useOutpatientClinicTypes();
  const serverToday = useServerToday();
  const clinicFilterOptions = useMemo(
    () => buildVisitClinicFilterOptions(opdClinicNames),
    [opdClinicNames]
  );
  // Debug logging (off by default). Enable in browser console:
  //   localStorage.setItem('debug_nursing_pool', '1')
  // Disable:
  //   localStorage.removeItem('debug_nursing_pool')
  const debugLog = (...args: any[]) => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage?.getItem('debug_nursing_pool') === '1') {
        console.log(...args);
      }
    } catch {
      // ignore
    }
  };
  const [patients, setPatients] = useState<NursingPatient[]>([]);
  const [totalVisitCount, setTotalVisitCount] = useState(0);
  const [poolMetrics, setPoolMetrics] = useState({
    total: 0,
    pending_vitals: 0,
    ready_for_consultation: 0,
    in_consultation: 0,
    completed: 0,
  });
  /** Silent poll: reuse consultation queue maps (room labels) instead of refetching. */
  const queueRoomCacheRef = useRef<Map<number, string>>(new Map());
  const queueSentAtCacheRef = useRef<Map<number, string>>(new Map());
  /** Silent poll: skip physio/eye/vitals refetch when this page's visit id set is unchanged. */
  const visitEnrichmentKeyRef = useRef<string>('');
  const physioEnrichmentCacheRef = useRef<Record<number, { orderId: number; status: string }>>({});
  const eyeEnrichmentCacheRef = useRef<Record<number, { orderId: number; status: string }>>({});
  const vitalsEnrichmentCacheRef = useRef<Map<number, unknown>>(new Map());
  const [rooms, setRooms] = useState<ConsultationRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ready, handleAuthError } = useNursingPageAuth();
  const [sendingToPhysioVisitId, setSendingToPhysioVisitId] = useState<number | null>(null);
  const [markingLeftVisitId, setMarkingLeftVisitId] = useState<number | null>(null);
  const [markLeftPatient, setMarkLeftPatient] = useState<NursingPatient | null>(null);
  const [markLeftReason, setMarkLeftReason] = useState('Patient left before consultation');
  const [isMarkLeftDialogOpen, setIsMarkLeftDialogOpen] = useState(false);
  const [physioCheckins, setPhysioCheckins] = useState<Record<number, { orderId: number; status: string }>>({});
  const [eyeCheckins, setEyeCheckins] = useState<Record<number, { orderId: number; status: string }>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [typeFilter, setTypeFilter] = useState('all');
  const [clinicFilter, setClinicFilter] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const loadData = useCallback(async (opts?: { silent?: boolean }): Promise<NursingPatient[] | null> => {
      const silent = opts?.silent;
      try {
        if (!silent) {
          setLoading(true);
          setError(null);
        }

        // Anchor on server "today" so filters match the server calendar.
        const anchor = serverToday ? new Date(`${serverToday}T00:00:00`) : new Date();
        const anchorYmd = serverToday || formatLocalYmd(anchor);
        let dateParam: string | undefined = undefined;
        let startDate: string | undefined = undefined;
        let endDate: string | undefined = undefined;

        if (dateRange.from || dateRange.to) {
          startDate = dateRange.from || undefined;
          endDate = dateRange.to || undefined;
        } else if (dateFilter === 'today') {
          dateParam = anchorYmd;
        } else if (dateFilter === 'week') {
          const weekBounds = localWeekToTodayBounds(serverToday || undefined);
          startDate = weekBounds.start;
          endDate = weekBounds.end;
        } else if (dateFilter === 'month') {
          const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
          startDate = formatLocalYmd(monthStart);
          endDate = anchorYmd;
        }

        const metricsParams = {
          date: dateParam,
          start_date: startDate,
          end_date: endDate,
          search: debouncedSearchQuery.trim() || undefined,
          visit_type: typeFilter !== 'all' ? typeFilter : undefined,
          clinic: clinicFilter !== 'all' ? clinicFilter : undefined,
        };

        const nursingStatusApi =
          statusFilter === 'pending'
            ? ('pending' as const)
            : statusFilter === 'vitals-recorded'
              ? ('vitals_incomplete' as const)
              : statusFilter === 'ready-for-consultation'
                ? ('ready' as const)
                : statusFilter === 'sent-to-room'
                  ? ('sent_to_room' as const)
                  : statusFilter === 'sent-to-physiotherapy'
                    ? ('sent_to_physiotherapy' as const)
                    : statusFilter === 'completed'
                      ? ('completed' as const)
                      : undefined;

        const result = await visitService.getVisits({
          ...metricsParams,
          nursing_status: nursingStatusApi,
          page: currentPage,
          page_size: itemsPerPage,
        });

        // Fire metrics and enrichment in parallel — none depend on each other,
        // only on the visit IDs from the main query.
        const [metricsPromise, enrichmentPromise] = await Promise.all([
          (async () => {
            if (silent) return;
            try {
              const metrics = await visitService.getNursingPoolMetrics({
                ...metricsParams,
                search: undefined,
              });
              setPoolMetrics(metrics);
            } catch (me: unknown) {
              console.warn('Nursing pool metrics failed', me);
              if (handleAuthError(me)) return;
              toast.error('Failed to load pool statistics');
            }
          })(),

          (async () => {
            const nursingVisits = result.results.filter((visit) => visit.status !== 'cancelled');
            const combinedVisitIds = Array.from(new Set(nursingVisits.map((v) => v.id))).filter(Boolean);
            const visitIdsKey = combinedVisitIds.slice().sort((a, b) => a - b).join(',');

            let queueVisitToRoom: Map<number, string>;
            let queueVisitToSentAt: Map<number, string>;
            if (silent && queueRoomCacheRef.current.size > 0) {
              queueVisitToRoom = new Map(queueRoomCacheRef.current);
              queueVisitToSentAt = new Map(queueSentAtCacheRef.current);
            } else {
              queueVisitToRoom = new Map();
              queueVisitToSentAt = new Map();
            }

            let physioCheckedInByVisitId: Record<number, { orderId: number; status: string }> = {};
            let eyeCheckedInByVisitId: Record<number, { orderId: number; status: string }> = {};
            let vitalsMap = new Map<number, any>();

            const reuseEnrichment = silent && visitIdsKey === visitEnrichmentKeyRef.current && visitIdsKey !== '';
            if (reuseEnrichment) {
              physioCheckedInByVisitId = { ...physioEnrichmentCacheRef.current };
              eyeCheckedInByVisitId = { ...eyeEnrichmentCacheRef.current };
              vitalsMap = new Map(vitalsEnrichmentCacheRef.current as Map<number, any>);
            } else if (combinedVisitIds.length > 0) {
              const visitIdsParam = combinedVisitIds.join(',');

              await Promise.all([
                (async () => {
                  try {
                    const queueResult = await apiFetch<{ results: any[] }>(
                      `/consultation/queue/by-visits/?visit_ids=${visitIdsParam}`
                    );
                    (queueResult.results || []).forEach((item: any) => {
                      if (item.visit != null && item.room_name) {
                        const vid = typeof item.visit === 'number' ? item.visit : parseInt(String(item.visit), 10);
                        queueVisitToRoom.set(vid, item.room_name);
                        if (item.queued_at) queueVisitToSentAt.set(vid, item.queued_at);
                      }
                    });
                    queueRoomCacheRef.current = queueVisitToRoom;
                    queueSentAtCacheRef.current = queueVisitToSentAt;
                  } catch (err) {
                    console.error('Error fetching consultation queue:', err);
                  }
                })(),
                (async () => {
                  try {
                    const vitalsRes = await apiFetch<{ results: Record<string, any> }>(
                      `/vitals/latest-by-visits/?visit_ids=${visitIdsParam}`
                    );
                    Object.entries(vitalsRes.results || {}).forEach(([visitIdRaw, vital]) => {
                      const visitId = Number(visitIdRaw);
                      if (Number.isFinite(visitId)) vitalsMap.set(visitId, vital);
                    });
                  } catch (err) {
                    debugLog('Vitals enrichment failed:', err);
                  }
                })(),
                (async () => {
                  try {
                    const physioRes = await apiFetch<{ results: Record<string, { checked_in: boolean; order_id?: number; status?: string }> }>(
                      `/orders/checkins-for-visits/?visit_ids=${visitIdsParam}`
                    );
                    Object.entries(physioRes.results || {}).forEach(([visitIdRaw, payload]) => {
                      const visitId = Number(visitIdRaw);
                      if (!Number.isFinite(visitId) || !payload?.checked_in || typeof payload.order_id !== 'number') return;
                      physioCheckedInByVisitId[visitId] = { orderId: payload.order_id, status: payload.status || 'scheduled' };
                    });
                  } catch (err) {
                    debugLog('Physiotherapy check-in enrichment failed:', err);
                  }
                })(),
                (async () => {
                  try {
                    const eyeRes = await apiFetch<{ results: Record<string, { checked_in: boolean; order_id?: number; status?: string }> }>(
                      `/eyecare/orders/checkins-for-visits/?visit_ids=${visitIdsParam}`
                    );
                    Object.entries(eyeRes.results || {}).forEach(([visitIdRaw, payload]) => {
                      const visitId = Number(visitIdRaw);
                      if (!Number.isFinite(visitId) || !payload?.checked_in || typeof payload.order_id !== 'number') return;
                      eyeCheckedInByVisitId[visitId] = { orderId: payload.order_id, status: payload.status || 'scheduled' };
                    });
                  } catch (err) {
                    debugLog('Eyecare check-in enrichment failed:', err);
                  }
                })(),
              ]);

              visitEnrichmentKeyRef.current = visitIdsKey;
              physioEnrichmentCacheRef.current = physioCheckedInByVisitId;
              eyeEnrichmentCacheRef.current = eyeCheckedInByVisitId;
              vitalsEnrichmentCacheRef.current = vitalsMap;
            } else {
              visitEnrichmentKeyRef.current = '';
              physioEnrichmentCacheRef.current = {};
              eyeEnrichmentCacheRef.current = {};
              vitalsEnrichmentCacheRef.current = new Map();
            }

            // Return enrichment data for the outer scope
            return { nursingVisits, queueVisitToRoom, queueVisitToSentAt, physioCheckedInByVisitId, eyeCheckedInByVisitId, vitalsMap };
          })(),
        ]);

        const { nursingVisits, queueVisitToRoom, queueVisitToSentAt, physioCheckedInByVisitId, eyeCheckedInByVisitId, vitalsMap } = enrichmentPromise;

        debugLog('Starting transformation of', nursingVisits.length, 'visits to nursing patients');
        const transformedPatients: NursingPatient[] = nursingVisits.map((visit: Visit) => {
          const patientNumericId = (() => {
            if (typeof (visit as any).patient === 'number') return (visit as any).patient;
            if ((visit as any).patient && typeof (visit as any).patient === 'object') {
              const raw = (visit as any).patient.id;
              const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
              return Number.isFinite(n) ? n : 0;
            }
            const raw = (visit as any).patient_id;
            const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
            return Number.isFinite(n) ? n : 0;
          })();
          const visitNumericId = (() => {
            const raw = (visit as any).id;
            const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
            return Number.isFinite(n) ? n : 0;
          })();

          // Calculate wait time (minutes since visit was created)
          const visitDateTime = new Date(`${visit.date}T${visit.time}`);
          const waitTime = Math.floor((Date.now() - visitDateTime.getTime()) / (1000 * 60));
          
          // Get vitals for this visit
          const visitKey = typeof visit.id === 'number' ? visit.id : Number(visit.id);
          const vitalsData = Number.isFinite(visitKey) ? vitalsMap.get(visitKey) : undefined;

          // Determine nursing status based on visit data, vitals, and queue status
          let nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room' | 'Sent to Physiotherapy' | 'Sent to Eye Clinic' | 'Completed' = 'Pending';
          const roomName = Number.isFinite(visitKey) ? queueVisitToRoom.get(visitKey) : undefined;
          const sentToPhysio = Number.isFinite(visitKey) && Boolean(physioCheckedInByVisitId[visitKey]);
          const sentToEyeClinic = Number.isFinite(visitKey) && Boolean(eyeCheckedInByVisitId[visitKey]);
          const visitClinics = getVisitServiceClinicsList({ clinic: visit.clinic, clinics: visit.clinics });
          const hasPhysioClinic = visitClinics.some((c: string) =>
            clinicMatches(c, 'Physiotherapy', opdClinicNames)
          );
          const hasEyeClinic = visitClinics.some((c: string) =>
            clinicMatches(c, 'Eye Clinic', opdClinicNames)
          );

          if (visit.status === 'completed') {
            // Visit is fully closed out — sort to bottom of the queue.
            nursingStatus = 'Completed';
          } else if (roomName) {
            // Patient has been sent to a room
            nursingStatus = 'Sent to Room';
          } else if (sentToEyeClinic && hasEyeClinic) {
            nursingStatus = 'Sent to Eye Clinic';
          } else if (sentToPhysio && hasPhysioClinic) {
            nursingStatus = 'Sent to Physiotherapy';
          } else if (vitalsData) {
            // Temp + heart rate required for "ready"; do not treat 0 as missing (truthiness bug).
            const t = vitalsData.temperature;
            const hr = vitalsData.heart_rate ?? vitalsData.pulse;
            const hasTemp = t != null && String(t).trim() !== '';
            const hasHr = hr != null && String(hr).trim() !== '';
            const hasCompleteVitals = hasTemp && hasHr;
            nursingStatus = hasCompleteVitals ? 'Ready for Consultation' : 'Vitals Recorded';
          }
          
          // Transform vitals data to frontend format (preserve 0; snake_case + camelCase from API)
          const vitals: VitalsData | undefined = vitalsData ? {
            temperature: vitalFieldToString(vitalsData.temperature),
            pulse: vitalFieldToString(vitalsData.heart_rate ?? vitalsData.pulse),
            bloodPressureSystolic: vitalFieldToString(vitalsData.blood_pressure_systolic ?? vitalsData.bloodPressureSystolic),
            bloodPressureDiastolic: vitalFieldToString(vitalsData.blood_pressure_diastolic ?? vitalsData.bloodPressureDiastolic),
            respiratoryRate: vitalFieldToString(vitalsData.respiratory_rate ?? vitalsData.respiratoryRate),
            oxygenSaturation: vitalFieldToString(vitalsData.oxygen_saturation ?? vitalsData.oxygenSaturation),
            weight: vitalFieldToString(vitalsData.weight),
            height: vitalFieldToString(vitalsData.height),
            bmi: vitalFieldToString(vitalsData.bmi),
            painScale: vitalFieldToString(vitalsData.pain_scale ?? vitalsData.painScale),
            bloodSugar: vitalFieldToString(vitalsData.blood_sugar ?? vitalsData.bloodSugar),
            randomBloodSugar: vitalFieldToString(vitalsData.random_blood_sugar ?? vitalsData.randomBloodSugar),
            notes: typeof vitalsData.notes === 'string' ? vitalsData.notes : '',
            recordedAt: vitalsData.recorded_at || new Date().toISOString(),
            recordedBy: vitalsData.recorded_by_name || '',
          } : undefined;
          
          return {
            id: String(visit.id),
            name: visit.patient_name ?? '',
            patientId: (visit as any).patient_id || '', // direct from backend
            visitId: visit.visit_id || String(visit.id), // Visit ID string (VIS-...)
            personalNumber: '', // Not used for search, keep empty
            clinic: getVisitServiceClinicsDisplay({ clinic: visit.clinic, clinics: visit.clinics }),
            clinics: visitClinics,
            completedClinics: (visit.completed_clinics || []) as string[], // Completed clinics
            visitDate: visit.date,
            visitTime: visit.time,
            visitType: visit.visit_type || 'consultation', // Keep lowercase for filtering
            nursingStatus,
            consultationRoom: roomName, // Store room name if patient is in queue
            vitals,
            waitTime: waitTime > 0 ? waitTime : 0,
            patientNumericId, // Store normalized numeric patient ID from backend
            visitNumericId, // Store normalized numeric visit ID from backend
            visitNotes: visit.clinical_notes, // Clinical notes from the visit
            age: typeof visit.age === 'number' && !Number.isNaN(visit.age) ? visit.age : undefined,
            gender: visit.gender,
            sentAt: Number.isFinite(visitKey) ? queueVisitToSentAt.get(visitKey) : undefined,
            sentToPhysio,
            sentToEyeClinic,
          };
        });

        // Sort: action-required stages first, waiting stages next, Completed at the bottom.
        // Within the same stage, earliest visit time wins (longest-waiting surfaces first).
        const sortedByStage = [...transformedPatients].sort((a, b) => {
          const pa = NURSING_STAGE_PRIORITY[a.nursingStatus] ?? 99;
          const pb = NURSING_STAGE_PRIORITY[b.nursingStatus] ?? 99;
          if (pa !== pb) return pa - pb;
          const ta = new Date(`${a.visitDate}T${a.visitTime}`).getTime();
          const tb = new Date(`${b.visitDate}T${b.visitTime}`).getTime();
          const va = Number.isFinite(ta) ? ta : 0;
          const vb = Number.isFinite(tb) ? tb : 0;
          return va - vb;
        });

        setPatients(sortedByStage);
        setTotalVisitCount(result.count ?? transformedPatients.length);

        return sortedByStage;
      } catch (err) {
        console.error('Error loading nursing pool data:', err);
        if (handleAuthError(err)) return null;
        if (!silent) {
          setError('Failed to load nursing pool queue. Please try again.');
        }
        return null;
      } finally {
        if (!silent) {
          setLoading(false);
          setHasLoadedOnce(true);
        }
      }
  }, [
    dateFilter,
    statusFilter,
    dateRange.from,
    dateRange.to,
    debouncedSearchQuery,
    typeFilter,
    clinicFilter,
    currentPage,
    itemsPerPage,
    serverToday,
    handleAuthError,
  ]);

  // Load data when filters change
  useEffect(() => {
    if (!ready) return;
    loadData();
  }, [
    ready,
    loadData,
    dateFilter,
    statusFilter,
    dateRange.from,
    dateRange.to,
    debouncedSearchQuery,
    typeFilter,
    clinicFilter,
    currentPage,
    itemsPerPage,
    serverToday,
  ]);

  // Dialog states
  const [isVitalsDialogOpen, setIsVitalsDialogOpen] = useState(false);
  const [isViewVitalsDialogOpen, setIsViewVitalsDialogOpen] = useState(false);
  const [isRoomPickerOpen, setIsRoomPickerOpen] = useState(false);

  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const sync = () => setTabHidden(typeof document !== 'undefined' && document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (
      tabHidden ||
      isDateFilterDialogOpen ||
      isVitalsDialogOpen ||
      isViewVitalsDialogOpen ||
      isRoomPickerOpen
    ) {
      return;
    }
    const id = setInterval(() => {
      void loadData({ silent: true });
    }, 25000);
    return () => clearInterval(id);
  }, [
    loadData,
    tabHidden,
    isDateFilterDialogOpen,
    isVitalsDialogOpen,
    isViewVitalsDialogOpen,
    isRoomPickerOpen,
  ]);

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
    nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room' | 'Sent to Physiotherapy' | 'Sent to Eye Clinic' | 'Completed';
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
  
  // Load rooms only when the room picker opens (not on every queue refresh).
  useEffect(() => {
    if (!isRoomPickerOpen) {
      setRoomsLoading(false);
      return;
    }
    if (rooms.length > 0) return;
    let cancelled = false;
    const loadRooms = async () => {
      setRoomsLoading(true);
      try {
        const allRooms = await fetchAllPaginatedResults((page, page_size) =>
          roomService.getRooms({ page, page_size })
        );
        if (cancelled) return;
        const transformedRooms: ConsultationRoom[] = allRooms.map((room: any) => ({
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
        if (cancelled) return;
        if (handleAuthError(err)) return;
        toast.error('Failed to load consultation rooms');
      } finally {
        if (!cancelled) setRoomsLoading(false);
      }
    };
    void loadRooms();
    return () => {
      cancelled = true;
    };
  }, [isRoomPickerOpen, rooms.length, handleAuthError]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, statusFilter, dateFilter, typeFilter, clinicFilter, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  const stats = useMemo(
    () => ({
      totalInPool: poolMetrics.total,
      pendingVitals: poolMetrics.pending_vitals,
      readyForConsultation: poolMetrics.ready_for_consultation,
      inConsultation: poolMetrics.in_consultation,
    }),
    [poolMetrics]
  );


  const openRecordVitals = (patient: NursingPatient) => {
    setSelectedPatient(patient);
    setVitalsForm({ ...emptyVitals, ...(patient.vitals || {}) });
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
      const order = await apiFetch<any>('/orders/checkin-from-visit/', {
        method: 'POST',
        body: JSON.stringify({ visit: patient.visitNumericId }),
      });
      if (order?.id) {
        setPhysioCheckins(prev => ({
          ...prev,
          [patient.visitNumericId]: { orderId: Number(order.id), status: String(order.status || 'scheduled') },
        }));
      }
      toast.success('Checked in to Physiotherapy', {
        description: `${patient.name} checked in to the Physiotherapy queue`,
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

  const openMarkLeftDialog = (patient: NursingPatient) => {
    setMarkLeftPatient(patient);
    setMarkLeftReason('Patient left before consultation');
    setIsMarkLeftDialogOpen(true);
  };

  const confirmMarkPatientLeft = async () => {
    if (!markLeftPatient?.visitNumericId) return;
    setMarkingLeftVisitId(markLeftPatient.visitNumericId);
    try {
      await visitService.closeWorkflow(markLeftPatient.visitNumericId, {
        reason: markLeftReason.trim(),
        source_stage: 'nursing_queue',
      });
      toast.success('Patient marked as left and removed from active workflow');
      await loadData();
      setIsMarkLeftDialogOpen(false);
      setMarkLeftPatient(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark patient as left');
    } finally {
      setMarkingLeftVisitId(null);
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
      // Validate required vitals fields
      const requiredFields = [
        { field: 'temperature', label: 'Temperature', value: vitalsForm.temperature },
        { field: 'pulse', label: 'Pulse/Heart Rate', value: vitalsForm.pulse },
      ];

      const missingFields = requiredFields.filter(f => !f.value || f.value.trim() === '');

      if (missingFields.length > 0) {
        const fieldNames = missingFields.map(f => f.label).join(', ');
        toast.error('Required vitals missing', {
          description: `Please enter: ${fieldNames}`
        });
        return;
      }

      // Validate blood pressure values make sense (only if both are provided)
      if (vitalsForm.bloodPressureSystolic && vitalsForm.bloodPressureDiastolic) {
        const systolic = parseInt(vitalsForm.bloodPressureSystolic);
        const diastolic = parseInt(vitalsForm.bloodPressureDiastolic);
        if (systolic <= diastolic) {
          toast.error('Invalid blood pressure', {
            description: 'Systolic pressure must be higher than diastolic pressure'
          });
          return;
        }
      }

      // Use IDs already present in the selected row (avoid an extra visit lookup
      // that can fail and block vitals save even when the row is valid).
      const visitId = selectedPatient.visitNumericId || parseInt(selectedPatient.id, 10);
      const patientId = selectedPatient.patientNumericId;
      if (!Number.isFinite(visitId) || !patientId) {
        throw new Error('Visit or patient ID not found for vitals save');
      }
      
      // Prepare payload for API (trimmed strings; 0 is valid for pain / glucose)
      const payload = {
        visit: visitId, // Link vitals to visit
        patient: patientId, // Patient ID
        temperature: parseOptionalFloat(vitalsForm.temperature),
        blood_pressure_systolic: parseOptionalInt(vitalsForm.bloodPressureSystolic),
        blood_pressure_diastolic: parseOptionalInt(vitalsForm.bloodPressureDiastolic),
        heart_rate: parseOptionalInt(vitalsForm.pulse),
        respiratory_rate: parseOptionalInt(vitalsForm.respiratoryRate),
        oxygen_saturation: parseOptionalFloat(vitalsForm.oxygenSaturation),
        weight: parseOptionalFloat(vitalsForm.weight),
        height: parseOptionalFloat(vitalsForm.height),
        pain_scale: vitalsForm.painScale === '' ? null : parseOptionalInt(vitalsForm.painScale),
        blood_sugar: parseOptionalFloat(vitalsForm.bloodSugar),
        random_blood_sugar: parseOptionalFloat(vitalsForm.randomBloodSugar),
        notes: vitalsForm.notes || '',
        // Note: BMI will be auto-calculated by the backend when weight & height are set
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
      
      const refreshed = await loadData();
      if (refreshed?.length) {
        setSelectedPatient((prev) => {
          if (!prev) return prev;
          return refreshed.find((p) => p.id === prev.id) ?? prev;
        });
      }

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
      
      // Queue tier: emergency may jump ahead; all other visit types are FIFO by send time.
      const priority = getQueuePriorityFromVisitType(selectedPatient.visitType);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'Vitals Recorded': return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
      case 'Ready for Consultation': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'Sent to Room': return 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10';
      case 'Sent to Physiotherapy': return 'border-indigo-500/50 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10';
      case 'Sent to Eye Clinic': return 'border-sky-500/50 text-sky-600 dark:text-sky-400 bg-sky-500/10';
      case 'Completed': return 'border-slate-500/50 text-slate-600 dark:text-slate-400 bg-slate-500/10';
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

  // Show full-page loading only on first load. Subsequent refreshes keep UI visible.
  if (loading && !hasLoadedOnce) {
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
            { label: 'In Consultation', value: stats.inConsultation, icon: Activity, color: 'text-violet-500', bg: 'bg-violet-500/10' },
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
                    <SelectItem value="sent-to-physiotherapy">Checked in to Physiotherapy</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
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
                    {clinicFilterOptions.map((c) => (
                      <SelectItem key={c} value={c === ALL_CLINICS_FILTER_LABEL ? 'all' : c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
              </div>
            </div>
          </CardContent>
        </Card>

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
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-muted-foreground">
                Showing{' '}
                <span className="font-medium text-foreground">
                  {totalVisitCount}
                </span>{' '}
                patients
              </p>
            </div>

        {/* Patient Queue */}
        <div className="space-y-3">
          {patients.length === 0 ? (
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
            patients.map((patient) => {
              const hasPhysio = patient.clinics?.some((c: string) =>
                clinicMatches(c, 'Physiotherapy', opdClinicNames)
              ) ?? false;
              const hasEye = patient.clinics?.some((c: string) =>
                clinicMatches(c, 'Eye Clinic', opdClinicNames)
              ) ?? false;
              const hasOtherClinics = patient.clinics?.some(
                (c: string) =>
                  !clinicMatches(c, 'Physiotherapy', opdClinicNames) &&
                  !clinicMatches(c, 'Eye Clinic', opdClinicNames)
              ) ?? false;
              const isOnlyPhysio = hasPhysio && !hasOtherClinics;
              const isOnlyEye = hasEye && !hasOtherClinics;
              const isMultiClinic = (patient.clinics?.length ?? 0) > 1;
              const showMarkLeft =
                patient.nursingStatus !== 'Completed' &&
                (isMultiClinic ||
                  (patient.nursingStatus !== 'Sent to Physiotherapy' &&
                    patient.nursingStatus !== 'Sent to Eye Clinic'));

              return (
              <Card key={patient.id} className={`border-l-4 ${getVisitTypeBorderColor(patient.visitType)} hover:shadow-md transition-shadow`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <PatientAvatar name={patient.name} photoUrl={undefined} size="sm" />
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{patient.name}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getVisitTypeBadgeClass(patient.visitType)}`}>{getVisitTypeLabel(patient.visitType)}</Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(patient.nursingStatus)}`}>
                              {patient.nursingStatus === 'Sent to Room' && patient.consultationRoom
                                ? `Sent to ${patient.consultationRoom}`
                                : patient.nursingStatus === 'Sent to Physiotherapy'
                                  ? 'Checked in to Physiotherapy'
                                  : patient.nursingStatus === 'Sent to Eye Clinic'
                                    ? 'Sent to Eye Clinic'
                                    : patient.nursingStatus}
                            </Badge>
                          </div>
                          {isMultiClinic && (
                            <div className="flex flex-wrap gap-1 items-center">
                              {hasEye && (
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 h-4 ${
                                    patient.sentToEyeClinic
                                      ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                                      : 'border-amber-500/40 text-amber-800 dark:text-amber-400 bg-amber-500/10'
                                  }`}
                                >
                                  Eye clinic {patient.sentToEyeClinic ? '✓' : 'pending'}
                                </Badge>
                              )}
                              {hasOtherClinics && (
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 h-4 ${
                                    patient.consultationRoom
                                      ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                                      : 'border-amber-500/40 text-amber-800 dark:text-amber-400 bg-amber-500/10'
                                  }`}
                                  title={patient.consultationRoom || undefined}
                                >
                                  Consultation {patient.consultationRoom ? `✓ ${patient.consultationRoom}` : 'pending'}
                                </Badge>
                              )}
                              {hasPhysio && (
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 h-4 ${
                                    patient.sentToPhysio
                                      ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                                      : 'border-amber-500/40 text-amber-800 dark:text-amber-400 bg-amber-500/10'
                                  }`}
                                >
                                  Physio {patient.sentToPhysio ? '✓' : 'pending'}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {patient.nursingStatus === 'Pending' && (
                            <Button size="sm" onClick={() => openRecordVitals(patient)} className="h-7 px-2 bg-rose-500 hover:bg-rose-600 text-white text-xs">
                              <Stethoscope className="h-3 w-3 mr-1" />Vitals
                            </Button>
                          )}
                          {(patient.nursingStatus === 'Vitals Recorded' ||
                            patient.nursingStatus === 'Ready for Consultation' ||
                            patient.nursingStatus === 'Sent to Physiotherapy' ||
                            patient.nursingStatus === 'Sent to Room' ||
                            patient.nursingStatus === 'Sent to Eye Clinic' ||
                            patient.nursingStatus === 'Completed') && (
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
                            // Completed visits are read-only on the pool queue — no Send/Physio/Eye buttons.
                            if (patient.nursingStatus === 'Completed') return null;
                            const canRoute = patient.nursingStatus === 'Vitals Recorded' || patient.nursingStatus === 'Ready for Consultation';

                            // Multi-clinic: each routing leg is independent once vitals are no longer Pending.
                            if (isMultiClinic) {
                              const vitalsNotPending = patient.nursingStatus !== 'Pending';
                              if (!vitalsNotPending) return null;
                              return (
                                <div className="flex items-center gap-1 flex-wrap justify-end">
                                  {hasPhysio && (
                                    patient.sentToPhysio ? (
                                      <div className="h-7 w-7 flex items-center justify-center rounded border border-indigo-500/50 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10">
                                        <CheckCircle2 className="h-4 w-4" />
                                      </div>
                                    ) : (
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
                                  )}

                                  {hasEye && (
                                    patient.sentToEyeClinic ? (
                                      <div className="h-7 w-7 flex items-center justify-center rounded border border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10">
                                        <CheckCircle2 className="h-4 w-4" />
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => handleSendToEyeClinic(patient)}
                                        className="h-7 px-2 bg-blue-500 hover:bg-blue-600 text-white text-xs"
                                      >
                                        <Eye className="h-3 w-3 mr-1" />
                                        Eye
                                      </Button>
                                    )
                                  )}

                                  {hasOtherClinics && (
                                    patient.consultationRoom ? (
                                      <div
                                        className="h-7 px-2 flex items-center justify-center rounded border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-xs font-medium max-w-[140px] truncate"
                                        title={patient.consultationRoom}
                                      >
                                        <CheckCircle2 className="h-3 w-3 mr-1 shrink-0" />
                                        Room
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => openRoomPicker(patient)}
                                        className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
                                      >
                                        <ArrowRight className="h-3 w-3 mr-1" />
                                        Send
                                      </Button>
                                    )
                                  )}
                                </div>
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
                            if (canRoute) {
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
                          {showMarkLeft && patient.nursingStatus !== 'Completed' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-6 w-6 p-0"
                              onClick={() => openMarkLeftDialog(patient)}
                              disabled={markingLeftVisitId === patient.visitNumericId}
                              title="Mark Left"
                            >
                              {markingLeftVisitId === patient.visitNumericId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </Button>
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
                          <span>{patient.clinic}</span>
                        )}
                        {patient.age != null && Number.isFinite(patient.age) ? (
                          <>
                            <span>•</span>
                            <span>{`${patient.age}y`}</span>
                          </>
                        ) : null}
                        {patient.gender?.trim() ? (
                          <>
                            <span>•</span>
                            <span>{patient.gender.trim()}</span>
                          </>
                        ) : null}
                        <span>•</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatWaitTime(patient.waitTime)}</span>
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
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalVisitCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalVisitCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="patients"
              pageSizeOptions={[25, 50, 100]}
            />
          </Card>
        )}
          </>

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
          <DialogContent className={MODAL_SIZES.ml} onInteractOutside={(e) => {
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Pain scale (0–10)</Label>
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
                  <Label>Fasting Blood Sugar (FBS) (mg/dL)</Label>
                  <Input type="number" placeholder="95" value={vitalsForm.bloodSugar} onChange={(e) => setVitalsForm(prev => ({ ...prev, bloodSugar: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Random Blood Sugar (RBS) (mg/dL)</Label>
                  <Input type="number" placeholder="140" value={vitalsForm.randomBloodSugar} onChange={(e) => setVitalsForm(prev => ({ ...prev, randomBloodSugar: e.target.value }))} />
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

        <VitalsDetailModal
          isOpen={isViewVitalsDialogOpen}
          onClose={() => setIsViewVitalsDialogOpen(false)}
          vitals={
            selectedPatient?.vitals
              ? { id: selectedPatient.id, ...selectedPatient.vitals }
              : null
          }
          patientName={selectedPatient?.name}
          patientId={selectedPatient?.patientId}
          // Closed visits (Completed) get a read-only view — the vitals
          // are part of a closed medical record; amendments need a
          // separate audited workflow. Backend also blocks mutations.
          // (Cancelled visits are already filtered out by the pool list.)
          readonly={selectedPatient?.nursingStatus === 'Completed'}
          onEdit={
            selectedPatient && selectedPatient.nursingStatus !== 'Completed'
              ? () => {
                  setIsViewVitalsDialogOpen(false);
                  openRecordVitals(selectedPatient);
                }
              : undefined
          }
        />

        {/* Room Picker Dialog */}
        <Dialog open={isRoomPickerOpen} onOpenChange={setIsRoomPickerOpen}>
          <DialogContent className={MODAL_SIZES.md}>
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
              {roomsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="h-10 w-10 animate-spin" />
                  <p className="text-sm">Loading rooms…</p>
                </div>
              ) : rooms.length === 0 ? (
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
                        {(() => {
                          const sub = joinDisplayParts([room.doctor, room.specialty]);
                          return sub ? (
                            <p className="text-sm text-muted-foreground">{sub}</p>
                          ) : null;
                        })()}
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

        <Dialog open={isMarkLeftDialogOpen} onOpenChange={setIsMarkLeftDialogOpen}>
          <DialogContent className={MODAL_SIZES.sm2}>
            <DialogHeader>
              <DialogTitle>Mark Patient as Left</DialogTitle>
              <DialogDescription>
                This will cancel the active visit workflow for <strong>{markLeftPatient?.name}</strong> and remove them from active queues/sessions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="mark-left-reason">Reason</Label>
              <Textarea
                id="mark-left-reason"
                value={markLeftReason}
                onChange={(e) => setMarkLeftReason(e.target.value)}
                placeholder="Enter reason for cancellation"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  if (markingLeftVisitId == null) {
                    setIsMarkLeftDialogOpen(false);
                    setMarkLeftPatient(null);
                  }
                }}
                disabled={markingLeftVisitId != null}
              >
                Keep in Queue
              </Button>
              <Button
                variant="destructive"
                onClick={confirmMarkPatientLeft}
                disabled={markingLeftVisitId != null || !markLeftPatient}
              >
                {markingLeftVisitId != null ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
                Confirm Mark Left
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
