import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { consultationService, type ConsultationSession } from '@/lib/services';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';

export const PAUSED_SESSIONS_LIST_PAGE_SIZE = 100;

export function consultationSessionRoomId(s: ConsultationSession): number {
  return typeof s.room === 'object'
    ? Number((s.room as { id?: number }).id)
    : Number(s.room);
}

/** Match paused sessions already loaded for this room/patient (and visit when known). */
export function filterPausedSessionsForPatient(
  sessions: ConsultationSession[],
  roomId: number,
  patient: Pick<ConsultationRoomPatient, 'id' | 'visitId'>,
): ConsultationSession[] {
  const numericPatientId = parseInt(patient.id, 10);
  const numericVisitId = patient.visitId ? parseInt(patient.visitId, 10) : null;
  if (!Number.isFinite(roomId) || !Number.isFinite(numericPatientId)) return [];

  return sessions.filter((s) => {
    const sPatientId =
      typeof s.patient === 'number' ? s.patient : parseInt(String(s.patient), 10);
    if (sPatientId !== numericPatientId) return false;
    const sRoomId = consultationSessionRoomId(s);
    if (!Number.isFinite(sRoomId) || sRoomId !== roomId) return false;
    if (numericVisitId && s.visit) {
      const sVisitId = typeof s.visit === 'number' ? s.visit : parseInt(String(s.visit), 10);
      if (Number.isFinite(sVisitId) && sVisitId !== numericVisitId) return false;
    }
    return true;
  });
}

/** Authoritative paused-session lookup before start/resume (hits API). */
export async function fetchPausedSessionsForPatient(
  roomId: number,
  patient: Pick<ConsultationRoomPatient, 'id' | 'visitId'>,
): Promise<ConsultationSession[]> {
  const numericPatientId = parseInt(patient.id, 10);
  const numericVisitId = patient.visitId ? parseInt(patient.visitId, 10) : null;
  if (!Number.isFinite(roomId) || !Number.isFinite(numericPatientId)) return [];

  let pausedForRoom: ConsultationSession[] = [];
  if (numericVisitId) {
    const resolvedPaused = await consultationService.resolveSessionForVisit({
      visit: numericVisitId,
      patient: numericPatientId,
      status: 'paused',
      ordering: '-started_at',
    });
    if (resolvedPaused) {
      const rid = consultationSessionRoomId(resolvedPaused);
      if (Number.isFinite(rid) && rid === roomId) {
        pausedForRoom = [resolvedPaused];
      }
    }
  }
  if (pausedForRoom.length === 0) {
    const pausedResp = await consultationService.getSessions({
      room: roomId,
      patient: numericPatientId,
      ...(numericVisitId ? { visit: numericVisitId } : {}),
      status: 'paused',
      ordering: '-started_at',
      page_size: MAX_LIST_PAGE_SIZE,
    });
    pausedForRoom = filterPausedSessionsForPatient(pausedResp.results || [], roomId, patient);
  }
  return pausedForRoom;
}
