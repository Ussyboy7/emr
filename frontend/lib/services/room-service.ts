import { apiFetch, buildQueryString } from '../api-client';
import type {
  RoomActiveSessionSummary,
  RoomDoctorPresence,
  RoomPresenceStatus,
} from '../consultation/room-presence';

export interface Room {
  id: number;
  name: string;
  room_number: string;
  location: string;
  floor: string;
  specialty: string;
  /** Physical category — drives scheduling behaviour (consultation vs procedure, etc.). */
  room_type?: 'consultation' | 'procedure' | 'emergency' | 'examination';
  status: 'active' | 'inactive' | 'maintenance';
  capacity: number;
  is_active: boolean;
  location_clinic?: number | null;
  clinic_name?: string;
  created_at: string;
  updated_at: string;
  current_doctor_id?: number | null;
  current_doctor_name?: string | null;
  presence_status?: RoomPresenceStatus;
  accepting_patients?: boolean;
  doctors?: RoomDoctorPresence[];
  doctors_on_seat_count?: number;
  occupancy_count?: number;
  my_presence_status?: RoomPresenceStatus;
  my_accepting_patients?: boolean;
  queue_count?: number;
  active_session?: RoomActiveSessionSummary | null;
  active_sessions?: RoomActiveSessionSummary[];
}

export interface RoomFilters {
  status?: string;
  specialty?: string;
  is_active?: boolean;
  /** organisation.Clinic pk — preferred over searching ``location`` text */
  location_clinic?: number;
  /** Lower-case slug matching ConsultationRoom.room_type */
  room_type?: string;
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

  async getListStats(filters: Omit<RoomFilters, 'page' | 'page_size' | 'status' | 'ordering'> = {}): Promise<{
    total: number;
    active: number;
    inactive: number;
    maintenance: number;
  }> {
    const query = buildQueryString(filters as Record<string, string | number | boolean | undefined>);
    const path = query
      ? `${this.basePath}/list-stats/?${query.slice(1)}`
      : `${this.basePath}/list-stats/`;
    return apiFetch(path);
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

  async checkIn(id: number): Promise<Room> {
    return apiFetch<Room>(`${this.basePath}/${id}/check-in/`, {
      method: 'POST',
    });
  }

  async checkOut(id: number): Promise<Room> {
    return apiFetch<Room>(`${this.basePath}/${id}/check-out/`, {
      method: 'POST',
    });
  }

  async setAccepting(id: number, accepting: boolean): Promise<Room> {
    return apiFetch<Room>(`${this.basePath}/${id}/set-accepting/`, {
      method: 'POST',
      body: JSON.stringify({ accepting }),
    });
  }

  async heartbeat(id: number): Promise<Room> {
    return apiFetch<Room>(`${this.basePath}/${id}/heartbeat/`, {
      method: 'POST',
    });
  }
}

export const roomService = new RoomService();
