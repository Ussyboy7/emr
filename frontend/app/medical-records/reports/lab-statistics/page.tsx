"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import {
  RefreshCw,
  ArrowLeft,
  FlaskConical,
  Calendar,
  TrendingUp,
  CheckCircle2,
  Clock,
  TestTube,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

interface LabSummary {
  total_orders: number;
  total_tests: number;
  distinct_patients: number;
  tests_completed: number;
  tests_pending: number;
}

interface LabStatistics {
  summary: LabSummary;
  priority_breakdown: BreakdownRow[];
  status_breakdown: BreakdownRow[];
  total_orders?: number;
  tests_completed?: number;
  tests_pending?: number;
}

const emptySummary: LabSummary = {
  total_orders: 0,
  total_tests: 0,
  distinct_patients: 0,
  tests_completed: 0,
  tests_pending: 0,
};

function normalizeReport(raw: LabStatistics | null) {
  if (!raw) {
    return {
      summary: emptySummary,
      priority_breakdown: [] as BreakdownRow[],
      status_breakdown: [] as BreakdownRow[],
    };
  }
  const summary = raw.summary ?? {
    total_orders: raw.total_orders ?? 0,
    total_tests: 0,
    distinct_patients: 0,
    tests_completed: raw.tests_completed ?? 0,
    tests_pending: raw.tests_pending ?? 0,
  };
  return {
    summary: {
      total_orders: summary.total_orders ?? raw.total_orders ?? 0,
      total_tests: summary.total_tests ?? 0,
      distinct_patients: summary.distinct_patients ?? 0,
      tests_completed: summary.tests_completed ?? raw.tests_completed ?? 0,
      tests_pending: summary.tests_pending ?? raw.tests_pending ?? 0,
    },
    priority_breakdown: raw.priority_breakdown ?? [],
    status_breakdown: raw.status_breakdown ?? [],
  };
}

export default function LabStatisticsReport() {
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

  const [report, setReport] = useState<ReturnType<typeof normalizeReport> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    const params = buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<LabStatistics>(`/reports/lab-statistics/?${params.toString()}`);
      setReport(normalizeReport(response));
    } catch (error: unknown) {
      console.error("Error fetching lab statistics:", error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load lab statistics");
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (canFetch) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode]);

  const isAllTime = viewMode === "all";
  const summary = report?.summary ?? emptySummary;
  const hasData = (summary.total_orders ?? 0) > 0;

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
              <FlaskConical className="h-8 w-8 text-pink-500" />
              Lab Statistics
            </h1>
            <p className="text-muted-foreground mt-1">
              Lab order volume, priority, and status distribution — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/lab-statistics/"
              buildQuery={() => buildQuery()}
              filenameBase={`lab_statistics_${filenameSuffix}`}
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
              Orders placed in the period; test status counts are for tests on those orders.
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

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading report data...</p>
            </CardContent>
          </Card>
        ) : hasData && report ? (
          <>
            <div className={`grid gap-4 ${isAllTime ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
              <Card className="border-l-4 border-l-pink-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <FlaskConical className="h-4 w-4" />
                    Lab orders
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-pink-600 dark:text-pink-400">
                    {summary.total_orders.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Orders placed in period</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-violet-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Lab tests
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">
                    {summary.total_tests.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Individual tests on those orders</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Tests completed
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">
                    {summary.tests_completed.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Verified tests</p>
                </CardContent>
              </Card>
              {!isAllTime && (
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Tests pending
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">
                      {summary.tests_pending.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Not yet verified</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-pink-500" />
                    Lab orders
                  </CardTitle>
                  <CardDescription>Priority mix for orders placed — {periodLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Priority</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Orders</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.priority_breakdown.map((row) => (
                        <tr key={row.key} className="border-b border-border">
                          <td className="p-2">{row.label}</td>
                          <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                          <td className="p-2 text-right">{row.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/50 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{summary.total_orders.toLocaleString()}</td>
                        <td className="p-2 text-right">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TestTube className="h-4 w-4 text-violet-500" />
                    Lab tests
                  </CardTitle>
                  <CardDescription>Workflow status for tests on those orders — {periodLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Tests</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.status_breakdown.map((row) => (
                        <tr key={row.key} className="border-b border-border">
                          <td className="p-2">{row.label}</td>
                          <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                          <td className="p-2 text-right">{row.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/50 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{summary.total_tests.toLocaleString()}</td>
                        <td className="p-2 text-right">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FlaskConical className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
              <p className="text-sm text-muted-foreground">No lab orders found for {periodLabel}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
