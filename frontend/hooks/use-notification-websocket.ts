"use client";

import { logError, logInfo, logWarn } from '@/lib/client-logger';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useCurrentUser } from './use-current-user';
import { getStoredAccessToken } from '@/lib/api-client';
import { getUnreadNotificationCount, type Notification } from '@/lib/notifications-storage';
import {
  NOTIFICATION_WS_MAX_RECONNECT_ATTEMPTS,
  NOTIFICATION_WS_PING_INTERVAL_MS,
  NOTIFICATION_WS_RECONNECT_DELAY_MS,
} from '@/lib/constants';

interface UseNotificationWebSocketOptions {
  enabled?: boolean;
  onNotification?: (notification: Notification) => void;
  onUnreadCountChange?: (count: number) => void;
}

const WS_DISABLED =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_NOTIFICATIONS_WS_DISABLED === 'true';

export const useNotificationWebSocket = (options: UseNotificationWebSocketOptions = {}) => {
  const { enabled = true, onNotification, onUnreadCountChange } = options;
  const isWsEnabled = enabled && !WS_DISABLED;
  const { currentUser } = useCurrentUser();
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = NOTIFICATION_WS_MAX_RECONNECT_ATTEMPTS;
  const reconnectDelay = NOTIFICATION_WS_RECONNECT_DELAY_MS;

  const getWebSocketUrl = useCallback(() => {
    // Get base URL from environment or window location
    let baseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl && typeof window !== 'undefined') {
      // Fallback to current window location
      baseUrl = `${window.location.protocol}//${window.location.host}`;
    }
    baseUrl = baseUrl || 'http://localhost:8000';
    
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
      host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000';
    }

    // WebSocket URL format: ws://host:port/ws/notifications/
    // For staging server (172.16.0.46:4646), ensure port is included
    if (host.includes('172.16.0.46')) {
      if (!host.includes(':')) {
        host = '172.16.0.46:4646';
      } else if (host === '172.16.0.46') {
        host = '172.16.0.46:4646';
      }
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
      return 'ws://localhost:8000/ws/notifications/';
    }
    
    return wsUrl;
  }, []);

  const connect = useCallback(() => {
    if (!isWsEnabled || !currentUser || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      let url = getWebSocketUrl();
      // Add JWT token to query string for authentication
      const token = getStoredAccessToken();
      if (token) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}token=${encodeURIComponent(token)}`;
      }
      const ws = new WebSocket(url);

      ws.onopen = () => {
        logInfo('WebSocket connected for notifications');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

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
                onNotification(data.notification as Notification);
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

      ws.onclose = () => {
        logInfo('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;

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
  }, [isWsEnabled, currentUser, getWebSocketUrl, onNotification, onUnreadCountChange, maxReconnectAttempts, reconnectDelay]);

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

  const sendMessage = useCallback((message: any) => {
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

    if (currentUser) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [isWsEnabled, enabled, currentUser, connect, disconnect]);

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
