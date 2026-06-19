"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import {
  RefreshCw,
  ArrowLeft,
  Stethoscope,
  Calendar,
  TrendingUp,
  Activity,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface TopDiagnosisRow {
  diagnosis: string;
  code: string;
  description: string;
  count: number;
  percentage: number;
}

interface TopDiagnosesSummary {
  total_diagnosis_lines: number;
  distinct_icd10_codes: number;
  ranking_count: number;
  limit: number;
  grand_total: number;
}

const emptySummary: TopDiagnosesSummary = {
  total_diagnosis_lines: 0,
  distinct_icd10_codes: 0,
  ranking_count: 0,
  limit: 20,
  grand_total: 0,
};

function normalizeSummary(raw?: Partial<TopDiagnosesSummary> | null): TopDiagnosesSummary {
  const lines = raw?.total_diagnosis_lines ?? raw?.grand_total ?? 0;
  return {
    total_diagnosis_lines: lines,
    distinct_icd10_codes: raw?.distinct_icd10_codes ?? 0,
    ranking_count: raw?.ranking_count ?? 0,
    limit: raw?.limit ?? 20,
    grand_total: raw?.grand_total ?? lines,
  };
}

export default function TopDiagnosesReport() {
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

  const [limit, setLimit] = useState("20");
  const [rows, setRows] = useState<TopDiagnosisRow[]>([]);
  const [summary, setSummary] = useState<TopDiagnosesSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);

  const isAllTime = viewMode === "all";
  const showRankingMeta = !isAllTime;

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const params = buildQuery({ limit });
      if (!params) {
        toast.error("Please select a valid date range");
        setIsLoading(false);
        return;
      }
      const response = await apiFetch<
        TopDiagnosisRow[] | { data: TopDiagnosisRow[]; summary: TopDiagnosesSummary }
      >(`/reports/top-diagnoses/?${params.toString()}`);

      if (Array.isArray(response)) {
        setRows(response);
        setSummary({
          ...emptySummary,
          total_diagnosis_lines: response.reduce((sum, r) => sum + r.count, 0),
          distinct_icd10_codes: response.length,
          ranking_count: response.length,
          limit: parseInt(limit, 10) || 20,
          grand_total: response.reduce((sum, r) => sum + r.count, 0),
        });
      } else {
        setRows(response.data ?? []);
        setSummary(normalizeSummary(response.summary));
      }
    } catch (error: unknown) {
      console.error("Error fetching top diagnoses:", error);
      if (handleAuthError(error)) return;
      const msg = error instanceof Error ? error.message : "Failed to load top diagnoses";
      toast.error(msg);
      setRows([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (canFetch) void fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode, limit]);

  const hasData = (summary.total_diagnosis_lines ?? 0) > 0;
  const truncated =
    (summary.distinct_icd10_codes ?? 0) > (summary.ranking_count ?? 0);

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
              <Stethoscope className="h-8 w-8 text-indigo-500" />
              Top Diagnoses
            </h1>
            <p className="text-muted-foreground mt-1">
              Most frequent ICD-10 diagnoses from completed consultations — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/top-diagnoses/"
              buildQuery={() => buildQuery({ limit })}
              filenameBase={`top_diagnoses_${filenameSuffix}`}
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
              Rank ICD-10 codes by frequency in completed consultations for the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
              <div>
                <Label>Top N</Label>
                <Select value={limit} onValueChange={setLimit}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["10", "20", "30", "50"].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={fetchReport} className="w-full" disabled={isLoading}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {isLoading ? "Loading..." : "Generate Report"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className={`grid gap-4 ${showRankingMeta ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Diagnosis lines
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">
                {(summary.total_diagnosis_lines ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">All lines in period (ranking denominator)</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Distinct ICD-10 codes
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">
                {(summary.distinct_icd10_codes ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Unique codes recorded in period</p>
            </CardContent>
          </Card>
          {showRankingMeta && (
            <>
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Codes in ranking</p>
                  <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                    {(summary.ranking_count ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {truncated
                      ? `Top ${summary.limit} of ${summary.distinct_icd10_codes} codes`
                      : "All codes fit within Top N"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-slate-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Top N limit</p>
                  <p className="text-2xl sm:text-3xl font-bold text-slate-700 dark:text-slate-300">
                    {summary.limit}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Maximum rows returned in table</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Diagnosis ranking — {periodLabel}
            </CardTitle>
            <CardDescription>
              Structured ICD-10 codes from completed consultation sessions.
              {truncated && ` Showing top ${summary.limit} codes.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12">
                <Stethoscope className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No diagnoses found for {periodLabel}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Code</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Count</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr
                        key={`${row.code}-${idx}`}
                        className="border-b border-border hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-3 text-foreground">{idx + 1}</td>
                        <td className="p-3 font-mono text-foreground">{row.code}</td>
                        <td className="p-3 text-foreground">{row.description || row.diagnosis}</td>
                        <td className="p-3 text-right font-semibold text-foreground">
                          {row.count.toLocaleString()}
                        </td>
                        <td className="p-3 text-right text-foreground">{row.percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
