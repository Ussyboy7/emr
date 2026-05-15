"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ScanLine,
  FileImage,
  FileSearch,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ClipboardList,
  RefreshCw,
  Notebook,
} from "lucide-react";
import { radiologyService, type RadiologyOrder } from "@/lib/services";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { isAuthenticationError } from "@/lib/auth-errors";
import { useServerToday } from "@/hooks/use-server-today";
import { joinDisplayParts } from "@/lib/utils/clinic-utils";
import { toast } from "sonner";
import { RadiologyPatientFinder } from "@/components/radiology/RadiologyPatientFinder";

interface RadiologyDashboardStats {
  pending: number;
  inProgress: number;
  awaitingReport: number;
  critical: number;
  stat: number;
}

function patientLabel(order: RadiologyOrder): string {
  return order.patient_name || order.patient_details?.name || "Patient";
}

function formatOrderedAt(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function RadiologyPage() {
  const router = useRouter();
  const serverToday = useServerToday();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<unknown>(null);
  useAuthRedirect(authError);

  const [stats, setStats] = useState<RadiologyDashboardStats>({
    pending: 0,
    inProgress: 0,
    awaitingReport: 0,
    critical: 0,
    stat: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RadiologyOrder[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [orderStats, verificationStats, ordersRes] = await Promise.all([
        radiologyService.getOrderStats({ date: serverToday }),
        radiologyService.getVerificationStats({ date: serverToday }).catch(() => ({
          total: 0,
          normal: 0,
          abnormal: 0,
          critical: 0,
        })),
        radiologyService.getOrders({ date: serverToday, page: 1, page_size: 5 }),
      ]);

      setStats({
        pending: orderStats.pending ?? 0,
        inProgress: orderStats.processing ?? 0,
        awaitingReport: orderStats.results_ready ?? 0,
        critical: verificationStats.critical ?? 0,
        stat: orderStats.stat ?? 0,
      });
      setRecentOrders(ordersRes.results ?? []);
    } catch (error) {
      console.error("Failed to load radiology dashboard:", error);
      if (isAuthenticationError(error)) {
        setAuthError(error);
      } else {
        toast.error("Failed to load radiology dashboard. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [serverToday]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeWorkCount = useMemo(
    () => stats.pending + stats.inProgress + stats.awaitingReport + stats.stat,
    [stats],
  );

  const hasPendingTasks = activeWorkCount > 0 || stats.critical > 0;

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <ScanLine className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold">Radiology Department</h1>
                  <p className="text-sm sm:text-base text-cyan-100">
                    Medical imaging, study processing, and radiologist reporting
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-white text-cyan-600 hover:bg-cyan-50 shadow-md"
                  onClick={() => router.push("/radiology/orders")}
                >
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Study Orders
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => void loadData()}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <RadiologyPatientFinder />

        {/* Today's Overview */}
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
                <Card
                  className={`border-l-4 ${stats.pending > 0 ? "border-l-amber-500" : "border-l-green-500"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pending Orders</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock
                            className={`h-5 w-5 ${stats.pending > 0 ? "text-amber-500 dark:text-amber-400" : "text-green-500 dark:text-green-400"}`}
                          />
                          <p
                            className={`text-2xl sm:text-3xl font-bold ${stats.pending > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}
                          >
                            {stats.pending}
                          </p>
                        </div>
                        {stats.pending === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All caught up!</p>
                        ) : (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Studies awaiting processing</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className={`border-l-4 ${stats.inProgress === 0 ? "border-l-green-500" : "border-l-blue-500"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">In Progress</p>
                        <div className="flex items-center gap-2 mt-1">
                          <ScanLine
                            className={`h-5 w-5 ${stats.inProgress === 0 ? "text-green-500 dark:text-green-400" : "text-blue-500 dark:text-blue-400"}`}
                          />
                          <p
                            className={`text-2xl sm:text-3xl font-bold ${stats.inProgress === 0 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}
                          >
                            {stats.inProgress}
                          </p>
                        </div>
                        {stats.inProgress === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No studies in progress</p>
                        ) : (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Being processed</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className={`border-l-4 ${stats.awaitingReport === 0 ? "border-l-green-500" : "border-l-emerald-500"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Awaiting Report</p>
                        <div className="flex items-center gap-2 mt-1">
                          <FileSearch
                            className={`h-5 w-5 ${stats.awaitingReport === 0 ? "text-green-500 dark:text-green-400" : "text-emerald-500 dark:text-emerald-400"}`}
                          />
                          <p
                            className={`text-2xl sm:text-3xl font-bold ${stats.awaitingReport === 0 ? "text-green-600 dark:text-green-400" : "text-emerald-600 dark:text-emerald-400"}`}
                          >
                            {stats.awaitingReport}
                          </p>
                        </div>
                        {stats.awaitingReport === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All reports completed</p>
                        ) : (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Ready for verification</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className={`border-l-4 ${stats.critical === 0 ? "border-l-green-500" : "border-l-red-500"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Critical Findings</p>
                        <div className="flex items-center gap-2 mt-1">
                          <AlertTriangle
                            className={`h-5 w-5 ${stats.critical === 0 ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
                          />
                          <p
                            className={`text-2xl sm:text-3xl font-bold ${stats.critical === 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                          >
                            {stats.critical}
                          </p>
                        </div>
                        {stats.critical === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No critical findings</p>
                        ) : (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Needs review today</p>
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
            <Button
              onClick={() => router.push("/radiology/orders")}
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white border-l-4 border-l-white/20"
            >
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="text-xs sm:text-sm font-medium">Study Orders</span>
              <span className="text-[10px] sm:text-xs opacity-90">Process incoming orders</span>
            </Button>
            <Button
              onClick={() => router.push("/radiology/verification")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-cyan-500/30 hover:bg-cyan-500/10 border-l-4 border-l-cyan-500"
            >
              <FileSearch className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-500 dark:text-cyan-400" />
              <span className="text-xs sm:text-sm font-medium">Results Verification</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Verify radiology reports</span>
            </Button>
            <Button
              onClick={() => router.push("/radiology/analytics")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-cyan-500/30 hover:bg-cyan-500/10 border-l-4 border-l-blue-500"
            >
              <FileImage className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-xs sm:text-sm font-medium">Analytics</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">View analytics and reports</span>
            </Button>
            <Button
              onClick={() => router.push("/radiology/templates")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-cyan-500/30 hover:bg-cyan-500/10 border-l-4 border-l-emerald-500"
            >
              <Notebook className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-medium">Templates</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Manage study templates</span>
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
                  {hasPendingTasks ? `${activeWorkCount + stats.critical} action${activeWorkCount + stats.critical !== 1 ? "s" : ""}` : "✓ All Complete"}
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
                      Great work staying on top of radiology operations.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stats.stat > 0 && (
                      <TaskRow
                        title="STAT orders"
                        description={`${stats.stat} urgent order${stats.stat !== 1 ? "s" : ""} today`}
                        tone="red"
                        icon={AlertTriangle}
                        onView={() => router.push("/radiology/orders")}
                      />
                    )}
                    {stats.pending > 0 && (
                      <TaskRow
                        title="Pending orders"
                        description={`${stats.pending} order${stats.pending !== 1 ? "s" : ""} awaiting study processing`}
                        tone="amber"
                        icon={Clock}
                        onView={() => router.push("/radiology/orders")}
                      />
                    )}
                    {stats.inProgress > 0 && (
                      <TaskRow
                        title="Studies in progress"
                        description={`${stats.inProgress} order${stats.inProgress !== 1 ? "s" : ""} being processed`}
                        tone="blue"
                        icon={ScanLine}
                        onView={() => router.push("/radiology/orders")}
                      />
                    )}
                    {stats.awaitingReport > 0 && (
                      <TaskRow
                        title="Awaiting verification"
                        description={`${stats.awaitingReport} report${stats.awaitingReport !== 1 ? "s" : ""} ready to verify`}
                        tone="emerald"
                        icon={FileSearch}
                        onView={() => router.push("/radiology/verification")}
                      />
                    )}
                    {stats.critical > 0 && (
                      <TaskRow
                        title="Critical findings"
                        description={`${stats.critical} critical report${stats.critical !== 1 ? "s" : ""} today`}
                        tone="red"
                        icon={AlertTriangle}
                        onView={() => router.push("/radiology/verification")}
                      />
                    )}
                    {recentOrders.length > 0 && (
                      <div className="pt-2 border-t space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Recent orders today</p>
                        {recentOrders.slice(0, 3).map((order) => (
                          <div
                            key={order.id}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{patientLabel(order)}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {joinDisplayParts([
                                  order.order_id,
                                  order.studies?.length
                                    ? `${order.studies.length} stud${order.studies.length === 1 ? "y" : "ies"}`
                                    : "",
                                  order.clinic,
                                ])}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0 ml-2 capitalize">
                              {order.priority}
                            </Badge>
                          </div>
                        ))}
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
              ) : recentOrders.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No orders today</p>
                  <p className="text-xs text-muted-foreground">New study orders will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      className="w-full flex items-start gap-3 text-left rounded-lg p-2 hover:bg-muted/50 transition-colors"
                      onClick={() => router.push("/radiology/orders")}
                    >
                      <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{patientLabel(order)}</p>
                        <p className="text-xs text-muted-foreground">
                          {joinDisplayParts([order.order_id, formatOrderedAt(order.ordered_at)])}
                        </p>
                      </div>
                    </button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-cyan-600"
                    onClick={() => router.push("/radiology/orders")}
                  >
                    View all orders
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

type TaskTone = "amber" | "blue" | "emerald" | "red";

function TaskRow({
  title,
  description,
  tone,
  icon: Icon,
  onView,
}: {
  title: string;
  description: string;
  tone: TaskTone;
  icon: React.ComponentType<{ className?: string }>;
  onView: () => void;
}) {
  const styles: Record<TaskTone, { border: string; bg: string; icon: string; text: string; btn: string }> = {
    amber: {
      border: "border-amber-200 dark:border-amber-800",
      bg: "bg-amber-50 dark:bg-amber-950/20",
      icon: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30",
      text: "text-amber-900 dark:text-amber-100",
      btn: "border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300",
    },
    blue: {
      border: "border-blue-200 dark:border-blue-800",
      bg: "bg-blue-50 dark:bg-blue-950/20",
      icon: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30",
      text: "text-blue-900 dark:text-blue-100",
      btn: "border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300",
    },
    emerald: {
      border: "border-emerald-200 dark:border-emerald-800",
      bg: "bg-emerald-50 dark:bg-emerald-950/20",
      icon: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30",
      text: "text-emerald-900 dark:text-emerald-100",
      btn: "border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300",
    },
    red: {
      border: "border-red-200 dark:border-red-800",
      bg: "bg-red-50 dark:bg-red-950/20",
      icon: "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30",
      text: "text-red-900 dark:text-red-100",
      btn: "border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300",
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
      <Button size="sm" variant="outline" className={`shrink-0 ml-2 ${s.btn}`} onClick={onView}>
        View
      </Button>
    </div>
  );
}
