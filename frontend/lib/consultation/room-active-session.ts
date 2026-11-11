import type { RoomActiveSessionSummary } from './room-presence';

/**
 * The active consultation belonging to this doctor, if any.
 *
 * A shared room reports every doctor's session in `active_sessions`, and the
 * legacy `active_session` field is merely "first active session in the room".
 * Restoring that room-level fallback would make the second doctor adopt a
 * colleague's consultation — showing their patient, and pausing their session
 * when the doctor starts a patient of their own.
 */
export function findMyActiveSession(
  sessions: RoomActiveSessionSummary[] | null | undefined,
  doctorId: number | null | undefined,
): RoomActiveSessionSummary | null {
  if (!doctorId || !sessions?.length) return null;
  return sessions.find((session) => session.doctor_id === doctorId) ?? null;
}
