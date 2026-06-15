"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { adminService, helpService } from "@/lib/services";
import { formatDisplayTime } from "@/lib/dates";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Database,
  HardDrive,
  Loader2,
  Server,
} from "lucide-react";

type HealthStatus = "healthy" | "warning" | "error" | "unknown";

type SystemHealthItem = {
  name: string;
  status: HealthStatus;
  icon?: string;
  uptime?: string | null;
  uptime_seconds?: number | null;
  detail?: string;
  started_at?: string;
  engine?: string;
  path?: string;
  free_gb?: number;
  total_gb?: number;
  used_gb?: number;
  used_pct?: number;
};

type BackupStatus = {
  status?: string;
  message?: string;
  lastBackup?: string;
  hoursAgo?: number;
  filename?: string;
  directory?: string;
};

const POLL_INTERVAL_MS = 30_000;

function statusColor(status: string) {
  switch (status) {
    case "healthy":
      return "text-green-500";
    case "warning":
      return "text-yellow-500";
    case "error":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}

function statusSurfaceClass(status: string) {
  switch (status) {
    case "healthy":
      return "from-emerald-950/40 to-emerald-900/20 border-emerald-500/20";
    case "warning":
      return "from-amber-950/40 to-amber-900/20 border-amber-500/20";
    case "error":
      return "from-red-950/40 to-red-900/20 border-red-500/20";
    default:
      return "from-slate-900/50 to-slate-800/50 border-slate-700/50";
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "healthy") {
    return (
      <UiBadge className="bg-green-500/10 text-green-700 border-green-500/20 text-xs dark:text-green-300">
        <CheckCircle className="h-3 w-3 mr-1" />
        Healthy
      </UiBadge>
    );
  }
  if (status === "warning") {
    return (
      <UiBadge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20 text-xs dark:text-yellow-300">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Warning
      </UiBadge>
    );
  }
  if (status === "error") {
    return (
      <UiBadge className="bg-red-500/10 text-red-700 border-red-500/20 text-xs dark:text-red-300">
        <AlertCircle className="h-3 w-3 mr-1" />
        Error
      </UiBadge>
    );
  }
  return (
    <UiBadge variant="outline" className="text-xs">
      Unknown
    </UiBadge>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 py-2 border-b border-border/40 last:border-0">
      <span className="text-xs font-medium text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground sm:text-right break-all">{value}</span>
    </div>
  );
}

function componentIcon(name: string) {
  if (name === "Database") return Database;
  if (name === "File Storage") return HardDrive;
  return Server;
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
  );
}

