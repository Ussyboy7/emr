export type RoomPresenceStatus = 'on_seat' | 'not_accepting' | 'away';

export interface RoomPresenceFields {
  current_doctor_id?: number | null;
  current_doctor_name?: string | null;
  presence_status?: RoomPresenceStatus;
  accepting_patients?: boolean;
}

export function isRoomAcceptingPatients(room: RoomPresenceFields): boolean {
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
  return room.current_doctor_name ?? undefined;
}

/** Send heartbeat while doctor is in room (keep under backend stale timeout). */
export const ROOM_PRESENCE_HEARTBEAT_MS = 2 * 60 * 1000;

/** Nursing room-queue dashboard refresh interval. */
export const ROOM_QUEUE_POLL_MS = 20 * 1000;
