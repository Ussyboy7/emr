"use client";

import { useState, useEffect, useMemo } from 'react';
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
  RefreshCw, Eye, Edit, CheckCircle2, Calendar, Activity, Thermometer, 
  Heart, Wind, Droplets, Scale, Loader2, Save, X
} from 'lucide-react';

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
  nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room';
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
  const [patients, setPatients] = useState<Patient[]>([]);
  const [rooms, setRooms] = useState<ConsultationRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load visits and rooms from API
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load rooms first
        const roomsResult = await roomService.getRooms({ page_size: 1000 });
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

        // Fetch visits with status 'completed' (sent to nursing)
        // Also get today's visits to filter by date
        const today = new Date().toISOString().split('T')[0];
        const result = await visitService.getVisits({ 
          status: 'completed',
          date: today,
          page_size: 500 
        });
        
        // Fetch vitals for all visits in parallel
        const vitalsPromises = result.results.map(async (visit: Visit) => {
          try {
            const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${visit.id}&ordering=-recorded_at`);
            return { visitId: visit.id, vitals: vitalsResult.results[0] || null };
          } catch (err) {
            console.error(`Error fetching vitals for visit ${visit.id}:`, err);
            return { visitId: visit.id, vitals: null };
          }
        });
        const vitalsResults = await Promise.all(vitalsPromises);
        const vitalsMap = new Map(vitalsResults.map(r => [r.visitId, r.vitals]));
        
        // Transform visits to Patient format
        const transformedPatients: Patient[] = result.results.map((visit: Visit) => {
          // Calculate wait time (minutes since visit was created)
          const visitDateTime = new Date(`${visit.date}T${visit.time}`);
          const waitTime = Math.floor((Date.now() - visitDateTime.getTime()) / (1000 * 60));
          
          // Get vitals for this visit
          const vitalsData = vitalsMap.get(visit.id);
          
          // Determine nursing status based on visit data and vitals
          let nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room' = 'Pending';
          if (vitalsData) {
            nursingStatus = 'Ready for Consultation';
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
            painScale: '', // Not in backend model yet
            bloodSugar: '', // Not in backend model yet
            notes: vitalsData.notes || '',
            recordedAt: vitalsData.recorded_at || new Date().toISOString(),
            recordedBy: vitalsData.recorded_by_name || 'Unknown',
          } : undefined;
          
          return {
            id: String(visit.id),
            name: visit.patient_name || `Patient ${visit.patient}`,
            patientId: visit.visit_id || String(visit.id),
            personalNumber: '', // Will be filled from patient data if needed
            clinic: visit.clinic || 'General',
            visitDate: visit.date,
            visitTime: visit.time,
            visitType: visit.visit_type === 'emergency' ? 'Emergency' :
                      visit.visit_type === 'consultation' ? 'Consultation' :
                      visit.visit_type === 'follow_up' ? 'Follow-up' : 'Consultation',
            nursingStatus,
            vitals,
            waitTime: waitTime > 0 ? waitTime : 0,
            patientNumericId: visit.patient, // Store the actual patient ID from backend
            visitNumericId: visit.id, // Store the actual visit ID from backend
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
    };

    loadData();
  }, []);
  
  // Dialog states
  const [isVitalsDialogOpen, setIsVitalsDialogOpen] = useState(false);
  const [isViewVitalsDialogOpen, setIsViewVitalsDialogOpen] = useState(false);
  const [isRoomPickerOpen, setIsRoomPickerOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [vitalsForm, setVitalsForm] = useState<VitalsData>(emptyVitals);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Reload rooms when room picker opens
  useEffect(() => {
    if (isRoomPickerOpen) {
      const loadRooms = async () => {
        try {
          const roomsResult = await roomService.getRooms({ page_size: 1000 });
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
  }, [isRoomPickerOpen]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filter patients
  const filteredPatients = patients.filter(p => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
                         p.name.toLowerCase().includes(searchLower) || 
                         p.patientId.toLowerCase().includes(searchLower) ||
                         (p.personalNumber && p.personalNumber.toLowerCase().includes(searchLower));
    const matchesStatus = statusFilter === 'all' || p.nursingStatus.toLowerCase().replace(' ', '-') === statusFilter;
    // Don't show patients already sent to rooms
    const notSentToRoom = p.nursingStatus !== 'Sent to Room';
    return matchesSearch && matchesStatus && notSentToRoom;
  });

  // Sort by visit type (Emergency first) then by wait time
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    const typeOrder: Record<string, number> = { 'Emergency': 0, 'Consultation': 1, 'Follow-up': 2 };
    const typeDiff = (typeOrder[a.visitType] ?? 3) - (typeOrder[b.visitType] ?? 3);
    if (typeDiff !== 0) return typeDiff;
    return (b.waitTime || 0) - (a.waitTime || 0);
  });

  // Paginated patients
  const paginatedPatients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedPatients.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedPatients, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Stats
  const stats = {
    totalInPool: patients.filter(p => p.nursingStatus !== 'Sent to Room').length,
    pendingVitals: patients.filter(p => p.nursingStatus === 'Pending').length,
    readyForConsultation: patients.filter(p => p.nursingStatus === 'Ready for Consultation').length,
    sentToRooms: patients.filter(p => p.nursingStatus === 'Sent to Room').length,
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Reload rooms
      const roomsResult = await roomService.getRooms({ page_size: 1000 });
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
      
      // Reload visits from API
      const today = new Date().toISOString().split('T')[0];
      const result = await visitService.getVisits({ 
        status: 'completed',
        date: today,
        page_size: 500 
      });
      
      // Fetch vitals for all visits in parallel
      const vitalsPromises = result.results.map(async (visit: Visit) => {
        try {
          const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${visit.id}&ordering=-recorded_at`);
          return { visitId: visit.id, vitals: vitalsResult.results[0] || null };
        } catch (err) {
          console.error(`Error fetching vitals for visit ${visit.id}:`, err);
          return { visitId: visit.id, vitals: null };
        }
      });
      const vitalsResults = await Promise.all(vitalsPromises);
      const vitalsMap = new Map(vitalsResults.map(r => [r.visitId, r.vitals]));
      
      const transformedPatients: Patient[] = result.results.map((visit: Visit) => {
        const visitDateTime = new Date(`${visit.date}T${visit.time}`);
        const waitTime = Math.floor((Date.now() - visitDateTime.getTime()) / (1000 * 60));
        
        const vitalsData = vitalsMap.get(visit.id);
        const nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room' = vitalsData ? 'Ready for Consultation' : 'Pending';
        
        const vitals: VitalsData | undefined = vitalsData ? {
          temperature: vitalsData.temperature?.toString() || '',
          pulse: vitalsData.heart_rate?.toString() || '',
          bloodPressureSystolic: vitalsData.blood_pressure_systolic?.toString() || '',
          bloodPressureDiastolic: vitalsData.blood_pressure_diastolic?.toString() || '',
          respiratoryRate: vitalsData.respiratory_rate?.toString() || '',
          oxygenSaturation: vitalsData.oxygen_saturation?.toString() || '',
          weight: vitalsData.weight?.toString() || '',
          height: vitalsData.height?.toString() || '',
          painScale: '',
          bloodSugar: '',
          notes: vitalsData.notes || '',
          recordedAt: vitalsData.recorded_at || new Date().toISOString(),
          recordedBy: vitalsData.recorded_by_name || 'Unknown',
        } : undefined;
        
          return {
            id: String(visit.id),
            name: visit.patient_name || `Patient ${visit.patient}`,
            patientId: visit.visit_id || String(visit.id),
            patientNumericId: visit.patient, // Store the actual patient ID from backend
            visitNumericId: visit.id, // Store the actual visit ID from backend
            personalNumber: '',
            clinic: visit.clinic || 'General',
            visitDate: visit.date,
            visitTime: visit.time,
            visitType: visit.visit_type === 'emergency' ? 'Emergency' :
                      visit.visit_type === 'consultation' ? 'Consultation' :
                      visit.visit_type === 'follow_up' ? 'Follow-up' : 'Consultation',
            nursingStatus,
            vitals,
            waitTime: waitTime > 0 ? waitTime : 0,
          };
      });
      
      setPatients(transformedPatients);
      toast.success('Queue refreshed');
    } catch (err) {
      console.error('Error refreshing queue:', err);
      toast.error('Failed to refresh queue');
    } finally {
      setIsRefreshing(false);
    }
  };

  const openRecordVitals = (patient: Patient) => {
    setSelectedPatient(patient);
    setVitalsForm(patient.vitals || emptyVitals);
    setIsVitalsDialogOpen(true);
  };

  const openViewVitals = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsViewVitalsDialogOpen(true);
  };

  const openRoomPicker = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsRoomPickerOpen(true);
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
      const today = new Date().toISOString().split('T')[0];
      const visitsResult = await visitService.getVisits({ 
        status: 'completed',
        date: today,
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
      
      // Reload visits data to reflect the saved vitals
      const refreshedResult = await visitService.getVisits({ 
        status: 'completed',
        date: today,
        page_size: 500 
      });
      
      // Re-fetch vitals for all visits
      const vitalsPromises = refreshedResult.results.map(async (v: Visit) => {
        try {
          const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${v.id}&ordering=-recorded_at`);
          return { visitId: v.id, vitals: vitalsResult.results[0] || null };
        } catch (err) {
          return { visitId: v.id, vitals: null };
        }
      });
      const vitalsResults = await Promise.all(vitalsPromises);
      const vitalsMap = new Map(vitalsResults.map(r => [r.visitId, r.vitals]));
      
      // Transform and update patients
      const transformedPatients: Patient[] = refreshedResult.results.map((v: Visit) => {
        const visitDateTime = new Date(`${v.date}T${v.time}`);
        const waitTime = Math.floor((Date.now() - visitDateTime.getTime()) / (1000 * 60));
        const vitalsData = vitalsMap.get(v.id);
        const nursingStatus: 'Pending' | 'Vitals Recorded' | 'Ready for Consultation' | 'Sent to Room' = vitalsData ? 'Ready for Consultation' : 'Pending';
        
        const vitals: VitalsData | undefined = vitalsData ? {
          temperature: vitalsData.temperature?.toString() || '',
          pulse: vitalsData.heart_rate?.toString() || '',
          bloodPressureSystolic: vitalsData.blood_pressure_systolic?.toString() || '',
          bloodPressureDiastolic: vitalsData.blood_pressure_diastolic?.toString() || '',
          respiratoryRate: vitalsData.respiratory_rate?.toString() || '',
          oxygenSaturation: vitalsData.oxygen_saturation?.toString() || '',
          weight: vitalsData.weight?.toString() || '',
          height: vitalsData.height?.toString() || '',
          painScale: '',
          bloodSugar: '',
          notes: vitalsData.notes || '',
          recordedAt: vitalsData.recorded_at || new Date().toISOString(),
          recordedBy: vitalsData.recorded_by_name || 'Unknown',
        } : undefined;
        
        return {
          id: String(v.id),
          name: v.patient_name || `Patient ${v.patient}`,
          patientId: v.visit_id || String(v.id),
          personalNumber: '',
          clinic: v.clinic || 'General',
          visitDate: v.date,
          visitTime: v.time,
          visitType: v.visit_type === 'emergency' ? 'Emergency' :
                    v.visit_type === 'consultation' ? 'Consultation' :
                    v.visit_type === 'follow_up' ? 'Follow-up' : 'Consultation',
          nursingStatus,
          vitals,
          waitTime: waitTime > 0 ? waitTime : 0,
        };
      });
      
      setPatients(transformedPatients);
      
    } catch (err) {
      console.error('Error saving vitals:', err);
      toast.error('Failed to save vitals. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendToRoom = async (roomId: string) => {
    if (!selectedPatient) return;
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
      
      // Update visit status to "in_progress"
      await visitService.updateVisit(visitId, {
        status: 'in_progress',
      });
      
      // Check if patient is already in queue for this room
      try {
        const existingQueue = await apiFetch<{ results: any[] }>(`/consultation/queue/?room=${parseInt(roomId)}&patient=${patientId}&is_active=true`);
        if (existingQueue.results && existingQueue.results.length > 0) {
          toast.error('Patient is already in the queue for this room');
          setIsSubmitting(false);
          return;
        }
      } catch (checkErr) {
        // Ignore check errors, proceed with adding
        console.warn('Could not check existing queue:', checkErr);
      }
      
      // Add patient to consultation queue
      try {
        const queuePayload = {
          patient: patientId, // Required: Patient ID (numeric)
          visit: visitId, // Optional: Visit ID (numeric)
          room: parseInt(roomId), // Required: Room ID (numeric)
          priority: priority, // Required: Integer (0 = highest priority)
          is_active: true,
        };
        
        console.log('Sending patient to queue:', queuePayload);
        
        const queueResponse = await apiFetch('/consultation/queue/', {
          method: 'POST',
          body: JSON.stringify(queuePayload),
        });
        
        console.log('Queue response:', queueResponse);
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
            errorMessage = errorData.non_field_errors[0];
          } else {
            // Format field errors
            const fieldErrors = Object.entries(errorData)
              .map(([field, errors]: [string, any]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
              .join('; ');
            errorMessage = fieldErrors || errorMessage;
          }
        }
        
        toast.error(errorMessage);
        setIsSubmitting(false);
        return;
      }
      
      // Update local state
      setPatients(prev => prev.map(p => 
        p.id === selectedPatient.id 
          ? { ...p, nursingStatus: 'Sent to Room' as const, consultationRoom: roomId }
          : p
      ));

      setRooms(prev => prev.map(r => 
        r.id === roomId ? { ...r, queueCount: r.queueCount + 1 } : r
      ));

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

  const getVisitTypeColor = (type: string) => {
    switch (type) {
      case 'Emergency': return 'bg-rose-500 text-white';
      case 'Consultation': return 'bg-blue-500 text-white';
      case 'Follow-up': return 'bg-emerald-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'Vitals Recorded': return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
      case 'Ready for Consultation': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'Sent to Room': return 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10';
      default: return 'border-gray-500/50 text-gray-600 dark:text-gray-400 bg-gray-500/10';
    }
  };

  const getVisitTypeBorderColor = (type: string) => {
    switch (type) {
      case 'Emergency': return 'border-l-rose-500';
      case 'Consultation': return 'border-l-blue-500';
      case 'Follow-up': return 'border-l-emerald-500';
      default: return 'border-l-gray-500';
    }
  };

  // Show loading state
  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6 space-y-6">
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
        <div className="container mx-auto p-6 space-y-6">
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
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-8 w-8 text-rose-500" />
              Nursing Pool Queue
            </h1>
            <p className="text-muted-foreground mt-1">Record vitals and send patients to consultation rooms</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-muted-foreground">
              <Clock className="h-3 w-3 mr-1" />
              Real-time
            </Badge>
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total in Pool', value: stats.totalInPool, icon: Users, color: 'text-rose-500', bg: 'bg-rose-500/10' },
            { label: 'Pending Vitals', value: stats.pendingVitals, icon: Stethoscope, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { label: 'Ready for Consultation', value: stats.readyForConsultation, icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Sent to Rooms', value: stats.sentToRooms, icon: ArrowRight, color: 'text-violet-500', bg: 'bg-violet-500/10' },
          ].map((stat, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
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
            <div className="flex flex-col gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by name, patient ID, personal number..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending Vitals</SelectItem>
                    <SelectItem value="vitals-recorded">Vitals Recorded</SelectItem>
                    <SelectItem value="ready-for-consultation">Ready for Consultation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground px-1">
          Showing <span className="font-medium text-foreground">{sortedPatients.length}</span> of {stats.totalInPool} patients
        </p>

        {/* Patient Queue */}
        <div className="space-y-3">
          {sortedPatients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">No patients in queue</h3>
                <p className="text-sm text-muted-foreground text-center">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your search or filter criteria'
                    : 'No patients in the nursing pool at the moment'}
                </p>
              </CardContent>
            </Card>
          ) : (
            paginatedPatients.map((patient) => (
              <Card key={patient.id} className={`border-l-4 ${getVisitTypeBorderColor(patient.visitType)} hover:shadow-md transition-shadow`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      patient.visitType === 'Emergency' ? 'bg-rose-100 dark:bg-rose-900/30' :
                      patient.visitType === 'Consultation' ? 'bg-blue-100 dark:bg-blue-900/30' :
                      'bg-emerald-100 dark:bg-emerald-900/30'
                    }`}>
                      <span className={`font-semibold text-xs ${
                        patient.visitType === 'Emergency' ? 'text-rose-600' :
                        patient.visitType === 'Consultation' ? 'text-blue-600' :
                        'text-emerald-600'
                      }`}>{patient.name.split(' ').map(n => n[0]).join('')}</span>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{patient.name}</span>
                          <Badge className={`text-[10px] px-1.5 py-0 ${getVisitTypeColor(patient.visitType)}`}>{patient.visitType}</Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(patient.nursingStatus)}`}>{patient.nursingStatus}</Badge>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {patient.nursingStatus === 'Pending' && (
                            <Button size="sm" onClick={() => openRecordVitals(patient)} className="h-7 px-2 bg-rose-500 hover:bg-rose-600 text-white text-xs">
                              <Stethoscope className="h-3 w-3 mr-1" />Vitals
                            </Button>
                          )}
                          {(patient.nursingStatus === 'Vitals Recorded' || patient.nursingStatus === 'Ready for Consultation') && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewVitals(patient)}>
                                <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openRecordVitals(patient)}>
                                <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                              </Button>
                            </>
                          )}
                          {patient.nursingStatus === 'Ready for Consultation' && (
                            <Button size="sm" onClick={() => openRoomPicker(patient)} className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs">
                              <ArrowRight className="h-3 w-3 mr-1" />Send
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Row 2: Details */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span>{patient.patientId}</span>
                        <span>•</span>
                        <span>{patient.personalNumber}</span>
                        <span>•</span>
                        <span>{patient.clinic}</span>
                        <span>•</span>
                        <span>{patient.visitType}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{patient.waitTime}m</span>
                        {patient.age && <><span>•</span><span>{patient.age}y {patient.gender}</span></>}
                      </div>
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
            />
          </Card>
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
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => {
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
            <form onSubmit={handleSaveVitals} className="py-4 space-y-6">
              {/* Basic Vitals */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Thermometer className="h-3 w-3" />Temperature (°C)</Label>
                  <Input type="number" step="0.1" placeholder="36.5" value={vitalsForm.temperature} onChange={(e) => setVitalsForm(prev => ({ ...prev, temperature: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Heart className="h-3 w-3" />Pulse (bpm)</Label>
                  <Input type="number" placeholder="72" value={vitalsForm.pulse} onChange={(e) => setVitalsForm(prev => ({ ...prev, pulse: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Wind className="h-3 w-3" />Respiratory Rate</Label>
                  <Input type="number" placeholder="16" value={vitalsForm.respiratoryRate} onChange={(e) => setVitalsForm(prev => ({ ...prev, respiratoryRate: e.target.value }))} />
                </div>
              </div>

              {/* Blood Pressure */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Activity className="h-3 w-3" />Blood Pressure (mmHg)</Label>
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
                  <Label className="flex items-center gap-1"><Scale className="h-3 w-3" />Weight (kg)</Label>
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
          <DialogContent className="sm:max-w-[600px]">
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
          <DialogContent className="sm:max-w-[600px]">
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
                          {room.doctor ? `${room.doctor} • ` : ''}{room.specialty || 'General'}
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


