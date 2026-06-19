"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  status: 'available' | 'occupied' | 'paused';
  doctor?: string;
  specialty?: string;
  currentPatient?: QueuedPatient;
  consultationsToday: number;
}

// Patient queue and room data will be loaded from API

export default function RoomQueuePage() {
  const [patients, setPatients] = useState<QueuedPatient[]>([]);
  const [rooms, setRooms] = useState<ConsultationRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { ready, handleAuthError } = useNursingPageAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [roomFilter, setRoomFilter] = useState('all');
  const [visitTypeFilter, setVisitTypeFilter] = useState('all');
  
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [roomsResult, activeSessions, today, queueItems, todayCountByRoom] = await Promise.all([
        fetchAllPaginatedResults((page, page_size) =>
          roomService.getRooms({ page, page_size })
        ),
        fetchAllPaginatedResults((page, page_size) =>
          consultationService.getSessions({ status: 'active', page, page_size })
        ),
        getServerToday().catch(() => formatLocalYmd(new Date())),
        fetchAllPaginatedResults((page, page_size) =>
          consultationService.getQueue({ is_active: true, page, page_size })
        ),
        getServerToday()
          .then((day) => consultationService.getRoomDaySessionCounts(day))
          .catch(() => ({} as Record<string, number>)),
      ]);
        
        // Group sessions by room
        const sessionsByRoom: Record<string, any[]> = {};
        activeSessions.forEach((session: any) => {
          const roomId = String(session.room);
          if (!sessionsByRoom[roomId]) {
            sessionsByRoom[roomId] = [];
          }
          sessionsByRoom[roomId].push(session);
        });
        
        // Count today's sessions per room (aggregate from backend)
        const todayCountByRoomResolved = todayCountByRoom;
        
        const transformedRooms: ConsultationRoom[] = roomsResult.map((room: any) => {
          const roomId = String(room.id);
          const activeSession = sessionsByRoom[roomId]?.[0];
          const isOccupied = !!activeSession;
          
          return {
            id: roomId,
            name: room.name,
            status: isOccupied ? 'occupied' as const : (room.status?.toLowerCase() === 'active' ? 'available' as const : 'paused' as const),
            doctor: activeSession?.doctor_name || room.assigned_doctor || undefined,
            specialty: room.specialty || '',
            currentPatient: activeSession ? {
              id: String(activeSession.patient),
              name: activeSession.patient_name || '',
              patientId: String(activeSession.patient),
              personalNumber: '',
              waitTime: 0,
              sentAt: activeSession.started_at,
              sentBy: 'System',
              clinic: room.specialty || '',
              visitType: 'Consultation',
              roomId: roomId,
            } : undefined,
            consultationsToday: todayCountByRoom[roomId] || 0,
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
      setError('Failed to load room queue data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadData();
  }, [ready, loadData]);
  
  // Dialog states
  const [isReassignDialogOpen, setIsReassignDialogOpen] = useState(false);
  const [isPatientDetailsOpen, setIsPatientDetailsOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<QueuedPatient | null>(null);
  const [selectedNewRoom, setSelectedNewRoom] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMarkingLeft, setIsMarkingLeft] = useState(false);

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
  const stats = useMemo(() => ({
    totalInQueues: patients.length,
    emergencyCount: patients.filter(p => isEmergencyVisitType(p.visitType)).length,
    avgWaitTime: patients.length > 0 ? Math.round(patients.reduce((sum, p) => sum + p.waitTime, 0) / patients.length) : 0,
    roomsWithPatients: new Set(patients.map(p => p.roomId)).size,
  }), [patients]);


  const openReassignDialog = (patient: QueuedPatient) => {
    setSelectedPatient(patient);
    setSelectedNewRoom('');
    setIsReassignDialogOpen(true);
  };

  const openPatientDetails = (patient: QueuedPatient) => {
    setSelectedPatient(patient);
    setIsPatientDetailsOpen(true);
  };

  const handleReassign = async () => {
    if (!selectedPatient || !selectedNewRoom) return;
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

      // Update queue item to assign to new room
      await apiFetch(`/consultation/queue/${queueItemId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ room: newRoomId }),
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
      case 'paused': return 'text-gray-600 dark:text-gray-400 bg-gray-500/10';
      default: return 'text-gray-600 bg-gray-500/10';
    }
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total in Queues', value: stats.totalInQueues, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Emergency Cases', value: stats.emergencyCount, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
            { label: 'Avg Wait Time', value: `${stats.avgWaitTime} min`, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Active Rooms', value: stats.roomsWithPatients, icon: DoorOpen, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
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
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Stethoscope className="h-3 w-3" />
                        {room.doctor || 'No doctor assigned'}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={getStatusColor(room.status)}>
                      {room.status}
                    </Badge>
                  </div>
                  {room.currentPatient && (
                    <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Currently Consulting</p>
                      <p className="text-sm font-medium">{room.currentPatient.name}</p>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {roomPatients.length} waiting
                    </span>
                    <span>{room.consultationsToday} today</span>
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
                            isEmergencyVisitType(patient.visitType) ? 'border-rose-500/50 bg-rose-500/5' : 'border-border'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">{patient.name}</span>
                                <Badge variant="outline" className={`text-xs ${getVisitTypeBadgeClass(patient.visitType)}`}>
                                  {getVisitTypeLabel(patient.visitType)}
                                </Badge>
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
                    {rooms.filter(r => r.id !== selectedPatient?.roomId).map(room => (
                      <SelectItem key={room.id} value={room.id}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span>{room.name}</span>
                          <Badge variant="outline" className={`text-xs ${getStatusColor(room.status)}`}>
                            {room.status}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* New Room Info */}
              {selectedNewRoom && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">New Room</p>
                  <p className="font-medium">{rooms.find(r => r.id === selectedNewRoom)?.name}</p>
                  <p className="text-sm text-muted-foreground">{rooms.find(r => r.id === selectedNewRoom)?.doctor}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {patientsByRoom[selectedNewRoom]?.length || 0} patients currently waiting
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReassignDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleReassign} disabled={isSubmitting || !selectedNewRoom} className="bg-blue-500 hover:bg-blue-600 text-white">
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
