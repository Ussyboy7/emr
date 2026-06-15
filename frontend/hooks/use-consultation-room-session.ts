import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import { fetchPausedSessionsForPatient } from '@/lib/consultation/room-paused-sessions';
import {
  restoreConsultationRoomSession,
  type RoomSessionRestoreWorkspace,
  type SessionMedicalNotes,
  type SessionTimingState,
} from '@/lib/consultation/room-session-restore';
import type { ClinicalOverviewPayload } from '@/lib/clinical-overview-utils';
import {
  consultationService,
  patientService,
  type ConsultationSession,
  type Diagnosis,
} from '@/lib/services';
import { getVisitTypeLabel } from '@/lib/utils/priority';

export type PausedDuplicateStartDialogState = {
  patient: ConsultationRoomPatient;
  sessions: ConsultationSession[];
  confirmSwitch: boolean;
};

export type UseConsultationRoomSessionArgs = {
  roomId: string;
  loading: boolean;
  currentPatient: ConsultationRoomPatient | null;
  setCurrentPatient: React.Dispatch<React.SetStateAction<ConsultationRoomPatient | null>>;
  setActiveTab: (tab: string) => void;
  clearSessionWorkspace: () => void;
  setMedicalNotes: React.Dispatch<React.SetStateAction<SessionMedicalNotes>>;
  setSelectedSession: (session: unknown) => void;
  setDiagnoses: React.Dispatch<React.SetStateAction<Diagnosis[]>>;
  setPrescriptions: (prescriptions: any[]) => void;
  setLabOrders: (orders: any[]) => void;
  setNursingOrders: (orders: any[]) => void;
  setRadiologyOrders: (orders: any[]) => void;
  setPhysioOrders: (orders: any[]) => void;
  applyPatientOverview: (overview: ClinicalOverviewPayload) => void;
  loadPatientOverview: (patientId: number) => void;
  loadPausedSessions: () => Promise<void>;
  refreshQueueData: (options?: { silent?: boolean }) => Promise<void>;
  showRoomPatientsDialog: boolean;
  setShowRoomPatientsDialog: (open: boolean) => void;
  pausedSessionsCount: number;
  resetFollowUpFields: () => void;
};

