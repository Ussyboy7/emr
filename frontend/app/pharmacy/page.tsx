"use client";

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pill, ClipboardList, Package, Clock, CheckCircle2, AlertTriangle, Activity, ArrowRight, UserCheck, Database, TrendingUp, Notebook, FileText } from 'lucide-react';
import Link from 'next/link';
import { pharmacyService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';

interface PharmacyStats {
  pendingRx: number;
  dispensedToday: number;
  lowStock: number;
  totalInventory: number;
}

interface PharmacyActivity {
  id: string;
  type: 'prescription_created' | 'prescription_dispensed' | 'inventory_updated' | 'dispensing_event';
  title: string;
  description: string;
  timestamp: string;
  icon: string;
  color: string;
}

export default function PharmacyPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const [stats, setStats] = useState<PharmacyStats>({
    pendingRx: 0,
    dispensedToday: 0,
    lowStock: 0,
    totalInventory: 0,
  });
  const [recentActivities, setRecentActivities] = useState<PharmacyActivity[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch stats and recent activities in parallel
        const [pharmacyStats, activities] = await Promise.all([
          pharmacyService.getStats(),
          pharmacyService.getRecentActivities(5)
        ]);

        setStats(pharmacyStats);
        setRecentActivities(activities);
      } catch (error) {
        console.error('Error fetching pharmacy data:', error);
        if (isAuthenticationError(error)) {
          setAuthError(error);
        }
        // Keep default values on error
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Pill className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold">Pharmacy Department</h1>
                  <p className="text-sm sm:text-base text-violet-100">Prescription management, dispensing, and inventory control</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-white text-violet-600 hover:bg-violet-50 shadow-md"
                  onClick={() => window.location.href = '/pharmacy/prescriptions'}
                >
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Manage Prescriptions
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => window.location.href = '/pharmacy/inventory'}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Inventory
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
                <Card className={`border-l-4 ${stats.pendingRx > 0 ? 'border-l-amber-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pending prescriptions</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className={`h-5 w-5 ${stats.pendingRx > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.pendingRx > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>{stats.pendingRx}</p>
                        </div>
                        {stats.pendingRx === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All caught up!</p>
                        ) : (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Awaiting dispensing</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.dispensedToday === 0 ? 'border-l-green-500' : 'border-l-emerald-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Dispensed Today</p>
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className={`h-5 w-5 ${stats.dispensedToday === 0 ? 'text-green-500 dark:text-green-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.dispensedToday === 0 ? 'text-green-600 dark:text-green-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{stats.dispensedToday}</p>
                        </div>
                        {stats.dispensedToday === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No prescriptions dispensed</p>
                        ) : (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Prescriptions filled</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.lowStock === 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Low Stock</p>
                        <div className="flex items-center gap-2 mt-1">
                          <AlertTriangle className={`h-5 w-5 ${stats.lowStock === 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.lowStock === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{stats.lowStock}</p>
                        </div>
                        {stats.lowStock === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All stock levels good</p>
                        ) : (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Items need restocking</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.totalInventory > 0 ? 'border-l-violet-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Inventory</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Database className={`h-5 w-5 ${stats.totalInventory > 0 ? 'text-violet-500 dark:text-violet-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.totalInventory > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-green-600 dark:text-green-400'}`}>{stats.totalInventory}</p>
                        </div>
                        {stats.totalInventory === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No inventory tracked</p>
                        ) : (
                          <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">Items in stock</p>
                        )}
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
            <Button onClick={() => window.location.href = '/pharmacy/prescriptions'} className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white border-l-4 border-l-white/20">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <span className="text-xs sm:text-sm font-medium">Prescriptions Queue</span>
              <span className="text-[10px] sm:text-xs opacity-90">Pending Prescriptions</span>
            </Button>
            <Button onClick={() => window.location.href = '/pharmacy/history'} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-violet-500/30 hover:bg-violet-500/10 border-l-4 border-l-violet-500">
              <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-violet-500 dark:text-violet-400" />
              <span className="text-xs sm:text-sm font-medium">Dispense History</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Completed dispensations</span>
            </Button>
            <Button onClick={() => window.location.href = '/pharmacy/inventory'} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-violet-500/30 hover:bg-violet-500/10 border-l-4 border-l-blue-500">
              <Package className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-xs sm:text-sm font-medium">Inventory</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Stock management</span>
            </Button>
            <Button onClick={() => window.location.href = '/pharmacy/analytics'} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-violet-500/30 hover:bg-violet-500/10 border-l-4 border-l-emerald-500">
              <Notebook className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-medium">Analytics</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Analytics</span>
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
                <Badge variant="default" className={`${stats.pendingRx + stats.lowStock === 0 ? 'bg-green-500/10 text-green-700 border-green-500/20' : 'bg-amber-500/10 text-amber-700 border-amber-500/20'}`}>
                  {stats.pendingRx + stats.lowStock === 0 ? '✓ All Complete' : `${stats.pendingRx + stats.lowStock} Pending`}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : stats.pendingRx + stats.lowStock === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-muted-foreground text-sm mb-2">All tasks completed!</p>
                    <p className="text-xs text-muted-foreground">Great work staying on top of pharmacy operations.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stats.pendingRx > 0 && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <p className="font-medium text-sm text-amber-900 dark:text-amber-100">Pending Prescriptions</p>
                            <p className="text-xs text-amber-700 dark:text-amber-300">{stats.pendingRx} prescription{stats.pendingRx !== 1 ? 's' : ''} awaiting dispensing</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30">
                          View
                        </Button>
                      </div>
                    )}
                    {stats.lowStock > 0 && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </div>
                          <div>
                            <p className="font-medium text-sm text-red-900 dark:text-red-100">Low Stock Alert</p>
                            <p className="text-xs text-red-700 dark:text-red-300">{stats.lowStock} medication{stats.lowStock !== 1 ? 's' : ''} running low</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30">
                          Manage
                        </Button>
                      </div>
                    )}
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
              ) : recentActivities.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No recent activity</p>
                  <p className="text-xs text-muted-foreground">Activity will appear here as you work</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivities.map((activity) => {
                    const getIcon = () => {
                      switch (activity.icon) {
                        case 'clipboard-list': return ClipboardList;
                        case 'check-circle': return CheckCircle2;
                        default: return FileText;
                      }
                    };

                    const getColorClasses = () => {
                      switch (activity.color) {
                        case 'blue': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
                        case 'green': return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
                        case 'amber': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
                        case 'red': return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
                        default: return 'bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400';
                      }
                    };

                    const IconComponent = getIcon();
                    const timeAgo = (() => {
                      try {
                        const now = new Date();
                        const activityTime = new Date(activity.timestamp);
                        const diffMs = now.getTime() - activityTime.getTime();
                        const diffMins = Math.floor(diffMs / 60000);

                        if (diffMins < 1) return 'Just now';
                        if (diffMins < 60) return `${diffMins}m ago`;
                        const diffHours = Math.floor(diffMins / 60);
                        if (diffHours < 24) return `${diffHours}h ago`;
                        return `${Math.floor(diffHours / 24)}d ago`;
                      } catch {
                        return 'Recently';
                      }
                    })();

                    return (
                      <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg border border-muted bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getColorClasses()}`}>
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{activity.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{activity.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}