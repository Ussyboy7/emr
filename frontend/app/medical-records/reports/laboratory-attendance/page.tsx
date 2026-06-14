"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { RefreshCw, ArrowLeft, TestTube, TrendingUp, Calendar, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";

interface LabCategoryData {
  sn: number;
  category: string;
  male: number;
  female: number;
  total: number;
  percentage: number;
}

interface LabSummary {
  grand_total: number;
  first_time_patients: number;
  returning_patients: number;
  total_unique_patients_seen: number;
  total_lab_orders: number;
}

const emptySummary: LabSummary = {
  grand_total: 0,
  first_time_patients: 0,
  returning_patients: 0,
  total_unique_patients_seen: 0,
  total_lab_orders: 0,
};

function normalizeSummary(raw?: Partial<LabSummary> & { total_visits?: number } | null): LabSummary {
  return {
    grand_total: raw?.grand_total ?? 0,
    first_time_patients: raw?.first_time_patients ?? 0,
    returning_patients: raw?.returning_patients ?? 0,
    total_unique_patients_seen:
      raw?.total_unique_patients_seen ?? raw?.grand_total ?? 0,
    total_lab_orders: raw?.total_lab_orders ?? raw?.total_visits ?? 0,
  };
}

export default function LaboratoryAttendanceReport() {
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

  const [data, setData] = useState<LabCategoryData[]>([]);
  const [summary, setSummary] = useState<LabSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);

  const isAllTime = viewMode === "all";
  const showLifecycleCards = !isAllTime;

  const fetchReport = async () => {
    const params = buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<{ data: LabCategoryData[]; summary: LabSummary }>(
        `/reports/laboratory-attendance/?${params.toString()}`
      );
      setData(response.data ?? []);
      setSummary(normalizeSummary(response.summary));
    } catch (error: unknown) {
      console.error("Error fetching lab report:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load laboratory report");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode]);

  const hasData = (summary.grand_total ?? 0) > 0;
  const uniquePatients = summary.total_unique_patients_seen ?? summary.grand_total ?? 0;

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
              <TestTube className="h-8 w-8 text-pink-500" />
              Laboratory Attendance Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Unique patients with lab orders — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/laboratory-attendance/"
              buildQuery={() => buildQuery()}
              filenameBase={`laboratory_attendance_${filenameSuffix}`}
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
            <CardDescription>
              Counts distinct patients who had at least one lab order in the selected period.
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

        <div className={`grid gap-4 ${showLifecycleCards ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
          <Card className="border-l-4 border-l-indigo-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Unique patients
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                {uniquePatients.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Distinct patients with at least one lab order
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <TestTube className="h-4 w-4" />
                Lab orders
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {(summary.total_lab_orders ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Order count (repeat orders included)</p>
            </CardContent>
          </Card>
          {showLifecycleCards && (
            <>
              <Card className="border-l-4 border-l-violet-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">First-time at lab</p>
                  <p className="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">
                    {(summary.first_time_patients ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">First lab order falls in this period</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-slate-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Returning patients</p>
                  <p className="text-2xl sm:text-3xl font-bold text-slate-700 dark:text-slate-300">
                    {(summary.returning_patients ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Prior lab history before this period</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Attendance by category
            </CardTitle>
            <CardDescription>Distinct patients with lab orders in {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : hasData ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Category</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Male</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Female</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.category}</td>
                        <td className="p-3 text-right text-foreground">{row.male.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.female.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">Total</td>
                      <td className="p-3 text-right text-foreground">
                        {data.reduce((sum, row) => sum + row.male, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {data.reduce((sum, row) => sum + row.female, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.grand_total ?? 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <TestTube className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">
                  No lab orders found for {periodLabel}. Try a wider period or All Time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
