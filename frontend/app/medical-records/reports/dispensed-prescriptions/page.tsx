"use client";

import React, { useMemo, useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { RefreshCw, ArrowLeft, Pill, TrendingUp, Calendar, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface PeriodRow {
  sn: number;
  period_label: string;
  total: number;
  percentage: number;
}

interface DispensedSummary {
  total: number;
  total_patients: number;
  total_male: number;
  total_female: number;
  grand_total: number;
}

const emptySummary: DispensedSummary = {
  total: 0,
  total_patients: 0,
  total_male: 0,
  total_female: 0,
  grand_total: 0,
};

function normalizePeriodRows(rows: unknown[] | null | undefined): PeriodRow[] {
  if (!rows?.length) return [];
  return rows
    .map((raw, index) => {
      const row = raw as Record<string, unknown>;
      const total = Number(row.total ?? row.count ?? 0);
      const periodLabel = String(
        row.period_label ?? row.month ?? row.period ?? ""
      ).trim();
      return {
        sn: Number(row.sn ?? index + 1),
        period_label: periodLabel,
        total: Number.isFinite(total) ? total : 0,
        percentage: Number(row.percentage ?? 0),
      };
    })
    .filter((row) => row.period_label.length > 0 || row.total > 0);
}

function normalizeSummary(raw?: Partial<DispensedSummary> | null): DispensedSummary {
  const total = raw?.total ?? 0;
  const total_patients = raw?.total_patients ?? raw?.grand_total ?? 0;
  return {
    total,
    total_patients,
    total_male: raw?.total_male ?? 0,
    total_female: raw?.total_female ?? 0,
    grand_total: raw?.grand_total ?? total_patients,
  };
}

function groupByForViewMode(viewMode: string): "day" | "week" | "month" {
  if (viewMode === "daily") return "day";
  if (viewMode === "weekly") return "week";
  return "month";
}

export default function PrescriptionsReport() {
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
  } = useMrReportPeriod("all");

  const groupBy = useMemo(() => groupByForViewMode(viewMode), [viewMode]);
  const breakdownTitle =
    groupBy === "day" ? "Daily breakdown" : groupBy === "week" ? "Weekly breakdown" : "Monthly breakdown";

  const [data, setData] = useState<PeriodRow[]>([]);
  const [groupByLabel, setGroupByLabel] = useState("Monthly");
  const [summary, setSummary] = useState<DispensedSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    const params = buildQuery({ group_by: groupBy });
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<{
        data?: PeriodRow[];
        monthly_data?: PeriodRow[];
        group_by_label?: string;
        summary: DispensedSummary;
      }>(`/reports/dispensed-prescriptions/?${params.toString()}`);

      const rows = response.data ?? response.monthly_data ?? [];
      setData(normalizePeriodRows(rows));
      setGroupByLabel(response.group_by_label ?? breakdownTitle.replace(" breakdown", ""));
      setSummary(normalizeSummary(response.summary));
    } catch (error: unknown) {
      console.error("Error fetching prescriptions report:", error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load prescriptions report");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (canFetch) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, year, startDate, endDate, viewMode, canFetch]);

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
              <Pill className="h-8 w-8 text-purple-500" />
              Prescriptions Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Fully dispensed prescription orders — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/dispensed-prescriptions/"
              buildQuery={() => buildQuery({ group_by: groupBy })}
              filenameBase={`prescriptions_${filenameSuffix}`}
              disabled={data.length === 0}
            />
          </div>
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>
              Daily and weekly views group the breakdown by day or week; other modes use monthly buckets.
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
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Prescriptions</p>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600">
                    {(summary.total ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(summary.total_patients ?? summary.grand_total ?? 0).toLocaleString()} patients
                  </p>
                </div>
                <Pill className="h-10 w-10 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-cyan-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Male patients</p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {(summary.total_male ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(summary.grand_total ?? 0) > 0
                      ? `${(((summary.total_male ?? 0) / (summary.grand_total ?? 1)) * 100).toFixed(1)}%`
                      : "0%"}{" "}
                    of patients
                  </p>
                </div>
                <Users className="h-10 w-10 text-cyan-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-pink-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Female patients</p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {(summary.total_female ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(summary.grand_total ?? 0) > 0
                      ? `${(((summary.total_female ?? 0) / (summary.grand_total ?? 1)) * 100).toFixed(1)}%`
                      : "0%"}{" "}
                    of patients
                  </p>
                </div>
                <Users className="h-10 w-10 text-pink-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5" />
              {breakdownTitle}
            </CardTitle>
            <CardDescription>
              {groupByLabel} prescription orders in {periodLabel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Period</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Prescriptions</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.period_label}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">Total</td>
                      <td className="p-3 text-right text-foreground">{(summary.total ?? 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Pill className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">
                  No fully dispensed prescription orders in {periodLabel}. Try All Time — your
                  orders may fall in an earlier month.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
