"use client";

import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { StandardPagination } from '@/components/StandardPagination';
import {
  Bell, BellRing, Check, CheckCheck, Trash2, Settings, Filter, Search,
  AlertTriangle, Info, CheckCircle2, XCircle, Clock, Stethoscope, TestTube,
  Pill, Calendar, Users, FileText, Shield, Activity, Mail, MailOpen
} from 'lucide-react';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'critical';
  category: 'system' | 'clinical' | 'lab' | 'pharmacy' | 'appointment' | 'admin';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

// Notifications data will be loaded from API

const categories = [
  { value: 'all', label: 'All Categories' },
  { value: 'system', label: 'System', icon: Settings },
  { value: 'clinical', label: 'Clinical', icon: Stethoscope },
  { value: 'lab', label: 'Laboratory', icon: TestTube },
  { value: 'pharmacy', label: 'Pharmacy', icon: Pill },
  { value: 'appointment', label: 'Appointments', icon: Calendar },
  { value: 'admin', label: 'Administration', icon: Shield },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      const matchesCategory = categoryFilter === 'all' || n.category === categoryFilter;
      const matchesType = typeFilter === 'all' || n.type === typeFilter;
      const matchesRead = readFilter === 'all' || (readFilter === 'unread' ? !n.isRead : n.isRead);
      return matchesCategory && matchesType && matchesRead;
    });
  }, [notifications, categoryFilter, typeFilter, readFilter]);

  const paginatedNotifications = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredNotifications.slice(start, start + itemsPerPage);
  }, [filteredNotifications, currentPage, itemsPerPage]);

  const stats = useMemo(() => ({
    total: notifications.length,
    unread: notifications.filter(n => !n.isRead).length,
    critical: notifications.filter(n => n.type === 'critical' && !n.isRead).length,
    today: notifications.filter(n => new Date(n.timestamp).toDateString() === new Date().toDateString()).length,
  }), [notifications]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'critical': return <AlertTriangle className="h-5 w-5 text-rose-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-rose-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'success': return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'info': default: return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'clinical': return <Stethoscope className="h-4 w-4" />;
      case 'lab': return <TestTube className="h-4 w-4" />;
      case 'pharmacy': return <Pill className="h-4 w-4" />;
      case 'appointment': return <Calendar className="h-4 w-4" />;
      case 'admin': return <Shield className="h-4 w-4" />;
      case 'system': default: return <Settings className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'critical': return 'bg-rose-500/10 text-rose-600 border-rose-500/30';
      case 'error': return 'bg-rose-500/10 text-rose-600 border-rose-500/30';
      case 'warning': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      case 'success': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
      case 'info': default: return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAsUnread = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: false } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    toast.success('All notifications marked as read');
  };

  const markSelectedAsRead = () => {
    setNotifications(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, isRead: true } : n));
    setSelectedIds(new Set());
    toast.success(`${selectedIds.size} notifications marked as read`);
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    toast.success('Notification deleted');
  };

  const deleteSelected = () => {
    setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
    const count = selectedIds.size;
    setSelectedIds(new Set());
    toast.success(`${count} notifications deleted`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedNotifications.map(n => n.id)));
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Bell className="h-8 w-8 text-blue-500" />
              Notifications
            </h1>
            <p className="text-muted-foreground mt-1">Stay updated on system events and alerts</p>
          </div>
          <div className="flex gap-2">
            {stats.unread > 0 && (
              <Button variant="outline" onClick={markAllAsRead}>
                <CheckCheck className="h-4 w-4 mr-2" />Mark All Read
              </Button>
            )}
            <Button variant="outline"><Settings className="h-4 w-4 mr-2" />Preferences</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Total</p><p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p></div>
                <Bell className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Unread</p><p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.unread}</p></div>
                <BellRing className="h-8 w-8 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Critical</p><p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.critical}</p></div>
                <AlertTriangle className="h-8 w-8 text-rose-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Today</p><p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.today}</p></div>
                <Clock className="h-8 w-8 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={readFilter} onValueChange={setReadFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>
              {selectedIds.size > 0 && (
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" size="sm" onClick={markSelectedAsRead}><Check className="h-4 w-4 mr-1" />Mark Read ({selectedIds.size})</Button>
                  <Button variant="outline" size="sm" onClick={deleteSelected} className="text-rose-600"><Trash2 className="h-4 w-4 mr-1" />Delete ({selectedIds.size})</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notifications List */}
        <Card>
          <CardContent className="p-0">
            {paginatedNotifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No notifications found</p>
              </div>
            ) : (
              <div className="divide-y">
                <div className="p-3 bg-muted/50 flex items-center gap-3">
                  <Checkbox checked={selectedIds.size === paginatedNotifications.length && paginatedNotifications.length > 0} onCheckedChange={toggleSelectAll} />
                  <span className="text-sm text-muted-foreground">Select all</span>
                </div>
                {paginatedNotifications.map(n => (
                  <div key={n.id} className={`p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors ${!n.isRead ? 'bg-blue-500/5' : ''}`}>
                    <Checkbox checked={selectedIds.has(n.id)} onCheckedChange={() => toggleSelect(n.id)} className="mt-1" />
                    <div className="flex-shrink-0 mt-1">{getTypeIcon(n.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-medium ${!n.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</h4>
                          {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(n.timestamp)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className={getTypeBadge(n.type)}>{n.type}</Badge>
                        <Badge variant="secondary" className="flex items-center gap-1">{getCategoryIcon(n.category)}{n.category}</Badge>
                        {n.actionUrl && <Button variant="link" size="sm" className="h-auto p-0 text-blue-500">{n.actionLabel || 'View'} →</Button>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => n.isRead ? markAsUnread(n.id) : markAsRead(n.id)}>
                        {n.isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteNotification(n.id)} className="text-rose-500 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <StandardPagination currentPage={currentPage} totalItems={filteredNotifications.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} itemName="notifications" />
        </Card>
      </div>
    </DashboardLayout>
  );
}
