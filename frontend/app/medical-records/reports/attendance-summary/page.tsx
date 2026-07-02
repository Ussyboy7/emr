"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { RefreshCw, ArrowLeft, BarChart3, TrendingUp, Calendar, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface CategoryRow {
  sn: number;
  category: string;
  male: number;
  female: number;
  total: number;
  percentage: number;
  previous_total?: number;
  change_percent?: number | null;
}

interface Summary {
  grand_total: number;
  previous_grand_total?: number;
  grand_total_change_percent?: number | null;
  total_employee: number;
  total_non_employee: number;
  total_male: number;
  total_female: number;
}

export default function AttendanceSummaryReport() {
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
    periodLabel,
    canFetch,
    buildQuery,
    filenameSuffix,
    years,
  } = useMrReportPeriod("monthly");

  const [data, setData] = useState<CategoryRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [previousPeriod, setPreviousPeriod] = useState<{ period_start: string; period_end: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReport = async () => {
    const params = buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<{
        data: CategoryRow[];
        summary: Summary;
        previous_period?: { period_start: string; period_end: string };
      }>(`/reports/attendance-summary/?${params.toString()}`);
      setData(response.data ?? []);
      setSummary(response.summary ?? null);
      setPreviousPeriod(response.previous_period ?? null);
    } catch (error: unknown) {
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load attendance summary");
      setData([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  };

  useMrReportAutoFetch(ready, canFetch, fetchReport, [year, startDate, endDate, viewMode]);

  const hasData = (summary?.grand_total ?? 0) > 0;

  const formatChange = (value?: number | null) => {
    if (value === null || value === undefined) return "—";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value}%`;
  };

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
              <BarChart3 className="h-8 w-8 text-blue-500" />
              Attendance Summary
            </h1>
            <p className="text-muted-foreground mt-1">
              Current vs previous period — {periodLabel}
            </p>
          </div>
          <ReportExportButtons
            apiPath="/reports/attendance-summary/"
            buildQuery={() => buildQuery()}
            filenameBase={`attendance_summary_${filenameSuffix}`}
            disabled={!hasData}
          />
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>
              Previous period is the same length immediately before the selected range.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <div className="flex items-end">
                <Button onClick={fetchReport} className="w-full" disabled={isLoading}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {isLoading ? "Loading..." : "Generate Report"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Current period total</p>
              <p className="text-2xl font-bold">{(summary?.grand_total ?? 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-slate-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Previous period total</p>
              <p className="text-2xl font-bold">{(summary?.previous_grand_total ?? 0).toLocaleString()}</p>
              {previousPeriod && (
                <p className="text-xs text-muted-foreground mt-1">
                  {previousPeriod.period_start} — {previousPeriod.period_end}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Change</p>
              <p className="text-2xl font-bold">{formatChange(summary?.grand_total_change_percent)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Summary by category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
              </div>
            ) : hasData ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3">S/N</th>
                      <th className="text-left p-3">Category</th>
                      <th className="text-right p-3">Male</th>
                      <th className="text-right p-3">Female</th>
                      <th className="text-right p-3">Current</th>
                      <th className="text-right p-3">Previous</th>
                      <th className="text-right p-3">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border">
                        <td className="p-3">{row.sn}</td>
                        <td className="p-3 font-medium">{row.category}</td>
                        <td className="p-3 text-right">{row.male}</td>
                        <td className="p-3 text-right">{row.female}</td>
                        <td className="p-3 text-right font-semibold">{row.total}</td>
                        <td className="p-3 text-right">{row.previous_total ?? 0}</td>
                        <td className="p-3 text-right">{formatChange(row.change_percent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-12 text-muted-foreground">No attendance data for this period.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
