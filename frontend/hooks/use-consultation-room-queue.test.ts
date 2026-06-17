// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/consultation/room-queue', () => ({
  mapQueueItemsToPatients: vi.fn((items: any[]) => items),
}));
vi.mock('@/lib/consultation/room-paused-sessions', () => ({
  filterPausedSessionsForPatient: vi.fn(() => []),
  PAUSED_SESSIONS_LIST_PAGE_SIZE: 20,
}));
vi.mock('@/lib/pagination-constants', () => ({ MAX_LIST_PAGE_SIZE: 200 }));

vi.mock('@/lib/services', async () => ({
  consultationService: {
    getSessions: vi.fn(() => Promise.resolve({ results: [], count: 0 })),
    getQueue: vi.fn(() => Promise.resolve({ results: [] })),
  },
}));

import { useConsultationRoomQueue } from './use-consultation-room-queue';
import { consultationService } from '@/lib/services';

const mockService = consultationService as unknown as {
  getSessions: ReturnType<typeof vi.fn>;
  getQueue: ReturnType<typeof vi.fn>;
};

describe('useConsultationRoomQueue', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns initial empty state', () => {
    const { result } = renderHook(() => useConsultationRoomQueue('1', null));
    expect(result.current.patients).toEqual([]);
    expect(result.current.pausedSessions).toEqual([]);
    expect(result.current.isRefreshingQueue).toBe(false);
    expect(result.current.showRoomPatientsDialog).toBe(false);
  });

  it('loadPausedSessions fetches from service', async () => {
    mockService.getSessions.mockResolvedValueOnce({ results: [{ id: 1, started_at: '2024-01-01' }], count: 1 });
    const { result } = renderHook(() => useConsultationRoomQueue('1', null));
    await act(async () => { await result.current.loadPausedSessions(); });
    expect(mockService.getSessions).toHaveBeenCalledWith(
      expect.objectContaining({ room: 1, status: 'paused' })
    );
    expect(result.current.pausedSessions).toHaveLength(1);
  });

  it('refreshQueueData fetches queue items', async () => {
    mockService.getQueue.mockResolvedValueOnce({ results: [{ id: 'p1' }] });
    mockService.getSessions.mockResolvedValueOnce({ results: [], count: 0 });
    const { result } = renderHook(() => useConsultationRoomQueue('1', null));
    await act(async () => { await result.current.refreshQueueData(); });
    expect(mockService.getQueue).toHaveBeenCalled();
    expect(result.current.patients).toHaveLength(1);
  });

  it('openRoomPatientsDialog sets dialog state', () => {
    const { result } = renderHook(() => useConsultationRoomQueue('1', null));
    act(() => { result.current.openRoomPatientsDialog('paused'); });
    expect(result.current.showRoomPatientsDialog).toBe(true);
    expect(result.current.roomPatientsDialogTab).toBe('paused');
  });
});
