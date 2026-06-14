"use client";

import { formatDisplayDateTime } from '@/lib/dates';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  markNotificationAsArchived,
  type Notification,
} from '@/lib/notifications-storage';
import { logError } from '@/lib/client-logger';
import {
  Check,
  CheckCheck,
  Archive,
  ExternalLink,
  Settings,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { usePolling } from '@/hooks/use-polling';
import { NOTIFICATION_POLL_INTERVAL_MS } from '@/lib/constants';

const formatDateTime = (dateString: string): string => {
  if (!dateString) return '';
  const formatted = formatDisplayDateTime(dateString);
  return formatted === '—' ? '' : formatted;
};

const PRIORITY_RANK: Record<Notification['priority'], number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const TYPE_LABELS: Record<Notification['notification_type'], string> = {
  workflow: 'Workflow',
  lab_result: 'Lab result',
  radiology_result: 'Radiology result',
  prescription: 'Prescription',
  appointment: 'Appointment',
  system: 'System',
  alert: 'Alert',
  reminder: 'Reminder',
};

type StatusFilter = 'all' | 'unread' | 'read';

interface NotificationListProps {
  onClose?: () => void;
  /**
   * When ``true``, render the WebSocket-gated layout used inside the
   * bell dropdown (compact, no filter bar, paged via the "View all"
   * footer). When ``false``, render the full-page experience on
   * ``/notifications`` with filters and an unbounded scroll area.
   */
  embedded?: boolean;
  /** Set by the bell so this list does not poll when WS is live. */
  pollingEnabled?: boolean;
}

interface NotificationGroup {
  key: string;
  notifications: Notification[];
}

/** Group consecutive notifications with the same type + action URL. */
const groupNotifications = (notifications: Notification[]): NotificationGroup[] => {
  const groups: NotificationGroup[] = [];
  for (const n of notifications) {
    const last = groups[groups.length - 1];
    const key = `${n.notification_type}|${n.actionUrl ?? ''}`;
    if (last && last.key === key) {
      last.notifications.push(n);
    } else {
      groups.push({ key, notifications: [n] });
    }
  }
  return groups;
};

const priorityDot = (priority: Notification['priority']) => {
  if (priority === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" />
        Urgent
      </span>
    );
  }
  if (priority === 'high') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <AlertCircle className="h-3 w-3" />
        High
      </span>
    );
  }
  return null;
};

