"use client";

import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Heart, Thermometer, Syringe, ClipboardList, Users,
  Clock, CheckCircle2, Activity, ArrowRight, DoorOpen, FileCheck
} from 'lucide-react';

// Stats and activity data will be loaded from API

export default function NursingDashboardPage() {
  const router = useRouter();
  const [stats] = useState([
    { label: 'Active Patients', value: 0, icon: Users, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Pending Vitals', value: 0, icon: Thermometer, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Medications Due', value: 0, icon: Syringe, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Assessments Today', value: 0, icon: ClipboardList, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ]);
  const [pendingTasks] = useState<any[]>([]);
  const [recentActivities] = useState<any[]>([]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Heart className="h-8 w-8 text-rose-500" />
              Nursing
            </h1>
            <p className="text-muted-foreground mt-1">Digital nursing documentation and patient care management</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button onClick={() => router.push('/nursing/pool-queue')} className="h-auto py-4 flex flex-col items-center gap-2 bg-gradient-to-br from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white">
            <Users className="h-6 w-6" />
            <span>Pool Queue</span>
          </Button>
          <Button onClick={() => router.push('/nursing/patient-vitals')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-rose-500/30 hover:bg-rose-500/10">
            <Thermometer className="h-6 w-6 text-rose-500" />
            <span>Patient Vitals</span>
          </Button>
          <Button onClick={() => router.push('/nursing/procedures')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-rose-500/30 hover:bg-rose-500/10">
            <Syringe className="h-6 w-6 text-rose-500" />
            <span>Procedures</span>
          </Button>
          <Button onClick={() => router.push('/nursing/room-queue')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-rose-500/30 hover:bg-rose-500/10">
            <ClipboardList className="h-6 w-6 text-rose-500" />
            <span>Room Queue</span>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pending Tasks */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Pending Tasks</CardTitle>
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">{pendingTasks.length} tasks</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${task.priority === 'high' ? 'bg-rose-500/10' : 'bg-amber-500/10'}`}>
                        {task.type === 'vitals' && <Thermometer className={`h-4 w-4 ${task.priority === 'high' ? 'text-rose-500' : 'text-amber-500'}`} />}
                        {task.type === 'medication' && <Syringe className={`h-4 w-4 ${task.priority === 'high' ? 'text-rose-500' : 'text-amber-500'}`} />}
                        {task.type === 'care-plan' && <FileCheck className={`h-4 w-4 ${task.priority === 'high' ? 'text-rose-500' : 'text-amber-500'}`} />}
                        {task.type === 'assessment' && <ClipboardList className={`h-4 w-4 ${task.priority === 'high' ? 'text-rose-500' : 'text-amber-500'}`} />}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{task.patient}</p>
                        <p className="text-sm text-muted-foreground">{task.task}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />{task.time}
                        </p>
                        {task.priority === 'high' && (
                          <Badge variant="outline" className="border-rose-500/50 text-rose-600 dark:text-rose-400 text-xs">Urgent</Badge>
                        )}
                      </div>
                      <Button size="sm" variant="ghost"><ArrowRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentActivities.map((activity, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{activity.patient}</p>
                    <p className="text-xs text-muted-foreground">{activity.action}</p>
                    <p className="text-xs text-muted-foreground mt-1">{activity.nurse} • {activity.time}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
