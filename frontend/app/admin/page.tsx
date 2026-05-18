"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { adminService } from "@/lib/services";
import { toast } from "sonner";
import { GenericMedicationsModal } from "@/components/admin/GenericMedicationsModal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Users,
  Shield,
  ShieldCheck,
  Building2,
  DoorOpen,
  Settings,
  ClipboardList,
  Activity,
  AlertTriangle,
  CheckCircle,
  Server,
  Database,
  Wifi,
  HardDrive,
  RefreshCw,
  UserPlus,
  Key,
  Stethoscope,
  ChevronRight,
  AlertCircle,
  Loader2,
  Pill,
  Workflow,
} from "lucide-react";
import Link from "next/link";

export default function AdminDashboardPage() {
  const { currentUser } = useCurrentUser();
  type BackupStatus = {
    status?: string;
    message?: string;
    lastBackup?: string;
    hoursAgo?: number;
    filename?: string;
  };
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [showGenericsModal, setShowGenericsModal] = useState(false);
  const [systemStats, setSystemStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    onlineNow: 0,
    totalRoles: 0,
    rolesInUse: 0,
    totalClinics: 0,
    activeClinics: 0,
    totalRooms: 0,
    availableRooms: 0,
    occupiedRooms: 0,
  });
  const [usersByRole, setUsersByRole] = useState<any[]>([]);
  const [recentAuditEvents, setRecentAuditEvents] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any[]>([]);
  const [clinicStatus, setClinicStatus] = useState<any[]>([]);
  const [expiringLicenses, setExpiringLicenses] = useState<any[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    responseTimeMs: undefined as number | undefined,
    errorRate: undefined as number | undefined,
    mediaStorageGb: undefined as number | undefined,
    responseTimeSample: undefined as number | undefined,
    backupStatus: { status: 'unknown' } as BackupStatus,
  });
  const [presenceWindowSeconds, setPresenceWindowSeconds] = useState(120);
  const [metricSources, setMetricSources] = useState<Record<string, 'live' | 'sample'>>({});

  // Auto-poll hits the slim /common/dashboard/live/ endpoint every 30s.
  // Backend bumps last_activity at most every 30s per user on API calls.
  const POLL_INTERVAL_MS = 30_000;
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);

  // Silent ticks call a slim ``/common/dashboard/live/`` endpoint that
  // only returns ``onlineNow`` + ``systemHealth``. We skip the heavy
  // users/roles/audit fan-out for those — KPI cards like Total Users
  // and Recent Audit Activity don't shift in 30 s anyway, so a full
  // refetch every tick was wasted bandwidth and DB load.
  const loadLiveSlice = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const live = await adminService.getDashboardLive();
      if (!isMountedRef.current) return;
      setSystemStats(prev => ({ ...prev, onlineNow: live.onlineNow }));
      if (live.presenceWindowSeconds) {
        setPresenceWindowSeconds(live.presenceWindowSeconds);
      }
      const iconMap: Record<string, any> = {
        'Server': Server,
        'Database': Database,
        'HardDrive': HardDrive,
        'Wifi': Wifi,
      };
      const withIcons = (live.systemHealth || []).map((s: any) => ({
        ...s,
        icon: iconMap[s.icon as string] || Server,
      }));
      if (withIcons.length > 0) setSystemHealth(withIcons);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      // Background tick — fail silently, the previous payload remains.
      console.debug('Live tick failed', err);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const loadDashboardData = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (inFlightRef.current) return; // de-dup overlapping polls
    inFlightRef.current = true;
    try {
      if (!opts.silent) setLoading(true);
      setError(null);
      const stats = await adminService.getDashboardStats();
      setSystemStats({
        totalUsers: stats.totalUsers,
        activeUsers: stats.activeUsers,
        inactiveUsers: stats.inactiveUsers,
        onlineNow: stats.onlineNow,
        totalRoles: stats.totalRoles,
        rolesInUse: stats.rolesInUse,
        totalClinics: stats.totalClinics,
        activeClinics: stats.activeClinics,
        totalRooms: stats.totalRooms,
        availableRooms: stats.availableRooms,
        occupiedRooms: stats.occupiedRooms,
      });
      if (stats.presenceWindowSeconds) {
        setPresenceWindowSeconds(stats.presenceWindowSeconds);
      }
      
      setPerformanceMetrics({
        responseTimeMs: stats.responseTimeMs,
        errorRate: stats.errorRate,
        mediaStorageGb: stats.mediaStorageGb,
        responseTimeSample: stats.responseTimeSample,
        backupStatus: stats.backupStatus ?? { status: 'unknown' },
      });
      setMetricSources(stats.metricSources ?? {});
      
      setUsersByRole(stats.usersByRole);
      setRecentAuditEvents(stats.recentAuditEvents);
      // Map icon names to React components
      const iconMap: Record<string, any> = {
        'Server': Server,
        'Database': Database,
        'HardDrive': HardDrive,
        'Wifi': Wifi,
      };
      const systemHealthWithIcons = stats.systemHealth.map(system => ({
        ...system,
        icon: iconMap[system.icon as string] || Server, // Default to Server if icon not found
      }));
      setSystemHealth(systemHealthWithIcons);
      setClinicStatus(stats.clinicStatus);
      setExpiringLicenses(stats.expiringLicenses ?? []);
      if (isMountedRef.current) {
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
      // Don't spam toasts on background polls — only on the initial
      // load or a user-triggered refresh.
      if (!opts.silent) {
        toast.error('Failed to load dashboard. Please try again.');
      }
      console.error('Error loading dashboard:', err);
    } finally {
      if (!opts.silent && isMountedRef.current) setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadDashboardData();

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        loadLiveSlice();
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    startPolling();

    // When the tab becomes visible again, kick off an immediate
    // refresh so the user doesn't stare at a stale snapshot for up to
    // 30 seconds before the next interval fires.
    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        loadLiveSlice();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      isMountedRef.current = false;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadDashboardData, loadLiveSlice]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData({ silent: true });
    setIsRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy": case "open": case "success": return "text-green-500";
      case "warning": return "text-yellow-500";
      case "error": case "closed": case "failed": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high": return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">High</Badge>;
      case "medium": return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Medium</Badge>;
      case "low": return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Low</Badge>;
      default: return <Badge variant="outline">Normal</Badge>;
    }
  };

  const totalUsers = usersByRole.reduce((sum, r) => sum + r.count, 0);
  const presenceWindowLabel =
    presenceWindowSeconds < 60
      ? `last ${presenceWindowSeconds}s`
      : `last ${Math.round(presenceWindowSeconds / 60)} min`;
  const backupStatus = performanceMetrics.backupStatus;
  // The backend returns status="unknown" + message="No backup files found"
  // when it successfully checked all backup dirs and they were empty.
  // That's a distinct (and actionable) state from truly unknown, so we
  // surface it as "No backups" with a warning tone.
  const noBackupsFound =
    backupStatus.status === "unknown" &&
    /no backup files found/i.test(backupStatus.message || "");
  const backupBadgeVariant =
    backupStatus.status === "healthy"
      ? "bg-green-500/10 text-green-700 border-green-500/20"
      : backupStatus.status === "warning" || noBackupsFound
        ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
        : backupStatus.status === "error"
          ? "bg-red-500/10 text-red-700 border-red-500/20"
          : "bg-muted text-muted-foreground border-border";
  const backupLabel =
    backupStatus.status === "healthy"
      ? "Healthy"
      : noBackupsFound
        ? "No backups"
        : backupStatus.status === "warning"
          ? "Warning"
          : backupStatus.status === "error"
            ? "Error"
            : "Unknown";
  const backupDescription = backupStatus.lastBackup
    ? `Last backup ${backupStatus.hoursAgo} hour${backupStatus.hoursAgo === 1 ? "" : "s"} ago${backupStatus.filename ? ` (${backupStatus.filename})` : ""}.`
    : noBackupsFound
      ? "No backup files found in the configured locations. Schedule a backup job to start tracking."
      : backupStatus.message || "Backup telemetry isn’t available yet.";

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Administration Dashboard</h1>
            <p className="text-muted-foreground">Enterprise healthcare system monitoring and user management</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {lastUpdated && (
              <span className="text-sm text-muted-foreground">
                Last updated: {lastUpdated}
              </span>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not refresh dashboard</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* System Summary — onlineNow is session-based (API returns 0
            until tracking exists); avoid calling it "active users"
            (that is activeUsers). "Last updated" was duplicated here
            and in the page header — removed from the bar. */}
        <Card className="bg-gradient-to-r from-slate-900/50 to-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium text-green-400">System Status: Operational</span>
              </div>
              <div className="hidden h-4 w-px bg-slate-600 sm:block" />
              <div className="flex items-center gap-2">
                <span className="relative inline-flex h-2 w-2" title="Auto-refreshing every 30s">
                  <span className="absolute inset-0 rounded-full bg-green-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                <span className="text-sm text-slate-300">
                  {systemStats.onlineNow} online now
                  <span className="text-slate-500"> (recent API activity · {presenceWindowLabel})</span>
                </span>
              </div>
              <div className="hidden h-4 w-px bg-slate-600 sm:block" />
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-400" />
                <span className="text-sm text-slate-300">{systemStats.activeClinics} clinics operational</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Stats — five cards on lg+.
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Loading...</p>
                      <p className="text-2xl font-bold mt-1"><Loader2 className="h-6 w-6 animate-spin" /></p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Users</p>
                      <p className="text-2xl font-bold text-blue-500">{systemStats.totalUsers}</p>
                    </div>
                    <Users className="h-8 w-8 text-blue-500/50" />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-green-500">{systemStats.activeUsers} active</span>
                    {systemStats.inactiveUsers > 0 && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">{systemStats.inactiveUsers} inactive</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-muted-foreground">Online Now</p>
                    <span className="relative inline-flex h-2 w-2" title="Auto-refreshing every 30s">
                      <span className="absolute inset-0 rounded-full bg-green-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-green-500">{systemStats.onlineNow}</p>
                </div>
                <Activity className="h-8 w-8 text-green-500/50" />
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {presenceWindowLabel} · live
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Roles</p>
                  <p className="text-2xl font-bold text-violet-500">{systemStats.totalRoles}</p>
                </div>
                <Shield className="h-8 w-8 text-violet-500/50" />
              </div>
              <div className="mt-2 text-xs">
                {systemStats.totalRoles === 0 ? (
                  <Link href="/admin/roles" className="text-violet-600 hover:underline">
                    Configure roles →
                  </Link>
                ) : (
                  <span className="text-green-500">{systemStats.rolesInUse} in use</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Clinics</p>
                  <p className="text-2xl font-bold text-amber-500">{systemStats.totalClinics}</p>
                </div>
                <Building2 className="h-8 w-8 text-amber-500/50" />
              </div>
              <div className="mt-2 text-xs">
                <span className="text-green-500">{systemStats.activeClinics} open</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rooms</p>
                  <p className="text-2xl font-bold text-cyan-500">{systemStats.totalRooms}</p>
                </div>
                <DoorOpen className="h-8 w-8 text-cyan-500/50" />
              </div>
              <div className="mt-2 text-xs">
                {systemStats.totalRooms === 0 ? (
                  <Link href="/admin/rooms" className="text-cyan-600 hover:underline">
                    Configure rooms →
                  </Link>
                ) : (
                  <span className="text-green-500">{systemStats.availableRooms} available</span>
                )}
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Users by Role */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Users by Role</CardTitle>
                  <Link href="/admin/users">
                    <Button variant="ghost" size="sm">View All <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : usersByRole.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No role data available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {usersByRole
                      .filter(role => role.role !== 'No Role') // Filter out "No Role" entries
                      .sort((a, b) => b.count - a.count) // Sort by count descending
                      .map((role) => {
                      const percentage = totalUsers > 0 ? (role.count / totalUsers) * 100 : 0;
                      return (
                        <div key={role.role} className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${role.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm truncate">{role.role}</span>
                              <span className="text-sm font-medium">{role.count}</span>
                            </div>
                            <Progress value={percentage} className="h-1.5 mt-1" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Audit Activity */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Recent Audit Activity</CardTitle>
                  <Link href="/admin/audit">
                    <Button variant="ghost" size="sm">View All <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : recentAuditEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No recent activity</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentAuditEvents.slice(0, 5).map((event) => ( // Limit to 5 most recent
                    <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <div className={`mt-0.5 ${event.status === "success" ? "text-green-500" : event.status === "warning" ? "text-yellow-500" : "text-red-500"}`}>
                        {event.status === "success" ? <CheckCircle className="h-4 w-4" /> :
                         event.status === "warning" ? <AlertTriangle className="h-4 w-4" /> :
                         <AlertCircle className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{event.user}</span>
                          <Badge variant="outline" className="text-xs capitalize">{event.action}</Badge>
                          <Badge variant="secondary" className="text-xs">{event.module}</Badge>
                        </div>
                        {event.detail && <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.detail}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{event.time}</span>
                    </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Alerts */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">System Alerts</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Backups, staff licenses expiring soon, and other items that need an admin&rsquo;s attention.
                    </p>
                  </div>
                  <Link href="/admin/settings">
                    <Button variant="ghost" size="sm">Settings <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Baseline "all clear" row. We don't have an
                        incident source feeding this yet, so the old
                        "Live" badge over-promised real-time monitoring.
                        Reads as a default no-alerts state until the
                        backup, license, and (future) incident checks
                        below say otherwise. */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/10 dark:text-green-100">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-700 dark:text-green-300">No active incidents</p>
                        <p className="text-xs text-green-600 dark:text-green-400/90">Nothing reported by the checks below.</p>
                      </div>
                    </div>

                    <Link
                      href="/admin/settings"
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <Activity className={`h-5 w-5 flex-shrink-0 ${getStatusColor(backupStatus.status || "unknown")}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">Backup status</p>
                        <p className="text-xs text-muted-foreground">{backupDescription}</p>
                      </div>
                      <Badge className={`text-[10px] shrink-0 ${backupBadgeVariant}`}>{backupLabel}</Badge>
                    </Link>

                    {expiringLicenses.length > 0 ? (
                      expiringLicenses.slice(0, 3).map((lic, idx) => (
                        <Link
                          key={`${lic.name}-${lic.expires}-${idx}`}
                          href="/admin/users"
                          className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-colors"
                        >
                          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Staff license expiring</p>
                            <p className="text-xs text-amber-600 dark:text-amber-400/90 truncate">
                              {lic.name} — {lic.daysLeft} day{lic.daysLeft !== 1 ? "s" : ""} left
                            </p>
                          </div>
                          <span className="text-xs text-amber-600 dark:text-amber-400 whitespace-nowrap">Warning</span>
                        </Link>
                      ))
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
                        <CheckCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">No upcoming staff license expirations</p>
                          <p className="text-xs text-muted-foreground">Next 90 days (from user license_expiry field)</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Clinic Status */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Clinic Status</CardTitle>
                  <Link href="/admin/clinics">
                    <Button variant="ghost" size="sm">Manage <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                )}
                {!loading && clinicStatus.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No clinics found</p>
                  </div>
                )}
                {!loading && clinicStatus.length > 0 && (
                  <div className="space-y-2">
                    {clinicStatus.map((clinic) => {
                      const statusBgClass = clinic.status === "open" ? "bg-green-500" : "bg-red-500";
                      const badgeClass = clinic.status === "open" 
                        ? "bg-green-500 bg-opacity-10 text-green-500" 
                        : "bg-red-500 bg-opacity-10 text-red-500";
                      const dotClass = "w-2 h-2 rounded-full " + statusBgClass;
                      return (
                        <div key={clinic.name} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 border border-border/50">
                          <div className="flex items-center gap-3">
                            <div className={dotClass} />
                            <div>
                              <span className="text-sm font-medium">{clinic.name}</span>
                              <div className="text-xs text-muted-foreground">
                                {clinic.patients} patients seen • {clinic.doctors} doctors active
                                <span className="text-muted-foreground/60"> · last 30d</span>
                              </div>
                            </div>
                          </div>
                          <Badge className={badgeClass}>
                            {clinic.status === 'open' ? 'Operational' : 'Closed'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* System Health */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">System Health</CardTitle>
                  <Link href="/admin/settings">
                    <Button variant="ghost" size="sm">View Details <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                )}
                {!loading && (
                  <div className="space-y-3">
                    {systemHealth.map((system) => {
                      const IconComponent = system.icon;
                      const iconColorClass = getStatusColor(system.status as string);
                      const iconClass = "h-5 w-5 " + iconColorClass;
                      const uptimeText = (system as Record<string, unknown>).uptime as string | null | undefined;
                      const detailText = (system as Record<string, unknown>).detail as string | undefined;
                      return (
                        <div key={system.name as string} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                          <div className="flex items-start gap-3 min-w-0">
                            <IconComponent className={iconClass} />
                            <div className="min-w-0">
                              <span className="text-sm font-medium">{system.name as string}</span>
                              {uptimeText && (
                                <div className="text-xs text-muted-foreground">Up {uptimeText}</div>
                              )}
                              {detailText && (
                                <div className="text-[11px] text-muted-foreground/80 truncate" title={detailText}>{detailText}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {system.status === "healthy" && (
                              <Badge className="bg-green-500/10 text-green-700 border-green-500/20 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Healthy
                              </Badge>
                            )}
                            {system.status === "warning" && (
                              <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20 text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Warning
                              </Badge>
                            )}
                            {system.status === "error" && (
                              <Badge className="bg-red-500/10 text-red-700 border-red-500/20 text-xs">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Error
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance Metrics — only renders values the backend
                explicitly flags as ``live`` in /common/metrics/. The
                old card cheerfully showed 245ms response time and 0.02%
                error rate which were hardcoded defaults in the view;
                until middleware/APM populates ``avg_response_time_ms``
                and an error source, those rows show "Not connected".
                The storage metric used to be labelled "Data Processed
                today" but is actually the cumulative MEDIA_ROOT size,
                so it's renamed accordingly. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Performance Metrics</CardTitle>
                <p className="text-xs text-muted-foreground font-normal mt-1">
                  Live values from the system. Rows marked &ldquo;Not connected&rdquo; need an APM or logging integration.
                </p>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <PerfRow
                      label="Response Time"
                      value={performanceMetrics.responseTimeMs !== undefined ? `${performanceMetrics.responseTimeMs}ms` : null}
                      source={metricSources['responseTimeMs']}
                      hint={
                        performanceMetrics.responseTimeSample
                          ? `Rolling 5-min avg over ${performanceMetrics.responseTimeSample} request${performanceMetrics.responseTimeSample === 1 ? '' : 's'}.`
                          : 'Waiting for API traffic — the rolling average needs at least one request in the last 5 minutes.'
                      }
                    />
                    <PerfRow
                      label="Error Rate"
                      value={performanceMetrics.errorRate !== undefined ? `${performanceMetrics.errorRate.toFixed(2)}%` : null}
                      source={metricSources['errorRate']}
                      hint={
                        performanceMetrics.responseTimeSample
                          ? `Share of 5xx responses over the last 5 minutes (${performanceMetrics.responseTimeSample} sampled).`
                          : 'Waiting for API traffic — rolling 5-min window has no requests yet.'
                      }
                    />
                    <PerfRow
                      label="Media storage used"
                      value={performanceMetrics.mediaStorageGb !== undefined ? `${performanceMetrics.mediaStorageGb.toFixed(2)} GB` : null}
                      source={metricSources['mediaStorageGb']}
                      hint="Cumulative size of MEDIA_ROOT on the API server."
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* User Management */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">User Management</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href="/admin/users">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <UserPlus className="h-5 w-5 text-blue-500" />
                          <span className="text-xs">Add User</span>
                        </Button>
                      </Link>
                      <Link href="/admin/roles">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <Key className="h-5 w-5 text-violet-500" />
                          <span className="text-xs">Manage Roles</span>
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* System Management */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">System Management</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href="/admin/rooms">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <DoorOpen className="h-5 w-5 text-cyan-500" />
                          <span className="text-xs">Rooms</span>
                        </Button>
                      </Link>
                      <Link href="/admin/clinics">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <Building2 className="h-5 w-5 text-amber-500" />
                          <span className="text-xs">Clinics</span>
                        </Button>
                      </Link>
                      <Button 
                        variant="outline" 
                        className="w-full h-auto py-3 flex flex-col items-center gap-1" 
                        onClick={() => setShowGenericsModal(true)}
                      >
                        <Pill className="h-5 w-5 text-violet-500" />
                        <span className="text-xs">Generics</span>
                      </Button>
                      <div></div> {/* Empty div to maintain grid layout */}
                    </div>
                  </div>

                  {/* System Tools */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">System Tools</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href="/admin/settings">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <Settings className="h-5 w-5 text-slate-500" />
                          <span className="text-xs">Settings</span>
                        </Button>
                      </Link>
                      <Link href="/admin/audit">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <ClipboardList className="h-5 w-5 text-rose-500" />
                          <span className="text-xs">Audit Trail</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <GenericMedicationsModal 
        open={showGenericsModal} 
        onOpenChange={setShowGenericsModal} 
      />
    </DashboardLayout>
  );
}

function PerfRow({
  label,
  value,
  source,
  hint,
}: {
  label: string;
  /** Numeric value when the metric is live; null when the backend
   *  omitted it because no real source is wired. */
  value: string | null;
  source?: 'live' | 'sample';
  hint?: string;
}) {
  const isLive = value !== null && source === 'live';
  const isSample = value !== null && source !== 'live';
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-muted-foreground truncate">{label}</span>
        {hint && (
          <span className="text-[11px] text-muted-foreground/70 truncate" title={hint}>{hint}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isLive && (
          <span className="text-sm font-medium tabular-nums">{value}</span>
        )}
        {isSample && (
          <>
            <span
              className="text-sm font-medium tabular-nums text-muted-foreground/80"
              title="Sample value — not from a live metrics source"
            >
              {value}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300 border border-amber-500/40 bg-amber-500/10 rounded px-1 py-0.5">
              Sample
            </span>
          </>
        )}
        {value === null && (
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground border border-border bg-muted/40 rounded px-1.5 py-0.5">
            Not connected
          </span>
        )}
      </div>
    </div>
  );
}
