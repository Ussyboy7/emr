// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));
vi.mock('@/lib/notifications-storage', () => ({
  getNotificationPreferences: vi.fn(() => Promise.resolve({
    desktop_alerts_enabled: true,
    sound_enabled: false,
    sound_urgent_only: false,
  })),
}));
vi.mock('@/lib/client-logger', () => ({ logDebug: vi.fn() }));
vi.mock('@/lib/notification-alerter-utils', () => ({
  buildCoalesceKey: vi.fn((n: any) => `${n.notification_type}_${n.actionUrl || ''}`),
  buildCoalescedToastCopy: vi.fn((count: number, n: any) => ({
    title: n.title || 'Notification',
    description: count > 1 ? `${count} items` : n.message,
  })),
  COALESCE_WINDOW_MS: 100,
  isHigherPriority: vi.fn(() => false),
  shouldBypassCoalescing: vi.fn((p: string) => p === 'urgent'),
  shouldPlayNotificationSound: vi.fn(() => false),
  tabIsFocused: vi.fn(() => true),
  toastDurationForPriority: vi.fn(() => 5000),
  URGENT_REPEAT_MS: 10000,
}));

import { useNotificationAlerter } from './use-notification-alerter';
import { toast } from 'sonner';

describe('useNotificationAlerter', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns trigger and refreshPrefs', () => {
    const { result } = renderHook(() => useNotificationAlerter());
    expect(typeof result.current.trigger).toBe('function');
    expect(typeof result.current.refreshPrefs).toBe('function');
  });

  it('trigger with urgent notification fires toast immediately', () => {
    const { result } = renderHook(() => useNotificationAlerter());
    const notification = { id: '1', title: 'Urgent', message: 'Help', priority: 'urgent' as const, notification_type: 'alert', actionUrl: '/test' };
    act(() => { result.current.trigger(notification as any); });
    expect(toast.error).toHaveBeenCalled();
  });

  it('trigger with normal notification coalesces and flushes after window', () => {
    const { result } = renderHook(() => useNotificationAlerter());
    const notification = { id: '2', title: 'Info', message: 'Test', priority: 'normal' as const, notification_type: 'info', actionUrl: '' };
    act(() => { result.current.trigger(notification as any); });
    expect(toast.info).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(toast.info).toHaveBeenCalled();
  });
});
