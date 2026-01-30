/**
 * Frontend API client for notifications.
 */

import { apiFetch, hasTokens } from './api-client';

export interface Notification {
  id: string;
  title: string;
  message: string;
  notificationType: 'workflow' | 'lab_result' | 'radiology_result' | 'prescription' | 'appointment' | 'system' | 'alert' | 'reminder';
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
  id: string;
  user: string;
  inAppEnabled: boolean;
  inAppUrgentOnly: boolean;
  emailEnabled: boolean;
  emailUrgentOnly: boolean;
  emailDigest: boolean;
  emailDigestTime?: string;
  moduleDms: boolean;
  moduleWorkflow: boolean;
  moduleSystem: boolean;
  priorityLow: boolean;
  priorityNormal: boolean;
  priorityHigh: boolean;
  soundEnabled?: boolean;
  priorityUrgent: boolean;
  typeWorkflow: boolean;
  typeDocument: boolean;
  typeSystem: boolean;
  typeAlert: boolean;
  typeReminder: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  autoArchiveDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationPayload {
  title: string;
  message: string;
  notificationType?: Notification['notificationType'];
  priority?: Notification['priority'];
  actionUrl?: string;
  objectType?: string;
  objectId?: string;
}

const toUiNotification = (raw: any): Notification | null => {
  if (!raw || typeof raw !== 'object') return null;
  const createdAt = raw.created_at || raw.createdAt;
  const id = raw.id;
  if (!id || !createdAt) return null;
  return {
    id: String(id),
    title: String(raw.title ?? ''),
    message: String(raw.message ?? ''),
    notificationType: (raw.type ?? raw.notificationType ?? 'system') as Notification['notificationType'],
    priority: (raw.priority ?? 'normal') as Notification['priority'],
    status: (raw.status ?? 'unread') as Notification['status'],
    actionUrl: raw.action_url ?? raw.actionUrl ?? undefined,
    readAt: raw.read_at ?? raw.readAt ?? undefined,
    createdAt: String(createdAt),
    metadata: raw.metadata ?? undefined,
    objectType: raw.object_type ?? undefined,
    objectId: raw.object_id ? String(raw.object_id) : undefined,
  };
};

/**
 * Get all notifications for the current user.
 */
export const getNotifications = async (params?: {
  status?: string;
  notificationType?: string;
  priority?: string;
}): Promise<Notification[]> => {
  if (!hasTokens()) return [];

  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.append('status', params.status);
  if (params?.notificationType) queryParams.append('notification_type', params.notificationType);
  if (params?.priority) queryParams.append('priority', params.priority);

  const query = queryParams.toString();
  // The router registers 'notifications' under api/notifications/, and the viewset is also 'notifications'
  // So the full path is /api/notifications/notifications/
  // apiFetch adds /api/v1/ prefix, so we need /notifications/notifications/
  const url = `/notifications/notifications/${query ? `?${query}` : ''}`;
  console.log('[notifications-storage] Fetching notifications from:', url);
  try {
    const response = await apiFetch<any>(url);
    // Security: Removed console.log to prevent notification response data exposure
    
    // Handle paginated response (DRF returns {count, next, previous, results: [...]})
    if (response && typeof response === 'object' && 'results' in response && Array.isArray(response.results)) {
      return (response.results as any[]).map(toUiNotification).filter((n): n is Notification => Boolean(n));
    }
    
    // Handle direct array response (fallback)
    return Array.isArray(response) ? response.map(toUiNotification).filter((n): n is Notification => Boolean(n)) : [];
  } catch (error) {
    console.error('[notifications-storage] Error fetching notifications:', error);
    throw error;
  }
};

/**
 * Get unread notification count.
 */
export const getUnreadNotificationCount = async (): Promise<number> => {
  if (!hasTokens()) return 0;

  try {
    // The router registers 'notifications' under api/notifications/, and the viewset is also 'notifications'
    // So the full path is /api/notifications/notifications/unread_count/
    // apiFetch adds /api/v1/ prefix, so we need /notifications/notifications/unread_count/
    const url = '/notifications/notifications/unread_count/';
    const response = await apiFetch<{ count: number }>(url);
    return response.count || 0;
  } catch (error: any) {
    // Silently handle errors - notifications endpoint might not be available yet
    // Network errors (Failed to fetch), 404s, 401s, etc. are all acceptable
    // Only log in development mode for debugging
    if (process.env.NODE_ENV === 'development') {
      console.debug('[notifications-storage] Error fetching unread count (silently handled):', error?.message || error);
    }
    return 0;
  }
};

/**
 * Mark a notification as read.
 */
export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  if (!hasTokens()) throw new Error('Authentication required');

  await apiFetch(`/notifications/notifications/${notificationId}/mark_read/`, {
    method: 'POST',
  });
};

/**
 * Mark a notification as archived.
 */
export const markNotificationAsArchived = async (notificationId: string): Promise<void> => {
  if (!hasTokens()) throw new Error('Authentication required');

  await apiFetch(`/notifications/notifications/${notificationId}/archive/`, {
    method: 'POST',
  });
};

/**
 * Mark all notifications as read.
 */
export const markAllNotificationsAsRead = async (): Promise<number> => {
  if (!hasTokens()) throw new Error('Authentication required');

  const response = await apiFetch<{ message?: string }>('/notifications/notifications/mark_all_read/', {
    method: 'POST',
  });
  // Backend returns: {"message": "X notifications marked as read"}
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
    const response = await apiFetch<NotificationPreferences>('/notifications/preferences/');
    return response;
  } catch (error) {
    // Preferences might not exist yet, return null
    return null;
  }
};

/**
 * Update notification preferences.
 */
export const updateNotificationPreferences = async (
  preferences: Partial<NotificationPreferences>
): Promise<NotificationPreferences> => {
  if (!hasTokens()) throw new Error('Authentication required');

  const response = await apiFetch<NotificationPreferences>('/notifications/preferences/', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
  return response;
};

/**
 * Create a notification (admin/superuser only typically).
 */
export const createNotification = async (
  payload: CreateNotificationPayload
): Promise<Notification> => {
  if (!hasTokens()) throw new Error('Authentication required');

  const response = await apiFetch<any>('/notifications/notifications/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const mapped = toUiNotification(response);
  if (!mapped) {
    throw new Error('Invalid notification response');
  }
  return mapped;
};

export const normalizeNotificationFromWs = (raw: any): Notification | null => toUiNotification(raw);