export function useConsultationRoomSession({
  roomId,
  loading,
  currentPatient,
  setCurrentPatient,
  setActiveTab,
  clearSessionWorkspace,
  setMedicalNotes,
  setSelectedSession,
  setDiagnoses,
  setPrescriptions,
  setLabOrders,
  setNursingOrders,
  setRadiologyOrders,
  setPhysioOrders,
  applyPatientOverview,
  loadPatientOverview,
  loadPausedSessions,
  refreshQueueData,
  showRoomPatientsDialog,
  setShowRoomPatientsDialog,
  pausedSessionsCount,
  resetFollowUpFields,
}: UseConsultationRoomSessionArgs) {
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionBaseActiveSeconds, setSessionBaseActiveSeconds] = useState(0);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const isStartingSessionRef = useRef(false);
  const [isResumingPausedSession, setIsResumingPausedSession] = useState(false);
  const [endingPausedSessionId, setEndingPausedSessionId] = useState<number | null>(null);
  const [pausedDuplicateStartDialog, setPausedDuplicateStartDialog] =
    useState<PausedDuplicateStartDialogState | null>(null);
  const [isEndingPausedForNewStart, setIsEndingPausedForNewStart] = useState(false);
  const [showSwitchPatientDialog, setShowSwitchPatientDialog] = useState(false);
  const [pendingSwitchPatient, setPendingSwitchPatient] = useState<ConsultationRoomPatient | null>(
    null,
  );
  const pausedHintShownRef = useRef(false);

  const applySessionTiming = useCallback((timing: SessionTimingState) => {
    setSessionId(timing.sessionId);
    setSessionBaseActiveSeconds(timing.sessionBaseActiveSeconds);
    setSessionStartTime(timing.sessionStartTime);
    setSessionDuration(timing.sessionDuration);
  }, []);

  const resetSessionTiming = useCallback(() => {
    setSessionActive(false);
    setSessionId(null);
    setSessionStartTime(null);
    setSessionBaseActiveSeconds(0);
    setSessionDuration(0);
  }, []);

  const clearSessionState = useCallback(() => {
    resetSessionTiming();
    setCurrentPatient(null);
    clearSessionWorkspace();
  }, [clearSessionWorkspace, resetSessionTiming, setCurrentPatient]);

  const restoreWorkspace = useCallback(
    (): RoomSessionRestoreWorkspace => ({
      clearSessionState,
      setCurrentPatient,
      setActiveTab,
      setSessionActive,
      applySessionTiming,
      setMedicalNotes,
      setSelectedSession,
      setDiagnoses,
      setPrescriptions,
      setLabOrders,
      setNursingOrders,
      setRadiologyOrders,
      setPhysioOrders,
      applyPatientOverview,
      loadPatientOverview,
    }),
    [
      applyPatientOverview,
      applySessionTiming,
      clearSessionState,
      loadPatientOverview,
      setActiveTab,
      setCurrentPatient,
      setDiagnoses,
      setLabOrders,
      setMedicalNotes,
      setNursingOrders,
      setPhysioOrders,
      setPrescriptions,
      setRadiologyOrders,
      setSelectedSession,
    ],
  );

  const restoreActiveSession = useCallback(
    async (targetSessionId: number, options: { silent?: boolean; minimal?: boolean } = {}) => {
      return restoreConsultationRoomSession(roomId, targetSessionId, restoreWorkspace(), options);
    },
    [restoreWorkspace, roomId],
  );

  const handleResumePausedSession = useCallback(
    async (pausedSession: ConsultationSession) => {
      if (!pausedSession?.id || isResumingPausedSession || endingPausedSessionId != null) return;
      setIsResumingPausedSession(true);
      try {
        if (sessionActive && sessionId && sessionId !== pausedSession.id) {
          await consultationService.pauseSession(sessionId);
        }
        await consultationService.resumeSession(pausedSession.id);
        const restored =
          (await restoreActiveSession(pausedSession.id, { minimal: true })) ?? false;
        if (!restored) {
          throw new Error('Session resumed but could not be restored. Please retry.');
        }
        await loadPausedSessions();
        setShowRoomPatientsDialog(false);
        toast.success(`Resumed session with ${pausedSession.patient_name || 'patient'}`);
      } catch (err: unknown) {
        console.error('Error resuming paused session:', err);
        const message = err instanceof Error ? err.message : 'Failed to resume paused session';
        toast.error(message);
      } finally {
        setIsResumingPausedSession(false);
      }
    },
    [
      endingPausedSessionId,
      isResumingPausedSession,
      loadPausedSessions,
      restoreActiveSession,
      sessionActive,
      sessionId,
      setShowRoomPatientsDialog,
    ],
  );

  const handlePausedSessionBeforeStart = useCallback(
    async (patient: ConsultationRoomPatient, confirmSwitch: boolean): Promise<boolean> => {
      const numericRoomId = parseInt(roomId, 10);
      if (!Number.isFinite(numericRoomId)) return false;
      try {
        const pausedForRoom = await fetchPausedSessionsForPatient(numericRoomId, patient);
        if (pausedForRoom.length === 0) return false;
        if (pausedForRoom.length === 1) {
          await handleResumePausedSession(pausedForRoom[0]);
          return true;
        }
        setPausedDuplicateStartDialog({
          patient,
          sessions: pausedForRoom,
          confirmSwitch,
        });
        return true;
      } catch (pausedCheckErr) {
        console.error('Error checking for paused sessions:', pausedCheckErr);
        toast.error('Could not check paused consultations. Try again.');
        return true;
      }
    },
    [handleResumePausedSession, roomId],
  );

  const handleStartSession = useCallback(
    async (
      patient: ConsultationRoomPatient,
      confirmSwitch = false,
      startOpts?: { skipPausedDuplicateCheck?: boolean },
    ) => {
      if (isStartingSessionRef.current) return;
      isStartingSessionRef.current = true;
      setIsStartingSession(true);
      try {
        if (sessionActive && sessionId) {
          const isSamePatient = currentPatient?.id === patient.id;
          if (isSamePatient) {
            toast.info(`Continuing active session with ${patient.name}`);
            return;
          }

          if (!confirmSwitch) {
            setPendingSwitchPatient(patient);
            const openSwitchDialog = () => setShowSwitchPatientDialog(true);
            if (showRoomPatientsDialog) {
              setShowRoomPatientsDialog(false);
              if (typeof window !== 'undefined') {
                window.setTimeout(openSwitchDialog, 0);
              } else {
                openSwitchDialog();
              }
            } else {
              openSwitchDialog();
            }
            return;
          }

          try {
            await consultationService.pauseSession(sessionId);
            await loadPausedSessions();
          } catch (endErr) {
            console.warn('Error pausing previous session:', endErr);
          }
        }

        const numericRoomId = parseInt(roomId, 10);
        const numericPatientId = parseInt(patient.id, 10);
        const numericVisitId = patient.visitId ? parseInt(patient.visitId, 10) : null;

        if (Number.isNaN(numericRoomId) || Number.isNaN(numericPatientId)) {
          toast.error('Invalid room or patient ID');
          console.error('Room ID:', numericRoomId, 'Patient ID:', numericPatientId);
          return;
        }

        try {
          const existingSessions = await consultationService.getSessions({
            visit: numericVisitId || undefined,
            patient: numericPatientId,
            room: numericRoomId,
            status: 'active',
          });

          if (existingSessions.results && existingSessions.results.length > 0) {
            const existingSession = existingSessions.results[0];
            const restored = await restoreActiveSession(existingSession.id, { minimal: true });
            await loadPausedSessions();
            if (restored) {
              toast.success(`Resumed existing active session with ${patient.name}`);
              return;
            }
            toast.error(
              'Could not resume this consultation in the current room. Refresh the page and try again.',
            );
            return;
          }
        } catch (checkError) {
          console.error('Error checking for existing sessions:', checkError);
          toast.error('Could not verify consultation status. Try again.');
          return;
        }

        if (!startOpts?.skipPausedDuplicateCheck) {
          if (await handlePausedSessionBeforeStart(patient, confirmSwitch)) return;
        }

        const sessionData = await apiFetch<{
          id: number;
          resumed?: boolean;
          started_at?: string;
        }>('/consultation/sessions/', {
          method: 'POST',
          body: JSON.stringify({
            room: numericRoomId,
            patient: numericPatientId,
            visit: numericVisitId,
            status: 'active',
          }),
        });

        if (sessionData?.resumed) {
          const restored = await restoreActiveSession(sessionData.id, { minimal: true });
          await loadPausedSessions();
          if (restored) {
            toast.success(`Resumed active session with ${patient.name}`);
            return;
          }
          toast.error(
            'Could not open this consultation. Refresh the page and try again. If another room still shows this visit active, open that room or ask an administrator.',
          );
          return;
        }

        const enrichedPatient = (await patientService.buildConsultationPatient(numericPatientId, {
          visitId: numericVisitId,
          queueItemId: patient.queueItemId,
          waitTime: patient.waitTime,
          priority: getVisitTypeLabel(patient.visitType),
          vitalsCompleted: patient.vitalsCompleted,
          queuePosition: patient.queuePosition,
          visitDate: patient.visitDate,
          visitTime: patient.visitTime,
          visitType: patient.visitType,
          clinics: patient.clinics,
          completedClinics: patient.completedClinics,
          visitClinic: patient.visitClinic,
          vitals: patient.vitals,
        })) as unknown as ConsultationRoomPatient;

        setCurrentPatient(enrichedPatient);
        if (enrichedPatient.visitType === 'annual_checkup') {
          setActiveTab('annual_checkup');
        }
        setSessionActive(true);
        setSessionId(sessionData.id);
        setSessionBaseActiveSeconds(0);
        setSessionStartTime(sessionData.started_at ? new Date(sessionData.started_at) : new Date());
        setSessionDuration(0);

        const patientHistoryId = parseInt(patient.id, 10);
        if (!Number.isNaN(patientHistoryId)) {
          void loadPatientOverview(patientHistoryId);
        }

        setMedicalNotes({
          presentationComplaint: '',
          historyOfPresentIllness: '',
          physicalExamination: '',
          assessment: '',
          plan: '',
        });
        setDiagnoses([]);
        setPrescriptions([]);
        setLabOrders([]);
        setNursingOrders([]);
        setRadiologyOrders([]);
        resetFollowUpFields();

        toast.success(`Session started with ${patient.name}`);
      } catch (err: unknown) {
        console.error('Error starting session:', err);
        const message = err instanceof Error ? err.message : 'Failed to start consultation session';
        toast.error(message);
      } finally {
        isStartingSessionRef.current = false;
        setIsStartingSession(false);
      }
    },
    [
      currentPatient?.id,
      handlePausedSessionBeforeStart,
      loadPausedSessions,
      loadPatientOverview,
      restoreActiveSession,
      roomId,
      sessionActive,
      sessionId,
      setActiveTab,
      setCurrentPatient,
      setDiagnoses,
      setLabOrders,
      setMedicalNotes,
      setNursingOrders,
      setPrescriptions,
      setRadiologyOrders,
      showRoomPatientsDialog,
      setShowRoomPatientsDialog,
      resetFollowUpFields,
    ],
  );

  const confirmSwitchPatientStart = useCallback(async () => {
    const targetPatient = pendingSwitchPatient;
    setShowSwitchPatientDialog(false);
    setPendingSwitchPatient(null);
    if (!targetPatient) return;
    await handleStartSession(targetPatient, true);
  }, [handleStartSession, pendingSwitchPatient]);

  const handleQueuePatientAction = useCallback(
    async (patient: ConsultationRoomPatient) => {
      if (await handlePausedSessionBeforeStart(patient, false)) return;
      await handleStartSession(patient, false, { skipPausedDuplicateCheck: true });
    },
    [handlePausedSessionBeforeStart, handleStartSession],
  );

  const handleEndPausedSession = useCallback(
    async (pausedSession: ConsultationSession) => {
      if (!pausedSession?.id || isResumingPausedSession || endingPausedSessionId != null) return;
      const label = pausedSession.patient_name || `session ${pausedSession.session_id}`;
      if (
        !window.confirm(
          `End consultation for ${label}?\n\nThis marks the session as completed and removes it from the Paused tab. If a visit is linked, it may be marked completed too.`,
        )
      ) {
        return;
      }
      setEndingPausedSessionId(pausedSession.id);
      try {
        await consultationService.endSession(pausedSession.id);
        if (sessionId === pausedSession.id) {
          resetSessionTiming();
          setCurrentPatient(null);
        }
        await loadPausedSessions();
        await refreshQueueData({ silent: true });
        toast.success(`Ended session for ${label}`);
      } catch (err: unknown) {
        console.error('Error ending paused session:', err);
        const message = err instanceof Error ? err.message : 'Failed to end session';
        toast.error(message);
      } finally {
        setEndingPausedSessionId(null);
      }
    },
    [
      endingPausedSessionId,
      isResumingPausedSession,
      loadPausedSessions,
      refreshQueueData,
      resetSessionTiming,
      sessionId,
      setCurrentPatient,
    ],
  );

  const handlePausedDuplicateResume = useCallback(async () => {
    const ctx = pausedDuplicateStartDialog;
    if (!ctx?.sessions?.[0]) return;
    const toResume = ctx.sessions[0];
    await handleResumePausedSession(toResume);
    setPausedDuplicateStartDialog(null);
  }, [handleResumePausedSession, pausedDuplicateStartDialog]);

  const handlePausedDuplicateEndAndStart = useCallback(async () => {
    const ctx = pausedDuplicateStartDialog;
    if (!ctx?.sessions?.length) return;
    setIsEndingPausedForNewStart(true);
    try {
      for (const s of ctx.sessions) {
        await consultationService.endSession(s.id);
        if (sessionId === s.id) {
          clearSessionState();
        }
      }
      await loadPausedSessions();
      await refreshQueueData({ silent: true });
      const { patient, confirmSwitch } = ctx;
      setPausedDuplicateStartDialog(null);
      await handleStartSession(patient, confirmSwitch, { skipPausedDuplicateCheck: true });
    } catch (err: unknown) {
      console.error('End paused & start new failed:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Could not end paused session(s). Try Queue → Paused or try again.';
      toast.error(message);
    } finally {
      setIsEndingPausedForNewStart(false);
    }
  }, [
    clearSessionState,
    handleStartSession,
    loadPausedSessions,
    pausedDuplicateStartDialog,
    refreshQueueData,
    sessionId,
  ]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sessionActive) {
        e.preventDefault();
        e.returnValue = 'You have an active consultation session. Are you sure you want to leave?';
      }
    };

    const handlePopState = () => {
      if (sessionActive) {
        const confirmLeave = window.confirm(
          'You have an active consultation session. Navigating away will pause the session. Continue?',
        );
        if (!confirmLeave) {
          window.history.pushState(null, '', `/consultation/room/${roomId}`);
          return;
        }
        if (sessionId) {
          consultationService.pauseSession(sessionId).catch(console.error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [sessionActive, sessionId, roomId]);

  useEffect(() => {
    pausedHintShownRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (loading || sessionActive || currentPatient) return;
    if (pausedSessionsCount === 0 || pausedHintShownRef.current) return;
    pausedHintShownRef.current = true;
    toast.info(
      pausedSessionsCount === 1
        ? 'You have a paused consultation — use Continue on the queue card or open Queue → Paused.'
        : `${pausedSessionsCount} paused consultations — open Queue to continue.`,
      { duration: 6000 },
    );
  }, [loading, sessionActive, currentPatient, pausedSessionsCount]);

  useEffect(() => {
    if (!sessionActive || !sessionStartTime) return;
    const interval = setInterval(() => {
      const now = new Date();
      const elapsedSinceResume = Math.max(
        0,
        Math.floor((now.getTime() - sessionStartTime.getTime()) / 1000),
      );
      const minutes = Math.floor((sessionBaseActiveSeconds + elapsedSinceResume) / 60);
      setSessionDuration(minutes);
    }, 60000);
    return () => clearInterval(interval);
  }, [sessionActive, sessionStartTime, sessionBaseActiveSeconds]);

  return {
    sessionActive,
    setSessionActive,
    sessionId,
    setSessionId,
    sessionStartTime,
    setSessionStartTime,
    sessionBaseActiveSeconds,
    setSessionBaseActiveSeconds,
    sessionDuration,
    setSessionDuration,
    isStartingSession,
    isResumingPausedSession,
    endingPausedSessionId,
    pausedDuplicateStartDialog,
    setPausedDuplicateStartDialog,
    isEndingPausedForNewStart,
    showSwitchPatientDialog,
    setShowSwitchPatientDialog,
    pendingSwitchPatient,
    setPendingSwitchPatient,
    clearSessionState,
    resetSessionTiming,
    restoreActiveSession,
    handleResumePausedSession,
    handlePausedSessionBeforeStart,
    handleStartSession,
    confirmSwitchPatientStart,
    handleQueuePatientAction,
    handleEndPausedSession,
    handlePausedDuplicateResume,
    handlePausedDuplicateEndAndStart,
  };
}
