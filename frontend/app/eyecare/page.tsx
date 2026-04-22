'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye, Calendar, Clock, CheckCircle2, Activity, ArrowRight, ClipboardList, TrendingUp, Plus, UserCheck } from 'lucide-react';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { toast } from 'sonner';
import { eyeCareService, type EyeOrder, type EyeSession } from '@/lib/services/eye-care-service';
import { NewEyeOrderModal } from '@/components/eyecare/NewEyeOrderModal';

export default function EyeClinicPage() {
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const [orders, setOrders] = useState<EyeOrder[]>([]);
  const [sessions, setSessions] = useState<EyeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const [ordersResponse, sessionsResponse] = await Promise.all([
        eyeCareService.getOrders({ page_size: 100 }),
        eyeCareService.getSessions({ page_size: 100 }),
      ]);
      setOrders(ordersResponse.results || []);
      setSessions(sessionsResponse.results || []);
    } catch (error) {
      console.error('Error loading eye clinic dashboard:', error);
      if (isAuthenticationError(error)) {
        setAuthError(error);
      } else {
        toast.error('Failed to load eye clinic dashboard');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      pendingOrders: orders.filter((order) => order.status === 'pending').length,
      activePatients: new Set(
        orders
          .filter((order) => order.status === 'scheduled' || order.status === 'in_progress')
          .map((order) => order.patient_id || String(order.patient))
      ).size,
      completedToday: orders.filter(
        (order) => order.status === 'completed' && order.completed_at && new Date(order.completed_at).toDateString() === today
      ).length,
      scheduledToday: orders.filter(
        (order) => order.scheduled_at && new Date(order.scheduled_at).toDateString() === today
      ).length,
    };
  }, [orders]);

  const pendingTasks = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'pending' || order.status === 'scheduled' || order.status === 'in_progress')
        .slice(0, 4),
    [orders]
  );

  const recentActivity = useMemo(() => {
    const completedOrders = orders
      .filter((order) => order.status === 'completed' && order.completed_at)
      .sort((a, b) => new Date(b.completed_at || b.ordered_at).getTime() - new Date(a.completed_at || a.ordered_at).getTime())
      .slice(0, 3)
      .map((order) => ({
        id: `order-${order.id}`,
        title: `${order.patient_name} order completed`,
        subtitle: order.diagnosis || order.chief_complaint || 'Eye clinic order',
        time: order.completed_at || order.ordered_at,
        tone: 'completed' as const,
      }));

    const activeSessions = sessions
      .filter((session) => session.status === 'in_progress')
      .sort((a, b) => new Date(b.started_at || b.scheduled_at).getTime() - new Date(a.started_at || a.scheduled_at).getTime())
      .slice(0, 2)
      .map((session) => ({
        id: `session-${session.id}`,
        title: `Session ${session.session_number} in progress`,
        subtitle: session.findings || session.procedures_performed || 'Eye clinic review underway',
        time: session.started_at || session.scheduled_at,
        tone: 'active' as const,
      }));

    return [...activeSessions, ...completedOrders]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 4);
  }, [orders, sessions]);

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
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Today's Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Loading...</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <p className="text-2xl sm:text-3xl font-bold text-muted-foreground">--</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className={`border-l-4 ${stats.pendingOrders > 0 ? 'border-l-amber-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pending Orders</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className={`h-5 w-5 ${stats.pendingOrders > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.pendingOrders > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                            {stats.pendingOrders}
                          </p>
                        </div>
                        {stats.pendingOrders === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All caught up!</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.activePatients === 0 ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Active Patients</p>
                        <div className="flex items-center gap-2 mt-1">
                          <UserCheck className={`h-5 w-5 ${stats.activePatients === 0 ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.activePatients === 0 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                            {stats.activePatients}
                          </p>
                        </div>
                        {stats.activePatients === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No active patient flow</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.completedToday === 0 ? 'border-l-green-500' : 'border-l-emerald-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Completed Today</p>
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className={`h-5 w-5 ${stats.completedToday === 0 ? 'text-green-500 dark:text-green-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.completedToday === 0 ? 'text-green-600 dark:text-green-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {stats.completedToday}
                          </p>
                        </div>
                        {stats.completedToday === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No completed orders yet</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.scheduledToday === 0 ? 'border-l-green-500' : 'border-l-purple-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Scheduled Today</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className={`h-5 w-5 ${stats.scheduledToday === 0 ? 'text-green-500 dark:text-green-400' : 'text-purple-500 dark:text-purple-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.scheduledToday === 0 ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>
                            {stats.scheduledToday}
                          </p>
                        </div>
                        {stats.scheduledToday === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No patients booked today</p>
                        ) : null}
                      </div>
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
                    pendingTasks.length === 0
                      ? 'bg-green-500/10 text-green-700 border-green-500/20'
                      : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                  }
                >
                  {pendingTasks.length === 0 ? '✓ All Complete' : `${pendingTasks.length} Open`}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pendingTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-muted-foreground text-sm mb-2">All tasks completed!</p>
                    <p className="text-xs text-muted-foreground">Eye clinic orders are currently under control.</p>
                  </div>
                ) : (
                  pendingTasks.map((order) => (
                    <div key={order.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{order.patient_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {order.diagnosis || order.chief_complaint || 'Eye clinic order'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="capitalize">
                          {order.status.replace('_', ' ')}
                        </Badge>
                        <Button asChild variant="ghost" size="sm">
                          <Link href="/eyecare/orders">
                            Open
                            <ArrowRight className="h-4 w-4 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))
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
                recentActivity.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant="outline" className={item.tone === 'completed' ? 'text-emerald-600 border-emerald-500/30' : 'text-blue-600 border-blue-500/30'}>
                        {item.tone === 'completed' ? 'Completed' : 'Active'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                ))
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
