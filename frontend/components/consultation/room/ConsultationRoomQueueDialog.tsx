"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { RoomQueueDialogEntry } from '@/hooks/use-consultation-room-queue';
import {
  formatRoomDate as formatDate,
  formatRoomTime as formatTime,
  initialsFromQueueDisplayName,
} from '@/lib/consultation/room-helpers';
import { PAUSED_SESSIONS_LIST_PAGE_SIZE } from '@/lib/consultation/room-paused-sessions';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import { getVisitTypeBadgeClass, getVisitTypeLabel } from '@/lib/utils/priority';
import { type ConsultationSession } from '@/lib/services';
import {
  History,
  Loader2,
  Play,
  Stethoscope,
  UserX,
  Users,
} from 'lucide-react';

export type ConsultationRoomQueueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomName?: string;
  tab: 'waiting' | 'paused';
  onTabChange: (tab: 'waiting' | 'paused') => void;
  loading: boolean;
  patients: ConsultationRoomPatient[];
  roomQueueWaitingCount: number;
  roomQueueDialogEntries: RoomQueueDialogEntry[];
  pausedSessionsSorted: ConsultationSession[];
  pausedSessionsTotalCount: number | null;
  pausedSessionsListIncomplete: boolean;
  pausedSessionsUnknownTotal: boolean;
  isStartingSession: boolean;
  isResumingPausedSession: boolean;
  isMarkingLeft: boolean;
  endingPausedSessionId: number | null;
  onQueuePatientAction: (patient: ConsultationRoomPatient) => void;
  onMarkPatientLeft: (patient: ConsultationRoomPatient) => void;
  onResumePausedSession: (session: ConsultationSession) => void;
  onEndPausedSession: (session: ConsultationSession) => void;
};

