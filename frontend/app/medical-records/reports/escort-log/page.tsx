"use client";

import React, { useState } from "react";
import { formatDisplayDateTime } from "@/lib/dates";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  ArrowLeft,
  TrendingUp,
  Users,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Building2,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

interface FacilityRow {
  facility: string;
  count: number;
  percentage: number;
}

interface EscortSummary {
  total_escorts: number;
  distinct_patients: number;
  pending_arrival: number;
  arrival_confirmed: number;
  overdue_pending: number;
  avg_minutes_to_arrival: number | null;
  total: number;
  pending: number;
  confirmed: number;
}

interface EscortRow {
  sn: number;
  escort_id: number;
  patient_id: string;
  patient_name: string;
  admission_id: string;
  ward: string;
  departure_at: string | null;
  facility: string;
  transport_mode: string;
  transport_label?: string;
  primary_nurse: string;
  additional_nurses: string;
  referral_id: string;
  referral_status: string;
  urgency: string;
  handover_summary: string;
  arrival_confirmed_at: string | null;
  arrival_outcome: string;
  arrival_outcome_label?: string;
  arrival_notes: string;
  arrival_confirmed_by: string;
}

const emptySummary: EscortSummary = {
  total_escorts: 0,
  distinct_patients: 0,
  pending_arrival: 0,
  arrival_confirmed: 0,
  overdue_pending: 0,
  avg_minutes_to_arrival: null,
  total: 0,
  pending: 0,
  confirmed: 0,
};

