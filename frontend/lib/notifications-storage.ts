/**
 * Frontend API client for notifications.
 *
 * Naming: the canonical field name is ``notification_type`` (matching
 * the backend model field + DRF serializer output after the
 * notifications.0003 rename migration). Older code used
 * ``notificationType`` (camelCase) or ``type`` — those are tolerated as
 * fallbacks in ``toUiNotification`` for one release window, then will
 * be removed.
 */

import { apiFetch, hasTokens } from './api-client';
import { logError, logDebug } from './client-logger';

export interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type:
    | 'workflow'
    | 'lab_result'
    | 'radiology_result'
    | 'prescription'
    | 'appointment'
    | 'system'
    | 'alert'
    | 'reminder';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'unread' | 'read' | 'archived';
  actionUrl?: string;
  readAt?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
  objectType?: string;
  objectId?: string;
}

export interface NotificationPreferences {
  id: number | string;
  user: number | string;
  // Channel toggles (match backend model field names exactly).
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  // Module filters.
  lab_results_enabled: boolean;
  radiology_results_enabled: boolean;
  prescriptions_enabled: boolean;
  appointments_enabled: boolean;
  system_alerts_enabled: boolean;
  // Priority filters.
  low_priority_enabled: boolean;
  normal_priority_enabled: boolean;
  high_priority_enabled: boolean;
  urgent_priority_enabled: boolean;
  // Quiet hours.
  quiet_hours_enabled: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  // Frontend alerter toggles (see backend ``NotificationPreferences``
  // for semantics). Defaults are ``true``, ``true``, ``false``.
  desktop_alerts_enabled: boolean;
  sound_enabled: boolean;
  sound_urgent_only: boolean;
  // Auto-archive read notifications after this many days. 0 disables.
  auto_archive_days: number;
  updated_at: string;
}

export interface CreateNotificationPayload {
  title: string;
  message: string;
  notification_type?: Notification['notification_type'];
  priority?: Notification['priority'];
  actionUrl?: string;
  objectType?: string;
  objectId?: string;
}

/**
 * Window event broadcast whenever the user mutates their inbox locally
 * (mark-read / mark-all-read / archive). The bell listens for this to
 * refresh its badge without waiting for the next poll/WS tick.
 */
export const NOTIFICATIONS_CHANGED_EVENT = 'notifications:changed';

const broadcastChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
  }
};

const toUiNotification = (raw: Record<string, unknown>): Notification | null => {
  if (!raw || typeof raw !== 'object') return null;

  const r = raw as Record<string, unknown>;
  const createdAt = (r.created_at as string) ?? (r.createdAt as string) ?? new Date().toISOString();
  const notificationType =
    (r.notification_type as Notification['notification_type']) ??
    (r.notificationType as Notification['notification_type']) ??
    (r.type as Notification['notification_type']) ??
    'system';

  return {
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    message: String(r.message ?? ''),
    notification_type: notificationType,
    priority: (r.priority as Notification['priority']) ?? 'normal',
    status: (r.status as Notification['status']) ?? 'unread',
    actionUrl: (r.action_url as string) ?? (r.actionUrl as string) ?? undefined,
    readAt: (r.read_at as string) ?? (r.readAt as string) ?? undefined,
    createdAt: String(createdAt),
    metadata: (r.metadata as Record<string, unknown>) ?? undefined,
    objectType: (r.object_type as string) ?? undefined,
    objectId: r.object_id != null ? String(r.object_id) : undefined,
  };
};

/**
 * Get all notifications for the current user.
 */
export const getNotifications = async (params?: {
  status?: string;
  notification_type?: string;
  priority?: string;
}): Promise<Notification[]> => {
  if (!hasTokens()) return [];

  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.append('status', params.status);
  if (params?.notification_type) queryParams.append('notification_type', params.notification_type);
  if (params?.priority) queryParams.append('priority', params.priority);

  const query = queryParams.toString();
  const url = `/notifications/notifications/${query ? `?${query}` : ''}`;
  try {
    const response = await apiFetch<unknown>(url);

    // DRF paginated shape: {count, next, previous, results: [...]}.
    if (
      response &&
      typeof response === 'object' &&
      'results' in response &&
      Array.isArray((response as { results: unknown[] }).results)
    ) {
      return ((response as { results: Record<string, unknown>[] }).results)
        .map(toUiNotification)
        .filter((n): n is Notification => Boolean(n));
    }

    return Array.isArray(response)
      ? (response as Record<string, unknown>[])
          .map(toUiNotification)
          .filter((n): n is Notification => Boolean(n))
      : [];
  } catch (error) {
    logError('[notifications-storage] Error fetching notifications:', error);
    throw error;
  }
};

