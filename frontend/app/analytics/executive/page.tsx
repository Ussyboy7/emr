"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AnalyticsReportLayout,
  type AnalyticsViewMode,
} from "@/components/analytics/AnalyticsReportLayout";
import { useReportDateRange } from "@/hooks/use-report-date-range";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAnalyticsExportHandlers } from "@/lib/analytics-export";
import { type ClinicalDashboardData } from "@/lib/services";
import { toast } from "sonner";
import { endOfMonth, startOfMonth } from "date-fns";
import { toApiDateString } from "@/lib/dates";
import { buildReportPeriodQuery, canFetchReportPeriod } from "@/lib/report-period-query";
import { apiFetch } from "@/lib/api-client";
import { Activity, Users, FlaskConical, Pill, Stethoscope, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function ExecutiveAnalyticsPage() {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("year");
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ClinicalDashboardData | null>(null);

  const reportRange = useReportDateRange(viewMode, year, startDate, endDate);

  const { handleExportCsv, handleDownloadPdf } = useAnalyticsExportHandlers({
    apiPath: "/analytics/dashboard/",
    filenameBase: "executive_analytics",
    viewMode,
    year,
    startDate,
    endDate,
    queryStyle: "start_date",
  });

  const fetchReport = useCallback(async () => {
    const params = buildReportPeriodQuery(viewMode, reportRange, "start_date");
    if (!params) {
      if (viewMode === "range") toast.error("Please select start and end dates");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<ClinicalDashboardData>(`/analytics/dashboard/?${params.toString()}`);
      setData(res);
    } catch (e: unknown) {
      console.error(e);
      toast.error("Failed to load executive analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportRange, viewMode]);

  useEffect(() => {
    if (canFetchReportPeriod(viewMode, reportRange)) void fetchReport();
  }, [fetchReport, reportRange, viewMode]);

  const setThisMonth = () => {
    const n = new Date();
    setStartDate(toApiDateString(startOfMonth(n)));
    setEndDate(toApiDateString(endOfMonth(n)));
    setViewMode("range");
  };

  const setThisYear = () => {
    setYear(new Date().getFullYear().toString());
    setViewMode("year");
  };

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Patients seen", value: data.overview.patients, icon: Users },
      { label: "Total visits", value: data.metrics.total_visits, icon: Activity },
      { label: "Consultations completed", value: data.overview.clinical, icon: Stethoscope },
      { label: "Lab orders", value: data.overview.laboratory, icon: FlaskConical },
      { label: "Prescriptions dispensed", value: data.overview.pharmacy, icon: Pill },
      { label: "Visit completion rate", value: `${data.metrics.completion_rate_percentage}%`, icon: TrendingUp },
    ];
  }, [data]);

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Executive analytics"
        reportDescription="High-level clinical activity summary for leadership review."
        ReportIcon={TrendingUp}
        reportIconClassName="text-blue-600"
        loading={loading}
        onGenerate={fetchReport}
        exportCsvDisabled={!data}
        onExportCsv={handleExportCsv}
        printDisabled={!data}
        onPrint={handleDownloadPdf}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        year={year}
        onYearChange={setYear}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        onThisMonth={setThisMonth}
        onThisYear={setThisYear}
        highlightThisMonth={viewMode === "range"}
        highlightThisYear={viewMode === "year"}
        contentClassName="max-w-6xl mx-auto"
      >
        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kpis.map((kpi) => (
                <Card key={kpi.label} className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{kpi.label}</p>
                      <p className="text-2xl font-bold">{typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}</p>
                    </div>
                    <kpi.icon className="h-8 w-8 text-blue-500 opacity-40" />
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Top diagnoses</CardTitle>
                <CardDescription>Most frequent ICD-10 codes in period</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Diagnosis</TableHead>
                      <TableHead className="text-right">Cases</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.top_diagnoses.slice(0, 10).map((row) => (
                      <TableRow key={row.diagnosis}>
                        <TableCell>{row.diagnosis}</TableCell>
                        <TableCell className="text-right">{row.cases}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-sm text-muted-foreground mt-4">
                  <Link href="/medical-records/reports/top-diagnoses" className="text-primary hover:underline">
                    View full Top Diagnoses report
                  </Link>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly visit trend</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                      <TableHead className="text-right">Patients</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.visits_trend.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell>{row.month}</TableCell>
                        <TableCell className="text-right">{row.visits}</TableCell>
                        <TableCell className="text-right">{row.newPatients ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </AnalyticsReportLayout>
    </DashboardLayout>
  );
}
