"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import type { ConsultationRoom, ConsultationRoomPatient } from '@/lib/consultation/room-types';
import type { PausedDuplicateStartDialogState } from '@/hooks/use-consultation-room-session';
import { formatDisplayDateTime, todayApiDateString } from '@/lib/dates';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  History,
  Loader2,
  Play,
  UserX,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Dispatch, SetStateAction } from 'react';

export type LeftWorkflowTarget =
  | { kind: 'session' }
  | { kind: 'queue'; patient: ConsultationRoomPatient }
  | null;

export type ConsultationRoomSessionDialogsProps = {
  showEndDialog: boolean;
  setShowEndDialog: (open: boolean) => void;
  isEnding: boolean;
  confirmEndSession: () => void | Promise<void>;
  draftObservationCount: number;
  currentPatient: ConsultationRoomPatient | null;
  followUpRequired: boolean;
  setFollowUpRequired: (value: boolean) => void;
  followUpDate: string;
  setFollowUpDate: (value: string) => void;
  followUpReason: string;
  setFollowUpReason: (value: string) => void;
  sessionDuration: number;
  room: ConsultationRoom | null;
  prescriptions: unknown[];
  labOrders: unknown[];
  radiologyOrders: unknown[];
  nursingOrders: unknown[];
  sessionReferrals: unknown[];
  showSwitchPatientDialog: boolean;
  setShowSwitchPatientDialog: (open: boolean) => void;
  pendingSwitchPatient: ConsultationRoomPatient | null;
  setPendingSwitchPatient: (patient: ConsultationRoomPatient | null) => void;
  confirmSwitchPatientStart: () => void | Promise<void>;
  pausedDuplicateStartDialog: PausedDuplicateStartDialogState | null;
  setPausedDuplicateStartDialog: Dispatch<SetStateAction<PausedDuplicateStartDialogState | null>>;
  isEndingPausedForNewStart: boolean;
  isResumingPausedSession: boolean;
  handlePausedDuplicateEndAndStart: () => void | Promise<void>;
  handlePausedDuplicateResume: () => void | Promise<void>;
  showLeftWorkflowDialog: boolean;
  setShowLeftWorkflowDialog: (open: boolean) => void;
  leftWorkflowTarget: LeftWorkflowTarget;
  setLeftWorkflowTarget: (target: LeftWorkflowTarget) => void;
  leftWorkflowReason: string;
  setLeftWorkflowReason: (value: string) => void;
  isMarkingLeft: boolean;
  confirmLeftWorkflowAction: () => void | Promise<void>;
};

