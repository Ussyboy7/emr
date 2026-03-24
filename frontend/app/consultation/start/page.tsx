"use client";

import React, { useState, useEffect } from "react";
import { safeAsync } from '@/lib/utils/error-handling';
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
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
import { roomService } from '@/lib/services';
import { apiFetch } from '@/lib/api-client';
import { patientService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';

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
  priority: "Emergency" | "High" | "Medium" | "Low";
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

interface ConsultationRoom {
  id: string;
  name: string;
  status: "available" | "occupied";
  currentPatient?: string;
  startTime?: string;
  doctor?: string;
  specialtyFocus?: string;
  totalConsultationsToday: number;
  averageConsultationTime: number;
  queue: { patient_id: string; position: number }[];
}

// Consultation rooms and patient data will be loaded from API

const getStatusColor = (status: ConsultationRoom["status"]): string => {
  switch (status) {
    case "available":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    case "occupied":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300";
  }
};

const getStatusIcon = (status: ConsultationRoom["status"]): string => {
  switch (status) {
    case "available":
      return "✓";
    case "occupied":
      return "⚫";
    default:
      return "";
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case "emergency":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400";
    case "high":
      return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "low":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
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
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  // Load rooms and queue from API
  useEffect(() => {
    const loadRooms = async () => {
      try {
        setLoadingRooms(true);
        setError(null);
        
        // Load rooms
        const roomsResult = await roomService.getRooms({ page_size: 1000 });
        
        // Load queue items to get patient counts per room
        const queueResult = await apiFetch<{ results: any[] }>('/consultation/queue/?is_active=true&page_size=1000');
        const queueItems = queueResult.results || [];
        
        
        // Group queue items by room
        const queueByRoom: Record<string, any[]> = {};
        queueItems.forEach((item: any) => {
          const roomId = String(item.room);
          if (!queueByRoom[roomId]) {
            queueByRoom[roomId] = [];
          }
          queueByRoom[roomId].push(item);
        });
        
        // Transform rooms with queue data
        const transformedRooms: ConsultationRoom[] = roomsResult.results.map((room: any) => {
          const roomQueue = queueByRoom[String(room.id)] || [];
          const sortedQueue = roomQueue.sort((a, b) => {
            // Sort by priority (lower number = higher priority), then by queued_at
            if (a.priority !== b.priority) {
              return a.priority - b.priority;
            }
            return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
          });
          
          return {
            id: String(room.id),
            name: room.name,
            status: room.status?.toLowerCase() === 'active' ? 'available' as const : 'occupied' as const,
            currentPatient: sortedQueue.length > 0 ? sortedQueue[0].patient_name : undefined,
            startTime: undefined,
            doctor: room.assigned_doctor || undefined,
            specialtyFocus: room.specialty || undefined,
            totalConsultationsToday: 0, // Could be calculated from visits
            averageConsultationTime: 0,
            queue: sortedQueue
              .filter((item: any) => item.patient != null) // Filter out items without patient IDs
              .map((item: any, index: number) => ({
                patient_id: String(item.patient),
                position: index + 1,
              })),
          };
        });
        
        setConsultationRooms(transformedRooms);
      } catch (err) {
        console.error('Error loading consultation rooms:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load consultation rooms. Please try again.');
        }
      } finally {
        setLoadingRooms(false);
      }
    };
    
    loadRooms();
  }, []);

  // Load patient for selected room
  useEffect(() => {
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
          const queueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?room=${numericRoomId}&is_active=true&page_size=100`);
          // Find the queue item that matches our patient ID
          queueItem = queueResult.results?.find((item: any) => {
            const itemPatientId = typeof item.patient === 'number' ? item.patient : parseInt(String(item.patient || ''));
            return itemPatientId === numericPatientId;
          });
          
          if (!queueItem && queueResult.results && queueResult.results.length > 0) {
            // Fallback: use first item if patient ID doesn't match
            console.warn('Patient ID mismatch, using first queue item:', {
              expectedPatientId: numericPatientId,
              firstItemPatientId: queueResult.results[0].patient
            });
            queueItem = queueResult.results[0];
            // Update the patient ID from the queue item
            const itemPatientId = typeof queueItem.patient === 'number' ? queueItem.patient : parseInt(String(queueItem.patient || ''));
            if (!isNaN(itemPatientId) && itemPatientId > 0) {
              numericPatientId = itemPatientId;
            }
          }
        } catch (queueErr) {
          console.warn('Could not load queue item from API, using patient ID from room queue:', queueErr);
          // Continue with just the patient ID we have
        }
        
        
        if (queueItem) {
          
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
        let visitDate = new Date().toISOString().split('T')[0];
        let visitTime = '';
        let visitId: string | number | null = null;
        let priority: "Emergency" | "High" | "Medium" | "Low" = 'Medium';
        let waitTime = 0;
        
        if (queueItem) {
          if (queueItem.visit) {
            visitId = typeof queueItem.visit === 'number' ? queueItem.visit : parseInt(String(queueItem.visit));
            try {
              const visit = await apiFetch(`/visits/${visitId}/`) as {
                date?: string;
                time?: string;
              };
              visitDate = visit.date || visitDate;
              visitTime = visit.time || visitTime;
            } catch (visitErr) {
              console.warn('Could not load visit details:', visitErr);
            }
          }
          
          // Calculate wait time
          if (queueItem.queued_at) {
            waitTime = Math.floor((Date.now() - new Date(queueItem.queued_at).getTime()) / (1000 * 60));
          }
          
          // Determine priority
          if (queueItem.priority === 0) {
            priority = 'Emergency';
          } else if (queueItem.priority === 1) {
            priority = 'High';
          } else if (queueItem.priority === 2) {
            priority = 'Medium';
          } else {
            priority = 'Low';
          }
        }
        
        // Check if vitals exist for this visit
        const vitalsCompleted = visitId
          ? await safeAsync(
              () => apiFetch<{ count: number }>(`/vitals/?visit=${visitId}&page_size=1`).then(result => result.count > 0),
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
          priority,
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
        
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          // Check for specific error messages
          const errorMessage = err?.message || String(err);
          if (errorMessage.includes('not found') || errorMessage.includes('Not found') || err?.status === 404) {
            toast.error(`Patient not found. The patient may have been removed from the system.`);
          } else if (errorMessage.includes('Patient ID not found')) {
            toast.error(`Patient ID not found. Queue item may be invalid.`);
          } else {
            toast.error(`Failed to load patient: ${errorMessage}`);
          }
        }
        setSelectedPatient(null);
      }
    };
    
    loadPatient();
  }, [selectedRoom, consultationRooms]);

  const handleStartConsultation = () => {
    if (!selectedRoom) {
      toast.error("Please select a consultation room");
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleDoubleClickRoom = async (roomId: string, roomStatus: string) => {
    if (roomStatus !== "available") {
      toast.error("This room is not available for consultation");
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

      // Start consultation directly by navigating to room
      toast.success("Entering consultation room...");
      router.push(`/consultation/room/${roomId}`);

    } catch (error) {
      console.error("Error starting consultation:", error);
      toast.error("Failed to start consultation");
      setIsLoading(false);
    }
  };

  const confirmStartConsultation = async () => {
    setIsLoading(true);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      toast.success("Entering consultation room...");

      // Navigate to consultation room
      router.push(`/consultation/room/${selectedRoom}`);
    } catch (error) {
      toast.error("Failed to start consultation");
      setIsLoading(false);
    }
  };

  const handleRoomSelect = (roomId: string, status: ConsultationRoom["status"]) => {
    if (status === "available") {
      setSelectedRoom(roomId);
    }
  };

  const selectedRoomData = consultationRooms.find((room) => room.id === selectedRoom);
  const availableRooms = consultationRooms.filter((room) => room.status === "available");

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
            💡 <strong>Quick Start:</strong> Double-click any available room to start consultation immediately!
          </div>
          {availableRooms.length === 0 && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2" />
                <p className="text-yellow-800 dark:text-yellow-300 text-sm">
                  No rooms are currently available. Please wait for a room to become free.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {/* Available Rooms */}
          <Card className="border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Available Rooms</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    {availableRooms.length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {availableRooms.length === 1 ? 'room ready' : 'rooms ready'}
                  </p>
                </div>
                <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Occupied Rooms */}
          <Card className="border-l-4 border-l-red-500 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Active Sessions</p>
                  <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400">
                    {consultationRooms.length - availableRooms.length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    consultations in progress
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
                    {consultationRooms.reduce((acc, room) => acc + room.queue.length, 0)}
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
                    {consultationRooms.reduce((acc, room) => acc + room.totalConsultationsToday, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    completed today
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
                  className="cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/30 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                >
                  All ({consultationRooms.length})
                </Badge>
                <Badge
                  className="cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                >
                  Available ({availableRooms.length})
                </Badge>
                <Badge
                  className="cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                >
                  Occupied ({consultationRooms.length - availableRooms.length})
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{consultationRooms.reduce((acc, room) => acc + room.queue.length, 0)} patients waiting</span>
            </div>
          </div>
        </div>

        {/* Room Grid */}
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mb-6">
          {consultationRooms.map((room) => (
            <Card
              key={room.id}
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-2 h-80 flex flex-col ${
                selectedRoom === room.id
                  ? "ring-2 ring-emerald-500 border-emerald-500 shadow-md"
                  : "border-border"
              } ${
                room.status !== "available"
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:border-emerald-300"
              }`}
              onClick={() => handleRoomSelect(room.id, room.status)}
              onDoubleClick={() => handleDoubleClickRoom(room.id, room.status)}
            >
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <CardTitle className="text-lg font-semibold">{room.name}</CardTitle>
                  </div>
                  <Badge className={`${getStatusColor(room.status)} font-medium capitalize`}>
                    <span aria-hidden="true">{getStatusIcon(room.status)}</span>
                    {room.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col">
                <div className="flex-1 flex flex-col space-y-3">
                  {/* Doctor Info */}
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      room.doctor ? "bg-green-500" : "bg-amber-500"
                    }`} />
                    <div className="text-sm font-medium">
                      {room.doctor ? (
                        <span className="text-green-700 dark:text-green-400">{room.doctor}</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400">Available for Assignment</span>
                      )}
                      {room.specialtyFocus && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({room.specialtyFocus})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Current Patient */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 min-h-[60px] flex flex-col justify-center">
                    {room.status === "occupied" && room.currentPatient ? (
                      <>
                        <div className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">
                          Currently Consulting
                        </div>
                        <div className="flex items-center gap-2 text-sm text-blue-900 dark:text-blue-200">
                          <Stethoscope className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{room.currentPatient}</span>
                        </div>
                        {room.startTime && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Started:{" "}
                            {new Date(room.startTime).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        No active consultation
                      </div>
                    )}
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
                      <span>Today: {room.totalConsultationsToday} sessions</span>
                      <span>Avg: {room.averageConsultationTime}min</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Enhanced Action Buttons */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 rounded-lg p-6 -mx-6 -mb-6 mt-6">
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button
              onClick={handleStartConsultation}
              disabled={!selectedRoom || isLoading || availableRooms.length === 0}
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
          {!selectedRoom && availableRooms.length > 0 && (
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
              {selectedPatient ? (
                <>
                  {" "}
                  | Next Patient:{" "}
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {selectedPatient.name}
                  </span>
                  <Badge className={`ml-2 ${getPriorityColor(selectedPatient.priority)}`}>
                    {selectedPatient.priority}
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

                        {/* Priority and Wait Time */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <strong className="text-sm text-muted-foreground">Priority</strong>
                            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              selectedPatient.priority === 'Emergency' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' :
                              selectedPatient.priority === 'High' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' :
                              selectedPatient.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                              'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                            }`}>
                              {selectedPatient.priority}
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
