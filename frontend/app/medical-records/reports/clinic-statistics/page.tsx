"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AnalyticsReportLayout,
  type AnalyticsViewMode,
} from "@/components/analytics/AnalyticsReportLayout";
import { useReportDateRange } from "@/hooks/use-report-date-range";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";
import { buildReportPeriodQuery, canFetchReportPeriod } from "@/lib/report-period-query";
import { formatDisplayDateRange } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RefreshCw, Stethoscope, Download } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useOutpatientClinicTypes } from "@/hooks/use-outpatient-clinic-types";
import {
  AttendanceMatrixTable,
  type AttendanceClinicBlock,
  type AttendanceMatrixFooter,
} from "@/components/medical-records/AttendanceMatrixTable";

type Metric = "attendance_count" | "distinct_patients";

interface ClinicStatisticsReport {
  period_start: string;
  period_end: string;
  metric_label: string;
  clinics: AttendanceClinicBlock[];
  footer: AttendanceMatrixFooter;
  summary?: {
    total_unique_patients_seen: number;
    total_visits: number;
  };
}

function ClinicStatisticsContent() {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const searchParams = useSearchParams();
  const { names: clinicNames, loading: clinicsLoading } = useOutpatientClinicTypes();
  const [selectedClinic, setSelectedClinic] = useState("");
  const [report, setReport] = useState<ClinicStatisticsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("attendance_count");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("monthly");

  const reportRange = useReportDateRange(viewMode, year, startDate, endDate);

  useEffect(() => {
    if (clinicNames.length === 0) return;
    const fromUrl = searchParams.get("clinic");
    setSelectedClinic((prev) => {
      if (fromUrl && clinicNames.includes(fromUrl)) return fromUrl;
      if (prev && clinicNames.includes(prev)) return prev;
      return clinicNames[0];
    });
  }, [clinicNames, searchParams]);

  const buildQuery = useCallback(
    (extra?: Record<string, string>) => {
      if (!selectedClinic) return null;
      const params = buildReportPeriodQuery(viewMode, reportRange, "start_date");
      if (!params) return null;
      params.set("metric", metric);
      params.set("clinic_type", selectedClinic);
      if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
      return params.toString();
    },
    [reportRange, metric, selectedClinic, viewMode]
  );

  const fetchReport = useCallback(async () => {
    const qs = buildQuery();
    if (!qs) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await apiFetch<ClinicStatisticsReport>(
        `/reports/attendance-statistics/?${qs}`
      );
      setReport(data);
    } catch (error: unknown) {
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load clinic statistics");
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery, handleAuthError]);

  useEffect(() => {
    if (!ready || !selectedClinic) return;
    if (canFetchReportPeriod(viewMode, reportRange)) void fetchReport();
  }, [ready, fetchReport, selectedClinic, reportRange, metric, viewMode]);

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
      downloadBlob(blob, `clinic_statistics_${selectedClinic}.csv`);
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
      downloadBlob(blob, `clinic_statistics_${selectedClinic}.pdf`);
      toast.success("PDF downloaded");
    } catch {
      toast.error("PDF download failed");
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
  const hasData = report !== null;

  return (
    <AnalyticsReportLayout
      backLink={{ href: "/medical-records/reports", label: "Back to reports" }}
      reportTitle="Clinic Statistics"
      reportDescription="Attendance by patient category for a single clinic"
      ReportIcon={Stethoscope}
      reportIconClassName="text-emerald-500"
      loading={isLoading || clinicsLoading}
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
    >
      <Card className="print:hidden">
        <CardContent className="p-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label>Clinic</Label>
            <Select value={selectedClinic} onValueChange={setSelectedClinic}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select clinic" />
              </SelectTrigger>
              <SelectContent>
                {clinicNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
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
          </div>
        </CardContent>
      </Card>

      {report?.summary ? (
        <div className="grid gap-4 md:grid-cols-2 print:hidden">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Distinct patients</p>
              <p className="text-2xl font-bold">
                {report.summary.total_unique_patients_seen?.toLocaleString() ?? "—"}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Visit records</p>
              <p className="text-2xl font-bold">
                {report.summary.total_visits?.toLocaleString() ?? "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader className="print:hidden">
          <div className="flex justify-between items-start gap-2">
            <div>
              <CardTitle>{selectedClinic || "Clinic"} statistics</CardTitle>
              <CardDescription>
                {report
                    ? `${formatDisplayDateRange(report.period_start, report.period_end)} · ${report.metric_label}`
                  : "Select clinic and period"}
              </CardDescription>
            </div>
            <button
              type="button"
              className="inline-flex items-center text-sm text-primary hover:underline"
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
              <p className="text-muted-foreground">Loading…</p>
            </div>
          ) : !hasData ? (
            <p className="text-center py-12 text-muted-foreground">No data for this period.</p>
          ) : report ? (
            <AttendanceMatrixTable
              clinics={report.clinics}
              footer={report.footer}
              showFooter={false}
            />
          ) : null}
        </CardContent>
      </Card>
    </AnalyticsReportLayout>
  );
}

export default function ClinicStatisticsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
        <ClinicStatisticsContent />
      </Suspense>
    </DashboardLayout>
  );
}
