"use client";

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ConsultationRoomInfo, ConsultationRoomPatient } from '@/lib/consultation/room-types';
import type { ConsultationSession } from '@/lib/services';
import {
  getVisitTypeBadgeClass,
  getVisitTypeLabel,
  isEmergencyVisitType,
} from '@/lib/utils/priority';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Play,
  Stethoscope,
  User,
  Users,
  UserX,
} from 'lucide-react';

export type ConsultationRoomIdleViewProps = {
  room: ConsultationRoomInfo;
  patients: ConsultationRoomPatient[];
  pausedSessionCount: number;
  roomQueueWaitingCount: number;
  isStartingSession: boolean;
  isResumingPausedSession: boolean;
  isMarkingLeft: boolean;
  findPausedSessionsForPatient: (patient: ConsultationRoomPatient) => ConsultationSession[];
  onOpenQueueDialog: (tab?: 'waiting' | 'paused') => void;
  onQueuePatientAction: (patient: ConsultationRoomPatient) => void;
  onMarkPatientLeft: (patient: ConsultationRoomPatient) => void;
};

export function ConsultationRoomIdleView({
  room,
  patients,
  pausedSessionCount,
  roomQueueWaitingCount,
  isStartingSession,
  isResumingPausedSession,
  isMarkingLeft,
  findPausedSessionsForPatient,
  onOpenQueueDialog,
  onQueuePatientAction,
  onMarkPatientLeft,
}: ConsultationRoomIdleViewProps) {
  const router = useRouter();
  const emergencyPatients = patients.filter((p) => isEmergencyVisitType(p.visitType));
  const followUpPatients = patients.filter((p) => (p.visitType || '').replace(/-/g, '_') === 'follow_up');
  const avgWaitTime =
    patients.length > 0
      ? Math.round(patients.reduce((sum, p) => sum + p.waitTime, 0) / patients.length)
      : 0;
  const queueBusy = isStartingSession || isResumingPausedSession;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-lg">
              {room.name.charAt(0)}
            </div>
            {room.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            {joinDisplayParts(['Consultation Room', room.specialtyFocus, room.doctor])}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenQueueDialog('waiting')}
            title={`Waiting: ${roomQueueWaitingCount}, paused: ${pausedSessionCount}`}
          >
            <Users className="mr-2 h-4 w-4" />
            Queue
            {(roomQueueWaitingCount > 0 || pausedSessionCount > 0) && (
              <span className="ml-1.5 tabular-nums text-muted-foreground font-normal text-xs">
                {roomQueueWaitingCount > 0 && `W${roomQueueWaitingCount}`}
                {roomQueueWaitingCount > 0 && pausedSessionCount > 0 && '·'}
                {pausedSessionCount > 0 && `P${pausedSessionCount}`}
              </span>
            )}
          </Button>
          <Button variant="outline" onClick={() => router.push('/consultation/start')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Exit Room
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Patients in Queue</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{patients.length}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Emergency</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{emergencyPatients.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Follow-ups</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{followUpPatients.length}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Wait Time</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{avgWaitTime} min</p>
              </div>
              <Activity className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {patients.length > 0 && (() => {
        const nextPatient = patients[0];
        const nextPaused = findPausedSessionsForPatient(nextPatient);
        const hasPausedNext = nextPaused.length > 0;
        return (
          <Card
            className={`bg-gradient-to-r ${hasPausedNext ? 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800' : 'from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800'}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${hasPausedNext ? 'bg-amber-600' : 'bg-emerald-600'}`}
                  >
                    {hasPausedNext ? <Play className="h-5 w-5" /> : <Stethoscope className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {hasPausedNext ? 'Paused consultation waiting' : 'Ready to consult?'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {hasPausedNext
                        ? `${nextPatient.name} — pick up where you left off`
                        : `${patients.length} patient${patients.length !== 1 ? 's' : ''} waiting for consultation`}
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  onClick={() => void onQueuePatientAction(nextPatient)}
                  disabled={queueBusy}
                  className={`shadow-lg ${hasPausedNext ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {queueBusy
                    ? 'Opening...'
                    : hasPausedNext
                      ? 'Continue with Next Patient'
                      : 'Start with Next Patient'}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Patient Queue</CardTitle>
            <Badge variant="secondary">{patients.length} waiting</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {patients.length > 0 ? (
            <div className="space-y-3">
              {patients.map((patient, index) => {
                const pausedMatches = findPausedSessionsForPatient(patient);
                const hasPaused = pausedMatches.length > 0;
                return (
                  <Card
                    key={patient.id}
                    className={`hover:shadow-lg transition-all cursor-pointer ${hasPaused ? 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10' : isEmergencyVisitType(patient.visitType) ? 'border-l-4 border-l-red-500 bg-red-50 dark:bg-red-900/10' : ''}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="relative shrink-0">
                            <PatientAvatar name={patient.name} photoUrl={patient.photo} size="sm" className="w-10 h-10" />
                            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                              {index + 1}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="font-semibold text-lg">{patient.name}</div>
                              <Badge variant="outline" className={getVisitTypeBadgeClass(patient.visitType)}>
                                {getVisitTypeLabel(patient.visitType)}
                              </Badge>
                              {hasPaused && (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300"
                                >
                                  Paused
                                </Badge>
                              )}
                              {patient.vitalsCompleted && (
                                <Badge
                                  className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400"
                                  variant="outline"
                                >
                                  ✓ Vitals Done
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {patient.age}y, {patient.gender}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Waiting {patient.waitTime} min
                              </span>
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {patient.mrn}
                              </span>
                            </div>
                            {hasPaused && (
                              <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                                Consultation paused — continue to restore notes and orders.
                              </p>
                            )}
                            {patient.allergies.length > 0 && (
                              <div className="mt-2 flex items-center gap-1 text-xs">
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                                <span className="text-red-600 dark:text-red-400 font-medium">
                                  Allergies: {patient.allergies.join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => void onQueuePatientAction(patient)}
                            disabled={queueBusy}
                            className={
                              hasPaused
                                ? 'bg-amber-600 hover:bg-amber-700 shadow-md'
                                : 'bg-emerald-600 hover:bg-emerald-700 shadow-md'
                            }
                          >
                            {hasPaused ? (
                              <Play className="mr-2 h-4 w-4" />
                            ) : (
                              <Stethoscope className="mr-2 h-4 w-4" />
                            )}
                            {queueBusy
                              ? 'Opening...'
                              : hasPaused
                                ? pausedMatches.length > 1
                                  ? 'Choose Session'
                                  : 'Continue Session'
                                : 'Start Session'}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onMarkPatientLeft(patient)}
                            disabled={isMarkingLeft}
                            title="Mark Left"
                          >
                            {isMarkingLeft ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <UserX className="h-4 w-4 mr-1" />
                            )}
                            Mark Left
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="text-xl font-medium mb-2">No Patients Waiting</div>
              <div className="text-sm text-muted-foreground mb-4">
                Your queue is empty. Patients will appear here when sent from nursing.
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <CheckCircle className="h-4 w-4" />
                <span>Room ready for new patients</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              Today&apos;s Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span className="text-sm text-muted-foreground">Consultations Completed</span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {room.totalConsultationsToday}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <span className="text-sm text-muted-foreground">Average Consultation Time</span>
              <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {room.averageConsultationTime} min
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-emerald-600" />
              Room Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <span className="text-sm text-muted-foreground">Doctor</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {room.doctor || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
              <span className="text-sm text-muted-foreground">Specialty</span>
              <span className="text-sm font-bold text-teal-600 dark:text-teal-400">
                {room.specialtyFocus || 'General'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