function normalizeSummary(raw?: Partial<EscortSummary> | null): EscortSummary {
  const total = raw?.total_escorts ?? raw?.total ?? 0;
  return {
    total_escorts: total,
    distinct_patients: raw?.distinct_patients ?? 0,
    pending_arrival: raw?.pending_arrival ?? raw?.pending ?? 0,
    arrival_confirmed: raw?.arrival_confirmed ?? raw?.confirmed ?? 0,
    overdue_pending: raw?.overdue_pending ?? 0,
    avg_minutes_to_arrival: raw?.avg_minutes_to_arrival ?? null,
    total,
    pending: raw?.pending_arrival ?? raw?.pending ?? 0,
    confirmed: raw?.arrival_confirmed ?? raw?.confirmed ?? 0,
  };
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const formatted = formatDisplayDateTime(iso);
  return formatted === "—" ? iso : formatted;
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function EscortLogReport() {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const {
    year,
    setYear,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    viewMode,
    setViewMode,
    canFetch,
    buildQuery,
    filenameSuffix,
    periodLabel,
    years,
  } = useMrReportPeriod("all");

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed">("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [summary, setSummary] = useState<EscortSummary>(emptySummary);
  const [outcomeBreakdown, setOutcomeBreakdown] = useState<BreakdownRow[]>([]);
  const [facilityBreakdown, setFacilityBreakdown] = useState<FacilityRow[]>([]);
  const [rows, setRows] = useState<EscortRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isAllTime = viewMode === "all";
  const hasData = summary.total > 0;

  const escortExtraFilters = (): Record<string, string> | undefined => {
    const extra: Record<string, string> = {};
    if (statusFilter !== "all") extra.status = statusFilter;
    if (outcomeFilter !== "all") extra.outcome = outcomeFilter;
    return Object.keys(extra).length ? extra : undefined;
  };

  const fetchReport = async () => {
    const params = buildQuery(escortExtraFilters());
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<{
        summary: EscortSummary;
        outcome_breakdown?: BreakdownRow[];
        facility_breakdown?: FacilityRow[];
        data: EscortRow[];
      }>(`/reports/escort-log/?${params.toString()}`);

      setSummary(normalizeSummary(response.summary));
      setOutcomeBreakdown(response.outcome_breakdown ?? []);
      setFacilityBreakdown(response.facility_breakdown ?? []);
      setRows(response.data ?? []);
    } catch (error: unknown) {
      console.error("Error fetching escort log report:", error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load escort log report");
      setSummary(emptySummary);
      setOutcomeBreakdown([]);
      setFacilityBreakdown([]);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useMrReportAutoFetch(ready, canFetch, fetchReport, [
    year,
    startDate,
    endDate,
    viewMode,
    statusFilter,
    outcomeFilter,
  ]);

  const buildExportQuery = () => buildQuery(escortExtraFilters());

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="mb-2 print:hidden">
          <Button variant="ghost" size="sm" className="-ml-2 gap-2 px-2" asChild>
            <Link href="/medical-records/reports">
              <ArrowLeft className="h-4 w-4" />
              Back to reports
            </Link>
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <MapPin className="h-8 w-8 text-rose-500" />
              Escort Log Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Patients escorted to external facilities — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/escort-log/"
              buildQuery={buildExportQuery}
              filenameBase={`escort_log_${filenameSuffix}`}
              disabled={!hasData}
            />
          </div>
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>Adjust period, escort status, and arrival outcome.</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <ReportDateFilterFields
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                year={year}
                onYearChange={setYear}
                startDate={startDate}
                onStartDateChange={setStartDate}
                endDate={endDate}
                onEndDateChange={setEndDate}
                yearOptions={years}
              />
              <div>
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={(v: "all" | "pending" | "confirmed") => setStatusFilter(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending arrival</SelectItem>
                    <SelectItem value="confirmed">Arrival confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Outcome</Label>
                <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All outcomes</SelectItem>
                    <SelectItem value="answered">Answered</SelectItem>
                    <SelectItem value="voicemail">Voicemail / no answer</SelectItem>
                    <SelectItem value="handover_in_person">Handover in person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={fetchReport} className="w-full" disabled={isLoading}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {isLoading ? "Loading..." : "Generate Report"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading report data...</p>
            </CardContent>
          </Card>
        ) : hasData ? (
          <>
            <div className={`grid gap-4 ${isAllTime ? "md:grid-cols-2" : "md:grid-cols-4"}`}>
              <Card className="border-l-4 border-l-rose-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Total escorts
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">
                    {summary.total.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Escort log entries in period</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Distinct patients
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                    {summary.distinct_patients.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isAllTime
                      ? `${summary.arrival_confirmed.toLocaleString()} confirmed · ${summary.pending_arrival.toLocaleString()} pending`
                      : "Patients escorted in period"}
                  </p>
                </CardContent>
              </Card>
              {!isAllTime && (
                <>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Pending arrival
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">
                        {summary.pending_arrival.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Awaiting nurse callback</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Overdue (&gt;24h)
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400">
                        {summary.overdue_pending.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Departed but no callback</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {!isAllTime && (
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-l-4 border-l-emerald-500">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Arrival confirmed
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                      {summary.arrival_confirmed.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summary.total > 0
                        ? `${((summary.arrival_confirmed / summary.total) * 100).toFixed(1)}% of total`
                        : "0% of total"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-violet-500">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Timer className="h-4 w-4" />
                      Average time to arrival
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">
                      {formatDuration(summary.avg_minutes_to_arrival)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Departure → confirmed arrival</p>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-orange-500" />
                    Receiving facilities
                  </CardTitle>
                  <CardDescription>Where escorted patients were sent — {periodLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  {facilityBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No escort destinations recorded.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">Facility</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Escorts</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {facilityBreakdown.map((row) => (
                          <tr key={row.facility} className="border-b border-border">
                            <td className="p-2">{row.facility}</td>
                            <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                            <td className="p-2 text-right">{row.percentage.toFixed(1)}%</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/50 font-bold">
                          <td className="p-2">Total</td>
                          <td className="p-2 text-right">{summary.total.toLocaleString()}</td>
                          <td className="p-2 text-right">100.0%</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Arrival outcomes
                  </CardTitle>
                  <CardDescription>Callback / handover result for confirmed escorts — {periodLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  {outcomeBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No confirmed escorts with outcomes in this period.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">Outcome</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Escorts</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outcomeBreakdown.map((row) => (
                          <tr key={row.key} className="border-b border-border">
                            <td className="p-2">{row.label}</td>
                            <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                            <td className="p-2 text-right">{row.percentage.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {isAllTime && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Timer className="h-4 w-4" />
                        Average time to arrival
                      </p>
                      <p className="text-xl font-bold mt-1">{formatDuration(summary.avg_minutes_to_arrival)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {summary.avg_minutes_to_arrival == null
                          ? "No confirmed escorts with departure times."
                          : "Across confirmed escorts with departure logged"}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Escort details — {periodLabel}</CardTitle>
                <CardDescription>
                  One row per escort log entry. Showing up to 200; CSV exports the same.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">S/N</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Patient</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Admission</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Departure</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Facility</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Transport</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Primary nurse</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Arrival</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.escort_id} className="border-b border-border align-top">
                          <td className="p-2">{r.sn}</td>
                          <td className="p-2">
                            <div className="font-medium">{r.patient_name || r.patient_id}</div>
                            <div className="text-xs text-muted-foreground">{r.patient_id}</div>
                          </td>
                          <td className="p-2">
                            <div>{r.admission_id}</div>
                            <div className="text-xs text-muted-foreground">{r.ward}</div>
                          </td>
                          <td className="p-2 whitespace-nowrap">{formatDateTime(r.departure_at)}</td>
                          <td className="p-2">
                            <div>{r.facility || "—"}</div>
                            {r.urgency && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] mt-1 ${
                                  r.urgency === "emergency"
                                    ? "border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10"
                                    : r.urgency === "urgent"
                                      ? "border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10"
                                      : "border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10"
                                }`}
                              >
                                {r.urgency}
                              </Badge>
                            )}
                          </td>
                          <td className="p-2">{r.transport_label || r.transport_mode.replace(/_/g, " ") || "—"}</td>
                          <td className="p-2">{r.primary_nurse || "—"}</td>
                          <td className="p-2 whitespace-nowrap">
                            {r.arrival_confirmed_at ? (
                              <div>
                                <div>{formatDateTime(r.arrival_confirmed_at)}</div>
                                {r.arrival_confirmed_by && (
                                  <div className="text-xs text-muted-foreground">by {r.arrival_confirmed_by}</div>
                                )}
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                              >
                                Pending
                              </Badge>
                            )}
                          </td>
                          <td className="p-2">
                            {r.arrival_outcome_label || r.arrival_outcome.replace(/_/g, " ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
              <p className="text-sm text-muted-foreground">
                No escort entries for {periodLabel}
                {statusFilter !== "all" || outcomeFilter !== "all" ? " with the selected filters" : ""}.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
