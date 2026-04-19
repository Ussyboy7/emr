"use client";

import { logError, logInfo, logWarn } from '@/lib/client-logger';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useCurrentUser } from './use-current-user';
import { getStoredAccessToken } from '@/lib/api-client';
import { getUnreadNotificationCount, normalizeNotificationFromWs, type Notification } from '@/lib/notifications-storage';
import {
  NOTIFICATION_WS_MAX_RECONNECT_ATTEMPTS,
  NOTIFICATION_WS_PING_INTERVAL_MS,
  NOTIFICATION_WS_RECONNECT_DELAY_MS,
} from '@/lib/constants';

interface WebSocketMessage {
  type: 'mark_read' | 'ping';
  notification_id?: string;
}

interface UseNotificationWebSocketOptions {
  enabled?: boolean;
  onNotification?: (notification: Notification) => void;
  onUnreadCountChange?: (count: number) => void;
}

const getWsDisabled = () => {
  if (typeof process === 'undefined') return false;
  return process.env.NEXT_PUBLIC_NOTIFICATIONS_WS_DISABLED === 'true';
};

export const useNotificationWebSocket = (options: UseNotificationWebSocketOptions = {}) => {
  const { enabled = true, onNotification, onUnreadCountChange } = options;
  const WS_DISABLED = getWsDisabled();
  const isWsEnabled = enabled && !WS_DISABLED;
  const { currentUser } = useCurrentUser();
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const permanentFailureRef = useRef(false);
  const maxReconnectAttempts = NOTIFICATION_WS_MAX_RECONNECT_ATTEMPTS;
  const reconnectDelay = NOTIFICATION_WS_RECONNECT_DELAY_MS;

  const getWebSocketUrl = useCallback(() => {
    const normalizeWsUrl = (raw: string) => {
      let url = raw.trim();
      if (!url) return '';

      // Allow http(s) URLs in env and convert to ws(s)
      if (url.startsWith('http://')) url = `ws://${url.slice('http://'.length)}`;
      if (url.startsWith('https://')) url = `wss://${url.slice('https://'.length)}`;

      // If a full notifications endpoint is provided, just normalize trailing slash
      if (url.includes('/ws/notifications')) {
        return url.endsWith('/') ? url : `${url}/`;
      }

      // If a /ws base is provided, append notifications
      if (url.endsWith('/ws') || url.endsWith('/ws/')) {
        const base = url.endsWith('/') ? url.slice(0, -1) : url;
        return `${base}/notifications/`;
      }

      // Otherwise treat it as a host base and append /ws/notifications
      const base = url.endsWith('/') ? url.slice(0, -1) : url;
      return `${base}/ws/notifications/`;
    };

    // If an explicit WS URL is provided, prefer it.
    // Accept either:
    // - ws(s)://host:port/ws/notifications/
    // - ws(s)://host:port/ws/
    // - ws(s)://host:port
    const explicitWs = process.env.NEXT_PUBLIC_WS_URL;
    if (explicitWs) {
      const normalized = normalizeWsUrl(explicitWs);
      if (normalized) return normalized;
    }

    // Get base URL from environment or window location
    let baseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl && typeof window !== 'undefined') {
      // Fallback to current window location
      baseUrl = `${window.location.protocol}//${window.location.host}`;
    }
    if (!baseUrl) {
      logWarn('NEXT_PUBLIC_API_URL not set, using localhost fallback');
      return "ws://localhost:8001/ws/notifications/";
    }
    
    // Determine protocol - use wss for https, ws for http
    let protocol = 'ws';
    if (baseUrl.startsWith('https://') || (typeof window !== 'undefined' && window.location.protocol === 'https:')) {
      protocol = 'wss';
    }
    
    // Extract host and port from baseUrl
    // Remove protocol if present
    let host = baseUrl.replace(/^https?:\/\//, '');
    
    // Remove /api or /api/v1 suffix if present
    host = host.replace(/\/api(\/v\d+)?\/?$/, '');
    
    // Get just the host:port part (before any path)
    host = host.split('/')[0];
    
    // Ensure we have a valid host
    if (!host || host === '') {
      host = typeof window !== "undefined" ? window.location.host : "localhost:8001";
    }

    // Construct WebSocket URL - ensure protocol:// is always present
    const wsUrl = `${protocol}://${host}/ws/notifications/`;
    
    // Validate the URL format
    if (!wsUrl.match(/^wss?:\/\/.+/)) {
      logError('Invalid WebSocket URL constructed:', wsUrl);
      // Fallback to window location if available
      if (typeof window !== 'undefined') {
        const fallbackProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        return `${fallbackProtocol}://${window.location.host}/ws/notifications/`;
      }
      return "ws://localhost:8001/ws/notifications/";
    }
    
    return wsUrl;
  }, []);

  const connect = useCallback(() => {
    if (
      permanentFailureRef.current ||
      !isWsEnabled ||
      !currentUser ||
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      return;
    }

    try {
      const url = getWebSocketUrl();
      if (!url) {
        logWarn('WebSocket URL not available, skipping connection');
        setIsConnected(false);
        return;
      }
      // Add JWT token to query string for authentication
      const token = getStoredAccessToken();
      if (!token) {
        // No valid token available; rely on polling instead.
        setIsConnected(false);
        return;
      }
      const separator = url.includes('?') ? '&' : '?';
      const wsUrl = `${url}${separator}token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        logInfo('WebSocket connected for notifications');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        permanentFailureRef.current = false;

        // Send authentication token if available
        const token = getStoredAccessToken();
        if (token) {
          // Note: WebSocket authentication is handled by Django Channels AuthMiddlewareStack
          // Token should be sent via query parameter or cookie
        }

        // Request initial unread count
        ws.send(JSON.stringify({ type: 'get_unread_count' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'notification':
              if (data.notification && onNotification) {
                const mapped = normalizeNotificationFromWs(data.notification);
                if (mapped) {
                  onNotification(mapped);
                }
              }
              // Refresh unread count
              getUnreadNotificationCount().then(setUnreadCount);
              break;

            case 'unread_count':
              setUnreadCount(data.count || 0);
              if (onUnreadCountChange) {
                onUnreadCountChange(data.count || 0);
              }
              break;

            case 'notification_updated':
              // Handle notification update
              if (onNotification && data.notification) {
                onNotification(data.notification as Notification);
              }
              break;

            case 'pong':
              // Response to ping - connection is alive
              break;

            default:
              logInfo('Unknown WebSocket message type:', data.type);
          }
        } catch (error) {
          logError('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        // Silently handle WebSocket errors - fallback to polling works automatically
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        logInfo('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // If auth fails, stop retrying until user logs in again / token refresh happens.
        if (event?.code === 4401 || event?.code === 4403) {
          permanentFailureRef.current = true;
          logWarn('Notifications WebSocket unauthorized; continuing with polling only.');
          return;
        }

        // Attempt to reconnect
        if (isWsEnabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          const delay = reconnectDelay * reconnectAttemptsRef.current;
          logInfo(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          logWarn('Max WebSocket reconnection attempts reached; continuing with polling only.');
        }
      };

      wsRef.current = ws;
    } catch (error) {
      logWarn('Failed to create WebSocket connection; continuing with polling only.', error);
      setIsConnected(false);
    }
  }, [isWsEnabled, currentUser, onNotification, onUnreadCountChange, maxReconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      logWarn('WebSocket is not connected');
    }
  }, []);

  const markAsRead = useCallback((notificationId: string) => {
    sendMessage({ type: 'mark_read', notification_id: notificationId });
  }, [sendMessage]);

  // Ping to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, NOTIFICATION_WS_PING_INTERVAL_MS);

    return () => clearInterval(pingInterval);
  }, [isConnected, sendMessage]);

  // Initial connection and cleanup
  useEffect(() => {
    if (!isWsEnabled) {
      if (enabled && WS_DISABLED) {
        logInfo('Notifications WebSocket disabled via NEXT_PUBLIC_NOTIFICATIONS_WS_DISABLED');
      }
      return;
    }

    if (currentUser && !wsRef.current) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [isWsEnabled, enabled, currentUser]);

  // Load initial unread count
  useEffect(() => {
    if (currentUser) {
      getUnreadNotificationCount().then(setUnreadCount);
    }
  }, [currentUser]);

  return {
    isConnected,
    unreadCount,
    connect,
    disconnect,
    sendMessage,
    markAsRead,
  };
};
