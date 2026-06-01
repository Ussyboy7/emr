"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Heart,
  Thermometer,
  ClipboardList,
  Users,
  Clock,
  CheckCircle2,
  Activity,
  ArrowRight,
  AlertTriangle,
  UserCheck,
  Loader2,
  BarChart3,
  DoorOpen,
} from "lucide-react";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { isAuthenticationError } from "@/lib/auth-errors";
import { useServerToday } from "@/hooks/use-server-today";
import {
  nursingService,
  type NursingDashboardData,
  type NursingPendingTask,
  type NursingPoolDashboardMetrics,
} from "@/lib/services/nursing-service";

const defaultMetrics: NursingPoolDashboardMetrics = {
  totalInPool: 0,
  pendingVitals: 0,
  readyForConsultation: 0,
  inConsultation: 0,
};

const defaultDashboard: NursingDashboardData = {
  metrics: defaultMetrics,
  roomQueueCount: 0,
  poolQueueCount: 0,
  pendingTasks: [],
  recentActivities: [],
  criticalAlerts: [],
};

export default function NursingDashboardPage() {
  const router = useRouter();
  const serverToday = useServerToday();
  const [authError, setAuthError] = useState<unknown>(null);
  useAuthRedirect(authError);

  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<NursingDashboardData>(defaultDashboard);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const data = await nursingService.getDashboardData(serverToday);
      setDashboard(data);
    } catch (error) {
      console.error("Error loading nursing dashboard:", error);
      if (isAuthenticationError(error)) {
        setAuthError(error);
      } else {
        toast.error("Failed to load nursing dashboard. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [serverToday]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const { metrics, pendingTasks, recentActivities, criticalAlerts, poolQueueCount, roomQueueCount } =
    dashboard;

  const activeWorkCount = useMemo(
    () => metrics.pendingVitals + metrics.readyForConsultation,
    [metrics.pendingVitals, metrics.readyForConsultation],
  );

  const hasPendingTasks = activeWorkCount > 0 || pendingTasks.length > 0;

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
                  <p className="text-sm sm:text-base text-rose-100">
                    Digital nursing documentation and patient care management
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-white text-rose-600 hover:bg-rose-50 shadow-md"
                  onClick={() => router.push("/nursing/patient-vitals")}
                >
                  <Activity className="h-4 w-4 mr-2" />
                  Record Vitals
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => router.push("/nursing/analytics")}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analytics
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => router.push("/nursing/pool-queue")}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Patient Pool
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Overview — aligned with Pool Queue metrics */}
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
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Loading...</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <p className="text-2xl sm:text-3xl font-bold text-muted-foreground">--</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <OverviewCard
                  label="In Pool Today"
                  value={metrics.totalInPool}
                  icon={Users}
                  activeTone="rose"
                  emptyHint="No patients in pool"
                  activeHint="Visits in nursing workflow"
                />
                <OverviewCard
                  label="Pending Vitals"
                  value={metrics.pendingVitals}
                  icon={Thermometer}
                  activeTone="amber"
                  emptyHint="All vitals recorded"
                  activeHint="Awaiting first vitals"
                />
                <OverviewCard
                  label="Ready for Consultation"
                  value={metrics.readyForConsultation}
                  icon={UserCheck}
                  activeTone="emerald"
                  emptyHint="None ready yet"
                  activeHint="Can send to room"
                />
                <OverviewCard
                  label="In Consultation"
                  value={metrics.inConsultation}
                  icon={DoorOpen}
                  activeTone="violet"
                  emptyHint="None sent to rooms"
                  activeHint="In consultation queue"
                />
              </>
            )}
          </div>
        </div>

        {/* Critical Alerts */}
        {!loading && criticalAlerts.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Attention Needed
            </h2>
            <div className="space-y-2">
              {criticalAlerts.map((alert) => (
                <Card
                  key={alert.id}
                  className="border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{alert.patient}</p>
                        <p className="text-sm text-muted-foreground">{alert.alert}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {alert.room} · {alert.time}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/nursing/patient-vitals">Record</Link>
                      </Button>
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
            <Button
              onClick={() => router.push("/nursing/pool-queue")}
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white border-l-4 border-l-white/20"
            >
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
            <Button
              onClick={() => router.push("/nursing/patient-vitals")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-rose-500"
            >
              <Thermometer className="h-5 w-5 sm:h-6 sm:w-6 text-rose-500 dark:text-rose-400" />
              <span className="text-xs sm:text-sm font-medium">Record Vitals</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Patient monitoring</span>
            </Button>
            <Button
              onClick={() => router.push("/nursing/procedures")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-blue-500"
            >
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-xs sm:text-sm font-medium">Procedures</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Nursing orders & tasks</span>
            </Button>
            <Button
              onClick={() => router.push("/nursing/room-queue")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-emerald-500"
            >
              <div className="flex items-center gap-2">
                <DoorOpen className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
                {roomQueueCount > 0 && (
                  <Badge variant="outline" className="text-xs px-2 py-0.5">
                    {roomQueueCount}
                  </Badge>
                )}
              </div>
              <span className="text-xs sm:text-sm font-medium">Room Queue</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Room assignments</span>
            </Button>
            <Button
              onClick={() => router.push("/nursing/analytics")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-rose-500/30 hover:bg-rose-500/10 border-l-4 border-l-violet-500"
            >
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
                <Badge
                  variant="default"
                  className={
                    hasPendingTasks
                      ? "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300"
                      : "bg-green-500/10 text-green-700 border-green-500/20"
                  }
                >
                  {hasPendingTasks
                    ? `${Math.max(pendingTasks.length, activeWorkCount)} open`
                    : "✓ All Complete"}
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
                    <p className="text-xs text-muted-foreground">
                      Great work staying on top of patient care.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {metrics.pendingVitals > 0 && (
                      <TaskRow
                        title="Pending vitals"
                        description={`${metrics.pendingVitals} patient${metrics.pendingVitals !== 1 ? "s" : ""} need initial vitals`}
                        tone="amber"
                        icon={Thermometer}
                        href="/nursing/pool-queue"
                      />
                    )}
                    {metrics.readyForConsultation > 0 && (
                      <TaskRow
                        title="Ready for consultation"
                        description={`${metrics.readyForConsultation} patient${metrics.readyForConsultation !== 1 ? "s" : ""} ready for room assignment`}
                        tone="emerald"
                        icon={UserCheck}
                        href="/nursing/pool-queue"
                      />
                    )}
                    {pendingTasks.map((task) => (
                      <PendingPatientRow key={task.visitId} task={task} />
                    ))}
                    {pendingTasks.length === 0 && metrics.totalInPool > 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Open the pool queue to manage today&apos;s patients.
                      </p>
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
                  <p className="text-muted-foreground text-sm mb-2">No activity today</p>
                  <p className="text-xs text-muted-foreground">
                    Vitals and room assignments will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivities.map((activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      className="w-full flex items-start gap-3 text-left rounded-lg p-2 hover:bg-muted/50 transition-colors"
                      onClick={() => router.push(activity.href)}
                    >
                      <div
                        className={`p-2 rounded-full shrink-0 ${
                          activity.status === "completed"
                            ? "bg-green-500/10"
                            : "bg-blue-500/10"
                        }`}
                      >
                        {activity.type === "vitals" ? (
                          <Thermometer
                            className={`h-4 w-4 ${
                              activity.status === "completed" ? "text-green-500" : "text-blue-500"
                            }`}
                          />
                        ) : (
                          <DoorOpen
                            className={`h-4 w-4 ${
                              activity.status === "completed" ? "text-green-500" : "text-blue-500"
                            }`}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{activity.patient}</p>
                        <p className="text-xs text-muted-foreground">{activity.action}</p>
                        <p className="text-[10px] text-muted-foreground/80">{activity.time}</p>
                      </div>
                    </button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-rose-600"
                    onClick={() => router.push("/nursing/patient-vitals")}
                  >
                    View vitals history
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

type Tone = "rose" | "amber" | "emerald" | "violet";

function OverviewCard({
  label,
  value,
  icon: Icon,
  activeTone,
  emptyHint,
  activeHint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  activeTone: Tone;
  emptyHint: string;
  activeHint: string;
}) {
  const tones: Record<Tone, { border: string; icon: string; text: string }> = {
    rose: {
      border: "border-l-rose-500",
      icon: "text-rose-500 dark:text-rose-400",
      text: "text-rose-600 dark:text-rose-400",
    },
    amber: {
      border: "border-l-amber-500",
      icon: "text-amber-500 dark:text-amber-400",
      text: "text-amber-600 dark:text-amber-400",
    },
    emerald: {
      border: "border-l-emerald-500",
      icon: "text-emerald-500 dark:text-emerald-400",
      text: "text-emerald-600 dark:text-emerald-400",
    },
    violet: {
      border: "border-l-violet-500",
      icon: "text-violet-500 dark:text-violet-400",
      text: "text-violet-600 dark:text-violet-400",
    },
  };
  const active = value > 0;
  const t = tones[activeTone];

  return (
    <Card className={`border-l-4 ${active ? t.border : "border-l-green-500"}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="flex items-center gap-2 mt-1">
              <Icon
                className={`h-5 w-5 ${active ? t.icon : "text-green-500 dark:text-green-400"}`}
              />
              <p
                className={`text-2xl sm:text-3xl font-bold ${
                  active ? t.text : "text-green-600 dark:text-green-400"
                }`}
              >
                {value}
              </p>
            </div>
            <p
              className={`text-xs mt-1 ${
                active ? "text-muted-foreground" : "text-green-600 dark:text-green-400"
              }`}
            >
              {active ? activeHint : emptyHint}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type TaskTone = "amber" | "emerald" | "blue";

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
  const styles: Record<TaskTone, { border: string; bg: string; icon: string; text: string; btn: string }> =
    {
      amber: {
        border: "border-amber-200 dark:border-amber-800",
        bg: "bg-amber-50 dark:bg-amber-950/20",
        icon: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30",
        text: "text-amber-900 dark:text-amber-100",
        btn: "border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300",
      },
      emerald: {
        border: "border-emerald-200 dark:border-emerald-800",
        bg: "bg-emerald-50 dark:bg-emerald-950/20",
        icon: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30",
        text: "text-emerald-900 dark:text-emerald-100",
        btn: "border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300",
      },
      blue: {
        border: "border-blue-200 dark:border-blue-800",
        bg: "bg-blue-50 dark:bg-blue-950/20",
        icon: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30",
        text: "text-blue-900 dark:text-blue-100",
        btn: "border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300",
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

function PendingPatientRow({ task }: { task: NursingPendingTask }) {
  const segmentLabel =
    task.segment === "pending_vitals"
      ? "Pending vitals"
      : task.segment === "vitals_incomplete"
        ? "Incomplete vitals"
        : "Ready";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="font-medium truncate">{task.patientName}</p>
        <p className="text-xs text-muted-foreground truncate">{task.subtitle}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant="outline" className="text-xs capitalize">
          {segmentLabel}
        </Badge>
        <Button asChild variant="ghost" size="sm">
          <Link href={task.href}>
            Open
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
