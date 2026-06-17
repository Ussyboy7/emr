import type { Notification } from '@/lib/notifications-storage';

export type NotificationPriority = Notification['priority'];

export const COALESCE_WINDOW_MS = 2500;
export const SOUND_MIN_INTERVAL_MS = 5000;
export const URGENT_REPEAT_MS = 10_000;

export const PRIORITY_PRIMACY: Record<NotificationPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export const NOTIFICATION_TYPE_LABELS: Record<Notification['notification_type'], string> = {
  workflow: 'Workflow',
  lab_result: 'Lab result',
  radiology_result: 'Radiology result',
  prescription: 'Prescription',
  appointment: 'Appointment',
  system: 'System',
  alert: 'Alert',
  reminder: 'Reminder',
};

export interface AlerterSoundPrefs {
  soundEnabled: boolean;
  soundUrgentOnly: boolean;
}

export function buildCoalesceKey(
  notification: Pick<Notification, 'notification_type' | 'actionUrl'>,
): string {
  return `${notification.notification_type}|${notification.actionUrl ?? ''}`;
}

export function isHigherPriority(a: NotificationPriority, b: NotificationPriority): boolean {
  return PRIORITY_PRIMACY[a] < PRIORITY_PRIMACY[b];
}

export function shouldBypassCoalescing(priority: NotificationPriority): boolean {
  return priority === 'urgent';
}

export function shouldPlayNotificationSound(
  priority: NotificationPriority,
  prefs: AlerterSoundPrefs,
  tabFocused: boolean,
  lastSoundAt: number,
  now: number = Date.now(),
): boolean {
  if (!prefs.soundEnabled) return false;
  if (prefs.soundUrgentOnly && priority !== 'urgent') return false;
  if (priority === 'low') return false;
  if (tabFocused) return false;
  if (now - lastSoundAt < SOUND_MIN_INTERVAL_MS) return false;
  return true;
}

export function buildCoalescedToastCopy(
  count: number,
  highest: Pick<Notification, 'title' | 'message' | 'notification_type'>,
): { title: string; description: string } {
  const typeLabel = NOTIFICATION_TYPE_LABELS[highest.notification_type] ?? 'Notification';
  const title = count > 1 ? `${count} new ${typeLabel.toLowerCase()}s` : highest.title;
  const description = count > 1 ? highest.title : highest.message;
  return { title, description };
}

export function toastDurationForPriority(
  priority: NotificationPriority,
): number | typeof Infinity {
  if (priority === 'urgent') return Infinity;
  if (priority === 'high') return 8000;
  if (priority === 'low') return 3000;
  return 4000;
}

export function tabIsFocused(
  visibilityState: DocumentVisibilityState = 'visible',
  hasFocus: boolean = true,
): boolean {
  if (visibilityState !== 'visible') return false;
  if (!hasFocus) return false;
  return true;
}
