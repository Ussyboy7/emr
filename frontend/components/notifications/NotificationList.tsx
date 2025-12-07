"use client";

import { logError } from '@/lib/client-logger';
import { useCallback, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  markNotificationAsArchived,
  type Notification,
} from '@/lib/notifications-storage';
// Format date with time
const formatDateTime = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};
import { Check, CheckCheck, Archive, ExternalLink, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { usePolling } from '@/hooks/use-polling';
import { NOTIFICATION_POLL_INTERVAL_MS } from '@/lib/constants';

interface NotificationListProps {
  onClose?: () => void;
}

export const NotificationList = ({ onClose }: NotificationListProps) => {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch unread notifications explicitly
      const unreadData = await getNotifications({ status: 'unread' });
      console.log('[NotificationList] Unread notifications:', unreadData);
      
      // Also fetch all notifications to show read ones
      const allData = await getNotifications();
      console.log('[NotificationList] All notifications:', allData);
      
      // Combine and deduplicate, prioritizing unread
      const notificationMap = new Map<string, Notification>();
      
      // Add unread notifications first
      unreadData.forEach((n) => {
        if (n.status !== 'archived') {
          notificationMap.set(n.id, n);
        }
      });
      
      // Add all other non-archived notifications
      allData.forEach((n) => {
        if (n.status !== 'archived' && !notificationMap.has(n.id)) {
          notificationMap.set(n.id, n);
        }
      });
      
      // Sort by created date (newest first)
      const sorted = Array.from(notificationMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      console.log('[NotificationList] Final notifications to display:', sorted);
      setNotifications(sorted);
    } catch (error) {
      console.error('[NotificationList] Error loading notifications:', error);
      logError('Failed to load notifications', error);
      // On error, try to at least fetch unread notifications
      try {
        const unreadData = await getNotifications({ status: 'unread' });
        console.log('[NotificationList] Fallback unread notifications:', unreadData);
        setNotifications(unreadData.filter((n) => n.status !== 'archived'));
      } catch (fallbackError) {
        console.error('[NotificationList] Fallback error:', fallbackError);
        logError('Failed to load unread notifications as fallback', fallbackError);
        setNotifications([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(loadNotifications, NOTIFICATION_POLL_INTERVAL_MS, {
    runImmediately: true,
  });

  const handleMarkRead = async (notification: Notification) => {
    try {
      await markNotificationAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, status: 'read' as const, readAt: new Date().toISOString() } : n))
      );
    } catch (error) {
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      await loadNotifications();
      toast.success('All notifications marked as read');
    } catch (error) {
      toast.error('Failed to mark all as read');
    }
  };

  const handleArchive = async (notification: Notification) => {
    try {
      await markNotificationAsArchived(notification.id);
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
      toast.success('Notification archived');
    } catch (error) {
      toast.error('Failed to archive notification');
    }
  };

  const handleClick = async (notification: Notification) => {
    if (notification.status === 'unread') {
      await handleMarkRead(notification);
    }

    if (notification.actionUrl) {
      if (notification.actionUrl.startsWith('http')) {
        window.open(notification.actionUrl, '_blank');
      } else {
        router.push(notification.actionUrl);
        onClose?.();
      }
    }
  };

  const getPriorityColor = (priority: Notification['priority']) => {
    switch (priority) {
      case 'urgent':
        return 'destructive';
      case 'high':
        return 'default';
      case 'normal':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">Loading notifications...</div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {unreadCount} new
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs h-7"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="text-xs h-7">
            <Link href="/settings#notifications">
              <Settings className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1" style={{ maxHeight: '500px' }}>
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <p>No notifications</p>
            <p className="text-xs mt-2">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 hover:bg-accent/50 cursor-pointer transition-colors ${
                  notification.status === 'unread' ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                }`}
                onClick={() => handleClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getPriorityColor(notification.priority)} className="text-xs">
                        {notification.priority}
                      </Badge>
                      {notification.status === 'unread' && (
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(notification.createdAt)}
                      </span>
                    </div>
                    <h4 className="font-medium text-sm mb-1">{notification.title}</h4>
                    <p className="text-sm text-muted-foreground line-clamp-2">{notification.message}</p>
                    {notification.actionUrl && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                        <ExternalLink className="h-3 w-3" />
                        <span>View details</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {notification.status === 'unread' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(notification);
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchive(notification);
                      }}
                    >
                      <Archive className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {notifications.length > 0 && (
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      )}
    </div>
  );
};
