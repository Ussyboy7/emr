"use client";

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, TestTube, FileSearch, Clock, CheckCircle2, AlertTriangle, Activity, ArrowRight, UserCheck, ClipboardList, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { labService } from '@/lib/services';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';

export default function LaboratoryPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    inProgress: 0,
    resultsReady: 0,
    verified: 0
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const orders = await labService.getOrders({ page: 1, page_size: 100 });
      
      let pending = 0, inProgress = 0, resultsReady = 0, verified = 0;
      
      orders.results.forEach((order: any) => {
        // If no tests, count as pending
        if (!order.tests || order.tests.length === 0) {
          pending++;
          return;
        }
        
        // Get all test statuses
        const statuses = order.tests.map((t: any) => t.status || 'pending');
        
        // Count based on statuses
        const hasVerified = statuses.some((s: string) => s === 'verified');
        const hasResultsReady = statuses.some((s: string) => s === 'results_ready');
        const hasProcessing = statuses.some((s: string) => s === 'processing' || s === 'sample_collected');
        const hasPending = statuses.some((s: string) => s === 'pending');
        
        // Priority: results_ready > processing > verified > pending
        if (hasResultsReady) {
          resultsReady++;
        } else if (hasProcessing) {
          inProgress++;
        } else if (hasVerified) {
          verified++;
        } else if (hasPending) {
          pending++;
        } else {
          pending++; // fallback
        }
      });
      
      setStats({ pending, inProgress, resultsReady, verified });
      setRecentOrders(orders.results.slice(0, 5));
    } catch (error) {
      console.error('Failed to load lab stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
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
                  onClick={() => window.location.href = '/laboratory/orders'}
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  Lab Orders
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => window.location.href = '/laboratory/verification'}
                >
                  <FileSearch className="h-4 w-4 mr-2" />
                  Verify Results
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Overview */}
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
                        <p className="text-sm text-muted-foreground">Verified</p>
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className={`h-5 w-5 ${stats.verified === 0 ? 'text-green-500 dark:text-green-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.verified === 0 ? 'text-green-600 dark:text-green-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{stats.verified}</p>
                        </div>
                        {stats.verified === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All tests verified</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button onClick={() => window.location.href = '/laboratory/orders'} className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-l-4 border-l-white/20">
              <div className="flex items-center gap-2">
                <TestTube className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <span className="text-xs sm:text-sm font-medium">Lab Orders</span>
              <span className="text-[10px] sm:text-xs opacity-90">Test ordering</span>
            </Button>
            <Button onClick={() => window.location.href = '/laboratory/verification'} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-amber-500/30 hover:bg-amber-500/10 border-l-4 border-l-amber-500">
              <FileSearch className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500 dark:text-amber-400" />
              <span className="text-xs sm:text-sm font-medium">Verify Results</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Result Verification</span>
            </Button>
            <Button onClick={() => window.location.href = '/laboratory/templates'} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-amber-500/30 hover:bg-amber-500/10 border-l-4 border-l-blue-500">
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-xs sm:text-sm font-medium">Test Templates</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Test templates</span>
            </Button>
            <Button onClick={() => window.location.href = '/laboratory/completed'} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-amber-500/30 hover:bg-amber-500/10 border-l-4 border-l-emerald-500">
              <UserCheck className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-medium">Completed Tests</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Completed tests</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pending Tasks */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  Pending Tasks
                </CardTitle>
                <Badge variant="default" className={`${stats.pending + stats.inProgress + stats.resultsReady > 0 ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' : 'bg-green-500/10 text-green-700 border-green-500/20'}`}>
                  {stats.pending + stats.inProgress + stats.resultsReady > 0 ? `${stats.pending + stats.inProgress + stats.resultsReady} Pending` : '✓ All Complete'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : recentOrders.length > 0 ? (
                  <div className="space-y-2">
                    {recentOrders.slice(0, 3).map((order: any) => (
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
                        <Badge variant="outline" className="text-xs">
                          {order.tests?.[0]?.status?.replace('_', ' ') || 'pending'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-muted-foreground text-sm mb-2">All tasks completed!</p>
                    <p className="text-xs text-muted-foreground">Great work staying on top of lab operations.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
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
              ) : recentOrders.length > 0 ? (
                <div className="space-y-3">
                  {recentOrders.map((order: any) => (
                    <div key={order.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2" />
                      <div>
                        <p className="text-sm font-medium">{order.patient?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.ordered_at
                            ? new Date(order.ordered_at).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No recent activity</p>
                  <p className="text-xs text-muted-foreground">Activity will appear here as you work</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}