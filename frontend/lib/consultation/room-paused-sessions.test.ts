import { describe, expect, it } from 'vitest';
import {
  consultationSessionRoomId,
  filterPausedSessionsForPatient,
} from './room-paused-sessions';
import type { ConsultationSession } from '@/lib/services';

function session(partial: Partial<ConsultationSession> & { id: number }): ConsultationSession {
  return partial as ConsultationSession;
}

describe('room-paused-sessions', () => {
  it('consultationSessionRoomId resolves object or numeric room', () => {
    expect(consultationSessionRoomId(session({ id: 1, room: 5 }))).toBe(5);
    expect(consultationSessionRoomId(session({ id: 1, room: { id: 7 } as never }))).toBe(7);
  });

  it('filterPausedSessionsForPatient matches room and patient', () => {
    const sessions = [
      session({ id: 1, patient: 10, room: 2, visit: 100, status: 'paused' }),
      session({ id: 2, patient: 11, room: 2, visit: 101, status: 'paused' }),
      session({ id: 3, patient: 10, room: 3, visit: 100, status: 'paused' }),
    ];
    const filtered = filterPausedSessionsForPatient(sessions, 2, {
      id: '10',
      visitId: '100',
    });
    expect(filtered.map((s) => s.id)).toEqual([1]);
  });

  it('filterPausedSessionsForPatient returns empty for invalid ids', () => {
    expect(
      filterPausedSessionsForPatient([], Number.NaN, { id: '10', visitId: '1' }),
    ).toEqual([]);
    expect(
      filterPausedSessionsForPatient([], 2, { id: 'not-a-number', visitId: '1' }),
    ).toEqual([]);
  });
});
