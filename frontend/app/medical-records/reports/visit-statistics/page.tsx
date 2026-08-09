"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AnalyticsReportLayout,
  type AnalyticsViewMode,
} from "@/components/analytics/AnalyticsReportLayout";
import { useReportDateRange } from "@/hooks/use-report-date-range";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";
import { buildReportPeriodQuery, canFetchReportPeriod } from "@/lib/report-period-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Activity, CheckCircle, XCircle, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";

interface VisitStatRow {
  period: string;
  period_label: string;
  completed: number;
  cancelled: number;
  in_progress: number;
  scheduled: number;
  total: number;
  male: number;
  female: number;
  employee: number;
  non_employee: number;
  officer: number;
  staff: number;
  emp_dependent: number;
  ret_dependent: number;
  nonnpa: number;
  retiree: number;
}

interface VisitStatSummary {
  completed: number;
  cancelled: number;
  in_progress: number;
  scheduled: number;
  total: number;
  male: number;
  female: number;
  employee: number;
  non_employee: number;
  officer: number;
  staff: number;
  emp_dependent: number;
  ret_dependent: number;
  nonnpa: number;
  retiree: number;
}



const statusStyles: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "text-emerald-600 dark:text-emerald-400" },
  cancelled: { label: "Cancelled", color: "text-red-600 dark:text-red-400" },
  in_progress: { label: "In Progress", color: "text-amber-600 dark:text-amber-400" },
  scheduled: { label: "Scheduled", color: "text-blue-600 dark:text-blue-400" },
};

