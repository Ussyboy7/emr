"use client";

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getUnreadNotificationCount, type Notification } from '@/lib/notifications-storage';
import { NotificationList } from './NotificationList';
import { useNotificationWebSocket } from '@/hooks/use-notification-websocket';
import { usePolling } from '@/hooks/use-polling';
import { NOTIFICATION_POLL_INTERVAL_MS } from '@/lib/constants';

export const NotificationBell = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [newNotifications, setNewNotifications] = useState<Notification[]>([]);

  // Use WebSocket for real-time updates
  const { unreadCount: wsUnreadCount, isConnected } = useNotificationWebSocket({
    enabled: true,
    onNotification: (notification) => {
      setNewNotifications((prev) => [notification, ...prev]);
      // Refresh count
      getUnreadNotificationCount().then(setUnreadCount);
    },
    onUnreadCountChange: (count) => {
      setUnreadCount(count);
    },
  });

  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await getUnreadNotificationCount();
      setUnreadCount(count);
    } catch (error) {
      // Silently handle errors - set count to 0 if fetch fails
      setUnreadCount(0);
    }
  }, []);

  usePolling(fetchUnreadCount, NOTIFICATION_POLL_INTERVAL_MS, {
    enabled: !isConnected,
    runImmediately: true,
  });

  useEffect(() => {
    if (isConnected) {
      setUnreadCount(wsUnreadCount);
    }
  }, [isConnected, wsUnreadCount]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[600px] overflow-hidden">
        <NotificationList onClose={() => setIsOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

