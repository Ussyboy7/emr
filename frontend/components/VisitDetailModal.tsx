"use client";

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from "sonner";
import { visitService, patientService, consultationService, pharmacyService, labService } from '@/lib/services';
import { isAuthenticationError } from '@/lib/auth-errors';
import { 
  Calendar, Clock, CheckCircle2, Loader2, RefreshCw, AlertTriangle,
  ClipboardList, Heart, Stethoscope, Pill, TestTube, User, Building2
} from 'lucide-react';

interface Visit {
  id: string;
  numericId?: number;
  visitId?: string;
  patientId: string;
  patient?: string;
  date: string;
  time: string;
  type: string;
  department: string;
  doctor: string;
  status: string;
  chiefComplaint?: string;
  notes?: string;
}

interface VisitDetailModalProps {
  visit: Visit | null;
  visitId?: string | number;
  isOpen: boolean;
  onClose: () => void;
  onVisitUpdated?: () => void;
}

interface JourneyEvent {
  id: string;
  step: number;
  title: string;
  description: string;
  module: string;
  location?: string;
  status: 'completed' | 'in_progress' | 'pending';
  timestamp?: string;
  staff?: string;
  icon: any;
  color: string;
  details?: any;
}

export function VisitDetailModal({ visit: visitProp, visitId: visitIdProp, isOpen, onClose, onVisitUpdated }: VisitDetailModalProps) {
  const [visit, setVisit] = useState<any>(null);
  const [visitData, setVisitData] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [journey, setJourney] = useState<JourneyEvent[]>([]);

  const loadVisitJourney = useCallback(async () => {
    const idToUse = visitIdProp || visitProp?.numericId || visitProp?.id;
    if (!idToUse) return;

    try {
      setLoading(true);

      // Get visit data
      const numericId = Number(idToUse);
      let rawVisitData: any;
      if (!isNaN(numericId) && numericId > 0) {
        rawVisitData = await visitService.getVisit(numericId);
      } else {
        const visitsResult = await visitService.getVisits({ search: String(idToUse), page_size: 100 });
        const foundVisit = visitsResult.results.find((v: any) => (v.visit_id || String(v.id)) === idToUse);
        if (!foundVisit) {
          throw new Error(`Visit with ID "${idToUse}" not found`);
        }
        rawVisitData = await visitService.getVisit(foundVisit.id);
      }

      setVisit({
        id: rawVisitData.visit_id || String(rawVisitData.id),
        numericId: rawVisitData.id,
        patientId: String(rawVisitData.patient),
        date: rawVisitData.date || '',
        time: rawVisitData.time || '',
        type: rawVisitData.visit_type || 'consultation',
        department: rawVisitData.clinic || '',
        doctor: rawVisitData.doctor_name || 'Doctor',
        status: rawVisitData.status || 'scheduled',
        chiefComplaint: rawVisitData.chief_complaint || '',
        notes: rawVisitData.clinical_notes || '',
      });

      // Load patient
      try {
        const patientData = await patientService.getPatient(rawVisitData.patient);
        setPatient({
          id: patientData.patient_id || String(patientData.id),
          name: patientData.full_name || `${patientData.first_name} ${patientData.surname}`,
        });
      } catch (err) {
        console.error('Failed to load patient:', err);
      }

      // Build journey timeline
      const journeyEvents: JourneyEvent[] = [];
      let step = 1;

      // 1. Visit Created (always present)
      journeyEvents.push({
        id: 'visit-created',
        step: step++,
        title: 'Visit Created',
        description: `Visit ${rawVisitData.visit_id || rawVisitData.id} created`,
        module: 'Medical Records',
        location: 'Reception',
        status: 'completed',
        timestamp: rawVisitData.created_at || rawVisitData.date,
        icon: ClipboardList,
        color: 'bg-blue-500',
      });

      // 2. Sent to Nursing (if status is completed/in_progress)
      if (rawVisitData.status === 'completed' || rawVisitData.status === 'in_progress') {
        journeyEvents.push({
          id: 'sent-nursing',
          step: step++,
          title: 'Sent to Nursing Pool',
          description: 'Patient forwarded to nursing for vitals',
          module: 'Nursing',
          location: 'Nursing Pool',
          status: 'completed',
          timestamp: rawVisitData.updated_at,
          icon: Heart,
          color: 'bg-pink-500',
        });
      }

      // 3. Vitals Recorded (check if vitals exist for this visit date)
      try {
        const vitalsData = await patientService.getPatientVitals(rawVisitData.patient);
        const visitVitals = vitalsData.filter((v: any) => {
          const vitalDate = v.date || (v.recorded_at ? new Date(v.recorded_at).toISOString().split('T')[0] : '');
          return vitalDate === rawVisitData.date;
        });
        if (visitVitals.length > 0) {
          const latestVitals = visitVitals[visitVitals.length - 1];
          const bp = latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic 
            ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}`
            : '-';
          const temp = latestVitals.temperature || '-';
          journeyEvents.push({
            id: 'vitals-recorded',
            step: step++,
            title: 'Vitals Recorded',
            description: `BP: ${bp} | Temp: ${temp}°C`,
            module: 'Nursing',
            location: 'Nursing Pool',
            status: 'completed',
            timestamp: latestVitals.recorded_at,
            staff: (latestVitals as any).recorded_by_name || 'Nurse',
            icon: Heart,
            color: 'bg-red-500',
          });
        }
      } catch (err) {
        // Ignore
      }

      // 4. Consultation Session (if exists) - filter by patient and date
      try {
        const sessions = await consultationService.getSessions({ patient: rawVisitData.patient.toString() });
        if (sessions.results && sessions.results.length > 0) {
          // Filter sessions by visit date
          const visitSessions = sessions.results.filter((s: any) => {
            const sessionDate = s.started_at ? new Date(s.started_at).toISOString().split('T')[0] : '';
            return sessionDate === rawVisitData.date || s.visit === rawVisitData.id;
          });
          if (visitSessions.length > 0) {
            const session = visitSessions[0];
            journeyEvents.push({
              id: 'consultation-started',
              step: step++,
              title: 'Consultation Started',
              description: session.chief_complaint || 'Consultation in progress',
              module: 'Consultation',
              location: session.room_name || (session as any).clinic || 'Consultation Room',
              status: session.status === 'completed' ? 'completed' : 'in_progress',
              timestamp: session.started_at,
              staff: session.doctor_name,
              icon: Stethoscope,
              color: 'bg-purple-500',
              details: session,
            });
          }
        }
      } catch (err) {
        // Ignore
      }

      // 5. Lab Orders (if any) - filter by visit
      try {
        const labOrders = await labService.getOrders({ patient: rawVisitData.patient.toString() });
        if (labOrders.results && labOrders.results.length > 0) {
          const visitLabOrders = labOrders.results.filter((order: any) => order.visit === rawVisitData.id);
          if (visitLabOrders.length > 0) {
            const testCount = visitLabOrders.reduce((count: number, order: any) => count + (order.tests?.length || 0), 0);
            journeyEvents.push({
              id: 'lab-orders',
              step: step++,
              title: 'Lab Tests Ordered',
              description: `${testCount} test${testCount !== 1 ? 's' : ''} ordered`,
              module: 'Laboratory',
              location: 'Laboratory',
              status: 'completed',
              timestamp: visitLabOrders[0].ordered_at,
              staff: (visitLabOrders[0] as any).doctor_name || (visitLabOrders[0] as any).doctor?.name,
              icon: TestTube,
              color: 'bg-amber-500',
              details: visitLabOrders,
            });
          }
        }
      } catch (err) {
        // Ignore
      }

      // 6. Prescriptions (if any) - filter by visit
      try {
        const prescriptions = await pharmacyService.getPrescriptions({ patient: rawVisitData.patient.toString() });
        if (prescriptions.results && prescriptions.results.length > 0) {
          const visitPrescriptions = prescriptions.results.filter((rx: any) => rx.visit === rawVisitData.id);
          if (visitPrescriptions.length > 0) {
            const itemCount = visitPrescriptions.reduce((count: number, rx: any) => count + (rx.items?.length || rx.medications?.length || 0), 0);
            journeyEvents.push({
              id: 'prescriptions',
              step: step++,
              title: 'Prescriptions Created',
              description: `${itemCount} medication${itemCount !== 1 ? 's' : ''} prescribed`,
              module: 'Pharmacy',
              location: 'Pharmacy',
              status: 'completed',
              timestamp: visitPrescriptions[0].prescribed_at,
              staff: (visitPrescriptions[0] as any).doctor_name || (visitPrescriptions[0] as any).doctor?.name,
              icon: Pill,
              color: 'bg-green-500',
              details: visitPrescriptions,
            });
          }
        }
      } catch (err) {
        // Ignore
      }

      // 7. Visit Completed (if status is completed)
      if (rawVisitData.status === 'completed') {
        journeyEvents.push({
          id: 'visit-completed',
          step: step++,
          title: 'Visit Completed',
          description: 'Patient visit concluded',
          module: 'Medical Records',
          location: rawVisitData.clinic || 'Clinic',
          status: 'completed',
          timestamp: rawVisitData.updated_at,
          icon: CheckCircle2,
          color: 'bg-emerald-500',
        });
      }

      // Set pending status for next step if visit not completed
      if (rawVisitData.status !== 'completed' && journeyEvents.length > 0) {
        const lastEvent = journeyEvents[journeyEvents.length - 1];
        // Determine next step based on last completed
        if (lastEvent.id === 'visit-created') {
          journeyEvents.push({
            id: 'next-nursing',
            step: step++,
            title: 'Awaiting Nursing',
            description: 'Waiting to be sent to nursing pool',
            module: 'Nursing',
            status: 'pending',
            icon: Heart,
            color: 'bg-gray-400',
          });
        } else if (lastEvent.id === 'vitals-recorded') {
          journeyEvents.push({
            id: 'next-consultation',
            step: step++,
            title: 'Awaiting Consultation',
            description: 'Waiting for consultation',
            module: 'Consultation',
            status: 'pending',
            icon: Stethoscope,
            color: 'bg-gray-400',
          });
        }
      }

      setJourney(journeyEvents);
    } catch (err: any) {
      console.error('Error loading visit journey:', err);
      if (!isAuthenticationError(err)) {
        toast.error('Failed to load visit journey');
      }
    } finally {
      setLoading(false);
    }
  }, [visitProp, visitIdProp]);

  useEffect(() => {
    if (isOpen) {
      loadVisitJourney();
    }
  }, [isOpen, loadVisitJourney]);

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDateTime = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold">
                Visit Journey: {visit?.id || visitProp?.visitId || visitProp?.id || 'Loading...'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {patient ? `${patient.name} • ${patient.id}` : 'Loading patient...'} • {visit?.date || ''} {visit?.time ? `at ${visit.time}` : ''}
              </DialogDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={loadVisitJourney} disabled={loading} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading visit journey...</span>
            </div>
          ) : journey.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <span className="ml-3 text-destructive">Failed to load visit journey</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Visit Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    Visit Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Visit Type:</span>
                    <Badge variant="outline">{visit?.type || 'N/A'}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clinic:</span>
                    <span>{visit?.department || 'N/A'}</span>
                  </div>
                  {visit?.chiefComplaint && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Chief Complaint:</span>
                      <span className="text-right max-w-[60%]">{visit.chiefComplaint}</span>
                    </div>
                  )}
                  {visit?.notes && (
                    <div className="mt-3 pt-3 border-t">
                      <span className="text-muted-foreground block mb-2">Notes / Special Instructions:</span>
                      <div className="p-3 rounded-lg bg-muted/50 border">
                        <p className="text-sm whitespace-pre-wrap">{visit.notes}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Journey Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-purple-500" />
                    Patient Journey
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {journey.map((event, index) => {
                      const Icon = event.icon;
                      const isLast = index === journey.length - 1;
                      return (
                        <div key={event.id} className="flex gap-4">
                          {/* Timeline Line */}
                          <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${event.color} text-white`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            {!isLast && (
                              <div className={`w-0.5 flex-1 ${event.status === 'completed' ? 'bg-blue-300' : event.status === 'in_progress' ? 'bg-blue-200' : 'bg-gray-200'}`} />
                            )}
                          </div>

                          {/* Event Content */}
                          <div className="flex-1 pb-6">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold">{event.title}</h4>
                                  {getStatusIcon(event.status)}
                                </div>
                                <p className="text-sm text-muted-foreground mb-1">{event.description}</p>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <Badge variant="outline" className="text-xs">{event.module}</Badge>
                                  {event.location && (
                                    <span className="flex items-center gap-1">
                                      <Building2 className="h-3 w-3" />
                                      {event.location}
                                    </span>
                                  )}
                                  {event.staff && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {event.staff}
                                    </span>
                                  )}
                                  {event.timestamp && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {formatDateTime(event.timestamp)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
