"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AnalyticsReportLayout,
  type AnalyticsViewMode,
} from "@/components/analytics/AnalyticsReportLayout";
import { useReportDateRange } from "@/hooks/use-report-date-range";
import { buildReportPeriodQuery, canFetchReportPeriod } from "@/lib/report-period-query";
import { formatDisplayDateRange } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RefreshCw, BarChart3, Download } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import {
  AttendanceMatrixTable,
  type AttendanceClinicBlock,
  type AttendanceMatrixFooter,
} from "@/components/medical-records/AttendanceMatrixTable";

type Metric = "attendance_count" | "distinct_patients";

interface AttendanceStatisticsReport {
  period_start: string;
  period_end: string;
  metric: Metric;
  metric_label: string;
  clinics: AttendanceClinicBlock[];
  footer: AttendanceMatrixFooter;
  summary?: {
    new_registrations: number;
    returning_patients: number;
    total_visits: number;
    total_unique_patients_seen: number;
  };
}

export default function AttendanceStatisticsPage() {
  const [report, setReport] = useState<AttendanceStatisticsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("attendance_count");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("monthly");

  const reportRange = useReportDateRange(viewMode, year, startDate, endDate);

  const buildQuery = useCallback(
    (extra?: Record<string, string>) => {
      const params = buildReportPeriodQuery(viewMode, reportRange, "start_date");
      if (!params) return null;
      params.set("metric", metric);
      if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
      return params.toString();
    },
    [reportRange, metric, viewMode]
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
      const data = await apiFetch<AttendanceStatisticsReport>(
        `/reports/attendance-statistics/?${qs}`
      );
      setReport(data);
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "Failed to load report";
      toast.error(msg);
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    if (canFetchReportPeriod(viewMode, reportRange)) void fetchReport();
  }, [fetchReport, reportRange, metric, viewMode]);

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
      const blob = await apiFetch<Blob>(`/reports/attendance-statistics/?${qs}`, {
        responseType: "blob",
      });
      const range = reportRange;
      const label = range ? `${range.start}_${range.end}` : "export";
      downloadBlob(blob, `attendance_statistics_${label}.csv`);
      toast.success("CSV exported");
    } catch {
      toast.error("CSV export failed");
    }
  };

  const handleDownloadPdf = async () => {
    const qs = buildQuery({ export: "pdf" });
    if (!qs) return;
    try {
      const blob = await apiFetch<Blob>(`/reports/attendance-statistics/?${qs}`, {
        responseType: "blob",
      });
      const range = reportRange;
      const label = range ? `${range.start}_${range.end}` : "export";
      downloadBlob(blob, `attendance_statistics_${label}.pdf`);
      toast.success("PDF downloaded");
    } catch {
      toast.error("PDF download failed");
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
  const hasData = report !== null;

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        backLink={{ href: "/medical-records/reports", label: "Back to reports" }}
        reportTitle="Attendance Statistics"
        reportDescription="Monthly attendance matrix by clinic and patient category"
        ReportIcon={BarChart3}
        reportIconClassName="text-blue-500"
        loading={isLoading}
        onGenerate={fetchReport}
        exportCsvDisabled={!hasData}
        onExportCsv={handleExportCsv}
        printDisabled={!hasData}
        onPrint={handleDownloadPdf}
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
        contentClassName="print:px-0"
      >
        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="max-w-xs">
              <Label>Metric</Label>
              <Select value={metric} onValueChange={(v: Metric) => setMetric(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance_count">Attendance count</SelectItem>
                  <SelectItem value="distinct_patients">Distinct patients</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Attendance count includes each clinic line on a visit. Distinct patients counts
                each person once per clinic in the period.
              </p>
            </div>
          </CardContent>
        </Card>

        {report?.summary ? (
          <div className="grid gap-4 md:grid-cols-3 print:hidden">
            <Card className="border-l-4 border-l-cyan-500">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Distinct patients (period)</p>
                <p className="text-2xl font-bold">
                  {report.summary.total_unique_patients_seen?.toLocaleString() ?? "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Visit records</p>
                <p className="text-2xl font-bold">
                  {report.summary.total_visits?.toLocaleString() ?? "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-violet-500">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">New registrations</p>
                <p className="text-2xl font-bold">
                  {report.summary.new_registrations?.toLocaleString() ?? "—"}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <Card id="attendance-statistics-print">
          <CardHeader className="hidden print:block">
            <CardTitle className="text-center text-lg">
              Attendance Statistics — {formatDisplayDateRange(report?.period_start, report?.period_end)}
            </CardTitle>
            <CardDescription className="text-center">
              {report?.metric_label}
            </CardDescription>
          </CardHeader>
          <CardHeader className="print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle>Attendance matrix</CardTitle>
                <CardDescription>
                  {report
                    ? `${formatDisplayDateRange(report.period_start, report.period_end)} · ${report.metric_label}`
                    : "Select a period and generate"}
                </CardDescription>
              </div>
              <button
                type="button"
                className="inline-flex items-center text-sm text-primary hover:underline print:hidden"
                onClick={handleDownloadPdf}
                disabled={!hasData}
              >
                <Download className="h-4 w-4 mr-1" />
                Official PDF
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading attendance statistics…</p>
              </div>
            ) : !hasData ? (
              <p className="text-center py-12 text-muted-foreground">
                No attendance data for the selected period.
              </p>
            ) : report ? (
              <>
                <AttendanceMatrixTable clinics={report.clinics} footer={report.footer} />
                <p className="text-xs text-muted-foreground mt-4 print:text-[10px]">
                  Patients attending multiple clinics appear in more than one clinic row. Weekend
                  Call captures Saturday and Sunday attendances. Cancelled visits with recorded
                  vitals are included.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </AnalyticsReportLayout>
    </DashboardLayout>
  );
}
