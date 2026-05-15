'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Eye,
  Calendar,
  Clock,
  CheckCircle2,
  Activity,
  ArrowRight,
  ClipboardList,
  TrendingUp,
  Plus,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { useServerToday } from '@/hooks/use-server-today';
import { toast } from 'sonner';
import { eyeCareService, type EyeOrder, type EyeSession } from '@/lib/services/eye-care-service';
import { NewEyeOrderModal } from '@/components/eyecare/NewEyeOrderModal';
import { EyecarePatientFinder } from '@/components/eyecare/EyecarePatientFinder';

interface EyeDashboardStats {
  queue: number;
  inProgress: number;
  activeSessions: number;
  completedToday: number;
  scheduledToday: number;
}

function ymdFromIso(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function sessionSubtitle(session: EyeSession): string {
  const order = session.order_details;
  return (
    order?.chief_complaint ||
    order?.diagnosis ||
    session.findings ||
    session.procedures_performed ||
    'Eye clinic review underway'
  );
}

export default function EyeClinicPage() {
  const router = useRouter();
  const serverToday = useServerToday();
  const [authError, setAuthError] = useState<unknown>(null);
  useAuthRedirect(authError);

  const [stats, setStats] = useState<EyeDashboardStats>({
    queue: 0,
    inProgress: 0,
    activeSessions: 0,
    completedToday: 0,
    scheduledToday: 0,
  });
  const [queuePreview, setQueuePreview] = useState<EyeOrder[]>([]);
  const [inProgressOrders, setInProgressOrders] = useState<EyeOrder[]>([]);
  const [activeSessions, setActiveSessions] = useState<EyeSession[]>([]);
  const [recentCompletedSessions, setRecentCompletedSessions] = useState<EyeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const dayStart = `${serverToday}T00:00:00`;
      const dayEnd = `${serverToday}T23:59:59`;

      const [
        queueRes,
        inProgressRes,
        activeSessionsCountRes,
        activeSessionsListRes,
        completedTodayRes,
        queueListRes,
        queuePreviewRes,
        inProgressPreviewRes,
        recentCompletedRes,
      ] = await Promise.all([
        eyeCareService.getOrders({ status_tab: 'pending', date_filter: 'all', page_size: 1 }),
        eyeCareService.getOrders({ status_tab: 'in_progress', date_filter: 'all', page_size: 1 }),
        eyeCareService.getSessions({ status: 'in_progress', page_size: 1 }),
        eyeCareService.getSessions({ status: 'in_progress', page_size: 5 }),
        eyeCareService.getSessions({
          status: 'completed',
          completed_after: dayStart,
          completed_before: dayEnd,
          page_size: 1,
        }),
        eyeCareService.getOrders({ status_tab: 'pending', date_filter: 'all', page_size: 100 }),
        eyeCareService.getOrders({ status_tab: 'pending', date_filter: 'all', page: 1, page_size: 4 }),
        eyeCareService.getOrders({ status_tab: 'in_progress', date_filter: 'all', page: 1, page_size: 4 }),
        eyeCareService.getSessions({
          status: 'completed',
          completed_after: dayStart,
          completed_before: dayEnd,
          page: 1,
          page_size: 5,
        }),
      ]);

      const scheduledToday = (queueListRes.results ?? []).filter(
        (order) => ymdFromIso(order.scheduled_at) === serverToday,
      ).length;

      setStats({
        queue: queueRes.count ?? 0,
        inProgress: inProgressRes.count ?? 0,
        activeSessions: activeSessionsCountRes.count ?? 0,
        completedToday: completedTodayRes.count ?? 0,
        scheduledToday,
      });
      setQueuePreview(queuePreviewRes.results ?? []);
      setInProgressOrders(inProgressPreviewRes.results ?? []);
      setActiveSessions(activeSessionsListRes.results ?? []);
      setRecentCompletedSessions(recentCompletedRes.results ?? []);
    } catch (error) {
      console.error('Error loading eye clinic dashboard:', error);
      if (isAuthenticationError(error)) {
        setAuthError(error);
      } else {
        toast.error('Failed to load eye clinic dashboard. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [serverToday]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const activePatients = useMemo(
    () => Math.max(stats.inProgress, stats.activeSessions),
    [stats.inProgress, stats.activeSessions],
  );

  const activeWorkCount = useMemo(
    () => stats.queue + stats.inProgress,
    [stats.queue, stats.inProgress],
  );

  const hasPendingTasks = activeWorkCount > 0 || stats.activeSessions > 0;

  const pendingTasks = useMemo(() => {
    const seen = new Set<number>();
    const merged: EyeOrder[] = [];
    for (const order of [...inProgressOrders, ...queuePreview]) {
      if (seen.has(order.id)) continue;
      seen.add(order.id);
      merged.push(order);
    }
    return merged.slice(0, 4);
  }, [inProgressOrders, queuePreview]);

  const recentActivity = useMemo(() => {
    const activeItems = activeSessions
      .filter((session) => session.status === 'in_progress')
      .map((session) => ({
        id: `session-${session.id}`,
        title: session.order_details?.patient_name
          ? `${session.order_details.patient_name} — session ${session.session_number}`
          : `Session ${session.session_number} in progress`,
        subtitle: sessionSubtitle(session),
        time: session.started_at || session.scheduled_at,
        tone: 'active' as const,
      }));

    const completedItems = recentCompletedSessions.map((session) => ({
      id: `session-done-${session.id}`,
      title: session.order_details?.patient_name
        ? `${session.order_details.patient_name} session completed`
        : `Session ${session.session_number} completed`,
      subtitle: sessionSubtitle(session),
      time: session.completed_at || session.started_at || session.scheduled_at,
      tone: 'completed' as const,
    }));

    return [...activeItems, ...completedItems]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5);
  }, [activeSessions, recentCompletedSessions]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <Card className="bg-gradient-to-r from-sky-500 to-cyan-600 text-white border-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Eye className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold">Eye Clinic</h1>
                  <p className="text-sm sm:text-base text-sky-100">
                    Vision assessment, order processing, and follow-up workflow management
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-white text-sky-700 hover:bg-sky-50 shadow-md"
                  onClick={() => setIsNewOrderModalOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Eye Order
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  asChild
                >
                  <Link href="/eyecare/orders">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Review Orders
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => void loadDashboard()}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <EyecarePatientFinder />

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Today&apos;s Overview
            {!loading && (
              <span className="text-xs font-normal text-muted-foreground">({serverToday})</span>
            )}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Loading...</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <p className="text-2xl sm:text-3xl font-bold text-muted-foreground">--</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className={`border-l-4 ${stats.queue > 0 ? 'border-l-amber-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Queue</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock
                          className={`h-5 w-5 ${stats.queue > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-green-500 dark:text-green-400'}`}
                        />
                        <p
                          className={`text-2xl sm:text-3xl font-bold ${stats.queue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}
                        >
                          {stats.queue}
                        </p>
                      </div>
                      {stats.queue === 0 ? (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">All caught up!</p>
                      ) : (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Pending & scheduled</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${activePatients === 0 ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                  <CardContent className="p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">In Progress</p>
                      <div className="flex items-center gap-2 mt-1">
                        <UserCheck
                          className={`h-5 w-5 ${activePatients === 0 ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'}`}
                        />
                        <p
                          className={`text-2xl sm:text-3xl font-bold ${activePatients === 0 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}
                        >
                          {activePatients}
                        </p>
                      </div>
                      {activePatients === 0 ? (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">No active patient flow</p>
                      ) : (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          {stats.inProgress} order{stats.inProgress !== 1 ? 's' : ''}
                          {stats.activeSessions > 0
                            ? ` · ${stats.activeSessions} session${stats.activeSessions !== 1 ? 's' : ''}`
                            : ''}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className={`border-l-4 ${stats.completedToday === 0 ? 'border-l-green-500' : 'border-l-emerald-500'}`}
                >
                  <CardContent className="p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Completed Today</p>
                      <div className="flex items-center gap-2 mt-1">
                        <CheckCircle2
                          className={`h-5 w-5 ${stats.completedToday === 0 ? 'text-green-500 dark:text-green-400' : 'text-emerald-500 dark:text-emerald-400'}`}
                        />
                        <p
                          className={`text-2xl sm:text-3xl font-bold ${stats.completedToday === 0 ? 'text-green-600 dark:text-green-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                        >
                          {stats.completedToday}
                        </p>
                      </div>
                      {stats.completedToday === 0 ? (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">No sessions completed yet</p>
                      ) : (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Sessions finished today</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className={`border-l-4 ${stats.scheduledToday === 0 ? 'border-l-green-500' : 'border-l-purple-500'}`}
                >
                  <CardContent className="p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Scheduled Today</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar
                          className={`h-5 w-5 ${stats.scheduledToday === 0 ? 'text-green-500 dark:text-green-400' : 'text-purple-500 dark:text-purple-400'}`}
                        />
                        <p
                          className={`text-2xl sm:text-3xl font-bold ${stats.scheduledToday === 0 ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}
                        >
                          {stats.scheduledToday}
                        </p>
                      </div>
                      {stats.scheduledToday === 0 ? (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">No patients booked today</p>
                      ) : (
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Appointments today</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              onClick={() => setIsNewOrderModalOpen(true)}
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white border-l-4 border-l-white/20"
            >
              <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="text-xs sm:text-sm font-medium">New Order</span>
              <span className="text-[10px] sm:text-xs opacity-90">Create eye clinic request</span>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-sky-500/30 hover:bg-sky-500/10 border-l-4 border-l-sky-500"
            >
              <Link href="/eyecare/orders">
                <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-sky-500 dark:text-sky-400" />
                <span className="text-xs sm:text-sm font-medium">Orders</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Manage queue and actions</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-sky-500/30 hover:bg-sky-500/10 border-l-4 border-l-emerald-500"
            >
              <Link href="/eyecare/completed">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
                <span className="text-xs sm:text-sm font-medium">Completed Sessions</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Completed session reports</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-sky-500/30 hover:bg-sky-500/10 border-l-4 border-l-violet-500"
            >
              <Link href="/eyecare/orders?tab=in_progress">
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-violet-500 dark:text-violet-400" />
                <span className="text-xs sm:text-sm font-medium">Active Workflow</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Continue in-progress care</span>
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  Pending Tasks
                </CardTitle>
                <Badge
                  variant="default"
                  className={
                    hasPendingTasks
                      ? 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300'
                      : 'bg-green-500/10 text-green-700 border-green-500/20'
                  }
                >
                  {hasPendingTasks
                    ? `${Math.max(pendingTasks.length, stats.activeSessions)} open`
                    : '✓ All Complete'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !hasPendingTasks ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-muted-foreground text-sm mb-2">All tasks completed!</p>
                    <p className="text-xs text-muted-foreground">Eye clinic orders are currently under control.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stats.queue > 0 && (
                      <TaskRow
                        title="Orders in queue"
                        description={`${stats.queue} pending or scheduled order${stats.queue !== 1 ? 's' : ''}`}
                        tone="amber"
                        icon={Clock}
                        href="/eyecare/orders"
                      />
                    )}
                    {stats.inProgress > 0 && (
                      <TaskRow
                        title="Orders in progress"
                        description={`${stats.inProgress} order${stats.inProgress !== 1 ? 's' : ''} being seen`}
                        tone="blue"
                        icon={UserCheck}
                        href="/eyecare/orders?tab=in_progress"
                      />
                    )}
                    {stats.activeSessions > 0 && stats.inProgress === 0 && (
                      <TaskRow
                        title="Active sessions"
                        description={`${stats.activeSessions} clinical session${stats.activeSessions !== 1 ? 's' : ''} in progress`}
                        tone="blue"
                        icon={Activity}
                        href="/eyecare/orders?tab=in_progress"
                      />
                    )}
                    {pendingTasks.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{order.patient_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {order.diagnosis || order.chief_complaint || 'Eye clinic order'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className="capitalize">
                            {statusLabel(order.status)}
                          </Badge>
                          <Button asChild variant="ghost" size="sm">
                            <Link href="/eyecare/orders">
                              Open
                              <ArrowRight className="h-4 w-4 ml-1" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No recent activity</p>
                  <p className="text-xs text-muted-foreground">Activity will appear here as the team works</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-lg border p-3 space-y-1 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => router.push('/eyecare/orders')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{item.title}</p>
                        <Badge
                          variant="outline"
                          className={
                            item.tone === 'completed'
                              ? 'text-emerald-600 border-emerald-500/30'
                              : 'text-blue-600 border-blue-500/30'
                          }
                        >
                          {item.tone === 'completed' ? 'Completed' : 'Active'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                      {item.time ? (
                        <p className="text-[10px] text-muted-foreground/80">{formatTime(item.time)}</p>
                      ) : null}
                    </button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-sky-600"
                    onClick={() => router.push('/eyecare/orders')}
                  >
                    View all orders
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <NewEyeOrderModal
        open={isNewOrderModalOpen}
        onOpenChange={setIsNewOrderModalOpen}
        onSuccess={() => {
          void loadDashboard();
        }}
      />
    </DashboardLayout>
  );
}

type TaskTone = 'amber' | 'blue' | 'emerald';

function TaskRow({
  title,
  description,
  tone,
  icon: Icon,
  href,
}: {
  title: string;
  description: string;
  tone: TaskTone;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}) {
  const styles: Record<TaskTone, { border: string; bg: string; icon: string; text: string; btn: string }> = {
    amber: {
      border: 'border-amber-200 dark:border-amber-800',
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      icon: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-900 dark:text-amber-100',
      btn: 'border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300',
    },
    blue: {
      border: 'border-blue-200 dark:border-blue-800',
      bg: 'bg-blue-50 dark:bg-blue-950/20',
      icon: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-900 dark:text-blue-100',
      btn: 'border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300',
    },
    emerald: {
      border: 'border-emerald-200 dark:border-emerald-800',
      bg: 'bg-emerald-50 dark:bg-emerald-950/20',
      icon: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30',
      text: 'text-emerald-900 dark:text-emerald-100',
      btn: 'border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300',
    },
  };
  const s = styles[tone];

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${s.border} ${s.bg}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${s.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className={`font-medium text-sm ${s.text}`}>{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className={`shrink-0 ml-2 ${s.btn}`}>
        <Link href={href}>View</Link>
      </Button>
    </div>
  );
}