export default function SystemHealthPage() {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [systemHealth, setSystemHealth] = useState<SystemHealthItem[]>([]);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ status: "unknown" });
  const [readiness, setReadiness] = useState<Record<string, string>>({});
  const [readinessOverall, setReadinessOverall] = useState<HealthStatus>("unknown");
  const [performance, setPerformance] = useState({
    responseTimeMs: undefined as number | undefined,
    errorRate: undefined as number | undefined,
    responseTimeSample: undefined as number | undefined,
    mediaStorageGb: undefined as number | undefined,
  });
  const [metricSources, setMetricSources] = useState<Record<string, string>>({});
  const isMountedRef = useRef(true);

  const loadData = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const [metrics, readinessResult] = await Promise.all([
        adminService.getSystemMetrics(),
        helpService.getSystemStatus().catch(() => ({
          status: "unhealthy" as const,
          services: { api: "unhealthy: check failed" },
        })),
      ]);

      if (!isMountedRef.current) return;

      setSystemHealth((metrics.systemHealth || []) as SystemHealthItem[]);
      setBackupStatus((metrics.backupStatus || { status: "unknown" }) as BackupStatus);
      setPerformance({
        responseTimeMs: metrics.responseTimeMs,
        errorRate: metrics.errorRate,
        responseTimeSample: metrics.responseTimeSample,
        mediaStorageGb: metrics.mediaStorageGb,
      });
      setMetricSources(metrics.sources || {});
      const services = readinessResult.services || {};
      setReadiness(
        Object.fromEntries(
          Object.entries(services).filter((entry): entry is [string, string] => entry[1] != null),
        ),
      );
      setReadinessOverall(readinessResult.status === "healthy" ? "healthy" : "error");
      setLastUpdated(formatDisplayTime(new Date()));
    } catch (err: unknown) {
      if (!opts.silent) {
        toast.error("Failed to load system health");
      }
      console.error(err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadData();

    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadData({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [loadData]);

  const coreStatuses: HealthStatus[] = [
    ...systemHealth.map((s) => s.status),
    readinessOverall,
  ];
  const overallStatus: HealthStatus = (() => {
    if (coreStatuses.includes("error")) return "error";
    if (coreStatuses.includes("warning")) return "warning";
    if (coreStatuses.length > 0 && coreStatuses.every((s) => s === "healthy")) return "healthy";
    return "unknown";
  })();

  const backupDisplayStatus: HealthStatus = (() => {
    const raw = backupStatus.status || "unknown";
    if (raw === "unknown" && /no backup files found/i.test(backupStatus.message || "")) {
      return "warning";
    }
    return raw as HealthStatus;
  })();

  const backupLabel =
    backupDisplayStatus === "healthy"
      ? "Healthy"
      : backupDisplayStatus === "warning"
        ? backupStatus.lastBackup
          ? "Stale"
          : "Not configured"
        : backupDisplayStatus === "error"
          ? "Error"
          : "Unknown";

  const overallLabel =
    overallStatus === "healthy"
      ? "All core services operational"
      : overallStatus === "warning"
        ? "One or more services need attention"
        : overallStatus === "error"
          ? "Service disruption detected"
          : "Status unavailable";

  return (
    <DashboardLayout>
      <div className="container mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
        {/* Page header — matches System Settings / admin pages */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <Link href="/admin" className="hover:text-foreground transition-colors">
                Administration
              </Link>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="text-foreground">System Health</span>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Activity className="h-8 w-8 text-emerald-500 shrink-0" />
              System Health
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Live infrastructure monitoring — API process, database, disk volume, cache, backups, and API performance.
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            {lastUpdated && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Auto-refresh · updated {lastUpdated}
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
            <p>Loading system health…</p>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <Card className={`bg-gradient-to-r border ${statusSurfaceClass(overallStatus)}`}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <CheckCircle className={`h-6 w-6 shrink-0 ${statusColor(overallStatus)}`} />
                    <div>
                      <p className="font-semibold text-foreground">{overallLabel}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Core infrastructure only. Backup advisories are listed separately.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {systemHealth.map((system) => (
                      <UiBadge
                        key={system.name}
                        variant="outline"
                        className="bg-background/40 text-xs font-normal"
                      >
                        <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                          system.status === "healthy"
                            ? "bg-green-500"
                            : system.status === "warning"
                              ? "bg-yellow-500"
                              : system.status === "error"
                                ? "bg-red-500"
                                : "bg-muted-foreground"
                        }`} />
                        {system.name}
                      </UiBadge>
                    ))}
                    <UiBadge variant="outline" className="bg-background/40 text-xs font-normal">
                      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                        readinessOverall === "healthy" ? "bg-green-500" : "bg-red-500"
                      }`} />
                      Cache
                    </UiBadge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-3">
              {/* Left column — infrastructure + performance */}
              <div className="xl:col-span-2 space-y-6">
                <section>
                  <SectionHeading
                    title="Infrastructure"
                    description="Process uptime, database, and disk volume on the API server"
                  />
                  <div className="grid gap-4 md:grid-cols-3">
                    {systemHealth.map((system) => {
                      const Icon = componentIcon(system.name);
                      return (
                        <Card key={system.name} className="flex flex-col">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Icon className={`h-5 w-5 shrink-0 ${statusColor(system.status)}`} />
                                <CardTitle className="text-base truncate">{system.name}</CardTitle>
                              </div>
                              <StatusBadge status={system.status} />
                            </div>
                            {system.detail && (
                              <CardDescription className="mt-2 line-clamp-2">{system.detail}</CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="flex-1 space-y-1">
                            {system.name !== "File Storage" && (
                              <DetailRow
                                label="Uptime"
                                value={system.uptime ? `Up ${system.uptime}` : undefined}
                              />
                            )}
                            {system.name === "API Server" && (
                              <DetailRow
                                label="Process started"
                                value={
                                  system.started_at
                                    ? formatDisplayTime(new Date(system.started_at))
                                    : undefined
                                }
                              />
                            )}
                            {system.name === "Database" && (
                              <DetailRow
                                label="Engine"
                                value={
                                  system.engine === "postgresql"
                                    ? "PostgreSQL"
                                    : system.engine
                                }
                              />
                            )}
                            {system.name === "File Storage" && (
                              <>
                                <DetailRow label="Media path" value={system.path} />
                                {typeof system.used_pct === "number" ? (
                                  <div className="pt-2 space-y-2">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                      <span>Disk volume</span>
                                      <span>{system.used_pct}% used</span>
                                    </div>
                                    <Progress value={system.used_pct} className="h-2" />
                                    <DetailRow
                                      label="Capacity"
                                      value={
                                        system.free_gb !== undefined && system.total_gb !== undefined
                                          ? `${system.free_gb} GB free of ${system.total_gb} GB`
                                          : undefined
                                      }
                                    />
                                  </div>
                                ) : (
                                  system.detail && <DetailRow label="Volume" value={system.detail} />
                                )}
                              </>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <SectionHeading
                    title="Performance"
                    description="Rolling 5-minute API window and uploaded file footprint"
                  />
                  <Card>
                    <CardContent className="p-4 sm:p-6 grid gap-4 sm:grid-cols-3">
                      <MetricTile
                        label="Response time"
                        value={
                          performance.responseTimeMs !== undefined
                            ? `${performance.responseTimeMs} ms`
                            : null
                        }
                        live={metricSources.responseTimeMs === "live"}
                        hint={
                          performance.responseTimeSample
                            ? `Avg over ${performance.responseTimeSample} request(s)`
                            : "Waiting for API traffic"
                        }
                      />
                      <MetricTile
                        label="Error rate"
                        value={
                          performance.errorRate !== undefined
                            ? `${performance.errorRate.toFixed(2)}%`
                            : null
                        }
                        live={metricSources.errorRate === "live"}
                        hint="5xx share (5 min window)"
                      />
                      <MetricTile
                        label="Uploaded media"
                        value={
                          performance.mediaStorageGb !== undefined
                            ? `${performance.mediaStorageGb.toFixed(2)} GB`
                            : null
                        }
                        live={metricSources.mediaStorageGb === "live"}
                        hint="Files in MEDIA_ROOT, not whole disk"
                      />
                    </CardContent>
                  </Card>
                </section>
              </div>

              {/* Right column — readiness + backup */}
              <div className="space-y-6">
                <section>
                  <SectionHeading title="Readiness" description="Deep connectivity checks via /health/" />
                  <Card id="readiness">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-border/50">
                        <span className="text-sm font-medium">Overall</span>
                        <StatusBadge status={readinessOverall} />
                      </div>
                      {Object.keys(readiness).length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">No readiness data available.</p>
                      ) : (
                        Object.entries(readiness).map(([service, state]) => {
                          const ok = state === "healthy";
                          return (
                            <div
                              key={service}
                              className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                            >
                              <span className="text-sm capitalize">{service}</span>
                              <UiBadge
                                className={
                                  ok
                                    ? "bg-green-500/10 text-green-700 border-green-500/20 text-xs"
                                    : "bg-red-500/10 text-red-700 border-red-500/20 text-xs"
                                }
                              >
                                {state}
                              </UiBadge>
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </section>

                <section>
                  <SectionHeading title="Backups" description="Latest snapshot found on disk" />
                  <Card id="backup">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Backup status</CardTitle>
                        <StatusBadge status={backupDisplayStatus} />
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-1">
                      <DetailRow label="Status" value={backupLabel} />
                      <DetailRow
                        label="Message"
                        value={
                          backupDisplayStatus === "warning" &&
                          /no backup files found/i.test(backupStatus.message || "")
                            ? "No backup files found. Run a backup job or set BACKUP_DIR."
                            : backupStatus.message
                        }
                      />
                      <DetailRow
                        label="Last backup"
                        value={
                          backupStatus.lastBackup
                            ? formatDisplayTime(new Date(backupStatus.lastBackup))
                            : undefined
                        }
                      />
                      <DetailRow
                        label="Age"
                        value={
                          backupStatus.hoursAgo !== undefined
                            ? `${backupStatus.hoursAgo} hour${backupStatus.hoursAgo === 1 ? "" : "s"} ago`
                            : undefined
                        }
                      />
                      <DetailRow label="File" value={backupStatus.filename} />
                      <DetailRow label="Directory" value={backupStatus.directory} />
                    </CardContent>
                  </Card>
                </section>

                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
                    <p>
                      <strong className="text-foreground font-medium">Disk vs media:</strong>{" "}
                      File Storage reports the server partition (e.g. 70% used). Uploaded media reports
                      actual EMR files only (often much smaller).
                    </p>
                    <p>
                      <strong className="text-foreground font-medium">Uptime:</strong> API uptime
                      resets on backend restart. Database uptime is since PostgreSQL postmaster start.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function MetricTile({
  label,
  value,
  live,
  hint,
}: {
  label: string;
  value: string | null;
  live: boolean;
  hint: string;
}) {
  return (
    <div className="p-4 rounded-lg border border-border/60 bg-muted/20 h-full">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-medium">{label}</span>
        {live ? (
          <UiBadge variant="outline" className="text-[10px]">
            Live
          </UiBadge>
        ) : (
          <UiBadge variant="secondary" className="text-[10px]">
            N/A
          </UiBadge>
        )}
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value ?? "—"}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}