export function ConsultationRoomQueueDialog({
  open,
  onOpenChange,
  roomName,
  tab,
  onTabChange,
  loading,
  patients,
  roomQueueWaitingCount,
  roomQueueDialogEntries,
  pausedSessionsSorted,
  pausedSessionsTotalCount,
  pausedSessionsListIncomplete,
  pausedSessionsUnknownTotal,
  isStartingSession,
  isResumingPausedSession,
  isMarkingLeft,
  endingPausedSessionId,
  onQueuePatientAction,
  onMarkPatientLeft,
  onResumePausedSession,
  onEndPausedSession,
}: ConsultationRoomQueueDialogProps) {
  const queueBusy = isStartingSession || isResumingPausedSession;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[88vh] overflow-y-auto gap-3 p-5 sm:p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-emerald-500 shrink-0" />
            Queue — {roomName || 'Consultation Room'}
          </DialogTitle>
          <DialogDescription className="text-xs leading-snug">
            Waiting and paused for this room. Tab counts: waiting · paused.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => onTabChange(v as 'waiting' | 'paused')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="waiting" className="text-xs sm:text-sm">
              Waiting ({roomQueueWaitingCount})
            </TabsTrigger>
            <TabsTrigger value="paused" className="text-xs sm:text-sm">
              Paused ({pausedSessionsSorted.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="waiting" className="mt-3 space-y-2 focus-visible:outline-none">
            {!loading && patients.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {roomQueueWaitingCount} waiting
                {roomQueueDialogEntries.some((e) => e.isInConsultation)
                  ? ` · ${roomQueueDialogEntries.filter((e) => e.isInConsultation).length} in consult (queue row not cleared)`
                  : ''}
                . Wait time is from queued at.
              </p>
            )}
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                <p className="text-xs">Loading…</p>
              </div>
            ) : patients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Queue is empty</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[58vh] overflow-y-auto pr-1">
                {roomQueueDialogEntries.map(
                  ({ patient, isInConsultation, waitingPosition, pausedCount }) => {
                    const hasPaused = pausedCount > 0;
                    const waitLabel = isInConsultation
                      ? null
                      : patient.waitTime >= 60
                        ? `${Math.floor(patient.waitTime / 60)}h ${patient.waitTime % 60}m`
                        : `${patient.waitTime}m`;
                    const waitColor =
                      patient.waitTime > 120
                        ? 'text-red-600 dark:text-red-400'
                        : patient.waitTime > 60
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-green-600 dark:text-green-400';

                    return (
                      <div
                        key={patient.id}
                        className={`rounded-md border px-2.5 py-2 transition-colors ${
                          isInConsultation
                            ? 'border-emerald-500/80 bg-emerald-50/80 dark:bg-emerald-900/15'
                            : hasPaused
                              ? 'border-amber-500/60 bg-amber-50/50 dark:bg-amber-900/10'
                              : 'border-border hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-semibold ${
                              isInConsultation ? 'bg-emerald-600' : 'bg-blue-600'
                            }`}
                          >
                            {initialsFromQueueDisplayName(patient.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-sm font-medium truncate max-w-[220px] sm:max-w-none">
                                {patient.name}
                              </span>
                              {isInConsultation && (
                                <Badge
                                  variant="outline"
                                  className="h-4 px-1 text-[10px] bg-emerald-600 text-white border-0"
                                >
                                  In consult
                                </Badge>
                              )}
                              {!isInConsultation && hasPaused && (
                                <Badge
                                  variant="outline"
                                  className="h-4 px-1 text-[10px] bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300"
                                >
                                  Paused
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={`h-4 px-1 text-[10px] ${getVisitTypeBadgeClass(patient.visitType)}`}
                              >
                                {getVisitTypeLabel(patient.visitType)}
                              </Badge>
                              {patient.clinics?.map((clinic, idx) => {
                                const isCompleted = patient.completedClinics?.includes(clinic);
                                return (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className={`h-4 px-1 text-[10px] ${
                                      isCompleted
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                                        : 'bg-blue-500/10 border-blue-500/30 text-blue-600'
                                    }`}
                                  >
                                    {clinic}
                                    {isCompleted ? ' ✓' : ''}
                                  </Badge>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {patient.patientId}
                              <span className="mx-1">·</span>
                              {patient.age}y {patient.gender}
                              {waitLabel != null && (
                                <>
                                  <span className="mx-1">·</span>
                                  <span className={`font-medium ${waitColor}`}>{waitLabel}</span>
                                </>
                              )}
                              {patient.vitals?.temperature && (
                                <>
                                  <span className="mx-1">·</span>
                                  {patient.vitals.temperature}°C
                                </>
                              )}
                              {patient.vitals?.heartRate && (
                                <>
                                  <span className="mx-1">·</span>
                                  {patient.vitals.heartRate} bpm
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <div className="text-right min-w-[2.25rem]">
                              {isInConsultation ? (
                                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  Active
                                </span>
                              ) : (
                                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 leading-none">
                                  #{waitingPosition}
                                </span>
                              )}
                            </div>
                            {!isInConsultation && (
                              <>
                                <Button
                                  size="sm"
                                  className={`h-7 px-2 text-xs shadow-sm ${hasPaused ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                  onClick={() => void onQueuePatientAction(patient)}
                                  disabled={queueBusy}
                                >
                                  {queueBusy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      {hasPaused ? (
                                        <Play className="h-3 w-3 mr-1" />
                                      ) : (
                                        <Stethoscope className="h-3 w-3 mr-1" />
                                      )}
                                      {hasPaused
                                        ? pausedCount > 1
                                          ? 'Choose'
                                          : 'Continue'
                                        : 'Start'}
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => onMarkPatientLeft(patient)}
                                  disabled={isMarkingLeft}
                                  title="Mark left"
                                >
                                  {isMarkingLeft ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <UserX className="h-3 w-3 mr-1" />
                                  )}
                                  Left
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="paused" className="mt-3 space-y-2 focus-visible:outline-none">
            {!loading && pausedSessionsSorted.length > 0 && (
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                <p>
                  {pausedSessionsSorted.length}
                  {pausedSessionsTotalCount != null ? ` of ${pausedSessionsTotalCount}` : ''} paused,
                  oldest first (all providers).
                </p>
                {pausedSessionsListIncomplete && (
                  <p className="text-amber-700 dark:text-amber-400 font-medium">
                    Not all rows shown—contact an administrator for the full list.
                  </p>
                )}
                {!pausedSessionsListIncomplete && pausedSessionsUnknownTotal && (
                  <p>Up to {PAUSED_SESSIONS_LIST_PAGE_SIZE} rows per load.</p>
                )}
              </div>
            )}
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                <p className="text-xs">Loading…</p>
              </div>
            ) : pausedSessionsSorted.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No paused sessions</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[58vh] overflow-y-auto pr-1">
                {pausedSessionsSorted.map((ps) => {
                  const activeSeconds =
                    Number(ps.active_seconds ?? ps.active_duration_seconds ?? 0) || 0;
                  const minutes = Math.floor(activeSeconds / 60);
                  const displayName = ps.patient_name || `Patient #${ps.patient}`;
                  const isEndingThis = endingPausedSessionId === ps.id;

                  return (
                    <div
                      key={ps.id}
                      className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-900/10 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-amber-600 text-white text-xs font-semibold">
                          {initialsFromQueueDisplayName(displayName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-sm font-medium truncate max-w-[220px] sm:max-w-none">
                              {displayName}
                            </span>
                            <Badge
                              variant="outline"
                              className="h-4 px-1 text-[10px] bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300"
                            >
                              Paused
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            #{ps.session_id}
                            <span className="mx-1">·</span>
                            {ps.patient_id || '—'}
                            <span className="mx-1">·</span>
                            {minutes}m active
                            {ps.doctor_name && (
                              <>
                                <span className="mx-1">·</span>
                                {ps.doctor_name}
                              </>
                            )}
                            <span className="mx-1">·</span>
                            {formatDate(ps.started_at)} {formatTime(ps.started_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => onResumePausedSession(ps)}
                            disabled={isResumingPausedSession || endingPausedSessionId != null}
                          >
                            {isResumingPausedSession ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" />
                                Resume
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => onEndPausedSession(ps)}
                            disabled={isResumingPausedSession || endingPausedSessionId != null}
                            title="End consultation"
                          >
                            {isEndingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : 'End'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-1 sm:pt-2">
          <Button type="button" size="sm" variant="default" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
