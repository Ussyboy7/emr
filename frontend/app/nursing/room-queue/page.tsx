"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { toast } from "sonner";
import { apiFetch } from '@/lib/api-client';
import { roomService, consultationService } from '@/lib/services';
import { useNursingPageAuth } from '@/hooks/use-nursing-page-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { fetchAllPaginatedResults } from '@/lib/fetch-paginated-results';
import { getServerToday } from '@/lib/utils/serverTime';
import { formatLocalYmd } from '@/lib/laboratory/constants';
import {
  compareConsultationQueueEntries,
  getVisitTypeBadgeClass,
  getVisitTypeLabel,
  isEmergencyVisitType,
  normalizeVisitTypeKey,
} from '@/lib/utils/priority';
import { 
  DoorOpen, Search, Users, Clock, CheckCircle2, AlertTriangle,
  ArrowRight, Stethoscope, Activity, Loader2, Eye,
  ArrowLeftRight, User, Calendar, Heart, Thermometer, X
} from 'lucide-react';
import {
  canNursingSendToRoom,
  doctorDisplayName,
  doctorsOnSeat,
  presenceStatusBadgeClass,
  presenceStatusLabel,
  ROOM_QUEUE_POLL_MS,
  type RoomDoctorPresence,
  type RoomPresenceStatus,
  type RoomQueueDayStats,
} from '@/lib/consultation/room-presence';
import {
  buildPresenceOverridePayload,
  userCanOverrideRoomPresence,
} from '@/lib/consultation/queue-override-permissions';

// Types
interface QueuedPatient {
  id: string;
  name: string;
  patientId: string;
  personalNumber: string;
  waitTime: number;
  sentAt: string;
  sentBy: string;
  clinic: string;
  visitType: string;
  roomId: string;
  vitals?: {
    bp: string;
    pulse: string;
    temp: string;
  };
  age?: number;
  gender?: string;
}

interface ConsultationRoom {
  id: string;
  name: string;
  status: 'available' | 'occupied' | 'paused' | 'unavailable';
  doctor?: string;
  doctors?: RoomDoctorPresence[];
  specialty?: string;
  presenceStatus?: RoomPresenceStatus;
  acceptingPatients?: boolean;
  currentPatient?: QueuedPatient;
  activeSessions?: Array<{
    id: number;
    patient_name: string;
    doctor_name?: string | null;
  }>;
  consultationsToday: number;
  queueStats?: RoomQueueDayStats;
}

// Patient queue and room data will be loaded from API

