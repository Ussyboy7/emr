export type RoomPresenceStatus = 'on_seat' | 'not_accepting' | 'away';

export interface RoomActiveSessionSummary {
  id: number;
  session_id: string;
  patient_id?: number;
  patient_name: string;
  doctor_id?: number | null;
  doctor_name?: string | null;
}

export interface RoomDoctorPresence {
  doctor_id: number;
  doctor_name: string;
  presence_status: RoomPresenceStatus;
  accepting_patients: boolean;
  active_session?: RoomActiveSessionSummary | null;
}

export interface RoomQueueDayStats {
  sent_today: number;
  waiting: number;
  in_consult: number;
  completed_today: number;
  left_without_consult: number;
}

export interface RoomPresenceFields {
  current_doctor_id?: number | null;
  current_doctor_name?: string | null;
  presence_status?: RoomPresenceStatus;
  accepting_patients?: boolean;
  doctors?: RoomDoctorPresence[];
  doctors_on_seat_count?: number;
  occupancy_count?: number;
  my_presence_status?: RoomPresenceStatus;
  my_accepting_patients?: boolean;
  active_sessions?: RoomActiveSessionSummary[];
}

export function isRoomAcceptingPatients(room: RoomPresenceFields): boolean {
  if (typeof room.doctors_on_seat_count === 'number') {
    return room.doctors_on_seat_count > 0;
  }
  if (room.doctors?.length) {
    return room.doctors.some((d) => d.accepting_patients);
  }
  return room.accepting_patients === true;
}

export function canNursingSendToRoom(room: RoomPresenceFields & { status?: string; is_active?: boolean }): boolean {
  const facilityActive = (room.status?.toLowerCase() ?? 'active') === 'active' && room.is_active !== false;
  return facilityActive && isRoomAcceptingPatients(room);
}

export function presenceStatusLabel(status: RoomPresenceStatus | undefined): string {
  switch (status) {
    case 'on_seat':
      return 'On seat';
    case 'not_accepting':
      return 'Not accepting';
    case 'away':
    default:
      return 'No doctor';
  }
}

export function presenceStatusBadgeClass(status: RoomPresenceStatus | undefined): string {
  switch (status) {
    case 'on_seat':
      return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    case 'not_accepting':
      return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'away':
    default:
      return 'text-gray-600 dark:text-gray-400 bg-gray-500/10 border-gray-500/30';
  }
}

export function doctorDisplayName(room: RoomPresenceFields): string | undefined {
  if (room.doctors?.length) {
    return room.doctors.map((d) => d.doctor_name).join(' · ');
  }
  return room.current_doctor_name ?? undefined;
}

export function doctorsOnSeat(room: RoomPresenceFields): RoomDoctorPresence[] {
  return (room.doctors ?? []).filter((d) => d.presence_status === 'on_seat');
}

export function isDoctorCheckedIntoRoom(room: RoomPresenceFields, doctorId?: number | null): boolean {
  if (!doctorId) return false;
  return (room.doctors ?? []).some((d) => d.doctor_id === doctorId);
}

/** Send heartbeat while doctor is in room (keep under backend stale timeout). */
export const ROOM_PRESENCE_HEARTBEAT_MS = 2 * 60 * 1000;

/** Nursing room-queue dashboard refresh interval. */
export const ROOM_QUEUE_POLL_MS = 20 * 1000;
