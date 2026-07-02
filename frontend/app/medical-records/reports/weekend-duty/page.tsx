"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { RefreshCw, ArrowLeft, Calendar, Users, TrendingUp, Activity } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface WeekendSummary {
  total_weekend_visits: number;
  distinct_patients: number;
  total_employee_patients: number;
  total_non_employee_patients: number;
  total: number;
}

interface CategoryRow {
  sn: number;
  category: string;
  male: number;
  female: number;
  patients: number;
  visit_records: number;
  percentage: number;
}

interface MonthlyData {
  sn: number;
  month: string;
  count: number;
  visit_records?: number;
  patients?: number;
}

const emptySummary: WeekendSummary = {
  total_weekend_visits: 0,
  distinct_patients: 0,
  total_employee_patients: 0,
  total_non_employee_patients: 0,
  total: 0,
};

function normalizeSummary(raw?: Partial<WeekendSummary> | null): WeekendSummary {
  const visits = raw?.total_weekend_visits ?? raw?.total ?? 0;
  return {
    total_weekend_visits: visits,
    distinct_patients: raw?.distinct_patients ?? 0,
    total_employee_patients: raw?.total_employee_patients ?? 0,
    total_non_employee_patients: raw?.total_non_employee_patients ?? 0,
    total: raw?.total ?? visits,
  };
}

export default function WeekendDutyReport() {
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

  const [summary, setSummary] = useState<WeekendSummary>(emptySummary);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isAllTime = viewMode === "all";
  const showCategoryCards = !isAllTime;

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const params = buildQuery();
      if (!params) {
        toast.error("Please select a valid date range");
        setIsLoading(false);
        return;
      }

      const response = await apiFetch<{
        summary: WeekendSummary;
        category_breakdown?: CategoryRow[];
        monthly_data: MonthlyData[];
      }>(`/reports/weekend-duty/?${params.toString()}`);

      setSummary(normalizeSummary(response.summary));
      setCategoryRows(response.category_breakdown ?? []);
      setMonthlyData(response.monthly_data ?? []);
    } catch (error: unknown) {
      console.error("Error fetching weekend duty report:", error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load weekend duty report");
      setSummary(emptySummary);
      setCategoryRows([]);
      setMonthlyData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useMrReportAutoFetch(ready, canFetch, fetchReport, [year, startDate, endDate, viewMode]);

  const hasData = (summary.total_weekend_visits ?? 0) > 0;
  const categoryPatientTotal = categoryRows.reduce((sum, row) => sum + row.patients, 0);

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
              <Calendar className="h-8 w-8 text-purple-500" />
              Weekend Call Duty Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Weekend attendable visits (Saturday–Sunday) — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/weekend-duty/"
              buildQuery={() => buildQuery()}
              filenameBase={`weekend_duty_${filenameSuffix}`}
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
              Attendable visit records on Saturdays and Sundays for the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent>
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

        <div className={`grid gap-4 ${showCategoryCards ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Weekend visit records
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
                {(summary.total_weekend_visits ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Attendable visits on Sat–Sun</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Distinct patients
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">
                {(summary.distinct_patients ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Unique patients with weekend visits</p>
            </CardContent>
          </Card>
          {showCategoryCards && (
            <>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Employee patients</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {(summary.total_employee_patients ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Officers and staff (distinct)</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Non-employee patients</p>
                  <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">
                    {(summary.total_non_employee_patients ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Dependents, retirees, non-NPA, etc.</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Patients by category
            </CardTitle>
            <CardDescription>
              Distinct weekend patients by NPA category — {periodLabel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : hasData && categoryRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Male</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Female</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Patients</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Visits</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.category}</td>
                        <td className="p-3 text-right text-foreground">{row.male.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.female.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">
                          {row.patients.toLocaleString()}
                        </td>
                        <td className="p-3 text-right text-foreground">{row.visit_records.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">
                        Total
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {categoryRows.reduce((s, r) => s + r.male, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {categoryRows.reduce((s, r) => s + r.female, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {categoryPatientTotal.toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.total_weekend_visits ?? 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No weekend visits for {periodLabel}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Monthly weekend attendance — {periodLabel}
            </CardTitle>
            <CardDescription>Visit records and distinct patients by calendar month</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading…</div>
            ) : monthlyData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Month</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Visit records</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Patients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.month}</td>
                        <td className="p-3 text-right font-semibold text-foreground">
                          {(row.visit_records ?? row.count).toLocaleString()}
                        </td>
                        <td className="p-3 text-right text-foreground">
                          {(row.patients ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">
                        Total
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.total_weekend_visits ?? 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.distinct_patients ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No weekend visits found for {periodLabel}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
