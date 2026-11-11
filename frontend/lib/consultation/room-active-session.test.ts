import { describe, expect, it } from 'vitest';

import { findMyActiveSession } from './room-active-session';
import type { RoomActiveSessionSummary } from './room-presence';

const session = (
  id: number,
  doctorId: number | null,
  patientName = `Patient ${id}`,
): RoomActiveSessionSummary => ({
  id,
  session_id: `CS-${id}`,
  patient_name: patientName,
  doctor_id: doctorId,
});

describe('findMyActiveSession', () => {
  it('returns this doctor session when colleagues are also in consultation', () => {
    const sessions = [session(1, 10, 'Colleague patient'), session(2, 11, 'My patient')];

    expect(findMyActiveSession(sessions, 11)?.id).toBe(2);
  });

  it('does not adopt a colleague session when this doctor has none', () => {
    const sessions = [session(1, 10, 'Colleague patient')];

    expect(findMyActiveSession(sessions, 11)).toBeNull();
  });

  it('returns null when sessions or the current doctor are unknown', () => {
    expect(findMyActiveSession(undefined, 11)).toBeNull();
    expect(findMyActiveSession([session(1, 10)], null)).toBeNull();
  });
});
