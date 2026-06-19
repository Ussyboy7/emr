"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { RefreshCw, ArrowLeft, ScanLine, TrendingUp, Calendar, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface ServiceData {
  sn: number;
  category: string;
  count: number;
  male: number;
  female: number;
  percentage: number;
}

interface RadiologySummary {
  grand_total: number;
  total_male: number;
  total_female: number;
  first_time_patients: number;
  returning_patients: number;
  total_unique_patients_seen: number;
  total_studies: number;
}

const emptySummary: RadiologySummary = {
  grand_total: 0,
  total_male: 0,
  total_female: 0,
  first_time_patients: 0,
  returning_patients: 0,
  total_unique_patients_seen: 0,
  total_studies: 0,
};

function normalizeSummary(
  raw?: Partial<RadiologySummary> & { total_visits?: number } | null
): RadiologySummary {
  const totalStudies = raw?.total_studies ?? raw?.total_visits ?? raw?.grand_total ?? 0;
  return {
    grand_total: raw?.grand_total ?? totalStudies,
    total_male: raw?.total_male ?? 0,
    total_female: raw?.total_female ?? 0,
    first_time_patients: raw?.first_time_patients ?? 0,
    returning_patients: raw?.returning_patients ?? 0,
    total_unique_patients_seen: raw?.total_unique_patients_seen ?? 0,
    total_studies: totalStudies,
  };
}

export default function RadiologicalServicesReport() {
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

  const [data, setData] = useState<ServiceData[]>([]);
  const [summary, setSummary] = useState<RadiologySummary>(emptySummary);
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
      const response = await apiFetch<{ data: ServiceData[]; summary: RadiologySummary }>(
        `/reports/radiological-services/?${params.toString()}`
      );
      setData(response.data ?? []);
      setSummary(normalizeSummary(response.summary));
    } catch (error: unknown) {
      console.error("Error fetching radiology report:", error);
      if (handleAuthError(error)) return;
      toast.error(
        error instanceof Error ? error.message : "Failed to load radiological services report"
      );
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
  }, [year, startDate, endDate, viewMode]);

  const hasData = (summary.grand_total ?? 0) > 0;
  const uniquePatients = summary.total_unique_patients_seen ?? 0;

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
              <ScanLine className="h-8 w-8 text-indigo-500" />
              Radiological Services Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Radiology studies by modality — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/radiological-services/"
              buildQuery={() => buildQuery()}
              filenameBase={`radiological_services_${filenameSuffix}`}
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
              Distinct patients and total study volumes for the selected period. Modality rows
              count studies, not patients.
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
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Distinct patients
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">
                {uniquePatients.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Patients with at least one study</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <ScanLine className="h-4 w-4" />
                Total studies
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {(summary.total_studies ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Study count (repeat studies included)</p>
            </CardContent>
          </Card>
          {showLifecycleCards && (
            <>
              <Card className="border-l-4 border-l-cyan-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">First-time at radiology</p>
                  <p className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400">
                    {(summary.first_time_patients ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">First study falls in this period</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-slate-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Returning patients</p>
                  <p className="text-2xl sm:text-3xl font-bold text-slate-700 dark:text-slate-300">
                    {(summary.returning_patients ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Prior radiology history before this period
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5" />
              Studies by modality
            </CardTitle>
            <CardDescription>
              Study volumes by modality — {periodLabel}. Zero modalities are omitted.
            </CardDescription>
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
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Modality</th>
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
                        <td className="p-3 text-right font-semibold text-foreground">{row.count.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">Total</td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.total_male ?? 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.total_female ?? 0).toLocaleString()}
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
                <ScanLine className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">
                  No radiology studies found for {periodLabel}. Try a wider period or All Time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
