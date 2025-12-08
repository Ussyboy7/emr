"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiFetch } from '@/lib/api-client';
import { roomService, patientService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { 
  DoorOpen, Search, RefreshCw, Users, Clock, CheckCircle2, AlertTriangle,
  ArrowRight, Stethoscope, Activity, Loader2, Eye, MoveUp, MoveDown,
  ArrowLeftRight, User, Calendar, Heart, Thermometer, X
} from 'lucide-react';

// Types
interface QueuedPatient {
  id: string;
  name: string;
  patientId: string;
  personalNumber: string;
  priority: 'Emergency' | 'High' | 'Medium' | 'Low';
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
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Load rooms and queue from API
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load rooms
        const roomsResult = await roomService.getRooms({ page_size: 1000 });
        
        // Load active consultation sessions to determine room status and current patients
        let activeSessions: any[] = [];
        try {
          const sessionsResult = await apiFetch<{ results: any[] }>('/consultation/sessions/?status=active&page_size=1000');
          activeSessions = sessionsResult.results || [];
        } catch (sessionErr) {
          console.warn('Could not load active sessions:', sessionErr);
        }
        
        // Count consultations today per room
        let todaySessions: any[] = [];
        try {
          const today = new Date().toISOString().split('T')[0];
          const todaySessionsResult = await apiFetch<{ results: any[] }>(`/consultation/sessions/?started_at__date=${today}&page_size=1000`);
          todaySessions = todaySessionsResult.results || [];
        } catch (todayErr) {
          console.warn('Could not load today sessions:', todayErr);
        }
        
        // Group sessions by room
        const sessionsByRoom: Record<string, any[]> = {};
        activeSessions.forEach((session: any) => {
          const roomId = String(session.room);
          if (!sessionsByRoom[roomId]) {
            sessionsByRoom[roomId] = [];
          }
          sessionsByRoom[roomId].push(session);
        });
        
        // Count today's sessions per room
        const todayCountByRoom: Record<string, number> = {};
        todaySessions.forEach((session: any) => {
          const roomId = String(session.room);
          todayCountByRoom[roomId] = (todayCountByRoom[roomId] || 0) + 1;
        });
        
        const transformedRooms: ConsultationRoom[] = roomsResult.results.map((room: any) => {
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
              priority: 'Medium' as const,
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
        
        // Load queue items
        const queueResult = await apiFetch<{ results: any[] }>('/consultation/queue/?is_active=true&page_size=1000');
        const queueItems = queueResult.results || [];
        
        // Create a map of rooms by ID for quick lookup
        const roomsMap = new Map(roomsResult.results.map((room: any) => [String(room.id), room]));
        
        // Transform queue items to patients
        const transformedPatients = await Promise.all(queueItems.map(async (item: any) => {
          try {
            // Extract patient ID from queue item
            const patientId = typeof item.patient === 'number' ? item.patient : parseInt(String(item.patient || ''));
            
            if (isNaN(patientId) || patientId <= 0) {
              console.warn(`Invalid patient ID in queue item ${item.id}:`, item.patient);
              return null;
            }
            
            // Fetch patient details
            let patient;
            try {
              patient = await patientService.getPatient(patientId);
            } catch (patientErr) {
              console.error(`Error fetching patient ${patientId} for queue item ${item.id}:`, patientErr);
              // Continue with basic info from queue item
              patient = null;
            }
            
            const queuedAt = new Date(item.queued_at);
            const waitTime = Math.floor((Date.now() - queuedAt.getTime()) / (1000 * 60));
            
            // Map backend priority (integer) to frontend priority
            // Backend uses: 0 = highest, 1 = high, 2 = medium, 3 = low
            const getPriority = (priorityNum: number): QueuedPatient['priority'] => {
              if (priorityNum === 0) return 'Emergency';
              if (priorityNum === 1) return 'High';
              if (priorityNum === 2) return 'Medium';
              return 'Low';
            };
            
            // Get visit type and vitals if available
            let visitType = 'Consultation';
            let vitals: QueuedPatient['vitals'] = undefined;
            if (item.visit) {
              try {
                const visitId = typeof item.visit === 'number' ? item.visit : parseInt(String(item.visit));
                const visit = await apiFetch(`/visits/${visitId}/`) as {
                  visit_type?: string;
                };
                visitType = visit.visit_type || 'Consultation';
                
                // Fetch vitals for this visit
                try {
                  const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${visitId}&page_size=1`);
                  const latestVitals = vitalsResult.results?.[0];
                  if (latestVitals) {
                    vitals = {
                      bp: latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic
                        ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}` 
                        : 'N/A',
                      pulse: latestVitals.heart_rate ? String(latestVitals.heart_rate) : 'N/A',
                      temp: latestVitals.temperature ? `${latestVitals.temperature}°C` : 'N/A',
                    };
                  }
                } catch (vitalsErr) {
                  console.warn(`Could not load vitals for visit ${visitId}:`, vitalsErr);
                }
              } catch (visitErr) {
                console.warn(`Could not load visit ${item.visit} for queue item ${item.id}:`, visitErr);
              }
            }
            
            // Get room specialty for clinic
            const room = roomsMap.get(String(item.room));
            const clinic = room?.specialty || '';
            
            return {
              id: String(item.id),
              name: patient 
                ? (patient.full_name || `${patient.first_name} ${patient.surname}`)
                : (item.patient_name || `Patient ${item.patient}`),
              patientId: patient?.patient_id || String(patientId),
              personalNumber: patient?.personal_number || '',
              priority: getPriority(typeof item.priority === 'number' ? item.priority : parseInt(item.priority) || 2),
              waitTime: waitTime > 0 ? waitTime : 0,
              sentAt: item.queued_at,
              sentBy: 'Nursing',
              clinic,
              visitType,
              roomId: String(item.room),
              age: patient?.age,
              gender: patient?.gender,
              vitals,
            } as QueuedPatient;
          } catch (err) {
            console.error(`Error transforming queue item ${item.id}:`, err);
            return null;
          }
        }));
        
        const validPatients = transformedPatients.filter((p): p is QueuedPatient => p !== null);
        setPatients(validPatients);
      } catch (err) {
        console.error('Error loading room queue data:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load room queue data. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // Dialog states
  const [isReassignDialogOpen, setIsReassignDialogOpen] = useState(false);
  const [isPatientDetailsOpen, setIsPatientDetailsOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<QueuedPatient | null>(null);
  const [selectedNewRoom, setSelectedNewRoom] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter patients
  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           p.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           p.personalNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRoom = roomFilter === 'all' || p.roomId === roomFilter;
      const matchesPriority = priorityFilter === 'all' || p.priority === priorityFilter;
      return matchesSearch && matchesRoom && matchesPriority;
    });
  }, [patients, searchQuery, roomFilter, priorityFilter]);

  // Group patients by room
  const patientsByRoom = useMemo(() => {
    const grouped: Record<string, QueuedPatient[]> = {};
    rooms.forEach(room => {
      grouped[room.id] = filteredPatients.filter(p => p.roomId === room.id)
        .sort((a, b) => {
          const priorityOrder = { 'Emergency': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
          const prioDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
          if (prioDiff !== 0) return prioDiff;
          return a.waitTime - b.waitTime;
        });
    });
    return grouped;
  }, [filteredPatients, rooms]);

  // Stats
  const stats = useMemo(() => ({
    totalInQueues: patients.length,
    emergencyCount: patients.filter(p => p.priority === 'Emergency').length,
    avgWaitTime: patients.length > 0 ? Math.round(patients.reduce((sum, p) => sum + p.waitTime, 0) / patients.length) : 0,
    roomsWithPatients: new Set(patients.map(p => p.roomId)).size,
  }), [patients]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Reload rooms to get updated room data
      const roomsResult = await roomService.getRooms({ page_size: 1000 });
      const roomsMap = new Map(roomsResult.results.map((room: any) => [String(room.id), room]));
      
      // Reload queue data
      const queueResult = await apiFetch<{ results: any[] }>('/consultation/queue/?is_active=true&page_size=1000');
      const queueItems = queueResult.results || [];
      
      const transformedPatients = await Promise.all(queueItems.map(async (item: any) => {
        try {
          // Extract patient ID from queue item
          const patientId = typeof item.patient === 'number' ? item.patient : parseInt(String(item.patient || ''));
          
          if (isNaN(patientId) || patientId <= 0) {
            console.warn(`Invalid patient ID in queue item ${item.id}:`, item.patient);
            return null;
          }
          
          // Fetch patient details
          let patient;
          try {
            patient = await patientService.getPatient(patientId);
          } catch (patientErr) {
            console.error(`Error fetching patient ${patientId} for queue item ${item.id}:`, patientErr);
            patient = null;
          }
          
          const queuedAt = new Date(item.queued_at);
          const waitTime = Math.floor((Date.now() - queuedAt.getTime()) / (1000 * 60));
          
          // Map backend priority (integer) to frontend priority
          const getPriority = (priorityNum: number): QueuedPatient['priority'] => {
            if (priorityNum === 0) return 'Emergency';
            if (priorityNum === 1) return 'High';
            if (priorityNum === 2) return 'Medium';
            return 'Low';
          };
          
          // Get visit type and vitals if available
          let visitType = 'Consultation';
          let vitals: QueuedPatient['vitals'] = undefined;
          if (item.visit) {
            try {
              const visitId = typeof item.visit === 'number' ? item.visit : parseInt(String(item.visit));
              const visit = await apiFetch(`/visits/${visitId}/`) as {
                visit_type?: string;
              };
              visitType = visit.visit_type || 'Consultation';
              
              // Fetch vitals for this visit
              try {
                const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${visitId}&page_size=1`);
                const latestVitals = vitalsResult.results?.[0];
                if (latestVitals) {
                  vitals = {
                    bp: latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic
                      ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}` 
                      : 'N/A',
                    pulse: latestVitals.heart_rate ? String(latestVitals.heart_rate) : 'N/A',
                    temp: latestVitals.temperature ? `${latestVitals.temperature}°C` : 'N/A',
                  };
                }
              } catch (vitalsErr) {
                // Ignore vitals fetch errors
              }
            } catch (visitErr) {
              // Ignore visit fetch errors
            }
          }
          
          // Get room specialty for clinic
          const room = roomsMap.get(String(item.room));
          const clinic = room?.specialty || '';
          
          return {
            id: String(item.id),
            name: patient 
              ? (patient.full_name || `${patient.first_name} ${patient.surname}`)
              : (item.patient_name || `Patient ${item.patient}`),
            patientId: patient?.patient_id || String(patientId),
            personalNumber: patient?.personal_number || '',
            priority: getPriority(typeof item.priority === 'number' ? item.priority : parseInt(item.priority) || 2),
            waitTime: waitTime > 0 ? waitTime : 0,
            sentAt: item.queued_at,
            sentBy: 'Nursing',
            clinic,
            visitType,
            roomId: String(item.room),
            age: patient?.age,
            gender: patient?.gender,
            vitals,
          } as QueuedPatient;
        } catch (err) {
          console.error(`Error transforming queue item ${item.id}:`, err);
          return null;
        }
      }));
      
      const validPatients = transformedPatients.filter((p): p is QueuedPatient => p !== null);
      setPatients(validPatients);
      toast.success('Queue data refreshed');
    } catch (err) {
      console.error('Error refreshing queue:', err);
      toast.error('Failed to refresh queue data');
    } finally {
      setIsRefreshing(false);
    }
  };

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
      
      console.log('Reassigning patient:', {
        queueItemId,
        fromRoom: selectedPatient.roomId,
        toRoom: selectedNewRoom,
        newRoomId
      });
      
      // Update queue item to assign to new room
      const response = await apiFetch(`/consultation/queue/${queueItemId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ room: newRoomId }),
      });
      
      console.log('Reassign response:', response);
      
      const oldRoom = rooms.find(r => r.id === selectedPatient.roomId);
      const newRoom = rooms.find(r => r.id === selectedNewRoom);

      setPatients(prev => prev.map(p => 
        p.id === selectedPatient.id ? { ...p, roomId: selectedNewRoom } : p
      ));

      toast.success(`Patient reassigned`, {
        description: `${selectedPatient.name} moved from ${oldRoom?.name} to ${newRoom?.name}`
      });
      setIsReassignDialogOpen(false);
      
      // Refresh queue data
      await handleRefresh();
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

  const handleRemoveFromQueue = async (patient: QueuedPatient) => {
    try {
      const queueItemId = parseInt(patient.id);
      if (isNaN(queueItemId)) {
        toast.error('Invalid queue item ID');
        return;
      }
      
      // Deactivate queue item (soft delete by setting is_active=false)
      await apiFetch(`/consultation/queue/${queueItemId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      });
      
      setPatients(prev => prev.filter(p => p.id !== patient.id));
      toast.success(`${patient.name} removed from queue`);
    } catch (err) {
      console.error('Error removing patient from queue:', err);
      toast.error('Failed to remove patient from queue. Please try again.');
    }
  };

  const movePatientInQueue = async (patientId: string, direction: 'up' | 'down') => {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) {
      toast.error('Patient not found');
      return;
    }

    // Get all patients in the same room, sorted by current order (priority then waitTime)
    const roomPatients = patients.filter(p => p.roomId === patient.roomId)
      .sort((a, b) => {
        const priorityOrder = { 'Emergency': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
        const prioDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (prioDiff !== 0) return prioDiff;
        return a.waitTime - b.waitTime;
      });
    
    const index = roomPatients.findIndex(p => p.id === patientId);
    
    if (direction === 'up' && index === 0) {
      toast.info('Patient is already at the top of the queue');
      return;
    }
    if (direction === 'down' && index === roomPatients.length - 1) {
      toast.info('Patient is already at the bottom of the queue');
      return;
    }

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const swapPatient = roomPatients[swapIndex];
    
    const queueItemId = parseInt(patient.id);
    const swapQueueItemId = parseInt(swapPatient.id);
    
    if (isNaN(queueItemId) || isNaN(swapQueueItemId)) {
      toast.error('Invalid queue item IDs');
      return;
    }
    
    try {
      // Fetch current queue items to get their actual data
      const [currentItem, swapItem] = await Promise.all([
        apiFetch(`/consultation/queue/${queueItemId}/`),
        apiFetch(`/consultation/queue/${swapQueueItemId}/`),
      ]) as [{ priority: number; queued_at: string; [key: string]: any }, { priority: number; queued_at: string; [key: string]: any }];
      
      console.log('Moving patient in queue:', {
        direction,
        currentPatient: patient.name,
        swapPatient: swapPatient.name,
        currentPriority: currentItem.priority,
        swapPriority: swapItem.priority,
        currentQueuedAt: currentItem.queued_at,
        swapQueuedAt: swapItem.queued_at,
      });
      
      const currentPriority = currentItem.priority;
      const swapPriority = swapItem.priority;
      const currentQueuedAt = new Date(currentItem.queued_at);
      const swapQueuedAt = new Date(swapItem.queued_at);
      
      // Swap both priority and queued_at to ensure proper reordering
      // If priorities are the same, swapping queued_at will change order
      // If priorities are different, swapping priorities will change order
      await Promise.all([
        apiFetch(`/consultation/queue/${queueItemId}/`, {
          method: 'PATCH',
          body: JSON.stringify({ 
            priority: swapPriority,
            queued_at: swapQueuedAt.toISOString(),
          }),
        }),
        apiFetch(`/consultation/queue/${swapQueueItemId}/`, {
          method: 'PATCH',
          body: JSON.stringify({ 
            priority: currentPriority,
            queued_at: currentQueuedAt.toISOString(),
          }),
        }),
      ]);
      
      // Refresh queue data to show updated order
      await handleRefresh();
      
      toast.success(`Patient ${direction === 'up' ? 'moved up' : 'moved down'} in queue`);
    } catch (err: any) {
      console.error('Error moving patient in queue:', err);
      
      // Extract error message
      let errorMessage = 'Failed to update queue order. Please try again.';
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
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Emergency': return 'bg-rose-500 text-white border-rose-500';
      case 'High': return 'bg-amber-500 text-white border-amber-500';
      case 'Medium': return 'bg-blue-500 text-white border-blue-500';
      case 'Low': return 'bg-emerald-500 text-white border-emerald-500';
      default: return 'bg-gray-500 text-white';
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
        <div className="container mx-auto p-6">
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
        <div className="container mx-auto p-6">
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
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <DoorOpen className="h-8 w-8 text-emerald-500" />
              Consultation Room Queue
            </h1>
            <p className="text-muted-foreground mt-1">Monitor and reassign patients across consultation rooms</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-muted-foreground">
              <Clock className="h-3 w-3 mr-1" />
              Real-time
            </Badge>
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
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
                    <p className={`text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
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
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search patients by name, ID, or personal number..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={roomFilter} onValueChange={setRoomFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by Room" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rooms</SelectItem>
                  {rooms.map(room => (
                    <SelectItem key={room.id} value={room.id}>{room.name.split(' - ')[0]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="Emergency">Emergency</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
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
                            patient.priority === 'Emergency' ? 'border-rose-500/50 bg-rose-500/5' : 'border-border'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">{patient.name}</span>
                                <Badge className={`${getPriorityColor(patient.priority)} text-xs`}>
                                  {patient.priority}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                <p>{patient.patientId} • {patient.clinic}</p>
                                <p className="flex items-center gap-2">
                                  <Clock className="h-3 w-3" /> {patient.waitTime} min wait
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => movePatientInQueue(patient.id, 'up')} disabled={index === 0} title="Move up">
                                  <MoveUp className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => movePatientInQueue(patient.id, 'down')} disabled={index === roomPatients.length - 1} title="Move down">
                                  <MoveDown className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openPatientDetails(patient)} title="View details">
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-500" onClick={() => openReassignDialog(patient)} title="Reassign to another room">
                                  <ArrowLeftRight className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={() => handleRemoveFromQueue(patient)} title="Remove from queue">
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
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
          <DialogContent className="sm:max-w-[500px]">
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
          <DialogContent className="sm:max-w-[500px]">
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
                  <Badge className={getPriorityColor(selectedPatient.priority)}>{selectedPatient.priority}</Badge>
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