/**
 * Get unread notification count (cached for ~20s to absorb double-mounts
 * and rapid re-renders). Mutation helpers below invalidate the cache so
 * the bell badge updates instantly.
 */
let unreadCountInFlight: Promise<number> | null = null;
let unreadCountLastValue: number | null = null;
let unreadCountLastFetchedAt = 0;
const UNREAD_COUNT_CACHE_TTL_MS = 20_000;

export const getUnreadNotificationCount = async (): Promise<number> => {
  if (!hasTokens()) return 0;

  try {
    const now = Date.now();
    if (unreadCountLastValue !== null && now - unreadCountLastFetchedAt < UNREAD_COUNT_CACHE_TTL_MS) {
      return unreadCountLastValue;
    }
    if (unreadCountInFlight) {
      return unreadCountInFlight;
    }
    const url = '/notifications/notifications/unread_count/';
    unreadCountInFlight = apiFetch<{ count: number }>(url).then((response) => {
      const count = response.count || 0;
      unreadCountLastValue = count;
      unreadCountLastFetchedAt = Date.now();
      return count;
    });
    const count = await unreadCountInFlight;
    return count;
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      const errorObj = error as { message?: string };
      logDebug(
        '[notifications-storage] Error fetching unread count (silently handled):',
        errorObj?.message || error,
      );
    }
    return 0;
  } finally {
    unreadCountInFlight = null;
  }
};

/** Invalidate the unread count cache (e.g. after marking a notification as read). */
export const invalidateUnreadCountCache = () => {
  unreadCountLastValue = null;
  unreadCountLastFetchedAt = 0;
};

/**
 * Mark a notification as read.
 */
export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  if (!hasTokens()) throw new Error('Authentication required');

  await apiFetch(`/notifications/notifications/${notificationId}/mark_read/`, {
    method: 'POST',
  });
  invalidateUnreadCountCache();
  broadcastChanged();
};

/**
 * Mark a notification as archived.
 */
export const markNotificationAsArchived = async (notificationId: string): Promise<void> => {
  if (!hasTokens()) throw new Error('Authentication required');

  await apiFetch(`/notifications/notifications/${notificationId}/archive/`, {
    method: 'POST',
  });
  invalidateUnreadCountCache();
  broadcastChanged();
};

/**
 * Mark all notifications as read.
 */
export const markAllNotificationsAsRead = async (): Promise<number> => {
  if (!hasTokens()) throw new Error('Authentication required');

  const response = await apiFetch<{ message?: string }>(
    '/notifications/notifications/mark_all_read/',
    { method: 'POST' },
  );
  invalidateUnreadCountCache();
  broadcastChanged();
  const msg = response?.message || '';
  const match = msg.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
};

/**
 * Get notification preferences for the current user.
 */
export const getNotificationPreferences = async (): Promise<NotificationPreferences | null> => {
  if (!hasTokens()) return null;

  try {
    // The viewset's ``get_object`` is the get-or-create endpoint; list
    // returns the user's single row.
    const response = await apiFetch<{ results?: NotificationPreferences[] } | NotificationPreferences[]>(
      '/notifications/preferences/',
    );
    if (Array.isArray(response)) {
      return response[0] ?? null;
    }
    if (response && 'results' in response && Array.isArray(response.results)) {
      return response.results[0] ?? null;
    }
    return (response as NotificationPreferences) ?? null;
  } catch {
    return null;
  }
};

/**
 * Update notification preferences. Accepts a partial — the backend
 * upserts on the current user, so PATCH on the singleton is sufficient.
 */
export const updateNotificationPreferences = async (
  preferences: Partial<NotificationPreferences> & { id?: number | string },
): Promise<NotificationPreferences> => {
  if (!hasTokens()) throw new Error('Authentication required');

  const id = preferences.id;
  const url = id
    ? `/notifications/preferences/${id}/`
    : '/notifications/preferences/';
  const response = await apiFetch<NotificationPreferences>(url, {
    method: 'PATCH',
    body: JSON.stringify(preferences),
  });
  // Lets the alerter re-read its toggles without waiting for the next
  // dialog open.
  broadcastChanged();
  return response;
};

/**
 * Create a notification (admin/superuser only typically).
 */
export const createNotification = async (
  payload: CreateNotificationPayload,
): Promise<Notification> => {
  if (!hasTokens()) throw new Error('Authentication required');

  const response = await apiFetch<Record<string, unknown>>('/notifications/notifications/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const mapped = toUiNotification(response);
  if (!mapped) {
    throw new Error('Invalid notification response');
  }
  return mapped;
};

export const normalizeNotificationFromWs = (raw: Record<string, unknown>): Notification | null =>
  toUiNotification(raw);
