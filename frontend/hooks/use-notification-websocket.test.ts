// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/client-logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

const mockCurrentUser = { id: 1, name: 'Dr Test' };
vi.mock('./use-current-user', () => ({
  useCurrentUser: vi.fn(() => ({ currentUser: mockCurrentUser })),
}));

vi.mock('@/lib/api-client', () => ({
  getStoredAccessToken: vi.fn(() => 'test-token'),
}));

vi.mock('@/lib/notifications-storage', () => ({
  getUnreadNotificationCount: vi.fn(() => Promise.resolve(3)),
  normalizeNotificationFromWs: vi.fn((n: any) => n),
}));

vi.mock('@/lib/constants', () => ({
  NOTIFICATION_WS_MAX_RECONNECT_ATTEMPTS: 3,
  NOTIFICATION_WS_PING_INTERVAL_MS: 30000,
  NOTIFICATION_WS_RECONNECT_DELAY_MS: 1000,
}));

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  url: string;
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    setTimeout(() => this.onopen?.({} as any), 0);
  }
}

import { useNotificationWebSocket } from './use-notification-websocket';

describe('useNotificationWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('process', { env: { NEXT_PUBLIC_API_URL: 'http://localhost:8001' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns initial state with isConnected false', () => {
    const { result } = renderHook(() => useNotificationWebSocket({ enabled: false }));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.unreadCount).toBe(0);
  });

  it('exposes sendMessage and markAsRead', () => {
    const { result } = renderHook(() => useNotificationWebSocket({ enabled: false }));
    expect(typeof result.current.sendMessage).toBe('function');
    expect(typeof result.current.markAsRead).toBe('function');
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
  });

  it('disconnect clears websocket reference', () => {
    const { result } = renderHook(() => useNotificationWebSocket({ enabled: false }));
    act(() => { result.current.disconnect(); });
    expect(result.current.isConnected).toBe(false);
  });
});
