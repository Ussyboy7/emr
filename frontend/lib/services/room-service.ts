import { apiFetch, buildQueryString } from '../api-client';

export interface Room {
  id: number;
  name: string;
  room_number: string;
  location: string;
  floor: string;
  specialty: string;
  status: 'active' | 'inactive' | 'maintenance';
  capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomFilters {
  status?: string;
  specialty?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface RoomListResponse {
  results: Room[];
  count: number;
  next?: string;
  previous?: string;
}

class RoomService {
  private basePath = '/consultation/rooms';

  /**
   * Get all rooms with optional filters
   */
  async getRooms(filters: RoomFilters = {}): Promise<RoomListResponse> {
    const query = buildQueryString(filters as Record<string, string | number | boolean | undefined>);
    return apiFetch<RoomListResponse>(`${this.basePath}/${query}`);
  }

  /**
   * Get a single room by ID
   */
  async getRoom(id: number): Promise<Room> {
    return apiFetch<Room>(`${this.basePath}/${id}/`);
  }

  /**
   * Create a new room
   */
  async createRoom(data: Partial<Room>): Promise<Room> {
    return apiFetch<Room>(`${this.basePath}/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update an existing room
   */
  async updateRoom(id: number, data: Partial<Room>): Promise<Room> {
    return apiFetch<Room>(`${this.basePath}/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a room (soft delete by setting is_active=false)
   */
  async deleteRoom(id: number): Promise<void> {
    return apiFetch<void>(`${this.basePath}/${id}/`, {
      method: 'DELETE',
    });
  }
}

export const roomService = new RoomService();

