"use client";
import { todayApiDateString, toApiDateFromInstant, formatDisplayDateMedium, formatDisplayTime } from "@/lib/dates";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAdminPageAuth } from '@/hooks/use-admin-page-auth';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { toast } from "sonner";
import { adminService, type AuditLog as ApiAuditLog } from "@/lib/services";
import {
  ClipboardList, Search, Eye, Download, User, Calendar, Clock,
  Activity, LogIn, LogOut, Edit, Trash2, Plus, CheckCircle, XCircle,
  AlertTriangle, Loader2
} from 'lucide-react';

interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  userId: string;
  role: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'IMPORT' | 'APPROVE' | 'REJECT';
  module: string;
  resource: string;
  resourceId: string;
  details: string;
  ipAddress: string;
  userAgent: string;
  status: 'Success' | 'Failed' | 'Warning';
  changes?: { field: string; oldValue: string; newValue: string }[];
}

const actions = ['All Actions', 'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT', 'APPROVE', 'REJECT', 'VERIFY'];
const resourceTypes = ['All Resources', 'support_ticket', 'patient', 'user', 'visit', 'prescription', 'lab_order'];

export default function AuditTrailPage() {
  const searchParams = useSearchParams();
  const { ready, handleAuthError } = useAdminPageAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modules, setModules] = useState<string[]>(['All Modules']);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [auditStats, setAuditStats] = useState({
    total: 0,
    success: 0,
    failed: 0,
    today: 0,
  });

  // Dialog states
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Load modules from API
  useEffect(() => {
    const loadModules = async () => {
      try {
        const res = await adminService.getAuditModules();
        const uniqueModules = new Set<string>(['All Modules']);
        (res.results || []).forEach((m) => {
          const moduleName = String(m || '')
            .split('_')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          if (moduleName.trim()) uniqueModules.add(moduleName);
        });
        setModules(Array.from(uniqueModules).sort());
      } catch (err) {
        console.error('Failed to load modules:', err);
        // No invented data: leave the picker with just "All Modules" so the
        // admin sees an honest empty state rather than ghost options that
        // never match a real audit log.
        setModules(['All Modules']);
        toast.error('Could not load audit module list from the server.');
      }
    };
    loadModules();
  }, []);

  useEffect(() => {
    const preset = searchParams.get('object_type');
    if (preset) {
      setResourceFilter(preset);
    }
  }, [searchParams]);

  const buildFilterParams = useCallback((overrides?: { page?: number; page_size?: number }) => {
    const params: Record<string, string | number> = {
      page: overrides?.page ?? currentPage,
      page_size: overrides?.page_size ?? itemsPerPage,
    };

    if (debouncedSearch) {
      params.search = debouncedSearch;
    }

    if (moduleFilter !== 'all') {
      params.module = moduleFilter
        .split(' ')
        .map((word: string) => word.toLowerCase())
        .join('_');
    }

    if (actionFilter !== 'all') {
      params.action = actionFilter.toLowerCase();
    }

    if (statusFilter !== 'all') {
      params.result = statusFilter.toLowerCase();
    }

    if (resourceFilter !== 'all') {
      params.object_type = resourceFilter;
    }

    if (dateFrom) {
      params.date_from = new Date(dateFrom).toISOString();
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      params.date_to = toDate.toISOString();
    }

    return params;
  }, [currentPage, itemsPerPage, debouncedSearch, moduleFilter, actionFilter, statusFilter, resourceFilter, dateFrom, dateTo]);

  const transformLog = (log: ApiAuditLog): AuditLog => ({
    id: log.id.toString(),
    timestamp: log.created_at,
    user: log.user_name || log.user_email || 'Unknown',
    userId: log.user?.toString() || '',
    role: log.user_role || '',
    action: log.action.toUpperCase() as AuditLog['action'],
    module: log.module
      ? log.module.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      : 'System',
    resource: log.object_type || '',
    resourceId: log.object_id?.toString() || log.object_repr || '',
    details: log.description || '',
    ipAddress: log.ip_address || '',
    userAgent: log.user_agent || '',
    status: log.result === 'success' ? 'Success' : log.result === 'failure' ? 'Failed' : 'Warning' as AuditLog['status'],
    changes: log.old_values && log.new_values ? Object.keys(log.new_values).map(key => ({
      field: key,
      oldValue: String(log.old_values?.[key] || ''),
      newValue: String(log.new_values?.[key] || ''),
    })) : undefined,
  });

  const loadAuditStats = useCallback(async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [stats, todayResp] = await Promise.all([
        adminService.getAuditStats(30),
        adminService.getAuditLogs({
          page: 1,
          page_size: 1,
          date_from: todayStart.toISOString(),
        }),
      ]);
      const byResult = stats.by_result || {};
      setAuditStats({
        total: stats.total_actions ?? 0,
        success: byResult.success ?? 0,
        failed: byResult.failure ?? 0,
        today: todayResp.count ?? 0,
      });
    } catch (err) {
      if (handleAuthError(err)) return;
    }
  }, [handleAuthError]);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await adminService.getAuditLogs(buildFilterParams());
      setTotalCount(response.count || response.results.length);
      setLogs(response.results.map(transformLog));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      setError(err.message || 'Failed to load audit logs');
      toast.error('Failed to load audit logs. Please try again.');
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [buildFilterParams, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadLogs();
  }, [ready, loadLogs]);

  useEffect(() => {
    if (!ready) return;
    void loadAuditStats();
  }, [ready, loadAuditStats]);

  // Server-side filtering is now handled in loadLogs, so we use logs directly
  const paginatedLogs = logs;

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [debouncedSearch, moduleFilter, actionFilter, statusFilter, resourceFilter, dateFrom, dateTo, itemsPerPage]);

  const stats = useMemo(() => auditStats, [auditStats]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATE': return <Plus className="h-4 w-4 text-emerald-500" />;
      case 'UPDATE': return <Edit className="h-4 w-4 text-blue-500" />;
      case 'DELETE': return <Trash2 className="h-4 w-4 text-rose-500" />;
      case 'VIEW': return <Eye className="h-4 w-4 text-gray-500" />;
      case 'LOGIN': return <LogIn className="h-4 w-4 text-green-500" />;
      case 'LOGOUT': return <LogOut className="h-4 w-4 text-orange-500" />;
      case 'EXPORT': return <Download className="h-4 w-4 text-purple-500" />;
      case 'APPROVE': return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'REJECT': return <XCircle className="h-4 w-4 text-rose-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'UPDATE': return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
      case 'DELETE': return 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10';
      case 'VIEW': return 'border-gray-500/50 text-gray-600 dark:text-gray-400 bg-gray-500/10';
      case 'LOGIN': return 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10';
      case 'LOGOUT': return 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10';
      case 'EXPORT': return 'border-purple-500/50 text-purple-600 dark:text-purple-400 bg-purple-500/10';
      case 'APPROVE': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'REJECT': return 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10';
      default: return 'border-muted-foreground/50 text-muted-foreground';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Success': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'Failed': return 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10';
      case 'Warning': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      default: return 'border-muted-foreground/50 text-muted-foreground';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: formatDisplayDateMedium(date),
      time: formatDisplayTime(date),
      relative: getRelativeTime(date),
    };
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const openViewDialog = (log: AuditLog) => {
    setSelectedLog(log);
    setIsViewDialogOpen(true);
  };

  const handleExport = async () => {
    try {
      const allRows: AuditLog[] = [];
      let page = 1;
      const pageSize = 200;
      let total = 0;

      do {
        const response = await adminService.getAuditLogs(buildFilterParams({ page, page_size: pageSize }));
        total = response.count || response.results.length;
        allRows.push(...response.results.map(transformLog));
        if (allRows.length >= total || response.results.length === 0) break;
        page += 1;
      } while (allRows.length < total);

      const headers = ['Timestamp', 'User', 'Action', 'Module', 'Resource', 'Resource ID', 'Details', 'Status', 'IP Address'];
      const rows = allRows.map(log => {
        const ts = formatTimestamp(log.timestamp);
        return [
          `${ts.date} ${ts.time}`,
          log.user,
          log.action,
          log.module,
          log.resource,
          log.resourceId,
          log.details.replace(/"/g, '""'),
          log.status,
          log.ipAddress,
        ].map(field => `"${field}"`).join(',');
      });

      const csvContent = [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `audit_logs_${todayApiDateString()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${allRows.length} audit logs`);
    } catch (err: any) {
      if (handleAuthError(err)) return;
      console.error('Export error:', err);
      toast.error('Failed to export audit logs');
    }
  };

  if (!ready) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-violet-500" />
              Audit Trail
            </h1>
            <p className="text-muted-foreground mt-1">Monitor system activity and user actions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />Export
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Events</p>
                  <p className="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">{stats.total}</p>
                </div>
                <div className="p-3 rounded-full bg-violet-500/10"><Activity className="h-5 w-5 text-violet-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today (this page)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.today}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-500/10"><Calendar className="h-5 w-5 text-blue-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Successful (this page)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.success}</p>
                </div>
                <div className="p-3 rounded-full bg-emerald-500/10"><CheckCircle className="h-5 w-5 text-emerald-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed (this page)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.failed}</p>
                </div>
                <div className="p-3 rounded-full bg-rose-500/10"><XCircle className="h-5 w-5 text-rose-500" /></div>
              </div>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Total Events matches your filters across all pages. Today, Successful, and Failed counts are for the{' '}
          <span className="font-medium text-foreground">current page only</span>.
        </p>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by user, details, or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  {modules.map(m => <SelectItem key={m} value={m === 'All Modules' ? 'all' : m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger><SelectValue placeholder="Resource" /></SelectTrigger>
                <SelectContent>
                  {resourceTypes.map((r) => (
                    <SelectItem key={r} value={r === 'All Resources' ? 'all' : r}>
                      {r === 'All Resources' ? r : r.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
                <SelectContent>
                  {actions.map(a => <SelectItem key={a} value={a === 'All Actions' ? 'all' : a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" />
            </div>
          </CardContent>
        </Card>

        {/* Audit Log Table */}
        <Card className="overflow-hidden">
          {loading ? (
            <CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
              <p>Loading audit logs...</p>
            </CardContent>
          ) : error ? (
            <CardContent className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" className="mt-4" onClick={loadLogs}>Retry</Button>
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Timestamp</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">User</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Action</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Module</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Details</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No audit logs found</td></tr>
                  ) : (
                  paginatedLogs.map((log) => {
                    const ts = formatTimestamp(log.timestamp);
                    return (
                      <tr key={log.id} className={`border-b hover:bg-muted/30 transition-colors ${log.status === 'Failed' ? 'bg-rose-500/5' : ''}`}>
                        <td className="p-4">
                          <p className="font-medium text-foreground">{ts.date}</p>
                          <p className="text-xs text-muted-foreground">{ts.time}</p>
                          <p className="text-xs text-muted-foreground">{ts.relative}</p>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{log.user}</p>
                              <p className="text-xs text-muted-foreground">{log.role}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={`flex items-center gap-1 w-fit ${getActionBadge(log.action)}`}>
                            {getActionIcon(log.action)}
                            {log.action}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline">{log.module}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">{log.resource}</p>
                        </td>
                        <td className="p-4 max-w-[250px]">
                          <p className="text-sm text-foreground truncate">{log.details}</p>
                          {log.resourceId ? (
                            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                              Object ID: {log.resourceId}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={getStatusBadge(log.status)}>
                            {log.status === 'Success' && <CheckCircle className="h-3 w-3 mr-1" />}
                            {log.status === 'Failed' && <XCircle className="h-3 w-3 mr-1" />}
                            {log.status === 'Warning' && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {log.status}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <Button variant="ghost" size="sm" onClick={() => openViewDialog(log)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !error && (
            <div className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="logs"
            />
            </div>
          )}
        </Card>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className={MODAL_SIZES.lg}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-violet-500" />Audit Log Details</DialogTitle>
              <DialogDescription>{selectedLog?.id}</DialogDescription>
            </DialogHeader>
            {selectedLog && (
              <div className="py-4 space-y-4">
                {/* Status and Action */}
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getStatusBadge(selectedLog.status)}>
                    {selectedLog.status === 'Success' && <CheckCircle className="h-3 w-3 mr-1" />}
                    {selectedLog.status === 'Failed' && <XCircle className="h-3 w-3 mr-1" />}
                    {selectedLog.status}
                  </Badge>
                  <Badge variant="outline" className={getActionBadge(selectedLog.action)}>
                    {getActionIcon(selectedLog.action)}
                    <span className="ml-1">{selectedLog.action}</span>
                  </Badge>
                  <Badge variant="outline">{selectedLog.module}</Badge>
                </div>

                {/* User and Timestamp */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">User</p>
                      <p className="font-medium">{selectedLog.user}</p>
                      <p className="text-xs text-muted-foreground">{selectedLog.role} • {selectedLog.userId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Timestamp</p>
                      <p className="font-medium">{formatTimestamp(selectedLog.timestamp).date}</p>
                      <p className="text-xs text-muted-foreground">{formatTimestamp(selectedLog.timestamp).time}</p>
                    </div>
                  </div>
                </div>

                {/* Resource Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Resource</p>
                    <p className="font-medium">{selectedLog.resource}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Resource ID</p>
                    <p className="font-medium">{selectedLog.resourceId}</p>
                  </div>
                </div>

                {/* Details */}
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Details</p>
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm">{selectedLog.details}</p>
                  </div>
                </div>

                {/* Changes */}
                {selectedLog.changes && selectedLog.changes.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Changes Made</p>
                    <div className="space-y-2">
                      {selectedLog.changes.map((change, i) => (
                        <div key={i} className="p-3 rounded-lg border bg-muted/30">
                          <p className="font-medium text-sm">{change.field}</p>
                          <div className="flex items-center gap-2 mt-1 text-sm">
                            <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 line-through">{change.oldValue || '(empty)'}</span>
                            <span>→</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">{change.newValue || '(empty)'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Technical Info */}
                <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                  <div>
                    <p className="text-muted-foreground">IP Address</p>
                    <p className="font-mono">{selectedLog.ipAddress}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">User Agent</p>
                    <p className="truncate">{selectedLog.userAgent}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

