"use client";
import { formatDisplayTime, todayApiDateString } from "@/lib/dates";

import React, { useState, useEffect, useMemo } from "react";
import { safeAsync } from '@/lib/utils/error-handling';
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Stethoscope,
  Users,
  Clock,
  CheckCircle,
  Play,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  compareConsultationQueueEntries,
  getVisitTypeBadgeClass,
  getVisitTypeLabel,
} from "@/lib/utils/priority";
import {
  roomService,
  patientService,
  consultationService,
  type ConsultationSession,
  type ConsultationStats,
} from '@/lib/services';
import { apiFetch } from '@/lib/api-client';
import { fetchAllPaginatedResults } from '@/lib/fetch-paginated-results';
import { useConsultationPageAuth } from '@/hooks/use-consultation-page-auth';
import {
  doctorDisplayName,
  presenceStatusBadgeClass,
  presenceStatusLabel,
  type RoomDoctorPresence,
  type RoomPresenceStatus,
} from '@/lib/consultation/room-presence';

// Types
interface Patient {
  id: string;
  visitId: string;
  patientId: string;
  name: string;
  age: number;
  gender: string;
  mrn: string;
  allergies: string[];
  consultationRoom?: string;
  waitTime: number;
  vitalsCompleted: boolean;
  visitType?: string;
  visitDate: string;
  visitTime: string;
  // Enhanced bio data fields
  bloodGroup?: string;
  genotype?: string;
  division?: string;
  employeeType?: string;
  location?: string;
  occupation?: string;
  phone?: string;
}

type RoomCardStatus = "free" | "in_consult" | "paused" | "unavailable";

interface ConsultationRoom {
  id: string;
  name: string;
  /** UI state from open sessions + facility status */
  cardStatus: RoomCardStatus;
  facilityStatus: "active" | "inactive" | "maintenance";
  openSession?: {
    id: number;
    status: "active" | "paused";
    patientName: string;
    doctorName?: string | null;
    startedAt: string;
  };
  openSessions?: Array<{
    id: number;
    status: "active" | "paused";
    patientName: string;
    doctorName?: string | null;
    startedAt: string;
  }>;
  doctors?: RoomDoctorPresence[];
  doctor?: string;
  presenceStatus?: RoomPresenceStatus;
  acceptingPatients?: boolean;
  specialtyFocus?: string;
  totalConsultationsToday: number;
  averageConsultationTime: number;
  queue: { patient_id: string; position: number }[];
}

type RoomFilter = "all" | "free" | "in_use";

function sessionRoomIdKey(session: ConsultationSession): string | null {
  const r = session.room as unknown;
  if (typeof r === "number" && !Number.isNaN(r)) return String(r);
  if (r && typeof r === "object" && "id" in r) {
    const id = (r as { id: unknown }).id;
    if (typeof id === "number") return String(id);
    if (typeof id === "string") return id;
  }
  return null;
}

function buildOpenSessionsByRoom(
  activeSessions: ConsultationSession[],
  pausedSessions: ConsultationSession[],
): Map<string, ConsultationSession[]> {
  const byRoom = new Map<string, ConsultationSession[]>();
  const add = (session: ConsultationSession) => {
    const rid = sessionRoomIdKey(session);
    if (!rid) return;
    const list = byRoom.get(rid) ?? [];
    list.push(session);
    byRoom.set(rid, list);
  };
  for (const s of pausedSessions) add(s);
  for (const s of activeSessions) add(s);
  return byRoom;
}

function pickPrimaryOpenSession(sessions?: ConsultationSession[]): ConsultationSession | undefined {
  if (!sessions?.length) return undefined;
  return sessions.find((s) => s.status === 'active') ?? sessions[0];
}

function isRoomOperational(room: { status?: string; is_active?: boolean }): boolean {
  const facility = (room.status?.toLowerCase() || "active") as ConsultationRoom["facilityStatus"];
  return facility === "active" && room.is_active !== false;
}

function resolveCardStatus(
  operational: boolean,
  openSession?: ConsultationSession,
): RoomCardStatus {
  if (!operational) return "unavailable";
  if (openSession?.status === "active") return "in_consult";
  if (openSession?.status === "paused") return "paused";
  return "free";
}

function roomCardStatusLabel(status: RoomCardStatus): string {
  switch (status) {
    case "free":
      return "Free";
    case "in_consult":
      return "In consult";
    case "paused":
      return "Paused";
    case "unavailable":
      return "Unavailable";
  }
}

function canSelectRoom(status: RoomCardStatus): boolean {
  return status !== "unavailable";
}

