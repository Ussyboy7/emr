"use client";
import { formatDisplayDateTime } from '@/lib/dates';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, TestTube, FileSearch, Clock, CheckCircle2, Activity, UserCheck, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { labService } from '@/lib/services';
import { PREVIEW_PAGE_SIZE } from '@/lib/pagination-constants';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { useServerToday } from '@/hooks/use-server-today';
import { useLabPageAuth } from '@/hooks/use-lab-page-auth';
import { LabPatientFinder } from '@/components/laboratory/LabPatientFinder';
import { buildDateQuery } from '@/lib/laboratory/constants';

export default function LaboratoryPage() {
  const router = useRouter();
  const serverToday = useServerToday();
  const { ready, handleAuthError } = useLabPageAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    inProgress: 0,
    resultsReady: 0,
    verified: 0
  });
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    if (!ready) return;

    const loadStats = async () => {
      try {
        setLoading(true);
        const date = serverToday || buildDateQuery('today').date;
        if (!date) return;

        const dateQuery = { date };

        const [orderStats, verifiedStats, pendingRes, activityRes] = await Promise.all([
          labService.getOrderStats(dateQuery),
          labService.getVerificationStats({ status: 'verified', ...dateQuery }),
          labService.getOrders({
            ...dateQuery,
            workflow_tab: 'pending',
            page: 1,
            page_size: PREVIEW_PAGE_SIZE,
          }),
          labService.getOrders({
            ...dateQuery,
            page: 1,
            page_size: PREVIEW_PAGE_SIZE,
          }),
        ]);

        setStats({
          pending: orderStats.pending || 0,
          inProgress: orderStats.processing || 0,
          resultsReady: orderStats.results_ready || 0,
          verified: verifiedStats.total || 0,
        });
        setPendingTasks(pendingRes.results || []);
        setRecentActivity(activityRes.results || []);
      } catch (error) {
        console.error('Failed to load lab stats:', error);
        if (handleAuthError(error)) return;
        toast.error('Failed to load laboratory dashboard');
      } finally {
        setLoading(false);
      }
    };

    void loadStats();
  }, [ready, serverToday, handleAuthError]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <Card className="bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <FlaskConical className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold">Laboratory Department</h1>
                  <p className="text-sm sm:text-base text-amber-100">Lab test ordering, specimen tracking, and results management</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-white text-amber-600 hover:bg-amber-50 shadow-md"
                  onClick={() => router.push('/laboratory/orders')}
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  Lab Orders
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => router.push('/laboratory/verification')}
                >
                  <FileSearch className="h-4 w-4 mr-2" />
                  Verify Results
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <LabPatientFinder />

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Today's Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
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
                <Card className={`border-l-4 ${stats.pending > 0 ? 'border-l-amber-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pending Tests</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className={`h-5 w-5 ${stats.pending > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>{stats.pending}</p>
                        </div>
                        {stats.pending === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All caught up!</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.inProgress === 0 ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">In Progress</p>
                        <div className="flex items-center gap-2 mt-1">
                          <FlaskConical className={`h-5 w-5 ${stats.inProgress === 0 ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.inProgress === 0 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>{stats.inProgress}</p>
                        </div>
                        {stats.inProgress === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No tests in progress</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.resultsReady === 0 ? 'border-l-green-500' : 'border-l-amber-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Results Ready</p>
                        <div className="flex items-center gap-2 mt-1">
                          <FileSearch className={`h-5 w-5 ${stats.resultsReady === 0 ? 'text-green-500 dark:text-green-400' : 'text-amber-500 dark:text-amber-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.resultsReady === 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{stats.resultsReady}</p>
                        </div>
                        {stats.resultsReady === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No results ready</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.verified === 0 ? 'border-l-green-500' : 'border-l-emerald-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Verified Today</p>
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className={`h-5 w-5 ${stats.verified === 0 ? 'text-green-500 dark:text-green-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.verified === 0 ? 'text-green-600 dark:text-green-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{stats.verified}</p>
                        </div>
                        {stats.verified === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No verifications yet today</p>
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
            <Button onClick={() => router.push('/laboratory/orders')} className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-l-4 border-l-white/20">
              <TestTube className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="text-xs sm:text-sm font-medium">Lab Orders</span>
              <span className="text-[10px] sm:text-xs opacity-90">Test ordering</span>
            </Button>
            <Button onClick={() => router.push('/laboratory/verification')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-amber-500/30 hover:bg-amber-500/10 border-l-4 border-l-amber-500">
              <FileSearch className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500 dark:text-amber-400" />
              <span className="text-xs sm:text-sm font-medium">Verify Results</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Result Verification</span>
            </Button>
            <Button onClick={() => router.push('/laboratory/templates')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-amber-500/30 hover:bg-amber-500/10 border-l-4 border-l-blue-500">
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-xs sm:text-sm font-medium">Test Templates</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Test templates</span>
            </Button>
            <Button onClick={() => router.push('/laboratory/completed')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-amber-500/30 hover:bg-amber-500/10 border-l-4 border-l-emerald-500">
              <UserCheck className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-medium">Completed Tests</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Completed tests</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  Pending Collection (Today)
                </CardTitle>
                <Badge variant="default" className={`${stats.pending > 0 ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' : 'bg-green-500/10 text-green-700 border-green-500/20'}`}>
                  {stats.pending > 0 ? `${stats.pending} pending` : '✓ All caught up'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pendingTasks.length > 0 ? (
                  <div className="space-y-2">
                    {pendingTasks.slice(0, 3).map((order: any) => (
                      <div key={order.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          {order.patient?.name ? (
                            <p className="font-medium text-sm">{order.patient.name}</p>
                          ) : null}
                          {(() => {
                            const sub = joinDisplayParts([
                              typeof order.tests?.length === 'number' ? `${order.tests.length} test(s)` : '',
                              order.clinic,
                            ]);
                            return sub ? (
                              <p className="text-xs text-muted-foreground">{sub}</p>
                            ) : null;
                          })()}
                        </div>
                        <Badge variant="outline" className="text-xs">pending</Badge>
                      </div>
                    ))}
                    <Button variant="link" className="px-0 h-auto" asChild>
                      <Link href="/laboratory/orders?tab=pending">View all pending orders</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-muted-foreground text-sm mb-2">No pending collections today</p>
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
              ) : recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {recentActivity.map((order: any) => (
                    <div key={order.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2" />
                      <div>
                        <p className="text-sm font-medium">{order.patient?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.ordered_at ? formatDisplayDateTime(order.ordered_at) : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No orders today</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
