"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { ReportSearchField } from "@/components/reports/ReportSearchField";
import { RefreshCw, ArrowLeft, TrendingUp, Activity, Users, Calendar, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import { StandardPagination } from "@/components/shared/StandardPagination";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface DiseaseData {
  sn: number;
  diagnosis: string;
  code?: string;
  description?: string;
  employee: number;
  non_employee: number;
  male: number;
  female: number;
  total: number;
  percentage?: number;
  codes_count?: number;
}

interface DiseaseSummary {
  total_diagnosis_lines: number;
  distinct_icd10_codes: number;
  total_employee: number;
  total_non_employee: number;
  grand_total: number;
  total_male: number;
  total_female: number;
  ranking_count: number;
  limit: number | null;
  group_by: string;
}

const emptySummary: DiseaseSummary = {
  total_diagnosis_lines: 0,
  distinct_icd10_codes: 0,
  total_employee: 0,
  total_non_employee: 0,
  grand_total: 0,
  total_male: 0,
  total_female: 0,
  ranking_count: 0,
  limit: 20,
  group_by: "code",
};

function normalizeSummary(raw?: Partial<DiseaseSummary> | null): DiseaseSummary {
  const lines = raw?.total_diagnosis_lines ?? raw?.grand_total ?? 0;
  return {
    total_diagnosis_lines: lines,
    distinct_icd10_codes: raw?.distinct_icd10_codes ?? 0,
    total_employee: raw?.total_employee ?? 0,
    total_non_employee: raw?.total_non_employee ?? 0,
    grand_total: raw?.grand_total ?? lines,
    total_male: raw?.total_male ?? 0,
    total_female: raw?.total_female ?? 0,
    ranking_count: raw?.ranking_count ?? 0,
    limit: raw?.limit ?? 20,
    group_by: raw?.group_by ?? "code",
  };
}

export default function DiseasePatternReport() {
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

  const [data, setData] = useState<DiseaseData[]>([]);
  const [summary, setSummary] = useState<DiseaseSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("20");
  const [customLimit, setCustomLimit] = useState("");
  const [groupByFamily, setGroupByFamily] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const effectiveLimit = customLimit.trim()
    ? customLimit.trim()
    : limit === "custom"
      ? "20"
      : limit;

  const isAllTime = viewMode === "all";
  const showCategoryCards = !isAllTime;
  const grouped = groupByFamily || summary.group_by === "family";

  const searchExtra = () => {
    const queryExtra: Record<string, string> = {};
    if (effectiveLimit.toLowerCase() !== "all") {
      queryExtra.limit = effectiveLimit;
    }
    queryExtra.page = String(currentPage);
    queryExtra.page_size = String(itemsPerPage);
    if (groupByFamily) queryExtra.group_by = "family";
    const term = search.trim();
    if (term) queryExtra.search = term;
    return queryExtra;
  };

  const fetchReport = async () => {
    const params = buildQuery(searchExtra());
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<{ data: DiseaseData[]; summary: DiseaseSummary }>(
        `/reports/disease-pattern/?${params.toString()}`
      );
      setData(response.data ?? []);
      setSummary(normalizeSummary(response.summary));
    } catch (error: unknown) {
      console.error("Error fetching disease pattern:", error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load disease pattern report");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useMrReportAutoFetch(ready, canFetch, fetchReport, [year, startDate, endDate, viewMode, search, effectiveLimit, groupByFamily, currentPage, itemsPerPage]);

  const hasData = (summary.grand_total ?? 0) > 0;
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
              <Activity className="h-8 w-8 text-red-500" />
              Disease Pattern Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Top ICD-10 diagnoses by patient category and gender — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/disease-pattern/"
              buildQuery={() => buildQuery(searchExtra())}
              filenameBase={`disease_pattern_${filenameSuffix}`}
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
              Diagnosis lines from completed consultations with structured ICD-10 codes.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
                <Select
                  value={limit}
                  onValueChange={(v) => {
                    setLimit(v);
                    if (v !== "custom") setCustomLimit("");
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["10", "20", "30", "50", "100"].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                    <SelectItem value="all">All ({summary.distinct_icd10_codes || 768})</SelectItem>
                    <SelectItem value="custom">Custom...</SelectItem>
                  </SelectContent>
                </Select>
                {(limit === "custom" || customLimit) && (
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    placeholder="Enter number (e.g. 200)"
                    value={customLimit}
                    onChange={(e) => {
                      setCustomLimit(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="mt-2"
                  />
                )}
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox
                    checked={groupByFamily}
                    onCheckedChange={(v) => {
                      setGroupByFamily(v === true);
                      setCurrentPage(1);
                    }}
                  />
                  Group by family
                </label>
              </div>
              <ReportSearchField
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setCurrentPage(1);
                }}
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
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Diagnosis lines
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">
                {(summary.total_diagnosis_lines ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                One line per ICD-10 code recorded on a consultation
              </p>
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
              <p className="text-xs text-muted-foreground mt-1">
                Unique diagnoses in period
              </p>
            </CardContent>
          </Card>
          {showCategoryCards && (
            <>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Employee lines
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {(summary.total_employee ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Patient category = employee (officers and staff)
                  </p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Non-employee lines
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">
                    {(summary.total_non_employee ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Dependents, retirees, non-NPA, and other categories
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              ICD-10 diagnoses — {periodLabel}
            </CardTitle>
            <CardDescription>
              Diagnosis frequency from completed consultations (structured ICD-10).
              {grouped
                ? " Grouped by diagnosis family."
                : truncated && ` Showing top ${summary.limit ?? 20} codes.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : hasData ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-3 font-medium text-muted-foreground">S/N</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Code</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Employee</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Non-emp.</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Male</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Female</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Total</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-mono text-foreground">{row.code ?? "—"}</td>
                        <td className="p-3 text-foreground">
                          {row.description ?? row.diagnosis}
                          {grouped && typeof row.codes_count === "number" && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({row.codes_count} codes)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right text-foreground">{(row.employee ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{(row.non_employee ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{(row.male ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{(row.female ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">
                          {(row.percentage ?? 0).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={3} className="p-3 text-foreground">
                        TOTAL
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.total_employee ?? 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.total_non_employee ?? 0).toLocaleString()}
                      </td>
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
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={summary.ranking_count || data.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(n) => {
                    setItemsPerPage(n);
                    setCurrentPage(1);
                  }}
                  itemName="diagnoses"
                  pageSizeOptions={[10, 20, 50, 100]}
                />
              </>
            ) : (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">
                  No diagnosis records found for {periodLabel}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