function buildRoomCompletedTodayMap(
  sessions: ConsultationSession[],
): Record<string, { completed: number; avgMinutes: number }> {
  const acc: Record<string, { completed: number; totalMin: number }> = {};
  for (const s of sessions) {
    const rid = sessionRoomIdKey(s);
    if (!rid) continue;
    if (!acc[rid]) acc[rid] = { completed: 0, totalMin: 0 };
    if (s.status === "completed" && s.ended_at && s.started_at) {
      const ms = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
      const min = ms > 0 ? ms / 60000 : 0;
      acc[rid].completed += 1;
      acc[rid].totalMin += min;
    }
  }
  const out: Record<string, { completed: number; avgMinutes: number }> = {};
  for (const k of Object.keys(acc)) {
    const { completed, totalMin } = acc[k];
    out[k] = {
      completed,
      avgMinutes: completed > 0 ? Math.round((totalMin / completed) * 10) / 10 : 0,
    };
  }
  return out;
}

function globalCompletedAvgMinutes(sessions: ConsultationSession[]): number {
  const done = sessions.filter((s) => s.status === "completed" && s.ended_at && s.started_at);
  if (!done.length) return 0;
  const sum = done.reduce((acc, s) => {
    const ms = new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime();
    return acc + (ms > 0 ? ms / 60000 : 0);
  }, 0);
  return Math.round((sum / done.length) * 10) / 10;
}

function totalCompletedFromRoomMap(
  map: Record<string, { completed: number; avgMinutes: number }>,
): number {
  return Object.values(map).reduce((a, v) => a + v.completed, 0);
}

// Consultation rooms and patient data will be loaded from API

const getStatusColor = (status: RoomCardStatus): string => {
  switch (status) {
    case "free":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    case "in_consult":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    case "paused":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
    case "unavailable":
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300";
  }
};

const getStatusIcon = (status: RoomCardStatus): string => {
  switch (status) {
    case "free":
      return "✓";
    case "in_consult":
      return "●";
    case "paused":
      return "⏸";
    case "unavailable":
      return "—";
    default:
      return "";
  }
};