export default function RoomQueuePage() {
  const [patients, setPatients] = useState<QueuedPatient[]>([]);
  const [rooms, setRooms] = useState<ConsultationRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { ready, handleAuthError, currentUser } = useNursingPageAuth();
  const canOverridePresence = useMemo(
    () => userCanOverrideRoomPresence(currentUser),
    [currentUser],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [roomFilter, setRoomFilter] = useState('all');
  const [visitTypeFilter, setVisitTypeFilter] = useState('all');
  const [isReassignDialogOpen, setIsReassignDialogOpen] = useState(false);
  const [isPatientDetailsOpen, setIsPatientDetailsOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<QueuedPatient | null>(null);
  const [selectedNewRoom, setSelectedNewRoom] = useState<string>('');
  const [reassignOverrideReason, setReassignOverrideReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMarkingLeft, setIsMarkingLeft] = useState(false);
  
  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const today = await getServerToday().catch(() => formatLocalYmd(new Date()));

      const [roomsResult, activeSessions, queueItems, todayCountByRoom, queueStatsByRoom] = await Promise.all([
        fetchAllPaginatedResults((page, page_size) =>
          roomService.getRooms({ page, page_size })
        ),
        fetchAllPaginatedResults((page, page_size) =>
          consultationService.getSessions({ status: 'active', page, page_size })
        ),
        fetchAllPaginatedResults((page, page_size) =>
          consultationService.getQueue({ is_active: true, date: today, page, page_size })
        ),
        consultationService.getRoomDaySessionCounts(today).catch(() => ({} as Record<string, number>)),
        consultationService.getRoomQueueStats(today).catch(() => ({} as Record<string, RoomQueueDayStats>)),
      ]);
        
        const transformedRooms: ConsultationRoom[] = roomsResult.map((room: any) => {
          const roomId = String(room.id);
          const roomActiveSessions = (room.active_sessions?.length
            ? room.active_sessions
            : activeSessions.filter((session: any) => String(session.room) === roomId)) as any[];
          const canSend = canNursingSendToRoom(room);
          const facilityActive = room.status?.toLowerCase() === 'active' && room.is_active !== false;
          const onSeatDoctors = doctorsOnSeat(room);
          const primaryDoctor = onSeatDoctors[0]?.doctor_name || room.current_doctor_name;
          
          return {
            id: roomId,
            name: room.name,
            status: canSend
              ? 'available' as const
              : roomActiveSessions.length > 0
                ? 'occupied' as const
                : facilityActive
                  ? 'paused' as const
                  : 'unavailable' as const,
            doctor: doctorDisplayName(room) || primaryDoctor || undefined,
            doctors: room.doctors,
            specialty: room.specialty || '',
            presenceStatus: (room.presence_status || 'away') as RoomPresenceStatus,
            acceptingPatients: room.accepting_patients === true,
            activeSessions: roomActiveSessions.map((session: any) => ({
              id: session.id,
              patient_name: session.patient_name || '',
              doctor_name: session.doctor_name || null,
            })),
            consultationsToday: todayCountByRoom[roomId] || 0,
            queueStats: queueStatsByRoom[roomId],
          };
        });
        setRooms(transformedRooms);
        
        // queueItems already loaded in parallel above
        
        // Create a map of rooms by ID for quick lookup
        const roomsMap = new Map(roomsResult.map((room: any) => [String(room.id), room]));
        
        // Transform queue items using embedded patient/visit/vitals from queue serializer
        const transformedPatients = queueItems.map((item: any) => {
          try {
            const queuedAt = new Date(item.queued_at);
            const waitTime = Math.floor((Date.now() - queuedAt.getTime()) / (1000 * 60));
            const details = item.patient_details;
            const latestVitals = item.latest_vitals;
            const visitType = item.visit_type || 'consultation';

            let vitals: QueuedPatient['vitals'] = undefined;
            if (latestVitals) {
              vitals = {
                bp:
                  latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic
                    ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}`
                    : 'N/A',
                pulse: latestVitals.heart_rate ? String(latestVitals.heart_rate) : 'N/A',
                temp: latestVitals.temperature ? `${latestVitals.temperature}°C` : 'N/A',
              };
            }

            const room = roomsMap.get(String(item.room));
            const clinic = room?.specialty || '';

            return {
              id: String(item.id),
              name: item.patient_name ?? details?.full_name ?? '',
              patientId: item.patient_id || details?.patient_id || '',
              personalNumber: details?.personal_number || '',
              waitTime: waitTime > 0 ? waitTime : 0,
              sentAt: item.queued_at,
              sentBy: 'Nursing',
              clinic,
              visitType,
              roomId: String(item.room),
              age: item.patient_age ?? details?.age,
              gender: item.patient_gender || details?.gender,
              vitals,
            } as QueuedPatient;
          } catch (err) {
            console.error(`Error transforming queue item ${item.id}:`, err);
            return null;
          }
        });
        
        const validPatients = transformedPatients.filter((p): p is QueuedPatient => p !== null);
      setPatients(validPatients);
    } catch (err) {
      console.error('Error loading room queue data:', err);
      if (handleAuthError(err)) return;
      if (!silent) {
        setError('Failed to load room queue data. Please try again.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadData();
  }, [ready, loadData]);

  useEffect(() => {
    if (!ready) return;
    if (isReassignDialogOpen || isPatientDetailsOpen) return;

    const intervalId = window.setInterval(() => {
      void loadData({ silent: true });
    }, ROOM_QUEUE_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [ready, loadData, isReassignDialogOpen, isPatientDetailsOpen]);

  // Filter patients
  const filteredPatients = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    return patients.filter(p => {
      const matchesSearch = !q ||
                           p.name.toLowerCase().includes(q) ||
                           p.patientId.toLowerCase().includes(q) ||
                           p.personalNumber.toLowerCase().includes(q);
      const matchesRoom = roomFilter === 'all' || p.roomId === roomFilter;
      const matchesVisitType =
        visitTypeFilter === 'all' || normalizeVisitTypeKey(p.visitType) === visitTypeFilter;
      return matchesSearch && matchesRoom && matchesVisitType;
    });
  }, [patients, debouncedSearchQuery, roomFilter, visitTypeFilter]);

  // Group patients by room
  const patientsByRoom = useMemo(() => {
    const grouped: Record<string, QueuedPatient[]> = {};
    rooms.forEach(room => {
      grouped[room.id] = filteredPatients.filter(p => p.roomId === room.id)
        .sort((a, b) =>
          compareConsultationQueueEntries({
            queued_at: a.sentAt,
            visit_type: a.visitType,
          }, {
            queued_at: b.sentAt,
            visit_type: b.visitType,
          })
        );
    });
    return grouped;
  }, [filteredPatients, rooms]);

  // Stats
  const stats = useMemo(() => {
    const aggregated = rooms.reduce(
      (acc, room) => {
        const qs = room.queueStats;
        if (!qs) return acc;
        acc.sentToday += qs.sent_today;
        acc.inConsult += qs.in_consult;
        acc.completedToday += qs.completed_today;
        return acc;
      },
      { sentToday: 0, inConsult: 0, completedToday: 0 },
    );
    return {
      totalInQueues: patients.length,
      emergencyCount: patients.filter(p => isEmergencyVisitType(p.visitType)).length,
      avgWaitTime: patients.length > 0 ? Math.round(patients.reduce((sum, p) => sum + p.waitTime, 0) / patients.length) : 0,
      roomsWithPatients: rooms.filter((room) => (room.queueStats?.waiting ?? 0) > 0 || (room.activeSessions?.length ?? 0) > 0).length,
      sentToday: aggregated.sentToday,
      inConsult: aggregated.inConsult,
      completedToday: aggregated.completedToday,
    };
  }, [patients, rooms]);


  const openReassignDialog = (patient: QueuedPatient) => {
    setSelectedPatient(patient);
    setSelectedNewRoom('');
    setReassignOverrideReason('');
    setIsReassignDialogOpen(true);
  };

  const openPatientDetails = (patient: QueuedPatient) => {
    setSelectedPatient(patient);
    setIsPatientDetailsOpen(true);
  };

  const handleReassign = async () => {
    if (!selectedPatient || !selectedNewRoom) return;
    const targetRoom = rooms.find((r) => r.id === selectedNewRoom);
    const needsOverride = targetRoom?.status !== 'available';
    if (needsOverride && !canOverridePresence) return;
    if (needsOverride && !reassignOverrideReason.trim()) {
      toast.error('Override reason is required for this room');
      return;
    }

    setIsSubmitting(true);

    try {
      const queueItemId = parseInt(selectedPatient.id);
      if (isNaN(queueItemId)) {
        toast.error('Invalid queue item ID');
        setIsSubmitting(false);
        return;
      }

      const newRoomId = parseInt(selectedNewRoom);
      if (isNaN(newRoomId)) {
        toast.error('Invalid room ID');
        setIsSubmitting(false);
        return;
      }

      const patchBody: Record<string, unknown> = { room: newRoomId };
      if (needsOverride) {
        Object.assign(patchBody, buildPresenceOverridePayload(reassignOverrideReason));
      }

      await apiFetch(`/consultation/queue/${queueItemId}/`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });

      const oldRoom = rooms.find(r => r.id === selectedPatient.roomId);
      const newRoom = rooms.find(r => r.id === selectedNewRoom);

      setPatients(prev => prev.map(p =>
        p.id === selectedPatient.id ? { ...p, roomId: selectedNewRoom } : p
      ));

      toast.success(`Patient reassigned`, {
        description: `${selectedPatient.name} moved from ${oldRoom?.name} to ${newRoom?.name}`
      });
      setIsReassignDialogOpen(false);

      // Data will refresh on next page load
    } catch (err: any) {
      console.error('Error reassigning patient:', err);

      // Extract error message
      let errorMessage = 'Failed to reassign patient. Please try again.';
      if (err?.message) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err?.response?.data) {
        const errorData = err.response.data;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.non_field_errors) {
          errorMessage = errorData.non_field_errors[0];
        } else {
          const fieldErrors = Object.entries(errorData)
            .map(([field, errors]: [string, any]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
            .join('; ');
          errorMessage = fieldErrors || errorMessage;
        }
      }

      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkPatientLeft = async (patient: QueuedPatient) => {
    setIsMarkingLeft(true);
    try {
      const queueItemId = parseInt(patient.id);
      if (isNaN(queueItemId)) {
        toast.error('Invalid queue item ID');
        return;
      }

      // Remove patient from queue by deleting the queue item
      await apiFetch(`/consultation/queue/${queueItemId}/`, {
        method: 'DELETE',
      });

      // Remove patient from local state
      setPatients(prev => prev.filter(p => p.id !== patient.id));

      toast.success('Patient marked as left', {
        description: `${patient.name} has been removed from the queue`
      });
    } catch (err: any) {
      console.error('Error marking patient as left:', err);
      toast.error(err?.message || 'Failed to mark patient as left');
    } finally {
      setIsMarkingLeft(false);
    }
  };



  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'occupied': return 'text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'paused': return 'text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'unavailable': return 'text-gray-600 dark:text-gray-400 bg-gray-500/10';
      default: return 'text-gray-600 bg-gray-500/10';
    }
  };

  const getStatusLabel = (room: ConsultationRoom) => {
    if (room.status === 'available') return 'Accepting';
    if (room.presenceStatus === 'not_accepting') return 'Not accepting';
    if (room.presenceStatus === 'away') return 'No doctor';
    return room.status;
  };

  const isPatientStuck = (patient: QueuedPatient) => {
    const room = rooms.find((r) => r.id === patient.roomId);
    return room ? !room.acceptingPatients : false;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-4" />
              <p className="text-muted-foreground">Loading consultation room queue...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error loading queue</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <DoorOpen className="h-8 w-8 text-emerald-500" />
              Consultation Room Queue
            </h1>
            <p className="text-muted-foreground mt-1">Monitor and reassign patients across consultation rooms</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            { label: 'Sent today', value: stats.sentToday, icon: ArrowRight, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
            { label: 'Waiting now', value: stats.totalInQueues, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'In consult', value: stats.inConsult, icon: Stethoscope, color: 'text-violet-500', bg: 'bg-violet-500/10' },
            { label: 'Completed today', value: stats.completedToday, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Emergency Cases', value: stats.emergencyCount, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
            { label: 'Avg Wait Time', value: `${stats.avgWaitTime} min`, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          ].map((stat, i) => (
            <Card key={i}>
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
                  placeholder="Search patients by name, ID, or personal number..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={roomFilter} onValueChange={setRoomFilter}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by Room" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Rooms</SelectItem>
                    {rooms.map(room => (
                      <SelectItem key={room.id} value={room.id}>{room.name.split(' - ')[0]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={visitTypeFilter} onValueChange={setVisitTypeFilter}>
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="Visit type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All visit types</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="routine">Routine checkup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Room Queues Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {rooms.map((room) => {
            const roomPatients = patientsByRoom[room.id] || [];
            return (
              <Card key={room.id} className={`${room.status === 'available' ? 'border-emerald-500/30' : room.status === 'occupied' ? 'border-amber-500/30' : 'border-gray-500/30'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <DoorOpen className="h-4 w-4" />
                        {room.name}
                      </CardTitle>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                        <Stethoscope className="h-3 w-3 shrink-0" />
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
                            <span>{room.doctor || 'No doctor in room'}</span>
                            <Badge variant="outline" className={`text-[10px] ${presenceStatusBadgeClass(room.presenceStatus)}`}>
                              {presenceStatusLabel(room.presenceStatus)}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={getStatusColor(room.status)}>
                      {getStatusLabel(room)}
                    </Badge>
                  </div>
                  {room.activeSessions && room.activeSessions.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {room.activeSessions.map((session) => (
                        <div key={session.id} className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">In consult</p>
                          <p className="text-sm font-medium">{session.patient_name}</p>
                          {session.doctor_name && (
                            <p className="text-xs text-muted-foreground">with {session.doctor_name}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {room.queueStats?.waiting ?? roomPatients.length} waiting
                    </span>
                    <span>Sent {room.queueStats?.sent_today ?? 0}</span>
                    <span>Seen {room.queueStats?.in_consult ?? room.activeSessions?.length ?? 0}</span>
                    <span>Done {room.queueStats?.completed_today ?? room.consultationsToday}</span>
                    {(room.queueStats?.left_without_consult ?? 0) > 0 && (
                      <span className="text-amber-600">Left {room.queueStats?.left_without_consult}</span>
                    )}
                  </div>

                  {roomPatients.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm italic">
                      No patients waiting
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {roomPatients.map((patient, index) => (
                        <div 
                          key={patient.id} 
                          className={`p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
                            isPatientStuck(patient)
                              ? 'border-amber-500/50 bg-amber-500/5'
                              : isEmergencyVisitType(patient.visitType)
                                ? 'border-rose-500/50 bg-rose-500/5'
                                : 'border-border'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">{patient.name}</span>
                                <Badge variant="outline" className={`text-xs ${getVisitTypeBadgeClass(patient.visitType)}`}>
                                  {getVisitTypeLabel(patient.visitType)}
                                </Badge>
                                {isPatientStuck(patient) && (
                                  <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                                    Doctor not accepting
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                <p>{patient.patientId} • {patient.clinic}</p>
                                <p className="flex items-center gap-2">
                                  <Clock className="h-3 w-3" /> {patient.waitTime} min wait
                                </p>
                              </div>
                            </div>
                             <div className="flex gap-1">
                               <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openPatientDetails(patient)} title="View details">
                                 <Eye className="h-3 w-3" />
                               </Button>
                               <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-500" onClick={() => openReassignDialog(patient)} title="Reassign to another room">
                                 <ArrowLeftRight className="h-3 w-3" />
                               </Button>
                               <Button
                                 size="sm"
                                 variant="destructive"
                                 className="h-6 w-6 p-0"
                                 onClick={() => handleMarkPatientLeft(patient)}
                                 disabled={isMarkingLeft}
                                 title="Mark Left"
                               >
                                 {isMarkingLeft ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                               </Button>
                             </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Reassign Dialog */}
        <Dialog open={isReassignDialogOpen} onOpenChange={setIsReassignDialogOpen}>
          <DialogContent className={MODAL_SIZES.sm2}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-blue-500" />
                Reassign Patient
              </DialogTitle>
              <DialogDescription>
                Move {selectedPatient?.name} to a different consultation room
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Current Room Info */}
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Current Room</p>
                <p className="font-medium">{rooms.find(r => r.id === selectedPatient?.roomId)?.name}</p>
              </div>

              {/* Select New Room */}
              <div className="space-y-2">
                <Label>Select New Room *</Label>
                <Select value={selectedNewRoom} onValueChange={setSelectedNewRoom}>
                  <SelectTrigger><SelectValue placeholder="Choose a room..." /></SelectTrigger>
                  <SelectContent>
                    {rooms.filter(r => r.id !== selectedPatient?.roomId).map(room => {
                      const canReassign = room.status === 'available';
                      const canOverrideRoom =
                        canOverridePresence && room.status !== 'unavailable' && !canReassign;
                      return (
                      <SelectItem
                        key={room.id}
                        value={room.id}
                        disabled={!canReassign && !canOverrideRoom}
                      >
                        <div className="flex items-center justify-between w-full gap-4">
                          <span>{room.name}</span>
                          <Badge variant="outline" className={`text-xs ${canReassign ? getStatusColor('available') : presenceStatusBadgeClass(room.presenceStatus)}`}>
                            {canReassign ? 'Accepting' : presenceStatusLabel(room.presenceStatus)}
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* New Room Info */}
              {selectedNewRoom && (() => {
                const targetRoom = rooms.find(r => r.id === selectedNewRoom);
                const canReassign = targetRoom?.status === 'available';
                const needsOverride = Boolean(targetRoom && !canReassign && canOverridePresence);
                return (
                <div className={`p-3 rounded-lg border ${canReassign ? 'bg-emerald-500/10 border-emerald-500/20' : needsOverride ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                  <p className={`text-sm ${canReassign ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>New Room</p>
                  <p className="font-medium">{targetRoom?.name}</p>
                  <p className="text-sm text-muted-foreground">{targetRoom?.doctor || 'No doctor'}</p>
                  {!canReassign && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                      {needsOverride
                        ? 'Supervisor override required — provide a reason below'
                        : 'This room is not accepting patients'}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {patientsByRoom[selectedNewRoom]?.length || 0} patients currently waiting
                  </p>
                  {needsOverride && (
                    <div className="mt-3 space-y-2">
                      <Label htmlFor="reassign-override-reason">Override reason *</Label>
                      <Textarea
                        id="reassign-override-reason"
                        value={reassignOverrideReason}
                        onChange={(e) => setReassignOverrideReason(e.target.value)}
                        placeholder="Why is this patient being sent to a room that is not accepting?"
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              );
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReassignDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleReassign}
                disabled={
                  isSubmitting ||
                  !selectedNewRoom ||
                  (() => {
                    const target = rooms.find((r) => r.id === selectedNewRoom);
                    if (!target) return true;
                    if (target.status === 'available') return false;
                    if (!canOverridePresence) return true;
                    return !reassignOverrideReason.trim();
                  })()
                }
                className="bg-blue-500 hover:bg-blue-600 text-white"
              >
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Reassigning...</> : <><ArrowLeftRight className="h-4 w-4 mr-2" />Reassign Patient</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Patient Details Dialog */}
        <Dialog open={isPatientDetailsOpen} onOpenChange={setIsPatientDetailsOpen}>
          <DialogContent className={MODAL_SIZES.sm2}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-emerald-500" />
                Patient Details
              </DialogTitle>
              <DialogDescription>
                {selectedPatient?.patientId} • {selectedPatient?.personalNumber}
              </DialogDescription>
            </DialogHeader>
            {selectedPatient && (
              <div className="py-4 space-y-4">
                {/* Patient Info */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{selectedPatient.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedPatient.age}y {selectedPatient.gender} • {selectedPatient.clinic}</p>
                  </div>
                  <Badge variant="outline" className={getVisitTypeBadgeClass(selectedPatient.visitType)}>
                    {getVisitTypeLabel(selectedPatient.visitType)}
                  </Badge>
                </div>

                {/* Visit Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />Visit Type</p>
                    <p className="font-medium">{selectedPatient.visitType}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Wait Time</p>
                    <p className="font-medium">{selectedPatient.waitTime} minutes</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><DoorOpen className="h-3 w-3" />Current Room</p>
                    <p className="font-medium text-sm">{rooms.find(r => r.id === selectedPatient.roomId)?.name.split(' - ')[0]}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />Sent By</p>
                    <p className="font-medium">{selectedPatient.sentBy}</p>
                  </div>
                </div>

                {/* Vitals */}
                {selectedPatient.vitals && (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-1"><Heart className="h-4 w-4 text-rose-500" />Vitals</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2 rounded bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground">BP</p>
                        <p className="font-semibold">{selectedPatient.vitals.bp}</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground">Pulse</p>
                        <p className="font-semibold">{selectedPatient.vitals.pulse} bpm</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground">Temp</p>
                        <p className="font-semibold">{selectedPatient.vitals.temp}°C</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPatientDetailsOpen(false)}>Close</Button>
              <Button onClick={() => { setIsPatientDetailsOpen(false); openReassignDialog(selectedPatient!); }} className="bg-blue-500 hover:bg-blue-600 text-white">
                <ArrowLeftRight className="h-4 w-4 mr-2" />Reassign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
