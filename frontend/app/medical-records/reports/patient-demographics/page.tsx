"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import {
  RefreshCw,
  ArrowLeft,
  Users,
  Activity,
  TrendingUp,
  Droplets,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface BreakdownRow {
  label?: string;
  category?: string;
  key?: string;
  count: number;
  percentage?: number;
  sn?: number;
}

interface DemographicsSummary {
  total_patients: number;
  total_employees: number;
  total_non_employees: number;
  total_male: number;
  total_female: number;
  blood_group_recorded: number;
}

interface Demographics {
  cohort_mode?: "active_register" | "registered_in_period";
  summary: DemographicsSummary;
  category_breakdown: BreakdownRow[];
  gender_breakdown: BreakdownRow[];
  age_breakdown: BreakdownRow[];
  blood_group_breakdown: BreakdownRow[];
  total_patients?: number;
}

const emptySummary: DemographicsSummary = {
  total_patients: 0,
  total_employees: 0,
  total_non_employees: 0,
  total_male: 0,
  total_female: 0,
  blood_group_recorded: 0,
};

function normalizeReport(raw: Demographics | null): {
  summary: DemographicsSummary;
  category_breakdown: BreakdownRow[];
  gender_breakdown: BreakdownRow[];
  age_breakdown: BreakdownRow[];
  blood_group_breakdown: BreakdownRow[];
} {
  if (!raw) {
    return {
      summary: emptySummary,
      category_breakdown: [],
      gender_breakdown: [],
      age_breakdown: [],
      blood_group_breakdown: [],
    };
  }
  const total = raw.summary?.total_patients ?? raw.total_patients ?? 0;
  return {
    summary: {
      total_patients: total,
      total_employees: raw.summary?.total_employees ?? 0,
      total_non_employees: raw.summary?.total_non_employees ?? 0,
      total_male: raw.summary?.total_male ?? 0,
      total_female: raw.summary?.total_female ?? 0,
      blood_group_recorded: raw.summary?.blood_group_recorded ?? 0,
    },
    category_breakdown: raw.category_breakdown ?? [],
    gender_breakdown: raw.gender_breakdown ?? [],
    age_breakdown: raw.age_breakdown ?? [],
    blood_group_breakdown: raw.blood_group_breakdown ?? [],
  };
}

export default function PatientDemographicsReport() {
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
  const [cohortMode, setCohortMode] = useState<Demographics["cohort_mode"]>("active_register");
  const [isLoading, setIsLoading] = useState(false);

  const cohortDescription =
    cohortMode === "registered_in_period"
      ? `New registrations in ${periodLabel}`
      : `Full active register — ${periodLabel}`;

  const fetchReport = async () => {
    const params = buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<Demographics>(
        `/reports/patient-demographics/?${params.toString()}`
      );
      setReport(normalizeReport(response));
      setCohortMode(response.cohort_mode ?? "active_register");
    } catch (error: unknown) {
      console.error("Error fetching patient demographics:", error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load patient demographics");
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  useMrReportAutoFetch(ready, canFetch, fetchReport, [year, startDate, endDate, viewMode]);

  const summary = report?.summary ?? emptySummary;
  const hasData = (summary.total_patients ?? 0) > 0;

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
              <Users className="h-8 w-8 text-blue-500" />
              Patient Demographics
            </h1>
            <p className="text-muted-foreground mt-1">{cohortDescription}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/patient-demographics/"
              buildQuery={() => buildQuery()}
              filenameBase={`patient_demographics_${filenameSuffix}`}
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
              All Time shows every active patient. Monthly or custom ranges show patients registered
              in that period.
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
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Active patients
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {summary.total_patients.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cohortMode === "registered_in_period"
                      ? "Registered in selected period"
                      : "All active patients"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Employees</p>
                  <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                    {summary.total_employees.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total_patients > 0
                      ? `${((summary.total_employees / summary.total_patients) * 100).toFixed(1)}%`
                      : "0%"}{" "}
                    of register
                  </p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-cyan-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Male</p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {summary.total_male.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total_patients > 0
                      ? `${((summary.total_male / summary.total_patients) * 100).toFixed(1)}%`
                      : "0%"}{" "}
                    of register
                  </p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-pink-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Female</p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {summary.total_female.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total_patients > 0
                      ? `${((summary.total_female / summary.total_patients) * 100).toFixed(1)}%`
                      : "0%"}{" "}
                    of register
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By category</CardTitle>
                  <CardDescription>MR category mix (officers, staff, dependents, …)</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">S/N</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Category</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.category_breakdown.map((row) => (
                        <tr key={row.sn ?? row.category} className="border-b border-border">
                          <td className="p-2">{row.sn}</td>
                          <td className="p-2">{row.category}</td>
                          <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                          <td className="p-2 text-right">{(row.percentage ?? 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/50 font-bold">
                        <td colSpan={2} className="p-2">
                          Total
                        </td>
                        <td className="p-2 text-right">{summary.total_patients.toLocaleString()}</td>
                        <td className="p-2 text-right">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By gender</CardTitle>
                  <CardDescription>Self-reported gender distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Gender</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.gender_breakdown.map((row) => (
                        <tr key={row.key ?? row.label} className="border-b border-border">
                          <td className="p-2">{row.label}</td>
                          <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                          <td className="p-2 text-right">{(row.percentage ?? 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/50 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{summary.total_patients.toLocaleString()}</td>
                        <td className="p-2 text-right">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By age group</CardTitle>
                  <CardDescription>Age bands in years (from date of birth)</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Age</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.age_breakdown.map((row) => (
                        <tr key={row.key ?? row.label} className="border-b border-border">
                          <td className="p-2">{row.label}</td>
                          <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                          <td className="p-2 text-right">{(row.percentage ?? 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/50 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{summary.total_patients.toLocaleString()}</td>
                        <td className="p-2 text-right">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Droplets className="h-4 w-4" />
                    By blood group
                  </CardTitle>
                  <CardDescription>
                    Recorded blood groups ({summary.blood_group_recorded.toLocaleString()} on file)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Blood group</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.blood_group_breakdown.map((row) => (
                        <tr key={row.label} className="border-b border-border">
                          <td className="p-2">{row.label}</td>
                          <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                          <td className="p-2 text-right">{(row.percentage ?? 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/50 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{summary.total_patients.toLocaleString()}</td>
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
              <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
              <p className="text-sm text-muted-foreground">Unable to load patient demographics</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
