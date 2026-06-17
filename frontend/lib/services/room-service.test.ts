import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(),
  buildQueryString: vi.fn((params: Record<string, unknown>) => {
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '');
    if (!entries.length) return '';
    return '?' + entries.map(([k, v]) => `${k}=${v}`).join('&');
  }),
}));

import { apiFetch } from '../api-client';
import { roomService } from './room-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('roomService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getRooms', () => {
    it('fetches rooms list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'Room A' }], count: 1 });

      const res = await roomService.getRooms();
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/consultation/rooms/');
    });

    it('passes filter params', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await roomService.getRooms({ status: 'active', specialty: 'cardiology' });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('status=active');
      expect(url).toContain('specialty=cardiology');
    });
  });

  describe('getRoom', () => {
    it('fetches single room', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, name: 'Consultation 3' });

      const res = await roomService.getRoom(5);
      expect(res.name).toBe('Consultation 3');
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/consultation/rooms/5/');
    });
  });

  describe('createRoom', () => {
    it('posts new room', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, name: 'New Room' });

      const res = await roomService.createRoom({ name: 'New Room', room_number: 'R-101' } as any);
      expect(res.name).toBe('New Room');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/consultation/rooms/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('updateRoom', () => {
    it('patches an existing room', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, status: 'maintenance' });

      const res = await roomService.updateRoom(3, { status: 'maintenance' } as any);
      expect(res.status).toBe('maintenance');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/consultation/rooms/3/',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('deleteRoom', () => {
    it('deletes a room', async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await roomService.deleteRoom(3);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/consultation/rooms/3/',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('getListStats', () => {
    it('fetches room list stats', async () => {
      const stats = { total: 10, active: 7, inactive: 2, maintenance: 1 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await roomService.getListStats();
      expect(res.total).toBe(10);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/consultation/rooms/list-stats/');
    });
  });
});