const StartConsultation = () => {
  const router = useRouter();
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [consultationRooms, setConsultationRooms] = useState<ConsultationRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(true);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ready, currentUser, handleAuthError } = useConsultationPageAuth();
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");
  const [overviewStats, setOverviewStats] = useState({
    openConsultations: 0,
    completedToday: 0,
    avgTodayMinutes: 0,
    queueCount: 0,
    unmatchedOpenSessions: 0,
  });
  const applyRoomFilter = (f: RoomFilter) => {
    setRoomFilter(f);
    setSelectedRoom((prev) => {
      if (!prev) return prev;
      const r = consultationRooms.find((x) => x.id === prev);
      if (!r) return "";
      if (f === "free" && r.cardStatus !== "free") return "";
      if (f === "in_use" && r.cardStatus !== "in_consult" && r.cardStatus !== "paused") return "";
      return prev;
    });
  };

  // Load rooms and queue from API
  useEffect(() => {
    if (!ready) return;

    const loadRooms = async () => {
      try {
        setLoadingRooms(true);
        setError(null);

        const todayStr = todayApiDateString();
        const doctorId = currentUser?.id ? Number(currentUser.id) : undefined;

        const [roomsList, queueItems, statsRes, activeSessions, pausedSessions, todaySessions] =
          await Promise.all([
            fetchAllPaginatedResults((page, pageSize) =>
              roomService.getRooms({ page, page_size: pageSize })
            ),
            fetchAllPaginatedResults((page, pageSize) =>
              apiFetch<{ results: any[]; count?: number }>(
                `/consultation/queue/?is_active=true&page=${page}&page_size=${pageSize}`
              )
            ),
            consultationService.getStats(doctorId).catch((): ConsultationStats | null => null),
            fetchAllPaginatedResults((page, pageSize) =>
              consultationService.getSessions({ status: "active", page, page_size: pageSize })
            ).catch(() => [] as ConsultationSession[]),
            fetchAllPaginatedResults((page, pageSize) =>
              consultationService.getSessions({ status: "paused", page, page_size: pageSize })
            ).catch(() => [] as ConsultationSession[]),
            fetchAllPaginatedResults((page, pageSize) =>
              consultationService.getSessions({ date: todayStr, page, page_size: pageSize })
            ).catch(() => [] as ConsultationSession[]),
          ]);

        const roomTodayMap = buildRoomCompletedTodayMap(todaySessions);
        const stats = statsRes;

        const openSessionsByRoom = buildOpenSessionsByRoom(activeSessions, pausedSessions);
        const openConsultations = activeSessions.length + pausedSessions.length;

        const completedFromSessions = totalCompletedFromRoomMap(roomTodayMap);
        const completedToday =
          stats?.completed_today ?? stats?.today?.completed ?? completedFromSessions;
        const avgTodayMinutes =
          stats?.today?.avg_duration ??
          (completedFromSessions > 0 ? globalCompletedAvgMinutes(todaySessions) : 0);
        const queueCount = stats?.queue_count ?? queueItems.length;

        // Group queue items by room
        const queueByRoom: Record<string, any[]> = {};
        queueItems.forEach((item: any) => {
          const roomId = String(item.room);
          if (!queueByRoom[roomId]) {
            queueByRoom[roomId] = [];
          }
          queueByRoom[roomId].push(item);
        });

        // Transform rooms with queue + open session data
        const transformedRooms: ConsultationRoom[] = roomsList.map((room: any) => {
          const roomId = String(room.id);
          const roomQueue = queueByRoom[roomId] || [];
          const sortedQueue = [...roomQueue].sort(compareConsultationQueueEntries);

          const todayForRoom = roomTodayMap[roomId];
          const facilityStatus = (room.status?.toLowerCase() || "active") as ConsultationRoom["facilityStatus"];
          const operational = isRoomOperational(room);
          const openSessionRows = openSessionsByRoom.get(roomId) ?? [];
          const openSessionRow = pickPrimaryOpenSession(openSessionRows);
          const cardStatus = resolveCardStatus(operational, openSessionRow);
          const mappedOpenSessions = openSessionRows.map((session) => ({
            id: session.id,
            status: session.status === 'paused' ? 'paused' as const : 'active' as const,
            patientName: session.patient_name || 'Patient',
            doctorName: session.doctor_name || null,
            startedAt: session.started_at,
          }));

          return {
            id: roomId,
            name: room.name,
            cardStatus,
            facilityStatus,
            openSession: openSessionRow
              ? mappedOpenSessions.find((s) => s.id === openSessionRow.id) ?? mappedOpenSessions[0]
              : undefined,
            openSessions: mappedOpenSessions,
            doctor: doctorDisplayName(room) || room.current_doctor_name || undefined,
            doctors: room.doctors,
            presenceStatus: (room.presence_status || 'away') as RoomPresenceStatus,
            acceptingPatients: room.accepting_patients === true,
            specialtyFocus: room.specialty || undefined,
            totalConsultationsToday: todayForRoom?.completed ?? 0,
            averageConsultationTime: todayForRoom?.avgMinutes ?? 0,
            queue: sortedQueue
              .filter((item: { patient: unknown }) => item.patient != null)
              .map((item: { patient: unknown }, index: number) => ({
                patient_id: String(item.patient),
                position: index + 1,
              })),
          };
        });

        const roomsWithMappedSession = transformedRooms.filter((r) => (r.openSessions?.length ?? 0) > 0).length;
        const unmatchedOpenSessions = Math.max(0, openConsultations - roomsWithMappedSession);

        setOverviewStats({
          openConsultations,
          completedToday,
          avgTodayMinutes,
          queueCount,
          unmatchedOpenSessions,
        });

        setConsultationRooms(transformedRooms);
      } catch (err) {
        console.error("Error loading consultation rooms:", err);
        if (handleAuthError(err)) return;
        setError("Failed to load consultation rooms. Please try again.");
      } finally {
        setLoadingRooms(false);
      }
    };

    void loadRooms();
  }, [ready, currentUser?.id, handleAuthError]);

  // Load patient for selected room
  useEffect(() => {
    if (!ready) return;

    const loadPatient = async () => {
      if (!selectedRoom) {
        setSelectedPatient(null);
        return;
      }
      
      const room = consultationRooms.find((r) => r.id === selectedRoom);
      if (!room || room.queue.length === 0) {
        setSelectedPatient(null);
        return;
      }
      
      try {
        
        
        // Get the first patient ID from queue (already stored as string)
        if (!room.queue || room.queue.length === 0) {
          console.warn('Room queue is empty');
          setSelectedPatient(null);
          return;
        }
        
        const firstPatientIdStr = room.queue[0].patient_id;
        // Security: Removed console.log to prevent patient ID exposure
        
        // Convert patient ID to number
        let numericPatientId = typeof firstPatientIdStr === 'number' 
          ? firstPatientIdStr 
          : parseInt(String(firstPatientIdStr));
        
        if (isNaN(numericPatientId) || numericPatientId <= 0) {
          console.error('Invalid patient ID from room queue:', {
            firstPatientIdStr,
            parsed: numericPatientId,
            roomQueue: room.queue
          });
          toast.error('Invalid patient ID in queue. Please refresh and try again.');
          setSelectedPatient(null);
          return;
        }
        
        // Security: Removed console.log to prevent patient ID exposure
        
        // Convert to number for API call
        const numericRoomId = parseInt(selectedRoom);
        if (isNaN(numericRoomId)) {
          console.error('Invalid room ID:', selectedRoom);
          toast.error('Invalid room selected. Please try again.');
          setSelectedPatient(null);
          return;
        }
        
        // Load queue item from API to get visit info and other details
        // Use numeric room ID for the filter
        let queueItem: any = null;
        try {
          const queueItems = await fetchAllPaginatedResults((page, pageSize) =>
            consultationService.getQueue({
              room: numericRoomId,
              is_active: true,
              page,
              page_size: pageSize,
            })
          );
          queueItem = queueItems.find((item: any) => {
            const itemPatientId = typeof item.patient === 'number' ? item.patient : parseInt(String(item.patient || ''));
            return itemPatientId === numericPatientId;
          });

          if (!queueItem) {
            toast.error('Queue patient not found. Please refresh the room queue.');
            setSelectedPatient(null);
            return;
          }
        } catch (queueErr) {
          console.error('Could not load queue item from API:', queueErr);
          if (handleAuthError(queueErr)) return;
          toast.error('Failed to load queue. Please refresh and try again.');
          setSelectedPatient(null);
          return;
        }
        
        // Use the patient ID we have (either from room queue or from queue item)
        const queuePatientId = numericPatientId;
        
        
        
        // Load patient data from API using the queue item's patient ID
        let patient;
        try {
          patient = await patientService.getPatient(queuePatientId);
        } catch (patientErr: any) {
          console.error('Error fetching patient:', patientErr);
          console.error('Patient fetch error details:', {
            status: patientErr?.status,
            message: patientErr?.message,
            patientId: queuePatientId
          });
          // Check if it's a 404 or "not found" error
          if (patientErr?.status === 404 || patientErr?.message?.includes('not found') || patientErr?.message?.includes('Not found')) {
            toast.error(`Patient ID ${queuePatientId} not found. The patient may have been removed from the system.`);
          } else {
            toast.error('Failed to load patient information. Please try again.');
          }
          setSelectedPatient(null);
          return;
        }
        
        if (!patient) {
          console.error('Patient not found:', queuePatientId);
          toast.error(`Patient ID ${queuePatientId} not found. The patient may have been removed from the system.`);
          setSelectedPatient(null);
          return;
        }
        
        // Security: Removed console.log to prevent patient ID exposure
        
        // Get visit details if available
        let visitDate = todayApiDateString();
        let visitTime = '';
        let visitId: string | number | null = null;
        let visitType = queueItem?.visit_type || 'consultation';
        let waitTime = 0;
        
        if (queueItem) {
          if (queueItem.visit) {
            visitId = typeof queueItem.visit === 'number' ? queueItem.visit : parseInt(String(queueItem.visit));
            try {
              const visit = await apiFetch(`/visits/${visitId}/`) as {
                date?: string;
                time?: string;
                visit_type?: string;
              };
              visitDate = visit.date || visitDate;
              visitTime = visit.time || visitTime;
              visitType = visit.visit_type || visitType;
            } catch (visitErr) {
              console.warn('Could not load visit details:', visitErr);
            }
          }
          
          if (queueItem.queued_at) {
            waitTime = Math.floor((Date.now() - new Date(queueItem.queued_at).getTime()) / (1000 * 60));
          }
        }
        
        // Check if vitals exist for this visit
        const vitalsCompleted = visitId
          ? await safeAsync(
              () => patientService.vitalsExistForVisit(Number(visitId)),
              false,
              { operation: 'checkVitalsStatus', visitId: visitId ? String(visitId) : undefined, component: 'ConsultationStart' }
            )
          : false;

        setSelectedPatient({
          id: String(patient.id),
          visitId: visitId ? String(visitId) : '',
          patientId: patient.patient_id || '',
          name: patient.full_name ?? '',
          age: patient.age || 0,
          gender: patient.gender || '',
          mrn: patient.patient_id || '',
          allergies: patient.allergies ? patient.allergies.split(/[,\n]/).map(a => a.trim()).filter(a => a) : [],
          consultationRoom: selectedRoom,
          waitTime,
          vitalsCompleted,
          visitType,
          visitDate,
          visitTime,
          // Enhanced bio data fields
          bloodGroup: patient.blood_group,
          genotype: patient.genotype,
          division: patient.division,
          employeeType: patient.employee_type,
          location: patient.location,
          occupation: patient.occupation,
          phone: patient.phone,
        });
      } catch (err: any) {
        console.error('Error loading patient:', err);
        console.error('Error details:', {
          message: err?.message,
          status: err?.status,
          stack: err?.stack,
          selectedRoom
        });
        
        if (handleAuthError(err)) return;

        const errorMessage = err?.message || String(err);
        if (errorMessage.includes('not found') || errorMessage.includes('Not found') || err?.status === 404) {
          toast.error(`Patient not found. The patient may have been removed from the system.`);
        } else if (errorMessage.includes('Patient ID not found')) {
          toast.error(`Patient ID not found. Queue item may be invalid.`);
        } else {
          toast.error(`Failed to load patient: ${errorMessage}`);
        }
        setSelectedPatient(null);
      }
    };
    
    void loadPatient();
  }, [ready, selectedRoom, consultationRooms, handleAuthError]);

  const handleStartConsultation = () => {
    if (!selectedRoom) {
      toast.error("Please select a consultation room");
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleDoubleClickRoom = async (roomId: string, cardStatus: RoomCardStatus) => {
    if (!canSelectRoom(cardStatus)) {
      toast.error("This room is unavailable (inactive or maintenance)");
      return;
    }

    // Select the room first
    setSelectedRoom(roomId);

    // Auto-start consultation after a brief delay to show selection
    setTimeout(() => {
      handleStartConsultationForRoom(roomId);
    }, 300);
  };

  const handleStartConsultationForRoom = async (roomId: string) => {
    try {
      setIsLoading(true);

      // Find the room data
      const room = consultationRooms.find((r) => r.id === roomId);
      if (!room) {
        toast.error("Room not found");
        setIsLoading(false);
        return;
      }

      await roomService.checkIn(parseInt(roomId, 10));
      toast.success("Entering consultation room...");
      router.push(`/consultation/room/${roomId}`);

    } catch (error) {
      console.error("Error starting consultation:", error);
      toast.error("Failed to start consultation");
      setIsLoading(false);
    }
  };

  const confirmStartConsultation = async () => {
    setShowConfirmDialog(false);
    if (!selectedRoom) return;
    try {
      setIsLoading(true);
      await roomService.checkIn(parseInt(selectedRoom, 10));
      toast.success("Entering consultation room...");
      router.push(`/consultation/room/${selectedRoom}`);
    } catch (error) {
      console.error("Error checking into room:", error);
      toast.error("Failed to enter consultation room");
      setIsLoading(false);
    }
  };

  const handleRoomSelect = (roomId: string, cardStatus: RoomCardStatus) => {
    if (canSelectRoom(cardStatus)) {
      setSelectedRoom(roomId);
    }
  };

  const selectedRoomData = consultationRooms.find((room) => room.id === selectedRoom);
  const acceptingRooms = consultationRooms.filter((r) => r.acceptingPatients);
  const operationalRooms = consultationRooms.filter((r) => r.cardStatus !== "unavailable");
  const freeRooms = consultationRooms.filter((r) => r.cardStatus === "free");
  const inUseRooms = consultationRooms.filter(
    (r) => r.cardStatus === "in_consult" || r.cardStatus === "paused",
  );

  const filteredRooms = useMemo(() => {
    if (roomFilter === "free") {
      return consultationRooms.filter((r) => r.cardStatus === "free");
    }
    if (roomFilter === "in_use") {
      return consultationRooms.filter((r) => r.cardStatus === "in_consult" || r.cardStatus === "paused");
    }
    return consultationRooms;
  }, [consultationRooms, roomFilter]);

  if (loadingRooms) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading consultation rooms...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Error loading rooms</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Start Consultation
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Select a consultation room to begin your session
          </p>
          <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md border border-blue-200 dark:border-blue-800 inline-block">
            💡 <strong>Quick Start:</strong> Double-click a free room to enter immediately, or any in-use room to continue or resume.
          </div>
          {overviewStats.unmatchedOpenSessions > 0 && (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-900 dark:text-amber-200 text-sm">
                  <strong>{overviewStats.unmatchedOpenSessions}</strong> active or paused session
                  {overviewStats.unmatchedOpenSessions !== 1 ? "s are" : " is"} not linked to a room on this list.
                  Open the consultation room or end stale sessions from Queue → Paused.
                </p>
              </div>
            </div>
          )}
          {operationalRooms.length > 0 && freeRooms.length === 0 && inUseRooms.length > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2" />
                <p className="text-yellow-800 dark:text-yellow-300 text-sm">
                  All operational rooms are in use or paused. Select a room to continue, or wait for one to become free.
                </p>
              </div>
            </div>
          )}
          {operationalRooms.length === 0 && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2" />
                <p className="text-yellow-800 dark:text-yellow-300 text-sm">
                  No operational rooms. Rooms may be inactive or under maintenance.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {/* Operational / free rooms */}
          <Card className="border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Operational rooms</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    {operationalRooms.length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {acceptingRooms.length} accepting patients
                    {inUseRooms.length > 0 && (
                      <span className="block text-[11px] opacity-90">
                        {inUseRooms.length} in use or paused
                      </span>
                    )}
                  </p>
                </div>
                <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active + paused sessions */}
          <Card className="border-l-4 border-l-red-500 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Active & paused</p>
                  <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400">
                    {overviewStats.openConsultations}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Open sessions across all rooms
                  </p>
                </div>
                <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                  <Stethoscope className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Patients Waiting */}
          <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Patients Waiting</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {overviewStats.queueCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    across all rooms
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Activity */}
          <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Today's Sessions</p>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {overviewStats.completedToday}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    completed today
                    {overviewStats.avgTodayMinutes > 0 && (
                      <span className="block">
                        Org avg: {overviewStats.avgTodayMinutes.toFixed(1)} min
                      </span>
                    )}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                  <UserCheck className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Room Filters */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter Rooms:
              </div>
              <div className="flex gap-2">
                <Badge
                  role="button"
                  tabIndex={0}
                  onClick={() => applyRoomFilter("all")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      applyRoomFilter("all");
                    }
                  }}
                  className={cn(
                    "cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/30 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400",
                    roomFilter === "all" &&
                      "ring-2 ring-emerald-600 dark:ring-emerald-400 ring-offset-2 ring-offset-background",
                  )}
                >
                  All ({consultationRooms.length})
                </Badge>
                <Badge
                  role="button"
                  tabIndex={0}
                  onClick={() => applyRoomFilter("free")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      applyRoomFilter("free");
                    }
                  }}
                  className={cn(
                    "cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
                    roomFilter === "free" &&
                      "ring-2 ring-green-600 dark:ring-green-400 ring-offset-2 ring-offset-background",
                  )}
                >
                  Free ({freeRooms.length})
                </Badge>
                <Badge
                  role="button"
                  tabIndex={0}
                  onClick={() => applyRoomFilter("in_use")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      applyRoomFilter("in_use");
                    }
                  }}
                  className={cn(
                    "cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
                    roomFilter === "in_use" &&
                      "ring-2 ring-red-600 dark:ring-red-400 ring-offset-2 ring-offset-background",
                  )}
                >
                  In use ({inUseRooms.length})
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{overviewStats.queueCount} patients waiting</span>
            </div>
          </div>
        </div>

        {/* Room Grid */}
        {filteredRooms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 p-12 text-center text-muted-foreground mb-6">
            No rooms match this filter.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mb-6">
            {filteredRooms.map((room) => (
            <Card
              key={room.id}
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-2 h-80 flex flex-col ${
                selectedRoom === room.id
                  ? "ring-2 ring-emerald-500 border-emerald-500 shadow-md"
                  : "border-border"
              } ${
                !canSelectRoom(room.cardStatus)
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:border-emerald-300"
              }`}
              onClick={() => handleRoomSelect(room.id, room.cardStatus)}
              onDoubleClick={() => handleDoubleClickRoom(room.id, room.cardStatus)}
            >
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <CardTitle className="text-lg font-semibold">{room.name}</CardTitle>
                  </div>
                  <Badge className={`${getStatusColor(room.cardStatus)} font-medium`}>
                    <span aria-hidden="true" className="mr-1">{getStatusIcon(room.cardStatus)}</span>
                    {roomCardStatusLabel(room.cardStatus)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col">
                <div className="flex-1 flex flex-col space-y-3">
                  {/* Doctors / presence */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {room.doctors?.length ? (
                      room.doctors.map((doc) => (
                        <Badge
                          key={doc.doctor_id}
                          variant="outline"
                          className={`text-[10px] ${presenceStatusBadgeClass(doc.presence_status)}`}
                        >
                          {doc.doctor_name} · {presenceStatusLabel(doc.presence_status)}
                        </Badge>
                      ))
                    ) : (
                      <>
                        <div className={`w-2 h-2 rounded-full ${
                          room.presenceStatus === "on_seat"
                            ? "bg-green-500"
                            : room.presenceStatus === "not_accepting"
                              ? "bg-amber-500"
                              : "bg-gray-400"
                        }`} />
                        <div className="text-sm font-medium">
                          {room.doctor ? (
                            <span className="text-green-700 dark:text-green-400">{room.doctor}</span>
                          ) : (
                            <span className="text-gray-600 dark:text-gray-400">No doctor in room</span>
                          )}
                          <Badge
                            variant="outline"
                            className={`ml-2 text-[10px] px-1.5 py-0 ${presenceStatusBadgeClass(room.presenceStatus)}`}
                          >
                            {presenceStatusLabel(room.presenceStatus)}
                          </Badge>
                        </div>
                      </>
                    )}
                    {room.specialtyFocus && (
                      <span className="text-xs text-muted-foreground">
                        ({room.specialtyFocus})
                      </span>
                    )}
                  </div>

                  {/* Open sessions */}
                  <div className="space-y-2">
                    {(room.openSessions?.length ? room.openSessions : room.openSession ? [room.openSession] : []).map((session) => (
                      <div
                        key={session.id}
                        className={`rounded-lg p-3 border ${
                          room.cardStatus === "unavailable"
                            ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                            : session.status === "paused"
                              ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                              : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                        }`}
                      >
                        <p className={`text-xs font-semibold mb-1 ${
                          session.status === "paused"
                            ? "text-amber-800 dark:text-amber-300"
                            : "text-blue-800 dark:text-blue-300"
                        }`}>
                          {session.status === "paused" ? "Session paused" : "In consultation"}
                        </p>
                        <div className="flex items-center gap-2 text-sm">
                          <Stethoscope className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{session.patientName}</span>
                        </div>
                        {session.doctorName && (
                          <p className="text-xs text-muted-foreground mt-1">with {session.doctorName}</p>
                        )}
                      </div>
                    ))}
                    {room.cardStatus === "unavailable" ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        Room {room.facilityStatus === "maintenance" ? "under maintenance" : "inactive"}
                      </p>
                    ) : (room.openSessions?.length ?? 0) === 0 && !room.openSession ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center rounded-lg p-3 border bg-gray-50 dark:bg-gray-800/50">
                        No active consultation
                      </p>
                    ) : null}
                  </div>

                  {/* Queue Count */}
                  <div className={`border rounded-lg p-3 min-h-[50px] flex items-center ${
                    room.queue.length > 0
                      ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                      : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  }`}>
                    <div className="flex items-center gap-2 text-sm w-full">
                      <Users className={`h-4 w-4 flex-shrink-0 ${
                        room.queue.length > 0 ? "text-amber-600" : "text-gray-500"
                      }`} />
                      <div className="flex-1">
                        {room.queue.length > 0 ? (
                          <div className="space-y-1">
                            <div className="font-medium text-amber-800 dark:text-amber-300">
                              {room.queue.length} patient{room.queue.length !== 1 ? "s" : ""} waiting
                            </div>
                            {room.queue.length > 0 && (
                              <div className="text-xs text-amber-700 dark:text-amber-400">
                                Next patient ready
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            No patients in queue
                          </span>
                        )}
                      </div>
                      {room.queue.length > 0 && (
                        <Badge className="bg-amber-100 text-amber-800 text-xs ml-2">
                          Waiting
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Room Stats */}
                  <div className="pt-2 border-t border-border mt-auto">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Today: {room.totalConsultationsToday} completed</span>
                      <span>
                        {room.averageConsultationTime > 0
                          ? `Avg: ${room.averageConsultationTime} min`
                          : "Avg: —"}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            ))}
          </div>
        )}

        {/* Enhanced Action Buttons */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 rounded-lg p-6 -mx-6 -mb-6 mt-6">
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button
              onClick={handleStartConsultation}
              disabled={
                !selectedRoom ||
                isLoading ||
                !selectedRoomData ||
                !canSelectRoom(selectedRoomData.cardStatus)
              }
              size="lg"
              className="min-w-48 font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg border-0 h-12"
            >
              {isLoading ? (
                <Loader2 className="mr-3 h-5 w-5 animate-spin" />
              ) : (
                <Play className="mr-3 h-5 w-5" />
              )}
              <span className="text-base">
                {isLoading
                  ? "Starting..."
                  : selectedRoomData?.openSession
                    ? selectedRoomData.openSession.status === "paused"
                      ? "Resume session"
                      : "Continue session"
                    : selectedPatient
                      ? "Start Consultation"
                      : "Enter Room"}
              </span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="font-medium border-2 hover:bg-gray-50 dark:hover:bg-gray-800 h-12"
              onClick={() => router.push("/consultation/history")}
            >
              <Clock className="mr-2 h-5 w-5" />
              View History
            </Button>
          </div>

          {/* Quick Status */}
          {!selectedRoom && operationalRooms.length > 0 && (
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                💡 Select a room above to get started
              </p>
            </div>
          )}

          {selectedRoom && !selectedPatient && selectedRoomData?.queue.length === 0 && (
            <div className="mt-4 text-center">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                ✅ Room ready - no patients currently waiting
              </p>
            </div>
          )}

          {selectedPatient && (
            <div className="mt-4 text-center">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                👤 Next patient ready: <span className="font-medium">{selectedPatient.name}</span>
              </p>
            </div>
          )}
        </div>

        {/* Selected Room Info */}
        {selectedRoom && (
          <div className="mt-4 text-center">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Selected:{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {selectedRoomData?.name}
              </span>
              {selectedRoomData?.openSession ? (
                <>
                  {" "}
                  |{" "}
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {selectedRoomData.openSession.status === "paused" ? "Paused: " : "In consult: "}
                    {selectedRoomData.openSession.patientName}
                  </span>
                </>
              ) : selectedPatient ? (
                <>
                  {" "}
                  | Next Patient:{" "}
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {selectedPatient.name}
                  </span>
                  <Badge variant="outline" className={`ml-2 ${getVisitTypeBadgeClass(selectedPatient.visitType)}`}>
                    {getVisitTypeLabel(selectedPatient.visitType)}
                  </Badge>
                </>
              ) : (
                <>
                  {" "}
                  |{" "}
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    No patients waiting
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Confirm Dialog */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {selectedPatient ? "Start Consultation" : "Enter Room"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  {selectedPatient ? (
                    <>
                      Are you sure you want to start a consultation in{" "}
                      <strong>{selectedRoomData?.name}</strong> with{" "}
                      <strong>{selectedPatient.name}</strong>?
                      <div className="mt-4 p-4 bg-muted rounded-lg space-y-3">
                        {/* Primary Demographics */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <strong className="text-sm text-muted-foreground">Age/Gender</strong>
                            <div className="font-medium">{selectedPatient.age} years, {selectedPatient.gender}</div>
                          </div>
                          <div>
                            <strong className="text-sm text-muted-foreground">Patient ID</strong>
                            <div className="font-mono text-sm">{selectedPatient.patientId}</div>
                          </div>
                        </div>

                        {/* Visit type and Wait Time */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <strong className="text-sm text-muted-foreground">Visit type</strong>
                            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getVisitTypeBadgeClass(selectedPatient.visitType)}`}>
                              {getVisitTypeLabel(selectedPatient.visitType)}
                            </div>
                          </div>
                          <div>
                            <strong className="text-sm text-muted-foreground">Wait Time</strong>
                            <div className="font-medium">{selectedPatient.waitTime} minutes</div>
                          </div>
                        </div>

                        {/* Clinical Information */}
                        {(selectedPatient.allergies.length > 0) && (
                          <div>
                            <strong className="text-sm text-muted-foreground">Allergies</strong>
                            <div className="text-red-600 dark:text-red-400 font-medium">
                              {selectedPatient.allergies.join(", ")}
                            </div>
                          </div>
                        )}

                        {/* Additional Patient Details - conditionally shown */}
                        <div className="pt-2 border-t border-border/50">
                          <div className="text-xs text-muted-foreground mb-2">Additional Information</div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {selectedPatient.bloodGroup && (
                              <div>
                                <span className="text-muted-foreground">Blood Group:</span>
                                <span className="ml-1 font-medium text-red-600">{selectedPatient.bloodGroup}</span>
                              </div>
                            )}
                            {selectedPatient.genotype && (
                              <div>
                                <span className="text-muted-foreground">Genotype:</span>
                                <span className="ml-1 font-medium text-green-600">{selectedPatient.genotype}</span>
                              </div>
                            )}
                            {selectedPatient.division && (
                              <div>
                                <span className="text-muted-foreground">Division:</span>
                                <span className="ml-1 font-medium">{selectedPatient.division}</span>
                              </div>
                            )}
                            {selectedPatient.employeeType && (
                              <div>
                                <span className="text-muted-foreground">Employee Type:</span>
                                <span className="ml-1 font-medium">{selectedPatient.employeeType}</span>
                              </div>
                            )}
                            {selectedPatient.location && (
                              <div>
                                <span className="text-muted-foreground">Location:</span>
                                <span className="ml-1 font-medium">{selectedPatient.location}</span>
                              </div>
                            )}
                            {selectedPatient.occupation && (
                              <div>
                                <span className="text-muted-foreground">Occupation:</span>
                                <span className="ml-1 font-medium">{selectedPatient.occupation}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      Are you sure you want to enter <strong>{selectedRoomData?.name}</strong>?
                      There are currently no patients waiting in this room.
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmStartConsultation}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {selectedPatient ? "Starting..." : "Entering..."}
                  </>
                ) : selectedPatient ? (
                  "Start Consultation"
                ) : (
                  "Enter Room"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default StartConsultation;