export function ConsultationRoomSessionDialogs({
  showEndDialog,
  setShowEndDialog,
  isEnding,
  confirmEndSession,
  draftObservationCount,
  currentPatient,
  followUpRequired,
  setFollowUpRequired,
  followUpDate,
  setFollowUpDate,
  followUpReason,
  setFollowUpReason,
  sessionDuration,
  room,
  prescriptions,
  labOrders,
  radiologyOrders,
  nursingOrders,
  sessionReferrals,
  showSwitchPatientDialog,
  setShowSwitchPatientDialog,
  pendingSwitchPatient,
  setPendingSwitchPatient,
  confirmSwitchPatientStart,
  pausedDuplicateStartDialog,
  setPausedDuplicateStartDialog,
  isEndingPausedForNewStart,
  isResumingPausedSession,
  handlePausedDuplicateEndAndStart,
  handlePausedDuplicateResume,
  showLeftWorkflowDialog,
  setShowLeftWorkflowDialog,
  leftWorkflowTarget,
  setLeftWorkflowTarget,
  leftWorkflowReason,
  setLeftWorkflowReason,
  isMarkingLeft,
  confirmLeftWorkflowAction,
}: ConsultationRoomSessionDialogsProps) {
  return (
    <>
      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent className={MODAL_SIZES.ml}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              End Consultation Session?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end the consultation session with <strong>{currentPatient?.name}</strong>?
              {draftObservationCount > 0
                ? ' The session will be saved, draft observation handoff will be sent to Nursing Observation Queue, and you will return to the room queue.'
                : ' The session data will be saved and you will return to the room queue.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-6 my-6">
            {draftObservationCount > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  This will now hand off the patient to Nursing/Ward observation and complete this consultation session.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center space-x-3 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                <input
                  type="checkbox"
                  id="followUp"
                  checked={followUpRequired}
                  onChange={(e) => setFollowUpRequired(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="followUp" className="text-sm font-medium text-blue-900 dark:text-blue-100 cursor-pointer">
                  Schedule follow-up appointment
                </label>
              </div>

              {followUpRequired && (
                <div className="ml-6 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Follow-up Date</label>
                      <Input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        min={todayApiDateString()}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Reason (optional)</label>
                      <Input
                        value={followUpReason}
                        onChange={(e) => setFollowUpReason(e.target.value)}
                        placeholder="e.g., Review lab results (leave blank to use Follow-up visit)"
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-800">
                    <strong>Note:</strong> Follow-up appointments will be created and can be managed through the Appointments section under Medical Records. They will also be saved in the consultation notes as a backup.
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 p-4 rounded-lg border">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-600" />
                Session Summary
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Patient:</span>
                    <span className="text-sm font-medium">{currentPatient?.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Duration:</span>
                    <span className={`text-sm font-medium ${sessionDuration > 480 ? 'text-orange-600' : sessionDuration > 120 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {(() => {
                        const hours = Math.floor(sessionDuration / 60);
                        const mins = sessionDuration % 60;
                        if (hours > 0) {
                          return `${hours}h ${mins}m`;
                        }
                        return `${mins}m`;
                      })()}
                      {sessionDuration > 480 && <span className="ml-1 text-xs">(Long session)</span>}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Room:</span>
                    <span className="text-sm">{room?.name || 'Unknown'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Prescriptions:</span>
                    <Badge variant={prescriptions.length > 0 ? 'default' : 'secondary'} className="text-xs">
                      {prescriptions.length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Lab Orders:</span>
                    <Badge variant={labOrders.length > 0 ? 'default' : 'secondary'} className="text-xs">
                      {labOrders.length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Radiology:</span>
                    <Badge variant={radiologyOrders.length > 0 ? 'default' : 'secondary'} className="text-xs">
                      {radiologyOrders.length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Nursing:</span>
                    <Badge variant={nursingOrders.length > 0 ? 'default' : 'secondary'} className="text-xs">
                      {nursingOrders.length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Referrals:</span>
                    <Badge variant={sessionReferrals.length > 0 ? 'default' : 'secondary'} className="text-xs">
                      {sessionReferrals.length}
                    </Badge>
                  </div>
                </div>
              </div>

              {followUpRequired && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <div className="text-xs text-muted-foreground">
                    <strong>Follow-up:</strong> {followUpDate} - {followUpReason}
                  </div>
                </div>
              )}
            </div>
          </div>

          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel disabled={isEnding} className="min-w-[100px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEndSession}
              disabled={isEnding}
              className="min-w-[180px] bg-orange-600 hover:bg-orange-700 focus:ring-orange-500"
            >
              {isEnding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ending Session...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {draftObservationCount > 0
                    ? 'End Session & Send to Observation Queue'
                    : 'End Session & Return to Queue'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={showSwitchPatientDialog}
        onOpenChange={(open) => {
          setShowSwitchPatientDialog(open);
          if (!open) {
            setPendingSwitchPatient(null);
          }
        }}
      >
        <DialogContent className={MODAL_SIZES.ml}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-amber-500" />
              Switch Consultation Patient?
            </DialogTitle>
            <DialogDescription>
              You are currently consulting <strong>{currentPatient?.name || 'a patient'}</strong>.
              <br />
              We will pause this session and start/resume consultation with <strong>{pendingSwitchPatient?.name || 'the selected patient'}</strong>.
              <br />
              You can resume the paused session later from <strong>Queue → Paused</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowSwitchPatientDialog(false);
                setPendingSwitchPatient(null);
                toast.info(`Kept current session with ${currentPatient?.name || 'current patient'}`);
              }}
            >
              Keep Current Session
            </Button>
            <Button
              type="button"
              onClick={confirmSwitchPatientStart}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Pause & Switch Patient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pausedDuplicateStartDialog != null}
        onOpenChange={(open) => {
          if (!open && !isEndingPausedForNewStart && !isResumingPausedSession) {
            setPausedDuplicateStartDialog(null);
          }
        }}
      >
        <DialogContent className={MODAL_SIZES.sm2}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-amber-500" />
              Paused consultation already exists
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">
                    {pausedDuplicateStartDialog?.patient.name || 'This patient'}
                  </strong>{' '}
                  already has a paused consultation in this room. Starting again would create a second session and
                  split notes and orders.
                </p>
                {pausedDuplicateStartDialog && pausedDuplicateStartDialog.sessions.length > 0 && (
                  <ul className="list-disc list-inside space-y-1">
                    {pausedDuplicateStartDialog.sessions.map((s) => (
                      <li key={s.id}>
                        <span className="font-mono text-xs">{s.session_id}</span>
                        {s.started_at && (
                          <span className="text-xs"> — started {formatDisplayDateTime(s.started_at)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  <span className="font-medium text-foreground">Resume</span> to continue the same session, or{' '}
                  <span className="font-medium text-foreground">End old &amp; start new</span> to complete the paused
                  session(s) and open a fresh consultation (the visit may be marked completed).
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isEndingPausedForNewStart || isResumingPausedSession}
              onClick={() => setPausedDuplicateStartDialog(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isEndingPausedForNewStart || isResumingPausedSession}
              onClick={() => void handlePausedDuplicateEndAndStart()}
            >
              {isEndingPausedForNewStart ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ending…
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  End old &amp; start new
                </>
              )}
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={isEndingPausedForNewStart || isResumingPausedSession}
              onClick={() => void handlePausedDuplicateResume()}
            >
              {isResumingPausedSession ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resuming…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Resume paused session
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showLeftWorkflowDialog} onOpenChange={setShowLeftWorkflowDialog}>
        <AlertDialogContent className={MODAL_SIZES.sm2}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {leftWorkflowTarget?.kind === 'session' ? 'End as not seen' : 'Mark queue patient as left'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {leftWorkflowTarget?.kind === 'session'
                ? `This will close the consultation for ${currentPatient?.name || 'this patient'} without marking it as completed.`
                : `This will remove ${leftWorkflowTarget?.kind === 'queue' ? leftWorkflowTarget.patient.name : 'this patient'} from the active queue.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="left-workflow-reason">Reason</Label>
            <Textarea
              id="left-workflow-reason"
              value={leftWorkflowReason}
              onChange={(e) => setLeftWorkflowReason(e.target.value)}
              placeholder="Enter reason"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (!isMarkingLeft) {
                  setShowLeftWorkflowDialog(false);
                  setLeftWorkflowTarget(null);
                }
              }}
              disabled={isMarkingLeft}
            >
              Keep Active
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeftWorkflowAction} disabled={isMarkingLeft || !leftWorkflowTarget}>
              {isMarkingLeft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserX className="h-4 w-4 mr-2" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
