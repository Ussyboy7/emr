"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getUnreadNotificationCount,
  invalidateUnreadCountCache,
  NOTIFICATIONS_CHANGED_EVENT,
  markNotificationAsRead,
  type Notification,
} from '@/lib/notifications-storage';
import { NotificationList } from './NotificationList';
import { useNotificationWebSocket } from '@/hooks/use-notification-websocket';
import { useNotificationAlerter } from '@/hooks/use-notification-alerter';
import { usePolling } from '@/hooks/use-polling';
import { NOTIFICATION_POLL_INTERVAL_MS } from '@/lib/constants';
import { usePageVisible } from '@/hooks/use-page-visible';

export const NotificationBell = () => {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const isPageVisible = usePageVisible();
  const { trigger: triggerAlert, refreshPrefs } = useNotificationAlerter();

  // Toast/click handler — mark as read then navigate.
  const handleAlertClick = useCallback(
    async (notification: Notification) => {
      try {
        if (notification.status === 'unread') {
          await markNotificationAsRead(notification.id);
        }
      } catch {
        /* swallow — navigation matters more than read state */
      }
      if (notification.actionUrl) {
        if (notification.actionUrl.startsWith('http')) {
          window.open(notification.actionUrl, '_blank');
        } else {
          router.push(notification.actionUrl);
        }
      }
    },
    [router],
  );

  const { unreadCount: wsUnreadCount, isConnected } = useNotificationWebSocket({
    enabled: true,
    onNotification: (notification) => {
      // A push arrived — fire the alerter (toast + sound) and refresh
      // the bell count.
      triggerAlert(notification, handleAlertClick);
      invalidateUnreadCountCache();
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
    } catch {
      setUnreadCount(0);
    }
  }, []);

  // Poll only when WebSocket is unavailable AND the tab is visible.
  usePolling(fetchUnreadCount, NOTIFICATION_POLL_INTERVAL_MS, {
    enabled: !isConnected && isPageVisible,
    runImmediately: true,
  });

  useEffect(() => {
    if (isConnected) {
      setUnreadCount(wsUnreadCount);
    }
  }, [isConnected, wsUnreadCount]);

  // Listen for local mutations (mark-read / archive / mark-all-read /
  // preferences save) so the badge and the alerter both stay in sync
  // without waiting for the next poll/WS push.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChanged = () => {
      invalidateUnreadCountCache();
      getUnreadNotificationCount().then(setUnreadCount).catch(() => setUnreadCount(0));
      void refreshPrefs();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, [refreshPrefs]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
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
        {/* Suppress the list's own polling when the bell already has a
            live WS connection; otherwise the open dropdown and the bell
            would each fetch independently. */}
        <NotificationList
          onClose={() => setIsOpen(false)}
          embedded
          pollingEnabled={!isConnected && isPageVisible}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
