/** Nursing supervisor override when doctor is not on seat / not accepting. */
export const CONSULTATION_QUEUE_OVERRIDE_CAPABILITY = 'consultation_queue_override';

export type UserWithCapabilities = {
  capabilities?: string[];
  isSuperuser?: boolean;
} | null | undefined;

export function userCanOverrideRoomPresence(user: UserWithCapabilities): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  return user.capabilities?.includes(CONSULTATION_QUEUE_OVERRIDE_CAPABILITY) ?? false;
}

export interface PresenceOverridePayload {
  override_presence: boolean;
  override_reason: string;
}

export function buildPresenceOverridePayload(reason: string): PresenceOverridePayload {
  return {
    override_presence: true,
    override_reason: reason.trim(),
  };
}
