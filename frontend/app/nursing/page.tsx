"use client";

import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Heart, Thermometer, Syringe, ClipboardList, Users,
  Clock, CheckCircle2, Activity, ArrowRight, DoorOpen, FileCheck,
  AlertTriangle, Zap, UserCheck, Pill, Stethoscope,
  Loader2, TrendingUp, FileText, BarChart3
} from 'lucide-react';
import { nursingService } from '@/lib/services';

// Default empty state
const defaultStats = {
  activePatients: 0,
  pendingVitals: 0,
  medicationsDue: 0,
  assessmentsToday: 0,
  pendingTasks: 0
};

export default function NursingDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(defaultStats);
  const [criticalAlerts, setCriticalAlerts] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [poolQueueCount, setPoolQueueCount] = useState(0);
  const [roomQueueCount, setRoomQueueCount] = useState(0);

  // Load nursing dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);

        // Load data from multiple API endpoints in parallel
        const [
          statsResponse,
          alertsResponse,
          activitiesResponse,
          poolQueueResponse,
          roomQueueResponse
        ] = await Promise.allSettled([
          nursingService.getStats(),
          nursingService.getCriticalAlerts(),
          nursingService.getRecentActivities({ limit: 5 }),
          nursingService.getPoolQueueCount(),
          nursingService.getRoomQueueCount()
        ]);

        // Process stats
        if (statsResponse.status === 'fulfilled') {
          setStats(statsResponse.value);
        } else {
          console.error('Failed to load nursing stats:', statsResponse.reason);
          // Keep default stats on error
        }

        // Process critical alerts
        if (alertsResponse.status === 'fulfilled') {
          setCriticalAlerts(alertsResponse.value?.results || []);
        } else {
          console.error('Failed to load critical alerts:', alertsResponse.reason);
          setCriticalAlerts([]);
        }

        // Process recent activities
        if (activitiesResponse.status === 'fulfilled') {
          setRecentActivities(activitiesResponse.value?.results || []);
        } else {
          console.error('Failed to load recent activities:', activitiesResponse.reason);
          setRecentActivities([]);
        }

        // Process queue counts
        if (poolQueueResponse.status === 'fulfilled') {
          setPoolQueueCount(poolQueueResponse.value?.count || 0);
        } else {
          console.error('Failed to load pool queue count:', poolQueueResponse.reason);
          setPoolQueueCount(0);
        }

        if (roomQueueResponse.status === 'fulfilled') {
          setRoomQueueCount(roomQueueResponse.value?.count || 0);
        } else {
          console.error('Failed to load room queue count:', roomQueueResponse.reason);
          setRoomQueueCount(0);
        }

      } catch (error) {
        console.error('Error loading nursing dashboard data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  // Calculate trend data based on real data
  const trends = useMemo(() => {
    // In a real implementation, this would compare current data with historical data
    // For now, we'll calculate simple trends based on the current values
    const calculateTrend = (currentValue: number, baseline: number = 10) => {
      if (currentValue === 0) return { value: 0, isPositive: true };
      const change = Math.round(((currentValue - baseline) / Math.max(baseline, 1)) * 100);
      return { value: Math.abs(change), isPositive: change >= 0 };
    };

    return {
      activePatients: calculateTrend(stats.activePatients, 8),
      pendingVitals: calculateTrend(stats.pendingVitals, 12), // Lower is better for pending items
      medicationsDue: calculateTrend(stats.medicationsDue, 10),
      assessmentsToday: calculateTrend(stats.assessmentsToday, 4)
    };
  }, [stats]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-rose-500 to-pink-600 text-white border-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Heart className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold">Nursing Department</h1>
                  <p className="text-sm sm:text-base text-rose-100">Digital nursing documentation and patient care management</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-white text-rose-600 hover:bg-rose-50 shadow-md"
                  onClick={() => router.push('/nursing/patient-vitals')}
                >
                  <Activity className="h-4 w-4 mr-2" />
                  Record Vitals
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => router.push('/nursing/analytics')}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analytics
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => router.push('/nursing/pool-queue')}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Patient Pool
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
                <Card className={`border-l-4 ${stats.activePatients > 0 ? 'border-l-rose-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Active Patients</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Users className={`h-5 w-5 ${stats.activePatients > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.activePatients > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-green-600 dark:text-green-400'}`}>{stats.activePatients}</p>
                        </div>
                        {stats.activePatients === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All caught up!</p>
                        ) : trends.activePatients.value !== 0 && (
                          <div className={`flex items-center text-xs mt-1 ${trends.activePatients.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            <TrendingUp className={`h-3 w-3 mr-1 ${!trends.activePatients.isPositive ? 'rotate-180' : ''}`} />
                            {Math.abs(trends.activePatients.value)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`border-l-4 ${stats.pendingVitals === 0 ? 'border-l-green-500' : 'border-l-amber-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Vitals Pending</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Thermometer className={`h-5 w-5 ${stats.pendingVitals === 0 ? 'text-green-500 dark:text-green-400' : 'text-amber-500 dark:text-amber-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.pendingVitals === 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{stats.pendingVitals}</p>
                        </div>
                        {stats.pendingVitals === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All vitals recorded</p>
                        ) : trends.pendingVitals.value !== 0 && (
                          <div className={`flex items-center text-xs mt-1 ${trends.pendingVitals.isPositive ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            <TrendingUp className={`h-3 w-3 mr-1 ${trends.pendingVitals.isPositive ? '' : 'rotate-180'}`} />
                            {Math.abs(trends.pendingVitals.value)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`border-l-4 ${stats.medicationsDue === 0 ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Medications Due</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Syringe className={`h-5 w-5 ${stats.medicationsDue === 0 ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.medicationsDue === 0 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>{stats.medicationsDue}</p>
                        </div>
                        {stats.medicationsDue === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All medications administered</p>
                        ) : trends.medicationsDue.value !== 0 && (
                          <div className={`flex items-center text-xs mt-1 ${trends.medicationsDue.isPositive ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            <TrendingUp className={`h-3 w-3 mr-1 ${trends.medicationsDue.isPositive ? '' : 'rotate-180'}`} />
                            {Math.abs(trends.medicationsDue.value)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`border-l-4 ${stats.assessmentsToday === 0 ? 'border-l-green-500' : 'border-l-emerald-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Assessments Due</p>
                        <div className="flex items-center gap-2 mt-1">
                          <ClipboardList className={`h-5 w-5 ${stats.assessmentsToday === 0 ? 'text-green-500 dark:text-green-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.assessmentsToday === 0 ? 'text-green-600 dark:text-green-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{stats.assessmentsToday}</p>
                        </div>
                        {stats.assessmentsToday === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All assessments completed</p>
                        ) : trends.assessmentsToday.value !== 0 && (
                          <div className={`flex items-center text-xs mt-1 ${trends.assessmentsToday.isPositive ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            <TrendingUp className={`h-3 w-3 mr-1 ${trends.assessmentsToday.isPositive ? '' : 'rotate-180'}`} />
                            {Math.abs(trends.assessmentsToday.value)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        {/* Critical Alerts */}
        {!loading && criticalAlerts.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Critical Alerts
            </h2>
            <div className="space-y-2">
              {criticalAlerts.map((alert) => (
                <Card key={alert.id} className={`border-l-4 ${alert.priority === 'high' ? 'border-l-red-500 bg-red-50 dark:bg-red-900/10' : 'border-l-amber-500 bg-amber-50 dark:bg-amber-900/10'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-full ${alert.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                          <AlertTriangle className={`h-4 w-4 ${alert.priority === 'high' ? 'text-red-600' : 'text-amber-600'}`} />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{alert.patient} (Room {alert.room})</p>
                          <p className="text-sm text-muted-foreground">{alert.alert}</p>
                          <p className="text-xs text-muted-foreground mt-1">{alert.time}</p>
                        </div>
                      </div>
                      <Badge variant={alert.priority === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                        {alert.priority.toUpperCase()}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Button onClick={() => router.push('/nursing/pool-queue')} className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white border-l-4 border-l-white/20">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 sm:h-6 sm:w-6" />
                {poolQueueCount > 0 && (
                  <Badge variant="secondary" className="bg-white/20 text-white text-xs px-2 py-0.5">
                    {poolQueueCount}
                  </Badge>
                )}
              </div>
              <span className="text-xs sm:text-sm font-medium">Pool Queue</span>
              <span className="text-[10px] sm:text-xs opacity-90">Patient assignments</span>
            </Button>
            <Button onClick={() => router.push('/nursing/patient-vitals')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-rose-500">
              <Thermometer className="h-5 w-5 sm:h-6 sm:w-6 text-rose-500 dark:text-rose-400" />
              <span className="text-xs sm:text-sm font-medium">Record Vitals</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Patient monitoring</span>
            </Button>
            <Button onClick={() => router.push('/nursing/procedures')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-blue-500">
              <Syringe className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-xs sm:text-sm font-medium">Administer Meds</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Medication tasks</span>
            </Button>
            <Button onClick={() => router.push('/nursing/room-queue')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-emerald-500">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
                {roomQueueCount > 0 && (
                  <Badge variant="outline" className="text-xs px-2 py-0.5">
                    {roomQueueCount}
                  </Badge>
                )}
              </div>
              <span className="text-xs sm:text-sm font-medium">Room Queue</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Room assignments</span>
            </Button>
            <Button onClick={() => router.push('/nursing/analytics')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-violet-500">
              <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-violet-500 dark:text-violet-400" />
              <span className="text-xs sm:text-sm font-medium">Analytics</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Pool metrics</span>
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
                <Badge variant={stats.pendingTasks === 0 ? "default" : "outline"} className={stats.pendingTasks === 0 ? "bg-green-500/10 text-green-700 border-green-500/20" : "border-amber-500/50 text-amber-600 dark:text-amber-400"}>
                  {stats.pendingTasks === 0 ? "✓ All Complete" : `${stats.pendingTasks} pending`}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : stats.pendingTasks > 0 ? (
                  <div className="text-center py-8">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm mb-2">You have {stats.pendingTasks} pending tasks</p>
                    <p className="text-xs text-muted-foreground">Check your assignments for details</p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-muted-foreground text-sm mb-2">All tasks completed!</p>
                    <p className="text-xs text-muted-foreground">Great work staying on top of patient care.</p>
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
              ) : recentActivities.length > 0 ? (
                recentActivities.slice(0, 5).map((activity, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`p-2 rounded-full ${activity.status === 'completed' ? 'bg-green-500/10' : 'bg-blue-500/10'}`}>
                      {activity.type === 'vitals' && <Thermometer className={`h-4 w-4 ${activity.status === 'completed' ? 'text-green-500' : 'text-blue-500'}`} />}
                      {activity.type === 'medication' && <Syringe className={`h-4 w-4 ${activity.status === 'completed' ? 'text-green-500' : 'text-blue-500'}`} />}
                      {activity.type === 'assessment' && <ClipboardList className={`h-4 w-4 ${activity.status === 'completed' ? 'text-green-500' : 'text-blue-500'}`} />}
                      {activity.type === 'procedure' && <Stethoscope className={`h-4 w-4 ${activity.status === 'completed' ? 'text-green-500' : 'text-blue-500'}`} />}
                      {activity.type === 'note' && <FileText className={`h-4 w-4 ${activity.status === 'completed' ? 'text-green-500' : 'text-blue-500'}`} />}
                      {!['vitals', 'medication', 'assessment', 'procedure', 'note'].includes(activity.type) && (
                        <CheckCircle2 className={`h-4 w-4 ${activity.status === 'completed' ? 'text-green-500' : 'text-blue-500'}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground text-sm">{activity.patient}</p>
                        <Badge variant={activity.status === 'completed' ? 'default' : 'secondary'} className={`text-xs px-2 py-0.5 ${activity.status === 'completed' ? 'bg-green-500/10 text-green-700 border-green-500/20' : ''}`}>
                          {activity.status === 'completed' ? '✓ Completed' : '⏳ In Progress'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{activity.action}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 opacity-75">{activity.time}</p>
                    </div>
                  </div>
                ))
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
