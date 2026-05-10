"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet,
  RefreshCw,
  ArrowLeft,
  Printer,
  TrendingUp,
  Users,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  MapPin,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";

interface EscortSummary {
  total: number;
  pending: number;
  confirmed: number;
  overdue_pending: number;
  avg_minutes_to_arrival: number | null;
  outcome_counts: Record<string, number>;
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
  primary_nurse: string;
  additional_nurses: string;
  referral_id: string;
  referral_status: string;
  urgency: string;
  handover_summary: string;
  arrival_confirmed_at: string | null;
  arrival_outcome: string;
  arrival_notes: string;
  arrival_confirmed_by: string;
}

interface TopFacility {
  facility: string;
  count: number;
}

interface EscortReportResponse {
  summary: EscortSummary;
  top_facilities: TopFacility[];
  data: EscortRow[];
}

const initialSummary: EscortSummary = {
  total: 0,
  pending: 0,
  confirmed: 0,
  overdue_pending: 0,
  avg_minutes_to_arrival: null,
  outcome_counts: {},
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function EscortLogReport() {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState(currentYear);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<"year" | "range">("year");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed">("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [summary, setSummary] = useState<EscortSummary>(initialSummary);
  const [topFacilities, setTopFacilities] = useState<TopFacility[]>([]);
  const [rows, setRows] = useState<EscortRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const setThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(firstDay.toISOString().split("T")[0]);
    setEndDate(lastDay.toISOString().split("T")[0]);
    setViewMode("range");
  };

  const setThisYear = () => {
    setYear(currentYear);
    setViewMode("year");
  };

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (viewMode === "year") {
        params.set("year", year);
      } else if (startDate && endDate) {
        params.set("start_date", startDate);
        params.set("end_date", endDate);
      } else {
        toast.error("Please select both start and end dates");
        setIsLoading(false);
        return;
      }
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (outcomeFilter !== "all") params.set("outcome", outcomeFilter);

      const response = await apiFetch<EscortReportResponse>(`/reports/escort-log/?${params.toString()}`);
      setSummary(response.summary || initialSummary);
      setTopFacilities(response.top_facilities || []);
      setRows(response.data || []);
    } catch (error: unknown) {
      console.error("Error fetching escort log report:", error);
      const msg = error instanceof Error ? error.message : "Failed to load escort log report";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === "year" && year) fetchReport();
    if (viewMode === "range" && startDate && endDate) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode, statusFilter, outcomeFilter]);

  const exportToCSV = () => {
    const period = viewMode === "year" ? year : `${startDate}_to_${endDate}`;
    const lines: string[] = [
      "ESCORT LOG REPORT",
      `Period: ${period}`,
      `Status: ${statusFilter}`,
      `Outcome: ${outcomeFilter}`,
      "",
      "Summary",
      "Metric,Value",
      `Total escorts,${summary.total}`,
      `Pending arrival,${summary.pending}`,
      `Arrival confirmed,${summary.confirmed}`,
      `Pending > 24h (overdue),${summary.overdue_pending}`,
      `Avg time to arrival,${formatDuration(summary.avg_minutes_to_arrival)}`,
      "",
      "Outcomes",
      "Outcome,Count",
      ...Object.entries(summary.outcome_counts).map(([k, v]) => `${k},${v}`),
      "",
      "Top facilities",
      "Facility,Count",
      ...topFacilities.map((f) => `"${f.facility.replace(/"/g, '""')}",${f.count}`),
      "",
      "Detail",
      [
        "S/N",
        "Patient ID",
        "Patient",
        "Admission",
        "Ward",
        "Departure",
        "Facility",
        "Transport",
        "Primary nurse",
        "Additional escorts",
        "Referral",
        "Urgency",
        "Handover summary",
        "Arrival",
        "Outcome",
        "Arrival notes",
        "Arrival confirmed by",
      ].join(","),
    ];

    rows.forEach((r) => {
      const csvCell = (s: unknown) => {
        const str = String(s ?? "");
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };
      lines.push(
        [
          r.sn,
          csvCell(r.patient_id),
          csvCell(r.patient_name),
          csvCell(r.admission_id),
          csvCell(r.ward),
          csvCell(r.departure_at ?? ""),
          csvCell(r.facility),
          csvCell(r.transport_mode),
          csvCell(r.primary_nurse),
          csvCell(r.additional_nurses),
          csvCell(r.referral_id),
          csvCell(r.urgency),
          csvCell(r.handover_summary),
          csvCell(r.arrival_confirmed_at ?? ""),
          csvCell(r.arrival_outcome),
          csvCell(r.arrival_notes),
          csvCell(r.arrival_confirmed_by),
        ].join(","),
      );
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `escort_log_${period}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
  const periodLabel = viewMode === "year" ? year : `${startDate} to ${endDate}`;

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
              Patients escorted off-site by ward nurses to external facilities, with arrival confirmation and handover trail.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" onClick={fetchReport} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportToCSV} disabled={!rows.length}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        <div className="flex gap-2 print:hidden">
          <Button
            variant={viewMode === "range" && startDate.includes(new Date().toISOString().slice(0, 7)) ? "default" : "outline"}
            onClick={setThisMonth}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            This Month
          </Button>
          <Button
            variant={viewMode === "year" && year === currentYear ? "default" : "outline"}
            onClick={setThisYear}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            This Year
          </Button>
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>Adjust period, escort status, and arrival outcome.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <Label>View Mode</Label>
                <Select value={viewMode} onValueChange={(v: "year" | "range") => setViewMode(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">By Year</SelectItem>
                    <SelectItem value="range">Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {viewMode === "year" ? (
                <div>
                  <Label>Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </>
              )}
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
                    <SelectItem value="voicemail">Voicemail</SelectItem>
                    <SelectItem value="in_person">In person</SelectItem>
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

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total escorts</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">All escort entries in selected period</p>
                </div>
                <Users className="h-10 w-10 text-rose-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending arrival</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.pending.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting nurse callback</p>
                </div>
                <Clock className="h-10 w-10 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Arrival confirmed</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.confirmed.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.confirmed / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <CheckCircle className="h-10 w-10 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overdue (&gt;24h)</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.overdue_pending.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Departed but no callback</p>
                </div>
                <AlertTriangle className="h-10 w-10 text-red-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Average time to arrival
              </CardTitle>
              <CardDescription>Departure → confirmed arrival, across confirmed escorts.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatDuration(summary.avg_minutes_to_arrival)}</p>
              {summary.avg_minutes_to_arrival == null && (
                <p className="text-xs text-muted-foreground mt-2">No confirmed escorts in this period.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Top receiving facilities
              </CardTitle>
              <CardDescription>Where most escorted patients went.</CardDescription>
            </CardHeader>
            <CardContent>
              {topFacilities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No escort destinations recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {topFacilities.slice(0, 5).map((f) => (
                    <li key={f.facility} className="flex items-center justify-between text-sm">
                      <span className="truncate">{f.facility}</span>
                      <Badge variant="outline" className="text-xs">{f.count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-2">
          <CardHeader>
            <CardTitle>Escort details — {periodLabel}</CardTitle>
            <CardDescription>One row per escort log entry. Showing up to 200; CSV exports the same.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-10">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading escort log...</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-10">
                <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No escort entries for this period / filter.</p>
              </div>
            ) : (
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
                      <th className="text-left p-2 font-medium text-muted-foreground">Additional</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Arrival</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.escort_id} className="border-b border-border hover:bg-muted/30 transition-colors align-top">
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
                            <Badge variant="outline" className={`text-[10px] mt-1 ${
                              r.urgency === "emergency"
                                ? "border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10"
                                : r.urgency === "urgent"
                                ? "border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10"
                                : "border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10"
                            }`}>
                              {r.urgency}
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 capitalize">{r.transport_mode.replace(/_/g, " ") || "—"}</td>
                        <td className="p-2">{r.primary_nurse || "—"}</td>
                        <td className="p-2 text-xs">{r.additional_nurses || "—"}</td>
                        <td className="p-2 whitespace-nowrap">
                          {r.arrival_confirmed_at ? (
                            <div>
                              <div>{formatDateTime(r.arrival_confirmed_at)}</div>
                              {r.arrival_confirmed_by && (
                                <div className="text-xs text-muted-foreground">by {r.arrival_confirmed_by}</div>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                              Pending
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 capitalize">{r.arrival_outcome.replace(/_/g, " ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
