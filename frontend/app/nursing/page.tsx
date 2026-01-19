"use client";

import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Heart, Thermometer, Syringe, ClipboardList, Users,
  Clock, CheckCircle2, Activity, ArrowRight, DoorOpen, FileCheck,
  AlertTriangle, Zap, UserCheck, Pill, Stethoscope, MonitorSpeaker,
  Battery, Wifi, WifiOff, Loader2, TrendingUp
} from 'lucide-react';

// Mock data for demonstration - replace with real API calls
const mockNursingData = {
  stats: {
    activePatients: 12,
    pendingVitals: 8,
    medicationsDue: 15,
    assessmentsToday: 6,
    pendingTasks: 4
  },
  criticalAlerts: [
    { id: '1', patient: 'John Doe', room: '201', alert: 'Blood pressure critical: 180/110', time: '2 min ago', priority: 'high' },
    { id: '2', patient: 'Jane Smith', room: '305', alert: 'Pain assessment overdue', time: '15 min ago', priority: 'medium' },
    { id: '3', patient: 'Bob Johnson', room: '412', alert: 'Fever spike: 102.5°F', time: '8 min ago', priority: 'high' }
  ],
  recentActivities: [
    { id: '1', type: 'vitals', patient: 'John Doe', action: 'Recorded vitals', time: '2 min ago', status: 'completed' },
    { id: '2', type: 'medication', patient: 'Jane Smith', action: 'Administered medication', time: '5 min ago', status: 'completed' },
    { id: '3', type: 'assessment', patient: 'Bob Johnson', action: 'Completed pain assessment', time: '10 min ago', status: 'completed' },
    { id: '4', type: 'procedure', patient: 'Alice Brown', action: 'IV line maintenance', time: '15 min ago', status: 'completed' },
    { id: '5', type: 'note', patient: 'Charlie Wilson', action: 'Added care note', time: '20 min ago', status: 'completed' }
  ],
  equipmentStatus: [
    { id: '1', name: 'IV Pump A-201', status: 'online', battery: 85, location: 'Room 201' },
    { id: '2', name: 'BP Monitor B-305', status: 'maintenance', battery: 45, location: 'Room 305' },
    { id: '3', name: 'Infusion Pump C-412', status: 'online', battery: 92, location: 'Room 412' },
    { id: '4', name: 'Ventilator D-108', status: 'offline', battery: 0, location: 'Room 108' }
  ],
  poolQueue: 3,
  roomQueue: 2
};