export default function VisitStatisticsReport() {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("monthly");
  const [data, setData] = useState<VisitStatRow[]>([]);
  const emptySummary = useMemo<VisitStatSummary>(() => ({ completed: 0, cancelled: 0, in_progress: 0, scheduled: 0, total: 0, male: 0, female: 0, employee: 0, non_employee: 0, officer: 0, staff: 0, emp_dependent: 0, ret_dependent: 0, nonnpa: 0, retiree: 0 }), []);
  const [summary, setSummary] = useState<VisitStatSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const groupBy =
    viewMode === "daily"
      ? "day"
      : viewMode === "weekly"
        ? "week"
        : "month";

  const reportRange = useReportDateRange(viewMode, year, startDate, endDate);

  const buildQuery = useCallback(
    (extra?: Record<string, string>) => {
      const periodParams = buildReportPeriodQuery(viewMode, reportRange, "start_date");
      if (!periodParams) return null;
      periodParams.set("group_by", groupBy);
      if (extra) {
        Object.entries(extra).forEach(([k, v]) => periodParams.set(k, v));
      }
      return periodParams.toString();
    },
    [reportRange, groupBy, viewMode]
  );

  const fetchReport = useCallback(async () => {
    const qs = buildQuery();
    if (!qs) {
      toast.error("Please select a valid date range");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const response = await apiFetch<{ data: VisitStatRow[]; summary: VisitStatSummary }>(
        `/reports/visit-statistics/?${qs}`
      );
      setData(response.data || []);
      setSummary(response.summary || emptySummary);
      setHasLoaded(true);
    } catch (error: unknown) {
      console.error("Error fetching visit statistics:", error);
      if (handleAuthError(error)) return;
      const msg = error instanceof Error ? error.message : "Failed to load visit statistics";
      toast.error(msg);
      setData([]);
      setSummary(emptySummary);
      setHasLoaded(false);
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery, emptySummary, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    if (canFetchReportPeriod(viewMode, reportRange)) void fetchReport();
  }, [ready, fetchReport, reportRange, viewMode]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    const qs = buildQuery({ export: "csv" });
    if (!qs) return;
    try {
      const blob = await apiFetch<Blob>(`/reports/visit-statistics/?${qs}`, {
        responseType: "blob",
      });
      const label = reportRange ? `${reportRange.start}_${reportRange.end}` : "export";
      downloadBlob(blob, `visit_statistics_${label}.csv`);
      toast.success("CSV exported");
    } catch {
      toast.error("CSV export failed");
    }
  };

  const handleDownloadPdf = async () => {
    const qs = buildQuery({ export: "pdf" });
    if (!qs) return;
    try {
      const blob = await apiFetch<Blob>(`/reports/visit-statistics/?${qs}`, {
        responseType: "blob",
      });
      const label = reportRange ? `${reportRange.start}_${reportRange.end}` : "export";
      downloadBlob(blob, `visit_statistics_${label}.pdf`);
      toast.success("PDF downloaded");
    } catch {
      toast.error("PDF download failed");
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  const summaryCards = [
    { key: "completed", label: "Completed", icon: CheckCircle, color: "text-emerald-500", border: "border-l-emerald-500", value: summary.completed },
    { key: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-500", border: "border-l-red-500", value: summary.cancelled },
    { key: "in_progress", label: "In Progress", icon: Clock, color: "text-amber-500", border: "border-l-amber-500", value: summary.in_progress },
    { key: "scheduled", label: "Scheduled", icon: Calendar, color: "text-blue-500", border: "border-l-blue-500", value: summary.scheduled },
  ];

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        backLink={{ href: "/medical-records/reports", label: "Back to reports" }}
        reportTitle="Visit Statistics"
        reportDescription="Visit records by status and time period"
        ReportIcon={Activity}
        reportIconClassName="text-purple-500"
        loading={isLoading}
        onGenerate={fetchReport}
        exportCsvDisabled={!hasLoaded}
        onExportCsv={handleExportCsv}
        printDisabled={!hasLoaded}
        onPrint={handleDownloadPdf}
        contentClassName="print:px-0"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        year={year}
        onYearChange={setYear}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        onThisMonth={() => setViewMode("monthly")}
        onThisYear={() => setViewMode("annually")}
        highlightThisMonth={viewMode === "monthly"}
        highlightThisYear={viewMode === "annually"}
        hideQuickButtons
        yearOptions={years}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <Card key={card.key} className={`border-l-4 ${card.border}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="text-2xl sm:text-3xl font-bold">{card.value.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summary.total > 0 ? `${((card.value / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                    </p>
                  </div>
                  <card.icon className={`h-10 w-10 ${card.color} opacity-50`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Status Table */}
        <Card>
          <CardHeader>
            <CardTitle>Status breakdown</CardTitle>
            <CardDescription>
              {viewMode === 'daily' ? 'Daily' : viewMode === 'weekly' ? 'Weekly' : 'Monthly'} visits by completion status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading visit statistics...</p>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No visit data found for the selected period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Period</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Completed</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Cancelled</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">In Progress</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Scheduled</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => (
                      <tr key={row.period} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{row.period_label}</td>
                        <td className={`p-3 text-right ${statusStyles.completed.color}`}>{row.completed.toLocaleString()}</td>
                        <td className={`p-3 text-right ${statusStyles.cancelled.color}`}>{row.cancelled.toLocaleString()}</td>
                        <td className={`p-3 text-right ${statusStyles.in_progress.color}`}>{row.in_progress.toLocaleString()}</td>
                        <td className={`p-3 text-right ${statusStyles.scheduled.color}`}>{row.scheduled.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                      <td className="p-3 text-foreground">TOTAL</td>
                      <td className={`p-3 text-right ${statusStyles.completed.color}`}>{summary.completed.toLocaleString()}</td>
                      <td className={`p-3 text-right ${statusStyles.cancelled.color}`}>{summary.cancelled.toLocaleString()}</td>
                      <td className={`p-3 text-right ${statusStyles.in_progress.color}`}>{summary.in_progress.toLocaleString()}</td>
                      <td className={`p-3 text-right ${statusStyles.scheduled.color}`}>{summary.scheduled.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Demographic Breakdown Table */}
        <Card>
          <CardHeader>
            <CardTitle>Patient category breakdown</CardTitle>
            <CardDescription>
              {viewMode === 'daily' ? 'Daily' : viewMode === 'weekly' ? 'Weekly' : 'Monthly'} visits by gender and NPA category
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading demographic breakdown...</p>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No demographic data found for the selected period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Period</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Male</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Female</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Officer</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Staff</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Employee</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Emp Dep</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Ret Dep</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Non-NPA</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Retiree</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Non-Employee</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.period} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{row.period_label}</td>
                        <td className="p-3 text-right text-blue-600 dark:text-blue-400">{row.male.toLocaleString()}</td>
                        <td className="p-3 text-right text-pink-600 dark:text-pink-400">{row.female.toLocaleString()}</td>
                        <td className="p-3 text-right text-violet-600 dark:text-violet-400">{row.officer.toLocaleString()}</td>
                        <td className="p-3 text-right text-indigo-600 dark:text-indigo-400">{row.staff.toLocaleString()}</td>
                        <td className="p-3 text-right text-purple-600 dark:text-purple-400">{row.employee.toLocaleString()}</td>
                        <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{row.emp_dependent.toLocaleString()}</td>
                        <td className="p-3 text-right text-teal-600 dark:text-teal-400">{row.ret_dependent.toLocaleString()}</td>
                        <td className="p-3 text-right text-orange-600 dark:text-orange-400">{row.nonnpa.toLocaleString()}</td>
                        <td className="p-3 text-right text-rose-600 dark:text-rose-400">{row.retiree.toLocaleString()}</td>
                        <td className="p-3 text-right text-stone-600 dark:text-stone-400">{row.non_employee.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                      <td className="p-3 text-foreground">TOTAL</td>
                      <td className="p-3 text-right text-blue-600 dark:text-blue-400">{summary.male.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{summary.female.toLocaleString()}</td>
                      <td className="p-3 text-right text-violet-600 dark:text-violet-400">{summary.officer.toLocaleString()}</td>
                      <td className="p-3 text-right text-indigo-600 dark:text-indigo-400">{summary.staff.toLocaleString()}</td>
                      <td className="p-3 text-right text-purple-600 dark:text-purple-400">{summary.employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{summary.emp_dependent.toLocaleString()}</td>
                      <td className="p-3 text-right text-teal-600 dark:text-teal-400">{summary.ret_dependent.toLocaleString()}</td>
                      <td className="p-3 text-right text-orange-600 dark:text-orange-400">{summary.nonnpa.toLocaleString()}</td>
                      <td className="p-3 text-right text-rose-600 dark:text-rose-400">{summary.retiree.toLocaleString()}</td>
                      <td className="p-3 text-right text-stone-600 dark:text-stone-400">{summary.non_employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </AnalyticsReportLayout>
    </DashboardLayout>
  );
}
