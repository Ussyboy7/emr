"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { adminService, type AuditLog as ApiAuditLog } from "@/lib/services";
import {
  ClipboardList, Search, Eye, Download, Filter, User, Calendar, Clock,
  Activity, FileText, Settings, Shield, Users, Database, LogIn, LogOut,
  Edit, Trash2, Plus, CheckCircle, XCircle, AlertTriangle, RefreshCw, Loader2
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

const modules = ['All Modules', 'Authentication', 'Medical Records', 'Consultation', 'Nursing', 'Laboratory', 'Pharmacy', 'Radiology', 'Administration', 'Reports', 'System'];
const actions = ['All Actions', 'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT', 'APPROVE', 'REJECT'];

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Dialog states
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Load audit logs from API
  useEffect(() => {
    loadLogs();
  }, [currentPage, itemsPerPage]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const hasActiveFilters = searchQuery || moduleFilter !== 'all' || actionFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo;
      const pageSize = hasActiveFilters ? 1000 : itemsPerPage;
      
      const response = await adminService.getAuditLogs({ 
        page: hasActiveFilters ? 1 : currentPage,
        page_size: pageSize,
      });
      setTotalCount(response.count || response.results.length);
      
      // Transform API logs to frontend format
      const transformedLogs: AuditLog[] = response.results.map((log: ApiAuditLog) => ({
        id: log.id.toString(),
        timestamp: log.created_at,
        user: log.user_name || log.user_email || 'Unknown',
        userId: log.user?.toString() || '',
        role: '', // Would need to get from user
        action: log.action.toUpperCase() as AuditLog['action'],
        module: log.module || 'System',
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
      }));
      
      setLogs(transformedLogs);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
      toast.error('Failed to load audit logs. Please try again.');
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = !searchQuery || 
        log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.resourceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesModule = moduleFilter === 'all' || log.module === moduleFilter;
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;
      const matchesStatus = statusFilter === 'all' || log.status.toLowerCase() === statusFilter;
      
      let matchesDate = true;
      if (dateFrom) {
        matchesDate = matchesDate && new Date(log.timestamp) >= new Date(dateFrom);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59);
        matchesDate = matchesDate && new Date(log.timestamp) <= toDate;
      }
      
      return matchesSearch && matchesModule && matchesAction && matchesStatus && matchesDate;
    });
  }, [logs, searchQuery, moduleFilter, actionFilter, statusFilter, dateFrom, dateTo]);

  // Use filtered logs directly (server-side pagination when no client-side filters)
  const paginatedLogs = filteredLogs;

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, moduleFilter, actionFilter, statusFilter, dateFrom, dateTo, itemsPerPage]);

  const stats = useMemo(() => ({
    total: logs.length,
    success: logs.filter(l => l.status === 'Success').length,
    failed: logs.filter(l => l.status === 'Failed').length,
    today: logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length,
  }), [logs]);

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
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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

  const handleExport = () => {
    toast.success('Audit log exported successfully');
  };

  const handleRefresh = async () => {
    await loadLogs();
    toast.success('Audit logs refreshed');
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-violet-500" />
              Audit Trail
            </h1>
            <p className="text-muted-foreground mt-1">Monitor system activity and user actions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
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
                  <p className="text-3xl font-bold text-violet-600 dark:text-violet-400">{stats.total}</p>
                </div>
                <div className="p-3 rounded-full bg-violet-500/10"><Activity className="h-5 w-5 text-violet-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.today}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-500/10"><Calendar className="h-5 w-5 text-blue-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Successful</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.success}</p>
                </div>
                <div className="p-3 rounded-full bg-emerald-500/10"><CheckCircle className="h-5 w-5 text-emerald-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.failed}</p>
                </div>
                <div className="p-3 rounded-full bg-rose-500/10"><XCircle className="h-5 w-5 text-rose-500" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
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
                  {filteredLogs.length === 0 ? (
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
                          <p className="text-xs text-muted-foreground">{log.resourceId}</p>
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
              totalItems={filteredLogs.length}
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
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
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

