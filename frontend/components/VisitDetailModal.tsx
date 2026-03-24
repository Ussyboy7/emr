"use client";

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from "sonner";
import { visitService, patientService, consultationService, pharmacyService, labService, radiologyService } from '@/lib/services';
import { isAuthenticationError } from '@/lib/auth-errors';
import {
  Calendar, Clock, CheckCircle2, Loader2, RefreshCw, AlertTriangle,
  ClipboardList, Heart, Stethoscope, Pill, TestTube, User, Building2, ScanLine
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
      let rawVisitData: any;
      let isConsultationSession = false;

      // Check if this is a consultation session ID (prefixed with "session-")
      if (typeof idToUse === 'string' && idToUse.startsWith('session-')) {
        const sessionId = idToUse.replace('session-', '');
        const numericSessionId = Number(sessionId);
        if (!isNaN(numericSessionId) && numericSessionId > 0) {
          // Load consultation session data
          const sessionData = await consultationService.getSession(numericSessionId);
          rawVisitData = {
            id: sessionData.id,
            visit_id: `session-${sessionData.id}`,
            patient: sessionData.patient,
            date: sessionData.started_at?.split('T')[0] || '',
            time: sessionData.started_at?.split('T')[1]?.substring(0, 5) || '',
            visit_type: 'Consultation',
            clinic: (sessionData.room as any)?.clinic_name || (sessionData.room as any)?.clinic?.name || 'GOPD',
            doctor_name: (sessionData.doctor as any)?.name || (sessionData.doctor as any)?.get_full_name || sessionData.doctor_name || 'Unknown',
            clinical_notes: sessionData.notes || '',
            status: sessionData.status,
            created_at: sessionData.started_at,
            ended_at: sessionData.ended_at,
          };
          isConsultationSession = true;
        }
      }

      if (!isConsultationSession) {
        const numericId = Number(idToUse);
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
        notes: rawVisitData.clinical_notes || '',
      });

      // Load patient
      try {
        const patientData = await patientService.getPatient(rawVisitData.patient);
        setPatient({
          id: patientData.patient_id || '',
          name: patientData.full_name ?? '',
        });
      } catch (err) {
        console.error('Failed to load patient:', err);
      }

      // Build journey timeline
      const journeyEvents: JourneyEvent[] = [];
      let step = 1;

      // Declare variables for later use in completion checks
      let visitLabOrders: any[] = [];
      let visitPrescriptions: any[] = [];

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
          // Filter sessions by visit date or session ID
          const visitSessions = sessions.results.filter((s: any) => {
            if (isConsultationSession) {
              // For consultation sessions, match by session ID
              return s.id === rawVisitData.id;
            } else {
              // For regular visits, match by date or visit reference
              const sessionDate = s.started_at ? new Date(s.started_at).toISOString().split('T')[0] : '';
              return sessionDate === rawVisitData.date || s.visit === rawVisitData.id;
            }
          });
          if (visitSessions.length > 0) {
            const session = visitSessions[0];
            journeyEvents.push({
              id: 'consultation-started',
              step: step++,
              title: 'Consultation Started',
              description: 'Consultation session initiated',
              module: 'Consultation',
              location: session.room_name || (session as any).clinic || 'Consultation Room',
              status: 'completed',
              timestamp: session.started_at,
              staff: session.doctor_name,
              icon: Stethoscope,
              color: 'bg-purple-500',
              details: session,
            });

            // Add consultation completed event if session has ended
            if (session.status === 'completed' && session.ended_at) {
              journeyEvents.push({
                id: 'consultation-completed',
                step: step++,
                title: 'Consultation Completed',
                description: 'Consultation session ended',
                module: 'Consultation',
                location: session.room_name || (session as any).clinic || 'Consultation Room',
                status: 'completed',
                timestamp: session.ended_at,
                staff: session.doctor_name,
                icon: CheckCircle2,
                color: 'bg-emerald-500',
                details: session,
              });
            }
          }
        }
      } catch (err) {
        // Ignore
      }

      // 5. Lab Orders (if any) - filter by visit
      try {
        const labOrders = await labService.getOrders({ patient: rawVisitData.patient.toString() });
        if (labOrders.results && labOrders.results.length > 0) {
          visitLabOrders = labOrders.results.filter((order: any) => {
            if (isConsultationSession) {
              // For consultation sessions, match by date
              const orderDate = order.ordered_at ? new Date(order.ordered_at).toISOString().split('T')[0] : '';
              return orderDate === rawVisitData.date;
            } else {
              // For regular visits, match by visit ID
              return order.visit === rawVisitData.id;
            }
          });
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
          visitPrescriptions = prescriptions.results.filter((rx: any) => {
            if (isConsultationSession) {
              // For consultation sessions, match by date
              const rxDate = rx.prescribed_at ? new Date(rx.prescribed_at).toISOString().split('T')[0] : '';
              return rxDate === rawVisitData.date;
            } else {
              // For regular visits, match by visit ID
              return rx.visit === rawVisitData.id;
            }
          });
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

      // 7. Lab Results Completed (if any tests have results)
      try {
        if (visitLabOrders && visitLabOrders.length > 0) {
          const completedTests = visitLabOrders.flatMap((order: any) =>
            (order.tests || []).filter((test: any) => test.status === 'results_ready' || test.status === 'verified')
          );
          if (completedTests.length > 0) {
            // Find the latest completion timestamp
            const latestResult = completedTests.reduce((latest: any, test: any) => {
              const testTime = new Date(test.verified_at || test.processed_at || test.updated_at);
              return testTime > new Date(latest.timestamp || '1970-01-01') ? { ...test, timestamp: testTime } : latest;
            }, {});

            journeyEvents.push({
              id: 'lab-results-completed',
              step: step++,
              title: 'Lab Results Completed',
              description: `${completedTests.length} test${completedTests.length !== 1 ? 's' : ''} completed`,
              module: 'Laboratory',
              location: 'Laboratory',
              status: 'completed',
              timestamp: latestResult.timestamp?.toISOString() || latestResult.verified_at || latestResult.processed_at,
              staff: latestResult.verified_by || latestResult.processed_by || 'Lab Technician',
              icon: TestTube,
              color: 'bg-blue-500',
              details: completedTests,
            });
          }
        }
      } catch (err) {
        // Ignore
      }

      // 8. Radiology Reports Completed (if any studies have reports)
      try {
        const radiologyOrders = await radiologyService.getOrders({ patient: rawVisitData.patient.toString() });
        if (radiologyOrders.results && radiologyOrders.results.length > 0) {
          const visitRadiologyOrders = radiologyOrders.results.filter((order: any) => {
            if (isConsultationSession) {
              // For consultation sessions, match by date
              const orderDate = order.ordered_at ? new Date(order.ordered_at).toISOString().split('T')[0] : '';
              return orderDate === rawVisitData.date;
            } else {
              // For regular visits, match by visit ID
              return order.visit === rawVisitData.id;
            }
          });
          if (visitRadiologyOrders.length > 0) {
            const studyCount = visitRadiologyOrders.reduce((count: number, order: any) => count + (order.studies?.length || 0), 0);
            journeyEvents.push({
              id: 'radiology-orders',
              step: step++,
              title: 'Radiology Studies Ordered',
              description: `${studyCount} stud${studyCount !== 1 ? 'ies' : 'y'} ordered`,
              module: 'Radiology',
              location: 'Radiology',
              status: 'completed',
              timestamp: visitRadiologyOrders[0].ordered_at,
              staff: (visitRadiologyOrders[0] as any).doctor_name || (visitRadiologyOrders[0] as any).doctor?.name,
              icon: ScanLine,
              color: 'bg-indigo-500',
              details: visitRadiologyOrders,
            });

            // Check for completed radiology reports
            const completedStudies = visitRadiologyOrders.flatMap((order: any) =>
              (order.studies || []).filter((study: any) => study.status === 'reported' || study.status === 'completed')
            );
            if (completedStudies.length > 0) {
              const latestReport = completedStudies.reduce((latest: any, study: any) => {
                const studyTime = new Date(study.reported_at || study.updated_at);
                return studyTime > new Date(latest.timestamp || '1970-01-01') ? { ...study, timestamp: studyTime } : latest;
              }, {});

              journeyEvents.push({
                id: 'radiology-reports-completed',
                step: step++,
                title: 'Radiology Reports Completed',
                description: `${completedStudies.length} report${completedStudies.length !== 1 ? 's' : ''} completed`,
                module: 'Radiology',
                location: 'Radiology',
                status: 'completed',
                timestamp: latestReport.timestamp?.toISOString() || latestReport.reported_at || latestReport.updated_at,
                staff: latestReport.reported_by || 'Radiologist',
                icon: ScanLine,
                color: 'bg-teal-500',
                details: completedStudies,
              });
            }
          }
        }
      } catch (err) {
        // Ignore
      }

      // 9. Prescriptions Dispensed (if any prescriptions were dispensed)
      try {
        if (visitPrescriptions && visitPrescriptions.length > 0) {
          const dispensedItems = visitPrescriptions.flatMap((rx: any) =>
            (rx.items || rx.medications || []).filter((item: any) => item.status === 'dispensed' || item.dispensed_at)
          );
          if (dispensedItems.length > 0) {
            const latestDispense = dispensedItems.reduce((latest: any, item: any) => {
              const dispenseTime = new Date(item.dispensed_at || item.updated_at);
              return dispenseTime > new Date(latest.timestamp || '1970-01-01') ? { ...item, timestamp: dispenseTime } : latest;
            }, {});

            journeyEvents.push({
              id: 'prescriptions-dispensed',
              step: step++,
              title: 'Prescriptions Dispensed',
              description: `${dispensedItems.length} medication${dispensedItems.length !== 1 ? 's' : ''} dispensed`,
              module: 'Pharmacy',
              location: 'Pharmacy',
              status: 'completed',
              timestamp: latestDispense.timestamp?.toISOString() || latestDispense.dispensed_at || latestDispense.updated_at,
              staff: latestDispense.dispensed_by || 'Pharmacist',
              icon: Pill,
              color: 'bg-emerald-500',
              details: dispensedItems,
            });
          }
        }
      } catch (err) {
        // Ignore
      }

      // 10. Visit Completed (if status is completed)
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
