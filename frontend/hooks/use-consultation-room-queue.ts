import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import { mapQueueItemsToPatients } from '@/lib/consultation/room-queue';
import {
  filterPausedSessionsForPatient,
} from '@/lib/consultation/room-paused-sessions';
import { fetchAllPaginatedResults } from '@/lib/fetch-paginated-results';
import { consultationService, type ConsultationSession } from '@/lib/services';

export type RoomQueueDialogEntry = {
  patient: ConsultationRoomPatient;
  isInConsultation: boolean;
  waitingPosition: number | null;
  pausedSession: ConsultationSession | null;
  pausedCount: number;
};

export function useConsultationRoomQueue(
  roomId: string,
  currentPatient: ConsultationRoomPatient | null,
) {
  const [patients, setPatients] = useState<ConsultationRoomPatient[]>([]);
  const [pausedSessions, setPausedSessions] = useState<ConsultationSession[]>([]);
  const [pausedSessionsTotalCount, setPausedSessionsTotalCount] = useState<number | null>(null);
  const [loadingPausedSessions, setLoadingPausedSessions] = useState(false);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);
  const [showRoomPatientsDialog, setShowRoomPatientsDialog] = useState(false);
  const [roomPatientsDialogTab, setRoomPatientsDialogTab] = useState<'waiting' | 'paused'>('waiting');
  const [loadingRoomPatientsDialog, setLoadingRoomPatientsDialog] = useState(false);

  const loadPausedSessions = useCallback(async () => {
    const numericRoomId = parseInt(roomId, 10);
    if (Number.isNaN(numericRoomId)) return;

    setLoadingPausedSessions(true);
    try {
      const sessions = await fetchAllPaginatedResults((page, pageSize) =>
        consultationService.getSessions({
          room: numericRoomId,
          status: 'paused',
          page,
          page_size: pageSize,
          ordering: 'started_at',
        })
      );
      setPausedSessions(sessions);
      setPausedSessionsTotalCount(sessions.length);
    } catch (err) {
      console.error('Error loading paused sessions:', err);
      setPausedSessions([]);
      setPausedSessionsTotalCount(null);
    } finally {
      setLoadingPausedSessions(false);
    }
  }, [roomId]);

  const pausedSessionsSorted = useMemo(
    () =>
      [...pausedSessions].sort(
        (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
      ),
    [pausedSessions],
  );

  const pausedSessionsListIncomplete = false;

  const pausedSessionsUnknownTotal = false;

  const findPausedSessionsForPatient = useCallback(
    (patient: ConsultationRoomPatient): ConsultationSession[] => {
      const numericRoomId = parseInt(roomId, 10);
      if (!Number.isFinite(numericRoomId)) return [];
      return filterPausedSessionsForPatient(pausedSessions, numericRoomId, patient);
    },
    [roomId, pausedSessions],
  );

  const roomQueueDialogEntries = useMemo((): RoomQueueDialogEntry[] => {
    let waitingPosition = 0;
    return patients.map((patient) => {
      const isInConsultation = currentPatient?.id === patient.id;
      const pausedMatches = findPausedSessionsForPatient(patient);
      if (!isInConsultation) {
        waitingPosition += 1;
      }
      return {
        patient,
        isInConsultation,
        waitingPosition: isInConsultation ? null : waitingPosition,
        pausedSession: pausedMatches.length === 1 ? pausedMatches[0] : null,
        pausedCount: pausedMatches.length,
      };
    });
  }, [patients, currentPatient?.id, findPausedSessionsForPatient]);

  const roomQueueWaitingCount = useMemo(
    () => roomQueueDialogEntries.filter((e) => !e.isInConsultation).length,
    [roomQueueDialogEntries],
  );

  const refreshQueueData = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!silent) setIsRefreshingQueue(true);
      try {
        const numericRoomId = parseInt(roomId, 10);
        if (Number.isNaN(numericRoomId)) return;

        const queueItems = await fetchAllPaginatedResults((page, pageSize) =>
          consultationService.getQueue({
            room: numericRoomId,
            is_active: true,
            page,
            page_size: pageSize,
          })
        );
        setPatients(mapQueueItemsToPatients(queueItems));
        await loadPausedSessions();
      } catch (err) {
        console.error('Error refreshing queue:', err);
        if (!silent) toast.error('Failed to refresh queue');
      } finally {
        if (!silent) setIsRefreshingQueue(false);
      }
    },
    [roomId, loadPausedSessions],
  );

  useEffect(() => {
    if (!showRoomPatientsDialog) return;
    let cancelled = false;
    setLoadingRoomPatientsDialog(true);
    void refreshQueueData({ silent: true }).finally(() => {
      if (!cancelled) setLoadingRoomPatientsDialog(false);
    });
    return () => {
      cancelled = true;
    };
  }, [showRoomPatientsDialog, refreshQueueData]);

  const openRoomPatientsDialog = useCallback((tab: 'waiting' | 'paused' = 'waiting') => {
    setRoomPatientsDialogTab(tab);
    setShowRoomPatientsDialog(true);
  }, []);

  return {
    patients,
    setPatients,
    pausedSessions,
    pausedSessionsSorted,
    pausedSessionsTotalCount,
    pausedSessionsListIncomplete,
    pausedSessionsUnknownTotal,
    loadingPausedSessions,
    isRefreshingQueue,
    showRoomPatientsDialog,
    setShowRoomPatientsDialog,
    roomPatientsDialogTab,
    setRoomPatientsDialogTab,
    loadingRoomPatientsDialog,
    loadPausedSessions,
    refreshQueueData,
    findPausedSessionsForPatient,
    roomQueueDialogEntries,
    roomQueueWaitingCount,
    openRoomPatientsDialog,
  };
}
