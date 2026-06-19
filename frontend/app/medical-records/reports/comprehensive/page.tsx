"use client";

import React, { useMemo, useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import {
  RefreshCw,
  ArrowLeft,
  BarChart3,
  Users,
  Activity,
  TestTube,
  Pill,
  TrendingUp,
  Calendar,
  ExternalLink,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface TrendRow {
  month: string;
  period_label?: string;
  count: number;
}

interface ComprehensiveData {
  year: string;
  trend_mode?: "month" | "year";
  lifecycle?: {
    total_unique_patients_seen: number;
  };
  overview: {
    visit_records: number;
    unique_patients_seen: number;
    total_prescriptions: number;
    dispensed_prescriptions: number;
    total_lab_tests: number;
  };
  services_activities: {
    injections: number;
    dressing: number;
    sick_leave: number;
    referrals: number;
    observations: number;
    total: number;
  };
  summary: {
    total_employee: number;
    total_non_employee: number;
    total_male: number;
    total_female: number;
    grand_total: number;
  };
  category_breakdown: Array<{
    sn: number;
    category: string;
    male: number;
    female: number;
    total: number;
    percentage: number;
  }>;
  top_clinics: Array<{ clinic: string; count: number }>;
  monthly_trend: TrendRow[];
}

const SERVICE_ROWS = [
  { key: "injections" as const, label: "Injections" },
  { key: "dressing" as const, label: "Dressings" },
  { key: "sick_leave" as const, label: "Sick leave certificates" },
  { key: "referrals" as const, label: "Referrals (procedures)" },
  { key: "observations" as const, label: "Ward observations" },
];

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline print:hidden"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

export default function ComprehensiveReport() {
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
    canFetch,
    buildQuery,
    filenameSuffix,
    periodLabel,
    years,
  } = useMrReportPeriod("all");

  const [reportData, setReportData] = useState<ComprehensiveData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    const params = buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<ComprehensiveData>(
        `/reports/comprehensive/?${params.toString()}`
      );
      setReportData(response);
    } catch (error: unknown) {
      console.error("Error fetching comprehensive report:", error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load comprehensive report");
      setReportData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (canFetch) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode]);

  const trendMode = reportData?.trend_mode ?? "month";
  const trendRows = useMemo(() => {
    if (!reportData?.monthly_trend?.length) return [];
    return reportData.monthly_trend.map((row) => ({
      label: row.period_label ?? row.month,
      count: row.count ?? 0,
    }));
  }, [reportData]);

  const maxTrend = useMemo(
    () => Math.max(...trendRows.map((r) => r.count), 1),
    [trendRows]
  );

  const hasCategoryData = (reportData?.summary.grand_total ?? 0) > 0;
  const overview = reportData?.overview;
  const services = reportData?.services_activities;
  const uniquePatients =
    reportData?.lifecycle?.total_unique_patients_seen ?? overview?.unique_patients_seen ?? 0;

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
              <BarChart3 className="h-8 w-8 text-slate-500" />
              Comprehensive Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Executive MR summary — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/comprehensive/"
              buildQuery={() => buildQuery()}
              filenameBase={`comprehensive_${filenameSuffix}`}
              disabled={!reportData}
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
              Headline KPIs across visits, prescriptions, lab, and nursing activity.
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
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading comprehensive report...</p>
          </div>
        ) : reportData ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Unique patients
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                    {uniquePatients.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Distinct patients with attendable visits</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Visit records
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {(overview?.visit_records ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Attendable visit rows in period</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Pill className="h-4 w-4" />
                    Prescriptions
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {(overview?.total_prescriptions ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(overview?.dispensed_prescriptions ?? 0).toLocaleString()} fully dispensed
                  </p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-pink-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Lab tests
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-pink-600 dark:text-pink-400">
                    {(overview?.total_lab_tests ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Tests on orders in period</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Services &amp; activities
                  </CardTitle>
                  <CardDescription>Procedure and certificate counts — {periodLabel}</CardDescription>
                </div>
                <SectionLink
                  href="/medical-records/reports/services-activities"
                  label="Full report"
                />
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-medium text-muted-foreground">Activity</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SERVICE_ROWS.map((row) => (
                      <tr key={row.key} className="border-b border-border">
                        <td className="p-2 text-foreground">{row.label}</td>
                        <td className="p-2 text-right font-semibold text-foreground">
                          {(services?.[row.key] ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/50 font-bold">
                      <td className="p-2 text-foreground">Total</td>
                      <td className="p-2 text-right text-foreground">
                        {(services?.total ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Patients by category
                </CardTitle>
                <CardDescription>
                  Distinct patients with attendable visits in {periodLabel}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hasCategoryData ? (
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
                        {reportData.category_breakdown.map((row) => (
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
                          <td colSpan={2} className="p-3 text-foreground">
                            Total
                          </td>
                          <td className="p-3 text-right text-foreground">
                            {(reportData.summary.total_male ?? 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right text-foreground">
                            {(reportData.summary.total_female ?? 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right text-foreground">
                            {(reportData.summary.grand_total ?? 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right text-foreground">100.0%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No visit cohort for {periodLabel}
                  </div>
                )}
              </CardContent>
            </Card>

            {reportData.top_clinics.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Top clinics by visit volume
                  </CardTitle>
                  <CardDescription>Attendable visit records — {periodLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {reportData.top_clinics.map((row) => (
                      <div key={row.clinic} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                        <span className="font-medium text-foreground">{row.clinic}</span>
                        <span className="text-muted-foreground">{row.count.toLocaleString()} visits</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {trendMode === "year" ? "Yearly visit trend" : "Monthly visit trend"}
                </CardTitle>
                <CardDescription>
                  Distinct patients with attendable visits — {periodLabel}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trendRows.length > 0 ? (
                  <div className="space-y-3">
                    {trendRows.map((row) => (
                      <div key={row.label} className="flex items-center gap-4">
                        <div className="w-24 text-sm font-medium text-foreground shrink-0">{row.label}</div>
                        <div className="flex-1">
                          <div className="w-full bg-muted rounded-full h-6">
                            <div
                              className="bg-blue-600 h-6 rounded-full transition-all min-w-0"
                              style={{ width: `${(row.count / maxTrend) * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="w-12 text-right text-sm font-semibold text-foreground shrink-0">
                          {row.count.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">No visit trend for {periodLabel}</div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
              <p className="text-sm text-muted-foreground">
                Unable to load comprehensive report for {periodLabel}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
