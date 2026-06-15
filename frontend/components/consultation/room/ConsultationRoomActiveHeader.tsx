"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import type {
  ConsultationRoomInfo,
  ConsultationRoomPatient,
  WardAdmissionRow,
} from '@/lib/consultation/room-types';
import { getVisitServiceClinicsList } from '@/lib/utils/clinic-utils';
import { getVisitTypeBadgeClass, getVisitTypeLabel } from '@/lib/utils/priority';
import {
  AlertTriangle,
  Building2,
  Clock,
  Loader2,
  MapPin,
  UserX,
  Users,
} from 'lucide-react';
import { ConsultationRoomVitalsCard } from './ConsultationRoomVitalsCard';

export type ConsultationRoomActiveHeaderProps = {
  room: ConsultationRoomInfo;
  patient: ConsultationRoomPatient;
  sessionDuration: number;
  roomQueueWaitingCount: number;
  pausedSessionCount: number;
  isMarkingLeft: boolean;
  wardAdmissions: WardAdmissionRow[];
  onOpenQueueDialog: () => void;
  onEndSessionNotSeen: () => void;
  onShowEndDialog: () => void;
  onShowDischargeDialog: () => void;
};

export function ConsultationRoomActiveHeader({
  room,
  patient,
  sessionDuration,
  roomQueueWaitingCount,
  pausedSessionCount,
  isMarkingLeft,
  wardAdmissions,
  onOpenQueueDialog,
  onEndSessionNotSeen,
  onShowEndDialog,
  onShowDischargeDialog,
}: ConsultationRoomActiveHeaderProps) {
  const patientRecord = patient as ConsultationRoomPatient & {
    ageDisplay?: string;
    age_display?: string;
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0 space-y-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Consultation Session</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {room.name}
                  {room.clinic ? ` • ${room.clinic}` : ''}
                  {room.doctor ? ` • ${room.doctor}` : ''}
                </span>
              </span>
              <span className="hidden text-border sm:inline" aria-hidden>
                |
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{sessionDuration} min</span>
              </span>
              <Badge
                variant="outline"
                className="h-6 border-emerald-500/30 bg-emerald-500/10 px-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              >
                Session active
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenQueueDialog}
              title={`Waiting: ${roomQueueWaitingCount}, paused: ${pausedSessionCount}`}
            >
              <Users className="mr-2 h-4 w-4" />
              Queue
              {(roomQueueWaitingCount > 0 || pausedSessionCount > 0) && (
                <span className="ml-1.5 tabular-nums text-xs font-normal text-muted-foreground">
                  {roomQueueWaitingCount > 0 && `W${roomQueueWaitingCount}`}
                  {roomQueueWaitingCount > 0 && pausedSessionCount > 0 && '·'}
                  {pausedSessionCount > 0 && `P${pausedSessionCount}`}
                </span>
              )}
            </Button>
            <Button variant="secondary" size="sm" onClick={onEndSessionNotSeen} disabled={isMarkingLeft}>
              {isMarkingLeft ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserX className="mr-2 h-4 w-4" />
              )}
              Not seen
            </Button>
            <Button variant="destructive" size="sm" onClick={onShowEndDialog}>
              End session
            </Button>
          </div>
        </div>

        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <PatientAvatar
              name={patient.name}
              photoUrl={patient.photo || null}
              size="lg"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold leading-tight">{patient.name}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {patient.visitType && (
                      <Badge
                        variant="outline"
                        className={`h-6 px-2 text-xs font-medium ${getVisitTypeBadgeClass(patient.visitType)}`}
                      >
                        {getVisitTypeLabel(patient.visitType)}
                      </Badge>
                    )}
                    {getVisitServiceClinicsList({
                      clinic: patient.visitClinic,
                      clinics: patient.clinics,
                    }).map((clinic) => {
                      const isCompleted = patient.completedClinics?.includes(clinic);
                      return (
                        <Badge
                          key={clinic}
                          variant="outline"
                          className={`h-6 px-2 text-xs font-medium ${
                            isCompleted
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                          }`}
                        >
                          {clinic}
                          {isCompleted ? ' ✓' : ''}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                {wardAdmissions.some((admission) => admission.status === 'admitted') && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className="h-6 border-blue-500/30 bg-blue-500/10 px-2 text-xs font-medium text-blue-700 dark:text-blue-400"
                    >
                      <Building2 className="mr-1 h-3 w-3" />
                      Admitted
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={onShowDischargeDialog}
                    >
                      <UserX className="mr-1 h-3 w-3" />
                      Discharge
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-3 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Patient ID</p>
                  <p className="text-sm font-medium">{patient.patientId || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Age</p>
                  <p className="text-sm font-medium">
                    {patientRecord.ageDisplay ||
                      patientRecord.age_display ||
                      (patient.age != null ? `${patient.age} years` : '—')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gender</p>
                  <p className="text-sm font-medium">{patient.gender || '—'}</p>
                </div>
                {patient.bloodGroup ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Blood group</p>
                    <p className="text-sm font-medium">{patient.bloodGroup}</p>
                  </div>
                ) : null}
                {patient.genotype ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Genotype</p>
                    <p className="text-sm font-medium">{patient.genotype}</p>
                  </div>
                ) : null}
                {patient.division ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Division</p>
                    <p className="text-sm font-medium">{patient.division}</p>
                  </div>
                ) : null}
                {patient.location ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium">{patient.location}</p>
                  </div>
                ) : null}
                {patient.employeeType ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Employee type</p>
                    <p className="text-sm font-medium">{patient.employeeType}</p>
                  </div>
                ) : null}
                {patient.occupation ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Occupation</p>
                    <p className="text-sm font-medium">{patient.occupation}</p>
                  </div>
                ) : null}
                {patient.religion ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Religion</p>
                    <p className="text-sm font-medium">{patient.religion}</p>
                  </div>
                ) : null}
                {patient.tribe ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Tribe</p>
                    <p className="text-sm font-medium">{patient.tribe}</p>
                  </div>
                ) : null}
                {patient.phone ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium break-all">{patient.phone}</p>
                  </div>
                ) : null}
                {patient.email ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium break-all">{patient.email}</p>
                  </div>
                ) : null}
              </div>

              {patient.allergies.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                  <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide opacity-80">Allergies</p>
                      <p className="font-medium">{patient.allergies.join(', ')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {patient.vitals ? <ConsultationRoomVitalsCard vitals={patient.vitals} /> : null}
    </>
  );
}
