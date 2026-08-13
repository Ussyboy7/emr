import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConsultationSession } from '@/lib/services/consultation-service';
import type { PatientAdmission } from '@/lib/services/ward-service';

const mockGetSession = vi.fn();
const mockResolveSessionForVisit = vi.fn();

vi.mock('@/lib/services', () => ({
  consultationService: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
    resolveSessionForVisit: (...args: unknown[]) => mockResolveSessionForVisit(...args),
  },
}));

import { resolveCareSessionAdmissionSession } from './care-session-session-resolver';

const baseAdmission = (overrides: Partial<PatientAdmission> = {}): PatientAdmission => ({
  id: 1,
  admission_id: 'ADM-001',
  patient: 5,
  patient_name: 'Test Patient',
  visit: 7,
  ward: 1,
  ward_name: 'Ward A',
  admission_type: 'observation',
  admission_diagnosis: 'Fever',
  status: 'admitted',
  admission_date: new Date().toISOString(),
  length_of_stay: 0,
  is_active: true,
  ...overrides,
});

describe('resolveCareSessionAdmissionSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the linked consultation_session when present', async () => {
    mockGetSession.mockResolvedValue({ id: 9, session_id: 'CS-9' } as ConsultationSession);
    const session = await resolveCareSessionAdmissionSession(
      baseAdmission({ consultation_session: 9 }),
    );
    expect(session?.id).toBe(9);
    expect(mockGetSession).toHaveBeenCalledWith(9);
    expect(mockResolveSessionForVisit).not.toHaveBeenCalled();
  });

  it('falls back to the latest session for the visit when unlinked', async () => {
    mockResolveSessionForVisit.mockResolvedValue({ id: 4, session_id: 'CS-4' } as ConsultationSession);
    const session = await resolveCareSessionAdmissionSession(baseAdmission({}));
    expect(session?.id).toBe(4);
    expect(mockResolveSessionForVisit).toHaveBeenCalledWith({ visit: 7 });
  });

  it('falls back when the linked session fetch fails', async () => {
    mockGetSession.mockRejectedValue(new Error('boom'));
    mockResolveSessionForVisit.mockResolvedValue({ id: 3, session_id: 'CS-3' } as ConsultationSession);
    const session = await resolveCareSessionAdmissionSession(
      baseAdmission({ consultation_session: 9 }),
    );
    expect(session?.id).toBe(3);
  });

  it('returns null when there is no linked session and no visit', async () => {
    const session = await resolveCareSessionAdmissionSession(
      baseAdmission({ visit: 0 as unknown as number }),
    );
    expect(session).toBeNull();
  });
});