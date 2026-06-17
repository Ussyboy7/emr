// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/consultation/room-paused-sessions', () => ({
  fetchPausedSessionsForPatient: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/lib/consultation/room-session-restore', () => ({
  restoreConsultationRoomSession: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/lib/utils/priority', () => ({
  getVisitTypeLabel: vi.fn((t: string) => t),
}));

vi.mock('@/lib/services', () => ({
  consultationService: {
    pauseSession: vi.fn(() => Promise.resolve({})),
    resumeSession: vi.fn(() => Promise.resolve({})),
    endSession: vi.fn(() => Promise.resolve({})),
    getSessions: vi.fn(() => Promise.resolve({ results: [] })),
  },
  patientService: {
    buildConsultationPatient: vi.fn(() => Promise.resolve({ id: '1', name: 'Test Patient' })),
  },
}));

import { useConsultationRoomSession } from './use-consultation-room-session';

const createBaseArgs = () => ({
  roomId: '1',
  loading: false,
  currentPatient: null,
  setCurrentPatient: vi.fn(),
  setActiveTab: vi.fn(),
  clearSessionWorkspace: vi.fn(),
  setMedicalNotes: vi.fn(),
  setSelectedSession: vi.fn(),
  setDiagnoses: vi.fn(),
  setPrescriptions: vi.fn(),
  setLabOrders: vi.fn(),
  setNursingOrders: vi.fn(),
  setRadiologyOrders: vi.fn(),
  setPhysioOrders: vi.fn(),
  applyPatientOverview: vi.fn(),
  loadPatientOverview: vi.fn(),
  loadPausedSessions: vi.fn(() => Promise.resolve()),
  refreshQueueData: vi.fn(() => Promise.resolve()),
  showRoomPatientsDialog: false,
  setShowRoomPatientsDialog: vi.fn(),
  pausedSessionsCount: 0,
  resetFollowUpFields: vi.fn(),
});

describe('useConsultationRoomSession', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns initial state with session inactive', () => {
    const { result } = renderHook(() => useConsultationRoomSession(createBaseArgs()));
    expect(result.current.sessionActive).toBe(false);
    expect(result.current.sessionId).toBeNull();
    expect(result.current.sessionDuration).toBe(0);
    expect(result.current.isStartingSession).toBe(false);
  });

  it('clearSessionState resets session timing and patient', () => {
    const args = createBaseArgs();
    const { result } = renderHook(() => useConsultationRoomSession(args));
    act(() => { result.current.clearSessionState(); });
    expect(args.setCurrentPatient).toHaveBeenCalledWith(null);
    expect(args.clearSessionWorkspace).toHaveBeenCalled();
  });

  it('resetSessionTiming sets all timing to defaults', () => {
    const { result } = renderHook(() => useConsultationRoomSession(createBaseArgs()));
    act(() => { result.current.resetSessionTiming(); });
    expect(result.current.sessionActive).toBe(false);
    expect(result.current.sessionId).toBeNull();
    expect(result.current.sessionDuration).toBe(0);
  });
});