export const NotificationList = ({
  onClose,
  embedded = true,
  pollingEnabled = true,
}: NotificationListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const isNotificationsPage = pathname === '/notifications';

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Full-page filters.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | Notification['notification_type']>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Notification['priority']>('all');

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getNotifications();
      const visible = data
        .filter((n) => n.status !== 'archived')
        .sort((a, b) => {
          const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          if (pr !== 0) return pr;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      setNotifications(visible);
    } catch (error) {
      logError('Failed to load notifications', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Always do one fetch on mount/open so embedded bell mode still
  // renders data when periodic polling is intentionally disabled
  // (e.g. live WebSocket connection is active).
  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  usePolling(loadNotifications, NOTIFICATION_POLL_INTERVAL_MS, {
    enabled: pollingEnabled,
    runImmediately: true,
  });

  const handleMarkRead = useCallback(async (notification: Notification) => {
    try {
      await markNotificationAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id
            ? { ...n, status: 'read' as const, readAt: new Date().toISOString() }
            : n,
        ),
      );
    } catch {
      toast.error('Failed to mark notification as read');
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsAsRead();
      void loadNotifications();
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  }, [loadNotifications]);

  const handleArchive = useCallback(async (notification: Notification) => {
    try {
      await markNotificationAsArchived(notification.id);
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
      toast.success('Notification archived');
    } catch {
      toast.error('Failed to archive notification');
    }
  }, []);

  const handleClick = useCallback(
    async (notification: Notification) => {
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
    },
    [handleMarkRead, onClose, router],
  );

  // Apply page-level filters before grouping.
  const filtered = useMemo(() => {
    let rows = notifications;
    if (statusFilter !== 'all') {
      rows = rows.filter((n) => n.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      rows = rows.filter((n) => n.notification_type === typeFilter);
    }
    if (priorityFilter !== 'all') {
      rows = rows.filter((n) => n.priority === priorityFilter);
    }
    return rows;
  }, [notifications, statusFilter, typeFilter, priorityFilter]);

  const groups = useMemo(() => groupNotifications(filtered), [filtered]);
  const unreadCount = useMemo(
    () => notifications.filter((n) => n.status === 'unread').length,
    [notifications],
  );

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading && notifications.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">Loading notifications...</div>
    );
  }

  const showFilters = isNotificationsPage && !embedded;

  const renderRow = (n: Notification, isGrouped = false) => (
    <div
      key={n.id}
      className={`p-4 hover:bg-accent/50 cursor-pointer transition-colors ${
        n.status === 'unread' ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
      } ${isGrouped ? 'pl-10' : ''}`}
      onClick={() => handleClick(n)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {n.status === 'unread' && <span className="h-2 w-2 rounded-full bg-blue-500" />}
            {priorityDot(n.priority)}
            <span className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
          </div>
          <h4 className="font-medium text-sm mb-1">{n.title}</h4>
          <p className="text-sm text-muted-foreground line-clamp-2">{n.message}</p>
          {n.actionUrl && (
            <div className="flex items-center gap-1 mt-2 text-xs text-primary">
              <ExternalLink className="h-3 w-3" />
              <span>View details</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {n.status === 'unread' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleMarkRead(n);
              }}
              aria-label="Mark as read"
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
              handleArchive(n);
            }}
            aria-label="Archive"
          >
            <Archive className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Notifications</h3>
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
          <Button variant="ghost" size="sm" asChild className="text-xs h-7" aria-label="Preferences">
            <Link href="/settings#notifications">
              <Settings className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-muted/30 text-xs">
          <span className="text-muted-foreground">Filter:</span>
          {(['all', 'unread', 'read'] as StatusFilter[]).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className="h-7 text-xs capitalize"
            >
              {s}
            </Button>
          ))}
          <span className="mx-2 h-4 w-px bg-border" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="h-7 rounded border bg-background px-2 text-xs"
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}
            className="h-7 rounded border bg-background px-2 text-xs"
            aria-label="Filter by priority"
          >
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <span className="ml-auto text-muted-foreground">
            {filtered.length} of {notifications.length}
          </span>
        </div>
      )}

      <ScrollArea
        className="flex-1"
        style={isNotificationsPage && !embedded ? undefined : { maxHeight: '500px' }}
      >
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <p>No notifications</p>
            <p className="text-xs mt-2">You&apos;re all caught up!</p>
          </div>
        ) : (
          <div className="divide-y">
            {groups.map((group) => {
              if (group.notifications.length === 1) {
                return renderRow(group.notifications[0]);
              }
              const first = group.notifications[0];
              const isExpanded = expandedGroups.has(group.key);
              const groupUnread = group.notifications.filter((n) => n.status === 'unread').length;
              const typeLabel = TYPE_LABELS[first.notification_type] ?? first.notification_type;
              return (
                <div key={group.key}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 p-3 hover:bg-accent/50 text-left transition-colors"
                    onClick={() => toggleGroup(group.key)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {group.notifications.length} new
                    </Badge>
                    <span className="text-sm font-medium truncate">
                      {typeLabel}: {first.title}
                    </span>
                    {groupUnread > 0 && (
                      <span className="ml-auto text-xs text-blue-600 dark:text-blue-400">
                        {groupUnread} unread
                      </span>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="divide-y border-t bg-muted/30">
                      {group.notifications.map((n) => renderRow(n, true))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {notifications.length > 0 && embedded && !isNotificationsPage && (
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
            <Link href="/notifications" onClick={() => onClose?.()}>
              View all notifications
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
};