export default function NursingDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(mockNursingData.stats);
  const [criticalAlerts, setCriticalAlerts] = useState(mockNursingData.criticalAlerts);
  const [recentActivities, setRecentActivities] = useState(mockNursingData.recentActivities);
  const [equipmentStatus, setEquipmentStatus] = useState(mockNursingData.equipmentStatus);
  const [poolQueueCount, setPoolQueueCount] = useState(mockNursingData.poolQueue);
  const [roomQueueCount, setRoomQueueCount] = useState(mockNursingData.roomQueue);

  // Load nursing dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // In real implementation, replace with actual API calls:
        // const nursingData = await nursingService.getDashboardStats();
        // const alerts = await nursingService.getCriticalAlerts();
        // etc.

        setStats(mockNursingData.stats);
        setCriticalAlerts(mockNursingData.criticalAlerts);
        setRecentActivities(mockNursingData.recentActivities);
        setEquipmentStatus(mockNursingData.equipmentStatus);
        setPoolQueueCount(mockNursingData.poolQueue);
        setRoomQueueCount(mockNursingData.roomQueue);

      } catch (error) {
        console.error('Error loading nursing dashboard data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  // Calculate trend data (mock implementation)
  const trends = useMemo(() => ({
    activePatients: { value: 8, isPositive: true },
    pendingVitals: { value: -5, isPositive: false },
    medicationsDue: { value: 12, isPositive: true },
    assessmentsToday: { value: 3, isPositive: true }
  }), []);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-rose-500 to-pink-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <Heart className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Nursing Department</h1>
                  <p className="text-rose-100">Digital nursing documentation and patient care management</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-white text-rose-600 hover:bg-rose-50"
                  onClick={() => router.push('/nursing/patient-vitals')}
                >
                  <Activity className="h-4 w-4 mr-2" />
                  Record Vitals
                </Button>
                <Button
                  variant="outline"
                  className="border-white text-white hover:bg-white/20"
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
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
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
                          <p className="text-3xl font-bold text-muted-foreground">--</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className="border-l-4 border-l-rose-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Active Patients</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Users className="h-5 w-5 text-rose-500" />
                          <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.activePatients}</p>
                        </div>
                        {trends.activePatients.value !== 0 && (
                          <div className={`flex items-center text-xs mt-1 ${trends.activePatients.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            <TrendingUp className={`h-3 w-3 mr-1 ${!trends.activePatients.isPositive ? 'rotate-180' : ''}`} />
                            {Math.abs(trends.activePatients.value)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Vitals Pending</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Thermometer className="h-5 w-5 text-amber-500" />
                          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.pendingVitals}</p>
                        </div>
                        {trends.pendingVitals.value !== 0 && (
                          <div className={`flex items-center text-xs mt-1 ${trends.pendingVitals.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            <TrendingUp className={`h-3 w-3 mr-1 ${!trends.pendingVitals.isPositive ? 'rotate-180' : ''}`} />
                            {Math.abs(trends.pendingVitals.value)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Medications Due</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Syringe className="h-5 w-5 text-blue-500" />
                          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.medicationsDue}</p>
                        </div>
                        {trends.medicationsDue.value !== 0 && (
                          <div className={`flex items-center text-xs mt-1 ${trends.medicationsDue.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            <TrendingUp className={`h-3 w-3 mr-1 ${!trends.medicationsDue.isPositive ? 'rotate-180' : ''}`} />
                            {Math.abs(trends.medicationsDue.value)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-emerald-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Assessments Due</p>
                        <div className="flex items-center gap-2 mt-1">
                          <ClipboardList className="h-5 w-5 text-emerald-500" />
                          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.assessmentsToday}</p>
                        </div>
                        {trends.assessmentsToday.value !== 0 && (
                          <div className={`flex items-center text-xs mt-1 ${trends.assessmentsToday.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            <TrendingUp className={`h-3 w-3 mr-1 ${!trends.assessmentsToday.isPositive ? 'rotate-180' : ''}`} />
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
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button onClick={() => router.push('/nursing/pool-queue')} className="h-auto py-6 flex flex-col items-center gap-3 bg-gradient-to-br from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white border-l-4 border-l-white/20">
              <div className="flex items-center gap-2">
                <Users className="h-6 w-6" />
                {poolQueueCount > 0 && (
                  <Badge variant="secondary" className="bg-white/20 text-white text-xs px-2 py-0.5">
                    {poolQueueCount}
                  </Badge>
                )}
              </div>
              <span className="text-sm font-medium">Pool Queue</span>
              <span className="text-xs opacity-90">Patient assignments</span>
            </Button>
            <Button onClick={() => router.push('/nursing/patient-vitals')} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-rose-500">
              <Thermometer className="h-6 w-6 text-rose-500" />
              <span className="text-sm font-medium">Record Vitals</span>
              <span className="text-xs text-muted-foreground">Patient monitoring</span>
            </Button>
            <Button onClick={() => router.push('/nursing/procedures')} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-blue-500">
              <Syringe className="h-6 w-6 text-blue-500" />
              <span className="text-sm font-medium">Administer Meds</span>
              <span className="text-xs text-muted-foreground">Medication tasks</span>
            </Button>
            <Button onClick={() => router.push('/nursing/room-queue')} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-emerald-500">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-emerald-500" />
                {roomQueueCount > 0 && (
                  <Badge variant="outline" className="text-xs px-2 py-0.5">
                    {roomQueueCount}
                  </Badge>
                )}
              </div>
              <span className="text-sm font-medium">Room Queue</span>
              <span className="text-xs text-muted-foreground">Room assignments</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pending Tasks */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500" />
                  Pending Tasks
                </CardTitle>
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                  {stats.pendingTasks} tasks
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
                <Activity className="h-5 w-5 text-emerald-500" />
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
                  <div key={i} className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-emerald-500/10">
                      {activity.type === 'vitals' && <Thermometer className="h-4 w-4 text-emerald-500" />}
                      {activity.type === 'medication' && <Syringe className="h-4 w-4 text-emerald-500" />}
                      {activity.type === 'assessment' && <ClipboardList className="h-4 w-4 text-emerald-500" />}
                      {activity.type === 'procedure' && <Stethoscope className="h-4 w-4 text-emerald-500" />}
                      {activity.type === 'note' && <FileText className="h-4 w-4 text-emerald-500" />}
                      {!['vitals', 'medication', 'assessment', 'procedure', 'note'].includes(activity.type) && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground text-sm">{activity.patient}</p>
                        <Badge variant="outline" className="text-xs px-2 py-0.5">
                          {activity.status === 'completed' ? '✅' : '⏳'} {activity.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{activity.action}</p>
                      <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
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

        {/* Equipment Status */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <MonitorSpeaker className="h-5 w-5 text-blue-500" />
            Equipment Status
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Loading...</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">--</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              equipmentStatus.map((equipment) => (
                <Card key={equipment.id} className={`border-l-4 ${
                  equipment.status === 'online' ? 'border-l-green-500' :
                  equipment.status === 'maintenance' ? 'border-l-amber-500' :
                  'border-l-red-500'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{equipment.name}</p>
                        <p className="text-xs text-muted-foreground">{equipment.location}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className={`flex items-center gap-1 text-xs ${
                            equipment.status === 'online' ? 'text-green-600' :
                            equipment.status === 'maintenance' ? 'text-amber-600' :
                            'text-red-600'
                          }`}>
                            {equipment.status === 'online' ? <Wifi className="h-3 w-3" /> :
                             equipment.status === 'maintenance' ? <AlertTriangle className="h-3 w-3" /> :
                             <WifiOff className="h-3 w-3" />}
                            {equipment.status}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Battery className="h-3 w-3" />
                            {equipment.battery}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
